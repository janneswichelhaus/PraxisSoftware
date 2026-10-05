import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabaseOhneTermine } from './helpers/db';

/**
 * Das Terminhonorar entsteht einmal je Termin (ABR-031, ADR-009 Fassung 5
 * Punkte 22 und 23, ANN-232, ANN-233).
 *
 *   * Je Behandlungstermin mit mindestens einem Heilmittel genau ein Honorar,
 *     gleich welche und wie viele Heilmittel bestaetigt werden.
 *   * Der Betrag ist der am Leistungstag geltende - Vereinbarung vor Tarif -
 *     und wird beim Bestaetigen festgeschrieben.
 *   * Auf die Heilmittel wird er nach ihren Preisen aufgeteilt; die Summe
 *     ist genau das Honorar.
 *   * Ausfallhonorar und Positionen ohne Heilmittel behalten ihren Preis.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
/** Erika, Krankengymnastik, 10 Termine (supabase/seed.sql). */
const GRUNDLAGE = '88888888-8888-4888-8888-000000000004';

const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  mt: 'cccccccc-cccc-4ccc-8ccc-000000000003',
  hausbesuch: 'cccccccc-cccc-4ccc-8ccc-000000000005',
  szl: 'cccccccc-cccc-4ccc-8ccc-000000000007',
  ausfall: 'cccccccc-cccc-4ccc-8ccc-000000000008',
} as const;

const ERFASSEN = 'select public.record_billable_services($1::uuid, $2::jsonb) as anzahl';
const ENTFERNEN = 'select public.delete_billable_services($1::uuid) as anzahl';
const LISTE = 'select * from public.list_billable_services(null, null, 200)';
const AM_TERMIN = 'select * from public.get_appointment_services($1::uuid)';
const VEREINBAREN =
  'select public.create_patient_fee_agreement($1::uuid, $2::date, $3::integer) as id';

let stunde = 200;

async function termin(opts: { status?: 'documented' | 'no_show'; anlass?: string } = {}) {
  stunde += 2;
  const status = opts.status ?? 'documented';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by, no_show_recorded_at, no_show_recorded_by, fee_basis
     ) values (
       $1, $2, $3, $4, 'practice', $5,
       date_trunc('hour', now()) - make_interval(hours => $6::int),
       date_trunc('hour', now()) - make_interval(hours => $6::int - 1),
       $7,
       case when $5 = 'documented' then now() end,
       case when $5 = 'documented' then $8::uuid end,
       case when $5 = 'no_show' then now() end,
       case when $5 = 'no_show' then $8::uuid end,
       $9
     ) returning id`,
    [
      organizationId,
      patients.erika,
      STAFF_ANNA,
      LOCATION,
      status,
      stunde,
      GRUNDLAGE,
      users.ownerTherapist,
      opts.anlass ?? null,
    ],
  );
  return rows[0]!.id;
}

async function erfassen(id: string, positionen: string[], konto: string = users.office) {
  await asUserCommitted(konto, ERFASSEN, [
    id,
    JSON.stringify(positionen.map((p) => ({ catalog_item_id: p, quantity: 1 }))),
  ]);
}

async function honorar(id: string) {
  const { rows } = await asPostgres<{
    amount_cents: number;
    source: string;
    fee_agreement_id: string | null;
  }>(
    'select amount_cents, source, fee_agreement_id from public.appointment_session_fees where appointment_id = $1',
    [id],
  );
  return rows;
}

/** Betrag je Position eines Termins, nach Kuerzel. */
async function zeilen(id: string): Promise<Record<string, number>> {
  const { rows } = await asPostgres<{ code: string; betrag: string }>(
    `select c.code, app.billable_service_amount(b.id) as betrag
       from public.billable_services b
       join public.service_catalog_items c on c.id = b.catalog_item_id
      where b.appointment_id = $1`,
    [id],
  );
  return Object.fromEntries(rows.map((r) => [r.code, Number(r.betrag)]));
}

describe('Terminhonorar je Termin', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointment_session_fees');
    await asPostgres('delete from public.invoice_items');
    await asPostgres('delete from public.invoices');
    await asPostgres('delete from public.billable_services');
    await asPostgres('delete from public.patient_fee_agreements');
    await asPostgres('update public.treatment_base_items set used_quantity = 0');
  });

  describe('Genau einmal je Termin', () => {
    it('entsteht einmal, gleich wie viele Heilmittel bestaetigt werden', async () => {
      const eins = await termin();
      const drei = await termin();
      await erfassen(eins, [KATALOG.kg]);
      await erfassen(drei, [KATALOG.kg, KATALOG.mt, KATALOG.hausbesuch]);

      expect(await honorar(eins)).toEqual([
        { amount_cents: 14000, source: 'tariff', fee_agreement_id: null },
      ]);
      expect(await honorar(drei)).toHaveLength(1);
      expect(await honorar(drei)).toMatchObject([{ amount_cents: 14000 }]);
    });

    it('teilt das Honorar nach den Heilmittelpreisen auf, centgenau (ANN-233)', async () => {
      // Gewichte 4500, 5500, 1800 = 11800. Abgerundet 5338, 6525, 2135 = 13998;
      // die zwei offenen Cent gehen an die groessten Reste (KG, Hausbesuch).
      const id = await termin();
      await erfassen(id, [KATALOG.kg, KATALOG.mt, KATALOG.hausbesuch]);

      expect(await zeilen(id)).toEqual({ KG: 5339, MT: 6525, HB: 2136 });
    });

    it('legt das ganze Honorar auf ein einzelnes Heilmittel', async () => {
      const id = await termin();
      await erfassen(id, [KATALOG.hausbesuch]);
      expect(await zeilen(id)).toEqual({ HB: 14000 });
    });

    it('zaehlt die genutzte Menge weiter je Heilmittel, ohne Preis', async () => {
      const id = await termin();
      await erfassen(id, [KATALOG.kg, KATALOG.hausbesuch]);
      const { rows } = await asPostgres<{ used_quantity: number }>(
        `select used_quantity from public.treatment_base_items
          where treatment_basis_id = $1 and remedy = 'Krankengymnastik'`,
        [GRUNDLAGE],
      );
      expect(rows[0]!.used_quantity).toBe(1);
    });

    it('fasst Ausfallhonorar und Position ohne Heilmittel nicht an', async () => {
      const ausfall = await termin({ status: 'no_show', anlass: 'no_show' });
      await erfassen(ausfall, [KATALOG.ausfall]);
      expect(await honorar(ausfall)).toEqual([]);
      expect(await zeilen(ausfall)).toEqual({ AUS: 4500 });

      const selbst = await termin();
      await erfassen(selbst, [KATALOG.szl]);
      expect(await honorar(selbst)).toEqual([]);
      expect(await zeilen(selbst)).toEqual({ SZL: 6000 });

      // Neben einem Heilmittel behaelt die Selbstzahlerleistung ihren Preis.
      const beides = await termin();
      await erfassen(beides, [KATALOG.kg, KATALOG.szl]);
      expect(await zeilen(beides)).toEqual({ KG: 14000, SZL: 6000 });
    });
  });

  describe('Vereinbarung und Festschreiben', () => {
    it('nimmt die am Leistungstag geltende Vereinbarung statt des Tarifs', async () => {
      const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, VEREINBAREN, [
        patients.erika,
        '2026-01-15',
        12000,
      ]);
      const id = await termin();
      await erfassen(id, [KATALOG.kg, KATALOG.mt]);

      expect(await honorar(id)).toEqual([
        { amount_cents: 12000, source: 'agreement', fee_agreement_id: rows[0]!.id },
      ]);
      const summe = Object.values(await zeilen(id)).reduce((a, b) => a + b, 0);
      expect(summe).toBe(12000);
    });

    it('aendert ein festgeschriebenes Honorar nicht durch eine spaetere Vereinbarung', async () => {
      const id = await termin();
      await erfassen(id, [KATALOG.kg]);
      // Rueckwirkend ab Jahresbeginn - der Termin behaelt trotzdem seinen Betrag.
      await asUserCommitted(users.ownerTherapist, VEREINBAREN, [
        patients.erika,
        '2026-01-01',
        9000,
      ]);
      expect(await honorar(id)).toMatchObject([{ amount_cents: 14000, source: 'tariff' }]);
      expect(await zeilen(id)).toEqual({ KG: 14000 });
    });

    it('nimmt das Honorar mit der Erfassung zurueck und schreibt es neu fest', async () => {
      const id = await termin();
      await erfassen(id, [KATALOG.kg]);
      // Gilt auch fuer den schon bestaetigten Termin - aber erst nach dem
      // Zuruecknehmen, nie still.
      await asUserCommitted(users.ownerTherapist, VEREINBAREN, [
        patients.erika,
        '2026-01-01',
        9000,
      ]);
      expect(await honorar(id)).toMatchObject([{ amount_cents: 14000 }]);
      await asUserCommitted(users.office, ENTFERNEN, [id]);
      expect(await honorar(id)).toEqual([]);

      await erfassen(id, [KATALOG.kg]);
      expect(await honorar(id)).toMatchObject([{ amount_cents: 9000, source: 'agreement' }]);
    });

    it('laesst eine angewandte Vereinbarung nicht entfernen', async () => {
      const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, VEREINBAREN, [
        patients.erika,
        '2026-01-15',
        12000,
      ]);
      await erfassen(await termin(), [KATALOG.kg]);
      await expect(
        asUserCommitted(
          users.ownerTherapist,
          'select public.delete_patient_fee_agreement($1::uuid)',
          [rows[0]!.id],
        ),
      ).rejects.toThrow(/already applied/);
    });

    it('weist das Bestaetigen ab, wenn weder Tarif noch Vereinbarung gilt', async () => {
      // Eine Preisliste ohne Terminhonorar, gueltig ab gestern.
      const { rows: v } = await asPostgres<{ id: string }>(
        `insert into public.service_catalog_versions (organization_id, label, valid_from)
         values ($1, 'Ohne Honorar', (now() at time zone 'Europe/Berlin')::date - 1)
         returning id`,
        [organizationId],
      );
      const { rows: p } = await asPostgres<{ id: string }>(
        `insert into public.service_catalog_items
           (organization_id, catalog_version_id, sort_order, code, label, item_kind, remedy,
            unit_price_cents, tax_treatment, tax_rate_permille, service_area)
         values ($1, $2, 1, 'KG', 'Krankengymnastik', 'treatment', 'Krankengymnastik',
                 4500, 'exempt_healthcare', 0, 'therapy')
         returning id`,
        [organizationId, v[0]!.id],
      );
      await asPostgres(
        'update public.service_catalog_versions set published_at = now() where id = $1',
        [v[0]!.id],
      );
      try {
        stunde = 2;
        const id = await termin();
        await expect(erfassen(id, [p[0]!.id])).rejects.toThrow(/no session fee/);
        expect(await honorar(id)).toEqual([]);
      } finally {
        stunde = 400;
        await asPostgres(`
          alter table public.service_catalog_items    disable trigger service_catalog_items_frozen;
          alter table public.service_catalog_versions disable trigger service_catalog_versions_frozen;
          delete from public.service_catalog_items    where catalog_version_id = '${v[0]!.id}';
          delete from public.service_catalog_versions where id = '${v[0]!.id}';
          alter table public.service_catalog_items    enable trigger service_catalog_items_frozen;
          alter table public.service_catalog_versions enable trigger service_catalog_versions_frozen;
        `);
      }
    });
  });

  describe('Wer sieht und wer schreibt', () => {
    it('zeigt das Honorar am Termin nur den Rollen der Abrechnung', async () => {
      const id = await termin();
      await erfassen(id, [KATALOG.kg], users.ownerTherapist);
      const { rows: buero } = await asUser<{ session_fee_cents: number | null }>(
        users.office,
        AM_TERMIN,
        [id],
      );
      expect(buero[0]!.session_fee_cents).toBe(14000);
      // Anna behandelt den Termin, sieht die Heilmittel, aber keinen Preis.
      const { rows: anna } = await asUser<{
        session_fee_cents: number | null;
        services: unknown[];
      }>(users.therapist, AM_TERMIN, [id]);
      expect(anna[0]!.services).toHaveLength(1);
      expect(anna[0]!.session_fee_cents).toBeNull();
    });

    it('nennt in der Liste den Anteil am Honorar', async () => {
      const id = await termin();
      await erfassen(id, [KATALOG.kg, KATALOG.hausbesuch]);
      const { rows } = await asUser<{
        appointment_id: string;
        code: string;
        unit_price_cents: number;
        session_fee: boolean;
      }>(users.office, LISTE);
      const eigene = rows.filter((r) => r.appointment_id === id);
      expect(eigene.map((r) => r.unit_price_cents).reduce((a, b) => a + b, 0)).toBe(14000);
      expect(eigene.every((r) => r.session_fee)).toBe(true);
    });

    it('gibt keine Tabellenrechte und haelt das Honorar unveraenderlich', async () => {
      const id = await termin();
      await erfassen(id, [KATALOG.kg]);
      await expect(
        asUser(users.ownerTherapist, 'select * from public.appointment_session_fees'),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asPostgres('update public.appointment_session_fees set amount_cents = 1'),
      ).rejects.toThrow(/immutable/);
    });
  });

  describe('Loeschen nach der Frist (ADR-008)', () => {
    it('faellt mit der Akte: Honorar, Vereinbarung und Leistung', async () => {
      await asUserCommitted(users.ownerTherapist, VEREINBAREN, [
        patients.petra,
        '2026-01-01',
        11000,
      ]);
      stunde += 2;
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.appointments (
           organization_id, patient_id, staff_member_id, location_id,
           appointment_type, status, starts_at, ends_at, completed_at, completed_by
         ) values (
           $1, $2, $3, $4, 'practice', 'documented',
           date_trunc('hour', now()) - make_interval(hours => $5::int),
           date_trunc('hour', now()) - make_interval(hours => $5::int - 1),
           now(), $6
         ) returning id`,
        [organizationId, patients.petra, STAFF_ANNA, LOCATION, stunde, users.ownerTherapist],
      );
      await erfassen(rows[0]!.id, [KATALOG.kg]);
      expect(await honorar(rows[0]!.id)).toMatchObject([{ amount_cents: 11000 }]);

      await asPostgres('select app.delete_patient_record($1::uuid, gen_random_uuid(), now())', [
        patients.petra,
      ]);

      const { rows: rest } = await asPostgres<{ honorare: number; vereinbarungen: number }>(
        `select
           (select count(*)::int from public.appointment_session_fees where appointment_id = $1) as honorare,
           (select count(*)::int from public.patient_fee_agreements where patient_id = $2) as vereinbarungen`,
        [rows[0]!.id, patients.petra],
      );
      expect(rest[0]).toEqual({ honorare: 0, vereinbarungen: 0 });
    });
  });
});

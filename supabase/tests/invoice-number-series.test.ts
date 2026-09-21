import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabaseOhneTermine } from './helpers/db';

/**
 * Je Leistungsbereich ein eigener Nummernkreis (ABR-010, ADR-009 Punkt 17).
 *
 * Vier Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Lueckenlos je Kreis**: Punkt 8 gilt unveraendert, nur je Kreis
 *     gelesen. Die Zaehlung des einen Bereichs bewegt die des anderen nicht.
 *   * **Einmalig ueber alle Kreise**: Mehrere Zahlenreihen sind nach
 *     Par. 14 Abs. 4 Nr. 4 UStG zulaessig, doppelte Nummern nicht - deshalb
 *     zwei verschiedene Kuerzel.
 *   * **Am Dokument erkennbar**: Die Nummer traegt das Kuerzel ihres Kreises,
 *     und der Snapshot nennt den Bereich (schema_version 3).
 *   * **Storno nimmt die Nummer aus dem Kreis seiner Rechnung** (Punkt 9
 *     und 17) - nicht aus dem Kreis des Tages, an dem storniert wird.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const GRUNDLAGE_FRISCH = '88888888-8888-4888-8888-000000000004';

const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  mt: 'cccccccc-cccc-4ccc-8ccc-000000000003',
} as const;

const ENTWURF = 'select public.create_invoice_draft($1::uuid, $2::date, $3::text) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const STORNIEREN = 'select public.cancel_invoice($1::uuid, $2::text) as nummer';
const DOKUMENT = 'select public.get_invoice($1::uuid) as rechnung';
const NAECHSTE =
  'select app.next_invoice_number($1::uuid, $2::smallint, $3::text, $4::text) as nummer';

async function behandlungstermin(stundeImMonat: number): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', 'documented',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int)) at time zone 'Europe/Berlin',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int + 1)) at time zone 'Europe/Berlin',
       $6, now(), $7
     ) returning id`,
    [
      organizationId,
      patients.erika,
      STAFF_ANNA,
      LOCATION,
      stundeImMonat,
      GRUNDLAGE_FRISCH,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

async function leistung(position: string, stundeImMonat: number): Promise<void> {
  const id = await behandlungstermin(stundeImMonat);
  await asUserCommitted(
    users.ownerTherapist,
    'select public.record_billable_services($1::uuid, $2::jsonb)',
    [id, JSON.stringify([{ catalog_item_id: position, quantity: 1 }])],
  );
}

async function monat(): Promise<string> {
  const { rows } = await asPostgres<{ monat: string }>(
    `select to_char(date_trunc('month', (now() at time zone 'Europe/Berlin')::date), 'YYYY-MM-DD') as monat`,
  );
  return rows[0]!.monat;
}

/** Erfasst eine Leistung, legt den Entwurf an und stellt ihn aus. */
async function ausgestellt(position: string, stundeImMonat: number): Promise<string> {
  await leistung(position, stundeImMonat);
  const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
    patients.erika,
    await monat(),
    'therapy',
  ]);
  await asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id]);
  return rows[0]!.id;
}

describe('Nummernkreis je Leistungsbereich', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
    await asPostgres('delete from public.invoice_number_series');
  }, 120_000);

  describe('die Vergabe', () => {
    it('zaehlt jeden Kreis fuer sich', async () => {
      const jahr = 2026;
      const ergebnis: string[] = [];
      for (const [bereich, kuerzel] of [
        ['therapy', 'RG'],
        ['training', 'TR'],
        ['therapy', 'RG'],
        ['training', 'TR'],
      ] as const) {
        const { rows } = await asPostgres<{ nummer: string }>(NAECHSTE, [
          organizationId,
          jahr,
          bereich,
          kuerzel,
        ]);
        ergebnis.push(rows[0]!.nummer);
      }

      // Lueckenlos je Kreis (Punkt 8, je Kreis gelesen) und ueber die Kreise
      // hinweg trotzdem eindeutig - das leistet das Kuerzel.
      expect(ergebnis).toEqual(['RG-2026-0001', 'TR-2026-0001', 'RG-2026-0002', 'TR-2026-0002']);
    });

    it('fuehrt je Organisation, Jahr und Bereich genau eine Zeile', async () => {
      await asPostgres(NAECHSTE, [organizationId, 2026, 'therapy', 'RG']);
      await asPostgres(NAECHSTE, [organizationId, 2026, 'training', 'TR']);
      await asPostgres(NAECHSTE, [organizationId, 2027, 'therapy', 'RG']);

      const { rows } = await asPostgres<{ anzahl: string }>(
        'select count(*) as anzahl from public.invoice_number_series',
      );
      expect(Number(rows[0]!.anzahl)).toBe(3);

      await expect(
        asPostgres(
          `insert into public.invoice_number_series (organization_id, year, service_area, next_number)
           values ($1, 2026, 'therapy', 1)`,
          [organizationId],
        ),
      ).rejects.toThrow(/invoice_number_series_org_year_area_key/);
    });
  });

  describe('die Kuerzel', () => {
    it('unterscheiden sich - sonst gaebe es dieselbe Nummer zweimal', async () => {
      await expect(
        asPostgres(
          'update public.practice_billing_profiles set training_invoice_number_prefix = invoice_number_prefix where organization_id = $1',
          [organizationId],
        ),
      ).rejects.toThrow(/practice_billing_profiles_prefixes_differ/);
    });

    it('werden schon beim Speichern der Stammdaten geprueft', async () => {
      const { rows } = await asPostgres<Record<string, unknown>>(
        'select * from public.practice_billing_profiles where organization_id = $1',
        [organizationId],
      );
      const stand = rows[0]!;

      await expect(
        asUser(
          users.ownerTherapist,
          `select public.save_practice_billing_profile(
             $1::text, $2::text, $3::text, $4::text, $5::text, null, null, $6::text, null,
             $7::boolean, null, null, $8::text, null, 'RG', 14::smallint, 'RG')`,
          [
            stand.legal_name,
            stand.street,
            stand.house_number,
            stand.postal_code,
            stand.city,
            stand.tax_number,
            stand.small_business,
            stand.iban,
          ],
        ),
      ).rejects.toThrow(/the two invoice number prefixes must differ/);
    });
  });

  describe('die ausgestellte Rechnung', () => {
    it('traegt die Nummer aus dem Kreis ihres Bereichs', async () => {
      const id = await ausgestellt(KATALOG.kg, 30);

      const { rows } = await asPostgres<{ invoice_number: string; service_area: string }>(
        'select invoice_number, service_area from public.invoices where id = $1',
        [id],
      );
      expect(rows[0]?.service_area).toBe('therapy');
      expect(rows[0]?.invoice_number).toMatch(/^RG-\d{4}-0001$/);

      const { rows: kreise } = await asPostgres<{ service_area: string; next_number: number }>(
        'select service_area, next_number from public.invoice_number_series',
      );
      // Nur der Behandlungskreis hat gezaehlt.
      expect(kreise).toEqual([{ service_area: 'therapy', next_number: 2 }]);
    });

    it('nennt ihren Bereich im Snapshot (schema_version 3)', async () => {
      const id = await ausgestellt(KATALOG.kg, 30);

      const { rows } = await asUser<{
        rechnung: { document: { schema_version: number; service_area: string } };
      }>(users.office, DOKUMENT, [id]);

      expect(rows[0]?.rechnung.document.schema_version).toBe(3);
      // Ein Kuerzel darf sich aendern, ein ausgestelltes Dokument nicht -
      // deshalb steht der Bereich auch ausgeschrieben da.
      expect(rows[0]?.rechnung.document.service_area).toBe('therapy');
    });

    it('bleibt innerhalb ihres Kreises lueckenlos', async () => {
      await ausgestellt(KATALOG.kg, 30);
      const zweite = await ausgestellt(KATALOG.mt, 28);

      const { rows } = await asPostgres<{ invoice_number: string }>(
        'select invoice_number from public.invoices where id = $1',
        [zweite],
      );
      expect(rows[0]?.invoice_number).toMatch(/^RG-\d{4}-0002$/);
    });
  });

  describe('das Stornodokument', () => {
    it('nimmt seine Nummer aus dem Kreis seiner Rechnung', async () => {
      const id = await ausgestellt(KATALOG.kg, 30);
      const { rows } = await asUserCommitted<{ nummer: string }>(users.office, STORNIEREN, [
        id,
        'Synthetischer Testfall',
      ]);

      // Derselbe Kreis, die naechste Nummer: Das Storno ist selbst ein
      // ausgehendes Dokument (ANN-079, ADR-009 Punkt 17).
      expect(rows[0]?.nummer).toMatch(/^RG-\d{4}-0002$/);

      const { rows: kreise } = await asPostgres<{ service_area: string; next_number: number }>(
        'select service_area, next_number from public.invoice_number_series',
      );
      expect(kreise).toEqual([{ service_area: 'therapy', next_number: 3 }]);
    });
  });
});

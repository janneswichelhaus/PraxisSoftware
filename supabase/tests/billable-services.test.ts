import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';

/**
 * Leistungen aus durchgefuehrten Terminen (ABR-002).
 *
 * Vier Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Woraus eine Leistung entsteht**, sagt PROJECT_PRINCIPLES.md 19
 *     abschliessend: aus "dokumentiert" oder aus einem Vorgang mit
 *     Gebuehrenanlass. Kein Override (ANN-072).
 *   * **Behandlung und Ausfallhonorar rutschen nie ineinander.**
 *   * **Keine Doppelabrechnung**: je Termin und Position hoechstens eine
 *     Leistung, und ein Termin wird nur einmal erfasst (Paragraf 13).
 *   * **Die genutzte Menge der Grundlage wird fortgeschrieben** - und beim
 *     Entfernen genau so zurueckgenommen (ANN-073).
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

/** Behandlungsgrundlage aus supabase/seed.sql: Erika, 10 Termine, 0 genutzt. */
const GRUNDLAGE_FRISCH = '88888888-8888-4888-8888-000000000004';
/** Position dieser Grundlage: Krankengymnastik, 10 verordnet, 0 genutzt. */
const POSITION_FRISCH = '99999999-9999-4999-8999-000000000005';

/** Katalogpositionen aus supabase/seed.sql, Preisliste 2026. */
const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  mt: 'cccccccc-cccc-4ccc-8ccc-000000000003',
  hausbesuch: 'cccccccc-cccc-4ccc-8ccc-000000000005',
  ausfall: 'cccccccc-cccc-4ccc-8ccc-000000000008',
  /** Aus dem Entwurf 2027 - nie die geltende Liste. */
  kgEntwurf: 'cccccccc-cccc-4ccc-8ccc-000000000011',
} as const;

const VORSCHLAG = 'select * from public.get_billable_service_draft($1::uuid)';
const ERFASSEN = 'select public.record_billable_services($1::uuid, $2::jsonb) as anzahl';
const ENTFERNEN = 'select public.delete_billable_services($1::uuid) as anzahl';
const OFFEN = 'select * from public.list_open_billable_appointments(100)';
const LISTE = 'select * from public.list_billable_services(null, null, 200)';
const OEFFNEN = 'select public.reopen_appointment($1::uuid, $2::timestamptz) as id';

interface Vorschlagszeile {
  catalog_item_id: string;
  code: string;
  item_kind: string;
  unit_price_cents: number;
  suggested: boolean;
}

/**
 * Legt einen vergangenen Termin an. `stunden` zaehlt rueckwaerts, damit jeder
 * Termin in seinem eigenen Zeitfenster liegt und die Ueberschneidungssperre
 * nicht anschlaegt.
 */
async function termin(opts: {
  vorStunden: number;
  status?: 'confirmed' | 'completed' | 'documented' | 'cancelled' | 'no_show';
  grundlage?: string | null;
  gebuehrenanlass?: 'late_cancellation' | 'no_show' | null;
  patient?: string;
}): Promise<string> {
  const status = opts.status ?? 'documented';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by,
       cancelled_at, cancelled_by, cancellation_reason, cancellation_received_at,
       no_show_recorded_at, no_show_recorded_by, fee_basis
     ) values (
       $1, $2, $3, $4,
       'practice', $5,
       date_trunc('hour', now()) - make_interval(hours => $6::int),
       date_trunc('hour', now()) - make_interval(hours => $6::int - 1),
       $7,
       case when $5 in ('completed', 'documented') then now() end,
       case when $5 in ('completed', 'documented') then $8::uuid end,
       case when $5 = 'cancelled' then now() end,
       case when $5 = 'cancelled' then $8::uuid end,
       case when $5 = 'cancelled' then 'patient_request' end,
       case when $5 = 'cancelled' then now() end,
       case when $5 = 'no_show' then now() end,
       case when $5 = 'no_show' then $8::uuid end,
       $9
     ) returning id`,
    [
      organizationId,
      opts.patient ?? patients.erika,
      STAFF_ANNA,
      LOCATION,
      status,
      opts.vorStunden,
      opts.grundlage === undefined ? GRUNDLAGE_FRISCH : opts.grundlage,
      users.ownerTherapist,
      opts.gebuehrenanlass ?? null,
    ],
  );
  return rows[0]!.id;
}

/**
 * `updated_at` des Termins als Zeichenkette mit Mikrosekunden - so, wie
 * PostgREST sie liefert. Ueber den pg-Treiber kaeme ein Date, das die
 * Mikrosekunden verliert, und die Sperre gegen gleichzeitige Aenderungen
 * schluege dann immer an.
 */
async function terminstand(id: string): Promise<string> {
  const { rows } = await asPostgres<{ updated_at: string }>(
    `select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as updated_at
       from public.appointments where id = $1`,
    [id],
  );
  return rows[0]!.updated_at;
}

async function genutzt(positionId = POSITION_FRISCH): Promise<number> {
  const { rows } = await asPostgres<{ used_quantity: number }>(
    'select used_quantity from public.treatment_base_items where id = $1',
    [positionId],
  );
  return rows[0]!.used_quantity;
}

describe('Leistungserfassung', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.billable_services');
    await asPostgres('delete from public.appointments');
    await asPostgres('update public.treatment_base_items set used_quantity = 0 where id = $1', [
      POSITION_FRISCH,
    ]);
    await asPostgres("delete from public.audit_log where action like 'billable_service.%'");
  });

  describe('Woraus eine Leistung entstehen darf', () => {
    it('nimmt einen dokumentierten Termin an', async () => {
      const id = await termin({ vorStunden: 24 });
      const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }]),
      ]);
      expect(Number(rows[0]!.anzahl)).toBe(1);
    });

    it('nimmt einen Vorgang mit Gebuehrenanlass an', async () => {
      const id = await termin({
        vorStunden: 26,
        status: 'cancelled',
        gebuehrenanlass: 'late_cancellation',
      });
      const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.ausfall, quantity: 1 }]),
      ]);
      expect(Number(rows[0]!.anzahl)).toBe(1);
    });

    it('weist einen bestaetigten und einen nur abgeschlossenen Termin ab', async () => {
      for (const status of ['confirmed', 'completed'] as const) {
        const id = await termin({ vorStunden: 28, status });
        await expect(
          asUser(users.office, ERFASSEN, [
            id,
            JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }]),
          ]),
        ).rejects.toThrow(/neither documented nor a fee occasion/);
        await asPostgres('delete from public.appointments where id = $1', [id]);
      }
    });

    it('weist eine Absage ohne Gebuehrenanlass ab - es gibt keinen Override', async () => {
      const id = await termin({ vorStunden: 30, status: 'cancelled', gebuehrenanlass: null });
      await expect(
        asUser(users.office, ERFASSEN, [
          id,
          JSON.stringify([{ catalog_item_id: KATALOG.ausfall, quantity: 1 }]),
        ]),
      ).rejects.toThrow(/neither documented nor a fee occasion/);
    });
  });

  describe('Behandlung und Ausfallhonorar bleiben getrennt', () => {
    it('laesst am dokumentierten Termin kein Ausfallhonorar zu', async () => {
      const id = await termin({ vorStunden: 32 });
      await expect(
        asUser(users.office, ERFASSEN, [
          id,
          JSON.stringify([{ catalog_item_id: KATALOG.ausfall, quantity: 1 }]),
        ]),
      ).rejects.toThrow(/does not match treatment/);
    });

    it('laesst am Gebuehrenanlass keine Behandlung zu', async () => {
      const id = await termin({
        vorStunden: 34,
        status: 'no_show',
        gebuehrenanlass: 'no_show',
      });
      await expect(
        asUser(users.office, ERFASSEN, [
          id,
          JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }]),
        ]),
      ).rejects.toThrow(/does not match absence_fee/);
    });

    it('schlaegt am Gebuehrenanlass nur das Ausfallhonorar vor', async () => {
      const id = await termin({
        vorStunden: 36,
        status: 'cancelled',
        gebuehrenanlass: 'late_cancellation',
      });
      const { rows } = await asUser<Vorschlagszeile>(users.office, VORSCHLAG, [id]);
      expect(rows.map((zeile) => zeile.code)).toEqual(['AUS']);
      expect(rows[0]!.suggested).toBe(true);
    });
  });

  describe('Der Vorschlag kommt aus der Grundlage', () => {
    it('markiert die Heilmittel der Grundlage und laesst die uebrigen waehlbar', async () => {
      const id = await termin({ vorStunden: 38 });
      const { rows } = await asUser<Vorschlagszeile>(users.office, VORSCHLAG, [id]);

      const vorgeschlagen = rows.filter((zeile) => zeile.suggested).map((zeile) => zeile.code);
      expect(vorgeschlagen).toEqual(['KG']);
      // Waehlbar bleibt die ganze Preisliste - ohne das Ausfallhonorar.
      expect(rows.map((zeile) => zeile.code)).toEqual([
        'KG',
        'KG-D',
        'MT',
        'MT-D',
        'HB',
        'WT',
        'SZL',
      ]);
    });

    it('schlaegt ohne Grundlage nichts vor, bietet aber die Preisliste an', async () => {
      const id = await termin({ vorStunden: 40, grundlage: null });
      const { rows } = await asUser<Vorschlagszeile>(users.office, VORSCHLAG, [id]);
      expect(rows.some((zeile) => zeile.suggested)).toBe(false);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('nennt den Preis der Position und nicht den des Entwurfs', async () => {
      const id = await termin({ vorStunden: 42 });
      const { rows } = await asUser<Vorschlagszeile>(users.office, VORSCHLAG, [id]);
      expect(rows.find((zeile) => zeile.code === 'KG')!.unit_price_cents).toBe(4500);
    });

    it('weist eine Position aus einer anderen Preisliste ab', async () => {
      const id = await termin({ vorStunden: 44 });
      await expect(
        asUser(users.office, ERFASSEN, [
          id,
          JSON.stringify([{ catalog_item_id: KATALOG.kgEntwurf, quantity: 1 }]),
        ]),
      ).rejects.toThrow(/does not belong to the catalog version/);
    });
  });

  describe('Keine Doppelabrechnung', () => {
    it('erfasst einen Termin nur einmal', async () => {
      const id = await termin({ vorStunden: 46 });
      await asUserCommitted(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }]),
      ]);
      await expect(
        asUser(users.office, ERFASSEN, [
          id,
          JSON.stringify([{ catalog_item_id: KATALOG.mt, quantity: 1 }]),
        ]),
      ).rejects.toThrow(/already has billable services/);
    });

    it('nimmt dieselbe Position nicht zweimal an', async () => {
      const id = await termin({ vorStunden: 48 });
      await expect(
        asUser(users.office, ERFASSEN, [
          id,
          JSON.stringify([
            { catalog_item_id: KATALOG.kg, quantity: 1 },
            { catalog_item_id: KATALOG.kg, quantity: 1 },
          ]),
        ]),
      ).rejects.toThrow(/appointment_item_key/);
    });

    it('schreibt nichts, wenn eine Position des Vorgangs nicht passt', async () => {
      const id = await termin({ vorStunden: 50 });
      await expect(
        asUser(users.office, ERFASSEN, [
          id,
          JSON.stringify([
            { catalog_item_id: KATALOG.kg, quantity: 1 },
            { catalog_item_id: KATALOG.ausfall, quantity: 1 },
          ]),
        ]),
      ).rejects.toThrow(/does not match treatment/);

      const { rows } = await asPostgres('select id from public.billable_services');
      expect(rows).toHaveLength(0);
    });

    it.each([[0], [-1], [11]])('weist die Menge %i ab (R3-025)', async (menge) => {
      // Die Tabelle laesst 1 bis 10 zu. Null ist keine Leistung, negativ ist
      // keine Menge, und elf waere eine Abrechnung ohne Deckung.
      const id = await termin({ vorStunden: 60 + Math.abs(menge) });
      await expect(
        asUser(users.office, ERFASSEN, [
          id,
          JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: menge }]),
        ]),
      ).rejects.toThrow();
    });

    it('weist eine gebrochene Menge ab (R3-025)', async () => {
      const id = await termin({ vorStunden: 72 });
      await expect(
        asUser(users.office, ERFASSEN, [
          id,
          JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 2.5 }]),
        ]),
      ).rejects.toThrow();
    });

    it('laesst den Termin nicht wieder oeffnen, solange eine Leistung erfasst ist (R3-002)', async () => {
      // Sonst steht der Termin wieder auf 'confirmed' und ohne
      // Gebuehrenanlass da, waehrend das Ausfallhonorar unveraendert unter
      // "Abzurechnen" wartet - und spaeter zu einem Termin abgerechnet wird,
      // den es so nie gegeben hat.
      const id = await termin({
        vorStunden: 54,
        status: 'no_show',
        grundlage: null,
        gebuehrenanlass: 'no_show',
      });
      await asUserCommitted(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.ausfall, quantity: 1 }]),
      ]);

      const stand = await terminstand(id);

      await expect(asUser(users.ownerTherapist, OEFFNEN, [id, stand])).rejects.toThrow(
        /billable services recorded/,
      );

      // Der Termin bleibt, was er war; die Gebuehr bleibt abrechenbar.
      const { rows: danach } = await asPostgres<{ status: string; fee_basis: string | null }>(
        'select status, fee_basis from public.appointments where id = $1',
        [id],
      );
      expect(danach[0]!.status).toBe('no_show');
      expect(danach[0]!.fee_basis).toBe('no_show');
    });

    it('laesst ihn wieder oeffnen, sobald die Leistung entfernt ist (R3-002)', async () => {
      // Der Weg zurueck bleibt offen - er fuehrt nur ueber das Entfernen der
      // Leistung, nicht daran vorbei.
      const id = await termin({
        vorStunden: 56,
        status: 'no_show',
        grundlage: null,
        gebuehrenanlass: 'no_show',
      });
      await asUserCommitted(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.ausfall, quantity: 1 }]),
      ]);
      await asUserCommitted(users.office, ENTFERNEN, [id]);

      const stand = await terminstand(id);
      await asUserCommitted(users.ownerTherapist, OEFFNEN, [id, stand]);

      const { rows: danach } = await asPostgres<{ status: string }>(
        'select status from public.appointments where id = $1',
        [id],
      );
      expect(danach[0]!.status).toBe('confirmed');
    });
  });

  describe('Die genutzte Menge der Grundlage', () => {
    it('waechst mit der erfassten Leistung', async () => {
      const id = await termin({ vorStunden: 52 });
      expect(await genutzt()).toBe(0);

      await asUserCommitted(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 2 }]),
      ]);
      expect(await genutzt()).toBe(2);
    });

    it('bleibt unberuehrt von einer Position ohne Heilmittel der Grundlage', async () => {
      const id = await termin({ vorStunden: 54 });
      await asUserCommitted(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.hausbesuch, quantity: 1 }]),
      ]);
      expect(await genutzt()).toBe(0);
    });

    it('geht mit dem Entfernen genau so weit zurueck', async () => {
      const id = await termin({ vorStunden: 56 });
      await asUserCommitted(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 3 }]),
      ]);
      expect(await genutzt()).toBe(3);

      const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, ENTFERNEN, [id]);
      expect(Number(rows[0]!.anzahl)).toBe(1);
      expect(await genutzt()).toBe(0);
    });

    it('weist die Erfassung ab, wenn die Leistungsmenge ausgeschoepft waere', async () => {
      await asPostgres('update public.treatment_base_items set used_quantity = 10 where id = $1', [
        POSITION_FRISCH,
      ]);
      const id = await termin({ vorStunden: 58 });

      await expect(
        asUser(users.office, ERFASSEN, [
          id,
          JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }]),
        ]),
      ).rejects.toThrow(/quantity exhausted/);

      const { rows } = await asPostgres('select id from public.billable_services');
      expect(rows).toHaveLength(0);
    });
  });

  describe('Wer darf was', () => {
    it('laesst Therapeutin und Teamleitung nicht erfassen', async () => {
      const id = await termin({ vorStunden: 60 });
      for (const konto of [users.therapist, users.teamLead]) {
        await expect(
          asUser(konto, ERFASSEN, [
            id,
            JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }]),
          ]),
        ).rejects.toThrow(/not allowed to record billable services/);
        await expect(asUser(konto, LISTE)).rejects.toThrow(/not allowed to read billable services/);
      }
    });

    it('laesst ein Patientenkonto nichts lesen', async () => {
      await expect(asUser(users.patientErika, OFFEN)).rejects.toThrow(
        /not allowed to read billable services/,
      );
    });

    it('laesst owner und office lesen', async () => {
      for (const konto of [users.ownerTherapist, users.office]) {
        await expect(asUser(konto, LISTE)).resolves.toBeDefined();
      }
    });
  });

  describe('Die beiden Lesepfade', () => {
    it('fuehrt einen offenen Termin, bis seine Leistung erfasst ist', async () => {
      const id = await termin({ vorStunden: 62 });

      const vorher = await asUser<{ appointment_id: string; suggestion_count: number }>(
        users.office,
        OFFEN,
      );
      expect(vorher.rows.map((zeile) => zeile.appointment_id)).toContain(id);
      expect(
        Number(vorher.rows.find((zeile) => zeile.appointment_id === id)!.suggestion_count),
      ).toBe(1);

      await asUserCommitted(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }]),
      ]);

      const nachher = await asUser<{ appointment_id: string }>(users.office, OFFEN);
      expect(nachher.rows.map((zeile) => zeile.appointment_id)).not.toContain(id);
    });

    it('nennt in der Liste Kuerzel, Menge, Preis und Steuerkennzeichen', async () => {
      const id = await termin({ vorStunden: 64 });
      await asUserCommitted(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 2 }]),
      ]);

      const { rows } = await asUser<{
        code: string;
        quantity: number;
        unit_price_cents: number;
        currency: string;
        tax_treatment: string;
        status: string;
        patient_name: string;
      }>(users.office, LISTE);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        code: 'KG',
        quantity: 2,
        unit_price_cents: 4500,
        currency: 'EUR',
        tax_treatment: 'exempt_healthcare',
        status: 'billable',
        patient_name: 'Erika Beispiel',
      });
    });
  });

  describe('Auditspur', () => {
    it('protokolliert je Vorgang ein Ereignis am Termin', async () => {
      const id = await termin({ vorStunden: 66 });
      await asUserCommitted(users.office, ERFASSEN, [
        id,
        JSON.stringify([
          { catalog_item_id: KATALOG.kg, quantity: 1 },
          { catalog_item_id: KATALOG.hausbesuch, quantity: 1 },
        ]),
      ]);
      await asUserCommitted(users.office, ENTFERNEN, [id]);

      const { rows } = await asPostgres<{
        action: string;
        subject_type: string;
        subject_id: string;
        context: { item_count: number };
      }>(
        "select action, subject_type, subject_id, context from public.audit_log where action like 'billable_service.%' order by occurred_at",
      );

      expect(rows.map((zeile) => zeile.action)).toEqual([
        'billable_service.recorded',
        'billable_service.removed',
      ]);
      expect(rows[0]!.subject_type).toBe('appointment');
      expect(rows[0]!.subject_id).toBe(id);
      expect(rows[0]!.context.item_count).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Mandantengrenze (ADR-003, R3-025)
  // ---------------------------------------------------------------------------
  describe('Fremde Organisation', () => {
    it('erfasst nichts an einem fremden Termin und sieht keine Leistung', async () => {
      const fremd = await fremdeOrganisation();
      const id = await termin({ vorStunden: 58 });
      await asUserCommitted(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }]),
      ]);

      await expect(
        asUser(fremd.owner, ERFASSEN, [
          id,
          JSON.stringify([{ catalog_item_id: KATALOG.mt, quantity: 1 }]),
        ]),
      ).rejects.toThrow(/appointment not found/);
      expect((await asUser(fremd.owner, LISTE)).rows).toEqual([]);
      expect((await asUser(fremd.owner, OFFEN)).rows).toEqual([]);
    });
  });
});

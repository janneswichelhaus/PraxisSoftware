import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabaseOhneTermine } from './helpers/db';

/**
 * Ein Bereich je Rechnung (ABR-009, ADR-009 Fassung 2 Punkt 16).
 *
 * Vier Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Die gemischte Rechnung ist schemaseitig unmoeglich** - nicht durch
 *     eine Pruefung im Schreibweg, sondern durch zwei zusammengesetzte
 *     Fremdschluessel an der Rechnungszeile.
 *   * **Der Widerspruch zum Terminkontext ist ein Erfassungsfehler** und keine
 *     stille Korrektur (Punkt 16, ADR-022).
 *   * **Die Sammelrechnung buendelt je Person, Monat und Bereich** - ANN-077
 *     bekommt einen dritten Schluessel.
 *   * **Training ist abrechenbar** seit TRN-007 - am Trainingsverhaeltnis,
 *     nie an der Akte (training-services.test.ts, training-invoices.test.ts).
 */

const { users, organizationId, patients, trainingRelationships } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const GRUNDLAGE_FRISCH = '88888888-8888-4888-8888-000000000004';

/** Katalogpositionen aus supabase/seed.sql, Preisliste 2026. */
const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  selbstzahler: 'cccccccc-cccc-4ccc-8ccc-000000000007',
  /** Die einzige Position im Trainingsbereich. */
  personalTraining: 'cccccccc-cccc-4ccc-8ccc-000000000009',
} as const;

const ENTWURF = 'select public.create_invoice_draft($1::uuid, $2::date, $3::text) as id';
const KANDIDATEN = 'select * from public.list_invoice_candidates(100)';
const VORSCHLAG = 'select * from public.get_billable_service_draft($1::uuid)';

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

/** Ein Trainingstermin - ohne Patientin, am Trainingsverhaeltnis (ADR-022). */
async function trainingstermin(stundeImMonat: number): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, kind, training_relationship_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, completed_at, completed_by
     ) values (
       $1, 'training', $2, $3, $4, 'practice', 'documented',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int)) at time zone 'Europe/Berlin',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int + 1)) at time zone 'Europe/Berlin',
       now(), $6
     ) returning id`,
    [
      organizationId,
      trainingRelationships.erika,
      STAFF_ANNA,
      LOCATION,
      stundeImMonat,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

/** Erfasst eine Leistung an einem frischen Behandlungstermin. */
async function leistung(position: string, stundeImMonat: number): Promise<string> {
  const id = await behandlungstermin(stundeImMonat);
  await asUserCommitted(
    users.ownerTherapist,
    'select public.record_billable_services($1::uuid, $2::jsonb)',
    [id, JSON.stringify([{ catalog_item_id: position, quantity: 1 }])],
  );
  return id;
}

/** Der erste Tag des laufenden Monats in der Zeitzone der Praxis. */
async function monat(): Promise<string> {
  const { rows } = await asPostgres<{ monat: string }>(
    `select to_char(date_trunc('month', (now() at time zone 'Europe/Berlin')::date), 'YYYY-MM-DD') as monat`,
  );
  return rows[0]!.monat;
}

describe('Ein Bereich je Rechnung', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  describe('der Terminkontext entscheidet den Bereich', () => {
    it('weist eine Trainingsposition am Behandlungstermin ab', async () => {
      const termin = await behandlungstermin(30);
      await expect(
        asUser(
          users.ownerTherapist,
          'select public.record_billable_services($1::uuid, $2::jsonb)',
          [termin, JSON.stringify([{ catalog_item_id: KATALOG.personalTraining, quantity: 1 }])],
        ),
      ).rejects.toThrow();
    });

    it('nennt den Widerspruch beim Namen statt ihn still zu korrigieren', async () => {
      // Am Schreibweg vorbei: Der Trigger gilt auch hier, und er passt den
      // Bereich nicht an - Punkt 16 nennt den Widerspruch einen
      // Erfassungsfehler.
      const termin = await behandlungstermin(32);
      await expect(
        asPostgres(
          `insert into public.billable_services (
             organization_id, patient_id, appointment_id, catalog_item_id, performed_on
           ) values ($1, $2, $3, $4, current_date)`,
          [organizationId, patients.erika, termin, KATALOG.personalTraining],
        ),
      ).rejects.toThrow(/does not match the appointment context/);
    });

    it('bietet am Behandlungstermin keine Trainingsposition an', async () => {
      const termin = await behandlungstermin(34);
      const { rows } = await asUser<{ code: string; service_area: string }>(
        users.office,
        VORSCHLAG,
        [termin],
      );
      expect(rows.map((zeile) => zeile.code)).not.toContain('PT');
      expect(rows.every((zeile) => zeile.service_area === 'therapy')).toBe(true);
    });

    it('laesst einen internen Termin gar keine Leistung tragen', async () => {
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.appointments (
           organization_id, kind, title, staff_member_id, location_id,
           appointment_type, status, starts_at, ends_at, event_group_id
         ) values ($1, 'internal', 'Teamsitzung', $2, $3, 'practice', 'confirmed',
                   now() + interval '1 day', now() + interval '1 day 1 hour',
                   extensions.gen_random_uuid())
         returning id`,
        [organizationId, STAFF_ANNA, LOCATION],
      );

      await expect(
        asPostgres(
          `insert into public.billable_services (
             organization_id, patient_id, appointment_id, catalog_item_id, performed_on
           ) values ($1, $2, $3, $4, current_date)`,
          [organizationId, patients.erika, rows[0]!.id, KATALOG.kg],
        ),
      ).rejects.toThrow(/cannot carry billable services/);
    });
  });

  describe('die Rechnung', () => {
    it('traegt den Bereich ihrer Leistungen', async () => {
      await leistung(KATALOG.kg, 30);
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
        'therapy',
      ]);

      const { rows: rechnung } = await asPostgres<{ service_area: string }>(
        'select service_area from public.invoices where id = $1',
        [rows[0]!.id],
      );
      expect(rechnung[0]?.service_area).toBe('therapy');

      const { rows: zeilen } = await asPostgres<{ service_area: string }>(
        'select service_area from public.invoice_items where invoice_id = $1',
        [rows[0]!.id],
      );
      expect(zeilen.every((zeile) => zeile.service_area === 'therapy')).toBe(true);
    });

    it('nimmt keine Zeile aus einem anderen Bereich an - auch nicht am Schreibweg vorbei', async () => {
      await leistung(KATALOG.kg, 30);
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
        'therapy',
      ]);

      // Die Rechnung steht auf `therapy`. Eine Zeile mit `training` haette
      // keine Leistung dieses Bereichs - und keine Rechnung dazu. Der
      // Fremdschluessel weist sie ab, bevor eine Summe ueber zwei
      // Steuerregime entstehen kann.
      await expect(
        asPostgres(
          `insert into public.invoice_items
             (organization_id, invoice_id, billable_service_id, sort_order, service_area)
           select $1, $2, b.id, 9, 'training'
           from public.billable_services b limit 1`,
          [organizationId, rows[0]!.id],
        ),
      ).rejects.toThrow(/does not match the billable service/);
    });

    it('haelt den Bereich der Zeile an Rechnung und Leistung zugleich', async () => {
      await leistung(KATALOG.kg, 30);
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
        'therapy',
      ]);

      // Ohne den Trigger - der Fremdschluessel allein muss reichen.
      await asPostgres(
        'alter table public.invoice_items disable trigger a_invoice_items_area_from_service',
      );
      try {
        await expect(
          asPostgres(
            `update public.invoice_items set service_area = 'training' where invoice_id = $1`,
            [rows[0]!.id],
          ),
        ).rejects.toThrow(/invoice_items_(invoice|service)_area_fkey/);
      } finally {
        await asPostgres(
          'alter table public.invoice_items enable trigger a_invoice_items_area_from_service',
        );
      }
    });

    it('laesst den Bereich einer Rechnung mit Zeilen nicht drehen', async () => {
      await leistung(KATALOG.kg, 30);
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
        'therapy',
      ]);

      // Seit TRN-008 haelt invoices_party das Verhaeltnis am Bereich. Damit
      // hier der Fremdschluessel fuer sich einsteht, wandert das Verhaeltnis
      // mit (die Constraint selbst prueft training-invoices.test.ts).
      // Auch der Trigger aus dem Zweitreview (invoices_party_matches_items)
      // steht fuer diesen einen Satz still.
      await asPostgres('alter table public.invoices disable trigger invoices_party_matches_items');
      try {
        await expect(
          asPostgres(
            `update public.invoices
                set service_area = 'training', patient_id = null, training_relationship_id = $2
              where id = $1`,
            [rows[0]!.id, trainingRelationships.erika],
          ),
        ).rejects.toThrow(/invoice_items_invoice_area_fkey/);
      } finally {
        await asPostgres('alter table public.invoices enable trigger invoices_party_matches_items');
      }
    });
  });

  describe('die Buendelung (ANN-077, dritter Schluessel)', () => {
    it('fuehrt den Bereich in der Arbeitsliste', async () => {
      await leistung(KATALOG.kg, 30);
      const { rows } = await asUser<{ service_area: string; service_count: number }>(
        users.office,
        KANDIDATEN,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.service_area).toBe('therapy');
    });

    it('nimmt in den Entwurf nur Leistungen seines Bereichs auf', async () => {
      await leistung(KATALOG.kg, 30);
      await leistung(KATALOG.selbstzahler, 28);

      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
        'therapy',
      ]);

      const { rows: zeilen } = await asPostgres(
        'select id from public.invoice_items where invoice_id = $1',
        [rows[0]!.id],
      );
      // Beide Positionen stehen im Behandlungsbereich - die eine steuerfrei,
      // die andere steuerpflichtig. Verschiedene Steuerkennzeichen sind kein
      // Grund fuer zwei Rechnungen; verschiedene Bereiche waeren einer.
      expect(zeilen).toHaveLength(2);
    });

    it('weist einen unbekannten Bereich ab', async () => {
      await leistung(KATALOG.kg, 30);
      await expect(
        asUser(users.office, ENTWURF, [patients.erika, await monat(), 'wellness']),
      ).rejects.toThrow(/unknown service area/);
    });

    it('findet ohne Leistung im verlangten Bereich nichts zum Abrechnen', async () => {
      await leistung(KATALOG.kg, 30);
      await expect(
        asUser(users.office, ENTWURF, [patients.erika, await monat(), 'therapy']),
      ).resolves.toBeTruthy();
      // Alles aus dem Monat steht jetzt auf dem Entwurf; ein zweiter Aufruf
      // fuer eine andere Person findet nichts.
      await expect(
        asUser(users.office, ENTWURF, [patients.max, await monat(), 'therapy']),
      ).rejects.toThrow(/no billable services for this patient, month and service area/);
    });

    it('verweist fuer den Bereich training auf das Trainingsverhaeltnis (TRN-008)', async () => {
      await leistung(KATALOG.kg, 30);
      await expect(
        asUser(users.office, ENTWURF, [patients.erika, await monat(), 'training']),
      ).rejects.toThrow(/training invoices are drafted for the training relationship/);
    });

    it('laesst je Person, Monat und Bereich hoechstens einen Entwurf zu', async () => {
      await leistung(KATALOG.kg, 30);
      const m = await monat();
      await asUserCommitted(users.office, ENTWURF, [patients.erika, m, 'therapy']);

      await leistung(KATALOG.selbstzahler, 28);
      await expect(asUser(users.office, ENTWURF, [patients.erika, m, 'therapy'])).rejects.toThrow(
        /invoices_draft_period_key/,
      );
    });
  });

  describe('Training ist seit TRN-007 abrechenbar', () => {
    it('erfasst die Trainingsposition am Trainingstermin im Bereich training', async () => {
      // Bis TRN-EPIC-003 scheiterte das an `billable_services.patient_id`
      // (E18 Schritt 7). Jetzt haengt die Leistung am Trainingsverhaeltnis;
      // die Einzelfaelle stehen in training-services.test.ts.
      const termin = await trainingstermin(30);

      await asUserCommitted(
        users.ownerTherapist,
        'select public.record_billable_services($1::uuid, $2::jsonb)',
        [termin, JSON.stringify([{ catalog_item_id: KATALOG.personalTraining, quantity: 1 }])],
      );

      const { rows } = await asPostgres<{ service_area: string; patient_id: string | null }>(
        'select service_area, patient_id from public.billable_services where appointment_id = $1',
        [termin],
      );
      expect(rows).toEqual([{ service_area: 'training', patient_id: null }]);
    });
  });
});

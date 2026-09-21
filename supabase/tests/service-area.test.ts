import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabaseOhneTermine } from './helpers/db';

/**
 * Der Leistungsbereich an der Katalogposition (ABR-008).
 *
 * Drei Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Der Bereich haengt an der Position**, nicht an der Person und nicht am
 *     Rechtsverhaeltnis (ADR-009 Punkt 16, ADR-021 Punkt 2).
 *   * **Die Leistung traegt ihn von dort** - abgeleitet und nicht eingegeben.
 *     Der Trigger setzt ihn, der zusammengesetzte Fremdschluessel haelt ihn;
 *     beides gilt auch fuer einen Schreibweg an den Funktionen vorbei.
 *   * **Der ermaessigte Satz ist angelegt und nicht aktiviert** (Punkt 15, B4).
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const GRUNDLAGE_FRISCH = '88888888-8888-4888-8888-000000000004';

/** Katalogpositionen aus supabase/seed.sql, Preisliste 2026. */
const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  /** Steuerpflichtig, Bereich `therapy`: Selbstzahlerleistung an eine Patientin. */
  selbstzahler: 'cccccccc-cccc-4ccc-8ccc-000000000007',
} as const;

const ENTWURF_VERSION = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002';

const ANLEGEN = 'select public.create_service_catalog_version($1::text, $2::date, $3::uuid) as id';
const POSITIONEN = 'select public.write_service_catalog_items($1::uuid, $2::jsonb) as anzahl';

interface Position {
  code: string;
  label: string;
  item_kind?: string;
  remedy?: string | null;
  unit_price_cents: number;
  tax_treatment?: string;
  tax_rate_permille?: number;
  service_area?: string;
}

function positionen(...eintraege: Position[]): string {
  return JSON.stringify(eintraege);
}

const EINE_BEHANDLUNG: Position = {
  code: 'KG',
  label: 'Krankengymnastik',
  item_kind: 'treatment',
  remedy: 'Krankengymnastik',
  unit_price_cents: 5000,
  tax_treatment: 'exempt_healthcare',
  tax_rate_permille: 0,
};

/** Ein dokumentierter Behandlungstermin, an dem sich Leistungen erfassen lassen. */
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

describe('Leistungsbereich', () => {
  // Die Katalogtests schreiben in den Seed-Entwurf und legen neue Preislisten
  // an; der Klon aus der Vorlage ist billiger als jedes Aufraeumen von Hand.
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  describe('an der Katalogposition', () => {
    it('traegt jede Bestandsposition den Behandlungsbereich', async () => {
      const { rows } = await asPostgres<{ service_area: string; anzahl: string }>(
        'select service_area, count(*) as anzahl from public.service_catalog_items group by service_area',
      );
      expect(rows).toEqual([{ service_area: 'therapy', anzahl: '10' }]);
    });

    it('ist eine Trainingsposition nie eine steuerfreie Heilbehandlung', async () => {
      // ADR-021: "Training ist keine Heilbehandlung." Par. 4 Nr. 14 Buchstabe a
      // UStG traegt nur die Heilbehandlung.
      await expect(
        asPostgres(
          `insert into public.service_catalog_items (
             organization_id, catalog_version_id, sort_order, code, label,
             item_kind, unit_price_cents, tax_treatment, tax_rate_permille, service_area
           ) values ($1, $2, 90, 'XX', 'Falsch eingeordnet', 'treatment', 5000,
                     'exempt_healthcare', 0, 'training')`,
          [organizationId, ENTWURF_VERSION],
        ),
      ).rejects.toThrow(/training_is_not_healthcare/);
    });

    it('bleibt das Ausfallhonorar in beiden Bereichen moeglich', async () => {
      // Nicht steuerbar heisst "kein Leistungsaustausch" - das gilt im Training
      // genauso. Der Bereich leitet das Kennzeichen nicht ab (Punkt 15).
      await expect(
        asPostgres(
          `insert into public.service_catalog_items (
             organization_id, catalog_version_id, sort_order, code, label,
             item_kind, unit_price_cents, tax_treatment, tax_rate_permille, service_area
           ) values ($1, $2, 91, 'AUS-T', 'Ausfallhonorar Training', 'absence_fee', 5000,
                     'not_taxable', 0, 'training')`,
          [organizationId, ENTWURF_VERSION],
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('der ermaessigte Satz (Punkt 15, B4)', () => {
    const steuerpflichtig = (satz: number): Position => ({
      code: 'SZL',
      label: 'Selbstzahlerleistung',
      item_kind: 'treatment',
      remedy: null,
      unit_price_cents: 6000,
      tax_treatment: 'taxable',
      tax_rate_permille: satz,
    });

    it('nimmt den Regelsatz an', async () => {
      const { rows } = await asUserCommitted<{ anzahl: number }>(users.ownerTherapist, POSITIONEN, [
        ENTWURF_VERSION,
        positionen(steuerpflichtig(190)),
      ]);
      expect(rows[0]?.anzahl).toBe(1);
    });

    it('weist den ermaessigten Satz ab - angelegt, aber nicht aktiviert', async () => {
      await expect(
        asUser(users.ownerTherapist, POSITIONEN, [
          ENTWURF_VERSION,
          positionen(steuerpflichtig(70)),
        ]),
      ).rejects.toThrow(/reduced_rate_not_activated/);
    });

    it('weist einen Satz ab, den es in Deutschland nicht gibt', async () => {
      await expect(
        asUser(users.ownerTherapist, POSITIONEN, [
          ENTWURF_VERSION,
          positionen(steuerpflichtig(50)),
        ]),
      ).rejects.toThrow(/taxable_rate_known/);
    });
  });

  describe('die Schreibwege des Katalogs', () => {
    it('fuehren den Bereich mit', async () => {
      await asUserCommitted(users.ownerTherapist, POSITIONEN, [
        ENTWURF_VERSION,
        positionen(EINE_BEHANDLUNG, {
          code: 'PT',
          label: 'Personal Training',
          item_kind: 'treatment',
          remedy: null,
          unit_price_cents: 7500,
          tax_treatment: 'taxable',
          tax_rate_permille: 190,
          service_area: 'training',
        }),
      ]);

      const { rows } = await asPostgres<{ code: string; service_area: string }>(
        'select code, service_area from public.service_catalog_items where catalog_version_id = $1 order by sort_order',
        [ENTWURF_VERSION],
      );
      expect(rows).toEqual([
        { code: 'KG', service_area: 'therapy' },
        { code: 'PT', service_area: 'training' },
      ]);
    });

    it('legen ohne Angabe eine Behandlungsposition an', async () => {
      await asUserCommitted(users.ownerTherapist, POSITIONEN, [
        ENTWURF_VERSION,
        positionen(EINE_BEHANDLUNG),
      ]);

      const { rows } = await asPostgres<{ service_area: string }>(
        'select service_area from public.service_catalog_items where catalog_version_id = $1',
        [ENTWURF_VERSION],
      );
      expect(rows[0]?.service_area).toBe('therapy');
    });

    it('nimmt die Kopie einer Preisliste den Bereich mit', async () => {
      await asUserCommitted(users.ownerTherapist, POSITIONEN, [
        ENTWURF_VERSION,
        positionen({
          code: 'PT',
          label: 'Personal Training',
          item_kind: 'treatment',
          remedy: null,
          unit_price_cents: 7500,
          tax_treatment: 'taxable',
          tax_rate_permille: 190,
          service_area: 'training',
        }),
      ]);

      const { rows: neu } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ANLEGEN, [
        'Kopie',
        '2028-01-01',
        ENTWURF_VERSION,
      ]);

      const { rows } = await asPostgres<{ service_area: string }>(
        'select service_area from public.service_catalog_items where catalog_version_id = $1',
        [neu[0]!.id],
      );
      expect(rows[0]?.service_area).toBe('training');
    });
  });

  describe('an der erfassten Leistung', () => {
    it('kommt er aus der Katalogposition', async () => {
      const termin = await behandlungstermin(30);
      await asUserCommitted(
        users.ownerTherapist,
        'select public.record_billable_services($1::uuid, $2::jsonb)',
        [termin, JSON.stringify([{ catalog_item_id: KATALOG.selbstzahler, quantity: 1 }])],
      );

      const { rows } = await asPostgres<{ service_area: string }>(
        'select service_area from public.billable_services where appointment_id = $1',
        [termin],
      );
      expect(rows[0]?.service_area).toBe('therapy');
    });

    it('setzt der Trigger ihn auch an den Funktionen vorbei', async () => {
      const termin = await behandlungstermin(32);
      await asPostgres(
        `insert into public.billable_services (
           organization_id, patient_id, appointment_id, catalog_item_id, performed_on
         ) values ($1, $2, $3, $4, current_date)`,
        [organizationId, patients.erika, termin, KATALOG.kg],
      );

      const { rows } = await asPostgres<{ service_area: string }>(
        'select service_area from public.billable_services where appointment_id = $1',
        [termin],
      );
      expect(rows[0]?.service_area).toBe('therapy');
    });

    it('weist einen abweichend mitgegebenen Bereich ab statt ihn still zu ersetzen', async () => {
      const termin = await behandlungstermin(34);
      await expect(
        asPostgres(
          `insert into public.billable_services (
             organization_id, patient_id, appointment_id, catalog_item_id, performed_on, service_area
           ) values ($1, $2, $3, $4, current_date, 'training')`,
          [organizationId, patients.erika, termin, KATALOG.kg],
        ),
      ).rejects.toThrow(/does not match the catalog item/);
    });

    it('laesst sich nachtraeglich nicht auf einen anderen Bereich drehen', async () => {
      const termin = await behandlungstermin(36);
      await asPostgres(
        `insert into public.billable_services (
           organization_id, patient_id, appointment_id, catalog_item_id, performed_on
         ) values ($1, $2, $3, $4, current_date)`,
        [organizationId, patients.erika, termin, KATALOG.kg],
      );

      // Der zusammengesetzte Fremdschluessel, nicht der Trigger: Er prueft auch
      // das Aendern und damit jeden Schreibweg, auch den kuenftigen.
      await expect(
        asPostgres(
          "update public.billable_services set service_area = 'training' where appointment_id = $1",
          [termin],
        ),
      ).rejects.toThrow(/billable_services_catalog_item_area_fkey/);
    });
  });
});

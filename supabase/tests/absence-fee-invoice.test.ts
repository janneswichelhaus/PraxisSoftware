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
 * Das Ausfallhonorar steht auf einer eigenen Rechnung (ADR-009 Punkt 25):
 * Die Rechnung zur Verordnung geht an die Kasse und führt es nie.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
/** Erika, Folgeverordnung vom 08.09.2026: Krankengymnastik, 10 Termine. */
const GRUNDLAGE = '88888888-8888-4888-8888-000000000004';

const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  ausfall: 'cccccccc-cccc-4ccc-8ccc-000000000008',
  selbstzahler: 'cccccccc-cccc-4ccc-8ccc-000000000007',
} as const;

const ERFASSEN = 'select public.record_billable_services($1::uuid, $2::jsonb)';
const ENTWURF_GRUNDLAGE = 'select public.create_invoice_draft_for_basis($1::uuid) as id';
const ENTWURF_MONAT = 'select public.create_invoice_draft($1::uuid, $2::date) as id';
const ENTWURF_AUSFALL = 'select public.create_absence_fee_invoice_draft($1::uuid, $2::date) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const STORNIEREN = 'select public.cancel_invoice($1::uuid, $2::text)';
const KORREKTUR = 'select public.create_correction_draft($1::uuid) as id';
const DOKUMENT = 'select public.get_invoice($1::uuid) as rechnung';
const KANDIDATEN = 'select * from public.list_invoice_candidates(100)';

interface Kandidat {
  treatment_basis_id: string | null;
  absence_fee: boolean;
  period_month: string;
  service_count: number;
  total_cents: number;
}

interface Dokument {
  document: {
    treatment_bases: unknown[];
    items: { code: string; line_total_cents: number }[];
    totals: { total_cents: number };
  };
}

let stunde = 0;

/** Ein Termin heute, dokumentiert oder ausgefallen, an der Verordnung oder ohne Grundlage. */
async function termin(art: 'documented' | 'no_show', grundlage: string | null = GRUNDLAGE) {
  stunde += 2;
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
       case when $5 = 'no_show' then 'no_show' end
     ) returning id`,
    [
      organizationId,
      patients.erika,
      STAFF_ANNA,
      LOCATION,
      art,
      stunde,
      grundlage,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

async function erfassen(id: string, position: string): Promise<void> {
  await asUserCommitted(users.office, ERFASSEN, [
    id,
    JSON.stringify([{ catalog_item_id: position, quantity: 1 }]),
  ]);
}

async function entwurf(sql: string, werte: unknown[]): Promise<string> {
  return (await asUserCommitted<{ id: string }>(users.office, sql, werte)).rows[0]!.id;
}

async function dokument(id: string): Promise<Dokument['document']> {
  const { rows } = await asUser<{ rechnung: Dokument }>(users.office, DOKUMENT, [id]);
  return rows[0]!.rechnung.document;
}

async function kandidaten(): Promise<Kandidat[]> {
  return (await asUser<Kandidat>(users.office, KANDIDATEN)).rows;
}

async function monat(): Promise<string> {
  const { rows } = await asPostgres<{ monat: string }>(
    `select to_char(date_trunc('month', min(performed_on)), 'YYYY-MM-DD') as monat
       from public.billable_services`,
  );
  return rows[0]!.monat;
}

describe('Ausfallhonorar auf eigener Rechnung', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    stunde = 0;
    await asPostgres(`
      delete from public.payments;
      delete from public.invoice_cancellations;
      delete from public.invoice_items;
      delete from public.invoices;
      delete from public.invoice_number_series;
      delete from public.appointment_session_fees;
      delete from public.billable_services;
      delete from public.appointments where patient_id = '${patients.erika}';
      delete from public.patient_fee_agreements;
      update public.treatment_base_items set used_quantity = 0;
    `);
    await asPostgres(
      `insert into public.practice_billing_profiles
         (organization_id, legal_name, street, house_number, postal_code, city, tax_number,
          small_business, iban)
       values ($1, 'Test Praxis Tuebingen', 'Musterallee', '1', '72070', 'Tuebingen',
               '86123/45678', false, 'DE02120300000000202051')
       on conflict (organization_id) do nothing`,
      [organizationId],
    );
  });

  it('fuehrt das Ausfallhonorar nie auf der Rechnung zur Verordnung', async () => {
    await erfassen(await termin('documented'), KATALOG.kg);
    await erfassen(await termin('no_show'), KATALOG.ausfall);

    const id = await entwurf(ENTWURF_GRUNDLAGE, [GRUNDLAGE]);
    const { rows } = await asPostgres<{ code: string }>(
      `select c.code from public.invoice_items it
         join public.billable_services b on b.id = it.billable_service_id
         join public.service_catalog_items c on c.id = b.catalog_item_id
        where it.invoice_id = $1`,
      [id],
    );
    expect(rows.map((r) => r.code)).toEqual(['KG']);
  });

  it('nennt das Ausfallhonorar als eigene Zeile unter dem Abzurechnenden', async () => {
    await erfassen(await termin('documented'), KATALOG.kg);
    await erfassen(await termin('no_show'), KATALOG.ausfall);

    const liste = await kandidaten();
    expect(liste).toHaveLength(2);
    const ausfall = liste.find((k) => k.absence_fee)!;
    expect(ausfall.treatment_basis_id).toBeNull();
    expect(ausfall.service_count).toBe(1);
    expect(ausfall.total_cents).toBe(4500);
    expect(liste.find((k) => !k.absence_fee)!.treatment_basis_id).toBe(GRUNDLAGE);
  });

  it('stellt die Ausfallrechnung ohne Verordnung und Diagnose aus', async () => {
    await erfassen(await termin('no_show'), KATALOG.ausfall);

    const id = await entwurf(ENTWURF_AUSFALL, [patients.erika, await monat()]);
    expect(await kandidaten()).toEqual([]);

    await asUserCommitted(users.office, AUSSTELLEN, [id]);
    const blatt = await dokument(id);
    expect(blatt.items.map((z) => z.code)).toEqual(['AUS']);
    expect(blatt.totals.total_cents).toBe(4500);
    expect(blatt.treatment_bases).toEqual([]);
  });

  it('haelt Ausfallrechnung und Monatsrechnung ohne Grundlage nebeneinander', async () => {
    await erfassen(await termin('documented', null), KATALOG.selbstzahler);
    await erfassen(await termin('no_show', null), KATALOG.ausfall);
    const m = await monat();

    const normal = await entwurf(ENTWURF_MONAT, [patients.erika, m]);
    const ausfall = await entwurf(ENTWURF_AUSFALL, [patients.erika, m]);

    const { rows } = await asPostgres<{ invoice_id: string; code: string }>(
      `select it.invoice_id, c.code from public.invoice_items it
         join public.billable_services b on b.id = it.billable_service_id
         join public.service_catalog_items c on c.id = b.catalog_item_id`,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.invoice_id === normal)!.code).toBe('SZL');
    expect(rows.find((r) => r.invoice_id === ausfall)!.code).toBe('AUS');
  });

  it('weist eine Mischung im Datenmodell ab, in beiden Richtungen', async () => {
    await erfassen(await termin('documented'), KATALOG.kg);
    await erfassen(await termin('no_show'), KATALOG.ausfall);
    const grundlage = await entwurf(ENTWURF_GRUNDLAGE, [GRUNDLAGE]);
    const ausfall = await entwurf(ENTWURF_AUSFALL, [patients.erika, await monat()]);

    const tauschen = (rechnung: string, andere: string) =>
      asPostgres(`update public.invoice_items set invoice_id = $1 where invoice_id = $2`, [
        rechnung,
        andere,
      ]);
    await expect(tauschen(grundlage, ausfall)).rejects.toThrow(/absence fee/);
    await expect(tauschen(ausfall, grundlage)).rejects.toThrow(/absence fee/);
  });

  it('weist einen zweiten Ausfallentwurf im selben Monat und einen leeren ab', async () => {
    await expect(
      asUser(users.office, ENTWURF_AUSFALL, [patients.erika, '2026-01-01']),
    ).rejects.toThrow(/no billable absence fees/);

    await erfassen(await termin('no_show'), KATALOG.ausfall);
    const m = await monat();
    await entwurf(ENTWURF_AUSFALL, [patients.erika, m]);
    await erfassen(await termin('no_show'), KATALOG.ausfall);
    await expect(asUser(users.office, ENTWURF_AUSFALL, [patients.erika, m])).rejects.toThrow(
      /already exists/,
    );
  });

  it('laesst nur die Abrechnung anlegen, nie eine Therapeutin oder ein Patientenkonto', async () => {
    await erfassen(await termin('no_show'), KATALOG.ausfall);
    const m = await monat();
    for (const konto of [users.therapist, users.patientMax]) {
      await expect(asUser(konto, ENTWURF_AUSFALL, [patients.erika, m])).rejects.toThrow(
        /not allowed to manage invoices/,
      );
    }
  });

  it('zeigt einer fremden Organisation nichts und legt fuer sie nichts an', async () => {
    const fremd = await fremdeOrganisation();
    await erfassen(await termin('no_show'), KATALOG.ausfall);

    expect((await asUser(fremd.owner, KANDIDATEN)).rows).toEqual([]);
    await expect(
      asUser(fremd.owner, ENTWURF_AUSFALL, [patients.erika, await monat()]),
    ).rejects.toThrow(/patient not found/);
  });

  it('fuehrt das Ausfallhonorar auch nicht auf der Korrektur der Verordnungsrechnung', async () => {
    await erfassen(await termin('documented'), KATALOG.kg);
    const id = await entwurf(ENTWURF_GRUNDLAGE, [GRUNDLAGE]);
    await asUserCommitted(users.office, AUSSTELLEN, [id]);
    await asUserCommitted(users.office, STORNIEREN, [id, 'Falscher Empfänger']);
    await erfassen(await termin('no_show'), KATALOG.ausfall);

    const korrektur = await entwurf(KORREKTUR, [id]);
    const ausfall = await entwurf(ENTWURF_AUSFALL, [patients.erika, await monat()]);
    const { rows } = await asPostgres<{ invoice_id: string; code: string }>(
      `select it.invoice_id, c.code from public.invoice_items it
         join public.billable_services b on b.id = it.billable_service_id
         join public.service_catalog_items c on c.id = b.catalog_item_id
        where it.released_at is null`,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.invoice_id === korrektur)!.code).toBe('KG');
    expect(rows.find((r) => r.invoice_id === ausfall)!.code).toBe('AUS');
  });

  it('korrigiert eine stornierte Ausfallrechnung wieder als Ausfallrechnung', async () => {
    await erfassen(await termin('no_show'), KATALOG.ausfall);
    const id = await entwurf(ENTWURF_AUSFALL, [patients.erika, await monat()]);
    await asUserCommitted(users.office, AUSSTELLEN, [id]);
    await asUserCommitted(users.office, STORNIEREN, [id, 'Falscher Empfänger']);

    const korrektur = await entwurf(KORREKTUR, [id]);
    const { rows } = await asPostgres<{ absence_fee: boolean; anzahl: string }>(
      `select i.absence_fee, count(it.id) as anzahl
         from public.invoices i join public.invoice_items it on it.invoice_id = i.id
        where i.id = $1 group by i.absence_fee`,
      [korrektur],
    );
    expect(rows).toEqual([{ absence_fee: true, anzahl: '1' }]);
  });
});

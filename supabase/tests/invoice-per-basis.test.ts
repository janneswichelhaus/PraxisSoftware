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
 * Eine Rechnung je Behandlungsgrundlage mit Einzelpositionen (ABR-032,
 * ADR-009 Fassung 5 Punkt 23, ANN-077 Fassung 2, ANN-233).
 *
 * Der verbindliche Fall aus BEF-099 steht zuerst: Terminzahl, Heilmittelmenge
 * und Rechnungsbetrag passen an einer Verordnung zusammen.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

/** Erika, Folgeverordnung vom 08.09.2026: Krankengymnastik, 10 Termine. */
const GRUNDLAGE = '88888888-8888-4888-8888-000000000004';
/** Erika, Selbstzahler seit 03.09.2026. */
const SELBSTZAHLER = '88888888-8888-4888-8888-000000000005';
/** Position der Verordnung: Krankengymnastik, 10 verordnet. */
const POSITION_KG = '99999999-9999-4999-8999-000000000005';

const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  hausbesuch: 'cccccccc-cccc-4ccc-8ccc-000000000005',
} as const;

const ERFASSEN = 'select public.record_billable_services($1::uuid, $2::jsonb)';
const ENTWURF_GRUNDLAGE = 'select public.create_invoice_draft_for_basis($1::uuid) as id';
const ENTWURF_MONAT = 'select public.create_invoice_draft($1::uuid, $2::date) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const DOKUMENT = 'select public.get_invoice($1::uuid) as rechnung';
const KANDIDATEN = 'select * from public.list_invoice_candidates(100)';
const LISTE = 'select * from public.list_invoices(100)';

interface Kandidat {
  patient_id: string;
  treatment_basis_id: string | null;
  basis_kind: string | null;
  basis_issued_on: string | null;
  first_performed_on: string;
  last_performed_on: string;
  service_count: number;
  total_cents: number;
  has_draft: boolean;
  draft_id: string | null;
}

interface Dokument {
  document: {
    schema_version: number;
    service_period: { from: string; to: string };
    treatment_bases: { kind: string; issued_on: string; diagnosis_icd10?: string | null }[];
    items: {
      performed_on: string;
      code: string;
      quantity: number;
      unit_price_cents: number;
      line_total_cents: number;
      session_fee: boolean;
    }[];
    totals: { total_cents: number };
  };
}

/** Ein dokumentierter Termin `vorTagen` Tage vor heute, `stunde` Uhr Praxiszeit. */
async function termin(
  vorTagen: number,
  grundlage: string | null = GRUNDLAGE,
  stunde = 10,
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', 'documented',
       ((now() at time zone 'Europe/Berlin')::date - $5::int + make_time($8::int, 0, 0)) at time zone 'Europe/Berlin',
       ((now() at time zone 'Europe/Berlin')::date - $5::int + make_time($8::int + 1, 0, 0)) at time zone 'Europe/Berlin',
       $6, now(), $7
     ) returning id`,
    [
      organizationId,
      patients.erika,
      STAFF_ANNA,
      LOCATION,
      vorTagen,
      grundlage,
      users.ownerTherapist,
      stunde,
    ],
  );
  return rows[0]!.id;
}

async function bestaetigen(id: string, positionen: string[]): Promise<void> {
  await asUserCommitted(users.office, ERFASSEN, [
    id,
    JSON.stringify(positionen.map((p) => ({ catalog_item_id: p, quantity: 1 }))),
  ]);
}

async function dokument(id: string): Promise<Dokument['document']> {
  const { rows } = await asUser<{ rechnung: Dokument }>(users.office, DOKUMENT, [id]);
  return rows[0]!.rechnung.document;
}

async function kandidaten(): Promise<Kandidat[]> {
  return (await asUser<Kandidat>(users.office, KANDIDATEN)).rows;
}

describe('Rechnung je Behandlungsgrundlage', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
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

  it('haelt Terminzahl, Heilmittelmenge und Rechnungsbetrag zusammen (BEF-099)', async () => {
    // Drei Termine derselben Verordnung, ueber zwei Monate verteilt. Einer
    // traegt zusaetzlich den Hausbesuch - das aendert den Betrag nicht.
    const termine = [await termin(40), await termin(3), await termin(1)];
    await bestaetigen(termine[0]!, [KATALOG.kg]);
    await bestaetigen(termine[1]!, [KATALOG.kg, KATALOG.hausbesuch]);
    await bestaetigen(termine[2]!, [KATALOG.kg]);

    // Terminzahl (BEF-096): drei durchgefuehrte Termine der Grundlage.
    const { rows: zahlen } = await asPostgres<{ used: number; prescribed: number }>(
      'select * from app.treatment_basis_slot_counts($1::uuid, $2::uuid)',
      [GRUNDLAGE, organizationId],
    );
    expect(zahlen[0]).toMatchObject({ used: 3, prescribed: 10 });

    // Heilmittelmenge (ANN-073): je Termin einmal Krankengymnastik.
    const { rows: menge } = await asPostgres<{ used_quantity: number }>(
      'select used_quantity from public.treatment_base_items where id = $1',
      [POSITION_KG],
    );
    expect(menge[0]!.used_quantity).toBe(3);

    // Rechnungsbetrag: eine Rechnung, dreimal das Terminhonorar.
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF_GRUNDLAGE, [
      GRUNDLAGE,
    ]);
    await asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id]);
    const blatt = await dokument(rows[0]!.id);

    expect(blatt.totals.total_cents).toBe(3 * 14000);
    expect(blatt.items).toHaveLength(4);
    expect(blatt.items.every((z) => z.session_fee)).toBe(true);
    const jeTag = new Map<string, number>();
    for (const z of blatt.items) {
      jeTag.set(z.performed_on, (jeTag.get(z.performed_on) ?? 0) + z.line_total_cents);
    }
    expect([...jeTag.values()]).toEqual([14000, 14000, 14000]);
    // Gewichte 4500 und 1800: 10000 und 4000 ohne Rest.
    expect(blatt.items.filter((z) => z.code === 'HB').map((z) => z.unit_price_cents)).toEqual([
      4000,
    ]);
  });

  it('fasst die Leistungen einer Verordnung ueber Monate in einem Kandidaten zusammen', async () => {
    await bestaetigen(await termin(40), [KATALOG.kg]);
    await bestaetigen(await termin(1), [KATALOG.kg]);
    await bestaetigen(await termin(2, null), [KATALOG.kg]);

    const liste = await kandidaten();
    const verordnung = liste.filter((k) => k.treatment_basis_id === GRUNDLAGE);
    expect(verordnung).toHaveLength(1);
    expect(verordnung[0]).toMatchObject({
      basis_kind: 'follow_up',
      service_count: 2,
      total_cents: 28000,
      has_draft: false,
    });
    expect(String(verordnung[0]!.basis_issued_on)).toContain('2026');
    expect(new Date(verordnung[0]!.first_performed_on).getTime()).toBeLessThan(
      new Date(verordnung[0]!.last_performed_on).getTime(),
    );

    // Ohne Grundlage: eine eigene Zeile nach Monat.
    const ohne = liste.filter((k) => k.patient_id === patients.erika && !k.treatment_basis_id);
    expect(ohne).toHaveLength(1);
    expect(ohne[0]!.service_count).toBe(1);
  });

  it('nimmt Leistungen einer Grundlage nicht in eine Monatsrechnung', async () => {
    await bestaetigen(await termin(1), [KATALOG.kg]);
    const { rows } = await asPostgres<{ monat: string }>(
      `select to_char(date_trunc('month', (now() at time zone 'Europe/Berlin')::date - 1), 'YYYY-MM-DD') as monat`,
    );
    await expect(
      asUserCommitted(users.office, ENTWURF_MONAT, [patients.erika, rows[0]!.monat]),
    ).rejects.toThrow(/no billable services/);
  });

  it('legt je Grundlage hoechstens einen Entwurf an und fuehrt dorthin', async () => {
    await bestaetigen(await termin(2), [KATALOG.kg]);
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF_GRUNDLAGE, [
      GRUNDLAGE,
    ]);
    await bestaetigen(await termin(1), [KATALOG.kg]);

    await expect(asUserCommitted(users.office, ENTWURF_GRUNDLAGE, [GRUNDLAGE])).rejects.toThrow(
      /already exists/,
    );
    const verordnung = (await kandidaten()).find((k) => k.treatment_basis_id === GRUNDLAGE)!;
    expect(verordnung).toMatchObject({ has_draft: true, draft_id: rows[0]!.id });
  });

  it('haelt Selbstzahler und Verordnung derselben Person auseinander', async () => {
    await bestaetigen(await termin(2), [KATALOG.kg]);
    await bestaetigen(await termin(1, SELBSTZAHLER), [KATALOG.kg]);
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF_GRUNDLAGE, [
      SELBSTZAHLER,
    ]);
    const blatt = await dokument(rows[0]!.id);
    expect(blatt.items).toHaveLength(1);
    expect(blatt.treatment_bases).toEqual([
      expect.objectContaining({ kind: 'self_pay', diagnosis_icd10: null }),
    ]);
  });

  it('traegt im Dokument Zeitraum, Grundlage und die Kennung des Honoraranteils', async () => {
    await bestaetigen(await termin(40), [KATALOG.kg]);
    await bestaetigen(await termin(1), [KATALOG.kg]);
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF_GRUNDLAGE, [
      GRUNDLAGE,
    ]);
    const blatt = await dokument(rows[0]!.id);
    expect(blatt.schema_version).toBe(5);
    expect(blatt.service_period.from < blatt.service_period.to).toBe(true);
    expect(blatt.treatment_bases).toHaveLength(1);
    expect(blatt.treatment_bases[0]!.issued_on).toBe('2026-09-08');

    const { rows: liste } = await asUser<{
      id: string;
      treatment_basis_id: string;
      basis_kind: string;
    }>(users.office, LISTE);
    expect(liste.find((r) => r.id === rows[0]!.id)).toMatchObject({
      treatment_basis_id: GRUNDLAGE,
      basis_kind: 'follow_up',
    });
  });

  it('stellt nicht aus, wenn ein Termin inzwischen auf einer anderen Grundlage liegt', async () => {
    const id = await termin(1);
    await bestaetigen(id, [KATALOG.kg]);
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF_GRUNDLAGE, [
      GRUNDLAGE,
    ]);
    await asPostgres('update public.appointments set treatment_basis_id = $1 where id = $2', [
      SELBSTZAHLER,
      id,
    ]);
    await expect(asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id])).rejects.toThrow(
      /do not belong to the treatment basis/,
    );
  });

  it('legt die Korrektur einer stornierten Rechnung wieder an ihre Grundlage', async () => {
    await bestaetigen(await termin(2), [KATALOG.kg]);
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF_GRUNDLAGE, [
      GRUNDLAGE,
    ]);
    await asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id]);
    await asUserCommitted(users.office, 'select public.cancel_invoice($1::uuid, $2::text)', [
      rows[0]!.id,
      'Empfaenger falsch',
    ]);
    const { rows: neu } = await asUserCommitted<{ id: string }>(
      users.office,
      'select public.create_correction_draft($1::uuid) as id',
      [rows[0]!.id],
    );
    const { rows: rechnung } = await asPostgres<{ treatment_basis_id: string }>(
      'select treatment_basis_id from public.invoices where id = $1',
      [neu[0]!.id],
    );
    expect(rechnung[0]!.treatment_basis_id).toBe(GRUNDLAGE);
    expect((await dokument(neu[0]!.id)).totals.total_cents).toBe(14000);
  });

  it('nimmt in die Korrektur einer Monatsrechnung keine Leistung mit Grundlage (Zweitreview)', async () => {
    // Im selben Monat: ein Termin ohne Grundlage, einer mit.
    await bestaetigen(await termin(2, null), [KATALOG.kg]);
    const { rows: monat } = await asPostgres<{ monat: string }>(
      `select to_char(date_trunc('month', (now() at time zone 'Europe/Berlin')::date - 2), 'YYYY-MM-DD') as monat`,
    );
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF_MONAT, [
      patients.erika,
      monat[0]!.monat,
    ]);
    await asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id]);
    await asUserCommitted(users.office, 'select public.cancel_invoice($1::uuid, $2::text)', [
      rows[0]!.id,
      'Empfaenger falsch',
    ]);
    await bestaetigen(await termin(2, GRUNDLAGE, 14), [KATALOG.kg]);

    const { rows: neu } = await asUserCommitted<{ id: string }>(
      users.office,
      'select public.create_correction_draft($1::uuid) as id',
      [rows[0]!.id],
    );
    expect((await dokument(neu[0]!.id)).items).toHaveLength(1);
    await asUserCommitted(users.office, AUSSTELLEN, [neu[0]!.id]);
    // Die Leistung mit Grundlage bleibt fuer ihre Verordnung abzurechnen.
    expect((await kandidaten()).filter((k) => k.treatment_basis_id === GRUNDLAGE)).toHaveLength(1);
  });

  it('laesst nur die Rollen der Abrechnung und nur die eigene Praxis anlegen', async () => {
    await bestaetigen(await termin(1), [KATALOG.kg]);
    for (const konto of [users.therapist, users.teamLead, users.trainer]) {
      await expect(asUserCommitted(konto, ENTWURF_GRUNDLAGE, [GRUNDLAGE])).rejects.toThrow(
        /not allowed/,
      );
    }
    const fremd = await fremdeOrganisation();
    await expect(asUserCommitted(fremd.owner, ENTWURF_GRUNDLAGE, [GRUNDLAGE])).rejects.toThrow(
      /not found/,
    );
  });
});

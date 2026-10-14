import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';

/**
 * Die Patientenliste mit Karteileichen und Zahlungsstand (B1, B10; BEF-151,
 * BEF-160) und die Rechnungen der Akte.
 *
 * Geprueft wird die Projektion, nicht nur der Inhalt: Kartei, Termine und
 * Grundlagen lesen die vier Praxisrollen, Rechnungen und Zahlungen nur owner
 * und office (ANN-139). Wer die Kartei nicht lesen darf, bekommt eine leere
 * Liste und einen Abweisungseintrag (G6b); eine fremde Praxis bleibt unsichtbar
 * (ADR-003). Versorgungsangaben stehen nicht in der Liste (R3-012).
 */

const { users, organizationId, patients } = SEED;

const UEBERSICHT = 'select public.list_patient_overview() as liste';
const RECHNUNGEN = 'select * from public.list_patient_invoices($1::uuid)';
const KONTINGENTE = 'select * from public.list_patient_treatment_basis_slots($1::uuid)';

/** Erika, Krankengymnastik, 10 Termine (supabase/seed.sql). */
const GRUNDLAGE = '88888888-8888-4888-8888-000000000004';

/** Eine eigene Akte ohne Seed-Rechnungen - fuer die Rechnungsfaelle. */
const PERSON_RITA = '44444444-4444-4444-8444-0000000000c1';
const RITA = '66666666-6666-4666-8666-0000000000c1';

type Eintrag = Record<string, unknown> & { id: string };

async function liste(konto: string): Promise<Eintrag[]> {
  const { rows } = await asUser<{ liste: Eintrag[] }>(konto, UEBERSICHT);
  return rows[0]!.liste;
}

async function eintrag(konto: string, id: string): Promise<Eintrag | undefined> {
  return (await liste(konto)).find((e) => e.id === id);
}

async function abweisungen(): Promise<number> {
  const { rows } = await asPostgres<{ anzahl: string }>(
    `select count(*)::text as anzahl from public.audit_log
      where action = 'access.denied' and context ->> 'operation' = 'patient_directory.read'`,
  );
  return Number(rows[0]!.anzahl);
}

/** Eine ausgestellte, ueberfaellige Rechnung ueber 45 Euro an Rita. */
async function ueberfaelligeRechnung(): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.invoices
       (organization_id, patient_id, period_month, service_area, created_by, status,
        invoice_number, issued_on, issued_at, issued_by, due_on, total_cents,
        tax_total_cents, currency, snapshot)
     values ($1, $2, date_trunc('month', current_date - 40)::date, 'therapy', $3, 'issued',
             'RG-UEB-' || left(gen_random_uuid()::text, 6), current_date - 40, now(), $3,
             current_date - 26, 4500, 0, 'EUR', jsonb_build_object('schema_version', 1))
     returning id`,
    [organizationId, RITA, users.office],
  );
  return rows[0]!.id;
}

describe('Patientenliste mit Karteileichen und Zahlungsstand (B1, B10)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await fremdeOrganisation();
    await asPostgres(
      `insert into public.persons (id, organization_id, given_name, family_name)
         values ($1, $2, 'Rita', 'Rechnung')`,
      [PERSON_RITA, organizationId],
    );
    await asPostgres(
      'insert into public.patients (id, organization_id, person_id) values ($1, $2, $3)',
      [RITA, organizationId, PERSON_RITA],
    );
  }, 120_000);

  it('zeigt den Praxisrollen jede Akte der Praxis - ohne Versorgungsangaben', async () => {
    for (const konto of [users.therapist, users.office, users.teamLead, users.ownerTherapist]) {
      const ids = (await liste(konto)).map((e) => e.id);
      expect(ids).toEqual(expect.arrayContaining([patients.max, patients.erika, patients.petra]));
    }
    const max = (await eintrag(users.therapist, patients.max))!;
    for (const feld of [
      'special_note',
      'home_visit_access_note',
      'remark',
      'street',
      'house_number',
      'primary_therapist_name',
      'institution',
      'phone_mobile',
      'care_concluded_on',
      'status',
    ]) {
      expect(max).not.toHaveProperty(feld);
    }
  });

  it('gibt Geld nur owner und office (ANN-139)', async () => {
    const therapeutin = (await eintrag(users.therapist, patients.erika))!;
    expect(therapeutin['billing_visible']).toBe(false);
    for (const feld of [
      'invoices_issued',
      'invoices_paid',
      'outstanding_cents',
      'invoices_overdue',
      'reminders_due',
    ]) {
      expect(therapeutin[feld]).toBeNull();
    }
    const buero = (await eintrag(users.office, patients.erika))!;
    expect(buero['billing_visible']).toBe(true);
    expect(typeof buero['invoices_issued']).toBe('number');
  });

  it('nennt Karteileichen: eine Verordnung ohne Termine, dann einen liegengebliebenen Termin', async () => {
    let erika = (await eintrag(users.therapist, patients.erika))!;
    expect(erika['bases_need_appointments']).toBeGreaterThanOrEqual(1);
    expect(erika['open_bases']).toBeGreaterThanOrEqual(1);
    const vorher = erika['bases_need_followup'] as number;

    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
         starts_at, ends_at, treatment_basis_id
       ) values ($1, $2, '55555555-5555-4555-8555-000000000002',
                 '33333333-3333-4333-8333-000000000001', 'practice', 'confirmed',
                 date_trunc('hour', now()) - interval '50 hours',
                 date_trunc('hour', now()) - interval '49 hours', $3)
       returning id`,
      [organizationId, patients.erika, GRUNDLAGE],
    );
    try {
      erika = (await eintrag(users.therapist, patients.erika))!;
      expect(erika['bases_need_followup']).toBe(vorher + 1);
      expect(erika['last_visit_on']).not.toBeNull();
    } finally {
      await asPostgres('delete from public.appointments where id = $1', [rows[0]!.id]);
    }
  });

  it('rechnet Offenes und zu Mahnendes nach ANN-516', async () => {
    const rechnung = await ueberfaelligeRechnung();

    let rita = (await eintrag(users.office, RITA))!;
    expect(rita).toMatchObject({
      invoices_issued: 1,
      invoices_paid: 0,
      outstanding_cents: 4500,
      invoices_overdue: 1,
      reminders_due: 1,
    });

    // Eine Zahlungserinnerung mit laufender Frist: nicht noch einmal mahnen.
    await asPostgres(
      `insert into public.invoice_payment_reminders
         (organization_id, invoice_id, reminder_on, due_on, outstanding_cents, currency, created_by)
       values ($1, $2, current_date - 2, current_date + 12, 4500, 'EUR', $3)`,
      [organizationId, rechnung, users.office],
    );
    rita = (await eintrag(users.office, RITA))!;
    expect(rita['invoices_overdue']).toBe(1);
    expect(rita['reminders_due']).toBe(0);

    const { rows } = await asUser<{
      invoice_number: string;
      outstanding_cents: number;
      overdue: boolean;
      reminder_due: boolean;
      last_reminder_on: string | null;
      payment_state: string;
    }>(users.office, RECHNUNGEN, [RITA]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outstanding_cents: 4500,
      overdue: true,
      reminder_due: false,
      payment_state: 'unpaid',
    });
    expect(rows[0]!.last_reminder_on).not.toBeNull();
  });

  it('gibt die Rechnungen einer Akte nur owner und office', async () => {
    const vorher = await asPostgres<{ anzahl: string }>(
      `select count(*)::text as anzahl from public.audit_log
        where action = 'access.denied' and context ->> 'operation' = 'invoicing.read'`,
    );
    const { rows } = await asUser(users.therapist, RECHNUNGEN, [RITA]);
    expect(rows).toEqual([]);
    const nachher = await asPostgres<{ anzahl: string }>(
      `select count(*)::text as anzahl from public.audit_log
        where action = 'access.denied' and context ->> 'operation' = 'invoicing.read'`,
    );
    expect(Number(nachher.rows[0]!.anzahl)).toBeGreaterThanOrEqual(Number(vorher.rows[0]!.anzahl));
    // Eine fremde Praxis sieht die Rechnungen dieser Akte nicht.
    const fremd = await fremdeOrganisation();
    const fremde = await asUser(fremd.owner, RECHNUNGEN, [RITA]);
    expect(fremde.rows).toEqual([]);
  });

  it('weist ab, wer die Kartei nicht lesen darf - mit leerer Liste und Eintrag (G6b)', async () => {
    const vorher = await abweisungen();
    // Committet: Der Abweisungseintrag soll den Aufruf ueberleben (G6b).
    for (const konto of [users.trainer, users.patientMax]) {
      const { rows } = await asUserCommitted<{ liste: Eintrag[] }>(konto, UEBERSICHT);
      expect(rows[0]!.liste).toEqual([]);
    }
    expect(await abweisungen()).toBeGreaterThan(vorher);
    // Ein Plattformkonto hat keine Praxis: abgewiesen, ohne Liste.
    await expect(asUser(users.plattformErika, UEBERSICHT)).rejects.toThrow(/not allowed/);
  });

  it('trennt die Praxen (ADR-003)', async () => {
    const fremd = await fremdeOrganisation();
    const eigene = (await liste(users.office)).map((e) => e.id);
    expect(eigene).not.toContain(fremd.patient);
    const fremde = (await liste(fremd.owner)).map((e) => e.id);
    expect(fremde).toEqual([fremd.patient]);
  });

  it('nennt in der Akte den Stand jeder Grundlage und ob sie freigegeben werden kann', async () => {
    const { rows } = await asUser<{
      treatment_basis_id: string;
      state: string;
      can_release: boolean;
      released_at: string | null;
    }>(users.therapist, KONTINGENTE, [patients.erika]);
    const grundlage = rows.find((r) => r.treatment_basis_id === GRUNDLAGE)!;
    expect(grundlage.state).toBe('termine_fehlen');
    expect(grundlage.can_release).toBe(false);
    expect(grundlage.released_at).toBeNull();
  });
});

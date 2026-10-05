import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Verordnungszähler und Abrechnungslage am Termin (PRX-008, ANN-139).
 *
 * Geprüft werden: die Position „n von m" nach derselben Reihenfolge wie die
 * Deckung, dass die Deckung aus der Position folgt, dass Empfänger und offene
 * Rechnungen nur owner und office erreichen, dass „offen" dasselbe heißt wie
 * in der Liste der offenen Posten, und die Abweisungen.
 */

const { users, organizationId, patients } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
/** Erika, Folgeverordnung: 10 Termine, 0 genutzt (supabase/seed.sql). */
const GRUNDLAGE = '88888888-8888-4888-8888-000000000004';
/** Erika, Selbstzahler: 8 Termine (supabase/seed.sql). */
const SELBSTZAHLER = '88888888-8888-4888-8888-000000000005';
const KG = 'cccccccc-cccc-4ccc-8ccc-000000000001';

const LAGE = 'select * from public.get_appointment_billing_context($1::uuid)';

interface Lage {
  treatment_basis_kind: string | null;
  basis_position: number | null;
  basis_appointment_count: number | null;
  billing_visible: boolean;
  recipient_kind: string | null;
  open_invoice_count: number | null;
  open_outstanding_cents: number | null;
  open_overdue: boolean | null;
}

/** Ein Termin `stunde` Stunden nach Monatsanfang (Praxiszeit), wie in payments.test.ts. */
async function termin(
  stunde: number,
  opts: { status?: string; grundlage?: string | null; kind?: 'therapy' | 'internal' } = {},
): Promise<string> {
  const status = opts.status ?? 'confirmed';
  const kind = opts.kind ?? 'therapy';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
       starts_at, ends_at, treatment_basis_id, completed_at, completed_by,
       cancelled_at, cancelled_by, cancellation_reason, kind, title, event_group_id
     ) values (
       $1, $2, $3, $4, 'practice', $5,
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $6::int)) at time zone 'Europe/Berlin',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $6::int + 1)) at time zone 'Europe/Berlin',
       $7,
       case when $5 in ('completed', 'documented') then now() end,
       case when $5 in ('completed', 'documented') then $8::uuid end,
       case when $5 = 'cancelled' then now() end,
       case when $5 = 'cancelled' then $8::uuid end,
       case when $5 = 'cancelled' then 'practice_request' end,
       $9,
       case when $9 = 'internal' then 'Teambesprechung' end,
       case when $9 = 'internal' then gen_random_uuid() end
     ) returning id`,
    [
      organizationId,
      kind === 'therapy' ? patients.erika : null,
      ANNA,
      LOCATION,
      status,
      stunde,
      kind === 'therapy' ? (opts.grundlage === undefined ? GRUNDLAGE : opts.grundlage) : null,
      users.ownerTherapist,
      kind,
    ],
  );
  return rows[0]!.id;
}

async function lage(userId: string, id: string): Promise<Lage> {
  const { rows } = await asUser<Lage>(userId, LAGE, [id]);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

/** Eine ausgestellte Rechnung über eine Leistung an einem eigenen, dokumentierten Termin. */
async function ausgestellteRechnung(): Promise<{ id: string; betrag: number }> {
  const id = await termin(30, { status: 'documented' });
  await asUserCommitted(
    users.office,
    'select public.record_billable_services($1::uuid, $2::jsonb)',
    [id, JSON.stringify([{ catalog_item_id: KG, quantity: 1 }])],
  );
  // ABR-032: Die Rechnung fasst die Leistungen ihrer Grundlage zusammen.
  const { rows } = await asUserCommitted<{ id: string }>(
    users.office,
    'select public.create_invoice_draft_for_basis($1::uuid) as id',
    [GRUNDLAGE],
  );
  const rechnung = rows[0]!.id;
  await asUserCommitted(users.office, 'select public.issue_invoice($1::uuid)', [rechnung]);
  const { rows: betrag } = await asPostgres<{ total_cents: number }>(
    'select total_cents from public.invoices where id = $1',
    [rechnung],
  );
  return { id: rechnung, betrag: betrag[0]!.total_cents };
}

describe('Verordnungszähler am Termin (PRX-008)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('zählt nach Beginn, ohne Absagen - „Termin n von m"', async () => {
    const erster = await termin(30);
    const abgesagt = await termin(40, { status: 'cancelled' });
    const zweiter = await termin(50);
    const dritter = await termin(60);

    expect((await lage(users.therapist, erster)).basis_position).toBe(1);
    expect((await lage(users.therapist, zweiter)).basis_position).toBe(2);
    const drei = await lage(users.therapist, dritter);
    expect(drei.basis_position).toBe(3);
    expect(drei.basis_appointment_count).toBe(10);
    expect(drei.treatment_basis_kind).toBe('follow_up');
    // Eine Absage hat keine Position.
    expect((await lage(users.therapist, abgesagt)).basis_position).toBeNull();
  });

  it('leitet die Deckung aus derselben Position ab', async () => {
    // Selbstzahler mit acht Terminen: der neunte ist nicht gedeckt.
    const ids: string[] = [];
    for (let i = 0; i < 9; i += 1) ids.push(await termin(30 + i * 2, { grundlage: SELBSTZAHLER }));
    const { rows } = await asPostgres<{ id: string; gedeckt: boolean; position: number }>(
      `select id, app.appointment_is_covered(id) as gedeckt,
              app.appointment_basis_position(id) as position
         from public.appointments where id = any($1::uuid[])`,
      [ids],
    );
    const neunter = rows.find((r) => r.id === ids[8])!;
    const achter = rows.find((r) => r.id === ids[7])!;
    expect([achter.position, achter.gedeckt]).toEqual([8, true]);
    expect([neunter.position, neunter.gedeckt]).toEqual([9, false]);
  });

  it('kommt ohne Grundlage aus', async () => {
    const id = await termin(30, { grundlage: null });
    const ohne = await lage(users.office, id);
    expect(ohne.basis_position).toBeNull();
    expect(ohne.basis_appointment_count).toBeNull();
    expect(ohne.treatment_basis_kind).toBeNull();
  });
});

describe('Abrechnungslage am Termin (PRX-008, ANN-139)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('nennt owner und office den Empfänger - ohne Standardempfänger die Person selbst', async () => {
    const id = await termin(80);
    expect((await lage(users.office, id)).recipient_kind).toBe('self');

    await asPostgres(
      `insert into public.invoice_recipients (organization_id, patient_id, recipient_kind, name, is_default)
       values ($1, $2, 'aid_authority', 'Beihilfestelle Synthetisch', true)`,
      [organizationId, patients.erika],
    );
    const mitBeihilfe = await lage(users.ownerTherapist, id);
    expect(mitBeihilfe.billing_visible).toBe(true);
    expect(mitBeihilfe.recipient_kind).toBe('aid_authority');
  });

  it('zählt offene Rechnungen wie die offenen Posten', async () => {
    const id = await termin(80);
    expect(await lage(users.office, id)).toMatchObject({
      open_invoice_count: 0,
      open_outstanding_cents: 0,
      open_overdue: false,
    });

    const rechnung = await ausgestellteRechnung();
    expect(await lage(users.office, id)).toMatchObject({
      open_invoice_count: 1,
      open_outstanding_cents: rechnung.betrag,
    });
    const { rows: posten } = await asUser<{ id: string; outstanding_cents: number }>(
      users.office,
      'select id, outstanding_cents from public.list_open_items(100)',
    );
    expect(posten).toEqual([{ id: rechnung.id, outstanding_cents: rechnung.betrag }]);

    // Voll bezahlt ist sie nicht mehr offen - hier wie dort.
    await asUserCommitted(
      users.office,
      `select public.record_payment($1::uuid, $2::int, (now() at time zone 'Europe/Berlin')::date,
                                   'bank_transfer', 'incoming', null)`,
      [rechnung.id, rechnung.betrag],
    );
    expect((await lage(users.office, id)).open_invoice_count).toBe(0);
    const { rows: danach } = await asUser(
      users.office,
      'select id from public.list_open_items(100)',
    );
    expect(danach).toEqual([]);
  });

  it('lässt Empfänger und offene Rechnungen für Behandelnde leer', async () => {
    const id = await termin(80);
    await ausgestellteRechnung();
    for (const konto of [users.therapist, users.teamLead]) {
      const sicht = await lage(konto, id);
      expect(sicht.billing_visible).toBe(false);
      expect(sicht.recipient_kind).toBeNull();
      expect(sicht.open_invoice_count).toBeNull();
      expect(sicht.open_outstanding_cents).toBeNull();
      expect(sicht.open_overdue).toBeNull();
      // Die Planungsangaben bleiben.
      expect(sicht.basis_appointment_count).toBe(10);
    }
  });

  it('weist Trainingsbetreuung und Patientenkonto protokolliert ab', async () => {
    const id = await termin(80);
    await erwarteAbgewiesenenLeseversuch(users.trainer, LAGE, [id], 'appointments.read');
    await erwarteAbgewiesenenLeseversuch(users.patientErika, LAGE, [id], 'appointments.read');
  });

  it('gibt es nur am Behandlungstermin', async () => {
    const fehlzeit = await termin(80, { kind: 'internal' });
    await expect(asUser(users.office, LAGE, [fehlzeit])).rejects.toThrow(/only for treatment/);
  });

  it('liefert nichts zu einem Termin einer fremden Organisation', async () => {
    const f = await fremdeOrganisation();
    const { rows: fremd } = await asPostgres<{ id: string }>(
      `insert into public.appointments (organization_id, patient_id, staff_member_id,
         appointment_type, status, starts_at, ends_at)
       values ($1, $2, $3, 'video', 'confirmed', now() + interval '1 day',
               now() + interval '1 day 1 hour') returning id`,
      [f.organizationId, f.patient, f.staffMember],
    );
    const { rows } = await asUser(users.office, LAGE, [fremd[0]!.id]);
    expect(rows).toEqual([]);
  });

  it('lässt die offene Regel für keine Anwendungsrolle direkt aufrufen', async () => {
    const { rows } = await asPostgres<{ darf: boolean }>(
      `select has_function_privilege('authenticated', 'app.open_invoices(uuid)', 'execute') as darf`,
    );
    expect(rows[0]!.darf).toBe(false);
  });

  it('behandelt einen Trainingstermin für die Therapeutin wie einen unbekannten (Zweitreview)', async () => {
    const { rows: training } = await asPostgres<{ id: string }>(
      `insert into public.appointments (organization_id, training_relationship_id, staff_member_id,
         location_id, appointment_type, status, starts_at, ends_at, kind)
       values ($1, $2, $3, $4, 'practice', 'confirmed', now() + interval '2 days',
               now() + interval '2 days 1 hour', 'training') returning id`,
      [organizationId, SEED.trainingRelationships.erika, ANNA, LOCATION],
    );
    const { rows } = await asUser(users.therapist, LAGE, [training[0]!.id]);
    expect(rows).toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
  tagInTagen,
} from './helpers/db';

/**
 * Termin ändern oder absagen als Wunsch (POR-010, DSN-001 D4, ANN-247).
 *
 * Nur am eigenen bestätigten, künftigen Termin, höchstens ein offener Wunsch
 * je Termin. Die Frist des Ausfallhonorars rechnet der Server und liefert sie
 * mit den Terminen (`late_notice`), die Oberfläche zeigt nur den Hinweis.
 */

const { users, platformAccesses, patients, organizationId, trainingRelationships } = SEED;
const AENDERN = `select public.request_platform_appointment_change(
  $1::uuid, $2::uuid, $3, $4::date[], $5::text[], $6) as id`;
const TERMINE = 'select * from public.platform_appointments($1::uuid)';

const ERIKA = platformAccesses.erikaBehandlung;
const MORGEN = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000009f1';
const IN_DREI_TAGEN = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000009f2';
// Max' Termin in drei Tagen - der Seed-Termin von heute 16:00 Uhr waere nachmittags vorbei.
const MAX_IN_DREI_TAGEN = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000009f3';

/** Zwei bestaetigte kuenftige Hausbesuche fuer Erika: in 20 Stunden und in drei Tagen. */
async function kuenftigeTermine() {
  await asPostgres(
    `insert into public.appointments
       (id, organization_id, kind, patient_id, staff_member_id, appointment_type, status,
        starts_at, ends_at, visit_street, visit_house_number, visit_postal_code, visit_city, created_by)
     values
       ($1, $3, 'therapy', $4, '55555555-5555-4555-8555-000000000002', 'home_visit', 'confirmed',
        now() + interval '20 hours', now() + interval '21 hours', 'Testweg', '7', '72072', 'Tuebingen', $5),
       ($2, $3, 'therapy', $4, '55555555-5555-4555-8555-000000000002', 'home_visit', 'confirmed',
        now() + interval '3 days', now() + interval '3 days 1 hour', 'Testweg', '7', '72072', 'Tuebingen', $5),
       ($6, $3, 'therapy', $7, '55555555-5555-4555-8555-000000000002', 'home_visit', 'confirmed',
        now() + interval '3 days 2 hours', now() + interval '3 days 3 hours', 'Testweg', '7', '72072', 'Tuebingen', $5)`,
    [
      MORGEN,
      IN_DREI_TAGEN,
      organizationId,
      patients.erika,
      users.office,
      MAX_IN_DREI_TAGEN,
      patients.max,
    ],
  );
}

interface Zeile {
  id: string;
  late_notice: boolean | null;
  open_request_kind: string | null;
}

describe('request_platform_appointment_change (POR-010)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await kuenftigeTermine();
  }, 120_000);

  it('rechnet die Frist am Server: unter 24 Stunden ist spaet, drei Tage nicht', async () => {
    const { rows } = await asUser<Zeile>(users.plattformErika, TERMINE, [ERIKA]);
    const morgen = rows.find((z) => z.id === MORGEN)!;
    const spaeter = rows.find((z) => z.id === IN_DREI_TAGEN)!;
    expect(morgen.late_notice).toBe(true);
    expect(spaeter.late_notice).toBe(false);
    // Vergangene und abgeschlossene Termine tragen keine Frist.
    const heute = rows.find((z) => z.id === 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002')!;
    expect(heute.late_notice).toBeNull();
  });

  it('legt einen Absagewunsch an und zeigt ihn am Termin', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.plattformErika, AENDERN, [
      ERIKA,
      IN_DREI_TAGEN,
      'cancel',
      [],
      [],
      'Ich bin verreist.',
    ]);
    const wunsch = await asPostgres<{
      kind: string;
      appointment_id: string;
      preferred_days: unknown[];
      note: string;
      created_by_access_id: string;
    }>(
      `select kind, appointment_id, preferred_days, note, created_by_access_id
          from public.platform_appointment_requests where id = $1`,
      [rows[0]!.id],
    );
    expect(wunsch.rows[0]).toEqual({
      kind: 'cancel',
      appointment_id: IN_DREI_TAGEN,
      preferred_days: [],
      note: 'Ich bin verreist.',
      created_by_access_id: ERIKA,
    });
    const termine = await asUser<Zeile>(users.plattformErika, TERMINE, [ERIKA]);
    expect(termine.rows.find((z) => z.id === IN_DREI_TAGEN)!.open_request_kind).toBe('cancel');
    // Der Termin selbst ist unveraendert: ein Wunsch, keine Absage (8, D4).
    const termin = await asPostgres<{ status: string; cancellation_received_at: string | null }>(
      `select status, cancellation_received_at from public.appointments where id = $1`,
      [IN_DREI_TAGEN],
    );
    expect(termin.rows[0]).toEqual({ status: 'confirmed', cancellation_received_at: null });
  });

  it('legt einen Aenderungswunsch mit Tagen an, hoechstens einen offenen je Termin', async () => {
    await asUserCommitted(users.plattformErika, AENDERN, [
      ERIKA,
      IN_DREI_TAGEN,
      'change',
      [tagInTagen(7), tagInTagen(8)],
      ['morning'],
      null,
    ]);
    const zweiter = await abgefangen(
      asUser(users.plattformErika, AENDERN, [ERIKA, IN_DREI_TAGEN, 'cancel', [], [], null]),
    );
    expect(zweiter?.message).toContain('request already open');
    // Nach dem Zurueckziehen geht ein neuer Wunsch.
    await asPostgres(
      `update public.platform_appointment_requests set status = 'withdrawn', resolved_at = now()
        where appointment_id = $1`,
      [IN_DREI_TAGEN],
    );
    const dritter = await asUser<{ id: string }>(users.plattformErika, AENDERN, [
      ERIKA,
      IN_DREI_TAGEN,
      'cancel',
      [],
      [],
      null,
    ]);
    expect(dritter.rows[0]!.id).toBeTruthy();
  });

  it('weist fremde, vergangene, abgesagte Termine und falsche Eingaben ab', async () => {
    // Max' Termin ueber Erikas Zugang: nicht gefunden.
    const fremd = await abgefangen(
      asUser(users.plattformErika, AENDERN, [
        ERIKA,
        'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        'cancel',
        [],
        [],
        null,
      ]),
    );
    expect(fremd?.message).toContain('not found');
    // Erikas heutiger, schon durchgefuehrter Termin.
    const vorbei = await abgefangen(
      asUser(users.plattformErika, AENDERN, [
        ERIKA,
        'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
        'cancel',
        [],
        [],
        null,
      ]),
    );
    expect(vorbei?.message).toMatch(/not confirmed|has started/);
    const art = await abgefangen(
      asUser(users.plattformErika, AENDERN, [ERIKA, IN_DREI_TAGEN, 'move', [], [], null]),
    );
    expect(art?.message).toContain('unknown request kind');
    const tag = await abgefangen(
      asUser(users.plattformErika, AENDERN, [
        ERIKA,
        IN_DREI_TAGEN,
        'change',
        [tagInTagen(-2)],
        [],
        null,
      ]),
    );
    expect(tag?.message).toContain('day out of range');
  });

  it('fremde Person, Begleitung ohne Zugang, gesperrt, Praxiskonto: abgewiesen', async () => {
    const tina = await abgefangen(
      asUser(users.plattformTina, AENDERN, [ERIKA, IN_DREI_TAGEN, 'cancel', [], [], null]),
    );
    expect(tina?.message).toContain('not allowed');
    // Paula begleitet Max, nicht Erika: ueber ihren Zugang ist Erikas Termin fremd.
    const paula = await abgefangen(
      asUser(users.plattformPaula, AENDERN, [
        platformAccesses.paulaBegleitungMax,
        IN_DREI_TAGEN,
        'cancel',
        [],
        [],
        null,
      ]),
    );
    expect(paula?.message).toContain('not found');
    const praxis = await abgefangen(
      asUser(users.office, AENDERN, [ERIKA, IN_DREI_TAGEN, 'cancel', [], [], null]),
    );
    expect(praxis?.message).toContain('not allowed');
    await asPostgres(
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      [ERIKA],
    );
    const gesperrt = await abgefangen(
      asUser(users.plattformErika, AENDERN, [ERIKA, IN_DREI_TAGEN, 'cancel', [], [], null]),
    );
    expect(gesperrt?.message).toContain('not allowed');
  });

  it('in der Lesefrist weder Aenderung noch Absage als Wunsch; keine Zeile (ANN-807)', async () => {
    await asPostgres(
      `update public.patients
          set care_concluded_on = current_date - 2, care_concluded_at = now(),
              care_concluded_by = $2::uuid
        where id = $1`,
      [patients.erika, users.therapist],
    );
    for (const art of ['change', 'cancel']) {
      const fehler = await abgefangen(
        asUser(users.plattformErika, AENDERN, [
          ERIKA,
          IN_DREI_TAGEN,
          art,
          art === 'change' ? [tagInTagen(5)] : [],
          art === 'change' ? ['morning'] : [],
          null,
        ]),
      );
      expect((fehler as { code?: string } | null)?.code, art).toBe('42501');
    }
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.platform_appointment_requests where appointment_id = $1',
      [IN_DREI_TAGEN],
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('entzogen, abgelaufene Lesefrist, andere Organisation, ohne Anmeldung: abgewiesen', async () => {
    // Festgeschrieben: Ginge ein Versuch durch, stünde er in der Zählung am Ende.
    const absage = [ERIKA, IN_DREI_TAGEN, 'cancel', [], [], null];
    const als = (konto: string | null) =>
      abgefangen(
        konto === null ? asUser(null, AENDERN, absage) : asUserCommitted(konto, AENDERN, absage),
      );
    const fremd = await fremdeOrganisation();
    expect((await als(fremd.owner))?.message).toContain('not allowed');
    expect(await als(null)).not.toBeNull();
    await asPostgres(
      `update public.patients
          set care_concluded_on = current_date - 40, care_concluded_at = now(),
              care_concluded_by = $2::uuid
        where id = $1`,
      [patients.erika, users.therapist],
    );
    expect((await als(users.plattformErika))?.message).toContain('not allowed');
    // Zurück in der Versorgung, damit „entzogen“ aus eigenem Grund scheitert.
    await asPostgres(
      `update public.patients set care_concluded_on = null, care_concluded_at = null,
              care_concluded_by = null where id = $1`,
      [patients.erika],
    );
    expect(await abgefangen(asUser(users.plattformErika, AENDERN, absage))).toBeNull();
    await asPostgres(
      `update public.platform_accesses
          set status = 'revoked', revoked_at = now(), revoked_reason = 'practice'
        where id = $1`,
      [ERIKA],
    );
    expect((await als(users.plattformErika))?.message).toContain('not allowed');
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.platform_appointment_requests',
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('eingeladen, noch ohne Konto: abgewiesen, keine Zeile', async () => {
    await asPostgres(
      `update public.platform_accesses set status = 'invited', account_user_id = null where id = $1`,
      [ERIKA],
    );
    const fehler = await abgefangen(
      asUserCommitted(users.plattformErika, AENDERN, [
        ERIKA,
        IN_DREI_TAGEN,
        'cancel',
        [],
        [],
        null,
      ]),
    );
    expect(fehler?.message).toContain('not allowed');
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.platform_appointment_requests',
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('der Trainingstermin derselben Person ist ueber den Behandlungszugang fremd (4.8)', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments
         (organization_id, kind, training_relationship_id, staff_member_id, location_id,
          appointment_type, status, starts_at, ends_at, created_by)
       values ($1, 'training', $2, '55555555-5555-4555-8555-000000000002',
               (select id from public.locations where organization_id = $1 limit 1),
               'practice', 'confirmed', now() + interval '4 days', now() + interval '4 days 1 hour', $3)
       returning id`,
      [organizationId, trainingRelationships.erika, users.office],
    );
    const fremd = await abgefangen(
      asUser(users.plattformErika, AENDERN, [ERIKA, rows[0]!.id, 'cancel', [], [], null]),
    );
    expect(fremd?.message).toContain('not found');
  });

  it('Begleitung darf fuer die Person absagen wollen; der Aufruf steht im Protokoll', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.plattformPaula, AENDERN, [
      platformAccesses.paulaBegleitungMax,
      MAX_IN_DREI_TAGEN,
      'cancel',
      [],
      [],
      null,
    ]);
    expect(rows[0]!.id).toBeTruthy();
    const protokoll = await asPostgres(
      `select 1 from public.audit_log
        where action = 'platform_representation.read' and context ->> 'view' = 'request_cancel'`,
    );
    expect(protokoll.rows).toHaveLength(1);
  });
});

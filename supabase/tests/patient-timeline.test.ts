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
 * Zeitstrahl und Sitzungsvorbereitung (ANN-847, ANN-848): Gruppen je Rolle, kein Wortlaut, Protokoll
 * als Öffnen der Akte, Abweisungen nach ADR-013 Punkt 9 Nr. 1.
 */

const { users, patients, organizationId } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const KG = 'cccccccc-cccc-4ccc-8ccc-000000000001';
/** Erikas eigener Plattformzugang (supabase/seed.sql). */
const ZUGANG_ERIKA = 'cafecafe-cafe-4afe-8afe-000000000002';

const ZEITSTRAHL = 'select public.get_patient_timeline($1::uuid) as z';
const FENSTER = 'select public.get_patient_timeline($1::uuid, $2::date, $3::int) as z';
const VORBEREITUNG = 'select public.get_session_preparation($1::uuid) as v';

interface Eintrag {
  on: string;
  at: string | null;
  kind: string;
  state: string | null;
  label: string | null;
  detail: string | null;
  ref: string | null;
}

interface Zeitstrahl {
  today: string;
  from: string;
  to: string | null;
  has_more: boolean;
  entries: Eintrag[];
}

interface Vorbereitung {
  today: string;
  last_session_on: string | null;
  next_appointment: { id: string; starts_at: string } | null;
  open_messages: { id: string; topic: string; due_on: string; overdue: boolean }[] | null;
  checkin_due_on: string | null;
  plans_review: { id: string; title: string; runs_until: string }[] | null;
  documentation_open: { id: string; starts_at: string; note_status: string }[] | null;
  goals: { treatment_basis_id: string; text: string }[] | null;
}

async function termin(
  tage: number,
  status = 'confirmed',
  patient: string = patients.erika,
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
       starts_at, ends_at, completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', $5,
       date_trunc('hour', now()) + make_interval(days => $6::int),
       date_trunc('hour', now()) + make_interval(days => $6::int, hours => 1),
       case when $5 in ('completed', 'documented') then now() end,
       case when $5 in ('completed', 'documented') then $7::uuid end
     ) returning id`,
    [organizationId, patient, ANNA, LOCATION, status, tage, users.therapist],
  );
  return rows[0]!.id;
}

async function eintrag(
  terminId: string,
  inhalt: string,
  status: 'draft' | 'final' = 'final',
  nachtragZu: string | null = null,
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.treatment_notes
       (organization_id, appointment_id, status, content, created_by, updated_by,
        addendum_to_note_id, finalized_at, finalized_by, finalisation_kind)
     values ($1, $2, $3, $4, $5, $5, $6,
             case when $3 = 'final' then now() end,
             case when $3 = 'final' then $5::uuid end,
             case when $3 = 'final' then 'manual' end)
     returning id`,
    [organizationId, terminId, status, inhalt, users.therapist, nachtragZu],
  );
  return rows[0]!.id;
}

async function zeitstrahl(userId: string, patient: string = patients.erika) {
  const { rows } = await asUser<{ z: Zeitstrahl | null }>(userId, ZEITSTRAHL, [patient]);
  return rows[0]!.z;
}

async function vorbereitung(userId: string, patient: string = patients.erika) {
  const { rows } = await asUser<{ v: Vorbereitung | null }>(userId, VORBEREITUNG, [patient]);
  return rows[0]!.v;
}

function arten(z: Zeitstrahl | null): string[] {
  return [...new Set((z?.entries ?? []).map((e) => e.kind))].sort();
}

/** Eine ausgestellte Rechnung über eine Leistung an einem Termin dieses Monats, wie bei den Stornos. */
async function ausgestellteRechnung(): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
       starts_at, ends_at, completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', 'documented',
       (date_trunc('month', now() at time zone 'Europe/Berlin') + interval '30 hours')
         at time zone 'Europe/Berlin',
       (date_trunc('month', now() at time zone 'Europe/Berlin') + interval '31 hours')
         at time zone 'Europe/Berlin',
       now(), $5
     ) returning id`,
    [organizationId, patients.erika, ANNA, LOCATION, users.ownerTherapist],
  );
  await asUserCommitted(
    users.ownerTherapist,
    'select public.record_billable_services($1::uuid, $2::jsonb)',
    [rows[0]!.id, JSON.stringify([{ catalog_item_id: KG, quantity: 1 }])],
  );
  const { rows: monat } = await asPostgres<{ m: string }>(
    `select to_char(date_trunc('month', (now() at time zone 'Europe/Berlin')::date), 'YYYY-MM-DD') as m`,
  );
  const { rows: entwurf } = await asUserCommitted<{ id: string }>(
    users.office,
    'select public.create_invoice_draft($1::uuid, $2::date) as id',
    [patients.erika, monat[0]!.m],
  );
  await asUserCommitted(users.office, 'select public.issue_invoice($1::uuid)', [entwurf[0]!.id]);
  return entwurf[0]!.id;
}

describe('Zeitstrahl einer Person (ORG-001)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('führt Termine, Doku-Stand, Nachträge, Grundlagen, Pläne und Rückfragen zusammen', async () => {
    const vorher = await termin(-7, 'documented');
    const morgen = await termin(1);
    const haupt = await eintrag(vorher, 'Synthetisch: Kniebeuge angeleitet.');
    await eintrag(vorher, 'Synthetisch: Nachtrag zur Kniebeuge.', 'final', haupt);

    const z = await zeitstrahl(users.therapist);
    expect(z).not.toBeNull();
    const kinds = arten(z);
    for (const art of ['appointment', 'addendum', 'treatment_basis', 'message']) {
      expect(kinds).toContain(art);
    }
    const t = z!.entries.find((e) => e.kind === 'appointment' && e.ref === vorher)!;
    expect(t).toMatchObject({ state: 'documented', label: 'practice', detail: 'final' });
    // Ohne p_before ist das Fenster nach vorn offen: Der Termin von morgen steht oben.
    expect(z!.to).toBeNull();
    expect(z!.entries[0]!.ref).toBe(morgen);
    // Neueste zuerst.
    const tage = z!.entries.map((e) => e.on);
    expect([...tage].sort().reverse()).toEqual(tage);
  });

  it('liefert keinen Wortlaut der Doku, keine Nachricht und keine Diagnose', async () => {
    const vorher = await termin(-3, 'documented');
    await eintrag(vorher, 'Synthetisch: geheimer Wortlaut der Doku.');
    const z = await zeitstrahl(users.office);
    const text = JSON.stringify(z);
    expect(text).not.toContain('geheimer Wortlaut');
    expect(text).not.toContain('Synthetisch: Versp'); // Diagnose der Grundlage
    expect(text).not.toContain('total_cents');
  });

  it('Rechnungen nur für die Abrechnung: office ja, Therapie nein, ohne Betrag', async () => {
    const rechnung = await ausgestellteRechnung();
    const office = await zeitstrahl(users.office);
    const r = office!.entries.find((e) => e.kind === 'invoice');
    expect(r).toMatchObject({ ref: rechnung, state: 'issued' });
    expect(r!.label).toBeTruthy();
    expect(Object.keys(r!).sort()).toEqual(
      ['at', 'detail', 'kind', 'label', 'on', 'ref', 'state'].sort(),
    );

    expect(arten(await zeitstrahl(users.therapist))).not.toContain('invoice');
    expect(arten(await zeitstrahl(users.teamLead))).not.toContain('invoice');
  });

  it('zeigt Einheiten, Check-ins und Planwechsel des Heimprogramms', async () => {
    const plan = 'aeaeaeae-aeae-4eae-8eae-000000000001';
    // Der Seed hat das Heimprogramm vor 37 Tagen zugewiesen, es endet in fünf Tagen.
    await asPostgres(
      `insert into public.exercise_plan_sessions
         (organization_id, plan_id, performed_on, started_at, finished_at, platform_access_id,
          platform_access_kind, recorded_by, finished_access_id, finished_access_kind, finished_by)
       values ($1, $2, current_date - 2, now() - interval '2 days',
               now() - interval '2 days' + interval '20 minutes', $3, 'self', $4, $3, 'self', $4)`,
      [organizationId, plan, ZUGANG_ERIKA, users.plattformErika],
    );
    await asPostgres(
      `insert into public.checkins
         (organization_id, relationship_kind, relationship_id, patient_id, answered_on,
          recorded_at, platform_access_id, platform_access_kind, recorded_by)
       values ($1, 'treatment', $2, $2, current_date - 1, now() - interval '1 day', $3, 'self', $4)`,
      [organizationId, patients.erika, ZUGANG_ERIKA, users.plattformErika],
    );
    const kinds = arten(await zeitstrahl(users.office));
    expect(kinds).toEqual(expect.arrayContaining(['session', 'checkin', 'plan_assigned']));
  });

  it('blättert in Fenstern zurück und sagt, ob davor noch etwas kommt', async () => {
    await termin(-200, 'documented');
    await termin(-5, 'documented');
    const { rows: heute } = await asPostgres<{ t: string }>(
      `select to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD') as t`,
    );
    const { rows } = await asUser<{ z: Zeitstrahl }>(users.therapist, FENSTER, [
      patients.erika,
      heute[0]!.t,
      30,
    ]);
    const z = rows[0]!.z;
    expect(z.to).toBe(heute[0]!.t);
    expect(z.entries.filter((e) => e.kind === 'appointment')).toHaveLength(1);
    expect(z.has_more).toBe(true);

    await expect(
      asUser(users.therapist, FENSTER, [patients.erika, heute[0]!.t, 2]),
    ).rejects.toMatchObject({ code: '22023' });
  });

  it('protokolliert als Öffnen der Akte, einmal am Tag, ohne Freitext', async () => {
    const vorher = await termin(-3, 'documented');
    await eintrag(vorher, 'Synthetisch: Freitext.');
    await asUserCommitted(users.office, ZEITSTRAHL, [patients.erika]);
    await asUserCommitted(users.office, ZEITSTRAHL, [patients.erika]);
    const { rows } = await asPostgres<{ subject_id: string; context: Record<string, unknown> }>(
      `select subject_id, context from public.audit_log
        where action = 'patient_record.viewed' and actor_user_id = $1`,
      [users.office],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subject_id).toBe(patients.erika);
    expect(JSON.stringify(rows)).not.toContain('Synthetisch');
  });

  it('weist Trainingsbetreuung und Patientenkonto ab, mit Protokoll', async () => {
    await erwarteAbgewiesenenLeseversuch(
      users.trainer,
      `select z from (${ZEITSTRAHL}) x where z is not null`,
      [patients.erika],
      'patient_timeline.read',
    );
    await erwarteAbgewiesenenLeseversuch(
      users.patientMax,
      `select z from (${ZEITSTRAHL}) x where z is not null`,
      [patients.max],
      'patient_timeline.read',
    );
  });

  it('fremde Person: ein Plattformkonto sieht keinen Zeitstrahl, auch nicht den eigenen', async () => {
    // Ein Plattformkonto hat keine Organisation: Die Abweisung bricht ab, ausgeliefert wird nichts.
    for (const patient of [patients.max, patients.erika]) {
      await expect(zeitstrahl(users.plattformErika, patient)).rejects.toMatchObject({
        code: '42501',
      });
    }
  });

  it('andere Organisation: null, nichts ausgeliefert', async () => {
    const fremd = await fremdeOrganisation();
    expect(await zeitstrahl(fremd.owner, patients.erika)).toBeNull();
    expect(await zeitstrahl(users.office, fremd.patient)).toBeNull();
  });
});

describe('Sitzungsvorbereitung (ORG-003)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('nennt letzte Behandlung, nächsten Termin, offene Rückfragen und Doku ohne Festschreiben', async () => {
    await termin(-14, 'documented');
    const letzte = await termin(-3, 'completed');
    await eintrag(letzte, 'Synthetisch: Entwurf.', 'draft');
    const offen = await termin(-1, 'confirmed');
    const naechster = await termin(2);

    const v = await vorbereitung(users.therapist);
    expect(v!.last_session_on).not.toBeNull();
    expect(v!.next_appointment!.id).toBe(naechster);
    expect(v!.documentation_open!.map((d) => d.id)).toEqual([letzte, offen]);
    expect(v!.documentation_open![0]!.note_status).toBe('draft');
    // Erika: eine offene Beschwerde aus dem Seed, die beantwortete zählt nicht.
    expect(v!.open_messages!.map((m) => m.topic)).toEqual(['complaint']);
    expect(v!.goals!.length).toBeGreaterThan(0);
  });

  it('nennt Check-in und Wiedervorlage als Fälligkeit, ohne Werte', async () => {
    const plan = 'aeaeaeae-aeae-4eae-8eae-000000000001';
    // Der Seed hat das Heimprogramm vor 37 Tagen zugewiesen, es endet in fünf Tagen.
    await asPostgres(
      `insert into public.checkin_schedules
         (organization_id, relationship_kind, relationship_id, patient_id, interval_days,
          parameter_keys, starts_on, created_by, updated_by)
       values ($1, 'treatment', $2, $2, 7, array['pain_rest'], current_date - 10, $3, $3)`,
      [organizationId, patients.erika, users.therapist],
    );
    const v = await vorbereitung(users.office);
    expect(v!.checkin_due_on).not.toBeNull();
    expect(v!.plans_review!.map((p) => p.id)).toEqual([plan]);
  });

  it('protokolliert als Öffnen der Akte und weist ab wie der Zeitstrahl', async () => {
    await asUserCommitted(users.teamLead, VORBEREITUNG, [patients.erika]);
    const { rows } = await asPostgres(
      `select 1 from public.audit_log
        where action = 'patient_record.viewed' and actor_user_id = $1 and subject_id = $2`,
      [users.teamLead, patients.erika],
    );
    expect(rows).toHaveLength(1);

    await erwarteAbgewiesenenLeseversuch(
      users.trainer,
      `select v from (${VORBEREITUNG}) x where v is not null`,
      [patients.erika],
      'session_preparation.read',
    );
    await erwarteAbgewiesenenLeseversuch(
      users.patientMax,
      `select v from (${VORBEREITUNG}) x where v is not null`,
      [patients.max],
      'session_preparation.read',
    );
    await expect(vorbereitung(users.plattformErika, patients.erika)).rejects.toMatchObject({
      code: '42501',
    });
    const fremd = await fremdeOrganisation();
    expect(await vorbereitung(fremd.owner, patients.erika)).toBeNull();
    expect(await vorbereitung(users.therapist, fremd.patient)).toBeNull();
  });
});

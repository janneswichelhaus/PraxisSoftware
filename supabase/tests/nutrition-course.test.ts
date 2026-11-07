import { beforeAll, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Verlauf für die Beratung (ADR-027 Punkte 4, 11, 13; ANN-846): Mittel, Gewicht, Sitzungen und
 * Planwechsel allein für die Fähigkeit „Ernährungsberatung“; alle übrigen Rollen lesen nichts.
 */

const { users, patients } = SEED;
const PROFIL = 'f0f0f0f0-f0f0-4f0f-8f0f-000000000001';
const LESEN = 'select public.get_nutrition_course($1::uuid) as v';
const TAGEBUCH = 'select public.get_nutrition_diary($1::uuid, null) as d';
const JANNES = '55555555-5555-4555-8555-000000000001';
const STANDORT = '33333333-3333-4333-8333-000000000001';

interface Spanne {
  from: string;
  to: string;
  days: number;
  food_days: number;
  water_days: number;
  energy_kcal: number | null;
  protein_g: number | null;
  water_ml: number | null;
}

interface Verlauf {
  today: string;
  started_on: string;
  last_session_on: string | null;
  next_session_on: string | null;
  target_weight_kg: number | null;
  targets: { energy_kcal: number; water_ml: number } | null;
  period: Spanne;
  weeks: (Spanne & { week_start: string })[];
  weights: { measured_on: string; weight_kg: number }[];
  sessions: string[];
  plan_events: { occurred_on: string; kind: string; title: string }[];
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function tagPlus(tage: number): Promise<string> {
  const { rows } = await asPostgres<{ t: string }>(
    `select (app.training_today($1) + $2::int)::text as t`,
    [SEED.organizationId, tage],
  );
  return rows[0]!.t;
}

/** Ein Beratungstermin an Erikas Akte, an einem Tag relativ zu heute (Kalender der Praxis). */
async function beratungstermin(tage: number, status: 'completed' | 'confirmed' | 'cancelled') {
  await asPostgres(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
       starts_at, ends_at, completed_at, completed_by, cancelled_at, cancelled_by, occasion)
     select $1, $2, $3, $4, 'practice', $5,
            ((app.training_today($1) + $6::int) + time '15:00') at time zone 'Europe/Berlin',
            ((app.training_today($1) + $6::int) + time '15:45') at time zone 'Europe/Berlin',
            case when $5 = 'completed' then now() end,
            case when $5 = 'completed' then $7::uuid end,
            case when $5 = 'cancelled' then now() end,
            case when $5 = 'cancelled' then $7::uuid end,
            'nutrition_counselling'`,
    [SEED.organizationId, patients.erika, JANNES, STANDORT, status, tage, users.ownerTherapist],
  );
}

async function verlauf(konto: string = users.ownerTherapist): Promise<Verlauf | null> {
  const { rows } = await asUser<{ v: Verlauf | null }>(konto, LESEN, [PROFIL]);
  return rows[0]!.v;
}

describe('Verlauf der Ernährungsberatung (ANN-846)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  it('ohne Sitzung: Mittel seit dem Beginn über die Tage mit Eintrag, neben den Zielwerten', async () => {
    const v = (await verlauf())!;
    expect(v.last_session_on).toBeNull();
    expect(v.next_session_on).toBeNull();
    expect(v.period.from).toBe(v.started_on);
    expect(v.period.to).toBe(v.today);
    // Seed: Einträge heute und gestern, Wasser 500 und 1500 ml, Beginn vor 21 Tagen.
    expect(v.period).toMatchObject({ days: 22, food_days: 2, water_days: 2, water_ml: 1000 });
    const { rows } = await asUser<{
      d: { days: { totals: { energy_kcal: number } }[] };
    }>(users.ownerTherapist, TAGEBUCH, [PROFIL]);
    const [heute, gestern] = rows[0]!.d.days;
    const mittel = (heute!.totals.energy_kcal + gestern!.totals.energy_kcal) / 2;
    expect(Math.abs(v.period.energy_kcal! - mittel)).toBeLessThanOrEqual(1);
    expect(v.targets?.energy_kcal).toBeGreaterThan(0);
    expect(v.target_weight_kg).toBe(68);
  });

  it('je Kalenderwoche ab Montag, die jüngste zuerst, nicht vor dem Beginn', async () => {
    const v = (await verlauf())!;
    expect(v.weeks.length).toBeGreaterThanOrEqual(3);
    expect(v.weeks.length).toBeLessThanOrEqual(12);
    const erste = v.weeks[0]!;
    expect(new Date(`${erste.week_start}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(erste.to).toBe(v.today);
    const letzte = v.weeks.at(-1)!;
    expect(letzte.from).toBe(v.started_on);
    for (const w of v.weeks) expect(w.days).toBeLessThanOrEqual(7);
    expect(v.weeks.reduce((n, w) => n + w.food_days, 0)).toBe(2);
    expect(v.weeks.reduce((n, w) => n + w.days, 0)).toBe(22);
    // Eine Woche ohne Eintrag hat kein Mittel, keine Null.
    const leer = v.weeks.find((w) => w.food_days === 0)!;
    expect(leer.energy_kcal).toBeNull();
  });

  it('Gewicht, Planwechsel; protokolliert wie das Öffnen der Akte', async () => {
    const { rows } = await asUserCommitted<{ v: Verlauf }>(users.ownerTherapist, LESEN, [PROFIL]);
    const v = rows[0]!.v;
    expect(v.weights.map((g) => g.weight_kg)).toEqual([74.6, 74.1, 73.5]);
    expect(v.plan_events).toContainEqual(
      expect.objectContaining({ kind: 'plan_assigned', title: 'Zwei Tage zum Ausprobieren' }),
    );
    const { rows: protokoll } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.audit_log
        where action = 'patient_record.viewed' and subject_id = $1
          and context ->> 'view' = 'nutrition'`,
      [patients.erika],
    );
    expect(protokoll[0]!.n).toBe(1);
  });

  it('mit Sitzungen: Zeitraum ab dem Tag nach der letzten, nächster bestätigter Termin', async () => {
    await beratungstermin(-15, 'completed');
    await beratungstermin(-8, 'completed');
    // Abgesagt zählt nicht als Sitzung.
    await beratungstermin(-4, 'cancelled');
    await beratungstermin(3, 'confirmed');
    const v = (await verlauf())!;
    expect(v.last_session_on).toBe(await tagPlus(-8));
    expect(v.period.from).toBe(await tagPlus(-7));
    expect(v.period.days).toBe(8);
    expect(v.sessions).toEqual([await tagPlus(-15), await tagPlus(-8)]);
    expect(v.next_session_on).toBe(await tagPlus(3));
  });

  it('Büro, Therapie, Teamleitung, Trainingsbetreuung, fremde Organisation, Person: nichts', async () => {
    for (const konto of [
      users.office,
      users.therapist,
      users.teamLead,
      users.trainer,
      users.patientMax,
    ]) {
      expect(await verlauf(konto), konto).toBeNull();
    }
    expect(await verlauf(FREMDE_ORGANISATION.owner)).toBeNull();
    // Ein unbekanntes Profil verhält sich wie ein fremdes.
    const { rows } = await asUser<{ v: unknown }>(users.ownerTherapist, LESEN, [
      'f0f0f0f0-f0f0-4f0f-8f0f-0000000000ff',
    ]);
    expect(rows[0]!.v).toBeNull();
    // Ein Konto der Plattform und eines ohne Sitzung werden abgewiesen, bevor etwas gelesen wird.
    expect(await fehler(asUser(users.plattformErika, LESEN, [PROFIL]))).toBe('42501');
    expect(await fehler(asUser(null, LESEN, [PROFIL]))).toBe('42501');

    await asUserCommitted(users.office, LESEN, [PROFIL]);
    const { rows: protokoll } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.audit_log
        where action = 'access.denied' and actor_user_id = $1
          and context ->> 'operation' = 'nutrition.read'`,
      [users.office],
    );
    expect(protokoll[0]!.n).toBeGreaterThanOrEqual(1);
  });

  it('am Trainingsverhältnis: Sitzungen nur des Trainings, protokolliert als dessen Öffnen', async () => {
    const { rows: neu } = await asPostgres<{ id: string }>(
      `insert into public.nutrition_profiles
         (organization_id, relationship_kind, relationship_id, training_relationship_id, started_on,
          height_cm, formula_sex, activity_pal, goal, created_by, updated_by)
       values ($1, 'training', $2, $2, app.training_today($1) - 10, 170, 'female', 1.6, 'maintain',
               $3, $3)
       returning id`,
      [SEED.organizationId, SEED.trainingRelationships.tina, users.ownerTherapist],
    );
    const profil = neu[0]!.id;
    await asPostgres(
      `insert into public.appointments (
         organization_id, kind, training_relationship_id, staff_member_id, location_id,
         appointment_type, status, starts_at, ends_at, completed_at, completed_by, occasion)
       select $1, 'training', $2, $3, $4, 'practice', 'completed',
              ((app.training_today($1) - 3) + time '15:00') at time zone 'Europe/Berlin',
              ((app.training_today($1) - 3) + time '15:45') at time zone 'Europe/Berlin',
              now(), $5, 'nutrition_counselling'`,
      [
        SEED.organizationId,
        SEED.trainingRelationships.tina,
        JANNES,
        STANDORT,
        users.ownerTherapist,
      ],
    );
    const { rows } = await asUserCommitted<{ v: Verlauf }>(users.ownerTherapist, LESEN, [profil]);
    const v = rows[0]!.v;
    // Erikas Beratungen an der Akte gehören nicht hierher.
    expect(v.sessions).toEqual([await tagPlus(-3)]);
    expect(v.last_session_on).toBe(await tagPlus(-3));
    expect(v.weights).toEqual([]);
    const { rows: protokoll } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.audit_log
        where action = 'training_relationship.viewed' and subject_id = $1
          and context ->> 'view' = 'nutrition'`,
      [SEED.trainingRelationships.tina],
    );
    expect(protokoll[0]!.n).toBe(1);
    // Das Konto der Kundin liest nichts.
    expect(await fehler(asUser(users.plattformTina, LESEN, [profil]))).toBe('42501');
  });

  it('nicht für anon ausführbar, search_path leer', async () => {
    const { rows } = await asPostgres<{ sec: boolean; cfg: string[]; anon: boolean }>(
      `select p.prosecdef as sec, p.proconfig as cfg,
              has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'get_nutrition_course'`,
    );
    expect(rows[0]).toMatchObject({ sec: true, anon: false });
    expect(rows[0]!.cfg).toContain('search_path=""');
    // Der Baustein ohne Rechteprüfung ist für niemanden direkt aufrufbar.
    const { rows: baustein } = await asPostgres<{ auth: boolean; sec: boolean }>(
      `select has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosecdef as sec
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname = 'nutrition_course_span'`,
    );
    expect(baustein[0]).toEqual({ auth: false, sec: false });
  });
});

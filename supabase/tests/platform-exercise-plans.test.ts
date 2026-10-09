import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  planeEntfernen,
  resetDatabase,
} from './helpers/db';
import { praxistag, zugewiesenerPlan } from './helpers/plaene';

/**
 * Der Plan im Portal (UEB-009, DSN-001 4.1 und 5, ADR-023 Punkte 19, 22, 23, 24).
 *
 * Die Projektion zeigt die zugewiesenen Pläne des Verhältnisses hinter einem
 * lesbaren Zugang, sonst den zuletzt beendeten (ANN-304) - als Schnappschuss
 * in Alltagssprache mit fester Schlüsselliste. Jeder Negativfall aus Punkt 23
 * bekommt dieselbe Antwort: nichts.
 */

const { users, platformAccesses, patients, trainingRelationships } = SEED;
const PLAENE = 'select public.platform_exercise_plans($1::uuid) as daten';

interface Daten {
  today: string;
  plans: {
    id: string;
    title: string;
    status: string;
    service_area: string;
    items: Record<string, unknown>[];
  }[];
}

async function plaene(konto: string | null, zugang: string): Promise<Daten | null> {
  return (await asUser<{ daten: Daten | null }>(konto, PLAENE, [zugang])).rows[0]!.daten;
}

describe('platform_exercise_plans (UEB-009)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
    await asPostgres('delete from public.audit_log');
  });

  it('zeigt den zugewiesenen Plan als Schnappschuss mit fester Schlüsselliste', async () => {
    const plan = await zugewiesenerPlan();
    const daten = await plaene(users.plattformErika, platformAccesses.erikaBehandlung);
    expect(daten!.plans.map((p) => p.id)).toEqual([plan]);
    expect(Object.keys(daten!.plans[0]!).sort()).toEqual([
      'assigned_on',
      // UEB-011: Tage wählen, auch vor dem Beginn.
      'can_choose_days',
      // UEB-010: ob heute geübt werden darf, die offene Einheit, die letzten Tage.
      'can_exercise',
      'ended_on',
      'id',
      'items',
      'note_allowed',
      'open_session',
      'recent_sessions',
      'runs_from',
      'runs_until',
      'service_area',
      'sessions_per_week',
      'status',
      'title',
      // UEB-011: die gewählten Übungstage.
      'weekdays',
    ]);
    // Keine fachlichen Namen, keine Kennung der Bibliothek, kein Schritt.
    expect(Object.keys(daten!.plans[0]!.items[0]!).sort()).toEqual([
      'double_progression',
      'duration_seconds',
      'equipment',
      'id',
      'instruction',
      'load',
      'note',
      'position',
      'reps_max',
      'reps_min',
      'rest_seconds',
      'sets',
      'tempo',
      'variant_lay_name',
    ]);
    expect(daten!.plans[0]!.items[0]).toMatchObject({ note: 'Langsam', sets: 3 });
  });

  it('zeigt keinen Entwurf und keine abgelöste Fassung', async () => {
    await asUserCommitted(
      users.therapist,
      "select public.create_exercise_plan('therapy', $1::uuid, 'Entwurf')",
      [patients.erika],
    );
    expect((await plaene(users.plattformErika, platformAccesses.erikaBehandlung))!.plans).toEqual(
      [],
    );

    const alt = await zugewiesenerPlan();
    const { rows } = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.create_exercise_plan_version($1::uuid) as id',
      [alt],
    );
    await asUserCommitted(
      users.therapist,
      'select public.assign_exercise_plan($1::uuid, $2::date)',
      [rows[0]!.id, await praxistag(42)],
    );
    const daten = await plaene(users.plattformErika, platformAccesses.erikaBehandlung);
    expect(daten!.plans.map((p) => p.id)).toEqual([rows[0]!.id]);
  });

  it('zeigt ohne laufenden Plan den zuletzt beendeten (ANN-304)', async () => {
    const erster = await zugewiesenerPlan('therapy', patients.erika, 'Erster');
    await asUserCommitted(users.therapist, 'select public.end_exercise_plan($1::uuid)', [erster]);
    const zweiter = await zugewiesenerPlan('therapy', patients.erika, 'Zweiter');
    await asUserCommitted(users.therapist, 'select public.end_exercise_plan($1::uuid)', [zweiter]);
    const daten = await plaene(users.plattformErika, platformAccesses.erikaBehandlung);
    expect(daten!.plans.map((p) => [p.id, p.status])).toEqual([[zweiter, 'ended']]);
    // Läuft wieder einer, verschwindet der beendete.
    const dritter = await zugewiesenerPlan('therapy', patients.erika, 'Dritter');
    const neu = await plaene(users.plattformErika, platformAccesses.erikaBehandlung);
    expect(neu!.plans.map((p) => p.id)).toEqual([dritter]);
  });

  it('trennt Behandlung und Training (4.8)', async () => {
    const behandlung = await zugewiesenerPlan();
    const training = await zugewiesenerPlan('training', trainingRelationships.erika);
    expect(
      (await plaene(users.plattformErika, platformAccesses.erikaBehandlung))!.plans.map(
        (p) => p.id,
      ),
    ).toEqual([behandlung]);
    expect(
      (await plaene(users.plattformErika, platformAccesses.erikaTraining))!.plans.map((p) => p.id),
    ).toEqual([training]);
    // Tina sieht Erikas Trainingsplan nicht.
    expect((await plaene(users.plattformTina, platformAccesses.tinaTraining))!.plans).toEqual([]);
  });

  it('Begleitung liest mit und wird protokolliert, die Person selbst nicht (Punkt 24)', async () => {
    const plan = await zugewiesenerPlan('therapy', patients.max);
    const paula = await asUserCommitted<{ daten: Daten }>(users.plattformPaula, PLAENE, [
      platformAccesses.paulaBegleitungMax,
    ]);
    expect(paula.rows[0]!.daten.plans.map((p) => p.id)).toEqual([plan]);
    await zugewiesenerPlan();
    await asUserCommitted(users.plattformErika, PLAENE, [platformAccesses.erikaBehandlung]);
    const { rows } = await asPostgres<{ actor_user_id: string }>(
      `select actor_user_id from public.audit_log
        where action = 'platform_representation.read' and context ->> 'view' = 'exercise_plans'`,
    );
    expect(rows.map((r) => r.actor_user_id)).toEqual([users.plattformPaula]);
  });

  it('fremde Person, Praxiskonto, andere Organisation, ohne Anmeldung: nichts', async () => {
    await zugewiesenerPlan();
    expect(await plaene(users.plattformTina, platformAccesses.erikaBehandlung)).toBeNull();
    expect(await plaene(users.therapist, platformAccesses.erikaBehandlung)).toBeNull();
    const fremd = await fremdeOrganisation();
    expect(await plaene(fremd.owner, platformAccesses.erikaBehandlung)).toBeNull();
    expect(await plaene(null, platformAccesses.erikaBehandlung)).toBeNull();
  });

  it('gesperrt, entzogen, abgelaufene Lesefrist: nichts (Punkt 18, D2)', async () => {
    await zugewiesenerPlan();
    try {
      await asPostgres(
        `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
        [platformAccesses.erikaBehandlung],
      );
      expect(await plaene(users.plattformErika, platformAccesses.erikaBehandlung)).toBeNull();
      await asPostgres(
        `update public.platform_accesses
            set status = 'revoked', locked_at = null, revoked_at = now(), revoked_reason = 'practice'
          where id = $1`,
        [platformAccesses.paulaBegleitungMax],
      );
      await zugewiesenerPlan('therapy', patients.max);
      expect(await plaene(users.plattformPaula, platformAccesses.paulaBegleitungMax)).toBeNull();
      await asPostgres(
        `update public.platform_accesses set status = 'active', locked_at = null where id = $1`,
        [platformAccesses.erikaBehandlung],
      );
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 40, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      expect(await plaene(users.plattformErika, platformAccesses.erikaBehandlung)).toBeNull();
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });
});

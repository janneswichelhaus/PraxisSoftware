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
import {
  RUDERN_GELB,
  KNIEBEUGE_GELAENDER,
  einheitErfassen,
  positionen,
  zugewiesenerPlan,
} from './helpers/plaene';

/**
 * Was Plattform und Praxis von den Einheiten sehen; erfasst wird wie auf dem Gerät über die
 * Übertragung, deren Prüfungen in `platform-exercise-sync.test.ts` stehen.
 */

const { users, platformAccesses, patients, trainingRelationships, organizationId } = SEED;

const PLAENE = 'select public.platform_exercise_plans($1::uuid) as daten';
const PLAN = 'select public.get_exercise_plan($1::uuid) as plan';

interface PortalPlan {
  id: string;
  can_exercise: boolean;
  note_allowed: boolean;
  open_session: { id: string; sets: { item_id: string; set_number: number }[] } | null;
  recent_sessions: { performed_on: string; finished: boolean }[];
}

async function portal(konto: string, zugang: string): Promise<PortalPlan[]> {
  const { rows } = await asUser<{ daten: { plans: PortalPlan[] } | null }>(konto, PLAENE, [zugang]);
  return rows[0]!.daten?.plans ?? [];
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };

/** Eine beendete Einheit mit einem Satz an Erikas Plan. */
async function beendet(plan: string, note = '', values: object = {}): Promise<string> {
  const [position] = await positionen(plan);
  const { session_id } = await einheitErfassen(erika.konto, erika.zugang, plan, {
    saetze: [[position!, 1]],
    ende: { note, values },
  });
  return session_id;
}

describe('Einheiten am Plan (UEB-010)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
    await asPostgres('delete from public.audit_log');
  });

  it('zeigt der Plattform die offene Einheit und danach die beendete (ANN-305)', async () => {
    const plan = await zugewiesenerPlan('therapy', patients.erika, 'Knie', [
      KNIEBEUGE_GELAENDER,
      RUDERN_GELB,
    ]);
    const [erste] = await positionen(plan);
    const { session_id: einheit } = await einheitErfassen(erika.konto, erika.zugang, plan, {
      saetze: [
        [erste!, 1],
        [erste!, 2],
      ],
    });
    const [p] = await portal(erika.konto, erika.zugang);
    expect(p!.can_exercise).toBe(true);
    expect(p!.open_session).toEqual({
      id: einheit,
      sets: [
        { item_id: erste, set_number: 1 },
        { item_id: erste, set_number: 2 },
      ],
    });

    await einheitErfassen(erika.konto, erika.zugang, plan, { einheit, ende: { note: 'Knie' } });
    const [danach] = await portal(erika.konto, erika.zugang);
    expect(danach!.open_session).toBeNull();
    expect(danach!.recent_sessions).toEqual([
      { performed_on: expect.any(String) as unknown, finished: true },
    ]);
  });

  it('nur am laufenden Plan des eigenen Verhältnisses (Punkt 19, 4.8)', async () => {
    const maxPlan = await zugewiesenerPlan('therapy', patients.max, 'Max');
    const [maxPosition] = await positionen(maxPlan);
    const satz = { saetze: [[maxPosition!, 1]] as [string, number][] };
    expect(await fehler(einheitErfassen(erika.konto, erika.zugang, maxPlan, satz))).toBe('P0002');
    // Der Trainingsplan derselben Person nicht über den Behandlungszugang.
    const training = await zugewiesenerPlan('training', trainingRelationships.erika, 'Training');
    const [trainingPosition] = await positionen(training);
    expect(
      await fehler(
        einheitErfassen(erika.konto, erika.zugang, training, { saetze: [[trainingPosition!, 1]] }),
      ),
    ).toBe('P0002');
    // Ein beendeter Plan: auf der Plattform ohne Erfassen.
    const plan = await zugewiesenerPlan();
    await asUserCommitted(users.therapist, 'select public.end_exercise_plan($1::uuid)', [plan]);
    const beendeterPlan = (await portal(erika.konto, erika.zugang)).find((p) => p.id === plan);
    expect(beendeterPlan!.can_exercise).toBe(false);
  });

  it('Begleitung liest, erfasst aber nicht (ANN-306)', async () => {
    await zugewiesenerPlan('therapy', patients.max, 'Max');
    const [p] = await portal(users.plattformPaula, platformAccesses.paulaBegleitungMax);
    expect(p!.can_exercise).toBe(false);
  });

  it('im Training „schwierig, weil …" nur mit Einwilligung (ADR-021 Punkt 4)', async () => {
    await zugewiesenerPlan('training', trainingRelationships.tina, 'Tina');
    const tina = { konto: users.plattformTina, zugang: platformAccesses.tinaTraining };
    await asPostgres(
      'delete from public.training_consent_records where training_relationship_id = $1',
      [trainingRelationships.tina],
    );
    expect((await portal(tina.konto, tina.zugang))[0]!.note_allowed).toBe(false);
    await asPostgres(
      `insert into public.training_consent_records
         (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by)
       values ($1, $2, 'consent_granted', 'training_health_data', current_date, $3)`,
      [organizationId, trainingRelationships.tina, users.trainer],
    );
    expect((await portal(tina.konto, tina.zugang))[0]!.note_allowed).toBe(true);
  });

  it('nennt der Praxis die abgehakten Sätze je Übung; eine ausgelassene fehlt (OUT-003)', async () => {
    const plan = await zugewiesenerPlan('therapy', patients.erika, 'Knie', [
      KNIEBEUGE_GELAENDER,
      RUDERN_GELB,
    ]);
    const [erste, zweite] = await positionen(plan);
    await einheitErfassen(erika.konto, erika.zugang, plan, {
      saetze: [
        [erste!, 1],
        [erste!, 2],
        [erste!, 3],
      ],
      ende: {},
    });
    const { rows } = await asUser<{
      plan: { sessions: { sets_done: number; sets_by_item: Record<string, number> }[] };
    }>(users.therapist, PLAN, [plan]);
    expect(rows[0]!.plan.sessions[0]).toMatchObject({
      sets_done: 3,
      sets_by_item: { [erste!]: 3 },
    });
    expect(rows[0]!.plan.sessions[0]!.sets_by_item).not.toHaveProperty(zweite!);
  });

  it('die Praxis liest die Einheiten mit dem Plan, dieselben Rollen (ANN-298)', async () => {
    const plan = await zugewiesenerPlan();
    await beendet(plan, 'Knie');

    for (const konto of [users.therapist, users.office, users.ownerTherapist, users.teamLead]) {
      const { rows } = await asUser<{ plan: { sessions: Record<string, unknown>[] } }>(
        konto,
        PLAN,
        [plan],
      );
      expect(rows[0]!.plan.sessions).toEqual([
        expect.objectContaining({
          sets_done: 1,
          sets_total: 3,
          difficulty_note: 'Knie',
          recorded_by_kind: 'self',
        }),
      ]);
    }
    // Die Trainingsbetreuung liest keinen Behandlungsplan (4.8).
    const { rows } = await asUser<{ plan: unknown }>(users.trainer, PLAN, [plan]);
    expect(rows[0]!.plan).toBeNull();
    // Kein Tabellenrecht (ADR-004): direkt liest niemand.
    expect(
      await fehler(asUser(users.therapist, 'select * from public.exercise_plan_sessions')),
    ).toBe('42501');
  });

  it('steht in der Auskunft am Plan (Art. 15)', async () => {
    const plan = await zugewiesenerPlan();
    await beendet(plan, 'Knie');
    const { rows } = await asUser<{
      daten: { tabellen: { exercise_plans: { sessions: Record<string, unknown>[] }[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.erika,
    ]);
    const sessions = rows[0]!.daten.tabellen.exercise_plans[0]!.sessions;
    expect(sessions).toEqual([expect.objectContaining({ difficulty_note: 'Knie' })]);
    expect(sessions[0]).not.toHaveProperty('id');
  });

  it('hält fest, wer beendet hat (ADR-010 Fassung 3, Zweitreview)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const { session_id: einheit } = await einheitErfassen(erika.konto, erika.zugang, plan, {
      saetze: [[position!, 1]],
    });
    // Als hätte die rechtliche Vertretung begonnen: Die Person selbst beendet.
    await asPostgres(
      `update public.exercise_plan_sessions set platform_access_kind = 'legal_representative'
        where id = $1`,
      [einheit],
    );
    await einheitErfassen(erika.konto, erika.zugang, plan, { einheit, ende: { note: 'Knie' } });
    const { rows } = await asUser<{ plan: { sessions: Record<string, unknown>[] } }>(
      users.therapist,
      PLAN,
      [plan],
    );
    expect(rows[0]!.plan.sessions[0]).toMatchObject({
      recorded_by_kind: 'legal_representative',
      finished_by_kind: 'self',
    });
    const stempel = await asPostgres<{ finished_by: string; finished_access_id: string }>(
      'select finished_by, finished_access_id from public.exercise_plan_sessions where id = $1',
      [einheit],
    );
    expect(stempel.rows[0]).toEqual({
      finished_by: users.plattformErika,
      finished_access_id: erika.zugang,
    });
  });

  it('entzogen: nichts kommt an (Punkt 18)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    try {
      await asPostgres(
        `update public.platform_accesses
            set status = 'revoked', revoked_at = now(), revoked_reason = 'practice'
          where id = $1`,
        [erika.zugang],
      );
      expect(
        await fehler(
          einheitErfassen(erika.konto, erika.zugang, plan, { saetze: [[position!, 1]] }),
        ),
      ).toBe('42501');
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('steht im Export der Plattform, wie die Plattform ihn zeigt (POR-018)', async () => {
    const plan = await zugewiesenerPlan();
    await beendet(plan, 'Rücken zwickt');
    const { rows } = await asUser<{
      daten: { exercise_plans: { id: string; recent_sessions: unknown[] }[] };
    }>(erika.konto, 'select public.platform_export($1::uuid) as daten', [erika.zugang]);
    expect(rows[0]!.daten.exercise_plans.map((p) => p.id)).toEqual([plan]);
    expect(rows[0]!.daten.exercise_plans[0]!.recent_sessions).toHaveLength(1);
    // Der Freitext steht nicht auf der Plattform, also auch nicht im Export.
    expect(JSON.stringify(rows[0]!.daten.exercise_plans)).not.toContain('Rücken zwickt');
  });

  it('fällt mit dem Plan und der Akte (ADR-008)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    await einheitErfassen(erika.konto, erika.zugang, plan, { saetze: [[position!, 1]] });
    try {
      // Der echte Löschlauf der Akte, nicht das Entfernen im Test.
      await asPostgres(
        'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
        [patients.erika],
      );
      const { rows } = await asPostgres<{ n: number }>(
        `select (select count(*) from public.exercise_plan_sessions)
              + (select count(*) from public.exercise_plan_session_sets) as n`,
      );
      expect(Number(rows[0]!.n)).toBe(0);
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('nimmt Angaben zur Einheit an und zeigt sie der Praxis unverändert (TRK-001)', async () => {
    const plan = await zugewiesenerPlan();
    await beendet(plan, '', { session_exertion: 7, session_pain: 0 });
    const { rows } = await asUser<{ plan: { sessions: { values: Record<string, number> }[] } }>(
      users.office,
      PLAN,
      [plan],
    );
    expect(rows[0]!.plan.sessions[0]!.values).toEqual({ session_exertion: 7, session_pain: 0 });

    // In der Auskunft stehen sie an der Einheit (Art. 15).
    const auskunft = await asUser<{
      daten: { tabellen: { exercise_plans: { sessions: { values: unknown }[] }[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.erika,
    ]);
    expect(auskunft.rows[0]!.daten.tabellen.exercise_plans[0]!.sessions[0]!.values).toEqual({
      session_exertion: 7,
      session_pain: 0,
    });
  });

  it('nimmt die Bewegungssicherheit nach der Einheit an (TRK-004, IDEA-TRK-003)', async () => {
    const plan = await zugewiesenerPlan();
    await beendet(plan, '', { session_pain: 2, session_confidence: 4 });
    const { rows } = await asUser<{ plan: { sessions: { values: Record<string, number> }[] } }>(
      users.office,
      PLAN,
      [plan],
    );
    expect(rows[0]!.plan.sessions[0]!.values).toEqual({ session_pain: 2, session_confidence: 4 });
  });

  it('ohne Angabe bleibt sie leer; null heißt nicht beantwortet (IDEA-TRK-002)', async () => {
    const plan = await zugewiesenerPlan();
    const einheit = await beendet(plan, '', { session_exertion: null, session_pain: 4 });
    const { rows } = await asPostgres<{ parameter_key: string; value: number }>(
      'select parameter_key, value from public.exercise_plan_session_values where session_id = $1',
      [einheit],
    );
    expect(rows).toEqual([{ parameter_key: 'session_pain', value: 4 }]);
  });

  it('ein falscher Wert legt nichts an (22023)', async () => {
    const plan = await zugewiesenerPlan();
    for (const werte of [
      { session_pain: 11 },
      { session_pain: -1 },
      { session_pain: 2.5 },
      { session_pain: '3' },
      { pain_rest: 3 },
      { unbekannt: 1 },
      [3],
    ]) {
      expect(await fehler(beendet(plan, '', werte))).toBe('22023');
    }
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.exercise_plan_sessions where plan_id = $1',
      [plan],
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('kein Tabellenrecht auf die Angaben (ADR-004)', async () => {
    expect(
      await fehler(asUser(users.therapist, 'select * from public.exercise_plan_session_values')),
    ).toBe('42501');
  });

  it('in der Lesefrist wird nicht mehr erfasst (ANN-305), gelesen schon', async () => {
    const plan = await zugewiesenerPlan();
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 2, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      const [p] = await portal(erika.konto, erika.zugang);
      expect(p!.id).toBe(plan);
      expect(p!.can_exercise).toBe(false);
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });
});

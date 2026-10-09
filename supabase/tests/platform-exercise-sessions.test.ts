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
import { RUDERN_GELB, KNIEBEUGE_GELAENDER, positionen, zugewiesenerPlan } from './helpers/plaene';

/**
 * Die Durchführungsansicht (UEB-010, IDEA-ORG-003, DSN-001 4.1).
 *
 *   * Jeder Haken wird sofort gespeichert; eine heute begonnene Einheit geht
 *     weiter (ANN-305).
 *   * Erfassen darf die Person selbst und ihre rechtliche Vertretung, nicht
 *     die Begleitung (ANN-306); nicht in der Lesefrist (ANN-305).
 *   * Nur am laufenden Plan des eigenen Verhältnisses (ADR-023 Punkt 19, 4.8).
 *   * Im Training „schwierig, weil …" nur mit Einwilligung (ADR-021 Punkt 4).
 *   * Die Praxis liest die Einheiten mit dem Plan - dieselben Rollen (ANN-298).
 */

const { users, platformAccesses, patients, trainingRelationships, organizationId } = SEED;

const BEGINNEN = 'select public.start_platform_exercise_session($1::uuid, $2::uuid) as id';
const HAKEN = 'select public.mark_platform_exercise_set($1::uuid, $2::uuid, $3::uuid, $4, $5)';
const BEENDEN = 'select public.finish_platform_exercise_session($1::uuid, $2::uuid, $3)';
const PLAENE = 'select public.platform_exercise_plans($1::uuid) as daten';
const PLAN = 'select public.get_exercise_plan($1::uuid) as plan';

interface PortalPlan {
  id: string;
  can_exercise: boolean;
  note_allowed: boolean;
  open_session: { id: string; sets: { item_id: string; set_number: number }[] } | null;
  recent_sessions: { performed_on: string; finished: boolean }[];
}

async function beginnen(konto: string, zugang: string, plan: string): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, BEGINNEN, [zugang, plan]);
  return rows[0]!.id;
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

describe('Einheiten am Plan (UEB-010)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
    await asPostgres('delete from public.audit_log');
  });

  it('beginnt, hakt ab und setzt eine heute begonnene Einheit fort (ANN-305)', async () => {
    const plan = await zugewiesenerPlan('therapy', patients.erika, 'Knie', [
      KNIEBEUGE_GELAENDER,
      RUDERN_GELB,
    ]);
    const [erste, zweite] = await positionen(plan);
    const einheit = await beginnen(erika.konto, erika.zugang, plan);
    await asUserCommitted(erika.konto, HAKEN, [erika.zugang, einheit, erste, 1, true]);
    await asUserCommitted(erika.konto, HAKEN, [erika.zugang, einheit, erste, 2, true]);
    await asUserCommitted(erika.konto, HAKEN, [erika.zugang, einheit, zweite, 1, true]);
    // Doppelt abhaken schadet nicht, zurücknehmen geht.
    await asUserCommitted(erika.konto, HAKEN, [erika.zugang, einheit, erste, 2, true]);
    await asUserCommitted(erika.konto, HAKEN, [erika.zugang, einheit, zweite, 1, false]);

    // Abbrechen und wieder anfangen: dieselbe Einheit, nichts verloren.
    expect(await beginnen(erika.konto, erika.zugang, plan)).toBe(einheit);
    const [p] = await portal(erika.konto, erika.zugang);
    expect(p!.can_exercise).toBe(true);
    expect(p!.open_session).toEqual({
      id: einheit,
      sets: [
        { item_id: erste, set_number: 1 },
        { item_id: erste, set_number: 2 },
      ],
    });

    await asUserCommitted(erika.konto, BEENDEN, [erika.zugang, einheit, '  Knie zieht etwas  ']);
    const [danach] = await portal(erika.konto, erika.zugang);
    expect(danach!.open_session).toBeNull();
    expect(danach!.recent_sessions).toEqual([
      { performed_on: expect.any(String) as unknown, finished: true },
    ]);
    // Nach dem Beenden ändert sich nichts mehr; Beginnen eröffnet eine neue.
    expect(
      await fehler(asUserCommitted(erika.konto, HAKEN, [erika.zugang, einheit, erste, 3, true])),
    ).toBe('P0002');
    expect(await beginnen(erika.konto, erika.zugang, plan)).not.toBe(einheit);

    const { rows } = await asPostgres<{
      difficulty_note: string;
      platform_access_kind: string;
      recorded_by: string;
    }>('select * from public.exercise_plan_sessions where id = $1', [einheit]);
    expect(rows[0]).toMatchObject({
      difficulty_note: 'Knie zieht etwas',
      platform_access_kind: 'self',
      recorded_by: users.plattformErika,
    });
  });

  it('prüft Satz und Übung gegen den Plan', async () => {
    const plan = await zugewiesenerPlan();
    const fremd = await zugewiesenerPlan('therapy', patients.max, 'Max');
    const [position] = await positionen(plan);
    const [fremdePosition] = await positionen(fremd);
    const einheit = await beginnen(erika.konto, erika.zugang, plan);
    expect(
      await fehler(asUser(erika.konto, HAKEN, [erika.zugang, einheit, position, 4, true])),
    ).toBe('22023');
    expect(
      await fehler(asUser(erika.konto, HAKEN, [erika.zugang, einheit, position, 0, true])),
    ).toBe('22023');
    expect(
      await fehler(asUser(erika.konto, HAKEN, [erika.zugang, einheit, fremdePosition, 1, true])),
    ).toBe('P0002');
    expect(
      await fehler(asUser(erika.konto, BEENDEN, [erika.zugang, einheit, 'x'.repeat(501)])),
    ).toBe('22023');
  });

  it('nur am laufenden Plan des eigenen Verhältnisses (Punkt 19, 4.8)', async () => {
    const maxPlan = await zugewiesenerPlan('therapy', patients.max, 'Max');
    const training = await zugewiesenerPlan('training', trainingRelationships.erika, 'Training');
    expect(await fehler(asUser(erika.konto, BEGINNEN, [erika.zugang, maxPlan]))).toBe('P0002');
    // Der Trainingsplan derselben Person nicht über den Behandlungszugang.
    expect(await fehler(asUser(erika.konto, BEGINNEN, [erika.zugang, training]))).toBe('P0002');
    // Ein beendeter Plan nicht.
    const plan = await zugewiesenerPlan();
    await asUserCommitted(users.therapist, 'select public.end_exercise_plan($1::uuid)', [plan]);
    expect(await fehler(asUser(erika.konto, BEGINNEN, [erika.zugang, plan]))).toBe('P0002');
    const [p] = await portal(erika.konto, erika.zugang);
    expect(p!.can_exercise).toBe(false);
    // Fremde Einheit: Tina kommt mit ihrem Zugang nicht an Erikas Einheit.
    const eigener = await zugewiesenerPlan('training', trainingRelationships.tina, 'Tina');
    const tinaEinheit = await beginnen(users.plattformTina, platformAccesses.tinaTraining, eigener);
    const [tinaPosition] = await positionen(eigener);
    expect(
      await fehler(
        asUser(erika.konto, HAKEN, [
          platformAccesses.erikaTraining,
          tinaEinheit,
          tinaPosition,
          1,
          true,
        ]),
      ),
    ).toBe('P0002');
  });

  it('Begleitung liest, erfasst aber nicht (ANN-306)', async () => {
    const plan = await zugewiesenerPlan('therapy', patients.max, 'Max');
    expect(
      await fehler(
        asUser(users.plattformPaula, BEGINNEN, [platformAccesses.paulaBegleitungMax, plan]),
      ),
    ).toBe('42501');
    const [p] = await portal(users.plattformPaula, platformAccesses.paulaBegleitungMax);
    expect(p!.can_exercise).toBe(false);
  });

  it('Praxiskonto, fremde Person, andere Organisation, ohne Anmeldung: abgewiesen', async () => {
    const plan = await zugewiesenerPlan();
    expect(await fehler(asUser(users.therapist, BEGINNEN, [erika.zugang, plan]))).toBe('42501');
    expect(await fehler(asUser(users.plattformTina, BEGINNEN, [erika.zugang, plan]))).toBe('42501');
    const fremd = await fremdeOrganisation();
    expect(await fehler(asUser(fremd.owner, BEGINNEN, [erika.zugang, plan]))).toBe('42501');
    expect(await fehler(asUser(null, BEGINNEN, [erika.zugang, plan]))).toBe('42501');
  });

  it('im Training „schwierig, weil …" nur mit Einwilligung (ADR-021 Punkt 4)', async () => {
    const plan = await zugewiesenerPlan('training', trainingRelationships.tina, 'Tina');
    const tina = { konto: users.plattformTina, zugang: platformAccesses.tinaTraining };
    await asPostgres(
      'delete from public.training_consent_records where training_relationship_id = $1',
      [trainingRelationships.tina],
    );
    const einheit = await beginnen(tina.konto, tina.zugang, plan);
    expect((await portal(tina.konto, tina.zugang))[0]!.note_allowed).toBe(false);
    expect(await fehler(asUser(tina.konto, BEENDEN, [tina.zugang, einheit, 'Rücken']))).toBe(
      '42501',
    );
    // Ohne Text geht das Beenden.
    await asUserCommitted(tina.konto, BEENDEN, [tina.zugang, einheit, '']);

    await asPostgres(
      `insert into public.training_consent_records
         (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by)
       values ($1, $2, 'consent_granted', 'training_health_data', current_date, $3)`,
      [organizationId, trainingRelationships.tina, users.trainer],
    );
    expect((await portal(tina.konto, tina.zugang))[0]!.note_allowed).toBe(true);
    const zweite = await beginnen(tina.konto, tina.zugang, plan);
    await asUserCommitted(tina.konto, BEENDEN, [tina.zugang, zweite, 'Rücken']);
  });

  it('die Praxis liest die Einheiten mit dem Plan, dieselben Rollen (ANN-298)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const einheit = await beginnen(erika.konto, erika.zugang, plan);
    await asUserCommitted(erika.konto, HAKEN, [erika.zugang, einheit, position, 1, true]);
    await asUserCommitted(erika.konto, BEENDEN, [erika.zugang, einheit, 'Knie']);

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
    const einheit = await beginnen(erika.konto, erika.zugang, plan);
    await asUserCommitted(erika.konto, BEENDEN, [erika.zugang, einheit, 'Knie']);
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
    const einheit = await beginnen(erika.konto, erika.zugang, plan);
    // Als hätte die rechtliche Vertretung begonnen: Die Person selbst beendet.
    await asPostgres(
      `update public.exercise_plan_sessions set platform_access_kind = 'legal_representative'
        where id = $1`,
      [einheit],
    );
    await asUserCommitted(erika.konto, BEENDEN, [erika.zugang, einheit, 'Knie']);
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

  it('eine liegengebliebene Einheit eines früheren Tages bleibt stehen (ANN-305)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const einheit = await beginnen(erika.konto, erika.zugang, plan);
    await asPostgres(
      'update public.exercise_plan_sessions set performed_on = performed_on - 1 where id = $1',
      [einheit],
    );
    expect(
      await fehler(asUser(erika.konto, HAKEN, [erika.zugang, einheit, position, 1, true])),
    ).toBe('P0002');
    expect(await fehler(asUser(erika.konto, BEENDEN, [erika.zugang, einheit, '']))).toBe('P0002');
    // Heute beginnt eine neue.
    expect(await beginnen(erika.konto, erika.zugang, plan)).not.toBe(einheit);
  });

  it('gesperrt oder entzogen: kein Haken, kein Beenden (Punkt 18)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const einheit = await beginnen(erika.konto, erika.zugang, plan);
    try {
      await asPostgres(
        `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
        [erika.zugang],
      );
      expect(
        await fehler(asUser(erika.konto, HAKEN, [erika.zugang, einheit, position, 1, true])),
      ).toBe('42501');
      expect(await fehler(asUser(erika.konto, BEENDEN, [erika.zugang, einheit, '']))).toBe('42501');
      await asPostgres(
        `update public.platform_accesses
            set status = 'revoked', locked_at = null, revoked_at = now(), revoked_reason = 'practice'
          where id = $1`,
        [erika.zugang],
      );
      expect(await fehler(asUser(erika.konto, BEGINNEN, [erika.zugang, plan]))).toBe('42501');
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('steht im Export der Plattform, wie die Plattform ihn zeigt (POR-018)', async () => {
    const plan = await zugewiesenerPlan();
    const einheit = await beginnen(erika.konto, erika.zugang, plan);
    await asUserCommitted(erika.konto, BEENDEN, [erika.zugang, einheit, 'Rücken zwickt']);
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
    const einheit = await beginnen(erika.konto, erika.zugang, plan);
    const [position] = await positionen(plan);
    await asUserCommitted(erika.konto, HAKEN, [erika.zugang, einheit, position, 1, true]);
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
      expect(await fehler(asUser(erika.konto, BEGINNEN, [erika.zugang, plan]))).toBe('42501');
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });
});

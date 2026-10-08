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
 * Übungstage im Kalender der Person (UEB-011, IDEA-ORG-004, ANN-307).
 *
 *   * Die Person wählt Wochentage je Plan; sie gelten auch für die nächste
 *     Fassung, bis sie neu gewählt werden.
 *   * Rechte wie beim Üben (ANN-306), nicht in der Lesefrist (ANN-305).
 *   * Die Praxis liest sie nicht - nur die Auskunft nach Art. 15 nennt sie.
 */

const { users, platformAccesses, patients, trainingRelationships } = SEED;
const TAGE = 'select public.set_platform_exercise_days($1::uuid, $2::uuid, $3::int[])';
const PLAENE = 'select public.platform_exercise_plans($1::uuid) as daten';
const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };

async function wochentage(konto: string, zugang: string): Promise<number[][]> {
  const { rows } = await asUser<{ daten: { plans: { weekdays: number[] }[] } }>(konto, PLAENE, [
    zugang,
  ]);
  return rows[0]!.daten.plans.map((p) => p.weekdays);
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

describe('Übungstage (UEB-011)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
  });

  it('wählt Tage, sortiert und ohne Doppelte, und ändert sie', async () => {
    const plan = await zugewiesenerPlan();
    expect(await wochentage(erika.konto, erika.zugang)).toEqual([[]]);
    await asUserCommitted(erika.konto, TAGE, [erika.zugang, plan, [5, 1, 3, 1]]);
    expect(await wochentage(erika.konto, erika.zugang)).toEqual([[1, 3, 5]]);
    await asUserCommitted(erika.konto, TAGE, [erika.zugang, plan, [2]]);
    expect(await wochentage(erika.konto, erika.zugang)).toEqual([[2]]);
    expect(await fehler(asUser(erika.konto, TAGE, [erika.zugang, plan, [0]]))).toBe('22023');
    expect(await fehler(asUser(erika.konto, TAGE, [erika.zugang, plan, [8]]))).toBe('22023');
  });

  it('gilt für die nächste Fassung, bis neu gewählt wird; leer heißt keine', async () => {
    const alt = await zugewiesenerPlan();
    await asUserCommitted(erika.konto, TAGE, [erika.zugang, alt, [1, 4]]);
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
    expect(await wochentage(erika.konto, erika.zugang)).toEqual([[1, 4]]);
    await asUserCommitted(erika.konto, TAGE, [erika.zugang, rows[0]!.id, []]);
    expect(await wochentage(erika.konto, erika.zugang)).toEqual([[]]);
  });

  it('nur am zugewiesenen Plan des eigenen Verhältnisses', async () => {
    const maxPlan = await zugewiesenerPlan('therapy', patients.max, 'Max');
    const training = await zugewiesenerPlan('training', trainingRelationships.erika, 'Training');
    expect(await fehler(asUser(erika.konto, TAGE, [erika.zugang, maxPlan, [1]]))).toBe('P0002');
    expect(await fehler(asUser(erika.konto, TAGE, [erika.zugang, training, [1]]))).toBe('P0002');
    const beendet = await zugewiesenerPlan();
    await asUserCommitted(users.therapist, 'select public.end_exercise_plan($1::uuid)', [beendet]);
    expect(await fehler(asUser(erika.konto, TAGE, [erika.zugang, beendet, [1]]))).toBe('P0002');
  });

  it('Begleitung, Praxiskonto, fremde Person, andere Organisation: abgewiesen', async () => {
    const plan = await zugewiesenerPlan('therapy', patients.max, 'Max');
    expect(
      await fehler(
        asUser(users.plattformPaula, TAGE, [platformAccesses.paulaBegleitungMax, plan, [1]]),
      ),
    ).toBe('42501');
    const eigen = await zugewiesenerPlan();
    expect(await fehler(asUser(users.therapist, TAGE, [erika.zugang, eigen, [1]]))).toBe('42501');
    expect(await fehler(asUser(users.plattformTina, TAGE, [erika.zugang, eigen, [1]]))).toBe(
      '42501',
    );
    const fremd = await fremdeOrganisation();
    expect(await fehler(asUser(fremd.owner, TAGE, [erika.zugang, eigen, [1]]))).toBe('42501');
  });

  it('die Praxis liest die Tage nicht, die Auskunft nennt sie (ANN-307)', async () => {
    const plan = await zugewiesenerPlan();
    await asUserCommitted(erika.konto, TAGE, [erika.zugang, plan, [2, 6]]);
    const { rows } = await asUser<{ plan: Record<string, unknown> }>(
      users.therapist,
      'select public.get_exercise_plan($1::uuid) as plan',
      [plan],
    );
    expect(rows[0]!.plan).not.toHaveProperty('weekdays');
    expect(
      await fehler(asUser(users.ownerTherapist, 'select * from public.exercise_plan_days')),
    ).toBe('42501');
    const auskunft = await asUser<{
      daten: { tabellen: { exercise_plans: { weekdays: number[] | null }[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.erika,
    ]);
    expect(auskunft.rows[0]!.daten.tabellen.exercise_plans[0]!.weekdays).toEqual([2, 6]);
  });

  it('fällt mit dem Plan', async () => {
    const plan = await zugewiesenerPlan();
    await asUserCommitted(erika.konto, TAGE, [erika.zugang, plan, [1]]);
    await planeEntfernen();
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.exercise_plan_days',
    );
    expect(rows[0]!.n).toBe(0);
  });
});

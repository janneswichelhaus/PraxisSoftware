import { SEED, asPostgres, asUserCommitted } from './db';

/**
 * Pläne für die Tests der Plattform (UEB-EPIC-003): anlegen, befüllen,
 * zuweisen - über dieselben Funktionen wie die Praxis. Die Prüfungen der
 * Pläne selbst stehen in `exercise-plans.test.ts`; eine Testdatei zu
 * importieren hieße, ihre Tests ein zweites Mal laufen zu lassen.
 */

const { users, patients, trainingRelationships, organizationId } = SEED;

export const KNIEBEUGE_GELAENDER = 'acacacac-acac-4cac-8cac-000000000001';
export const RUDERN_GELB = 'acacacac-acac-4cac-8cac-000000000009';

/** Kalendertag `n` Tage von heute in der Zeitzone der Testpraxis. */
export async function praxistag(n: number): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char(app.training_today($1::uuid) + $2::int, 'YYYY-MM-DD') as tag`,
    [organizationId, n],
  );
  return rows[0]!.tag;
}

/**
 * Ein zugewiesener Plan mit Übungen: je Variante drei Sätze zu 10–12, die
 * erste mit einem Hinweis. Liefert die Kennung des Plans.
 */
export async function zugewiesenerPlan(
  bereich: 'therapy' | 'training' = 'therapy',
  verhaeltnis: string = bereich === 'therapy' ? patients.erika : trainingRelationships.tina,
  titel = 'Heimprogramm Knie',
  varianten: string[] = [KNIEBEUGE_GELAENDER],
): Promise<string> {
  const konto = bereich === 'therapy' ? users.therapist : users.trainer;
  const { rows } = await asUserCommitted<{ id: string }>(
    konto,
    'select public.create_exercise_plan($1, $2::uuid, $3) as id',
    [bereich, verhaeltnis, titel],
  );
  const plan = rows[0]!.id;
  for (const [index, variante] of varianten.entries()) {
    await asUserCommitted(
      konto,
      `select public.save_exercise_plan_item(null, $1::uuid, $2::uuid, 3, 10, 12, null, null,
         null, 30, false, $3, null, null)`,
      [plan, variante, index === 0 ? 'Langsam' : null],
    );
  }
  await asUserCommitted(konto, 'select public.assign_exercise_plan($1::uuid, $2::date)', [
    plan,
    await praxistag(42),
  ]);
  return plan;
}

/** Positionen eines Plans in ihrer Reihenfolge. */
export async function positionen(plan: string): Promise<string[]> {
  const { rows } = await asPostgres<{ id: string }>(
    'select id from public.exercise_plan_items where plan_id = $1 order by position',
    [plan],
  );
  return rows.map((r) => r.id);
}

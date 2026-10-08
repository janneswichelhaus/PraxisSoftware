import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { ACHSEN, KOERPERREGIONEN } from '@/features/exercises/types';

/**
 * Übungspläne (UEB-EPIC-002, IDEA-TRN-011).
 *
 * Ein Plan hängt an genau einem Verhältnis: an der Akte (`therapy`) oder am
 * Trainingsverhältnis (`training`) - ANN-297. Wer liest und schreibt,
 * entscheidet der Server je Bereich (ANN-298); `can_write` steuert hier nur
 * die Darstellung. Nichts in dieser Datei wählt, sortiert oder belegt etwas
 * aus Angaben einer Person vor (ADR-006 Punkt 10).
 */

export const BEREICHE = ['therapy', 'training'] as const;
export type Bereich = (typeof BEREICHE)[number];

export const PLANSTATUS = ['draft', 'assigned', 'ended', 'superseded'] as const;
export type Planstatus = (typeof PLANSTATUS)[number];

/** Achsen eines Schritts an einer Position - die Frequenz liegt am Plan. */
export const POSITIONSACHSEN = ACHSEN.filter((achse) => achse !== 'frequenz');

const positionSchema = z.object({
  id: z.string(),
  position: z.number(),
  variant_id: z.string(),
  exercise_name: z.string(),
  exercise_lay_name: z.string(),
  variant_name: z.string(),
  variant_lay_name: z.string(),
  body_region: z.enum(KOERPERREGIONEN),
  instruction: z.string().nullable(),
  equipment: z.array(z.string()),
  variant_archived: z.boolean(),
  sets: z.number(),
  reps_min: z.number().nullable(),
  reps_max: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  load: z.string().nullable(),
  tempo: z.string().nullable(),
  rest_seconds: z.number().nullable(),
  double_progression: z.boolean(),
  note: z.string().nullable(),
  previous_item_id: z.string().nullable(),
  step_axis: z.enum(ACHSEN).nullable(),
  step_direction: z.enum(['harder', 'easier']).nullable(),
});

export type Position = z.infer<typeof positionSchema>;

const planSchema = z.object({
  id: z.string(),
  service_area: z.enum(BEREICHE),
  relationship_id: z.string(),
  given_name: z.string(),
  family_name: z.string(),
  title: z.string(),
  sessions_per_week: z.number().nullable(),
  status: z.enum(PLANSTATUS),
  previous_plan_id: z.string().nullable(),
  follow_up: z.object({ id: z.string(), status: z.enum(PLANSTATUS) }).nullable(),
  assigned_at: z.string().nullable(),
  assigned_by_name: z.string().nullable(),
  runs_from: z.string().nullable(),
  runs_until: z.string().nullable(),
  original_runs_until: z.string().nullable(),
  extended_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  /** Der Tag des Endes in der Zeitzone der Praxis. */
  ended_on: z.string().nullable(),
  ended_by_name: z.string().nullable(),
  created_at: z.string(),
  created_by_name: z.string().nullable(),
  today: z.string(),
  can_write: z.boolean(),
  /** UEB-007: Die Wiedervorlage steht an (ANN-302) - der Server rechnet. */
  review_due: z.boolean(),
  relationship_open: z.boolean(),
  previous: z
    .object({
      id: z.string(),
      title: z.string(),
      sessions_per_week: z.number().nullable(),
      runs_from: z.string().nullable(),
      runs_until: z.string().nullable(),
      items: z.array(positionSchema),
    })
    .nullable(),
  items: z.array(positionSchema),
  /** UEB-010: was die Person an diesem Plan durchgeführt hat, jüngste zuerst. */
  sessions: z.array(
    z.object({
      id: z.string(),
      performed_on: z.string(),
      started_at: z.string(),
      finished_at: z.string().nullable(),
      sets_done: z.coerce.number(),
      sets_total: z.coerce.number(),
      difficulty_note: z.string().nullable(),
      recorded_by_kind: z.enum(['self', 'legal_representative']),
    }),
  ),
});

export type Plan = z.infer<typeof planSchema>;
export type Einheit = Plan['sessions'][number];

const planZeileSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(PLANSTATUS),
  sessions_per_week: z.number().nullable(),
  previous_plan_id: z.string().nullable(),
  assigned_at: z.string().nullable(),
  runs_from: z.string().nullable(),
  runs_until: z.string().nullable(),
  ended_at: z.string().nullable(),
  created_at: z.string(),
  item_count: z.coerce.number(),
  /** UEB-007: Die Wiedervorlage steht an (ANN-302) - der Server rechnet. */
  review_due: z.boolean(),
});

export type PlanZeile = z.infer<typeof planZeileSchema>;

const planlisteSchema = z.object({
  can_write: z.boolean(),
  today: z.string(),
  plans: z.array(planZeileSchema),
});

export type Planliste = z.infer<typeof planlisteSchema>;

export const PLAENE_SCHLUESSEL = ['uebungsplaene'] as const;

export function planlisteSchluessel(bereich: Bereich, verhaeltnisId: string) {
  return [...PLAENE_SCHLUESSEL, 'liste', bereich, verhaeltnisId] as const;
}

export function planSchluessel(planId: string) {
  return [...PLAENE_SCHLUESSEL, 'plan', planId] as const;
}

/** Wohin ein Plan in der Oberfläche gehört. */
export function planPfad(bereich: Bereich, verhaeltnisId: string, planId: string): string {
  return bereich === 'therapy'
    ? `/patienten/${verhaeltnisId}/plaene/${planId}`
    : `/training/${verhaeltnisId}/plaene/${planId}`;
}

/** Die Seite des Verhältnisses, zu dem ein Plan gehört. */
export function verhaeltnisPfad(plan: Pick<Plan, 'service_area' | 'relationship_id'>): string {
  return plan.service_area === 'therapy'
    ? `/patienten/${plan.relationship_id}/doku`
    : `/training/${plan.relationship_id}`;
}

export async function fetchPlanliste(
  bereich: Bereich,
  verhaeltnisId: string,
): Promise<Planliste | null> {
  const satz = 'Die Pläne konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_exercise_plans', {
    p_area: bereich,
    p_relationship_id: verhaeltnisId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(planlisteSchema.nullable(), data ?? null, satz);
}

export async function fetchPlan(planId: string): Promise<Plan | null> {
  const satz = 'Der Plan konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_exercise_plan', {
    p_plan_id: planId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(planSchema.nullable(), data ?? null, satz);
}

type Fehler = { message?: string } | null;

/**
 * Übersetzt die Meldungen der Schreibpfade in Sätze für die Praxis. Was hier
 * nicht steht, wird zu `rest`.
 */
function meldung(error: Fehler, rest: string): Error {
  const text = error?.message ?? '';
  const saetze: [string, string][] = [
    ['not allowed', 'Diesen Plan dürfen Sie nicht bearbeiten.'],
    ['exercise plan not found', 'Den Plan gibt es nicht mehr.'],
    ['relationship not found', 'Die Person gibt es nicht mehr.'],
    ['training relationship has ended', 'Der Trainingsvertrag ist beendet.'],
    ['is not a draft', 'Der Plan ist schon zugewiesen und lässt sich nicht mehr ändern.'],
    ['title is required', 'Bitte einen Titel angeben.'],
    ['title is too long', 'Der Titel ist zu lang.'],
    ['exercise variant not found', 'Diese Übung steht nicht mehr in der Bibliothek.'],
    ['too many exercises', 'Ein Plan hat höchstens 30 Übungen.'],
    ['repetitions or duration', 'Bitte Wiederholungen oder eine Dauer angeben.'],
    ['repetitions are invalid', 'Bitte die Wiederholungen prüfen.'],
    ['sets is invalid', 'Bitte die Sätze prüfen (1 bis 20).'],
    ['duration is invalid', 'Bitte die Dauer prüfen (1 bis 3600 Sekunden).'],
    ['rest is invalid', 'Bitte die Pause prüfen (0 bis 600 Sekunden).'],
    [
      'double progression',
      'Doppelte Progression braucht einen Wiederholungsbereich und eine Last.',
    ],
    ['is too long', 'Ein Eintrag ist zu lang.'],
    ['sessions per week', 'Bitte die Einheiten je Woche prüfen (1 bis 14).'],
    ['has no exercises', 'Bitte zuerst mindestens eine Übung hinzufügen.'],
    ['already has a new version', 'Zu diesem Plan gibt es schon eine neue Fassung.'],
    [
      'only one axis per step',
      'Je Schritt ändert sich genau eine Achse – bitte nur einen Wert ändern.',
    ],
    [
      'step axis is required',
      'Bitte angeben, ob und in welcher Achse gesteigert oder zurückgenommen wird.',
    ],
    ['step direction does not match', 'Die Richtung passt nicht zur Änderung.'],
    ['step does not match', 'Achse und Richtung passen nicht zur Änderung.'],
    [
      'not a single step',
      'Wiederholungen und Dauer zu tauschen ist kein Schritt – bitte die Übung entfernen und neu hinzufügen.',
    ],
    [
      'runs until is invalid',
      'Bitte ein Ende zwischen heute und 26 Wochen ab heute wählen – beim Verlängern später als bisher.',
    ],
    ['can be extended', 'Nur ein zugewiesener Plan lässt sich verlängern.'],
    ['can be ended', 'Nur ein zugewiesener Plan lässt sich beenden.'],
  ];
  const treffer = saetze.find(([schluessel]) => text.includes(schluessel));
  return new Error(treffer ? treffer[1] : rest);
}

async function rufe(
  funktion: string,
  argumente: Record<string, unknown>,
  rest: string,
): Promise<unknown> {
  const { data, error } = (await getSupabase().rpc(funktion, argumente)) as {
    data: unknown;
    error: Fehler;
  };
  if (error) throw meldung(error, rest);
  return data;
}

export async function createPlan(
  bereich: Bereich,
  verhaeltnisId: string,
  titel: string,
): Promise<string> {
  const rest = 'Der Plan konnte nicht angelegt werden.';
  const data = await rufe(
    'create_exercise_plan',
    { p_area: bereich, p_relationship_id: verhaeltnisId, p_title: titel },
    rest,
  );
  return antwort(z.string(), data, rest);
}

export async function savePlan(
  planId: string,
  titel: string,
  einheitenJeWoche: number | null,
): Promise<void> {
  await rufe(
    'save_exercise_plan',
    { p_plan_id: planId, p_title: titel, p_sessions_per_week: einheitenJeWoche },
    'Der Plan konnte nicht gespeichert werden.',
  );
}

export interface PositionEingabe {
  id?: string;
  planId: string;
  variantId: string;
  saetze: number;
  wdhVon: number | null;
  wdhBis: number | null;
  dauer: number | null;
  last: string;
  tempo: string;
  pause: number | null;
  doppelt: boolean;
  hinweis: string;
  /** UEB-006: der eine Schritt gegenüber der vorigen Fassung. */
  achse: string | null;
  richtung: 'harder' | 'easier' | null;
}

export async function savePosition(eingabe: PositionEingabe): Promise<string> {
  const rest = 'Die Übung konnte nicht gespeichert werden.';
  const data = await rufe(
    'save_exercise_plan_item',
    {
      p_item_id: eingabe.id ?? null,
      p_plan_id: eingabe.planId,
      p_variant_id: eingabe.variantId,
      p_sets: eingabe.saetze,
      p_reps_min: eingabe.wdhVon,
      p_reps_max: eingabe.wdhBis,
      p_duration_seconds: eingabe.dauer,
      p_load: eingabe.last,
      p_tempo: eingabe.tempo,
      p_rest_seconds: eingabe.pause,
      p_double_progression: eingabe.doppelt,
      p_note: eingabe.hinweis,
      p_step_axis: eingabe.achse,
      p_step_direction: eingabe.richtung,
    },
    rest,
  );
  return antwort(z.string(), data, rest);
}

export async function movePosition(positionId: string, richtung: 'up' | 'down'): Promise<void> {
  await rufe(
    'move_exercise_plan_item',
    { p_item_id: positionId, p_direction: richtung },
    'Die Übung konnte nicht verschoben werden.',
  );
}

export async function deletePosition(positionId: string): Promise<void> {
  await rufe(
    'delete_exercise_plan_item',
    { p_item_id: positionId },
    'Die Übung konnte nicht entfernt werden.',
  );
}

export async function discardPlan(planId: string): Promise<void> {
  await rufe(
    'discard_exercise_plan',
    { p_plan_id: planId },
    'Der Entwurf konnte nicht verworfen werden.',
  );
}

/** UEB-005: zuweisen und einfrieren, mit Ende der Laufzeit (ANN-300, ANN-302). */
export async function assignPlan(planId: string, laeuftBis: string): Promise<void> {
  await rufe(
    'assign_exercise_plan',
    { p_plan_id: planId, p_runs_until: laeuftBis },
    'Der Plan konnte nicht zugewiesen werden.',
  );
}

/** UEB-006: neue Fassung eines zugewiesenen Plans als Entwurf (ANN-301). */
export async function createVersion(planId: string): Promise<string> {
  const rest = 'Die neue Fassung konnte nicht angelegt werden.';
  const data = await rufe('create_exercise_plan_version', { p_plan_id: planId }, rest);
  return antwort(z.string(), data, rest);
}

/** UEB-007: verlängern - der Inhalt bleibt (ANN-302). */
export async function extendPlan(planId: string, laeuftBis: string): Promise<void> {
  await rufe(
    'extend_exercise_plan',
    { p_plan_id: planId, p_runs_until: laeuftBis },
    'Der Plan konnte nicht verlängert werden.',
  );
}

/** UEB-007: beenden - ein zugewiesener Plan wird nie gelöscht (ANN-300). */
export async function endPlan(planId: string): Promise<void> {
  await rufe('end_exercise_plan', { p_plan_id: planId }, 'Der Plan konnte nicht beendet werden.');
}

const faelligSchema = z.object({
  today: z.string(),
  plans: z.array(
    z.object({
      id: z.string(),
      service_area: z.enum(BEREICHE),
      relationship_id: z.string(),
      given_name: z.string(),
      family_name: z.string(),
      title: z.string(),
      runs_until: z.string(),
      follow_up_draft: z.boolean(),
    }),
  ),
});

export type Faellige = z.infer<typeof faelligSchema>;

export const FAELLIG_SCHLUESSEL = [...PLAENE_SCHLUESSEL, 'faellig'] as const;

/** UEB-007: Pläne, deren Wiedervorlage ansteht - nur für schreibende Rollen (ANN-302). */
export async function fetchFaellige(): Promise<Faellige | null> {
  const satz = 'Die auslaufenden Pläne konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_due_exercise_plans')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(faelligSchema.nullable(), data ?? null, satz);
}

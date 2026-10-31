import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

// -----------------------------------------------------------------------------
// Übungen und Training
// -----------------------------------------------------------------------------

const planPositionSchema = z.object({
  id: z.string().uuid(),
  position: z.number(),
  variant_lay_name: z.string(),
  instruction: z.string().nullable(),
  equipment: z.array(z.string()),
  sets: z.number(),
  reps_min: z.number().nullable(),
  reps_max: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  /** Halten je Wiederholung, je Seite, Häufigkeit am Tag (ANN-384). */
  hold_seconds: z.number().nullable().default(null),
  per_side: z.boolean().default(false),
  times_per_day: z.number().nullable().default(null),
  load: z.string().nullable(),
  tempo: z.string().nullable(),
  rest_seconds: z.number().nullable(),
  double_progression: z.boolean(),
  note: z.string().nullable(),
});
export type PlanPosition = z.infer<typeof planPositionSchema>;

const eigenerPlanSchema = z.object({
  id: z.string().uuid(),
  service_area: z.enum(['therapy', 'training']),
  title: z.string(),
  status: z.enum(['assigned', 'ended']),
  sessions_per_week: z.number().nullable(),
  assigned_on: z.string().nullable(),
  runs_from: z.string().nullable(),
  runs_until: z.string().nullable(),
  ended_on: z.string().nullable(),
  /** Darf dieser Zugang heute an diesem Plan üben? Der Server rechnet. */
  can_exercise: z.boolean(),
  /** Im Training nur mit Einwilligung zu Gesundheitsangaben (ANN-306). */
  note_allowed: z.boolean(),
  /** Die heute begonnene, nicht beendete Einheit mit ihren Haken (ANN-305). */
  open_session: z
    .object({
      id: z.string().uuid(),
      sets: z.array(z.object({ item_id: z.string().uuid(), set_number: z.number() })),
    })
    .nullable(),
  /** Darf dieser Zugang Übungstage wählen - auch vor dem Beginn? */
  can_choose_days: z.boolean(),
  /** Die gewählten Übungstage, ISO 1 Montag bis 7 Sonntag (ANN-307). */
  weekdays: z.array(z.number().int().min(1).max(7)),
  /** Die Tage der letzten vier Wochen, an denen geübt wurde. */
  recent_sessions: z.array(z.object({ performed_on: z.string(), finished: z.boolean() })),
  items: z.array(planPositionSchema),
});
export type EigenerPlan = z.infer<typeof eigenerPlanSchema>;

const eigenePlaeneSchema = z.object({
  /** Der Tag in der Zeitzone der Praxis. */
  today: z.string(),
  plans: z.array(eigenerPlanSchema),
});
export type EigenePlaene = z.infer<typeof eigenePlaeneSchema>;

export function plaeneSchluessel(zugangId: string) {
  return ['platform-exercise-plans', zugangId] as const;
}

/**
 * Die zugewiesenen Pläne des gewählten Bereichs, sonst der zuletzt beendete
 * (ANN-304) - als Schnappschuss in Alltagssprache. Welche, entscheidet der
 * Server über den Zugang (ADR-023 Punkt 22).
 */
export async function ladePlaene(zugangId: string): Promise<EigenePlaene> {
  const satz = 'Ihre Übungen konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_exercise_plans', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(eigenePlaeneSchema, ergebnis.data ?? { today: '', plans: [] }, satz);
}

/** Ein Ereignis einer Einheit, wie das Gerät es erfasst hat (ADR-024 Punkt 7). */
export type Einheitsereignis =
  | {
      id: string;
      kind: 'set';
      /** Uhr des Geräts - eine Angabe der Person (Punkt 8). */
      at: string;
      item_id: string;
      set_number: number;
      done: boolean;
    }
  | { id: string; kind: 'finish'; at: string; note: string; values: Record<string, number> };

const uebertragungSchema = z.object({
  session_id: z.string().uuid(),
  status: z.enum(['ok', 'finished', 'closed', 'empty']),
  note_dropped: z.boolean(),
});
export type Uebertragung = z.infer<typeof uebertragungSchema>;

/**
 * Der Server hat die Einheit beim Eingang abgewiesen (ADR-024 Punkt 8). Die
 * Ansicht sagt den Grund und verwirft sie danach; ein Funkloch ist das nicht.
 */
export class UebertragungAbgewiesen extends Error {
  constructor(satz: string) {
    super(satz);
    this.name = 'UebertragungAbgewiesen';
  }
}

export const ABWEISUNGSSAETZE = {
  zugang: 'Sie können mit diesem Zugang gerade nicht mehr üben.',
  plan: 'Der Plan gilt nicht mehr.',
  form: 'Die Einheit ließ sich nicht übertragen.',
} as const;

/**
 * Eine Einheit übertragen - zweimal gesendet ist einmal gespeichert
 * (ANN-357). Wirft `UebertragungAbgewiesen` mit dem Grund, sonst bei
 * Funkloch einen gewöhnlichen Fehler.
 */
export async function einheitUebertragen(
  zugangId: string,
  einheit: {
    id: string;
    planId: string;
    tag: string;
    begonnenAm: string;
    ereignisse: Einheitsereignis[];
  },
): Promise<Uebertragung> {
  const satz = 'Nicht übertragen. Bitte die Verbindung prüfen.';
  const { data, error } = (await getSupabase().rpc('sync_platform_exercise_session', {
    p_access_id: zugangId,
    p_plan_id: einheit.planId,
    p_session_id: einheit.id,
    p_performed_on: einheit.tag,
    p_started_at: einheit.begonnenAm,
    p_events: einheit.ereignisse,
  })) as { data: unknown; error: { code?: string } | null };
  const code = error?.code;
  // 28000: Die Sitzung ist gesperrt - kein Urteil über die Daten. Sie bleiben
  // auf dem Gerät bis nach dem Entsperren (Zweitreview B1).
  if (code === '42501') throw new UebertragungAbgewiesen(ABWEISUNGSSAETZE.zugang);
  if (code === 'P0002') throw new UebertragungAbgewiesen(ABWEISUNGSSAETZE.plan);
  if (code === '22023' || code === '22P02') throw new UebertragungAbgewiesen(ABWEISUNGSSAETZE.form);
  if (error) throw new Error(satz);
  return antwort(uebertragungSchema, data, satz);
}

/** Die eigenen Übungstage eines Plans wählen (ANN-307). */
export async function uebungstageSetzen(
  zugangId: string,
  planId: string,
  wochentage: number[],
): Promise<void> {
  const { error } = await getSupabase().rpc('set_platform_exercise_days', {
    p_access_id: zugangId,
    p_plan_id: planId,
    p_weekdays: wochentage,
  });
  if (error) throw new Error('Nicht gespeichert. Bitte die Verbindung prüfen und erneut tippen.');
}

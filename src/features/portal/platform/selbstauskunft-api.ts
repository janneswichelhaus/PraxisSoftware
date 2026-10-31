import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

// -----------------------------------------------------------------------------
// Befundbogen vorab (§7, ANN-248)
// -----------------------------------------------------------------------------

export const bogenSchema = z.object({
  id: z.string().uuid(),
  instrument_id: z.string(),
  definition_version: z.string(),
  status: z.enum(['entwurf', 'abgeschlossen']),
  recorded_on: z.string(),
  source: z.enum(['practice', 'platform']),
  /** Nur aus Erhebungen über die Plattform; eine in der Praxis erhobene bleibt Befund. */
  answers: z.record(z.string(), z.unknown()).nullable(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
});
export type Bogenstand = z.infer<typeof bogenSchema>;

export function befundbogenSchluessel(zugangId: string) {
  return ['platform-questionnaire', zugangId] as const;
}

/** Der Stand der Bögen, die die Person ausfüllt - nur im Behandlungszugang. */
export async function ladeBefundbogen(zugangId: string): Promise<Bogenstand[]> {
  const satz = 'Ihr Fragebogen konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_questionnaire', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(bogenSchema), ergebnis.data ?? [], satz);
}

function bogenfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('already completed'))
    return 'Ihr Fragebogen liegt der Praxis schon vor. Änderungen besprechen Sie beim Termin.';
  if (m.includes('not available'))
    return 'Dieser Bogen lässt sich zurzeit nicht ausfüllen. Bitte wenden Sie sich an die Praxis.';
  if (m.includes('not allowed'))
    return 'Ihr Zugang erlaubt das gerade nicht. Bitte wenden Sie sich an die Praxis.';
  if (m.includes('is completed')) return 'Dieser Bogen ist schon abgeschickt.';
  return 'Ihre Angaben konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.';
}

/** Entwurf anlegen oder überschreiben; der Server prüft jede Antwort gegen die Definition. */
export async function befundbogenSpeichern(eingabe: {
  zugangId: string;
  entwurfId: string | null;
  instrumentId: string;
  version: string;
  antworten: Record<string, unknown>;
}): Promise<string> {
  const ergebnis = (await getSupabase().rpc('save_platform_questionnaire_response', {
    p_access_id: eingabe.zugangId,
    p_response_id: eingabe.entwurfId,
    p_instrument_id: eingabe.instrumentId,
    p_definition_version: eingabe.version,
    p_answers: eingabe.antworten,
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error) throw new Error(bogenfehler(ergebnis.error.message));
  return antwort(z.string().uuid(), ergebnis.data, bogenfehler(undefined));
}

/** Absenden: der Bogen ist abgeschlossen und liegt der Praxis vor. */
export async function befundbogenAbsenden(zugangId: string, entwurfId: string): Promise<void> {
  const ergebnis = (await getSupabase().rpc('complete_platform_questionnaire_response', {
    p_access_id: zugangId,
    p_response_id: entwurfId,
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error || ergebnis.data !== true) {
    throw new Error(bogenfehler(ergebnis.error?.message ?? 'not found'));
  }
}

/** Den eigenen Entwurf verwerfen. */
export async function befundbogenVerwerfen(zugangId: string, entwurfId: string): Promise<void> {
  const ergebnis = (await getSupabase().rpc('discard_platform_questionnaire_response', {
    p_access_id: zugangId,
    p_response_id: entwurfId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error || ergebnis.data !== true) {
    throw new Error('Der Entwurf konnte nicht verworfen werden.');
  }
}

// -----------------------------------------------------------------------------
// Check-in
// -----------------------------------------------------------------------------

const checkinVerlaufSchema = z.object({
  answered_on: z.string(),
  recorded_by_kind: z.enum(['self', 'legal_representative']),
  values: z.record(z.string(), z.number()),
});

const eigeneCheckinsSchema = z.object({
  today: z.string(),
  schedule: z.object({ interval_days: z.number(), parameter_keys: z.array(z.string()) }).nullable(),
  due_on: z.string().nullable(),
  due: z.boolean(),
  /** Darf dieser Zugang jetzt antworten? Recht, Lesefrist, Einwilligung. */
  can_answer: z.boolean(),
  /** Im Training fehlt die Einwilligung zu Gesundheitsangaben. */
  consent_needed: z.boolean(),
  /** Die letzte Angabe je Frage - nur als Hinweis (ANN-349). */
  last_values: z.record(z.string(), z.number()),
  history: z.array(checkinVerlaufSchema),
  /** Die eigenen Angaben nach den Einheiten, jüngste zuerst (ANN-367). */
  session_history: z
    .array(
      z.object({
        performed_on: z.string(),
        plan_title: z.string(),
        recorded_by_kind: z.enum(['self', 'legal_representative']),
        values: z.record(z.string(), z.number()),
      }),
    )
    .default([]),
});

export type EigeneCheckins = z.infer<typeof eigeneCheckinsSchema>;

export function checkinsSchluessel(zugangId: string) {
  return ['platform-checkins', zugangId] as const;
}

/** Ob ein Check-in fällig ist, die Fragen und „Meine Angaben". */
export async function ladeCheckins(zugangId: string): Promise<EigeneCheckins | null> {
  const satz = 'Ihr Check-in konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_checkins', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  if (ergebnis.data === null) return null;
  return antwort(eigeneCheckinsSchema, ergebnis.data, satz);
}

/** Einen fälligen Check-in beantworten; nur die beantworteten Fragen. */
export async function checkinAbsenden(
  zugangId: string,
  werte: Record<string, number>,
): Promise<void> {
  const { error } = (await getSupabase().rpc('submit_platform_checkin', {
    p_access_id: zugangId,
    p_values: werte,
  })) as { error: { message?: string } | null };
  if (!error) return;
  const m = error.message ?? '';
  if (m.includes('not due')) throw new Error('Diesen Check-in haben Sie schon beantwortet. Danke.');
  if (m.includes('no answer')) throw new Error('Bitte beantworten Sie mindestens eine Frage.');
  if (m.includes('no checkin schedule'))
    throw new Error('Ihre Praxis hat den Check-in gerade beendet.');
  if (m.includes('consent') || m.includes('not allowed'))
    throw new Error('Ihr Zugang erlaubt das gerade nicht. Bitte wenden Sie sich an die Praxis.');
  throw new Error('Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.');
}

// -----------------------------------------------------------------------------
// Gewohnheiten (ANN-370)
// -----------------------------------------------------------------------------

const eigeneGewohnheitenSchema = z.object({
  today: z.string(),
  /** So viele Tage zurück vermerkt die Person, heute eingeschlossen. */
  mark_days: z.number(),
  /** Darf dieser Zugang vermerken? Recht, Lesefrist, Einwilligung. */
  can_mark: z.boolean(),
  consent_needed: z.boolean(),
  habits: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      cue: z.string(),
      place: z.string().nullable(),
      starts_on: z.string(),
      paused: z.boolean(),
      ended_at: z.string().nullable(),
      marks: z.array(z.string()),
    }),
  ),
});

export type EigeneGewohnheiten = z.infer<typeof eigeneGewohnheitenSchema>;
export type EigeneGewohnheit = EigeneGewohnheiten['habits'][number];

export function gewohnheitenSchluessel(zugangId: string) {
  return ['platform-habits', zugangId] as const;
}

export async function ladeGewohnheiten(zugangId: string): Promise<EigeneGewohnheiten | null> {
  const satz = 'Ihre Gewohnheiten konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_habits', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  if (ergebnis.data === null) return null;
  return antwort(eigeneGewohnheitenSchema, ergebnis.data, satz);
}

function gewohnheitsfehler(meldung: string | undefined): Error {
  const m = meldung ?? '';
  if (m.includes('paused'))
    return new Error('Die Gewohnheit ist pausiert. Setzen Sie sie fort, um Tage zu vermerken.');
  if (m.includes('day not open'))
    return new Error('Diesen Tag können Sie nicht mehr vermerken – nur die angezeigten Tage.');
  if (m.includes('not found')) return new Error('Ihre Praxis hat die Gewohnheit beendet.');
  if (m.includes('consent') || m.includes('not allowed'))
    return new Error('Ihr Zugang erlaubt das gerade nicht. Bitte wenden Sie sich an die Praxis.');
  return new Error('Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.');
}

/** Einen Tag vermerken oder den Vermerk zurücknehmen (ANN-370). */
export async function gewohnheitVermerken(
  zugangId: string,
  gewohnheitId: string,
  tag: string,
  gemacht: boolean,
): Promise<void> {
  const { error } = (await getSupabase().rpc('mark_platform_habit', {
    p_access_id: zugangId,
    p_habit_id: gewohnheitId,
    p_done_on: tag,
    p_done: gemacht,
  })) as { error: { message?: string } | null };
  if (error) throw gewohnheitsfehler(error.message);
}

/** Pausieren, etwa bei Krankheit, und fortsetzen – nichts bricht ab. */
export async function gewohnheitPausieren(
  zugangId: string,
  gewohnheitId: string,
  pausiert: boolean,
): Promise<void> {
  const { error } = (await getSupabase().rpc('pause_platform_habit', {
    p_access_id: zugangId,
    p_habit_id: gewohnheitId,
    p_paused: pausiert,
  })) as { error: { message?: string } | null };
  if (error) throw gewohnheitsfehler(error.message);
}

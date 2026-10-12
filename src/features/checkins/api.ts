import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { EREIGNISARTEN, type Ereignisart } from '@/lib/verlaufsereignisse';

/**
 * Check-in mit Takt, Praxisseite (TRK-002, DSN-001 Abschnitt 6).
 *
 * Lesen und Einstellen über drei Funktionen; Rechte, Protokoll und Projektion
 * entscheidet der Server (ANN-351). Die Angaben kommen unverändert, ohne
 * Bewertung (ADR-006 Punkt 11).
 */

export type Verhaeltnisart = 'treatment' | 'training';

const checkinSchema = z.object({
  answered_on: z.string(),
  recorded_at: z.string(),
  recorded_by_kind: z.enum(['self', 'legal_representative']),
  values: z.record(z.string(), z.number()),
});

const datenSchema = z.object({
  today: z.string(),
  can_write: z.boolean(),
  /** Nach Abschluss bzw. Vertragsende ist kein Check-in mehr fällig. */
  relationship_open: z.boolean(),
  schedule: z
    .object({
      interval_days: z.number(),
      parameter_keys: z.array(z.string()),
      starts_on: z.string(),
      due_on: z.string().nullable(),
      updated_at: z.string(),
      updated_by_name: z.string().nullable(),
    })
    .nullable(),
  checkins: z.array(checkinSchema),
  /** Zeitzone der Praxis für die Uhrzeit (TRK-006). */
  time_zone: z.string(),
  /** Angaben nach den Einheiten aller Pläne des Verhältnisses (TRK-006). */
  sessions: z.array(
    z.object({
      performed_on: z.string(),
      finished_at: z.string(),
      plan_title: z.string(),
      recorded_by_kind: z.enum(['self', 'legal_representative']),
      values: z.record(z.string(), z.number()),
    }),
  ),
  /**
   * OUT-001: vermerkte Ereignisse – in der Behandlung die der Akte (gesetzt
   * im Befund), im Training die des Verhältnisses (ANN-364).
   */
  events: z.array(
    z.object({
      id: z.string(),
      occurred_on: z.string(),
      kind: z.enum(EREIGNISARTEN),
      note: z.string().nullable(),
      created_at: z.string(),
      author_name: z.string().nullable(),
    }),
  ),
  /** OUT-001: Planwechsel – zugewiesen, neue Fassung, beendet. */
  plan_events: z.array(
    z.object({
      occurred_on: z.string(),
      kind: z.enum(['plan_assigned', 'plan_version', 'plan_ended']),
      title: z.string(),
    }),
  ),
  /** OUT-001: Tage durchgeführter Termine, höchstens die letzten 100. */
  appointment_days: z.array(z.string()),
  /** Im Training vermerkt die Betreuung hier, mit Einwilligung (ANN-364). */
  events_writable: z.boolean(),
  /** Im Training: Einwilligung zu Gesundheitsangaben; in der Behandlung `null`. */
  health_consent: z.boolean().nullable(),
  /** ALT-003: Gewohnheiten mit den vermerkten Tagen, laufende zuerst (ANN-370). */
  habits: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      cue: z.string(),
      place: z.string().nullable(),
      starts_on: z.string(),
      created_at: z.string(),
      paused: z.boolean(),
      paused_at: z.string().nullable(),
      ended_at: z.string().nullable(),
      marks: z.array(z.string()),
    }),
  ),
  /** Höchstens so viele laufende Gewohnheiten (ANN-370). */
  habits_max: z.number(),
  habits_writable: z.boolean(),
});

export type CheckinDaten = z.infer<typeof datenSchema>;
export type Trainingsereignis = CheckinDaten['events'][number];
export type Checkin = z.infer<typeof checkinSchema>;
export type PraxisGewohnheit = CheckinDaten['habits'][number];

export function checkinsKey(art: Verhaeltnisart, verhaeltnisId: string) {
  return ['checkins', art, verhaeltnisId] as const;
}

/** Öffnen heißt lesen: steht wie das Öffnen der Akte im Protokoll. */
export async function fetchCheckins(
  art: Verhaeltnisart,
  verhaeltnisId: string,
): Promise<CheckinDaten | null> {
  const satz = 'Die Check-ins konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_checkins', {
    p_kind: art,
    p_relationship_id: verhaeltnisId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  if (data === null) return null;
  return antwort(datenSchema, data, satz);
}

function schreibfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('has ended'))
    return 'Das Verhältnis ist beendet. Ein neuer Check-in lässt sich nicht mehr einstellen.';
  if (m.includes('interval')) return 'Bitte einen Takt von 1 bis 28 Tagen wählen.';
  if (m.includes('questions')) return 'Bitte eine bis fünf Fragen wählen.';
  if (m.includes('not allowed'))
    return 'Den Check-in stellen die Rollen ein, die Übungspläne schreiben.';
  return 'Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.';
}

export async function saveCheckinTakt(
  art: Verhaeltnisart,
  verhaeltnisId: string,
  tage: number,
  fragen: string[],
): Promise<void> {
  const { error } = (await getSupabase().rpc('set_checkin_schedule', {
    p_kind: art,
    p_relationship_id: verhaeltnisId,
    p_interval_days: tage,
    p_parameter_keys: fragen,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(schreibfehler(error.message));
}

export async function endCheckinTakt(art: Verhaeltnisart, verhaeltnisId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('end_checkin_schedule', {
    p_kind: art,
    p_relationship_id: verhaeltnisId,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(schreibfehler(error.message));
}

/** „18:40" in der Zeitzone der Praxis (TRK-006, IDEA-TRK-006). */
export function uhrzeit(zeitpunkt: string, zeitzone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zeitzone,
  }).format(new Date(zeitpunkt));
}

/** „alle 7 Tage", „täglich" (ANN-350). */
export function taktText(tage: number): string {
  return tage === 1 ? 'täglich' : `alle ${tage} Tage`;
}

/** Die Takte zur Auswahl; die Datenbank nimmt 1 bis 28 (ANN-350). */
export const TAKTE = [1, 2, 3, 7, 14, 28] as const;

function ereignisfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('consent'))
    return 'Ohne Einwilligung zu Gesundheitsangaben lässt sich kein Ereignis vermerken.';
  if (m.includes('has ended'))
    return 'Das Verhältnis ist beendet. Es lässt sich nichts mehr vermerken.';
  if (m.includes('not found')) return 'Das Ereignis wurde nicht gefunden.';
  if (m.includes('not allowed')) return 'Ereignisse vermerken Inhaber:in und Trainingsbetreuung.';
  return 'Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.';
}

/** OUT-001: ein Ereignis im Verlauf des Trainings vermerken (ANN-364). */
export async function trainingsereignisVermerken(eingabe: {
  verhaeltnisId: string;
  datum: string;
  art: Ereignisart;
  notiz: string;
}): Promise<void> {
  const { error } = (await getSupabase().rpc('add_training_course_event', {
    p_relationship_id: eingabe.verhaeltnisId,
    p_occurred_on: eingabe.datum,
    p_kind: eingabe.art,
    p_note: eingabe.notiz.trim() === '' ? null : eingabe.notiz.trim(),
  })) as { error: { message?: string } | null };
  if (error) throw new Error(ereignisfehler(error.message));
}

/** OUT-001: nimmt ein Ereignis aus dem Verlauf; es bleibt am Datensatz. */
export async function trainingsereignisEntfernen(ereignisId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('remove_training_course_event', {
    p_event_id: ereignisId,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(ereignisfehler(error.message));
}

function gewohnheitsfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('too many'))
    return 'Es laufen schon drei Gewohnheiten. Bitte erst eine beenden – wenige, sehr kleine wirken besser.';
  if (m.includes('consent'))
    return 'Ohne Einwilligung zu Gesundheitsangaben lässt sich keine Gewohnheit eintragen.';
  if (m.includes('has ended'))
    return 'Das Verhältnis ist beendet. Eine neue Gewohnheit lässt sich nicht mehr eintragen.';
  if (m.includes('check constraint') || m.includes('violates'))
    return 'Bitte Was und Auslöser angeben, je höchstens 120 Zeichen.';
  if (m.includes('not found')) return 'Die Gewohnheit wurde nicht gefunden.';
  if (m.includes('not allowed'))
    return 'Gewohnheiten tragen die Rollen ein, die Übungspläne schreiben.';
  return 'Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.';
}

/** ALT-003: eine Gewohnheit eintragen – Was, Auslöser, Wo (ANN-370). */
export async function gewohnheitEintragen(eingabe: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  was: string;
  ausloeser: string;
  wo: string;
}): Promise<void> {
  const { error } = (await getSupabase().rpc('add_habit', {
    p_kind: eingabe.art,
    p_relationship_id: eingabe.verhaeltnisId,
    p_action: eingabe.was.trim(),
    p_cue: eingabe.ausloeser.trim(),
    p_place: eingabe.wo.trim() === '' ? null : eingabe.wo.trim(),
  })) as { error: { message?: string } | null };
  if (error) throw new Error(gewohnheitsfehler(error.message));
}

/** ALT-003: eine Gewohnheit beenden; die vermerkten Tage bleiben. */
export async function gewohnheitBeenden(gewohnheitId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('end_habit', {
    p_habit_id: gewohnheitId,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(gewohnheitsfehler(error.message));
}

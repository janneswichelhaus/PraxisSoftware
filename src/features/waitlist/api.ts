import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { appointmentTypeSchema } from '@/features/appointments/api';

/**
 * Warteliste mit Zeitfenstern (PRX-001).
 *
 * Personen ohne zeitnahen Termin stehen mit Wunschzeiten, Dauer und einem
 * **organisatorischen** Grund auf der Liste (**ANN-132**): Wunsch der Person,
 * Verordnung endet, Vorgabe der Praxis — nie eine Einordnung nach
 * Beschwerdebild (ADR-006 Punkt 4). Wird ein Platz frei, ruft die Praxis an;
 * versendet wird nichts (B15).
 *
 * Geschrieben wird nur über die Serverfunktionen; welche Rolle darf, prüft der
 * Server (ADR-004). Uhrzeiten bleiben `HH:MM` in Praxiszeit, wie überall im
 * Kalender — eine Uhrzeit ohne Tag hat keine Zeitzone.
 */

export const REASONS = ['patient_wish', 'prescription_ending', 'practice_priority'] as const;
export const reasonSchema = z.enum(REASONS);
export type Reason = z.infer<typeof reasonSchema>;

export const reasonLabels: Record<Reason, string> = {
  patient_wish: 'Wunsch der Person',
  prescription_ending: 'Verordnung endet',
  practice_priority: 'Vorgabe der Praxis',
};

/** ISO-Wochentage wie in der Datenbank: 1 = Montag … 7 = Sonntag. */
export const weekdayShort: Record<number, string> = {
  1: 'Mo',
  2: 'Di',
  3: 'Mi',
  4: 'Do',
  5: 'Fr',
  6: 'Sa',
  7: 'So',
};

const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

export const windowSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  from: z.string().regex(UHRZEIT),
  to: z.string().regex(UHRZEIT),
});
export type TimeWindow = z.infer<typeof windowSchema>;

/** Höchstens so viele TimeWindow — dieselbe Grenze wie im Server. */
export const WINDOWS_MAX = 14;
export const NOTE_MAX = 500;
export const DURATION_MIN = 5;
export const DURATION_MAX = 240;

const entrySchema = z.object({
  id: z.string(),
  patient_id: z.string(),
  patient_given_name: z.string(),
  patient_family_name: z.string(),
  phone: z.string().nullable(),
  phone_mobile: z.string().nullable(),
  postal_code: z.string().nullable(),
  treatment_basis_id: z.string().nullable(),
  treatment_basis_kind: z.enum(['first', 'follow_up', 'self_pay']).nullable(),
  treatment_basis_issued_on: z.string().nullable(),
  preferred_staff_member_id: z.string().nullable(),
  preferred_staff_name: z.string().nullable(),
  appointment_type: appointmentTypeSchema,
  duration_minutes: z.number(),
  time_windows: z.array(windowSchema),
  earliest_on: z.string().nullable(),
  needed_by: z.string().nullable(),
  priority_reason: reasonSchema,
  note: z.string().nullable(),
  status: z.enum(['open', 'placed', 'withdrawn']),
  placed_appointment_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
});

export type WaitlistEntry = z.infer<typeof entrySchema>;

export type ListFilter = 'open' | 'closed';

const LOAD_ERROR = 'Die Warteliste konnte nicht geladen werden.';

export async function fetchWaitlist(
  filter: ListFilter = 'open',
  patientId: string | null = null,
): Promise<WaitlistEntry[]> {
  const { data, error } = (await getSupabase().rpc('list_waitlist_entries', {
    p_status: filter,
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(LOAD_ERROR);
  return antwort(z.array(entrySchema), data ?? [], LOAD_ERROR);
}

/** Was das Formular an den Server gibt. */
export interface EntryValues {
  treatmentBasisId: string | null;
  staffMemberId: string | null;
  type: z.infer<typeof appointmentTypeSchema>;
  duration: number;
  windows: TimeWindow[];
  earliestOn: string | null;
  neededBy: string | null;
  reason: Reason;
  note: string | null;
}

/** Die Person steht schon mit derselben Grundlage auf der Liste. */
export class AlreadyOnWaitlistError extends Error {
  constructor() {
    super('Diese Person steht mit derselben Grundlage schon auf der Warteliste.');
    this.name = 'AlreadyOnWaitlistError';
  }
}

/** Jemand anderes hat den Eintrag inzwischen geändert. */
export class EntryChangedError extends Error {
  constructor() {
    super('Der Eintrag wurde inzwischen geändert. Bitte die Liste neu laden.');
    this.name = 'EntryChangedError';
  }
}

function writeError(error: { code?: string; message?: string }, fallback: string): Error {
  if (error.code === '23505') return new AlreadyOnWaitlistError();
  if (error.code === '40001') return new EntryChangedError();
  if (error.message?.includes('closed')) {
    return new Error('Der Eintrag ist schon geschlossen.');
  }
  return new Error(fallback);
}

function params(values: EntryValues) {
  return {
    p_treatment_basis_id: values.treatmentBasisId,
    p_preferred_staff_member_id: values.staffMemberId,
    p_appointment_type: values.type,
    p_duration_minutes: values.duration,
    p_time_windows: values.windows,
    p_earliest_on: values.earliestOn,
    p_needed_by: values.neededBy,
    p_priority_reason: values.reason,
    p_note: values.note,
  };
}

export async function createWaitlistEntry(patientId: string, values: EntryValues): Promise<string> {
  const fallback = 'Der Eintrag konnte nicht gespeichert werden.';
  const { data, error } = (await getSupabase().rpc('create_waitlist_entry', {
    p_patient_id: patientId,
    ...params(values),
  })) as { data: unknown; error: { code?: string; message?: string } | null };
  if (error) throw writeError(error, fallback);
  return antwort(z.string(), data, fallback);
}

export async function updateWaitlistEntry(
  entry: Pick<WaitlistEntry, 'id' | 'updated_at'>,
  values: EntryValues,
): Promise<void> {
  const { error } = (await getSupabase().rpc('update_waitlist_entry', {
    p_entry_id: entry.id,
    p_expected_updated_at: entry.updated_at,
    ...params(values),
  })) as { error: { code?: string; message?: string } | null };
  if (error) throw writeError(error, 'Der Eintrag konnte nicht gespeichert werden.');
}

export async function withdrawWaitlistEntry(
  entry: Pick<WaitlistEntry, 'id' | 'updated_at'>,
): Promise<void> {
  const { error } = (await getSupabase().rpc('close_waitlist_entry', {
    p_entry_id: entry.id,
    p_expected_updated_at: entry.updated_at,
    p_outcome: 'withdrawn',
    p_appointment_id: null,
  })) as { error: { code?: string; message?: string } | null };
  if (error) throw writeError(error, 'Der Eintrag konnte nicht geschlossen werden.');
}

/**
 * Die Wunschzeiten als kurzer Text: „Mo 08:00–12:00 · Mi 14:00–18:00".
 * Ohne Fenster „jederzeit" — das ist eine Aussage, keine fehlende Angabe.
 */
export function windowsText(windows: readonly TimeWindow[]): string {
  if (windows.length === 0) return 'jederzeit';
  return [...windows]
    .sort((a, b) => a.weekday - b.weekday || a.from.localeCompare(b.from))
    .map((f) => `${weekdayShort[f.weekday]} ${f.from}–${f.to}`)
    .join(' · ');
}

/** Ganze Tage zwischen zwei Kalendertagen `YYYY-MM-DD`, UTC-verankert. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** „seit 3 Tagen", „seit heute" — die Wartezeit ab dem Anlegen. */
export function waitingText(createdAt: string, today: string): string {
  const days = daysBetween(createdAt.slice(0, 10), today);
  if (days <= 0) return 'seit heute';
  if (days === 1) return 'seit gestern';
  return `seit ${days} Tagen`;
}

/**
 * Prüft die TimeWindow im Formular. Liefert den ersten Fehler als Satz
 * oder `null`. Der Server prüft dieselbe Form noch einmal.
 */
export function windowsError(windows: readonly TimeWindow[]): string | null {
  if (windows.length > WINDOWS_MAX) return `Höchstens ${WINDOWS_MAX} Wunschzeiten.`;
  for (const f of windows) {
    if (!UHRZEIT.test(f.from) || !UHRZEIT.test(f.to)) {
      return 'Jede Wunschzeit braucht Beginn und Ende.';
    }
    if (f.to <= f.from) return 'Eine Wunschzeit endet vor ihrem Beginn.';
  }
  return null;
}

const matchSchema = z.object({
  id: z.string(),
  patient_id: z.string(),
  patient_given_name: z.string(),
  patient_family_name: z.string(),
  phone: z.string().nullable(),
  phone_mobile: z.string().nullable(),
  treatment_basis_id: z.string().nullable(),
  appointment_type: appointmentTypeSchema,
  duration_minutes: z.number(),
  time_windows: z.array(windowSchema),
  needed_by: z.string().nullable(),
  priority_reason: reasonSchema,
  territory_status: z.enum(['none', 'match', 'outside']),
  updated_at: z.string(),
});
export type WaitlistMatch = z.infer<typeof matchSchema>;

/** Ein freier Platz: wer, an welchem Tag, von wann bis wann (Praxiszeit). */
export interface FreeSlot {
  staffMemberId: string;
  date: string;
  start: string;
  end: string;
  /** Die Person, die gerade abgesagt hat — sie passt nicht auf ihren eigenen Platz. */
  excludePatientId?: string | null;
}

/**
 * Nachrücken (PRX-004): offene Einträge, die auf einen freien Platz passen.
 * Die Regel steht im Server (`list_waitlist_matches`).
 */
export async function fetchWaitlistMatches(slot: FreeSlot): Promise<WaitlistMatch[]> {
  const fallback = 'Die passenden Einträge der Warteliste konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_waitlist_matches', {
    p_staff_member_id: slot.staffMemberId,
    p_date: slot.date,
    p_start_time: slot.start,
    p_end_time: slot.end,
    p_exclude_patient_id: slot.excludePatientId ?? null,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(fallback);
  return antwort(z.array(matchSchema), data ?? [], fallback);
}

/** „09:00" plus Minuten, ohne Tageswechsel. */
export function addMinutes(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

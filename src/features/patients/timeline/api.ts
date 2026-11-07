import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

// Was ankommt, entscheidet der Server je Rolle (ANN-847); die Seiten blenden nichts aus.
// Lesen zählt als Öffnen der Akte (einmal je Tag), deshalb ohne Neuladen beim Fokuswechsel.

const eintragSchema = z.object({
  on: z.string(),
  at: z.string().nullable(),
  kind: z.string(),
  state: z.string().nullable(),
  label: z.string().nullable(),
  detail: z.string().nullable(),
  ref: z.string().nullable(),
});

export type Zeitstrahleintrag = z.infer<typeof eintragSchema>;

const zeitstrahlSchema = z.object({
  today: z.string(),
  time_zone: z.string(),
  from: z.string(),
  to: z.string().nullable(),
  has_more: z.boolean(),
  entries: z.array(eintragSchema),
});

export type Zeitstrahlfenster = z.infer<typeof zeitstrahlSchema>;

/** Tage je Fenster; „Weiter zurück“ holt das nächste (ANN-847). */
export const FENSTER_TAGE = 92;

export function zeitstrahlKey(patientId: string) {
  return ['patient-timeline', patientId] as const;
}

/** Ein Fenster bis `bis` (einschließlich); ohne `bis` ab heute nach vorn offen. */
export async function fetchZeitstrahl(
  patientId: string,
  bis: string | null,
): Promise<Zeitstrahlfenster | null> {
  const satz = 'Der Zeitstrahl konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_patient_timeline', {
    p_patient_id: patientId,
    p_before: bis,
    p_days: FENSTER_TAGE,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  if (data === null) return null;
  return antwort(zeitstrahlSchema, data, satz);
}

const vorbereitungSchema = z.object({
  today: z.string(),
  time_zone: z.string(),
  last_session_on: z.string().nullable(),
  next_appointment: z
    .object({
      id: z.string(),
      starts_at: z.string(),
      ends_at: z.string(),
      appointment_type: z.string(),
    })
    .nullable(),
  open_messages: z
    .array(
      z.object({ id: z.string(), topic: z.string(), due_on: z.string(), overdue: z.boolean() }),
    )
    .nullable(),
  checkin_due_on: z.string().nullable(),
  plans_review: z
    .array(z.object({ id: z.string(), title: z.string(), runs_until: z.string() }))
    .nullable(),
  documentation_open: z
    .array(z.object({ id: z.string(), starts_at: z.string(), note_status: z.string() }))
    .nullable(),
  goals: z
    .array(
      z.object({
        treatment_basis_id: z.string(),
        issued_on: z.string(),
        kind: z.string(),
        text: z.string(),
      }),
    )
    .nullable(),
});

export type Vorbereitung = z.infer<typeof vorbereitungSchema>;

export function vorbereitungKey(patientId: string) {
  return ['session-preparation', patientId] as const;
}

export async function fetchVorbereitung(patientId: string): Promise<Vorbereitung | null> {
  const satz = 'Die Sitzungsvorbereitung konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_session_preparation', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  if (data === null) return null;
  return antwort(vorbereitungSchema, data, satz);
}

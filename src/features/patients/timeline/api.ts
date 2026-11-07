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

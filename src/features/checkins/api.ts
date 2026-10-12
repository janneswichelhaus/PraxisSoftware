import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

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
  schedule: z
    .object({
      interval_days: z.number(),
      parameter_keys: z.array(z.string()),
      starts_on: z.string(),
      due_on: z.string(),
      updated_at: z.string(),
      updated_by_name: z.string().nullable(),
    })
    .nullable(),
  checkins: z.array(checkinSchema),
});

export type CheckinDaten = z.infer<typeof datenSchema>;
export type Checkin = z.infer<typeof checkinSchema>;

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

/** „alle 7 Tage", „täglich" (ANN-350). */
export function taktText(tage: number): string {
  return tage === 1 ? 'täglich' : `alle ${tage} Tage`;
}

/** Die Takte zur Auswahl; die Datenbank nimmt 1 bis 28 (ANN-350). */
export const TAKTE = [1, 2, 3, 7, 14, 28] as const;

import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import type { Coordinate } from '@/lib/location/contract';

/**
 * Die beiden Serveraufrufe von „Passt es?“ (UBK-012, ANN-238). Eigene Datei,
 * damit Seitentests sie festlegen können.
 */

const positionSchema = z.object({
  lat: z.number().nullable(),
  lon: z.number().nullable(),
});

/**
 * Die Koordinate der Patientenadresse für einen neuen Hausbesuch - `null`,
 * solange die Adresse nicht verortet ist. Nur die Koordinate, kein Name, keine
 * Adresse (ANN-016).
 */
export async function fetchVisitPosition(patientId: string): Promise<Coordinate | null> {
  const { data, error } = (await getSupabase().rpc('get_visit_position', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error('Die Kartenposition der Adresse konnte nicht geladen werden.');
  const zeile = z.array(positionSchema).parse(data ?? [])[0];
  if (!zeile || zeile.lat === null || zeile.lon === null) return null;
  return { lat: zeile.lat, lon: zeile.lon };
}

/** Ein geplanter Termin mit Anfahrt und Weiterfahrt, wie `check_travel_fit` ihn nimmt. */
export interface Passfrage {
  index: number;
  duration_minutes: number;
  starts_at?: string;
  previous_end?: string;
  travel_to_seconds?: number;
  next_start?: string;
  travel_from_seconds?: number;
}

const antwortSchema = z.object({
  item_index: z.number(),
  starts_at: z.string(),
  arrival_earliest_start: z.string().nullable(),
  arrival_slack_minutes: z.number().nullable(),
  next_earliest_start: z.string().nullable(),
  departure_slack_minutes: z.number().nullable(),
});

export type Passantwort = z.infer<typeof antwortSchema>;

/**
 * Frühester Beginn und Luft nach der Rundungsregel aus §8.1 - gerechnet allein
 * im Server (ANN-097). Speichert nichts.
 */
export async function checkTravelFit(fragen: readonly Passfrage[]): Promise<Passantwort[]> {
  if (fragen.length === 0) return [];
  const { data, error } = (await getSupabase().rpc('check_travel_fit', {
    p_items: fragen,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error('Der Fahrweg konnte nicht geprüft werden.');
  return z.array(antwortSchema).parse(data ?? []);
}

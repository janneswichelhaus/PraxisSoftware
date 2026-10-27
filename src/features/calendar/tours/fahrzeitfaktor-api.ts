import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Lesen und Setzen des Fahrzeitfaktors (UBK-010, ANN-237). Eigene Datei,
 * damit Seitentests den Faktor festlegen können, ohne den Datenbankweg
 * nachzubilden; angewendet wird er in `fahrzeitfaktor.ts`.
 */

const faktorSchema = z.object({ travel_time_factor: z.coerce.number() });

export async function fetchFahrzeitfaktor(): Promise<number> {
  // RLS liefert Praxiskonten genau die eigene Organisation.
  const { data, error } = await getSupabase()
    .from('organizations')
    .select('travel_time_factor')
    .maybeSingle();
  if (error || !data) throw new Error('Der Fahrzeitfaktor konnte nicht geladen werden.');
  return faktorSchema.parse(data).travel_time_factor;
}

/** Verbindlich prüft `set_travel_time_factor`: nur owner, 1,0 bis 2,5, Schritt 0,1. */
export async function saveFahrzeitfaktor(faktor: number): Promise<void> {
  const { error } = await getSupabase().rpc('set_travel_time_factor', {
    p_factor: Math.round(faktor * 10) / 10,
  });
  if (error) throw new Error('Der Fahrzeitfaktor konnte nicht gespeichert werden.');
}

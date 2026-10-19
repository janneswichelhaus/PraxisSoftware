import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import {
  lebensmittelfehler,
  lebensmittelSchema,
  quelleSchema,
  type Lebensmittel,
  type LebensmittelAngaben,
  type Quelle,
} from './lebensmittel';

// -----------------------------------------------------------------------------
// Praxis: Suche, Lebensmittel der Praxis, Quellen (ERN-EPIC-002)
// -----------------------------------------------------------------------------

const trefferSchema = z.array(lebensmittelSchema);
const quellenSchema = z.array(quelleSchema);

export const LEBENSMITTEL_SCHLUESSEL = ['lebensmittel'] as const;

async function rpc(funktion: string, parameter?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = (await getSupabase().rpc(funktion, parameter)) as {
    data: unknown;
    error: { message?: string } | null;
  };
  if (error) throw new Error(lebensmittelfehler(error.message));
  return data;
}

/** Die Suche der Beratung (`search_foods`). */
export async function lebensmittelSuchen(begriff: string): Promise<Lebensmittel[]> {
  const daten = await rpc('search_foods', { p_query: begriff, p_limit: 20 });
  return antwort(trefferSchema, daten, 'Die Suche hat nicht geklappt.');
}

export async function lebensmittelQuellen(): Promise<Quelle[]> {
  const daten = await rpc('list_food_sources');
  return antwort(quellenSchema, daten, 'Die Quellen konnten nicht geladen werden.');
}

export async function praxisLebensmittel(): Promise<Lebensmittel[]> {
  const daten = await rpc('list_practice_foods');
  return antwort(trefferSchema, daten, 'Die Lebensmittel konnten nicht geladen werden.');
}

export async function praxisLebensmittelSpeichern(
  id: string | null,
  angaben: LebensmittelAngaben,
  stand: string | null,
): Promise<string> {
  const daten = await rpc('save_practice_food', {
    p_id: id,
    p_food: angaben,
    p_expected: stand,
  });
  return String(daten);
}

export async function praxisLebensmittelAblegen(id: string): Promise<void> {
  await rpc('archive_practice_food', { p_id: id });
}

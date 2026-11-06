import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { rezeptfehler, rezeptSchema, type Rezept, type RezeptAngaben } from './rezepte';

// Praxis: die Rezepte der Beratung (ADR-027 Punkt 9), allein mit der Fähigkeit
// „Ernährungsberatung“; die Werte rechnet der Server.

export const REZEPTE_SCHLUESSEL = ['rezepte'] as const;

async function rpc(funktion: string, parameter?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = (await getSupabase().rpc(funktion, parameter)) as {
    data: unknown;
    error: { message?: string } | null;
  };
  if (error) throw new Error(rezeptfehler(error.message));
  return data;
}

export async function praxisRezepte(): Promise<Rezept[]> {
  const daten = await rpc('list_practice_recipes');
  return antwort(z.array(rezeptSchema), daten, 'Die Rezepte konnten nicht geladen werden.');
}

/** Ein Rezept der Praxis anlegen (`id` null) oder ändern; `stand` schützt vor gleichzeitigem Ändern. */
export async function praxisRezeptSpeichern(
  id: string | null,
  angaben: RezeptAngaben,
  stand: string | null,
): Promise<string> {
  const daten = await rpc('save_practice_recipe', {
    p_id: id,
    p_recipe: angaben,
    p_expected: stand,
  });
  return String(daten);
}

export async function praxisRezeptAblegen(id: string): Promise<void> {
  await rpc('archive_practice_recipe', { p_id: id });
}

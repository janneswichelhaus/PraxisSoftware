import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { lebensmittelSuchen } from './lebensmittelApi';
import {
  rezeptfehler,
  rezeptPruefen,
  rezeptSchema,
  startrezeptAufloesen,
  type Rezept,
  type RezeptAngaben,
} from './rezepte';
import { STARTREZEPTE, type Startrezept } from './startrezepte';

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

/**
 * Ein mitgeliefertes Rezept unverändert übernehmen (ADR-027 Punkt 14), etwa aus der Planauswahl:
 * nur, wenn jede Zutat genau so im Katalog steht; sonst prüft die Beratung es unter „Rezepte“.
 */
export async function startrezeptUebernehmen(start: Startrezept): Promise<Rezept> {
  const { werte, fehlt, ungenau } = await startrezeptAufloesen(start, lebensmittelSuchen);
  const ergebnis = rezeptPruefen(werte);
  if (fehlt.length > 0 || ungenau.length > 0 || 'fehler' in ergebnis) {
    throw new Error(`„${start.name}“ bitte unter Rezepte prüfen und übernehmen.`);
  }
  const id = await praxisRezeptSpeichern(
    null,
    { ...ergebnis.angaben, starter_key: start.schluessel },
    null,
  );
  const neu = (await praxisRezepte()).find((r) => r.id === id);
  if (!neu) throw new Error('Das Rezept konnte nicht geladen werden.');
  return neu;
}

/** Die mitgelieferten Rezepte für die Planauswahl; nach dem Übernehmen stehen sie bei der Praxis. */
export function useMitgeliefert() {
  const queryClient = useQueryClient();
  return {
    liste: STARTREZEPTE,
    uebernehmen: async (start: Startrezept): Promise<Rezept> => {
      const neu = await startrezeptUebernehmen(start);
      await queryClient.invalidateQueries({ queryKey: REZEPTE_SCHLUESSEL });
      return neu;
    },
  };
}

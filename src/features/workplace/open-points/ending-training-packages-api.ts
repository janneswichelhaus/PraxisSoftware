import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Trainingspakete ohne Anschluss: enden in vier Wochen ohne Folgepaket, nach derselben Regel wie
 * die Kennzahl der Statistik (ANN-831, ANN-834). Welche Zeilen eine Rolle sieht, entscheidet der
 * Server (owner, office).
 */

const paketSchema = z.object({
  training_relationship_id: z.string(),
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  package_months: z.number(),
  ends_on: z.string(),
  /** Noch in Behandlung: Ein Folgepaket beginnt erst nach deren Abschluss (ANN-278). */
  care_open: z.boolean(),
});

export type EndingTrainingPackage = z.infer<typeof paketSchema>;

export const ENDING_TRAINING_PACKAGES_KEY = ['open-points', 'ending-training-packages'] as const;

export async function fetchEndingTrainingPackages(): Promise<EndingTrainingPackage[]> {
  const satz = 'Die endenden Trainingspakete konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_ending_training_packages')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(z.array(paketSchema), data ?? [], satz);
}

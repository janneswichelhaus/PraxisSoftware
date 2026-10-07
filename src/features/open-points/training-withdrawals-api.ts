import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Widerrufe von Trainingsverträgen über die Plattform (KND-004, § 356a BGB).
 * Wie die Kündigungen des Abos ein Hinweis für 14 Tage; danach steht der
 * Widerruf am Trainingsverhältnis. Welche Zeilen eine Rolle sieht,
 * entscheidet der Server (owner, office).
 */

const widerrufSchema = z.object({
  contract_id: z.string(),
  training_relationship_id: z.string(),
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  withdrawn_on: z.string(),
  package_label: z.string(),
  withdrawn_access_kind: z.enum(['self', 'legal_representative']),
  withdrawn_representative_name: z.string().nullable(),
});

export type Trainingswiderruf = z.infer<typeof widerrufSchema>;

export const TRAININGSWIDERRUFE_KEY = ['open-points', 'training-withdrawals'] as const;

export async function fetchTrainingswiderrufe(): Promise<Trainingswiderruf[]> {
  const satz = 'Die Widerrufe konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_platform_training_withdrawals')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(z.array(widerrufSchema), data ?? [], satz);
}

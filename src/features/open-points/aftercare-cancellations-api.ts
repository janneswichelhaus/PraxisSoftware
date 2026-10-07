import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Kündigungen des Nachsorge-Abos über die Plattform (ANG-003, DSN-001
 * Abschnitt 6). Wie die Widerrufe (ANN-263) ein Hinweis für 14 Tage, keine
 * Aufgabe: Danach steht die Kündigung nur in der Akte. Welche Zeilen eine
 * Rolle sieht, entscheidet der Server (owner, office).
 */

const kuendigungSchema = z.object({
  subscription_id: z.string(),
  patient_id: z.string(),
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  cancelled_on: z.string(),
  ends_on: z.string(),
  cancelled_access_kind: z.enum(['self', 'legal_representative']),
  cancelled_representative_name: z.string().nullable(),
});

export type AboKuendigung = z.infer<typeof kuendigungSchema>;

export const ABO_KUENDIGUNGEN_KEY = ['open-points', 'aftercare-cancellations'] as const;

export async function fetchAboKuendigungen(): Promise<AboKuendigung[]> {
  const satz = 'Die Kündigungen konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_platform_aftercare_cancellations')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(z.array(kuendigungSchema), data ?? [], satz);
}

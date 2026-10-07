import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { zweckTexte } from '@/features/datenschutz/vermerke';

/**
 * Widerrufe über die Plattform (POR-016, DSN-001 Abschnitt 6, ANN-263).
 *
 * Was die Person selbst widerruft, muss die Praxis erfahren, bevor sie den
 * nächsten Bericht oder die nächste Mail auf einer Grundlage schickt, die es
 * nicht mehr gibt. Die Liste ist ein Hinweis, keine Aufgabe: 14 Tage stehen
 * die Widerrufe hier, danach nur in der Akte bzw. am Trainingsverhältnis.
 * Welche Zeilen eine Rolle sieht, entscheidet der Server.
 */

const widerrufSchema = z.object({
  id: z.string(),
  relationship_kind: z.enum(['treatment', 'training']),
  patient_id: z.string().nullable(),
  training_relationship_id: z.string().nullable(),
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  purpose: z.string(),
  occurred_on: z.string(),
  recorded_at: z.string(),
  platform_access_kind: z.enum(['self', 'legal_representative']),
  representative_name: z.string().nullable(),
});

export type ConsentWithdrawal = z.infer<typeof widerrufSchema>;

export const CONSENT_WITHDRAWALS_KEY = ['open-points', 'consent-withdrawals'] as const;

/** Die Zwecke in der Sprache der Praxis, Behandlung und Training (POR-017). */
export function purposeLabel(purpose: string): string {
  if (purpose in zweckTexte) return zweckTexte[purpose as keyof typeof zweckTexte].label;
  if (purpose === 'training_health_data') return 'Gesundheitsangaben im Training';
  return 'Einwilligung';
}

export async function fetchConsentWithdrawals(): Promise<ConsentWithdrawal[]> {
  const satz = 'Die Widerrufe konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_platform_consent_withdrawals')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(z.array(widerrufSchema), data ?? [], satz);
}

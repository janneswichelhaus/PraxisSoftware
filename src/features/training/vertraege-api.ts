import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Die im eigenen Konto geschlossenen Trainingsverträge eines Verhältnisses
 * (KND-003, KND-004): owner und office, die Rollen des Pakets.
 */

const vertragSchema = z.object({
  id: z.string(),
  concluded_at: z.string(),
  /** Der Tag des Abschlusses in der Zeitzone der Praxis. */
  concluded_on: z.string(),
  package_label: z.string(),
  price_cents: z.number(),
  currency: z.string(),
  starts_on: z.string(),
  ends_on: z.string(),
  wording_version: z.string(),
  early_start_requested: z.boolean(),
  withdrawal_ends_on: z.string(),
  withdrawn_on: z.string().nullable(),
  withdrawn_access_kind: z.enum(['self', 'legal_representative']).nullable(),
  withdrawn_representative_name: z.string().nullable(),
});

export type Kontovertrag = z.infer<typeof vertragSchema>;

export function vertraegeSchluessel(relationshipId: string) {
  return ['training-contracts', relationshipId] as const;
}

/** `null` heißt: für diese Rolle nicht sichtbar. */
export async function fetchVertraege(relationshipId: string): Promise<Kontovertrag[] | null> {
  const satz = 'Die Verträge konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_training_contracts', {
    p_relationship_id: relationshipId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(vertragSchema).nullable(), data ?? null, satz);
}

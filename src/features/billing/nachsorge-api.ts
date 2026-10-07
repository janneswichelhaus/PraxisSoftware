import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Das Nachsorge-Abo an der Akte (ANG-EPIC-001, ADR-009 Punkt 21,
 * PROJECT_PRINCIPLES.md 4.6 und 19).
 *
 * Anlegen, lesen und beenden dürfen owner und office; welche Zeilen eine
 * Rolle sieht und was sie darf, entscheidet der Server (ADR-004).
 */

const aboSchema = z.object({
  id: z.string(),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  created_at: z.string(),
  created_by_name: z.string().nullable(),
  cancelled_on: z.string().nullable(),
  cancelled_via: z.enum(['practice', 'platform']).nullable(),
  cancelled_access_kind: z.enum(['self', 'legal_representative']).nullable(),
  cancelled_representative_name: z.string().nullable(),
  /** Laufend: das Ende, auf das eine Kündigung heute fiele (ANN-270). */
  current_month_end: z.string().nullable(),
  /** Laufend: der Beginn des nächsten Abo-Monats. */
  next_month_start: z.string().nullable(),
});

export type Nachsorgeabo = z.infer<typeof aboSchema>;

const sichtSchema = z.object({
  today: z.string(),
  /** Abschluss der Versorgung; vorher gibt es kein Abo (ANN-268). */
  earliest_start: z.string().nullable(),
  subscriptions: z.array(aboSchema),
});

export type Nachsorgesicht = z.infer<typeof sichtSchema>;

export function nachsorgeSchluessel(patientId: string) {
  return ['nachsorge', patientId] as const;
}

/** Die Abos der Akte; `null` heißt: für diese Rolle nicht sichtbar. */
export async function fetchNachsorge(patientId: string): Promise<Nachsorgesicht | null> {
  const satz = 'Das Nachsorge-Abo konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_patient_aftercare', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(sichtSchema.nullable(), data ?? null, satz);
}

export async function createNachsorge(patientId: string, beginn: string): Promise<void> {
  const { error } = (await getSupabase().rpc('create_aftercare_subscription', {
    p_patient_id: patientId,
    p_starts_on: beginn,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('care is not concluded')) {
    throw new Error('Erst die Versorgung abschließen – das Abo beginnt nach der Behandlung.');
  }
  if (error?.message?.includes('before care is concluded')) {
    throw new Error('Das Abo beginnt frühestens am Tag des Abschlusses der Versorgung.');
  }
  if (error?.message?.includes('already covers')) {
    throw new Error('Für diesen Tag besteht schon ein Abo.');
  }
  if (error) throw new Error('Das Abo konnte nicht angelegt werden.');
}

export async function deleteNachsorge(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('delete_aftercare_subscription', {
    p_subscription_id: id,
  })) as { error: { message?: string; code?: string } | null };

  if (error?.code === '23503') {
    throw new Error(
      'Aus dem Abo ist schon eine Leistung entstanden; es endet nur durch Kündigung.',
    );
  }
  if (error) throw new Error('Das Abo konnte nicht entfernt werden.');
}

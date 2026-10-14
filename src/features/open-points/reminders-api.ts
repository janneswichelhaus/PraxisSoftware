import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Erinnerung am Rezeptende (PRX-016, ANN-146). Die Liste fragt nur - sie
 * setzt nichts. Die Erinnerung an den vergessenen Abschluss ist mit B1
 * (BEF-151, ANN-511) entfallen: Die Frist rechnet ab der letzten Behandlung.
 */

const endingSchema = z.object({
  treatment_basis_id: z.string(),
  patient_id: z.string(),
  patient_given_name: z.string(),
  patient_family_name: z.string(),
  treatment_basis_kind: z.enum(['first', 'follow_up', 'self_pay']),
  issued_on: z.string(),
  prescribed: z.coerce.number(),
  used: z.coerce.number(),
  planned: z.coerce.number(),
  last_appointment_at: z.string().nullable(),
  has_recommendation: z.boolean(),
  prescriber_name: z.string().nullable(),
  prescriber_phone: z.string().nullable(),
});
export type EndingPrescription = z.infer<typeof endingSchema>;

export const ENDING_KEY = ['open-points', 'ending-prescriptions'] as const;

export async function fetchEndingPrescriptions(): Promise<EndingPrescription[]> {
  const satz = 'Die endenden Verordnungen konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_ending_prescriptions')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(z.array(endingSchema), data ?? [], satz);
}

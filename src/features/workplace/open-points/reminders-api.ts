import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Erinnerungen am Rezeptende und an Akten ohne jede Behandlung (PRX-016,
 * ANN-146, ANN-511). Beide Listen fragen nur - sie setzen nichts und starten
 * keine Frist. Seit B1 rechnet die Frist ab der letzten Behandlung; nur eine
 * Akte ohne Behandlung braucht noch den Abschluss (Zweitreview A).
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

const idleSchema = z.object({
  patient_id: z.string(),
  patient_given_name: z.string(),
  patient_family_name: z.string(),
  last_appointment_at: z.string().nullable(),
  patient_created_at: z.string(),
});
export type CareWithoutConclusion = z.infer<typeof idleSchema>;

export const ENDING_KEY = ['open-points', 'ending-prescriptions'] as const;
export const IDLE_KEY = ['open-points', 'care-without-conclusion'] as const;

export async function fetchEndingPrescriptions(): Promise<EndingPrescription[]> {
  const satz = 'Die endenden Verordnungen konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_ending_prescriptions')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(z.array(endingSchema), data ?? [], satz);
}

export async function fetchCareWithoutConclusion(): Promise<CareWithoutConclusion[]> {
  const satz = 'Die Akten ohne Behandlung konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_care_without_conclusion')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(z.array(idleSchema), data ?? [], satz);
}

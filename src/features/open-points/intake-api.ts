import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Erstaufnahme-Checkliste (PRX-013, ANN-143): fünf Punkte, abgeleitet aus der
 * Akte. Nichts davon wird hier gesetzt - erledigt ist ein Punkt, wenn in der
 * Akte steht, was er verlangt.
 */

export const INTAKE_ITEMS = [
  'prescription_photo',
  'anamnesis',
  'privacy',
  'finding',
  'treatment_table',
] as const;
export type IntakeItem = (typeof INTAKE_ITEMS)[number];

export const intakeItemLabels: Record<IntakeItem, string> = {
  prescription_photo: 'Verordnungsfoto',
  anamnesis: 'Anamnesebogen',
  privacy: 'Datenschutz und Vertrag',
  finding: 'Befund',
  treatment_table: 'Liege',
};

/** Wo der Punkt in der Akte erledigt wird. */
export function intakeItemTarget(patientId: string, item: IntakeItem): string {
  const bereich: Record<IntakeItem, string> = {
    prescription_photo: 'verordnungen',
    anamnesis: 'befund',
    privacy: 'datenschutz',
    finding: 'befund',
    treatment_table: 'befund',
  };
  return `/patienten/${patientId}/${bereich[item]}`;
}

const itemSchema = z.enum(INTAKE_ITEMS);

const checklistSchema = z.array(
  z.object({ item: itemSchema, state: z.enum(['done', 'open', 'not_needed']) }),
);
export type IntakeChecklist = z.infer<typeof checklistSchema>;

const openIntakeSchema = z.object({
  patient_id: z.string(),
  patient_given_name: z.string(),
  patient_family_name: z.string(),
  open_items: z.array(itemSchema),
});
export type OpenIntake = z.infer<typeof openIntakeSchema>;

export const OPEN_INTAKES_KEY = ['open-points', 'intakes'] as const;

export async function fetchIntakeChecklist(patientId: string): Promise<IntakeChecklist> {
  const satz = 'Die Erstaufnahme konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_intake_checklist', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(checklistSchema, data ?? [], satz);
}

export async function fetchOpenIntakes(): Promise<OpenIntake[]> {
  const satz = 'Die offenen Erstaufnahmen konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_open_intakes')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(z.array(openIntakeSchema), data ?? [], satz);
}

/** „Befund · Liege" - die offenen Punkte als eine Zeile. */
export function openItemsText(items: readonly IntakeItem[]): string {
  return items.map((item) => intakeItemLabels[item]).join(' · ');
}

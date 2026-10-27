import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { BAUARTEN } from '@/features/patients/treatment-bases/api';

// -----------------------------------------------------------------------------
// Vertretungs-Kurzblick am Termin (PRX-006, ANN-137)
//
// Ein eigener Lesepfad: `get_appointment_brief` liefert nur, was vor der Tür
// zählt, und protokolliert das Lesen als „Akte geöffnet“, einmal je Akte und
// Tag (LOG-EPIC-001, ANN-230). Aufgerufen wird er deshalb erst auf eine
// Handlung hin, nie vorab: beim Aufklappen des Kurzblicks, an „Vor der Tür“
// der Tageskarte (K3) und mit „Wie zuletzt“ auf der Schreibseite (K6).
// -----------------------------------------------------------------------------

const positionSchema = z.object({
  remedy: z.string(),
  prescribed_quantity: z.number(),
  used_quantity: z.number(),
});

const kurzblickSchema = z.object({
  appointment_id: z.string(),
  patient_id: z.string(),
  home_visit_access_note: z.string().nullable(),
  special_note: z.string().nullable(),
  take_along_items: z.array(z.string()),
  primary_therapist_name: z.string().nullable(),
  treatment_basis_id: z.string().nullable(),
  treatment_basis_kind: z.enum(BAUARTEN).nullable(),
  treatment_basis_issued_on: z.string().nullable(),
  basis_appointment_count: z.number().nullable(),
  basis_used: z.number().nullable(),
  basis_planned: z.number().nullable(),
  basis_items: z.array(positionSchema).nullable(),
  last_note_id: z.string().nullable(),
  last_note_appointment_start: z.string().nullable(),
  last_note_status: z.enum(['draft', 'final']).nullable(),
  last_note_content: z.string().nullable(),
  last_note_visit_without_treatment: z.boolean().nullable(),
  last_note_author_name: z.string().nullable(),
  organization_time_zone: z.string(),
});
export type Kurzblick = z.infer<typeof kurzblickSchema>;

/**
 * Den Kurzblick eines Behandlungstermins lesen.
 *
 * `null` heißt: Der Termin ist nicht (mehr) zu sehen oder die Rolle darf den
 * Blick nicht lesen - die Serverfunktion weist dann mit null Zeilen ab.
 */
export async function fetchKurzblick(appointmentId: string): Promise<Kurzblick | null> {
  const { data, error } = (await getSupabase().rpc('get_appointment_brief', {
    p_appointment_id: appointmentId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Der Kurzblick konnte nicht geladen werden.');
  const zeilen = z.array(kurzblickSchema).parse(data ?? []);
  return zeilen[0] ?? null;
}

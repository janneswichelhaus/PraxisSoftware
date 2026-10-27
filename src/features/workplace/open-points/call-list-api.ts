import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Anrufliste mit gespeichertem Stand (PRX-014, ANN-144).
 *
 * „Erreicht" setzt den Mitteilungsvermerk „telefonisch" am Termin (CAL-012);
 * „nicht erreicht" und „Nachricht hinterlassen" sind ein kurzlebiger Stand am
 * Termin, kein Merkmal der Person (§20).
 */

const channelSchema = z.enum(['slip', 'phone', 'in_person', 'email']);

const callEntrySchema = z.object({
  appointment_id: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  appointment_type: z.enum(['home_visit', 'practice', 'video']),
  location_name: z.string().nullable(),
  staff_name: z.string().nullable(),
  patient_id: z.string(),
  patient_given_name: z.string(),
  patient_family_name: z.string(),
  phone: z.string().nullable(),
  phone_mobile: z.string().nullable(),
  notified_channels: z.array(channelSchema),
  call_outcome: z.enum(['not_reached', 'voicemail']).nullable(),
  call_attempts: z.coerce.number().nullable(),
  call_recorded_at: z.string().nullable(),
  call_recorded_by_name: z.string().nullable(),
  organization_time_zone: z.string(),
});

export type CallEntry = z.infer<typeof callEntrySchema>;
export type CallOutcome = 'reached' | 'not_reached' | 'voicemail' | 'cleared';

export const CALL_LIST_KEY = ['open-points', 'call-list'] as const;

const LOAD_ERROR = 'Die Anrufliste konnte nicht geladen werden.';

export async function fetchCallList(date: string): Promise<CallEntry[]> {
  const { data, error } = (await getSupabase().rpc('list_call_list', { p_date: date })) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(LOAD_ERROR);
  return antwort(z.array(callEntrySchema), data ?? [], LOAD_ERROR);
}

export async function recordCallOutcome(
  appointmentId: string,
  outcome: CallOutcome,
): Promise<void> {
  const { error } = (await getSupabase().rpc('record_call_outcome', {
    p_appointment_id: appointmentId,
    p_outcome: outcome,
  })) as { error: unknown };
  if (error) throw new Error('Der Anruf konnte nicht vermerkt werden. Bitte erneut versuchen.');
}

/** Wer muss noch angerufen werden? Wer schon mitgeteilt ist, nicht. */
export function stillToCall(entry: Pick<CallEntry, 'notified_channels'>): boolean {
  return entry.notified_channels.length === 0;
}

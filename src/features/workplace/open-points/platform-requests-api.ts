import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { formatDate } from '@/lib/datum';
import { getSupabase } from '@/lib/supabase';

/**
 * Terminwünsche von der Plattform (POR-011, DSN-001 Abschnitt 6, D4).
 *
 * Ein Wunsch ist ein Wunsch (§8): Die Praxis macht daraus einen Termin, trägt
 * die Absage ein oder antwortet „nicht möglich". Wer sieht und antwortet,
 * prüft der Server je Kontext (`app.may_write_appointment_context`).
 */

const wunschSchema = z.object({
  id: z.string(),
  kind: z.enum(['new', 'change', 'cancel']),
  relationship_kind: z.enum(['treatment', 'training']),
  patient_id: z.string().nullable(),
  training_relationship_id: z.string().nullable(),
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  appointment_id: z.string().nullable(),
  appointment_starts_at: z.string().nullable(),
  appointment_ends_at: z.string().nullable(),
  appointment_updated_at: z.string().nullable(),
  appointment_status: z.string().nullable(),
  /** Kalendertage `YYYY-MM-DD`. */
  preferred_days: z.array(z.string()),
  preferred_times: z.array(z.enum(['morning', 'midday', 'afternoon'])),
  note: z.string().nullable(),
  status: z.enum(['open', 'done', 'declined', 'withdrawn']),
  created_at: z.string(),
  requested_by: z.enum(['self', 'legal_representative', 'companion']),
  representative_name: z.string().nullable(),
  resolved_at: z.string().nullable(),
  answer: z.string().nullable(),
  resulting_appointment_id: z.string().nullable(),
});

export type PlatformRequest = z.infer<typeof wunschSchema>;

export const PLATFORM_REQUESTS_KEY = ['open-points', 'platform-requests'] as const;

export const TIME_OF_DAY_LABEL: Record<PlatformRequest['preferred_times'][number], string> = {
  morning: 'Vormittag',
  midday: 'Mittag',
  afternoon: 'Nachmittag',
};

export const REQUEST_KIND_LABEL: Record<PlatformRequest['kind'], string> = {
  new: 'Terminwunsch',
  change: 'Änderungswunsch',
  cancel: 'Absagewunsch',
};

export async function fetchPlatformRequests(
  status: PlatformRequest['status'] = 'open',
): Promise<PlatformRequest[]> {
  const satz = 'Die Terminwünsche konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_platform_appointment_requests', {
    p_status: status,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(wunschSchema), data ?? [], satz);
}

/** Erledigt oder nicht möglich, mit kurzer Antwort an die Person (höchstens 300 Zeichen). */
export async function resolvePlatformRequest(eingabe: {
  id: string;
  outcome: 'done' | 'declined';
  answer: string;
  resultingAppointmentId?: string | null;
}): Promise<void> {
  const { data, error } = (await getSupabase().rpc('resolve_platform_appointment_request', {
    p_request_id: eingabe.id,
    p_outcome: eingabe.outcome,
    p_answer: eingabe.answer.trim() || null,
    p_resulting_appointment_id: eingabe.resultingAppointmentId ?? null,
  })) as { data: unknown; error: { message?: string } | null };
  if (error) {
    if (error.message?.includes('answer too long'))
      throw new Error('Die Antwort darf höchstens 300 Zeichen lang sein.');
    if (error.message?.includes('not found'))
      throw new Error('Dieser Wunsch ist schon beantwortet oder zurückgezogen.');
    throw new Error('Der Wunsch konnte nicht beantwortet werden.');
  }
  if (data !== true) throw new Error('Der Wunsch konnte nicht beantwortet werden.');
}

/**
 * Die Absage aus einem Absagewunsch (D4): Grund „Patient:in hat abgesagt",
 * Eingang = Zeitpunkt des Wunsches; die Frist rechnet der Server.
 */
export async function cancelFromRequest(id: string, expectedUpdatedAt: string): Promise<void> {
  const { error } = (await getSupabase().rpc('cancel_appointment_from_request', {
    p_request_id: id,
    p_expected_updated_at: expectedUpdatedAt,
  })) as { data: unknown; error: { message?: string } | null };
  if (error) {
    if (error.message?.includes('changed meanwhile'))
      throw new Error('Der Termin wurde zwischenzeitlich geändert. Bitte die Seite neu laden.');
    if (error.message?.includes('already cancelled'))
      throw new Error('Der Termin ist schon abgesagt. Bitte den Wunsch als erledigt beantworten.');
    if (error.message?.includes('not found'))
      throw new Error('Dieser Wunsch ist schon beantwortet oder zurückgezogen.');
    throw new Error('Die Absage konnte nicht eingetragen werden.');
  }
}

/** Was die Person gewünscht hat, in einem Satz. */
export function requestText(w: PlatformRequest): string {
  const tage = w.preferred_days.map((t) => formatDate(t)).join(', ');
  const zeiten = w.preferred_times.map((z) => TIME_OF_DAY_LABEL[z]).join(', ');
  return [tage, zeiten].filter((teil) => teil.length > 0).join(' · ');
}

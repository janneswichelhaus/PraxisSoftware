import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Rückfragen von der Plattform in der Praxis (KOM-002, KOM-003, DSN-001
 * Abschnitt 6).
 *
 * Wer welchen Vorgang liest und beantwortet, entscheidet der Server
 * (`app.can_read_platform_message`, `app.can_answer_platform_message`,
 * ANN-310, ANN-311). Die Liste trägt keinen Text; erst das Öffnen liest den
 * Inhalt und steht dafür als „Akte geöffnet" im Protokoll (ADR-010).
 */

export type Thema = 'exercise' | 'complaint' | 'organisational' | 'other';
export type Verhaeltnisart = 'treatment' | 'training';

export const THEMA_LABEL: Record<Thema, string> = {
  exercise: 'Übung',
  complaint: 'Beschwerden',
  organisational: 'Termin oder Rechnung',
  other: 'Sonstiges',
};

export const VON_LABEL: Record<'self' | 'legal_representative' | 'companion', string> = {
  self: 'selbst',
  legal_representative: 'rechtliche Vertretung',
  companion: 'Begleitung',
};

const themaSchema = z.enum(['exercise', 'complaint', 'organisational', 'other']);
const zustandSchema = z.enum(['open', 'answered', 'closed']);

const zeileSchema = z.object({
  id: z.string(),
  relationship_kind: z.enum(['treatment', 'training']),
  relationship_id: z.string(),
  patient_id: z.string().nullable(),
  training_relationship_id: z.string().nullable(),
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  topic: themaSchema,
  reference_label: z.string().nullable(),
  status: zustandSchema,
  due_on: z.string().nullable(),
  overdue: z.boolean(),
  created_at: z.string(),
  last_entry_at: z.string(),
  closed_at: z.string().nullable(),
  closed_by_side: z.enum(['person', 'practice']).nullable(),
  entry_count: z.number(),
  asked_by: z.enum(['self', 'legal_representative', 'companion']).nullable(),
  representative_name: z.string().nullable(),
  can_answer: z.boolean(),
  record_assigned_at: z.string().nullable(),
});
export type Rueckfragezeile = z.infer<typeof zeileSchema>;

const eintragSchema = z.object({
  id: z.string(),
  side: z.enum(['person', 'practice']),
  body: z.string(),
  author_kind: z.enum(['self', 'legal_representative', 'companion', 'staff']),
  author_label: z.string().nullable(),
  created_at: z.string(),
});
export type Rueckfrageeintrag = z.infer<typeof eintragSchema>;

const vorgangSchema = z.object({
  id: z.string(),
  relationship_kind: z.enum(['treatment', 'training']),
  relationship_id: z.string(),
  patient_id: z.string().nullable(),
  training_relationship_id: z.string().nullable(),
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  topic: themaSchema,
  reference_label: z.string().nullable(),
  exercise_plan_id: z.string().nullable(),
  status: zustandSchema,
  due_on: z.string().nullable(),
  overdue: z.boolean(),
  created_at: z.string(),
  closed_at: z.string().nullable(),
  closed_by_side: z.enum(['person', 'practice']).nullable(),
  record_assigned_at: z.string().nullable(),
  record_assigned_by_label: z.string().nullable(),
  can_answer: z.boolean(),
  /** KOM-004: Darf diese Person den Vorgang der Akte zuordnen? */
  can_assign: z.boolean().default(false),
  entries: z.array(eintragSchema),
});
export type Rueckfrage = z.infer<typeof vorgangSchema>;

export const RUECKFRAGEN_KEY = ['platform-messages'] as const;

export function rueckfragenKey(
  art: Verhaeltnisart | null,
  verhaeltnisId: string | null,
  mitErledigten: boolean,
) {
  return [...RUECKFRAGEN_KEY, 'list', art, verhaeltnisId, mitErledigten] as const;
}

export function rueckfrageKey(id: string) {
  return [...RUECKFRAGEN_KEY, 'detail', id] as const;
}

export async function fetchRueckfragen(
  art: Verhaeltnisart | null,
  verhaeltnisId: string | null = null,
  mitErledigten = false,
): Promise<Rueckfragezeile[]> {
  const satz = 'Die Rückfragen konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_platform_messages', {
    p_kind: art,
    p_relationship_id: verhaeltnisId,
    p_with_closed: mitErledigten,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(zeileSchema), data ?? [], satz);
}

/** Öffnen heißt lesen: steht als „Akte geöffnet" im Protokoll. */
export async function fetchRueckfrage(id: string): Promise<Rueckfrage | null> {
  const satz = 'Die Rückfrage konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_platform_message', {
    p_message_id: id,
  })) as { data: unknown; error: { code?: string } | null };
  if (error?.code === 'P0002') return null;
  if (error) throw new Error(satz);
  return antwort(vorgangSchema, data, satz);
}

function schreibfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('text is required')) return 'Bitte eine Antwort schreiben.';
  if (m.includes('text too long')) return 'Die Antwort darf höchstens 2000 Zeichen lang sein.';
  if (m.includes('is closed')) return 'Diese Rückfrage ist schon erledigt.';
  if (m.includes('not allowed'))
    return 'Auf diese Rückfrage antworten Therapeut:innen. Bitte gib sie weiter.';
  return 'Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.';
}

export async function answerRueckfrage(id: string, text: string): Promise<void> {
  const { error } = (await getSupabase().rpc('answer_platform_message', {
    p_message_id: id,
    p_body: text,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(schreibfehler(error.message));
}

export async function closeRueckfrage(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('close_platform_message_by_practice', {
    p_message_id: id,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(schreibfehler(error.message));
}

export const ANTWORTFRIST_KEY = ['platform-messages', 'response-workdays'] as const;

export async function fetchAntwortfrist(): Promise<number | null> {
  const { data, error } = (await getSupabase().rpc('get_message_response_workdays')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error('Die Antwortfrist konnte nicht geladen werden.');
  return antwort(z.number().int().nullable(), data ?? null, 'Die Antwortfrist fehlt.');
}

export async function saveAntwortfrist(werktage: number): Promise<void> {
  const { error } = (await getSupabase().rpc('set_message_response_workdays', {
    p_workdays: werktage,
  })) as { error: unknown };
  if (error) throw new Error('Nicht gespeichert. Erlaubt sind 1 bis 10 Werktage.');
}

/** Wohin die Person führt: Akte oder Trainingsverhältnis. */
export function personPfad(z: {
  relationship_kind: Verhaeltnisart;
  patient_id: string | null;
  training_relationship_id: string | null;
}): string | null {
  if (z.relationship_kind === 'treatment' && z.patient_id) return `/patienten/${z.patient_id}`;
  if (z.relationship_kind === 'training' && z.training_relationship_id)
    return `/training/${z.training_relationship_id}`;
  return null;
}

/** Wer auf der Seite der Person geschrieben hat, in Worten. */
export function verfasser(e: Rueckfrageeintrag, name: string): string {
  switch (e.author_kind) {
    case 'staff':
      return e.author_label ?? 'Praxis';
    case 'self':
      return name;
    case 'legal_representative':
      return `${e.author_label ?? 'Vertretung'} (rechtliche Vertretung)`;
    case 'companion':
      return `${e.author_label ?? 'Begleitung'} (Begleitung)`;
  }
}

// -----------------------------------------------------------------------------
// In die Akte (KOM-004, §10, IDEA-KOM-007, ANN-312)
// -----------------------------------------------------------------------------

/** Einen Vorgang der Akte zuordnen - endgültig, der Inhalt bleibt unverändert. */
export async function assignRueckfrage(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('assign_platform_message_to_record', {
    p_message_id: id,
  })) as { error: { message?: string } | null };
  if (error) {
    if ((error.message ?? '').includes('already assigned')) {
      throw new Error('Diese Rückfrage steht schon in der Akte.');
    }
    if ((error.message ?? '').includes('not allowed')) {
      throw new Error('In die Akte übernehmen Therapeut:innen, Teamleitung und Inhaber:in.');
    }
    throw new Error('Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.');
  }
}

const aktenvorgangSchema = z.object({
  id: z.string(),
  topic: themaSchema,
  reference_label: z.string().nullable(),
  status: zustandSchema,
  created_at: z.string(),
  record_assigned_at: z.string(),
  record_assigned_by_label: z.string(),
  entries: z.array(eintragSchema),
});
export type Aktenvorgang = z.infer<typeof aktenvorgangSchema>;

export function aktenNachrichtenKey(patientId: string) {
  return [...RUECKFRAGEN_KEY, 'record', patientId] as const;
}

/** Die der Akte zugeordneten Vorgänge mit Text; Lesen ist „Akte geöffnet". */
export async function fetchAktenNachrichten(patientId: string): Promise<Aktenvorgang[]> {
  const satz = 'Die Nachrichten der Akte konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_record_platform_messages', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(aktenvorgangSchema), data ?? [], satz);
}

/** Die Seite eines Vorgangs - im Bereich, zu dem er gehört (DSN-001 D1). */
export function rueckfragePfad(z: { id: string; relationship_kind: Verhaeltnisart }): string {
  return z.relationship_kind === 'training'
    ? `/training/rueckfragen/${z.id}`
    : `/rueckfragen/${z.id}`;
}

/** „06.10.2026" in der Zeitzone der Praxis - kurz, für Verlauf und Herkunft. */
export function kurzesDatum(iso: string, zeitzone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zeitzone,
  }).format(new Date(iso));
}

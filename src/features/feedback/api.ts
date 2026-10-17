import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Rückmeldungen von Beschäftigten (ORG-006, PROJECT_PRINCIPLES.md §20.2):
 * Barometer und Rückmeldung an die Praxisleitung über die Serverfunktionen aus
 * `supabase/migrations/20261203100000_org_006_rueckmeldungen.sql`.
 *
 * Wer abgibt und wer liest, entscheidet der Server; die Schwelle 3/5 steht
 * nur dort (ANN-607). Die Seiten fragen `can_take_part` und `can_read` nur
 * ab, um nicht anzubieten, was abgewiesen würde (ADR-004).
 *
 * **Freitext geht nie in eine Meldung, ein Log oder einen Schlüssel** (ADR-011):
 * Fehler werden hier in feste Sätze übersetzt, der Text bleibt im Feld.
 */

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const statusSchema = z.object({
  can_take_part: z.boolean(),
  can_read: z.boolean(),
  /** Der laufende Monat der Praxis, `YYYY-MM-01`. */
  month: z.string(),
  barometer_submitted: z.boolean(),
});
export type FeedbackStatus = z.infer<typeof statusSchema>;

const namedSchema = z.object({
  id: z.string(),
  kind: z.enum(['barometer', 'message']),
  month: z.string(),
  name: z.string().nullable(),
  mood: z.number().int().nullable(),
  tours: z.number().int().nullable(),
  team: z.number().int().nullable(),
  easier_text: z.string().nullable(),
  more_text: z.string().nullable(),
  message_text: z.string().nullable(),
});
export type NamedFeedback = z.infer<typeof namedSchema>;

const scaleSchema = z.union([
  z.object({ enough: z.literal(false) }),
  z.object({
    enough: z.literal(true),
    answered: z.number().int(),
    median: z.number(),
    distribution: z.array(z.number().int()).length(9),
  }),
]);
export type ScaleSummary = z.infer<typeof scaleSchema>;

const tooFew = z.object({ status: z.literal('too_few') });

const summarySchema = z.object({
  barometer: z.union([
    tooFew,
    z.object({
      status: z.literal('ready'),
      from_month: z.string(),
      to_month: z.string(),
      answers: z.number().int(),
      mood: scaleSchema,
      tours: scaleSchema,
      team: scaleSchema,
      easier_texts: z.array(z.string()),
      more_texts: z.array(z.string()),
    }),
  ]),
  messages: z.union([
    tooFew,
    z.object({
      status: z.literal('ready'),
      from_month: z.string(),
      to_month: z.string(),
      answers: z.number().int(),
      texts: z.array(z.string()),
    }),
  ]),
});
export type FeedbackSummary = z.infer<typeof summarySchema>;

const submittedSchema = z.object({ month: z.string(), named: z.boolean() });

// -----------------------------------------------------------------------------
// Fehler in festen Sätzen - nie mit dem Text der Person
// -----------------------------------------------------------------------------

type ServerError = { message?: string; code?: string } | null;

const SENTENCES: readonly (readonly [string, string])[] = [
  ['barometer already submitted', 'Das Barometer für diesen Monat ist schon abgegeben.'],
  ['feedback is empty', 'Es ist nichts ausgefüllt.'],
  ['text is too long', 'Höchstens 2000 Zeichen je Antwort.'],
  ['not allowed', 'Dafür fehlt die Berechtigung.'],
];

function sentence(error: ServerError, fallback: string): Error {
  const text = error?.message ?? '';
  const hit = SENTENCES.find(([key]) => text.includes(key));
  return new Error(hit ? hit[1] : fallback);
}

async function call(fn: string, args: Record<string, unknown>, fallback: string) {
  const { data, error } = (await getSupabase().rpc(fn, args)) as {
    data: unknown;
    error: ServerError;
  };
  if (error) throw sentence(error, fallback);
  return data;
}

// -----------------------------------------------------------------------------
// Lesen
// -----------------------------------------------------------------------------

export const FEEDBACK_KEY = ['staff-feedback'] as const;
export const FEEDBACK_STATUS_KEY = [...FEEDBACK_KEY, 'status'] as const;
export const FEEDBACK_NAMED_KEY = [...FEEDBACK_KEY, 'named'] as const;
export const FEEDBACK_SUMMARY_KEY = [...FEEDBACK_KEY, 'summary'] as const;

const LOAD_STATUS = 'Der Stand des Barometers konnte nicht geladen werden.';

/** Der eigene Stand: nimmt teil, liest, Barometer dieses Monats abgegeben. */
export async function fetchFeedbackStatus(): Promise<FeedbackStatus> {
  const data = await call('get_my_staff_feedback_status', {}, LOAD_STATUS);
  return antwort(statusSchema, data, LOAD_STATUS);
}

const LOAD_NAMED = 'Die Rückmeldungen konnten nicht geladen werden.';

/** owner: namentliche Rückmeldungen einzeln, die neueste zuerst. */
export async function fetchNamedFeedback(): Promise<NamedFeedback[]> {
  const data = await call('list_staff_feedback_named', {}, LOAD_NAMED);
  return antwort(z.array(namedSchema), data, LOAD_NAMED);
}

const LOAD_SUMMARY = 'Die Auswertung konnte nicht geladen werden.';

/** owner: die Praxissumme der anonymen Rückmeldungen - oder „zu wenige“. */
export async function fetchFeedbackSummary(): Promise<FeedbackSummary> {
  const data = await call('get_staff_feedback_summary', {}, LOAD_SUMMARY);
  return antwort(summarySchema, data, LOAD_SUMMARY);
}

// -----------------------------------------------------------------------------
// Abgeben
// -----------------------------------------------------------------------------

export interface BarometerAnswers {
  mood: number | null;
  tours: number | null;
  team: number | null;
  easier: string;
  more: string;
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

export async function submitBarometer(input: {
  named: boolean;
  answers: BarometerAnswers;
}): Promise<{ month: string; named: boolean }> {
  const fallback = 'Das Barometer konnte nicht gesendet werden.';
  const data = await call(
    'submit_staff_barometer',
    {
      p_named: input.named,
      p_mood: input.answers.mood,
      p_tours: input.answers.tours,
      p_team: input.answers.team,
      p_easier: textOrNull(input.answers.easier),
      p_more: textOrNull(input.answers.more),
    },
    fallback,
  );
  return antwort(submittedSchema, data, fallback);
}

export async function submitMessage(input: {
  named: boolean;
  text: string;
}): Promise<{ month: string; named: boolean }> {
  const fallback = 'Die Rückmeldung konnte nicht gesendet werden.';
  const data = await call(
    'submit_staff_feedback_message',
    { p_named: input.named, p_text: textOrNull(input.text) },
    fallback,
  );
  return antwort(submittedSchema, data, fallback);
}

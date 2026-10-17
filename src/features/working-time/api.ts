import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { PROBLEM_TEXT, type Problem, type Week } from './rules';

/**
 * Arbeitszeitänderung (AZ-001): Lesen und Schreiben über die Serverfunktionen
 * aus `supabase/migrations/20261125100000_az_001_arbeitszeit_antraege.sql`.
 *
 * Wer beantragt und wer entscheidet, entscheidet der Server (ANN-590); die
 * Oberfläche fragt `can_decide` nur ab, um nicht anzubieten, was abgewiesen
 * würde (ADR-004). Ob eine Änderung zulässig ist, prüft der Server beim
 * Beantragen und beim Genehmigen (ANN-588) - die Seite prüft vorher dasselbe,
 * damit niemand erst nach dem Absenden erfährt, was nicht geht.
 */

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const blockSchema = z.object({ von: z.string(), bis: z.string() });
const daySchema = z.array(blockSchema);
const weekSchema = z.record(z.string(), daySchema);

const appointmentDaySchema = z.object({ on_date: z.string(), appointments: z.number().int() });
export type AppointmentDay = z.infer<typeof appointmentDaySchema>;

export const REQUEST_STATUS = ['requested', 'approved', 'rejected', 'withdrawn'] as const;
export type RequestStatus = (typeof REQUEST_STATUS)[number];

const requestBase = {
  id: z.string(),
  on_date: z.string(),
  previous_minutes: z.number().int(),
  new_minutes: z.number().int(),
  message: z.string().nullable(),
  requested_at: z.string(),
};

/** Einmalig: ein Tag. Dauerhaft: die Woche ab dem Datum. */
function withShape<T extends z.ZodRawShape>(shape: T) {
  return z.discriminatedUnion('kind', [
    z.object({ ...shape, kind: z.literal('once'), blocks: daySchema, previous_blocks: daySchema }),
    z.object({
      ...shape,
      kind: z.literal('permanent'),
      blocks: weekSchema,
      previous_blocks: weekSchema,
    }),
  ]);
}

const ownSchema = withShape({
  ...requestBase,
  status: z.enum(REQUEST_STATUS),
  decided_at: z.string().nullable(),
  decided_by_name: z.string().nullable(),
  decision_note: z.string().nullable(),
  self_entered: z.boolean(),
});
export type OwnRequest = z.infer<typeof ownSchema>;

const openSchema = withShape({
  ...requestBase,
  staff_member_id: z.string(),
  name: z.string().nullable(),
  appointment_days: z.array(appointmentDaySchema),
});
export type OpenRequest = z.infer<typeof openSchema>;

const planSchema = z.object({
  has_plan: z.boolean(),
  current: weekSchema,
  next_from: z.string().nullable(),
  next: weekSchema.nullable(),
});
export type OwnPlan = z.infer<typeof planSchema>;

const workingTimeSchema = z.object({
  my_staff_member_id: z.string().nullable(),
  can_decide: z.boolean(),
  self_entered: z.boolean(),
  today: z.string(),
  plan: planSchema.nullable(),
  own: z.array(ownSchema),
  to_decide: z.array(openSchema),
});
export type WorkingTime = z.infer<typeof workingTimeSchema>;

const baselineSchema = z.object({
  previous: z.union([daySchema, weekSchema]),
  previous_minutes: z.number().int(),
  self_entered: z.boolean(),
});

const previewSchema = baselineSchema.extend({
  new_minutes: z.number().int(),
  unchanged: z.boolean(),
  reduced: z.boolean(),
  problems: z.array(z.string()),
  appointment_days: z.array(appointmentDaySchema),
});
export type ChangePreview = z.infer<typeof previewSchema>;

const decisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  appointment_days: z.array(appointmentDaySchema),
});
export type Decision = z.infer<typeof decisionSchema>;

// -----------------------------------------------------------------------------
// Fehler in Sätzen der Praxis
// -----------------------------------------------------------------------------

type ServerError = { message?: string; code?: string } | null;

/** Weniger Stunden sind ein Gespräch, kein Antrag (ANN-588). */
export const REDUCTION_TEXT =
  'Weniger Stunden laufen nicht über diesen Antrag – sprechen Sie mit der Praxisleitung.';

const SENTENCES: readonly (readonly [string, string])[] = [
  ['working time unchanged', 'Die Zeiten sind dieselben wie bisher.'],
  [
    'working time change date is invalid',
    'Bitte ein Datum ab morgen und höchstens ein Jahr voraus wählen.',
  ],
  ['day is part of approved leave', 'An diesem Tag ist genehmigter Urlaub.'],
  ['day is marked absent', 'An diesem Tag ist eine Abwesenheit eingetragen.'],
  ['later working plan exists', 'Ab einem späteren Datum gilt schon ein neuer Wochenplan.'],
  ['no working plan', 'Sie haben noch keinen Wochenplan – den legt die Praxisleitung an.'],
  ['working time request already open', 'Dafür gibt es schon einen offenen Antrag.'],
  [
    'working plan changed since request',
    'Der Plan hat sich seit dem Antrag geändert – bitte ablehnen; die Person kann neu beantragen.',
  ],
  [
    'working time change date passed',
    'Das Datum ist erreicht – genehmigen geht nicht mehr, nur ablehnen.',
  ],
  ['working hours overlap', 'Die Zeiten überschneiden sich.'],
  ['working hour block is invalid', 'Eine Zeit ist unvollständig oder endet vor ihrem Beginn.'],
  ['rejection needs a reason', 'Bitte einen Grund für die Ablehnung angeben.'],
  ['not allowed to decide own request', 'Über den eigenen Antrag entscheidet jemand anderes.'],
  ['no staff member for this account', 'Zu Ihrem Konto gibt es keinen Mitarbeiterdatensatz.'],
  [
    'working time request not found',
    'Diesen Antrag gibt es nicht mehr oder er ist schon entschieden.',
  ],
  ['is too long', 'Höchstens 500 Zeichen.'],
  ['not allowed', 'Dafür fehlt die Berechtigung.'],
];

/** Die Gründe des Servers in Sätzen; unbekannte bleiben ungenannt. */
export function problemSentences(codes: readonly string[]): string[] {
  return codes
    .filter((code): code is Problem => code in PROBLEM_TEXT)
    .map((code) => PROBLEM_TEXT[code]);
}

function sentence(error: ServerError, fallback: string, reduced: string): Error {
  const text = error?.message ?? '';
  if (text.includes('would be reduced')) return new Error(reduced);
  if (text.startsWith('working time rule: ')) {
    const reasons = problemSentences(text.slice('working time rule: '.length).split(', '));
    if (reasons.length > 0) return new Error(reasons.join(' '));
  }
  const hit = SENTENCES.find(([key]) => text.includes(key));
  return new Error(hit ? hit[1] : fallback);
}

async function call(
  fn: string,
  args: Record<string, unknown>,
  fallback: string,
  reduced = REDUCTION_TEXT,
) {
  const { data, error } = (await getSupabase().rpc(fn, args)) as {
    data: unknown;
    error: ServerError;
  };
  if (error) throw sentence(error, fallback, reduced);
  return data;
}

// -----------------------------------------------------------------------------
// Lesen
// -----------------------------------------------------------------------------

export const WORKING_TIME_KEY = ['working-time'] as const;

const LOAD = 'Die Arbeitszeit konnte nicht geladen werden.';

/** Der eigene Plan, eigene Anträge und - für owner - die offenen der anderen. */
export async function fetchWorkingTime(): Promise<WorkingTime> {
  const data = await call('list_working_time', {}, LOAD);
  return antwort(workingTimeSchema, data, LOAD);
}

const PREVIEW = 'Die Arbeitszeit konnte nicht geprüft werden.';

export type ChangeKind = 'once' | 'permanent';

/** Was bisher gilt - einmalig der Tag, dauerhaft die Woche am Datum. */
export async function fetchBaseline(
  kind: ChangeKind,
  onDate: string,
): Promise<z.infer<typeof baselineSchema>> {
  const data = await call(
    'preview_working_time_change',
    { p_kind: kind, p_on_date: onDate, p_blocks: null },
    PREVIEW,
  );
  return antwort(baselineSchema, data, PREVIEW);
}

/** Was die neuen Zeiten ergäben: Minuten, Gründe dagegen, Termine außerhalb. */
export async function previewChange(
  kind: ChangeKind,
  onDate: string,
  blocks: readonly { von: string; bis: string }[] | Week,
): Promise<ChangePreview> {
  const data = await call(
    'preview_working_time_change',
    { p_kind: kind, p_on_date: onDate, p_blocks: blocks },
    PREVIEW,
  );
  return antwort(previewSchema, data, PREVIEW);
}

// -----------------------------------------------------------------------------
// Schreiben
// -----------------------------------------------------------------------------

export async function requestChange(input: {
  kind: ChangeKind;
  onDate: string;
  blocks: readonly { von: string; bis: string }[] | Week;
  message: string | null;
}): Promise<string> {
  const fallback = 'Der Antrag konnte nicht gesendet werden.';
  const data = await call(
    'request_working_time_change',
    {
      p_kind: input.kind,
      p_on_date: input.onDate,
      p_blocks: input.blocks,
      p_message: input.message,
    },
    fallback,
  );
  return antwort(z.string(), data, fallback);
}

export async function withdrawRequest(requestId: string): Promise<void> {
  await call(
    'withdraw_working_time_request',
    { p_request_id: requestId },
    'Der Antrag konnte nicht zurückgezogen werden.',
  );
}

export async function decideRequest(input: {
  requestId: string;
  approve: boolean;
  note: string | null;
}): Promise<Decision> {
  const fallback = 'Die Entscheidung konnte nicht gespeichert werden.';
  const data = await call(
    'decide_working_time_request',
    { p_request_id: input.requestId, p_approve: input.approve, p_note: input.note },
    fallback,
    // Beim Genehmigen heißt das: Der Plan ist inzwischen länger als beantragt.
    'Inzwischen gilt mehr Arbeitszeit als beantragt – genehmigt würde sie kürzer. Bitte ablehnen.',
  );
  return antwort(decisionSchema, data, fallback);
}

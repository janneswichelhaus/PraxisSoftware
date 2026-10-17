import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { isProblem, problemText, type EntryKind, type Problem } from './rules';

/**
 * Zeitkonto (ZK-001): Lesen und Schreiben über die Serverfunktionen aus
 * `supabase/migrations/20261126100000_zk_001_zeitkonto.sql`.
 *
 * Wer welches Konto sieht und wer für andere bucht, entscheidet der Server
 * (ANN-596): Die Seite fragt `can_book_others` und `can_reject` nur ab, um
 * nicht anzubieten, was abgewiesen würde (ADR-004).
 */

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const blockSchema = z.object({ von: z.string(), bis: z.string() });

export const ENTRY_STATUS = ['valid', 'rejected', 'withdrawn'] as const;

const entrySchema = z.object({
  id: z.string(),
  kind: z.enum(['overtime', 'time_off', 'correction', 'carryover']),
  on_date: z.string(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  minutes: z.number().int(),
  note: z.string().nullable(),
  status: z.enum(ENTRY_STATUS),
  entered_at: z.string(),
  entered_by_name: z.string().nullable(),
  rejected_at: z.string().nullable(),
  rejected_by_name: z.string().nullable(),
  rejection_note: z.string().nullable(),
  withdrawn_at: z.string().nullable(),
  can_withdraw: z.boolean(),
  can_reject: z.boolean(),
});
export type Entry = z.infer<typeof entrySchema>;

const accountSchema = z.object({
  staff_member_id: z.string(),
  name: z.string().nullable(),
  balance_minutes: z.number().int(),
  entries: z.array(entrySchema),
});
export type Account = z.infer<typeof accountSchema>;

const timeAccountSchema = z.object({
  my_staff_member_id: z.string().nullable(),
  can_book_others: z.boolean(),
  can_reject: z.boolean(),
  account: accountSchema.nullable(),
  accounts: z.array(
    z.object({
      staff_member_id: z.string(),
      name: z.string().nullable(),
      balance_minutes: z.number().int(),
    }),
  ),
});
export type TimeAccount = z.infer<typeof timeAccountSchema>;

// Für eine andere Person vor heute ohne Blöcke: Frühere Fassungen des
// Wochenplans liest nur der Server (ANN-589). Außerhalb des Fensters und bei
// einer Korrektur gibt es keinen Tag.
const daySchema = z.object({
  kind: z.enum(['plan', 'leave', 'unavailable', 'exception']),
  blocks: z.array(blockSchema).nullable(),
});

const previewSchema = z.object({
  day: daySchema.nullable(),
  minutes: z.number().int().nullable(),
  problems: z.array(z.string()),
  remaining: z.array(blockSchema),
  appointments: z.number().int(),
  balance_minutes: z.number().int(),
  balance_after: z.number().int().nullable(),
});
export type EntryPreview = z.infer<typeof previewSchema>;

const recordedSchema = z.object({
  id: z.string(),
  minutes: z.number().int(),
  balance_minutes: z.number().int(),
  appointments: z.number().int(),
});
export type Recorded = z.infer<typeof recordedSchema>;

const rejectedSchema = z.object({ status: z.literal('rejected'), freed: z.boolean() });
export type Rejected = z.infer<typeof rejectedSchema>;

// -----------------------------------------------------------------------------
// Fehler in Sätzen der Praxis
// -----------------------------------------------------------------------------

type ServerError = { message?: string; code?: string } | null;

const SENTENCES: readonly (readonly [string, string])[] = [
  [
    'day has time off in lieu',
    'An diesem Tag steht ein Freizeitausgleich – erst zurückweisen oder zurücknehmen.',
  ],
  [
    'not allowed to book corrections',
    'Korrekturen buchen Praxisinhaber und Büro, im eigenen Konto nur der Praxisinhaber.',
  ],
  [
    'time account entry not found',
    'Diesen Eintrag gibt es nicht mehr, oder er ist schon zurückgenommen oder zurückgewiesen.',
  ],
  ['time account not found', 'Dieses Zeitkonto gibt es nicht.'],
  ['rejection needs a reason', 'Bitte einen Grund angeben.'],
  ['not allowed to reject own entry', 'Eigene Einträge weisen Sie nicht zurück.'],
  ['no staff member for this account', 'Zu Ihrem Konto gibt es keinen Mitarbeiterdatensatz.'],
  ['is too long', 'Höchstens 500 Zeichen.'],
  ['not allowed', 'Dafür fehlt die Berechtigung.'],
];

/** Die Gründe des Servers in Sätzen; unbekannte bleiben ungenannt. */
export function problemSentences(codes: readonly string[], kind: EntryKind): string[] {
  return codes.filter(isProblem).map((code: Problem) => problemText(code, kind));
}

function sentence(error: ServerError, fallback: string, kind: EntryKind | null): Error {
  const text = error?.message ?? '';
  if (kind && text.startsWith('time account rule: ')) {
    const reasons = problemSentences([text.slice('time account rule: '.length)], kind);
    if (reasons.length > 0) return new Error(reasons[0]);
  }
  const hit = SENTENCES.find(([key]) => text.includes(key));
  return new Error(hit ? hit[1] : fallback);
}

async function call(
  fn: string,
  args: Record<string, unknown>,
  fallback: string,
  kind: EntryKind | null = null,
) {
  const { data, error } = (await getSupabase().rpc(fn, args)) as {
    data: unknown;
    error: ServerError;
  };
  if (error) throw sentence(error, fallback, kind);
  return data;
}

// -----------------------------------------------------------------------------
// Lesen
// -----------------------------------------------------------------------------

export const TIME_ACCOUNT_KEY = ['time-account'] as const;

export function timeAccountKey(staffMemberId: string | null) {
  return [...TIME_ACCOUNT_KEY, staffMemberId ?? 'own'] as const;
}

const LOAD = 'Das Zeitkonto konnte nicht geladen werden.';

/** Das eigene Konto - oder, für owner und Büro, das einer anderen Person. */
export async function fetchTimeAccount(staffMemberId: string | null): Promise<TimeAccount> {
  const data = await call('list_time_account', { p_staff_member_id: staffMemberId }, LOAD);
  return antwort(timeAccountSchema, data, LOAD);
}

/** Der Satz, wenn die Vorschau ohne Antwort des Servers nicht lädt. */
export const PREVIEW_ERROR = 'Der Eintrag konnte nicht geprüft werden.';

/** Der Tag und - mit Zeiten - Minuten, Saldo danach, Gründe, Termine. */
export async function previewEntry(input: {
  staffMemberId: string | null;
  kind: EntryKind;
  onDate: string;
  von: string | null;
  bis: string | null;
  minutes: number | null;
}): Promise<EntryPreview> {
  const data = await call(
    'preview_time_account_entry',
    {
      p_staff_member_id: input.staffMemberId,
      p_kind: input.kind,
      p_on_date: input.onDate,
      p_starts_at: input.von,
      p_ends_at: input.bis,
      p_minutes: input.minutes,
    },
    PREVIEW_ERROR,
    input.kind,
  );
  return antwort(previewSchema, data, PREVIEW_ERROR);
}

// -----------------------------------------------------------------------------
// Schreiben
// -----------------------------------------------------------------------------

export async function recordEntry(input: {
  staffMemberId: string | null;
  kind: EntryKind;
  onDate: string;
  von: string | null;
  bis: string | null;
  minutes: number | null;
  note: string | null;
}): Promise<Recorded> {
  const fallback = 'Der Eintrag konnte nicht gespeichert werden.';
  const data = await call(
    'record_time_account_entry',
    {
      p_staff_member_id: input.staffMemberId,
      p_kind: input.kind,
      p_on_date: input.onDate,
      p_starts_at: input.von,
      p_ends_at: input.bis,
      p_minutes: input.minutes,
      p_note: input.note,
    },
    fallback,
    input.kind,
  );
  return antwort(recordedSchema, data, fallback);
}

export async function withdrawEntry(entryId: string): Promise<void> {
  await call(
    'withdraw_time_account_entry',
    { p_entry_id: entryId },
    'Der Eintrag konnte nicht zurückgenommen werden.',
  );
}

export async function rejectEntry(input: { entryId: string; note: string }): Promise<Rejected> {
  const fallback = 'Die Zurückweisung konnte nicht gespeichert werden.';
  const data = await call(
    'reject_time_account_entry',
    { p_entry_id: input.entryId, p_note: input.note },
    fallback,
  );
  return antwort(rejectedSchema, data, fallback);
}

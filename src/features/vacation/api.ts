import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Urlaub (URL-001): Lesen und Schreiben über die Serverfunktionen aus
 * `supabase/migrations/20261124100000_url_001_urlaub_antraege.sql`.
 *
 * Wer beantragt, entscheidet und welche Konten sieht, entscheidet der Server
 * (BEF-066, ANN-576, ANN-580); die Oberfläche fragt `can_decide` und
 * `can_manage_entitlements` nur ab, um nicht anzubieten, was abgewiesen würde
 * (ADR-004). Die Tage zählt der Server (ANN-577) - die Seite zeigt sie nur.
 */

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const kontoSchema = z.object({
  year: z.number().int(),
  entitlement: z.number().int().nullable(),
  carryover: z.number().int().nullable(),
  approved: z.number().int(),
  requested: z.number().int(),
  rest: z.number().int().nullable(),
});
export type Urlaubskonto = z.infer<typeof kontoSchema>;

const teamSchema = z.object({
  staff_member_id: z.string(),
  name: z.string().nullable(),
  starts_on: z.string(),
  ends_on: z.string(),
});
export type Teamabwesenheit = z.infer<typeof teamSchema>;

export const ANTRAGSSTATUS = [
  'requested',
  'approved',
  'rejected',
  'withdrawn',
  'cancelled',
] as const;
export type Antragsstatus = (typeof ANTRAGSSTATUS)[number];

const eigenerSchema = z.object({
  id: z.string(),
  kind: z.enum(['leave', 'cancellation']),
  refers_to: z.string().nullable(),
  starts_on: z.string(),
  ends_on: z.string(),
  days: z.number().int(),
  message: z.string().nullable(),
  status: z.enum(ANTRAGSSTATUS),
  requested_at: z.string(),
  decided_at: z.string().nullable(),
  decided_by_name: z.string().nullable(),
  decision_note: z.string().nullable(),
  self_entered: z.boolean(),
  open_cancellation: z.boolean(),
});
export type EigenerAntrag = z.infer<typeof eigenerSchema>;

const offenerSchema = z.object({
  id: z.string(),
  kind: z.enum(['leave', 'cancellation']),
  refers_to: z.string().nullable(),
  staff_member_id: z.string(),
  name: z.string().nullable(),
  starts_on: z.string(),
  ends_on: z.string(),
  days: z.number().int(),
  requested_at: z.string(),
  balance: kontoSchema,
  team: z.array(teamSchema),
  appointments: z.number().int(),
});
export type OffenerAntrag = z.infer<typeof offenerSchema>;

const fremdesKontoSchema = z.object({
  staff_member_id: z.string(),
  name: z.string().nullable(),
  balance: kontoSchema,
});
export type FremdesKonto = z.infer<typeof fremdesKontoSchema>;

const urlaubSchema = z.object({
  my_staff_member_id: z.string().nullable(),
  can_decide: z.boolean(),
  self_entered: z.boolean(),
  can_manage_entitlements: z.boolean(),
  federal_state: z.enum(['BW', 'NW']),
  balance: kontoSchema.nullable(),
  own: z.array(eigenerSchema),
  to_decide: z.array(offenerSchema),
  team: z.array(teamSchema),
  balances: z.array(fremdesKontoSchema),
});
export type Urlaubsstand = z.infer<typeof urlaubSchema>;

const vorschauSchema = z.object({
  days: z.number().int(),
  days_following_year: z.number().int(),
  balance: kontoSchema,
  overlaps_own: z.boolean(),
  team: z.array(teamSchema),
  self_entered: z.boolean(),
});
export type Urlaubsvorschau = z.infer<typeof vorschauSchema>;

const terminTagSchema = z.object({ on_date: z.string(), appointments: z.number().int() });
export type Termintag = z.infer<typeof terminTagSchema>;

const entscheidungSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  appointments: z.number().int(),
  appointment_days: z.array(terminTagSchema),
});
export type Entscheidung = z.infer<typeof entscheidungSchema>;

// -----------------------------------------------------------------------------
// Fehler in Sätzen der Praxis
// -----------------------------------------------------------------------------

type Fehler = { message?: string; code?: string } | null;

const SAETZE: readonly (readonly [string, string])[] = [
  ['leave overlaps', 'Für diese Tage gibt es schon einen Urlaubsantrag.'],
  ['no working days in period', 'In diesem Zeitraum liegt kein Arbeitstag.'],
  ['leave must not start in the past', 'Urlaub lässt sich nur ab heute beantragen.'],
  ['leave period is invalid', 'Bitte einen Zeitraum von höchstens 93 Tagen wählen.'],
  ['leave already started', 'Der Urlaub hat schon begonnen. Stornieren geht nur vorher.'],
  ['cancellation already requested', 'Ein Storno für diesen Urlaub ist schon beantragt.'],
  [
    'working hours exception in period',
    'Im Zeitraum stehen abweichende Arbeitszeiten. Bitte erst dort ändern, dann genehmigen.',
  ],
  ['rejection needs a reason', 'Bitte einen Grund für die Ablehnung angeben.'],
  ['not allowed to decide own request', 'Über den eigenen Antrag entscheidet jemand anderes.'],
  ['no staff member for this account', 'Zu Ihrem Konto gibt es keinen Mitarbeiterdatensatz.'],
  ['leave entitlement is invalid', 'Bitte Tage zwischen 0 und 60 angeben.'],
  ['leave request not found', 'Diesen Antrag gibt es nicht mehr oder er ist schon entschieden.'],
  ['staff member not found', 'Diese Person gibt es nicht im Mitarbeiterstamm.'],
  ['is too long', 'Höchstens 500 Zeichen.'],
  ['not allowed', 'Dafür fehlt die Berechtigung.'],
];

function meldung(error: Fehler, rest: string): Error {
  const text = error?.message ?? '';
  const treffer = SAETZE.find(([schluessel]) => text.includes(schluessel));
  return new Error(treffer ? treffer[1] : rest);
}

async function rufe(funktion: string, argumente: Record<string, unknown>, rest: string) {
  const { data, error } = (await getSupabase().rpc(funktion, argumente)) as {
    data: unknown;
    error: Fehler;
  };
  if (error) throw meldung(error, rest);
  return data;
}

// -----------------------------------------------------------------------------
// Lesen
// -----------------------------------------------------------------------------

export const URLAUB_SCHLUESSEL = ['vacation'] as const;

export function urlaubSchluessel(von: string, bis: string) {
  return [...URLAUB_SCHLUESSEL, 'list', von, bis] as const;
}

const LADEN = 'Der Urlaub konnte nicht geladen werden.';

/** Eigene Anträge, zu Entscheidendes, wer fehlt und - für owner - die Konten. */
export async function fetchUrlaub(von: string, bis: string): Promise<Urlaubsstand> {
  const data = await rufe('list_leave', { p_from: von, p_to: bis }, LADEN);
  return antwort(urlaubSchema, data, LADEN);
}

const VORSCHAU = 'Die Urlaubstage konnten nicht gezählt werden.';

/** Was ein Antrag für den Zeitraum ergäbe - am Server gezählt (ANN-577). */
export async function previewLeave(von: string, bis: string): Promise<Urlaubsvorschau> {
  const data = await rufe('preview_leave', { p_starts_on: von, p_ends_on: bis }, VORSCHAU);
  return antwort(vorschauSchema, data, VORSCHAU);
}

// -----------------------------------------------------------------------------
// Schreiben
// -----------------------------------------------------------------------------

export async function requestLeave(eingabe: {
  von: string;
  bis: string;
  notiz: string | null;
}): Promise<string> {
  const rest = 'Der Urlaub konnte nicht beantragt werden.';
  const data = await rufe(
    'request_leave',
    { p_starts_on: eingabe.von, p_ends_on: eingabe.bis, p_message: eingabe.notiz },
    rest,
  );
  return antwort(z.string(), data, rest);
}

export async function withdrawLeaveRequest(antragId: string): Promise<void> {
  await rufe(
    'withdraw_leave_request',
    { p_request_id: antragId },
    'Der Antrag konnte nicht zurückgezogen werden.',
  );
}

export async function requestLeaveCancellation(antragId: string): Promise<string> {
  const rest = 'Der Storno konnte nicht beantragt werden.';
  const data = await rufe(
    'request_leave_cancellation',
    { p_request_id: antragId, p_message: null },
    rest,
  );
  return antwort(z.string(), data, rest);
}

export async function decideLeaveRequest(eingabe: {
  antragId: string;
  genehmigen: boolean;
  grund: string | null;
}): Promise<Entscheidung> {
  const rest = 'Die Entscheidung konnte nicht gespeichert werden.';
  const data = await rufe(
    'decide_leave_request',
    { p_request_id: eingabe.antragId, p_approve: eingabe.genehmigen, p_note: eingabe.grund },
    rest,
  );
  return antwort(entscheidungSchema, data, rest);
}

export async function setLeaveEntitlement(eingabe: {
  staffMemberId: string;
  jahr: number;
  tage: number;
  uebertrag: number;
}): Promise<void> {
  await rufe(
    'set_leave_entitlement',
    {
      p_staff_member_id: eingabe.staffMemberId,
      p_year: eingabe.jahr,
      p_days: eingabe.tage,
      p_carryover_days: eingabe.uebertrag,
    },
    'Der Anspruch konnte nicht gespeichert werden.',
  );
}

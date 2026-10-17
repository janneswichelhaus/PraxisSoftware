import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Teamchat (TEAM-001, PROJECT_PRINCIPLES.md §10 „Intern“) über die
 * Serverfunktionen aus `supabase/migrations/20261204100000_team_001_teamchat.sql`.
 *
 * Wer was liest, entscheidet der Server: offene Kanäle die ganze Praxis,
 * Direktnachrichten nur die zwei Beteiligten (ANN-609). Der Lesestand zählt
 * nur für die Person selbst; es gibt keine Lesebestätigung und keinen
 * Online-Status (§20).
 *
 * **Text geht nie in eine Meldung, ein Log oder einen Schlüssel** (ADR-011):
 * Fehler werden hier in feste Sätze übersetzt, der Entwurf bleibt im Feld.
 */

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const kanalSchema = z.object({
  id: z.string(),
  kind: z.enum(['channel', 'direct']),
  name: z.string().nullable(),
  description: z.string().nullable(),
  archived: z.boolean(),
  partner_staff_member_id: z.string().nullable(),
  partner_name: z.string().nullable(),
  partner_active: z.boolean().nullable(),
  unread: z.number().int(),
  mentions: z.number().int(),
  last_message_at: z.string().nullable(),
});
export type Kanal = z.infer<typeof kanalSchema>;

const nachrichtSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  author_staff_member_id: z.string().nullable(),
  author_name: z.string().nullable(),
  body: z.string().nullable(),
  created_at: z.string(),
  edited: z.boolean(),
  removed_kind: z.enum(['author', 'owner', 'retention']).nullable(),
  reply_count: z.number().int(),
  last_reply_at: z.string().nullable(),
  mentions: z.array(z.string()),
  own: z.boolean(),
});
export type Nachricht = z.infer<typeof nachrichtSchema>;

const personSchema = z.object({ staff_member_id: z.string(), name: z.string() });
export type Person = z.infer<typeof personSchema>;

const trefferSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  parent_id: z.string().nullable(),
  author_name: z.string().nullable(),
  body: z.string(),
  created_at: z.string(),
});
export type Treffer = z.infer<typeof trefferSchema>;

// -----------------------------------------------------------------------------
// Fehler in festen Sätzen - nie mit dem Text der Nachricht
// -----------------------------------------------------------------------------

type ServerError = { message?: string; code?: string } | null;

const SAETZE: readonly (readonly [string, string])[] = [
  ['message is empty', 'Die Nachricht ist leer.'],
  ['message is too long', 'Höchstens 4000 Zeichen je Nachricht.'],
  ['team channel is archived', 'Der Kanal ist archiviert und nimmt keine Nachrichten mehr an.'],
  ['team chat partner is not available', 'Diese Person ist im Teamchat nicht mehr erreichbar.'],
  ['channel name is taken', 'Einen Kanal mit diesem Namen gibt es schon.'],
  ['channel name needs', 'Der Name braucht 1 bis 40 Zeichen.'],
  ['search needs', 'Bitte mindestens zwei Zeichen eingeben.'],
  ['not found', 'Das Gespräch oder die Nachricht gibt es nicht mehr.'],
  ['not allowed', 'Dafür fehlt die Berechtigung.'],
];

function satz(error: ServerError, ersatz: string): Error {
  const text = error?.message ?? '';
  const treffer = SAETZE.find(([schluessel]) => text.includes(schluessel));
  return new Error(treffer ? treffer[1] : ersatz);
}

async function rufe(fn: string, args: Record<string, unknown>, ersatz: string): Promise<unknown> {
  const { data, error } = (await getSupabase().rpc(fn, args)) as {
    data: unknown;
    error: ServerError;
  };
  if (error) throw satz(error, ersatz);
  return data;
}

// -----------------------------------------------------------------------------
// Lesen
// -----------------------------------------------------------------------------

export const TEAMCHAT_KEY = ['teamchat'] as const;
export const KANAELE_KEY = [...TEAMCHAT_KEY, 'kanaele'] as const;
export const PERSONEN_KEY = [...TEAMCHAT_KEY, 'personen'] as const;

export function nachrichtenKey(kanalId: string, threadId: string | null = null) {
  return [...TEAMCHAT_KEY, 'nachrichten', kanalId, threadId] as const;
}

export function sucheKey(suche: string) {
  return [...TEAMCHAT_KEY, 'suche', suche] as const;
}

/** Wie oft eine offene Seite nachsieht - es gibt keine Push-Zustellung (ANN-612). */
export const NACHSEHEN_MS = 20_000;

const LADEN_KANAELE = 'Die Gespräche konnten nicht geladen werden.';

export async function fetchKanaele(): Promise<Kanal[]> {
  const data = await rufe('list_team_channels', {}, LADEN_KANAELE);
  return antwort(z.array(kanalSchema), data, LADEN_KANAELE);
}

const LADEN_NACHRICHTEN = 'Die Nachrichten konnten nicht geladen werden.';

/**
 * Ohne Thread die neuesten 50 Ausgangsnachrichten (mit `vor` die davor), mit
 * Thread die ganze Unterhaltung.
 */
export async function fetchNachrichten(
  kanalId: string,
  threadId: string | null = null,
  vor: string | null = null,
): Promise<Nachricht[]> {
  const data = await rufe(
    'list_team_messages',
    { p_channel: kanalId, p_parent: threadId, p_before: vor },
    LADEN_NACHRICHTEN,
  );
  return antwort(z.array(nachrichtSchema), data, LADEN_NACHRICHTEN);
}

const LADEN_PERSONEN = 'Das Team konnte nicht geladen werden.';

export async function fetchPersonen(): Promise<Person[]> {
  const data = await rufe('list_team_people', {}, LADEN_PERSONEN);
  return antwort(z.array(personSchema), data, LADEN_PERSONEN);
}

const SUCHEN = 'Die Suche hat nicht geklappt.';

export async function sucheNachrichten(suche: string): Promise<Treffer[]> {
  const data = await rufe('search_team_messages', { p_query: suche }, SUCHEN);
  return antwort(z.array(trefferSchema), data, SUCHEN);
}

// -----------------------------------------------------------------------------
// Schreiben
// -----------------------------------------------------------------------------

export async function sendeNachricht(input: {
  kanalId: string;
  threadId: string | null;
  text: string;
  erwaehnt: readonly string[];
}): Promise<string> {
  const ersatz = 'Die Nachricht konnte nicht gesendet werden.';
  const data = await rufe(
    'post_team_message',
    {
      p_channel: input.kanalId,
      p_parent: input.threadId,
      p_body: input.text,
      p_mentions: input.erwaehnt,
    },
    ersatz,
  );
  return antwort(z.string(), data, ersatz);
}

export async function bearbeiteNachricht(input: {
  id: string;
  text: string;
  erwaehnt: readonly string[];
}): Promise<void> {
  await rufe(
    'edit_team_message',
    { p_message: input.id, p_body: input.text, p_mentions: input.erwaehnt },
    'Die Nachricht konnte nicht geändert werden.',
  );
}

export async function loescheNachricht(id: string): Promise<void> {
  await rufe(
    'delete_team_message',
    { p_message: id },
    'Die Nachricht konnte nicht gelöscht werden.',
  );
}

export async function markiereGelesen(kanalId: string): Promise<void> {
  await rufe('mark_team_channel_read', { p_channel: kanalId }, LADEN_KANAELE);
}

export async function markiereAllesGelesen(): Promise<void> {
  await rufe('mark_all_team_channels_read', {}, 'Nicht alles ließ sich als gelesen markieren.');
}

export async function oeffneDirekt(staffMemberId: string): Promise<string> {
  const ersatz = 'Die Direktnachricht konnte nicht geöffnet werden.';
  const data = await rufe('open_team_direct', { p_staff_member: staffMemberId }, ersatz);
  return antwort(z.string(), data, ersatz);
}

export async function legeKanalAn(input: { name: string; beschreibung: string }): Promise<string> {
  const ersatz = 'Der Kanal konnte nicht angelegt werden.';
  const data = await rufe(
    'create_team_channel',
    { p_name: input.name, p_description: input.beschreibung.trim() || null },
    ersatz,
  );
  return antwort(z.string(), data, ersatz);
}

export async function archiviereKanal(kanalId: string, archiviert: boolean): Promise<void> {
  await rufe(
    'set_team_channel_archived',
    { p_channel: kanalId, p_archived: archiviert },
    'Der Kanal konnte nicht geändert werden.',
  );
}

// -----------------------------------------------------------------------------
// Darstellung
// -----------------------------------------------------------------------------

/** Wie ein Gespräch heißt: der Kanalname mit #, sonst die andere Person. */
export function kanalTitel(kanal: Pick<Kanal, 'kind' | 'name' | 'partner_name'>): string {
  if (kanal.kind === 'channel') return `# ${kanal.name ?? ''}`;
  return kanal.partner_name ?? 'Direktnachricht';
}

/** Was an einer Nachricht ohne Inhalt steht. */
export function ohneInhalt(nachricht: Pick<Nachricht, 'removed_kind'>): string {
  switch (nachricht.removed_kind) {
    case 'owner':
      return 'Von der Praxisleitung entfernt.';
    case 'retention':
      return 'Ältere Nachricht, nach Ablauf der Frist gelöscht.';
    default:
      return 'Gelöscht.';
  }
}

/**
 * Gesprächsliste in der Reihenfolge des Arbeitstags: Ungelesenes zuerst, dann
 * offene Kanäle nach Namen (Allgemein vorn), dann Direktnachrichten nach der
 * letzten Nachricht; Archiviertes getrennt.
 */
export function ordneKanaele(kanaele: readonly Kanal[]): { aktiv: Kanal[]; archiviert: Kanal[] } {
  const rang = (k: Kanal) => (k.kind === 'channel' ? (k.name === 'Allgemein' ? 0 : 1) : 2);
  const aktiv = kanaele
    .filter((k) => !k.archived)
    .sort((a, b) => {
      const ungelesen = Number(b.unread > 0) - Number(a.unread > 0);
      if (ungelesen !== 0) return ungelesen;
      if (rang(a) !== rang(b)) return rang(a) - rang(b);
      if (a.kind === 'direct') {
        return (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '');
      }
      return kanalTitel(a).localeCompare(kanalTitel(b), 'de');
    });
  const archiviert = kanaele
    .filter((k) => k.archived)
    .sort((a, b) => kanalTitel(a).localeCompare(kanalTitel(b), 'de'));
  return { aktiv, archiviert };
}

import { z } from 'zod';
import {
  MAX_BYTES,
  dateiAblehnungsgrund,
  dateiInhaltAblehnungsgrund,
} from '@/lib/dateien/pruefung';
import { nachSrgb } from '@/lib/dateien/farbe';
import { alleBytes, bereinigeBild } from '@/lib/dateien/metadaten';
import { bereinigeTon, tontyp } from '@/features/platform/videometadaten';
import { istPersonenfarbe, type Personenfarbe } from '@/components/ui/personenfarben';
import { roleKeySchema } from '@/features/session/types';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { alsBase64, ausBase64 } from './profilbild';
import { dauerSekunden } from './sprachnachricht';

/**
 * Teamchat (TEAM-001, TEAM-002, PROJECT_PRINCIPLES.md §10 „Intern“) über die
 * Serverfunktionen aus `supabase/migrations/20261204100000_team_001_teamchat.sql`
 * und `20261210100000_team_002_teamchat_wie_slack.sql`.
 *
 * Wer was liest, entscheidet der Server: offene Kanäle die ganze Praxis,
 * private Kanäle, Gruppen- und Direktnachrichten nur ihre Mitglieder
 * (ANN-609, ANN-642). Der Lesestand zählt nur für die Person selbst; es gibt
 * keine Lesebestätigung und keinen Online-Status (§20).
 *
 * **Text geht nie in eine Meldung, ein Log, einen Schlüssel oder eine Adresse**
 * (ADR-011): Fehler werden hier in feste Sätze übersetzt, der Entwurf bleibt im
 * Feld oder im Ausgang.
 *
 * **Zeiten bleiben Text.** Die Zeit einer Nachricht kommt mit Mikrosekunden
 * vom Server und geht als Cursor und als „gelesen bis“ unverändert zurück; ein
 * `Date` kürzte sie auf Millisekunden, und die neueste gezeigte Nachricht
 * bliebe dann ungelesen (ANN-640).
 */

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

export const GESPRAECHSARTEN = ['channel', 'private', 'direct', 'group', 'fleet'] as const;
const artSchema = z.enum(GESPRAECHSARTEN);
export type Gespraechsart = z.infer<typeof artSchema>;

/** Benachrichtigungsstufe je Gespräch (ANN-647). */
export type Stufe = 'all' | 'mentions' | 'none';

const kanalSchema = z.object({
  id: z.string(),
  kind: artSchema,
  name: z.string().nullable(),
  description: z.string().nullable(),
  archived: z.boolean(),
  partner_staff_member_id: z.string().nullable(),
  partner_name: z.string().nullable(),
  partner_active: z.boolean().nullable(),
  member_names: z.array(z.string()).nullable(),
  member_count: z.number().int().nullable(),
  unread: z.number().int(),
  mentions: z.number().int(),
  last_message_at: z.string().nullable(),
  notify: z.enum(['all', 'mentions', 'none']),
  starred: z.boolean(),
  manageable: z.boolean(),
});
export type Kanal = z.infer<typeof kanalSchema>;

/** Die feste Auswahl an Reaktionen (ANN-644) - Schlüssel, Zeichen, Name. */
export const REAKTIONEN = [
  { schluessel: 'daumen', zeichen: '👍', name: 'Daumen hoch' },
  { schluessel: 'erledigt', zeichen: '✅', name: 'Erledigt' },
  { schluessel: 'augen', zeichen: '👀', name: 'Schaue ich mir an' },
  { schluessel: 'danke', zeichen: '🙏', name: 'Danke' },
  { schluessel: 'herz', zeichen: '❤️', name: 'Herz' },
  { schluessel: 'lachen', zeichen: '😄', name: 'Lachen' },
  { schluessel: 'feier', zeichen: '🎉', name: 'Feiern' },
  { schluessel: 'frage', zeichen: '❓', name: 'Frage' },
] as const;
export type Reaktionsschluessel = (typeof REAKTIONEN)[number]['schluessel'];

const reaktionSchema = z.object({
  reaction: z.enum(
    REAKTIONEN.map((r) => r.schluessel) as [Reaktionsschluessel, ...Reaktionsschluessel[]],
  ),
  count: z.number().int(),
  own: z.boolean(),
  names: z.array(z.string()),
});
export type Reaktion = z.infer<typeof reaktionSchema>;

/**
 * Ein Anhang an einer Nachricht (TEAM-003, ADR-017 Abschnitt M): Kennung,
 * Name, Art und Größe - ohne Objektschlüssel und ohne Vorschau (Punkt 77);
 * eine Sprachnachricht mit ihrer Dauer (TEAM-004, Punkt 86).
 */
const anhangSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime_type: z.string(),
  byte_size: z.number(),
  /** Am Server geprüft (ADR-017 Punkt 51) - sonst „nicht serverseitig geprüft“. */
  verified: z.boolean(),
  /** Ganze Sekunden, nur bei einer Sprachnachricht (ANN-655). */
  duration_seconds: z.number().nullable().default(null),
});
export type Anhang = z.infer<typeof anhangSchema>;

const nachrichtSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  author_staff_member_id: z.string().nullable(),
  author_name: z.string().nullable(),
  body: z.string().nullable(),
  created_at: z.string(),
  edited: z.boolean(),
  removed_kind: z.enum(['author', 'owner', 'retention']).nullable(),
  also_in_channel: z.boolean(),
  reply_count: z.number().int(),
  last_reply_at: z.string().nullable(),
  mentions: z.array(z.string()),
  own: z.boolean(),
  /** Neue Antworten anderer seit dem eigenen Stand am Thread (nur, wenn man folgt). */
  new_replies: z.number().int(),
  /** Ob die Person in diesen neuen Antworten erwähnt ist. */
  mentioned_in_new_replies: z.boolean(),
  /** Nach dem eigenen Stand und nicht eigen - für die Linie „Neu“. */
  unread: z.boolean(),
  /** An der Ausgangsnachricht: Folgt die Person dem Thread? */
  following: z.boolean(),
  reactions: z.array(reaktionSchema),
  pinned: z.boolean(),
  /** Nur die eigene Merkliste. */
  saved: z.boolean(),
  /** An einer Antwort „auch im Kanal“: worauf sie antwortet. */
  root_author_name: z.string().nullable(),
  root_body: z.string().nullable(),
  /** TEAM-003: Anhänge in der Reihenfolge des Sendens; am Anker leer. */
  attachments: z.array(anhangSchema).default([]),
});
export type Nachricht = z.infer<typeof nachrichtSchema>;

const personSchema = z.object({ staff_member_id: z.string(), name: z.string() });
export type Person = z.infer<typeof personSchema>;

const mitgliedSchema = z.object({
  staff_member_id: z.string(),
  name: z.string(),
  active: z.boolean(),
});
export type Mitglied = z.infer<typeof mitgliedSchema>;

const trefferSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  channel_kind: artSchema,
  parent_id: z.string().nullable(),
  /** TEAM-008: für Bild und Farbe vor dem Eintrag; leer, wenn entfernt. */
  author_staff_member_id: z.string().nullable().default(null),
  author_name: z.string().nullable(),
  body: z.string(),
  created_at: z.string(),
});
export type Treffer = z.infer<typeof trefferSchema>;

const aktivitaetSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  channel_kind: artSchema,
  parent_id: z.string().nullable(),
  /** TEAM-008: für Bild und Farbe vor dem Eintrag; leer, wenn entfernt. */
  author_staff_member_id: z.string().nullable().default(null),
  author_name: z.string().nullable(),
  body: z.string(),
  created_at: z.string(),
  reason: z.enum(['mention', 'reply']),
  unread: z.boolean(),
});
export type Aktivitaet = z.infer<typeof aktivitaetSchema>;

const threadSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  channel_kind: artSchema,
  /** TEAM-008: für Bild und Farbe vor dem Eintrag; leer, wenn entfernt. */
  author_staff_member_id: z.string().nullable().default(null),
  author_name: z.string().nullable(),
  body: z.string().nullable(),
  removed_kind: z.enum(['author', 'owner', 'retention']).nullable(),
  reply_count: z.number().int(),
  last_reply_at: z.string().nullable(),
  new_replies: z.number().int(),
});
export type ThreadUeberblick = z.infer<typeof threadSchema>;

const gemerktSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  channel_kind: artSchema,
  parent_id: z.string().nullable(),
  /** TEAM-008: für Bild und Farbe vor dem Eintrag; leer, wenn entfernt. */
  author_staff_member_id: z.string().nullable().default(null),
  author_name: z.string().nullable(),
  body: z.string(),
  created_at: z.string(),
  remind_at: z.string().nullable(),
  done: z.boolean(),
  due: z.boolean(),
});
export type Gemerkt = z.infer<typeof gemerktSchema>;

const geplantSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  channel_kind: artSchema,
  body: z.string(),
  created_at: z.string(),
});
export type Geplant = z.infer<typeof geplantSchema>;

const angeheftetSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  /** TEAM-008: für Bild und Farbe vor dem Eintrag; leer, wenn entfernt. */
  author_staff_member_id: z.string().nullable().default(null),
  author_name: z.string().nullable(),
  body: z.string(),
  created_at: z.string(),
});
export type Angeheftet = z.infer<typeof angeheftetSchema>;

const zaehlerSchema = z.object({
  badge: z.number().int(),
  unread_conversations: z.number().int(),
  threads_new: z.number().int(),
  activity_unread: z.number().int(),
  saved_open: z.number().int(),
  reminders_due: z.number().int(),
  scheduled: z.number().int(),
});
export type Zaehler = z.infer<typeof zaehlerSchema>;

// -----------------------------------------------------------------------------
// Fehler in festen Sätzen - nie mit dem Text der Nachricht
// -----------------------------------------------------------------------------

type ServerError = { message?: string; code?: string } | null;

const SAETZE: readonly (readonly [string, string])[] = [
  ['message is empty', 'Die Nachricht ist leer.'],
  ['message is too long', 'Höchstens 4000 Zeichen je Nachricht.'],
  ['team channel is archived', 'Das Gespräch ist archiviert und nimmt nichts mehr an.'],
  ['team chat partner is not available', 'Diese Person ist im Teamchat nicht mehr erreichbar.'],
  ['a group needs', 'Eine Gruppe hat drei bis neun Personen.'],
  ['channel name is taken', 'Einen Kanal mit diesem Namen gibt es schon.'],
  ['channel name needs', 'Der Name braucht 1 bis 40 Zeichen, die Beschreibung höchstens 200.'],
  ['search needs', 'Bitte mindestens zwei Zeichen eingeben oder einen Filter wählen.'],
  ['send time must be', 'Planen geht eine Minute bis 30 Tage im Voraus.'],
  ['reminder must be', 'Erinnern geht eine Minute bis 90 Tage im Voraus.'],
  ['at most 50 pinned', 'Höchstens 50 angeheftete Nachrichten je Gespräch.'],
  ['only a reply can', 'Nur eine Antwort kann zusätzlich im Gespräch stehen.'],
  ['leave the channel instead', 'Selbst gehst du über „Kanal verlassen“.'],
  // TEAM-006, TEAM-007 - vor dem allgemeinen „not found“.
  ['unknown color', 'Diese Farbe gibt es nicht.'],
  [
    'profile picture rejected',
    'Dieses Bild nimmt der Server nicht an. Bitte ein anderes Foto wählen.',
  ],
  ['profile picture not found', 'Dieses Profilbild gibt es nicht mehr.'],
  ['team person not found', 'Diese Person gibt es im Team nicht.'],
  // TEAM-003: Anhänge - vor dem allgemeinen „not found“.
  ['too many attachments', 'Höchstens fünf Anhänge je Nachricht.'],
  ['too many unsent attachments', 'Zu viele Anhänge warten. Erst senden oder entfernen.'],
  ['a scheduled message has no attachments', 'Eine Nachricht mit Anhang lässt sich nicht planen.'],
  ['team attachment not found', 'Ein Anhang ist nicht mehr da. Bitte entfernen und neu anhängen.'],
  ['unsupported media type', 'Nur Fotos (JPEG, PNG) und PDF.'],
  ['file too large or empty', 'Höchstens 10 MB je Datei.'],
  ['invalid file name', 'Der Dateiname passt nicht. Bitte umbenennen.'],
  ['object was not uploaded', 'Die Datei kam nicht an. Bitte noch einmal.'],
  ['does not match the announced', 'Die Datei kam nicht vollständig an. Bitte noch einmal.'],
  ['not found', 'Das Gespräch oder die Nachricht gibt es nicht mehr.'],
  ['not allowed', 'Dafür fehlt die Berechtigung.'],
];

/**
 * Ein Fehler des Teamchats in einem festen Satz. `netz` heißt: Die Anfrage kam
 * nicht an oder der Server war gerade nicht da - dann lohnt sich ein neuer
 * Versuch mit derselben Kennung (ANN-641). Sonst hat der Server abgelehnt.
 */
export class TeamchatFehler extends Error {
  readonly netz: boolean;
  constructor(satz: string, netz: boolean) {
    super(satz);
    this.name = 'TeamchatFehler';
    this.netz = netz;
  }
}

/**
 * Ohne Netz kommt keine Handlung an. Nachrichten holt der Ausgang nach und
 * sagt das an der Nachricht selbst (`ausgang.ts`); reagieren, merken,
 * abhaken, ein Gespräch öffnen holt niemand nach - dort steht, was stimmt.
 */
const KEIN_NETZ = 'Kein Netz – nicht angekommen. Bitte gleich noch einmal.';

/**
 * SQLSTATE-Klassen, die kein Urteil über die Anfrage sind: Verbindung (08),
 * Serialisierung und Verklemmung (40001, 40P01), Ressourcen (53), Eingriff
 * des Betriebs (57). Ein anderer Code ist eine Antwort der Datenbank - auch
 * wenn PostgREST sie als HTTP 500 schickt, etwa P0002 „nicht gefunden“
 * (Zweitreview TEAM-002, Runde 3).
 */
const VORUEBERGEHEND = /^(08|53|57)|^40001$|^40P01$/;

function satz(error: ServerError, status: number, ersatz: string): TeamchatFehler {
  // Status 0: Die Anfrage hat den Server nie erreicht; 408/429 und 5xx ohne
  // Antwort der Datenbank: Er war gerade nicht bereit. Beides ist kein Urteil
  // über die Nachricht - der Ausgang versucht es dann wieder.
  const code = error?.code ?? '';
  const netz =
    status === 0 ||
    status === 408 ||
    status === 429 ||
    VORUEBERGEHEND.test(code) ||
    (status >= 500 && !/^[0-9A-Z]{5}$/.test(code));
  if (netz) return new TeamchatFehler(KEIN_NETZ, true);
  const text = error?.message ?? '';
  const treffer = SAETZE.find(([schluessel]) => text.includes(schluessel));
  return new TeamchatFehler(treffer ? treffer[1] : ersatz, false);
}

async function rufe(fn: string, args: Record<string, unknown>, ersatz: string): Promise<unknown> {
  let antwortDesServers: { data: unknown; error: ServerError; status?: number };
  try {
    antwortDesServers = (await getSupabase().rpc(fn, args)) as {
      data: unknown;
      error: ServerError;
      status?: number;
    };
  } catch {
    throw new TeamchatFehler(KEIN_NETZ, true);
  }
  const { data, error, status = error ? 400 : 200 } = antwortDesServers;
  if (error) throw satz(error, status, ersatz);
  return data;
}

// -----------------------------------------------------------------------------
// Schlüssel und Takt
// -----------------------------------------------------------------------------

export const TEAMCHAT_KEY = ['teamchat'] as const;
export const KANAELE_KEY = [...TEAMCHAT_KEY, 'kanaele'] as const;
export const PERSONEN_KEY = [...TEAMCHAT_KEY, 'personen'] as const;
export const AKTIVITAET_KEY = [...TEAMCHAT_KEY, 'aktivitaet'] as const;
export const THREADS_KEY = [...TEAMCHAT_KEY, 'threads'] as const;
export const ZAEHLER_KEY = [...TEAMCHAT_KEY, 'zaehler'] as const;
export const GEMERKT_KEY = [...TEAMCHAT_KEY, 'gemerkt'] as const;
export const GEPLANT_KEY = [...TEAMCHAT_KEY, 'geplant'] as const;

export function verlaufKey(kanalId: string, threadId: string | null = null) {
  return [...TEAMCHAT_KEY, 'verlauf', kanalId, threadId] as const;
}

export function mitgliederKey(kanalId: string) {
  return [...TEAMCHAT_KEY, 'mitglieder', kanalId] as const;
}

export function angeheftetKey(kanalId: string) {
  return [...TEAMCHAT_KEY, 'angeheftet', kanalId] as const;
}

/** Der Suchschlüssel trägt nur einen Zähler, nie den Suchtext (ADR-011). */
export function sucheKey(lauf: number) {
  return [...TEAMCHAT_KEY, 'suche', lauf] as const;
}

/**
 * Wie oft eine offene Liste nachsieht - es gibt keine Push-Zustellung
 * (ANN-612). Ein offenes Gespräch sieht öfter nach ({@link GESPRAECH_MS}),
 * der Zähler am Bereich seltener ({@link ZAEHLER_MS}).
 */
export const NACHSEHEN_MS = 20_000;
export const GESPRAECH_MS = 10_000;
export const ZAEHLER_MS = 30_000;

/**
 * Die Liste der Gespräche bleibt einen Arbeitstag im Arbeitsspeicher, nicht
 * nur die üblichen fünf Minuten: Wer im Funkloch den Teamchat öffnet, findet
 * Liste, Gespräch und Eingabe und kann in den Ausgang schreiben
 * (Praxis-Sichtung TEAM-002). Nichts davon liegt auf dem Gerät; beim
 * Kontowechsel räumt der `SessionProvider` ab. Von mehreren Abfragen desselben
 * Schlüssels gilt die längste Haltezeit.
 */
export const GESPRAECHE_HALTEN_MS = 12 * 3_600_000;

// -----------------------------------------------------------------------------
// Lesen
// -----------------------------------------------------------------------------

const LADEN_KANAELE = 'Die Gespräche konnten nicht geladen werden.';

export async function fetchKanaele(): Promise<Kanal[]> {
  const data = await rufe('list_team_channels', {}, LADEN_KANAELE);
  return antwort(z.array(kanalSchema), data, LADEN_KANAELE);
}

const LADEN_NACHRICHTEN = 'Die Nachrichten konnten nicht geladen werden.';

/** Eine Stelle im Verlauf: (Zeit, Kennung) - die Zeit als Text vom Server. */
export interface Cursor {
  at: string;
  id: string;
}

/** Welche Seite eines Verlaufs (ANN-641). */
export type Blatt =
  | { art: 'neueste' }
  | { art: 'vor'; cursor: Cursor }
  | { art: 'nach'; cursor: Cursor }
  | { art: 'um'; id: string };

/** Im Gespräch höchstens so viele je Seite, im Thread mehr. */
export const SEITE_GESPRAECH = 50;
export const SEITE_THREAD = 100;

/**
 * Nachrichten eines Gesprächs (ohne Thread: was im Gespräch steht) oder eines
 * Threads (die Ausgangsnachricht und die Antworten), aufsteigend nach (Zeit,
 * Kennung). Blättern mit Cursor, ohne Lücke und ohne Doppel.
 */
export async function fetchNachrichten(
  kanalId: string,
  threadId: string | null = null,
  blatt: Blatt = { art: 'neueste' },
): Promise<Nachricht[]> {
  const data = await rufe(
    'list_team_messages',
    {
      p_channel: kanalId,
      p_parent: threadId,
      p_before_at: blatt.art === 'vor' ? blatt.cursor.at : null,
      p_before_id: blatt.art === 'vor' ? blatt.cursor.id : null,
      p_after_at: blatt.art === 'nach' ? blatt.cursor.at : null,
      p_after_id: blatt.art === 'nach' ? blatt.cursor.id : null,
      p_around: blatt.art === 'um' ? blatt.id : null,
      p_limit: threadId ? SEITE_THREAD : SEITE_GESPRAECH,
    },
    LADEN_NACHRICHTEN,
  );
  return antwort(z.array(nachrichtSchema), data, LADEN_NACHRICHTEN);
}

const LADEN_PERSONEN = 'Das Team konnte nicht geladen werden.';

export async function fetchPersonen(): Promise<Person[]> {
  const data = await rufe('list_team_people', {}, LADEN_PERSONEN);
  return antwort(z.array(personSchema), data, LADEN_PERSONEN);
}

// -----------------------------------------------------------------------------
// Farbe und Profilbild je Person (TEAM-006, TEAM-007, ANN-666, ANN-667)
// -----------------------------------------------------------------------------

/**
 * Außerhalb von `TEAMCHAT_KEY`: Jede Nachricht frischt den Teamchat auf, Farbe
 * und Bild ändern sich nur, wenn jemand die eigenen ändert.
 */
export const AVATARE_KEY = ['teambilder'] as const;

/** Ein Bild je Kennung: Ein neues Bild hat eine neue Kennung (ADR-017 Punkt 8). */
export function profilbildKey(pictureId: string) {
  return [...AVATARE_KEY, 'bild', pictureId] as const;
}

const avatarSchema = z.object({
  staff_member_id: z.string(),
  // Eine Farbe, die diese Fassung nicht kennt, wird zu `schiefer`, statt die
  // ganze Liste zu verwerfen.
  color: z.string().transform((farbe) => (istPersonenfarbe(farbe) ? farbe : 'schiefer')),
  /** Kennung des Profilbilds - zugleich seine Fassung; ohne Bild `null`. */
  picture_id: z.string().nullable().default(null),
  /** Die eigene Zeile - der Server kennt den eigenen Datensatz für jede Rolle. */
  own: z.boolean().default(false),
});
export type Avatar = z.infer<typeof avatarSchema>;

const LADEN_AVATARE = 'Bilder und Farben des Teams konnten nicht geladen werden.';

export async function fetchAvatare(): Promise<Avatar[]> {
  const data = await rufe('list_team_avatars', {}, LADEN_AVATARE);
  return antwort(z.array(avatarSchema), data, LADEN_AVATARE);
}

export async function waehleFarbe(farbe: Personenfarbe): Promise<void> {
  await rufe(
    'set_own_team_color',
    { p_color: farbe },
    'Die Farbe konnte nicht gespeichert werden.',
  );
}

/**
 * Geladene Bilder als Objekt-URL, je Kennung genau eine: Ein Bild ändert sich
 * nie, eine Liste mit 50 Nachrichten zeigt dieselbe Adresse 50-mal. Wenige
 * Kilobyte je Person; freigegeben wird mit dem Neuladen der Seite.
 */
const geladeneBilder = new Map<string, string>();

const LADEN_BILD = 'Das Profilbild konnte nicht geladen werden.';

export async function ladeProfilbild(pictureId: string): Promise<string> {
  const bekannt = geladeneBilder.get(pictureId);
  if (bekannt) return bekannt;
  const data = await rufe('get_team_profile_picture', { p_picture: pictureId }, LADEN_BILD);
  const bild = ausBase64(antwort(z.string().min(1), data, LADEN_BILD));
  const adresse = URL.createObjectURL(bild);
  geladeneBilder.set(pictureId, adresse);
  return adresse;
}

/** Das eigene Profilbild setzen - das gerechnete Quadrat aus `rechneProfilbild`. */
export async function setzeProfilbild(bild: Blob): Promise<string> {
  const SPEICHERN = 'Das Profilbild konnte nicht gespeichert werden.';
  const data = await rufe(
    'set_own_profile_picture',
    { p_image: alsBase64(await alleBytes(bild)) },
    SPEICHERN,
  );
  return antwort(z.string(), data, SPEICHERN);
}

export async function entferneProfilbild(): Promise<void> {
  await rufe('remove_own_profile_picture', {}, 'Das Profilbild konnte nicht entfernt werden.');
}

// -----------------------------------------------------------------------------
// Personenkarte (TEAM-009, ANN-668)
// -----------------------------------------------------------------------------

/** Unter `AVATARE_KEY`: Rollen ändern sich so selten wie Bild und Farbe. */
export function personenkarteKey(staffMemberId: string) {
  return [...AVATARE_KEY, 'karte', staffMemberId] as const;
}

const personenkarteSchema = z.object({
  staff_member_id: z.string(),
  name: z.string().nullable(),
  // Eine Rolle, die diese Fassung nicht kennt, fällt weg.
  roles: z.array(z.string()).transform((rollen) =>
    rollen.flatMap((rolle) => {
      const bekannt = roleKeySchema.safeParse(rolle);
      return bekannt.success ? [bekannt.data] : [];
    }),
  ),
  /** Nimmt am Teamchat teil; sonst ausgeschieden oder noch ohne Zugang. */
  active: z.boolean(),
  own: z.boolean(),
});
export type Personenkarte = z.infer<typeof personenkarteSchema>;

const LADEN_KARTE = 'Die Personenkarte konnte nicht geladen werden.';

export async function fetchPersonenkarte(staffMemberId: string): Promise<Personenkarte> {
  const data = await rufe('get_team_person', { p_staff: staffMemberId }, LADEN_KARTE);
  const [karte] = antwort(z.array(personenkarteSchema).length(1), data, LADEN_KARTE);
  return karte!;
}

const LADEN_MITGLIEDER = 'Die Mitglieder konnten nicht geladen werden.';

export async function fetchMitglieder(kanalId: string): Promise<Mitglied[]> {
  const data = await rufe('list_team_channel_members', { p_channel: kanalId }, LADEN_MITGLIEDER);
  return antwort(z.array(mitgliedSchema), data, LADEN_MITGLIEDER);
}

const SUCHEN = 'Die Suche hat nicht geklappt.';

export interface Suchfilter {
  text: string;
  kanalId: string | null;
  personId: string | null;
  /** Erster Tag, `YYYY-MM-DD` in der Zeitzone der Praxis. */
  ab: string | null;
}

export async function sucheNachrichten(filter: Suchfilter): Promise<Treffer[]> {
  const data = await rufe(
    'search_team_messages',
    {
      p_query: filter.text.trim() || null,
      p_channel: filter.kanalId,
      p_author: filter.personId,
      p_from: filter.ab,
      p_to: null,
    },
    SUCHEN,
  );
  return antwort(z.array(trefferSchema), data, SUCHEN);
}

const LADEN_AKTIVITAET = '„Für dich“ konnte nicht geladen werden.';

/** Erwähnungen und Antworten in Threads, denen man folgt (ANN-614). */
export async function fetchAktivitaet(): Promise<Aktivitaet[]> {
  const data = await rufe('list_team_activity', {}, LADEN_AKTIVITAET);
  return antwort(z.array(aktivitaetSchema), data, LADEN_AKTIVITAET);
}

const LADEN_THREADS = 'Die Threads konnten nicht geladen werden.';

/** Threads, denen man folgt, die mit Neuem zuerst (ANN-640). */
export async function fetchThreads(): Promise<ThreadUeberblick[]> {
  const data = await rufe('list_team_threads', {}, LADEN_THREADS);
  return antwort(z.array(threadSchema), data, LADEN_THREADS);
}

const LADEN_GEMERKT = '„Für später“ konnte nicht geladen werden.';

export async function fetchGemerkt(erledigt = false): Promise<Gemerkt[]> {
  const data = await rufe('list_team_saved', { p_done: erledigt }, LADEN_GEMERKT);
  return antwort(z.array(gemerktSchema), data, LADEN_GEMERKT);
}

const LADEN_GEPLANT = 'Geplante Nachrichten konnten nicht geladen werden.';

export async function fetchGeplant(): Promise<Geplant[]> {
  const data = await rufe('list_team_scheduled', {}, LADEN_GEPLANT);
  return antwort(z.array(geplantSchema), data, LADEN_GEPLANT);
}

const LADEN_ANGEHEFTET = 'Angeheftetes konnte nicht geladen werden.';

export async function fetchAngeheftet(kanalId: string): Promise<Angeheftet[]> {
  const data = await rufe('list_team_pins', { p_channel: kanalId }, LADEN_ANGEHEFTET);
  return antwort(z.array(angeheftetSchema), data, LADEN_ANGEHEFTET);
}

const LADEN_ZAEHLER = 'Neues im Teamchat konnte nicht geladen werden.';

/** Der Zähler für die Navigation - Benachrichtigung in der App (ANN-647). */
export async function fetchZaehler(): Promise<Zaehler> {
  const data = await rufe('get_team_chat_summary', {}, LADEN_ZAEHLER);
  const zeilen = antwort(z.array(zaehlerSchema), data, LADEN_ZAEHLER);
  const zeile = zeilen[0];
  if (!zeile) throw new TeamchatFehler(LADEN_ZAEHLER, false);
  return zeile;
}

// -----------------------------------------------------------------------------
// Schreiben
// -----------------------------------------------------------------------------

export interface Sendeauftrag {
  /** Die Kennung des Geräts (ANN-641) - zweimal gesendet ist einmal gespeichert. */
  id: string;
  kanalId: string;
  threadId: string | null;
  text: string;
  erwaehnt: readonly string[];
  alle: boolean;
  auchImKanal: boolean;
  /** Später senden (ANN-643): ISO-Zeit oder `null`. */
  um: string | null;
  /**
   * TEAM-003: schon hochgeladene und bestätigte Anhänge - nur ihre Kennungen
   * gehen zum Server, Name und Größe zeigen sie im Ausgang an.
   */
  anhaenge: readonly Anhang[];
}

export async function sendeNachricht(auftrag: Sendeauftrag): Promise<string> {
  const ersatz = 'Die Nachricht konnte nicht gesendet werden.';
  const data = await rufe(
    'post_team_message',
    {
      p_channel: auftrag.kanalId,
      p_parent: auftrag.threadId,
      p_body: auftrag.text,
      p_mentions: auftrag.erwaehnt,
      p_id: auftrag.id,
      p_mention_all: auftrag.alle,
      p_also_in_channel: auftrag.auchImKanal,
      p_send_at: auftrag.um,
      p_attachments: auftrag.anhaenge.map((a) => a.id),
    },
    ersatz,
  );
  return antwort(z.string(), data, ersatz);
}

// -----------------------------------------------------------------------------
// Anhänge (TEAM-003, ADR-017 Abschnitt M): derselbe Weg wie die Belege
// -----------------------------------------------------------------------------

/** Höchstens so viele Anhänge je Nachricht (ADR-017 Punkt 71) - wie am Server. */
export const ANHAENGE_MAX = 5;

async function pruefsumme(datei: Blob): Promise<string> {
  const bytes = await alleBytes(datei);
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const vorbereitetSchema = z.object({
  attachment_id: z.string(),
  bucket_id: z.string(),
  object_key: z.string(),
});

/** Was die Person liest, wenn der Server einen Anhang verwirft (ADR-017 Punkt 52). */
export const ANHANG_VERWORFEN =
  'Der Anhang wurde bei der Prüfung am Server verworfen. Bitte neu anhängen.';

const NICHT_UEBERTRAGEN = 'Nicht hochgeladen – kein Netz? Bitte noch einmal.';

/** Ein Nein der Ablage, das sich durch Warten nicht ändert. */
const NICHT_ANGENOMMEN =
  'Die Ablage hat die Datei nicht angenommen. Bitte entfernen und noch einmal wählen.';

/**
 * Wie `satz`: Nur was vorübergehend ist - keine Antwort, 408, 429, 5xx - heißt
 * „kein Netz“ und wird von selbst wiederholt. Ein Nein der Ablage (403, 413,
 * 415 …) bliebe es bei jedem Versuch, und jeder Versuch legte eine Zeile an
 * und verwürfe sie wieder (Zweitreview TEAM-003, Runde 2).
 */
function speicherfehler(fehler: unknown): TeamchatFehler {
  const status =
    typeof fehler === 'object' && fehler !== null && 'status' in fehler
      ? Number(fehler.status) || 0
      : 0;
  const voruebergehend = status === 0 || status === 408 || status === 429 || status >= 500;
  return voruebergehend
    ? new TeamchatFehler(NICHT_UEBERTRAGEN, true)
    : new TeamchatFehler(NICHT_ANGENOMMEN, false);
}

/** Eine Datei, deren Inhalt nicht zu ihrer Art passt - etwa umbenannt. */
export const FALSCHE_DATEI =
  'Diese Datei lässt sich nicht senden. Bitte entfernen und eine andere wählen.';

/** Der Anhang fiel während des Hochladens - entfernt, abgemeldet, Konto gewechselt. */
export const ABGEBROCHEN = 'Das Hochladen ist abgebrochen.';

/**
 * Die Sitzungen dieser Seite: Abmelden und Kontowechsel (`anhaengeLeeren`)
 * beginnen eine neue. Ein Hochladen merkt sich beim Start die seine; ist sie
 * vorbei, geht kein Schritt mehr zum Server, auch kein Aufräumen - er liefe
 * unter der nächsten Sitzung. Das gilt auch für einen Anhang, der vorher
 * schon entfernt war. Was oben liegt, verwirft der Server nach 24 Stunden
 * (Zweitreview TEAM-005, Runden 3 und 4).
 */
let sitzung = 0;

/** Die Sitzung endet - beim Abmelden und Kontowechsel. */
export function sitzungBeenden(): void {
  sitzung += 1;
}

/** Ob die Sitzung, in der etwas begann, inzwischen vorbei ist. */
export function sitzungsmarke(): () => boolean {
  const beginn = sitzung;
  return () => sitzung !== beginn;
}

/** Fiel der Anhang während des Hochladens, unterbleibt der nächste Schritt. */
function weiterOderAbbrechen(signal?: AbortSignal): void {
  if (signal?.aborted) throw new TeamchatFehler(ABGEBROCHEN, false);
}

/** Eine Aufnahme, die nicht reiner Ton ist (Punkt 84). */
export const FALSCHE_AUFNAHME =
  'Diese Aufnahme lässt sich nicht senden. Bitte entfernen und neu aufnehmen.';

/**
 * Einen Anhang hochladen - bevor die Nachricht hinausgeht (ADR-017 Punkte 7
 * und 74): Format und Inhalt prüfen, Farbe nach sRGB, Metadaten eines Fotos
 * verlustfrei entfernen (Punkte 34 und 53), Prüfsumme der bereinigten Bytes,
 * dann (a) vorbereiten, (b) hochladen, (c) bestätigen und die Prüfung am
 * Server. Scheitert (b) oder (c), wird der Anhang verworfen. `netz` am
 * Fehler heißt: ein neuer Versuch kann gelingen - ein falsches Format nicht.
 * Die Bytes liegen bis dahin nur im Arbeitsspeicher; ohne Netz gibt es keinen
 * Anhang (Punkt 33).
 *
 * Eine Sprachnachricht (TEAM-004) kommt nur aus der Aufnahme der App, mit
 * ihrer Dauer (`dauerS`): Programm- und Zeitangaben werden geleert, und nur
 * reiner Ton geht hinaus (Punkt 84). Ton ohne Dauer - etwa aus dem
 * Dateiwähler - nimmt die Formprüfung wie jedes fremde Format nicht an.
 */
export async function ladeAnhangHoch(
  kanalId: string,
  datei: Blob,
  name: string,
  dauerS?: number,
  signal?: AbortSignal,
): Promise<Anhang> {
  const sitzungVorbei = sitzungsmarke();
  const dauer = dauerS !== undefined && tontyp(datei.type) !== null ? dauerSekunden(dauerS) : null;
  let sauber: Blob;
  if (dauer !== null) {
    const ergebnis = await bereinigeTon(datei);
    if (!ergebnis.ok) throw new TeamchatFehler(FALSCHE_AUFNAHME, false);
    if (ergebnis.ton.size > MAX_BYTES) {
      throw new TeamchatFehler('Die Sprachnachricht ist zu groß. Bitte kürzer aufnehmen.', false);
    }
    sauber = ergebnis.ton;
  } else {
    const grund = dateiAblehnungsgrund(datei);
    if (grund) throw new TeamchatFehler(grund, false);
    // Im Teamchat ohne Formatnamen: was zu tun ist (Praxis-Review TEAM-003).
    if (await dateiInhaltAblehnungsgrund(datei)) throw new TeamchatFehler(FALSCHE_DATEI, false);
    sauber = await bereinigeBild(await nachSrgb(datei));
  }
  const summe = await pruefsumme(sauber);
  weiterOderAbbrechen(signal);

  const ersatz = 'Der Anhang konnte nicht angenommen werden.';
  let data: unknown;
  try {
    data = await rufe(
      'prepare_team_attachment_upload',
      {
        p_channel: kanalId,
        p_mime_type: sauber.type,
        p_byte_size: sauber.size,
        p_checksum_sha256: summe,
        p_name: name,
        p_duration_seconds: dauer,
      },
      ersatz,
    );
  } catch (ursache) {
    // Ohne Netz scheitert schon das Vorbereiten - für die Person dasselbe:
    // nicht hochgeladen, ein neuer Versuch kann gelingen.
    if (ursache instanceof TeamchatFehler && ursache.netz) {
      throw new TeamchatFehler(NICHT_UEBERTRAGEN, true);
    }
    throw ursache;
  }
  const vorbereitet = antwort(z.array(vorbereitetSchema), data ?? [], ersatz)[0];
  if (!vorbereitet) throw new TeamchatFehler(ersatz, false);

  try {
    // ADR-017 Punkte 8 und 16: kein Überschreiben, kein Zwischenspeicher.
    weiterOderAbbrechen(signal);
    let hochgeladen: { error: unknown };
    try {
      hochgeladen = await getSupabase()
        .storage.from(vorbereitet.bucket_id)
        .upload(vorbereitet.object_key, sauber, {
          contentType: sauber.type,
          cacheControl: '0',
          upsert: false,
        });
    } catch {
      throw new TeamchatFehler(NICHT_UEBERTRAGEN, true);
    }
    if (hochgeladen.error) throw speicherfehler(hochgeladen.error);
    weiterOderAbbrechen(signal);
    await rufe(
      'confirm_team_attachment_upload',
      { p_attachment_id: vorbereitet.attachment_id },
      'Die Datei kam nicht vollständig an. Bitte noch einmal.',
    );
  } catch (ursache) {
    // Was vorbereitet war, fällt gleich wieder - nach dem Abmelden nicht mehr.
    if (!sitzungVorbei()) {
      try {
        await getSupabase().rpc('discard_team_attachment', {
          p_attachment_id: vorbereitet.attachment_id,
        });
      } catch {
        // Der ursprüngliche Grund ist die Meldung; der tägliche Lauf räumt auf.
      }
    }
    throw ursache instanceof TeamchatFehler ? ursache : new TeamchatFehler(NICHT_UEBERTRAGEN, true);
  }

  // Nach dem Abmelden auch keine Prüfung; ein entfernter Anhang wird dagegen
  // fertig und dann verworfen (`hochladen` in `entwurfsanhaenge.ts`).
  if (sitzungVorbei()) throw new TeamchatFehler(ABGEBROCHEN, false);
  const pruefung = await pruefeAmServer(vorbereitet.attachment_id);
  if (pruefung === 'rejected') throw new TeamchatFehler(ANHANG_VERWORFEN, false);
  return {
    id: vorbereitet.attachment_id,
    name,
    mime_type: sauber.type,
    byte_size: sauber.size,
    verified: pruefung === 'passed' || pruefung === 'already_verified',
    duration_seconds: dauer,
  };
}

/** Prüfung am Inhalt (Edge Function `patient-file-verify`); ohne Function kein Fehler. */
async function pruefeAmServer(anhangId: string): Promise<string | null> {
  try {
    const { data, error } = (await getSupabase().functions.invoke<unknown>('patient-file-verify', {
      body: { team_attachment_id: anhangId },
    })) as { data: unknown; error: unknown };
    if (error) return null;
    const ergebnis = z.object({ ergebnis: z.string() }).safeParse(data);
    return ergebnis.success ? ergebnis.data.ergebnis : null;
  } catch {
    return null;
  }
}

/** Einen eigenen, noch nicht gesendeten Anhang verwerfen. */
export async function verwirfAnhang(anhangId: string): Promise<void> {
  await rufe(
    'discard_team_attachment',
    { p_attachment_id: anhangId },
    'Der Anhang konnte nicht verworfen werden.',
  );
}

/** Gültigkeit eines signierten Verweises in Sekunden (ADR-017 Punkt 15). */
const VERWEIS_SEKUNDEN = 60;

/**
 * Einen gesendeten Anhang zum Ansehen laden - in den Speicher der Seite,
 * nicht auf das Gerät (ADR-017 Punkte 54 und 77): erst die einmalige
 * Freigabe, dann der Verweis, dann `fetch` ohne Zwischenspeicher. Der
 * Verweis verlässt diese Funktion nicht.
 */
export async function ladeAnhang(anhangId: string): Promise<Blob> {
  const ersatz = 'Der Anhang konnte nicht geöffnet werden.';
  const data = await rufe('issue_team_attachment_link', { p_attachment_id: anhangId }, ersatz);
  const freigabe = antwort(
    z.array(z.object({ bucket_id: z.string(), object_key: z.string(), mime_type: z.string() })),
    data ?? [],
    ersatz,
  )[0];
  if (!freigabe) throw new TeamchatFehler(ersatz, false);
  let adresse: string | undefined;
  try {
    const { data: signiert, error } = await getSupabase()
      .storage.from(freigabe.bucket_id)
      .createSignedUrl(freigabe.object_key, VERWEIS_SEKUNDEN);
    if (error) throw error;
    adresse = signiert?.signedUrl;
  } catch {
    throw new TeamchatFehler(KEIN_NETZ, true);
  }
  if (!adresse) throw new TeamchatFehler('Der Anhang fehlt in der Ablage.', false);
  let geladen: Response;
  try {
    geladen = await fetch(adresse, { cache: 'no-store' });
  } catch {
    throw new TeamchatFehler(KEIN_NETZ, true);
  }
  if (!geladen.ok) throw new TeamchatFehler('Der Anhang konnte nicht geladen werden.', false);
  return new Blob([await geladen.arrayBuffer()], { type: freigabe.mime_type });
}

const dateiSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  parent_id: z.string().nullable(),
  display_name: z.string(),
  mime_type: z.string(),
  byte_size: z.number(),
  created_at: z.string(),
  author_name: z.string().nullable(),
  verified: z.boolean(),
  /** Ganze Sekunden, nur bei einer Sprachnachricht (TEAM-004). */
  duration_seconds: z.number().nullable().default(null),
});
export type Datei = z.infer<typeof dateiSchema>;

/** So viele Dateien holt „Dateien“ in den Details höchstens - die neuesten (Server: 200). */
export const DATEIEN_HOECHSTENS = 200;

export function dateienKey(kanalId: string) {
  return [...TEAMCHAT_KEY, 'dateien', kanalId] as const;
}

/** Dateien je Gespräch (ADR-017 Punkt 80): die neuesten zuerst. */
export async function fetchDateien(kanalId: string): Promise<Datei[]> {
  const ersatz = 'Die Dateien konnten nicht geladen werden.';
  const data = await rufe(
    'list_team_channel_attachments',
    { p_channel: kanalId, p_limit: DATEIEN_HOECHSTENS },
    ersatz,
  );
  return antwort(z.array(dateiSchema), data ?? [], ersatz);
}

export async function bearbeiteNachricht(input: {
  id: string;
  text: string;
  erwaehnt: readonly string[];
  alle: boolean;
}): Promise<void> {
  await rufe(
    'edit_team_message',
    {
      p_message: input.id,
      p_body: input.text,
      p_mentions: input.erwaehnt,
      p_mention_all: input.alle,
    },
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

const LESESTAND = 'Der Lesestand konnte nicht gespeichert werden.';

/** Gelesen bis höchstens `bis` - der Zeit der neuesten gezeigten Nachricht (ANN-640). */
export async function markiereGelesen(kanalId: string, bis: string | null): Promise<void> {
  await rufe('mark_team_channel_read', { p_channel: kanalId, p_up_to: bis }, LESESTAND);
}

export async function markiereThreadGelesen(threadId: string, bis: string | null): Promise<void> {
  await rufe('mark_team_thread_read', { p_root: threadId, p_up_to: bis }, LESESTAND);
}

export async function markiereUngelesen(nachrichtId: string): Promise<void> {
  await rufe('mark_team_unread', { p_message: nachrichtId }, LESESTAND);
}

export async function markiereAllesGelesen(): Promise<void> {
  await rufe('mark_all_team_channels_read', {}, 'Nicht alles ließ sich als gelesen markieren.');
}

export async function folgeThread(threadId: string, folgen: boolean): Promise<void> {
  await rufe(
    'set_team_thread_following',
    { p_root: threadId, p_following: folgen },
    'Folgen ließ sich nicht ändern.',
  );
}

export async function oeffneDirekt(staffMemberId: string): Promise<string> {
  const ersatz = 'Die Direktnachricht konnte nicht geöffnet werden.';
  const data = await rufe('open_team_direct', { p_staff_member: staffMemberId }, ersatz);
  return antwort(z.string(), data, ersatz);
}

export async function oeffneGruppe(staffMemberIds: readonly string[]): Promise<string> {
  const ersatz = 'Die Gruppennachricht konnte nicht geöffnet werden.';
  const data = await rufe('open_team_group', { p_staff_members: staffMemberIds }, ersatz);
  return antwort(z.string(), data, ersatz);
}

export async function legeKanalAn(input: {
  name: string;
  beschreibung: string;
  privat: boolean;
  mitglieder: readonly string[];
}): Promise<string> {
  const ersatz = 'Der Kanal konnte nicht angelegt werden.';
  const data = await rufe(
    'create_team_channel',
    {
      p_name: input.name,
      p_description: input.beschreibung.trim() || null,
      p_private: input.privat,
      p_members: input.mitglieder,
    },
    ersatz,
  );
  return antwort(z.string(), data, ersatz);
}

export async function aendereKanal(input: {
  kanalId: string;
  name: string;
  beschreibung: string;
}): Promise<void> {
  await rufe(
    'update_team_channel',
    {
      p_channel: input.kanalId,
      p_name: input.name,
      p_description: input.beschreibung.trim() || null,
    },
    'Der Kanal konnte nicht geändert werden.',
  );
}

export async function archiviereKanal(kanalId: string, archiviert: boolean): Promise<void> {
  await rufe(
    'set_team_channel_archived',
    { p_channel: kanalId, p_archived: archiviert },
    'Der Kanal konnte nicht geändert werden.',
  );
}

export async function holeMitglieder(kanalId: string, personen: readonly string[]): Promise<void> {
  await rufe(
    'add_team_channel_members',
    { p_channel: kanalId, p_staff_members: personen },
    'Die Personen konnten nicht hinzugefügt werden.',
  );
}

export async function entferneMitglied(kanalId: string, staffMemberId: string): Promise<void> {
  await rufe(
    'remove_team_channel_member',
    { p_channel: kanalId, p_staff_member: staffMemberId },
    'Die Person konnte nicht herausgenommen werden.',
  );
}

export async function verlasseKanal(kanalId: string): Promise<void> {
  await rufe('leave_team_channel', { p_channel: kanalId }, 'Der Kanal ließ sich nicht verlassen.');
}

export async function setzeEinstellungen(
  kanalId: string,
  einstellungen: { stufe?: Stufe; favorit?: boolean },
): Promise<void> {
  await rufe(
    'set_team_channel_preferences',
    {
      p_channel: kanalId,
      p_notify: einstellungen.stufe ?? null,
      p_starred: einstellungen.favorit ?? null,
    },
    'Die Einstellung konnte nicht gespeichert werden.',
  );
}

export async function reagiere(
  nachrichtId: string,
  reaktion: Reaktionsschluessel,
): Promise<boolean> {
  const ersatz = 'Die Reaktion konnte nicht gespeichert werden.';
  const data = await rufe(
    'toggle_team_reaction',
    { p_message: nachrichtId, p_reaction: reaktion },
    ersatz,
  );
  return antwort(z.boolean(), data, ersatz);
}

export async function hefteAn(nachrichtId: string, angeheftet: boolean): Promise<void> {
  await rufe(
    'set_team_message_pinned',
    { p_message: nachrichtId, p_pinned: angeheftet },
    'Anheften hat nicht geklappt.',
  );
}

export async function merke(nachrichtId: string, erinnernUm: string | null): Promise<void> {
  await rufe(
    'save_team_message',
    { p_message: nachrichtId, p_remind_at: erinnernUm },
    'Merken hat nicht geklappt.',
  );
}

export async function aendereGemerkt(
  nachrichtId: string,
  aenderung: { erledigt?: boolean; erinnernUm?: string | null },
): Promise<void> {
  await rufe(
    'update_team_saved',
    {
      p_message: nachrichtId,
      p_done: aenderung.erledigt ?? null,
      p_remind_at: aenderung.erinnernUm ?? null,
      p_clear_reminder: aenderung.erinnernUm === null,
    },
    'Die Merkliste ließ sich nicht ändern.',
  );
}

export async function vergiss(nachrichtId: string): Promise<void> {
  await rufe(
    'unsave_team_message',
    { p_message: nachrichtId },
    'Die Merkliste ließ sich nicht ändern.',
  );
}

/** Eine geplante Nachricht jetzt senden (`um` leer) oder neu planen. */
export async function planeNeu(nachrichtId: string, um: string | null): Promise<void> {
  await rufe(
    'reschedule_team_message',
    { p_message: nachrichtId, p_send_at: um },
    'Die geplante Nachricht ließ sich nicht ändern.',
  );
}

// -----------------------------------------------------------------------------
// Darstellung
// -----------------------------------------------------------------------------

/** Wie ein Gespräch heißt: Kanalname mit #, sonst die anderen Beteiligten. */
export function kanalTitel(
  kanal: Pick<Kanal, 'kind' | 'name' | 'partner_name'> & { member_names?: string[] | null },
): string {
  if (kanal.kind === 'channel' || kanal.kind === 'private') return `# ${kanal.name ?? ''}`;
  if (kanal.kind === 'fleet') return 'Nachrichten der Radflotte';
  if (kanal.kind === 'group') return (kanal.member_names ?? []).join(', ') || 'Gruppennachricht';
  return kanal.partner_name ?? 'Direktnachricht';
}

/** Warum in einem Gespräch nichts mehr geschrieben werden kann - oder `null`. */
export function gesperrtSatz(
  kanal: Pick<Kanal, 'archived' | 'kind' | 'partner_active' | 'partner_name'>,
): string | null {
  if (kanal.archived) return 'Archiviert – nur noch lesbar.';
  if (kanal.kind === 'direct' && kanal.partner_active === false) {
    return `${kanal.partner_name ?? 'Diese Person'} ist nicht mehr im Team.`;
  }
  return null;
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

/** Steht das Gespräch fett? Nach der eigenen Stufe (ANN-647), wie Slack. */
export function istFett(kanal: Pick<Kanal, 'kind' | 'notify' | 'unread' | 'mentions'>): boolean {
  if (kanal.mentions > 0) return true;
  if (kanal.notify === 'none') return false;
  if (kanal.notify === 'mentions')
    return kanal.kind === 'direct' || kanal.kind === 'group' ? kanal.unread > 0 : false;
  return kanal.unread > 0;
}

/**
 * Gesprächsliste in der Reihenfolge des Arbeitstags: Favoriten, Kanäle,
 * Direkt- und Gruppennachrichten; in jedem Abschnitt Fettes zuerst, Kanäle
 * dann nach Namen, Nachrichten nach der letzten Nachricht. Archiviertes
 * getrennt. Das Gespräch der Radflotte steht in der Radflotte (ANN-613).
 */
export function ordneKanaele(kanaele: readonly Kanal[]): {
  favoriten: Kanal[];
  kanaele: Kanal[];
  direkt: Kanal[];
  archiviert: Kanal[];
} {
  const reihe = (a: Kanal, b: Kanal) => {
    const fett = Number(istFett(b)) - Number(istFett(a));
    if (fett !== 0) return fett;
    const kanalA = a.kind === 'channel' || a.kind === 'private';
    const kanalB = b.kind === 'channel' || b.kind === 'private';
    if (kanalA !== kanalB) return kanalA ? -1 : 1;
    if (!kanalA) return (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '');
    return kanalTitel(a).localeCompare(kanalTitel(b), 'de');
  };
  const sichtbar = kanaele.filter((k) => k.kind !== 'fleet');
  const aktiv = sichtbar.filter((k) => !k.archived);
  return {
    favoriten: aktiv.filter((k) => k.starred).sort(reihe),
    kanaele: aktiv
      .filter((k) => !k.starred && (k.kind === 'channel' || k.kind === 'private'))
      .sort(reihe),
    direkt: aktiv
      .filter((k) => !k.starred && (k.kind === 'direct' || k.kind === 'group'))
      .sort(reihe),
    archiviert: sichtbar
      .filter((k) => k.archived)
      .sort((a, b) => kanalTitel(a).localeCompare(kanalTitel(b), 'de')),
  };
}

import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { alleBytes, bereinigeBild } from '@/lib/dateien/metadaten';
import { bereinigeVideo } from './videometadaten';
import { VERWEIS_GUELTIGKEIT_SEKUNDEN } from './unterlagen-api';

// -----------------------------------------------------------------------------
// Nachrichten
// -----------------------------------------------------------------------------

const nachrichtEintragSchema = z.object({
  id: z.string().uuid(),
  side: z.enum(['person', 'practice']),
  body: z.string(),
  created_at: z.string(),
  /** Wer geschrieben hat: dieser Zugang, die Person selbst, eine Vertretung, die Praxis. */
  author: z.enum(['you', 'person', 'representative', 'practice']),
  /** Nur bei einer Vertretung: ihr Name (ADR-023 Punkt 14). */
  author_label: z.string().nullable(),
  /** Antwort der Praxis mit Zeitmarke in einem Video (ANN-338). */
  attachment_id: z.string().uuid().nullable().optional(),
  attachment_mark_seconds: z.number().int().nullable().optional(),
});
export type NachrichtEintrag = z.infer<typeof nachrichtEintragSchema>;

export const nachrichtSchema = z.object({
  id: z.string().uuid(),
  topic: z.enum(['exercise', 'complaint', 'organisational', 'other']),
  /** Plan oder Übung, auf die sich die Frage bezieht - als Schnappschuss. */
  reference_label: z.string().nullable(),
  status: z.enum(['open', 'answered', 'closed']),
  /** Antwort fällig bis (ANN-309); nur solange die Praxis am Zug ist. */
  due_on: z.string().nullable(),
  created_at: z.string(),
  last_entry_at: z.string(),
  closed_at: z.string().nullable(),
  closed_by_side: z.enum(['person', 'practice']).nullable(),
  entries: z.array(nachrichtEintragSchema),
  /** Wie viele Anhänge der Vorgang hat (Grenze drei); null für die Begleitung. */
  attachment_count: z.number().int().nullable().optional(),
  /** Die sichtbaren Fotos und Videos, ohne Objektschlüssel. */
  attachments: z.lazy(() => z.array(anhangSchema)).optional(),
});
export type Nachricht = z.infer<typeof nachrichtSchema>;

const anhangSchema = z.object({
  id: z.string().uuid(),
  media_kind: z.enum(['photo', 'video']),
  mime_type: z.string(),
  duration_seconds: z.number().int().nullable(),
  created_at: z.string(),
  /** Der Tag, an dem der Anhang spätestens gelöscht wird (ADR-017 Punkt 65). */
  delete_on: z.string(),
  author: z.enum(['you', 'person', 'representative']),
  author_label: z.string().nullable(),
  /** Am Server geprüft (Punkt 49); sonst „nicht serverseitig geprüft". */
  server_verified: z.boolean(),
  /** Auf Schadsoftware geprüft (Punkt 69); seit ADR-017 Fassung 6 nie. */
  malware_scanned: z.boolean(),
});
export type Anhang = z.infer<typeof anhangSchema>;

const nachrichtenSchema = z.object({
  /** Antwortfrist der Praxis in Werktagen (ANN-309). */
  response_workdays: z.number().int(),
  /** Darf dieser Zugang schreiben? Nicht in der Lesefrist (ANN-313). */
  can_write: z.boolean(),
  /** Im Training Übung und Beschwerden nur mit Einwilligung (ANN-311). */
  health_topics: z.boolean(),
  /** Foto und Video anhängen (ADR-017 Punkt 59, ANN-332). */
  can_attach: z.boolean().optional(),
  /** Stand der Einwilligung zu Anhängen; null für die Begleitung (Punkt 67). */
  attachment_consent: z.enum(['open', 'granted', 'withdrawn', 'refused']).nullable().optional(),
  attachment_limit: z.number().int().optional(),
  attachment_max_seconds: z.number().int().optional(),
  messages: z.array(nachrichtSchema),
});
export type Nachrichten = z.infer<typeof nachrichtenSchema>;

export function nachrichtenSchluessel(zugangId: string) {
  return ['platform-messages', zugangId] as const;
}

/** Die Vorgänge des gewählten Bereichs mit ihren Einträgen, offene zuerst. */
export async function ladeNachrichten(zugangId: string): Promise<Nachrichten> {
  const satz = 'Ihre Nachrichten konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_messages', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error || ergebnis.data === null) throw new Error(satz);
  return antwort(nachrichtenSchema, ergebnis.data, satz);
}

/** Verständliche Sätze für die Abweisungen des Servers, ohne interne Details. */
export function nachrichtenfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('text is required')) return 'Bitte schreiben Sie Ihre Frage.';
  if (m.includes('text too long')) return 'Ihre Nachricht darf höchstens 2000 Zeichen lang sein.';
  if (m.includes('needs consent'))
    return 'Fragen zu Übungen und Beschwerden brauchen Ihre Einwilligung. Bitte wählen Sie ein anderes Thema oder willigen Sie unter „Ich“ ein.';
  if (m.includes('is closed'))
    return 'Diese Nachricht ist erledigt. Bitte schreiben Sie eine neue.';
  if (m.includes('not found'))
    return 'Diese Übung ist nicht mehr in Ihrem Plan. Bitte wählen Sie neu.';
  if (m.includes('not allowed'))
    return 'Ihr Zugang erlaubt das gerade nicht. Bitte wenden Sie sich an die Praxis.';
  return 'Ihre Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut.';
}

/** Eine Frage stellen. Liefert die Kennung des Vorgangs. */
export async function nachrichtStellen(eingabe: {
  zugangId: string;
  thema: Nachricht['topic'];
  text: string;
  planId: string | null;
  positionId: string | null;
}): Promise<string> {
  const ergebnis = (await getSupabase().rpc('start_platform_message', {
    p_access_id: eingabe.zugangId,
    p_topic: eingabe.thema,
    p_body: eingabe.text,
    p_plan_id: eingabe.planId,
    p_item_id: eingabe.positionId,
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error) throw new Error(nachrichtenfehler(ergebnis.error.message));
  return antwort(z.string().uuid(), ergebnis.data, 'Ihre Nachricht konnte nicht gesendet werden.');
}

/** Zu einer offenen oder beantworteten Nachricht nachtragen. */
export async function nachrichtNachtragen(
  zugangId: string,
  nachrichtId: string,
  text: string,
): Promise<void> {
  const { error } = (await getSupabase().rpc('add_platform_message_entry', {
    p_access_id: zugangId,
    p_message_id: nachrichtId,
    p_body: text,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(nachrichtenfehler(error.message));
}

/** Eine Nachricht als erledigt markieren. */
export async function nachrichtErledigen(zugangId: string, nachrichtId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('close_platform_message', {
    p_access_id: zugangId,
    p_message_id: nachrichtId,
  })) as { error: { message?: string } | null };
  if (error) throw new Error('Nicht gespeichert. Bitte die Verbindung prüfen und erneut tippen.');
}

// -----------------------------------------------------------------------------
// Foto und Video an der Rückfrage (ADR-017 Abschnitt L): derselbe Weg wie jede Datei (Punkt 60),
// bereinigen, anmelden, hochladen mit `cacheControl: '0'`, bestätigen, prüfen. Der
// Objektschlüssel verlässt diese Datei nicht.
// -----------------------------------------------------------------------------

/** Was die Person liest, wenn ein Anhang nicht angenommen wird (§13). */
export function anhangfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('no consent'))
    return 'Dafür fehlt Ihre Einwilligung. Bitte willigen Sie zuerst ein.';
  if (m.includes('not offered'))
    return 'Fotos und Videos gibt es im Nachsorge-Abo und im Training.';
  if (m.includes('too many')) return 'An eine Frage passen höchstens drei Fotos oder Videos.';
  if (m.includes('too long')) return 'Ein Video darf höchstens 30 Sekunden lang sein.';
  if (m.includes('too large')) return 'Die Aufnahme ist zu groß. Bitte kürzer aufnehmen.';
  if (m.includes('is closed'))
    return 'Diese Nachricht ist erledigt. Bitte schreiben Sie eine neue.';
  return 'Die Aufnahme konnte nicht gesendet werden. Bitte versuchen Sie es erneut.';
}

/** Was die Person liest, wenn der Server einen Anhang verwirft (Punkt 52). */
export const ANHANG_VERWORFEN =
  'Die Aufnahme wurde bei der Prüfung verworfen. Bitte nehmen Sie sie noch einmal auf.';

async function pruefsummeVon(daten: Blob): Promise<string> {
  const bytes = await alleBytes(daten);
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const vorbereitetSchema = z.object({
  attachment_id: z.string().uuid(),
  bucket_id: z.string(),
  object_key: z.string(),
});

/**
 * Eine Aufnahme an eine Nachricht hängen. Ein Foto kommt aus dem
 * Kameradialog, ein Video aus dem Videodialog - beide nur im Speicher der
 * Seite (Punkte 33, 62).
 */
export async function anhangSenden(eingabe: {
  zugangId: string;
  nachrichtId: string;
  aufnahme: Blob;
  art: 'photo' | 'video';
  /** Sekunden, nur beim Video. */
  dauer: number | null;
}): Promise<void> {
  // Punkte 34 und 64: Angaben verlassen das Gerät nicht.
  let daten: Blob;
  if (eingabe.art === 'photo') {
    daten = await bereinigeBild(eingabe.aufnahme);
    if (daten.type !== 'image/jpeg') throw new Error(anhangfehler(undefined));
  } else {
    const video = await bereinigeVideo(eingabe.aufnahme);
    if (!video.ok) {
      throw new Error(
        video.grund === 'ton'
          ? 'Die Aufnahme enthält Ton. Videos werden nur ohne Ton angenommen.'
          : 'Dieses Videoformat wird nicht angenommen.',
      );
    }
    daten = video.video;
  }
  const summe = await pruefsummeVon(daten);

  const vorbereitung = (await getSupabase().rpc('prepare_message_attachment_upload', {
    p_access_id: eingabe.zugangId,
    p_message_id: eingabe.nachrichtId,
    p_mime_type: daten.type,
    p_byte_size: daten.size,
    p_checksum_sha256: summe,
    p_duration_seconds: eingabe.art === 'video' ? eingabe.dauer : null,
  })) as { data: unknown; error: { message?: string } | null };
  if (vorbereitung.error) throw new Error(anhangfehler(vorbereitung.error.message));
  const vorbereitet = antwort(
    z.array(vorbereitetSchema),
    vorbereitung.data ?? [],
    anhangfehler(undefined),
  )[0];
  if (!vorbereitet) throw new Error(anhangfehler(undefined));

  try {
    const { error: uploadFehler } = await getSupabase()
      .storage.from(vorbereitet.bucket_id)
      .upload(vorbereitet.object_key, daten, {
        contentType: daten.type,
        cacheControl: '0',
        upsert: false,
      });
    if (uploadFehler) throw new Error(anhangfehler(undefined));
    const { error } = (await getSupabase().rpc('confirm_message_attachment_upload', {
      p_access_id: eingabe.zugangId,
      p_attachment_id: vorbereitet.attachment_id,
    })) as { error: { message?: string } | null };
    if (error) throw new Error(anhangfehler(error.message));
  } catch (fehler) {
    try {
      await getSupabase().rpc('discard_message_attachment_upload', {
        p_access_id: eingabe.zugangId,
        p_attachment_id: vorbereitet.attachment_id,
      });
    } catch {
      // Der ursprüngliche Grund ist die Meldung; der Lauf räumt nach 24 Stunden auf.
    }
    throw fehler;
  }

  // Die Prüfung am Server (Punkte 49 bis 52), wo die Function läuft. Fehlt
  // sie, bleibt der Anhang „nicht serverseitig geprüft" (Punkt 51).
  try {
    const { data } = (await getSupabase().functions.invoke<unknown>('patient-file-verify', {
      body: { attachment_id: vorbereitet.attachment_id },
    })) as { data: unknown };
    const pruefung = z.object({ ergebnis: z.string() }).safeParse(data);
    if (pruefung.success && pruefung.data.ergebnis === 'rejected') {
      throw new Error(ANHANG_VERWORFEN);
    }
  } catch (fehler) {
    if (fehler instanceof Error && fehler.message === ANHANG_VERWORFEN) throw fehler;
  }
}

/**
 * Lädt einen Anhang zum Ansehen in den Speicher der Seite (Punkt 54): erst
 * die einmalige Freigabe, dann die Unterschrift, dann `fetch` ohne Cache.
 * Kein Downloadname, nie ein Fenster auf den Verweis.
 */
export async function ladeAnhang(zugangId: string, anhangId: string): Promise<Blob> {
  const satz = 'Die Aufnahme konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('issue_platform_message_attachment_link', {
    p_access_id: zugangId,
    p_attachment_id: anhangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  const freigabe = antwort(
    z.array(z.object({ bucket_id: z.string(), object_key: z.string(), mime_type: z.string() })),
    ergebnis.data ?? [],
    satz,
  )[0];
  if (!freigabe) throw new Error(satz);
  const { data: signiert, error } = await getSupabase()
    .storage.from(freigabe.bucket_id)
    .createSignedUrl(freigabe.object_key, VERWEIS_GUELTIGKEIT_SEKUNDEN);
  if (error || !signiert?.signedUrl) throw new Error(satz);
  const antwortDerAblage = await fetch(signiert.signedUrl, { cache: 'no-store' });
  if (!antwortDerAblage.ok) throw new Error(satz);
  return new Blob([await antwortDerAblage.arrayBuffer()], { type: freigabe.mime_type });
}

/** Einen eigenen Anhang löschen - jederzeit (Punkt 67). */
export async function anhangLoeschen(zugangId: string, anhangId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('delete_platform_message_attachment', {
    p_access_id: zugangId,
    p_attachment_id: anhangId,
  })) as { error: unknown };
  if (error) throw new Error('Die Aufnahme konnte nicht gelöscht werden. Bitte erneut versuchen.');
}

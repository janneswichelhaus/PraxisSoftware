import { alleBytes } from '@/features/files/metadaten';

/**
 * Ein Video verlässt das Gerät ohne Programm- und Zeitangaben (KOM-006,
 * ADR-017 Punkt 64, ANN-336) - und ebenso eine Sprachnachricht im Teamchat
 * (TEAM-004, Punkt 84): derselbe Container aus `MediaRecorder`, nur Ton.
 *
 * `MediaRecorder` schreibt weder Ort noch Gerät, aber den Container füllt der
 * Browser selbst: Chromium trägt sich als Programm in den WebM-Kopf ein
 * (`MuxingApp`, `WritingApp`), Safari schreibt Aufnahmezeiten in den MP4-Kopf
 * (`mvhd`, `tkhd`, `mdhd`) und kann Metadatenkästen (`udta`, `meta`)
 * anhängen. Diese Datei leert sie, **ohne eine Länge oder einen Verweis zu
 * ändern** — kein Neukodieren, kein Umbau:
 *
 *   * **WebM:** Programmangaben werden mit Nullbytes gefüllt (ein
 *     EBML-Text darf mit Nullbytes aufgefüllt sein); Datum, Titel, Namen,
 *     Tags, Anhänge und Kapitel werden zu `Void`-Elementen derselben Länge.
 *   * **MP4:** Die Zeitstempel werden null („unbekannt"), Metadatenkästen
 *     heißen danach `free` — ein Kasten, den jeder Leser überspringt.
 *
 * Und es prüft, was der Server ebenso prüft (`supabase/functions/
 * patient-file-verify/video.ts`): ein Video nur mit Bildspuren, keine Tonspur
 * (Punkt 63); eine Sprachnachricht nur mit Tonspuren (Punkt 84). Ein Test hält
 * beide Seiten deckungsgleich.
 */

// -----------------------------------------------------------------------------
// WebM
// -----------------------------------------------------------------------------

const EBML = {
  header: 0x1a45dfa3,
  segment: 0x18538067,
  seekHead: 0x114d9b74,
  info: 0x1549a966,
  tracks: 0x1654ae6b,
  cluster: 0x1f43b675,
  cues: 0x1c53bb6b,
  tags: 0x1254c367,
  attachments: 0x1941a469,
  chapters: 0x1043a770,
  void: 0xec,
  trackEntry: 0xae,
  trackType: 0x83,
  muxingApp: 0x4d80,
  writingApp: 0x5741,
  dateUtc: 0x4461,
  title: 0x7ba9,
  name: 0x536e,
} as const;

const SEGMENTEBENE = new Set<number>([
  EBML.seekHead,
  EBML.info,
  EBML.tracks,
  EBML.cluster,
  EBML.cues,
  EBML.tags,
  EBML.attachments,
  EBML.chapters,
]);
/** Wird zu `Void` derselben Länge. */
const ZU_VOID = new Set<number>([
  EBML.tags,
  EBML.attachments,
  EBML.chapters,
  EBML.dateUtc,
  EBML.title,
  EBML.name,
]);
/** Pflichtelemente: bleiben, aber leer. */
const ZU_LEEREN = new Set<number>([EBML.muxingApp, EBML.writingApp]);
const BEHAELTER = new Set<number>([EBML.segment, EBML.info, EBML.tracks, EBML.trackEntry]);

/** Zweitreview S2: tiefer verschachtelt ist kein Video aus `MediaRecorder`. */
const MAX_TIEFE = 8;

interface Element {
  id: number;
  start: number;
  daten: number;
  ende: number | null;
}

function element(bytes: Uint8Array, pos: number): Element | null {
  const erstes = bytes[pos];
  if (erstes === undefined || erstes === 0) return null;
  const idLaenge = Math.clz32(erstes) - 23;
  if (idLaenge < 1 || idLaenge > 4 || pos + idLaenge > bytes.length) return null;
  let id = 0;
  for (let i = 0; i < idLaenge; i += 1) id = id * 256 + bytes[pos + i]!;
  const g = pos + idLaenge;
  const kopf = bytes[g];
  if (kopf === undefined || kopf === 0) return null;
  const laenge = Math.clz32(kopf) - 23;
  if (laenge < 1 || laenge > 8 || g + laenge > bytes.length) return null;
  let groesse = kopf & (0xff >> laenge);
  let unbekannt = groesse === 0xff >> laenge;
  for (let i = 1; i < laenge; i += 1) {
    const b = bytes[g + i]!;
    groesse = groesse * 256 + b;
    if (b !== 0xff) unbekannt = false;
  }
  const daten = g + laenge;
  if (unbekannt) return { id, start: pos, daten, ende: null };
  if (daten + groesse > bytes.length) return null;
  return { id, start: pos, daten, ende: daten + groesse };
}

/**
 * Macht aus einem Element ein `Void` derselben Gesamtlänge: Kennung 0xEC und
 * eine Größenangabe so breit, dass Kopf und Daten wieder genau passen.
 */
function zuVoid(bytes: Uint8Array, e: Element): boolean {
  if (e.ende === null) return false;
  const gesamt = e.ende - e.start;
  // Kopf: ein Byte Kennung, dann w Bytes Größe; Daten danach mit Nullen.
  // Höchstens acht Bytes Größe - ein längerer alter Kopf wird Teil der Daten.
  const w = Math.min(8, e.daten - e.start - 1);
  const datenlaenge = gesamt - 1 - w;
  if (w < 1 || w > 8 || datenlaenge < 0 || datenlaenge >= 2 ** (7 * w) - 1) return false;
  bytes[e.start] = EBML.void;
  let rest = datenlaenge;
  for (let i = w; i >= 1; i -= 1) {
    bytes[e.start + i] = rest & 0xff;
    rest = Math.floor(rest / 256);
  }
  bytes[e.start + 1]! |= 0x80 >> (w - 1);
  bytes.fill(0, e.start + 1 + w, e.ende);
  return true;
}

/** Lesbar, und welche Spuren der Container trägt. */
interface Spuren {
  ok: boolean;
  bild: number;
  ton: number;
  /** Untertitel, Steuerung, Metadaten - weder Bild noch Ton. */
  andere: number;
}

function bereinigeWebm(bytes: Uint8Array): Spuren {
  const spuren = { bild: 0, ton: 0, andere: 0 };

  function bereich(von: number, bis: number, tiefe = 0): boolean {
    if (tiefe > MAX_TIEFE) return false;
    let pos = von;
    while (pos < bis) {
      const e = element(bytes, pos);
      if (!e) return false;
      if (e.ende === null) {
        if (e.id === EBML.segment) return bereich(e.daten, bis, tiefe + 1);
        if (e.id !== EBML.cluster) return false;
        let innen = e.daten;
        while (innen < bis) {
          const kind = element(bytes, innen);
          if (!kind) return false;
          // Das nächste Element der Segmentebene beendet den Cluster - auch
          // ein weiterer Cluster unbekannter Länge, wie ihn `MediaRecorder`
          // mit Zeitscheibe schreibt (TEAM-004).
          if (SEGMENTEBENE.has(kind.id)) break;
          if (kind.ende === null) return false;
          innen = kind.ende;
        }
        pos = innen;
        continue;
      }
      if (e.ende > bis) return false;
      if (e.id === EBML.trackType) {
        let typ = 0;
        for (let i = e.daten; i < e.ende; i += 1) typ = typ * 256 + bytes[i]!;
        if (typ === 1) spuren.bild += 1;
        else if (typ === 2) spuren.ton += 1;
        else spuren.andere += 1;
      }
      if (ZU_LEEREN.has(e.id)) bytes.fill(0, e.daten, e.ende);
      if (ZU_VOID.has(e.id)) {
        if (!zuVoid(bytes, e)) return false;
      } else if (BEHAELTER.has(e.id) && !bereich(e.daten, e.ende, tiefe + 1)) {
        return false;
      }
      pos = e.ende;
    }
    return pos === bis;
  }

  const kopf = element(bytes, 0);
  if (!kopf || kopf.id !== EBML.header) return { ok: false, ...spuren };
  return { ok: bereich(0, bytes.length), ...spuren };
}

// -----------------------------------------------------------------------------
// MP4
// -----------------------------------------------------------------------------

const MP4_BEHAELTER = new Set(['moov', 'trak', 'mdia', 'minf', 'moof', 'traf', 'edts', 'mvex']);
const MP4_ZEITEN = new Set(['mvhd', 'tkhd', 'mdhd']);
const MP4_ZU_FREE = new Set(['udta', 'meta', 'uuid', 'ilst', 'XMP_', 'prft']);

function bereinigeMp4(bytes: Uint8Array): Spuren {
  const ansicht = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const spuren = { bild: 0, ton: 0, andere: 0 };
  if (bytes.length < 12 || String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') {
    return { ok: false, ...spuren };
  }

  function bereich(von: number, bis: number, eltern: string, tiefe = 0): boolean {
    if (tiefe > MAX_TIEFE) return false;
    let pos = von;
    while (pos < bis) {
      if (pos + 8 > bis) return false;
      let groesse = ansicht.getUint32(pos);
      const typ = String.fromCharCode(...bytes.slice(pos + 4, pos + 8));
      let inhalt = pos + 8;
      if (groesse === 1) {
        if (pos + 16 > bis) return false;
        groesse = ansicht.getUint32(pos + 8) * 2 ** 32 + ansicht.getUint32(pos + 12);
        inhalt = pos + 16;
      } else if (groesse === 0) {
        groesse = bis - pos;
      }
      const ende = pos + groesse;
      if (!/^[\x20-\x7e]{4}$/.test(typ) || groesse < inhalt - pos || ende > bis) return false;

      if (MP4_ZU_FREE.has(typ)) {
        bytes.set([0x66, 0x72, 0x65, 0x65], pos + 4); // "free"
        bytes.fill(0, inhalt, ende);
      } else {
        if (MP4_ZEITEN.has(typ)) {
          const laenge = bytes[inhalt] === 1 ? 16 : 8;
          if (inhalt + 4 + laenge > ende) return false;
          bytes.fill(0, inhalt + 4, inhalt + 4 + laenge);
        }
        if (typ === 'hdlr' && eltern === 'mdia') {
          const art = String.fromCharCode(...bytes.slice(inhalt + 8, inhalt + 12));
          if (art === 'vide') spuren.bild += 1;
          else if (art === 'soun') spuren.ton += 1;
          else spuren.andere += 1;
        }
        if (MP4_BEHAELTER.has(typ) && !bereich(inhalt, ende, typ, tiefe + 1)) return false;
      }
      pos = ende;
    }
    return pos === bis;
  }

  return { ok: bereich(0, bytes.length, ''), ...spuren };
}

// -----------------------------------------------------------------------------
// Einstieg
// -----------------------------------------------------------------------------

/** Der Typ ohne Codec-Angabe: `video/webm;codecs=vp8` → `video/webm`. */
export function videotyp(mime: string): 'video/webm' | 'video/mp4' | null {
  const basis = mime.split(';')[0]!.trim().toLowerCase();
  return basis === 'video/webm' || basis === 'video/mp4' ? basis : null;
}

export type Videoergebnis = { ok: true; video: Blob } | { ok: false; grund: 'format' | 'ton' };

/**
 * Leert Programm- und Zeitangaben und prüft, dass nur Bild aufgenommen ist.
 * Liefert ein neues Blob mit dem Typ ohne Codec-Angabe - so, wie Server und
 * Bucket ihn erwarten.
 */
export async function bereinigeVideo(aufnahme: Blob): Promise<Videoergebnis> {
  const typ = videotyp(aufnahme.type);
  if (!typ) return { ok: false, grund: 'format' };
  const bytes = await alleBytes(aufnahme);
  const spuren = typ === 'video/webm' ? bereinigeWebm(bytes) : bereinigeMp4(bytes);
  if (!spuren.ok || spuren.bild === 0) return { ok: false, grund: 'format' };
  if (spuren.ton + spuren.andere > 0) return { ok: false, grund: 'ton' };
  return { ok: true, video: new Blob([bytes as BlobPart], { type: typ }) };
}

/** Der Typ ohne Codec-Angabe: `audio/webm;codecs=opus` → `audio/webm`. */
export function tontyp(mime: string): 'audio/webm' | 'audio/mp4' | null {
  const basis = mime.split(';')[0]!.trim().toLowerCase();
  return basis === 'audio/webm' || basis === 'audio/mp4' ? basis : null;
}

export type Tonergebnis = { ok: true; ton: Blob } | { ok: false; grund: 'format' | 'bild' };

/**
 * Eine Sprachnachricht (TEAM-004, ADR-017 Punkt 84): Programm- und Zeitangaben
 * leeren wie beim Video und prüfen, dass nur Ton aufgenommen ist - eine
 * Bildspur oder eine andere Spur heißt nicht senden. Liefert ein neues Blob
 * mit dem Typ ohne Codec-Angabe.
 */
export async function bereinigeTon(aufnahme: Blob): Promise<Tonergebnis> {
  const typ = tontyp(aufnahme.type);
  if (!typ) return { ok: false, grund: 'format' };
  const bytes = await alleBytes(aufnahme);
  const spuren = typ === 'audio/webm' ? bereinigeWebm(bytes) : bereinigeMp4(bytes);
  if (!spuren.ok || spuren.ton === 0) return { ok: false, grund: 'format' };
  if (spuren.bild + spuren.andere > 0) return { ok: false, grund: 'bild' };
  return { ok: true, ton: new Blob([bytes as BlobPart], { type: typ }) };
}

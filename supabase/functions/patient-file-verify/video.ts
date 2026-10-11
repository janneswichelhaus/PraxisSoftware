/**
 * Die Prüfung eines Videos am Inhalt (KOM-006, ADR-017 Punkte 49, 63, 64).
 *
 * Ein Anhang an einer Rückfrage ist ein Video aus `MediaRecorder` — WebM aus
 * Chromium und Firefox, MP4 aus Safari. Drei Fragen an die abgelegten Bytes,
 * ohne Laufzeit und ohne Netz:
 *
 *   1. **Lesbar?** Der Container lässt sich von vorn bis hinten in seine
 *      Elemente bzw. Kästen zerlegen. Was sich nicht zerlegen lässt, ist kein
 *      Video dieses Formats (Punkt 49: Typ an der Signatur — hier an der
 *      ganzen Struktur).
 *   2. **Ohne Ton?** Es gibt nur Bildspuren. Eine Tonspur ist ein Befund
 *      (Punkt 63), auch eine stumme.
 *   3. **Ohne Angaben?** Keine Programm-, Zeit- oder Titelangaben im Kopf,
 *      keine Tags, keine Anhänge, keine Kapitel, kein `udta`, `meta`, `uuid`
 *      (ANN-336). Das Gerät leert sie vor dem Upload
 *      (`src/features/platform/videometadaten.ts`) nach denselben Regeln; ein
 *      Test hält beide deckungsgleich.
 *
 * Die Prüfung **schreibt keine Bytes um** (Punkt 52).
 */

/** Ergebnis der Zerlegung; `lesbar = false` heißt: die anderen beiden gelten nicht. */
export interface Videobefund {
  readonly lesbar: boolean;
  readonly ohneTon: boolean;
  readonly ohneAngaben: boolean;
}

const NICHT_LESBAR: Videobefund = { lesbar: false, ohneTon: false, ohneAngaben: false };

// -----------------------------------------------------------------------------
// WebM (EBML, Matroska)
// -----------------------------------------------------------------------------

/** Kennungen der Elemente, die die Prüfung kennt (mit Markierungsbit). */
export const EBML = {
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
  crc: 0xbf,
  trackEntry: 0xae,
  trackType: 0x83,
  muxingApp: 0x4d80,
  writingApp: 0x5741,
  dateUtc: 0x4461,
  title: 0x7ba9,
  name: 0x536e,
} as const;

/** Elemente der Segmentebene - an ihnen endet ein Cluster unbekannter Länge. */
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

/** Was in einem Video nichts zu suchen hat - weder auf dem Gerät noch am Server. */
export const EBML_VERBOTEN = new Set<number>([
  EBML.tags,
  EBML.attachments,
  EBML.chapters,
  EBML.dateUtc,
  EBML.title,
  EBML.name,
]);

/** Programmangaben, die bleiben müssen (Pflichtelemente), aber leer. */
export const EBML_LEEREN = new Set<number>([EBML.muxingApp, EBML.writingApp]);

export interface Ebmlelement {
  readonly id: number;
  readonly start: number;
  /** Beginn der Daten. */
  readonly daten: number;
  /** Ende der Daten; bei unbekannter Länge `null`. */
  readonly ende: number | null;
}

/** Liest ein Element ab `pos`; `null`, wenn dort keines beginnt. */
export function leseElement(bytes: Uint8Array, pos: number): Ebmlelement | null {
  const erstes = bytes[pos];
  if (erstes === undefined || erstes === 0) return null;
  const idLaenge = Math.clz32(erstes) - 23;
  if (idLaenge < 1 || idLaenge > 4 || pos + idLaenge > bytes.length) return null;
  let id = 0;
  for (let i = 0; i < idLaenge; i += 1) id = id * 256 + bytes[pos + i]!;

  const groessePos = pos + idLaenge;
  const kopf = bytes[groessePos];
  if (kopf === undefined || kopf === 0) return null;
  const groesseLaenge = Math.clz32(kopf) - 23;
  if (groesseLaenge < 1 || groesseLaenge > 8 || groessePos + groesseLaenge > bytes.length) {
    return null;
  }
  let groesse = kopf & (0xff >> groesseLaenge);
  let alleEinsen = groesse === 0xff >> groesseLaenge;
  for (let i = 1; i < groesseLaenge; i += 1) {
    const b = bytes[groessePos + i]!;
    groesse = groesse * 256 + b;
    if (b !== 0xff) alleEinsen = false;
  }
  const daten = groessePos + groesseLaenge;
  if (alleEinsen) return { id, start: pos, daten, ende: null };
  const ende = daten + groesse;
  if (ende > bytes.length) return null;
  return { id, start: pos, daten, ende };
}

/**
 * Geht alle Elemente durch und ruft `besuche` für jedes. Kinder werden nur
 * für die Behälter gelesen, deren Inhalt die Prüfung braucht; ein Cluster
 * bleibt ein Block (Bilddaten).
 */
export function durchlaufeWebm(
  bytes: Uint8Array,
  besuche: (element: Ebmlelement, eltern: number) => void,
): boolean {
  const BEHAELTER = new Set<number>([EBML.segment, EBML.info, EBML.tracks, EBML.trackEntry]);

  function bereich(von: number, bis: number, eltern: number): number | null {
    let pos = von;
    while (pos < bis) {
      const e = leseElement(bytes, pos);
      if (!e) return null;
      // Unbekannte Länge gibt es in MediaRecorder-Ausgaben nur für Segment
      // und Cluster.
      if (e.ende === null) {
        if (e.id === EBML.segment) {
          besuche(e, eltern);
          return bereich(e.daten, bis, e.id) === null ? null : bis;
        }
        if (e.id !== EBML.cluster) return null;
        besuche(e, eltern);
        // Kinder bis zum nächsten Element der Segmentebene überspringen.
        let innen = e.daten;
        while (innen < bis) {
          const kind = leseElement(bytes, innen);
          if (!kind || kind.ende === null) return null;
          if (SEGMENTEBENE.has(kind.id)) break;
          innen = kind.ende;
        }
        pos = innen;
        continue;
      }
      if (e.ende > bis) return null;
      besuche(e, eltern);
      if (BEHAELTER.has(e.id) && bereich(e.daten, e.ende, e.id) === null) return null;
      pos = e.ende;
    }
    return pos === bis ? pos : null;
  }

  const kopf = leseElement(bytes, 0);
  if (!kopf || kopf.id !== EBML.header) return false;
  return bereich(0, bytes.length, 0) !== null;
}

function webmBefund(bytes: Uint8Array): Videobefund {
  let ohneTon = true;
  let ohneAngaben = true;
  let bildspuren = 0;
  let segment = false;
  const lesbar = durchlaufeWebm(bytes, (e) => {
    if (e.id === EBML.segment) segment = true;
    if (EBML_VERBOTEN.has(e.id)) ohneAngaben = false;
    if (EBML_LEEREN.has(e.id) && e.ende !== null) {
      for (let i = e.daten; i < e.ende; i += 1) if (bytes[i] !== 0) ohneAngaben = false;
    }
    if (e.id === EBML.trackType && e.ende !== null) {
      let typ = 0;
      for (let i = e.daten; i < e.ende; i += 1) typ = typ * 256 + bytes[i]!;
      if (typ === 1) bildspuren += 1;
      else ohneTon = false;
    }
  });
  if (!lesbar || !segment || bildspuren === 0) return NICHT_LESBAR;
  return { lesbar, ohneTon, ohneAngaben };
}

// -----------------------------------------------------------------------------
// MP4 (ISO BMFF)
// -----------------------------------------------------------------------------

export interface Mp4kasten {
  readonly typ: string;
  readonly start: number;
  /** Beginn des Inhalts nach Größe und Typ. */
  readonly inhalt: number;
  readonly ende: number;
}

const MP4_BEHAELTER = new Set(['moov', 'trak', 'mdia', 'minf', 'moof', 'traf', 'edts', 'mvex']);
/** Kästen mit Zeitstempeln der Aufnahme, die null sein müssen. */
export const MP4_ZEITEN = new Set(['mvhd', 'tkhd', 'mdhd']);
/** Kästen für Metadaten - auf dem Gerät zu `free` umbenannt, am Server ein Befund. */
export const MP4_VERBOTEN = new Set(['udta', 'meta', 'uuid', 'ilst', 'XMP_']);

export function durchlaufeMp4(
  bytes: Uint8Array,
  besuche: (kasten: Mp4kasten, eltern: string) => void,
): boolean {
  const ansicht = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  function bereich(von: number, bis: number, eltern: string): boolean {
    let pos = von;
    while (pos < bis) {
      if (pos + 8 > bis) return false;
      let groesse = ansicht.getUint32(pos);
      const typ = String.fromCharCode(
        bytes[pos + 4]!,
        bytes[pos + 5]!,
        bytes[pos + 6]!,
        bytes[pos + 7]!,
      );
      let inhalt = pos + 8;
      if (groesse === 1) {
        if (pos + 16 > bis) return false;
        const hoch = ansicht.getUint32(pos + 8);
        const tief = ansicht.getUint32(pos + 12);
        groesse = hoch * 2 ** 32 + tief;
        inhalt = pos + 16;
      } else if (groesse === 0) {
        groesse = bis - pos;
      }
      const ende = pos + groesse;
      if (!/^[\x20-\x7e]{4}$/.test(typ) || groesse < inhalt - pos || ende > bis) return false;
      const kasten = { typ, start: pos, inhalt, ende };
      besuche(kasten, eltern);
      if (MP4_BEHAELTER.has(typ) && !bereich(inhalt, ende, typ)) return false;
      pos = ende;
    }
    return pos === bis;
  }

  return bereich(0, bytes.length, '');
}

/** Wo in einem Kasten mit Zeitstempeln die Zeiten liegen: Beginn und Länge. */
export function mp4Zeiten(bytes: Uint8Array, kasten: Mp4kasten): [number, number] | null {
  const version = bytes[kasten.inhalt];
  if (version === undefined) return null;
  // Version 0: zwei Zeiten zu je 4 Bytes, Version 1: zu je 8 Bytes - nach
  // Version und Flags.
  const laenge = version === 1 ? 16 : 8;
  const beginn = kasten.inhalt + 4;
  if (beginn + laenge > kasten.ende) return null;
  return [beginn, laenge];
}

function mp4Befund(bytes: Uint8Array): Videobefund {
  if (bytes.length < 12 || String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') {
    return NICHT_LESBAR;
  }
  let ohneTon = true;
  let ohneAngaben = true;
  let bildspuren = 0;
  let moov = false;
  const lesbar = durchlaufeMp4(bytes, (k, eltern) => {
    if (k.typ === 'moov') moov = true;
    if (MP4_VERBOTEN.has(k.typ)) ohneAngaben = false;
    if (MP4_ZEITEN.has(k.typ)) {
      const zeiten = mp4Zeiten(bytes, k);
      if (!zeiten) ohneAngaben = false;
      else
        for (let i = zeiten[0]; i < zeiten[0] + zeiten[1]; i += 1)
          if (bytes[i] !== 0) ohneAngaben = false;
    }
    if (k.typ === 'hdlr' && eltern === 'mdia') {
      // Version/Flags (4), pre_defined (4), handler_type (4).
      const art = String.fromCharCode(...bytes.slice(k.inhalt + 8, k.inhalt + 12));
      if (art === 'vide') bildspuren += 1;
      else ohneTon = false;
    }
  });
  if (!lesbar || !moov || bildspuren === 0) return NICHT_LESBAR;
  return { lesbar, ohneTon, ohneAngaben };
}

// -----------------------------------------------------------------------------
// Einstieg
// -----------------------------------------------------------------------------

export function pruefeVideo(bytes: Uint8Array, mimeTyp: string): Videobefund {
  if (mimeTyp === 'video/webm') return webmBefund(bytes);
  if (mimeTyp === 'video/mp4') return mp4Befund(bytes);
  return NICHT_LESBAR;
}

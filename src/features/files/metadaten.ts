/**
 * Aufnahmemetadaten entfernen, bevor ein Bild das Gerät verlässt (DOK-006,
 * ADR-017 Punkt 34).
 *
 * Ein Foto vom Handy trägt mehr als das Bild: Ort (GPS), Gerätemodell,
 * Aufnahmezeit, ein eingebettetes Vorschaubild. Ort und Uhrzeit eines
 * Hausbesuchsfotos sind zugleich die Adresse der Patient:in und ein
 * Bewegungsprofil der Therapeut:in (§20); das Vorschaubild kann zeigen, was im
 * Bild selbst weggeschnitten wurde. Nichts davon gehört in die Akte.
 *
 * **Verlustfrei.** Die Bilddaten bleiben Byte für Byte: Entfernt werden nur
 * Segmente (JPEG) und Chunks (PNG), die neben dem Bild stehen. Ein Arztbrief
 * oder ein Röntgenbild wird dadurch nicht neu kodiert und nicht schlechter.
 *
 * **Was bleibt** (ANN-125): als einzige Angabe über die Aufnahme die
 * Ausrichtung — sonst stünde ein Hochkantfoto quer in der Akte. Dazu, was der
 * Dekoder zum Lesen der Bilddaten braucht und nichts über die Aufnahme sagt:
 * das Adobe-Segment eines JPEG (Farbumrechnung) und die Farbangaben eines PNG
 * (`gAMA`, `cHRM`, `sRGB`, `sBIT`, `tRNS`). **Was geht:** EXIF samt GPS und
 * Vorschaubild, XMP, IPTC, Kommentare, Farbprofile (sie tragen Hersteller und
 * Gerät im Kopf), Textchunks, Zeitstempel — und alles, was hinter dem Ende des
 * Bildes angehängt ist (weitere Bilder eines Mehrbildformats mit eigenen
 * Metadaten).
 *
 * **Im Zweifel nicht hochladen.** Ist die Datei nicht so gebaut, wie ihr Format
 * es verlangt, wirft die Bereinigung — ein Bild, dessen Metadaten sich nicht
 * sicher entfernen lassen, geht nicht ungeprüft durch.
 *
 * Nachgewiesen wird das durch Tests (`metadaten.test.ts`), nicht durch diesen
 * Text: ADR-017 Punkt 34 verlangt es so.
 */

const BESCHAEDIGT = 'Das Bild ist beschädigt und kann nicht angenommen werden.';

// -----------------------------------------------------------------------------
// Ausrichtung (EXIF-Tag 0x0112), aus einer TIFF-Struktur
// -----------------------------------------------------------------------------

/**
 * Liest die Ausrichtung aus einer TIFF-Struktur, wie sie im EXIF-Segment eines
 * JPEG und im `eXIf`-Chunk eines PNG steht. 1 heißt: aufrecht oder unbekannt.
 *
 * Jede Unstimmigkeit liefert 1 statt eines Fehlers: Eine unlesbare Ausrichtung
 * macht das Bild schief, aber nicht gefährlich.
 */
function tiffAusrichtung(bytes: Uint8Array, start: number, ende: number): number {
  if (ende - start < 8) return 1;
  const ordnung = String.fromCharCode(bytes[start]!, bytes[start + 1]!);
  const klein = ordnung === 'II';
  if (!klein && ordnung !== 'MM') return 1;

  const u16 = (at: number) =>
    klein ? bytes[at]! | (bytes[at + 1]! << 8) : (bytes[at]! << 8) | bytes[at + 1]!;
  const u32 = (at: number) =>
    klein
      ? (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0
      : ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>>
        0;

  if (u16(start + 2) !== 42) return 1;
  const ifd = start + u32(start + 4);
  if (ifd + 2 > ende) return 1;

  const anzahl = u16(ifd);
  for (let i = 0; i < anzahl; i += 1) {
    const eintrag = ifd + 2 + i * 12;
    if (eintrag + 12 > ende) return 1;
    // Tag 0x0112, Typ SHORT (3), genau ein Wert.
    if (u16(eintrag) === 0x0112 && u16(eintrag + 2) === 3 && u32(eintrag + 4) === 1) {
      const wert = u16(eintrag + 8);
      return wert >= 1 && wert <= 8 ? wert : 1;
    }
  }
  return 1;
}

/**
 * Die kleinste TIFF-Struktur, die nur die Ausrichtung trägt: Kopf, ein
 * Verzeichnis mit einem Eintrag, kein Folgeverzeichnis (26 Bytes).
 */
function tiffNurAusrichtung(ausrichtung: number): Uint8Array {
  return Uint8Array.from([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08, // "MM", 42, Verzeichnis ab 8
    0x00,
    0x01, // ein Eintrag
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01, // Tag 0x0112, SHORT, 1 Wert
    0x00,
    ausrichtung,
    0x00,
    0x00, // der Wert, aufgefüllt
    0x00,
    0x00,
    0x00,
    0x00, // kein weiteres Verzeichnis
  ]);
}

function verbinde(teile: readonly Uint8Array[]): Uint8Array {
  const laenge = teile.reduce((summe, teil) => summe + teil.length, 0);
  const ergebnis = new Uint8Array(laenge);
  let pos = 0;
  for (const teil of teile) {
    ergebnis.set(teil, pos);
    pos += teil.length;
  }
  return ergebnis;
}

function beginntMit(bytes: Uint8Array, at: number, text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[at + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

// -----------------------------------------------------------------------------
// JPEG
// -----------------------------------------------------------------------------

/** Ein Segment eines JPEG — für die Bereinigung und für die Tests. */
export interface JpegSegment {
  marker: number;
  /** Beginn des Segments einschließlich `0xFF` und Marker. */
  start: number;
  /** Erstes Byte hinter dem Segment (bei SOS: hinter den Bilddaten des Scans). */
  ende: number;
}

function istAlleinstehend(marker: number): boolean {
  // RST0-7 und TEM tragen keine Länge.
  return (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01;
}

/**
 * Zerlegt ein JPEG in seine Segmente bis zum Bildende (EOI).
 *
 * Nach einem Scankopf (SOS) folgen die kodierten Bilddaten; darin ist `0xFF`
 * immer von `0x00` oder einem Rücksetzmarker gefolgt. Der erste andere Marker
 * beendet den Scan. Was hinter EOI steht, gehört nicht mehr zum Bild und wird
 * nicht geliefert.
 */
export function jpegSegmente(bytes: Uint8Array): JpegSegment[] {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(BESCHAEDIGT);

  const segmente: JpegSegment[] = [{ marker: 0xd8, start: 0, ende: 2 }];
  let i = 2;

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error(BESCHAEDIGT);
    // Füllbytes vor einem Marker sind erlaubt.
    while (i + 1 < bytes.length && bytes[i + 1] === 0xff) i += 1;
    if (i + 1 >= bytes.length) throw new Error(BESCHAEDIGT);

    const marker = bytes[i + 1]!;
    if (marker === 0xd9) {
      segmente.push({ marker, start: i, ende: i + 2 });
      break;
    }
    if (istAlleinstehend(marker)) {
      segmente.push({ marker, start: i, ende: i + 2 });
      i += 2;
      continue;
    }

    if (i + 4 > bytes.length) throw new Error(BESCHAEDIGT);
    const laenge = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    let ende = i + 2 + laenge;
    if (laenge < 2 || ende > bytes.length) throw new Error(BESCHAEDIGT);

    if (marker === 0xda) {
      // Die kodierten Bilddaten des Scans gehören zum Segment.
      while (ende < bytes.length) {
        if (bytes[ende] !== 0xff) {
          ende += 1;
          continue;
        }
        const folge = bytes[ende + 1];
        if (folge === 0x00 || (folge !== undefined && folge >= 0xd0 && folge <= 0xd7)) {
          ende += 2;
          continue;
        }
        break;
      }
    }

    segmente.push({ marker, start: i, ende });
    i = ende;
  }

  // Ohne EOI ist bis zum Ende der Datei gelesen. Ein Bild ohne Scan ist keins.
  if (!segmente.some((s) => s.marker === 0xda)) throw new Error(BESCHAEDIGT);
  return segmente;
}

function bereinigeJpeg(bytes: Uint8Array): Uint8Array {
  const segmente = jpegSegmente(bytes);
  let ausrichtung = 1;
  const behalten: Uint8Array[] = [];

  for (const segment of segmente) {
    const { marker, start, ende } = segment;
    const inhalt = start + 4;

    if (marker === 0xe1 && ausrichtung === 1 && beginntMit(bytes, inhalt, 'Exif\0\0')) {
      ausrichtung = tiffAusrichtung(bytes, inhalt + 6, ende);
      continue;
    }
    // APP14 „Adobe" sagt dem Dekoder, wie die Farben umzurechnen sind - ohne
    // es stimmen die Farben mancher Scans nicht. Nichts darin betrifft die
    // Aufnahme.
    if (marker === 0xee && beginntMit(bytes, inhalt, 'Adobe')) {
      behalten.push(bytes.subarray(start, ende));
      continue;
    }
    // Alle übrigen APPn (JFIF, EXIF, XMP, ICC, IPTC, Herstellersegmente) und
    // Kommentare.
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) continue;

    behalten.push(bytes.subarray(start, ende));
  }

  const [soi, ...rest] = behalten;
  if (ausrichtung === 1) return verbinde([soi!, ...rest]);

  // Das neue EXIF-Segment steht direkt hinter SOI, wie es der Standard will.
  const tiff = tiffNurAusrichtung(ausrichtung);
  const laenge = 2 + 6 + tiff.length;
  const app1 = verbinde([
    Uint8Array.from([0xff, 0xe1, laenge >> 8, laenge & 0xff]),
    Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]), // "Exif\0\0"
    tiff,
  ]);
  return verbinde([soi!, app1, ...rest]);
}

// -----------------------------------------------------------------------------
// PNG
// -----------------------------------------------------------------------------

const PNG_SIGNATUR = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Hilfschunks, die bleiben: Transparenz, Farbangaben und die Bilder einer
 * Animation. Kritische Chunks (Großbuchstabe vorn) bleiben immer - ohne sie
 * ist das Bild nicht lesbar.
 */
const PNG_BEHALTEN = new Set(['tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'acTL', 'fcTL', 'fdAT']);

/** Ein Chunk eines PNG — für die Bereinigung und für die Tests. */
export interface PngChunk {
  typ: string;
  start: number;
  ende: number;
}

export function pngChunks(bytes: Uint8Array): PngChunk[] {
  if (bytes.length < 8 || PNG_SIGNATUR.some((b, i) => bytes[i] !== b)) {
    throw new Error(BESCHAEDIGT);
  }
  const chunks: PngChunk[] = [];
  let i = 8;
  while (i < bytes.length) {
    if (i + 12 > bytes.length) throw new Error(BESCHAEDIGT);
    const laenge =
      ((bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
    const typ = String.fromCharCode(bytes[i + 4]!, bytes[i + 5]!, bytes[i + 6]!, bytes[i + 7]!);
    const ende = i + 12 + laenge;
    if (!/^[A-Za-z]{4}$/.test(typ) || ende > bytes.length) throw new Error(BESCHAEDIGT);
    chunks.push({ typ, start: i, ende });
    i = ende;
    if (typ === 'IEND') break;
  }
  if (chunks[0]?.typ !== 'IHDR' || chunks.at(-1)?.typ !== 'IEND') throw new Error(BESCHAEDIGT);
  return chunks;
}

let crcTabelle: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTabelle) {
    crcTabelle = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTabelle[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTabelle[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32be(wert: number): Uint8Array {
  return Uint8Array.from([
    (wert >>> 24) & 0xff,
    (wert >>> 16) & 0xff,
    (wert >>> 8) & 0xff,
    wert & 0xff,
  ]);
}

function bereinigePng(bytes: Uint8Array): Uint8Array {
  const chunks = pngChunks(bytes);
  let ausrichtung = 1;
  const behalten: Uint8Array[] = [];

  for (const { typ, start, ende } of chunks) {
    if (typ === 'eXIf') {
      if (ausrichtung === 1) ausrichtung = tiffAusrichtung(bytes, start + 8, ende - 4);
      continue;
    }
    const kritisch = typ[0] === typ[0]!.toUpperCase();
    if (kritisch || PNG_BEHALTEN.has(typ)) behalten.push(bytes.subarray(start, ende));
  }

  const signatur = bytes.subarray(0, 8);
  const [ihdr, ...rest] = behalten;
  if (ausrichtung === 1) return verbinde([signatur, ihdr!, ...rest]);

  // `eXIf` muss vor den Bilddaten stehen; direkt hinter IHDR ist das sicher.
  const tiff = tiffNurAusrichtung(ausrichtung);
  const typUndDaten = verbinde([Uint8Array.from([0x65, 0x58, 0x49, 0x66]), tiff]); // "eXIf"
  const exif = verbinde([u32be(tiff.length), typUndDaten, u32be(crc32(typUndDaten))]);
  return verbinde([signatur, ihdr!, exif, ...rest]);
}

// -----------------------------------------------------------------------------
// Einstieg
// -----------------------------------------------------------------------------

/** Die Bildformate, deren Metadaten entfernt werden. PDF bleibt, wie es ist. */
export function istBereinigbar(mimeTyp: string): mimeTyp is 'image/jpeg' | 'image/png' {
  return mimeTyp === 'image/jpeg' || mimeTyp === 'image/png';
}

/** Die Bytes ohne Aufnahmemetadaten. Wirft, wenn das Bild nicht lesbar ist. */
export function entferneMetadaten(
  bytes: Uint8Array,
  mimeTyp: 'image/jpeg' | 'image/png',
): Uint8Array {
  return mimeTyp === 'image/jpeg' ? bereinigeJpeg(bytes) : bereinigePng(bytes);
}

/**
 * Alle Bytes einer Datei.
 *
 * Über `FileReader` und nicht über `Blob.arrayBuffer()`: Beides gibt es im
 * Browser, aber nur der Reader auch in der Testumgebung (jsdom).
 */
export function alleBytes(datei: Blob): Promise<Uint8Array> {
  return new Promise((fertig, fehlgeschlagen) => {
    const leser = new FileReader();
    leser.onload = () => fertig(new Uint8Array(leser.result as ArrayBuffer));
    leser.onerror = () =>
      fehlgeschlagen(leser.error ?? new Error('Die Datei konnte nicht gelesen werden.'));
    leser.readAsArrayBuffer(datei);
  });
}

/**
 * Dieselbe Datei ohne Aufnahmemetadaten — für jedes Bild auf dem Weg in die
 * Ablage, aus dem Dateiwähler wie aus dem Kameradialog. Andere Formate kommen
 * unverändert zurück.
 */
export async function bereinigeBild(datei: Blob): Promise<Blob> {
  if (!istBereinigbar(datei.type)) return datei;
  const bereinigt = entferneMetadaten(await alleBytes(datei), datei.type);
  return new Blob([bereinigt as BlobPart], { type: datei.type });
}

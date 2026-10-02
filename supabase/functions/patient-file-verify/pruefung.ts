/**
 * Die Prüfung am Inhalt (ABN-025, ADR-017 Fassung 3, Punkt 49).
 *
 * Drei Fragen an die abgelegten Bytes, ohne Laufzeit und ohne Netz — deshalb
 * vollständig in Vitest prüfbar:
 *
 *   1. **Typ an der Signatur.** Passen die ersten Bytes zum angekündigten
 *      Format, und ist das Format in der Allowlist (Punkt 18)? Der MIME-Typ
 *      aus Browser und Speicher ist keine zweite Quelle (ANN-053).
 *   2. **SHA-256** über genau die abgelegten Bytes, gegen die angekündigte
 *      Prüfsumme. Erst damit ist sie ein Nachweis des Servers (Punkt 9).
 *   3. **Metadatenfreiheit** bei JPEG und PNG nach **derselben
 *      Erlaubnisliste**, nach der das Gerät bereinigt
 *      (`src/features/files/metadaten.ts`, ANN-125): Bilddaten, die
 *      Dekodierangaben (Adobe-Segment, Farbchunks) und höchstens die
 *      Ausrichtung in genau der Form, die das Gerät schreibt. Alles andere —
 *      EXIF mit mehr als der Ausrichtung, XMP, ICC, Kommentare, Textchunks,
 *      Bytes hinter dem Bildende — ist ein Befund. Bei PDF entfällt die
 *      Frage (`null`).
 *
 * Die Prüfung **schreibt keine Bytes um** (Punkt 52): Sie urteilt, sie
 * repariert nicht. Ein `vitest`-Test hält sie mit der Bereinigung des Geräts
 * deckungsgleich: Was das Gerät bereinigt hat, besteht; was es durchließe,
 * fiele hier auf.
 */

import type { Ankuendigung, Pruefergebnis } from './typen.ts';

const SIGNATUREN: Record<string, readonly number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

/** Typ an der Signatur: in der Allowlist und gleich der Ankündigung. */
export function typPasst(bytes: Uint8Array, mimeTyp: string): boolean {
  const kennung = SIGNATUREN[mimeTyp];
  if (!kennung || bytes.length < kennung.length) return false;
  return kennung.every((byte, i) => bytes[i] === byte);
}

/** SHA-256 als Hexstring in Kleinbuchstaben, wie `checksum_sha256`. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// -----------------------------------------------------------------------------
// Die Ausrichtung in der einzigen Form, die das Gerät schreibt
// -----------------------------------------------------------------------------

/**
 * Die TIFF-Struktur, die `tiffNurAusrichtung` im Gerät erzeugt: Kopf „MM",
 * ein Verzeichnis mit genau dem Eintrag 0x0112, kein Folgeverzeichnis.
 */
function istNurAusrichtung(bytes: Uint8Array, start: number, ende: number): boolean {
  if (ende - start !== 26) return false;
  const erwartet = [
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00,
    0x00, 0x01, 0x00,
  ];
  for (let i = 0; i < erwartet.length; i += 1) {
    if (bytes[start + i] !== erwartet[i]) return false;
  }
  const wert = bytes[start + 19]!;
  if (wert < 2 || wert > 8) return false;
  for (let i = 20; i < 26; i += 1) {
    if (bytes[start + i] !== 0) return false;
  }
  return true;
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

/** Bilddaten und Tabellen: SOI, EOI, SOFn, DHT, DAC, DQT, DRI, SOS, DNL, RSTn. */
function istBildsegment(marker: number): boolean {
  return (
    marker === 0xd8 ||
    marker === 0xd9 ||
    (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc8) ||
    marker === 0xda ||
    marker === 0xdb ||
    marker === 0xdc ||
    marker === 0xdd ||
    (marker >= 0xd0 && marker <= 0xd7)
  );
}

function jpegMetadatenfrei(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let i = 2;
  let scan = false;
  let ausrichtungen = 0;

  while (i < bytes.length) {
    if (bytes[i] !== 0xff || i + 1 >= bytes.length) return false;
    const marker = bytes[i + 1]!;
    if (marker === 0xd9) {
      // Nichts hinter dem Bildende: Dort stuenden weitere Bilder mit eigenen
      // Metadaten (Mehrbildformate).
      return scan && i + 2 === bytes.length;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (i + 4 > bytes.length) return false;
    const laenge = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    let ende = i + 2 + laenge;
    if (laenge < 2 || ende > bytes.length) return false;
    const inhalt = i + 4;

    if (marker === 0xe1) {
      // Erlaubt ist genau ein EXIF-Segment, das nur die Ausrichtung traegt.
      if (!beginntMit(bytes, inhalt, 'Exif\0\0')) return false;
      if (!istNurAusrichtung(bytes, inhalt + 6, ende)) return false;
      ausrichtungen += 1;
      if (ausrichtungen > 1) return false;
    } else if (marker === 0xee) {
      if (!beginntMit(bytes, inhalt, 'Adobe')) return false;
    } else if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      return false;
    } else if (!istBildsegment(marker)) {
      return false;
    }

    if (marker === 0xda) {
      scan = true;
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
    i = ende;
  }
  // Ohne Bildende ist das Bild nicht vollstaendig.
  return false;
}

// -----------------------------------------------------------------------------
// PNG
// -----------------------------------------------------------------------------

const PNG_KRITISCH = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);
const PNG_BEHALTEN = new Set(['tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'acTL', 'fcTL', 'fdAT']);

function pngMetadatenfrei(bytes: Uint8Array): boolean {
  if (!typPasst(bytes, 'image/png')) return false;
  let i = 8;
  let erster = true;
  let ausrichtungen = 0;
  while (i < bytes.length) {
    if (i + 12 > bytes.length) return false;
    const laenge =
      ((bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
    const typ = String.fromCharCode(bytes[i + 4]!, bytes[i + 5]!, bytes[i + 6]!, bytes[i + 7]!);
    const ende = i + 12 + laenge;
    if (!/^[A-Za-z]{4}$/.test(typ) || ende > bytes.length) return false;
    if (erster && typ !== 'IHDR') return false;
    erster = false;

    if (typ === 'eXIf') {
      if (!istNurAusrichtung(bytes, i + 8, ende - 4)) return false;
      ausrichtungen += 1;
      if (ausrichtungen > 1) return false;
    } else if (!PNG_KRITISCH.has(typ) && !PNG_BEHALTEN.has(typ)) {
      return false;
    }
    i = ende;
    if (typ === 'IEND') return i === bytes.length;
  }
  return false;
}

/** Metadatenfreiheit nach der Erlaubnisliste des Geräts; `null` bei PDF. */
export function metadatenfrei(bytes: Uint8Array, mimeTyp: string): boolean | null {
  if (mimeTyp === 'image/jpeg') return jpegMetadatenfrei(bytes);
  if (mimeTyp === 'image/png') return pngMetadatenfrei(bytes);
  return null;
}

/** Alle drei Prüfungen gegen die Ankündigung aus Phase (a). */
export async function pruefeInhalt(
  bytes: Uint8Array,
  ankuendigung: Pick<Ankuendigung, 'mime_type' | 'byte_size' | 'checksum_sha256'>,
): Promise<Pruefergebnis> {
  const typ = typPasst(bytes, ankuendigung.mime_type);
  return {
    content_type_ok: typ,
    checksum_ok:
      bytes.length === ankuendigung.byte_size &&
      (await sha256(bytes)) === ankuendigung.checksum_sha256,
    // Ein Bild, dessen Typ schon nicht stimmt, ist kein lesbares Bild: Die
    // Metadatenfrage beantwortet dann der Typ.
    metadata_ok: typ
      ? metadatenfrei(bytes, ankuendigung.mime_type)
      : ankuendigung.mime_type === 'application/pdf'
        ? null
        : false,
  };
}

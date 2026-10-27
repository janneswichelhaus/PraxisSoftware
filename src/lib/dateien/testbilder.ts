import { pngChunks } from './metadaten';

/**
 * Synthetische Bilder für die Tests der Metadatenentfernung (DOK-006, ADR-017
 * Punkt 34).
 *
 * Steht in einer eigenen Datei, weil zwei Testdateien sie brauchen — die der
 * Bereinigung selbst und die des Upload-Wegs. Eine `.test.`-Datei als
 * gemeinsame Quelle käme nicht in Frage: Ihr Import führte ihre Testfälle ein
 * zweites Mal aus.
 *
 * **Alles synthetisch** (§3.1): 2 × 2 Pixel aus dem Canvas von Chromium,
 * darum herum von Hand gebaute Metadaten mit erkennbaren Kennwörtern — kein
 * Foto, kein Ort, keine Person. Die Kennwörter sind so gewählt, dass ein Test
 * sie in den hochgeladenen Bytes suchen kann.
 */

/** 2 × 2 Pixel, von Chromium über `canvas.toDataURL('image/jpeg')` kodiert. */
export const CHROMIUM_JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAaEAADAQEBAQAAAAAAAAAAAAABAgMEABEh/8QAFQEBAQAAAAAAAAAAAAAAAAAABAj/xAAZEQABBQAAAAAAAAAAAAAAAAAAAQIDM3H/2gAMAwEAAhEDEQA/AKNeu+/VbVqtTTps7UrarFno5PpZifpJJJJPOc4ROMtjtU//2Q==';

/** Dieselben 2 × 2 Pixel als PNG. */
export const CHROMIUM_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4AWL6DwTGq8r/M5msrmAAAQAAAAD//zej+8sAAAAGSURBVAMAYMkHqx1/3QUAAAAASUVORK5CYII=';

export function basis(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (zeichen) => zeichen.charCodeAt(0));
}

/** Text als Bytes, ein Zeichen je Byte. */
export function text(s: string): Uint8Array {
  return Uint8Array.from(s, (zeichen) => zeichen.charCodeAt(0) & 0xff);
}

export function verbinde(...teile: Uint8Array[]): Uint8Array {
  const ergebnis = new Uint8Array(teile.reduce((summe, teil) => summe + teil.length, 0));
  let pos = 0;
  for (const teil of teile) {
    ergebnis.set(teil, pos);
    pos += teil.length;
  }
  return ergebnis;
}

export function enthaelt(bytes: Uint8Array, kennwort: string): boolean {
  const gesucht = text(kennwort);
  outer: for (let i = 0; i + gesucht.length <= bytes.length; i += 1) {
    for (let k = 0; k < gesucht.length; k += 1) {
      if (bytes[i + k] !== gesucht[k]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Eine TIFF-Struktur wie aus einer Handykamera: Hersteller, Ausrichtung,
 * GPS-Verzeichnis und ein Vorschaubild im zweiten Verzeichnis. Little Endian,
 * wie die meisten Handys schreiben.
 */
export function tiffMitOrtUndVorschau(ausrichtung: number, vorschau: Uint8Array): Uint8Array {
  const makeOffset = 200;
  const gpsOffset = 260;
  const gpsTextOffset = 300;
  const ifd1Offset = 330;
  const vorschauOffset = 400;
  const bytes = new Uint8Array(vorschauOffset + vorschau.length);
  const sicht = new DataView(bytes.buffer);
  let pos = 0;
  const u16 = (wert: number) => {
    sicht.setUint16(pos, wert, true);
    pos += 2;
  };
  const u32 = (wert: number) => {
    sicht.setUint32(pos, wert, true);
    pos += 4;
  };
  const eintrag = (tag: number, typ: number, anzahl: number, wert: number) => {
    u16(tag);
    u16(typ);
    u32(anzahl);
    u32(wert);
  };

  // Kopf: "II", 42, erstes Verzeichnis ab 8.
  bytes.set(text('II'), 0);
  pos = 2;
  u16(42);
  u32(8);

  // IFD0: Hersteller, Ausrichtung, Verweis auf das GPS-Verzeichnis.
  const make = 'Testkamera Modell X\0';
  pos = 8;
  u16(3);
  eintrag(0x010f, 2, make.length, makeOffset);
  eintrag(0x0112, 3, 1, ausrichtung); // SHORT steht in den ersten zwei Bytes
  eintrag(0x8825, 4, 1, gpsOffset);
  u32(ifd1Offset); // Folgeverzeichnis mit dem Vorschaubild
  bytes.set(text(make), makeOffset);

  // GPS-Verzeichnis: Breitengrad-Referenz und ein Kennwort als Verfahren.
  pos = gpsOffset;
  u16(2);
  eintrag(0x0001, 2, 2, 0x4e); // "N"
  eintrag(0x001b, 7, 19, gpsTextOffset);
  u32(0);
  bytes.set(text('GPSORT-50.93N-6.95E'), gpsTextOffset);

  // IFD1: Beginn und Länge des Vorschaubilds.
  pos = ifd1Offset;
  u16(2);
  eintrag(0x0201, 4, 1, vorschauOffset);
  eintrag(0x0202, 4, 1, vorschau.length);
  u32(0);
  bytes.set(vorschau, vorschauOffset);

  return bytes;
}

export function jpegSegment(marker: number, inhalt: Uint8Array): Uint8Array {
  const laenge = inhalt.length + 2;
  return verbinde(Uint8Array.from([0xff, marker, laenge >> 8, laenge & 0xff]), inhalt);
}

/** Das Chromium-JPEG mit allem, was eine Handykamera hinzufügt. */
export function jpegVomHandy(ausrichtung = 6): Uint8Array {
  const original = basis(CHROMIUM_JPEG);
  const vorschau = verbinde(text('VORSCHAUBILD-'), original.subarray(0, 40));
  const exif = jpegSegment(
    0xe1,
    verbinde(text('Exif\0\0'), tiffMitOrtUndVorschau(ausrichtung, vorschau)),
  );
  const xmp = jpegSegment(
    0xe1,
    text('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>XMPORT Hausbesuch</x:xmpmeta>'),
  );
  const iptc = jpegSegment(0xed, text('Photoshop 3.0\0IPTC-STICHWORT'));
  const kommentar = jpegSegment(0xfe, text('KOMMENTAR Aufnahme'));
  const anhang = text('ANGEHAENGTES-ZWEITBILD');
  // Hinter SOI eingefügt, wie eine Kamera es tut; hinten ein angehängtes Bild.
  return verbinde(
    original.subarray(0, 2),
    exif,
    xmp,
    iptc,
    kommentar,
    original.subarray(2),
    anhang,
  );
}

export function pngChunk(typ: string, daten: Uint8Array): Uint8Array {
  const laenge = new Uint8Array(4);
  new DataView(laenge.buffer).setUint32(0, daten.length);
  // Die CRC der Eingabe ist für die Bereinigung ohne Belang: Sie liest sie
  // nicht, sondern behält oder verwirft einen Chunk als Ganzes.
  return verbinde(laenge, text(typ), daten, new Uint8Array(4));
}

/** Das Chromium-PNG mit allem, was ein Gerät hinzufügen kann. */
export function pngVomHandy(ausrichtung = 8): Uint8Array {
  const original = basis(CHROMIUM_PNG);
  const kopf = pngChunks(original)[0]!;
  return verbinde(
    original.subarray(0, 8),
    original.subarray(kopf.start, kopf.ende),
    pngChunk('eXIf', tiffMitOrtUndVorschau(ausrichtung, text('VORSCHAUBILD-PNG'))),
    pngChunk('iCCP', text('Geraeteprofil\0\0PROFIL')),
    pngChunk('tEXt', text('Comment\0TEXTCHUNK Hausbesuch')),
    pngChunk('iTXt', text('XML:com.adobe.xmp\0\0\0\0\0XMPORT')),
    pngChunk('tIME', Uint8Array.from([0x07, 0xea, 9, 26, 10, 30, 0])),
    pngChunk('gAMA', Uint8Array.from([0, 0, 0xb1, 0x8f])),
    original.subarray(kopf.ende),
  );
}

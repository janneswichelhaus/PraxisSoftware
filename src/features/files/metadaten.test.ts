import { describe, expect, it } from 'vitest';
import { alleBytes, bereinigeBild, entferneMetadaten, jpegSegmente, pngChunks } from './metadaten';
import {
  CHROMIUM_JPEG,
  CHROMIUM_PNG,
  basis,
  enthaelt,
  jpegSegment,
  jpegVomHandy,
  pngChunk,
  pngVomHandy,
  text,
  verbinde,
} from './testbilder';

/**
 * Die Entfernung der Aufnahmemetadaten (DOK-006, ADR-017 Punkt 34).
 *
 * Der Punkt verlangt ausdrücklich den Nachweis durch einen Test: Ein Bild mit
 * Ortsangabe und Vorschaubild geht durch, und in den Bytes, die hochgeladen
 * würden, stehen weder Ort noch Vorschaubild — die Bilddaten sind unverändert.
 *
 * Alle Bilder sind synthetisch (`testbilder.ts`).
 */

/** Die Segmente, die keine Metadaten sind — die Bilddaten im weiteren Sinn. */
function bilddaten(bytes: Uint8Array): Buffer[] {
  return jpegSegmente(bytes)
    .filter((s) => !(s.marker >= 0xe0 && s.marker <= 0xef) && s.marker !== 0xfe)
    .map((s) => Buffer.from(bytes.subarray(s.start, s.ende)));
}

function ausrichtungIm(bytes: Uint8Array): number | null {
  const app1 = jpegSegmente(bytes).find((s) => s.marker === 0xe1);
  if (!app1) return null;
  // Unser Segment ist Big Endian mit einem Eintrag; der Wert steht fest.
  return bytes[app1.start + 4 + 6 + 8 + 2 + 9]!;
}

describe('entferneMetadaten — JPEG', () => {
  it('entfernt Ort, Gerät, Vorschaubild, XMP, IPTC, Kommentar und angehängte Bilder', () => {
    const handy = jpegVomHandy();
    // Die Ausgangslage stimmt: alles ist drin.
    for (const kennwort of [
      'GPSORT',
      'Testkamera',
      'VORSCHAUBILD',
      'XMPORT',
      'IPTC-STICHWORT',
      'KOMMENTAR',
      'ANGEHAENGTES',
      'ICC_PROFILE',
    ]) {
      expect(enthaelt(handy, kennwort)).toBe(true);
    }

    const bereinigt = entferneMetadaten(handy, 'image/jpeg');

    for (const kennwort of [
      'GPSORT',
      'Testkamera',
      'VORSCHAUBILD',
      'XMPORT',
      'IPTC-STICHWORT',
      'KOMMENTAR',
      'ANGEHAENGTES',
      'ICC_PROFILE',
      'JFIF',
    ]) {
      expect(enthaelt(bereinigt, kennwort)).toBe(false);
    }
  });

  it('lässt die Bilddaten Byte für Byte unverändert', () => {
    const handy = jpegVomHandy();
    const bereinigt = entferneMetadaten(handy, 'image/jpeg');

    expect(bilddaten(bereinigt)).toEqual(bilddaten(handy));
    expect(bilddaten(bereinigt)).toEqual(bilddaten(basis(CHROMIUM_JPEG)));
    // Anfang und Ende sind die eines JPEG.
    expect([bereinigt[0], bereinigt[1]]).toEqual([0xff, 0xd8]);
    expect([bereinigt.at(-2), bereinigt.at(-1)]).toEqual([0xff, 0xd9]);
  });

  it('behält als einzige Angabe die Ausrichtung - in einem Segment ohne sonst etwas', () => {
    const bereinigt = entferneMetadaten(jpegVomHandy(6), 'image/jpeg');
    const app = jpegSegmente(bereinigt).filter((s) => s.marker >= 0xe0 && s.marker <= 0xef);

    expect(app).toHaveLength(1);
    expect(app[0]!.ende - app[0]!.start).toBe(36); // Marker, Länge, "Exif\0\0", 26 Bytes TIFF
    expect(ausrichtungIm(bereinigt)).toBe(6);
  });

  it('schreibt bei aufrechtem Bild überhaupt kein EXIF-Segment', () => {
    const bereinigt = entferneMetadaten(jpegVomHandy(1), 'image/jpeg');
    expect(jpegSegmente(bereinigt).some((s) => s.marker === 0xe1)).toBe(false);
  });

  it('entfernt auch das Farbprofil, das Chromium beim Kodieren im Canvas schreibt', () => {
    // So kommt ein Bild aus dem Kameradialog an: JFIF und ICC-Profil, kein EXIF.
    const bereinigt = entferneMetadaten(basis(CHROMIUM_JPEG), 'image/jpeg');
    const markers = jpegSegmente(bereinigt).map((s) => s.marker);

    expect(markers.filter((m) => m >= 0xe0 && m <= 0xef)).toEqual([]);
    expect(markers[0]).toBe(0xd8);
    expect(markers).toContain(0xda);
  });

  it('behält das Adobe-Segment, das der Dekoder für die Farben braucht', () => {
    const original = basis(CHROMIUM_JPEG);
    const adobe = jpegSegment(
      0xee,
      verbinde(text('Adobe'), Uint8Array.from([0, 100, 0, 0, 0, 0, 1])),
    );
    const mitAdobe = verbinde(original.subarray(0, 2), adobe, original.subarray(2));

    const bereinigt = entferneMetadaten(mitAdobe, 'image/jpeg');
    expect(enthaelt(bereinigt, 'Adobe')).toBe(true);
  });

  it('laesst keine unbekannten Segmente durch - Erlaubnisliste statt Verbotsliste', () => {
    const original = basis(CHROMIUM_JPEG);
    // Ein reservierter Marker mit Inhalt, wie ihn keine Kamera schreibt.
    const reserviert = verbinde(
      original.subarray(0, 2),
      jpegSegment(0xf0, text('GPSSECRET')),
      original.subarray(2),
    );
    expect(() => entferneMetadaten(reserviert, 'image/jpeg')).toThrow(/beschädigt/);
    // `FF 00` gehört nur in die Bilddaten, nicht zwischen die Segmente.
    const nullmarker = verbinde(
      original.subarray(0, 2),
      Uint8Array.from([0xff, 0x00, 0x00, 0x08]),
      text('GEHEIM'),
      original.subarray(2),
    );
    expect(() => entferneMetadaten(nullmarker, 'image/jpeg')).toThrow(/beschädigt/);
  });

  it('weist eine Datei ab, die kein lesbares JPEG ist - im Zweifel wird nichts hochgeladen', () => {
    const original = basis(CHROMIUM_JPEG);
    expect(() => entferneMetadaten(text('kein Bild'), 'image/jpeg')).toThrow(/beschädigt/);
    // Ein Segment, dessen Länge über das Dateiende hinausreicht.
    const abgeschnitten = verbinde(
      original.subarray(0, 2),
      Uint8Array.from([0xff, 0xe1, 0x40, 0x00]),
      text('Exif'),
    );
    expect(() => entferneMetadaten(abgeschnitten, 'image/jpeg')).toThrow(/beschädigt/);
    // Kein Scan: ein Kopf ohne Bild.
    expect(() =>
      entferneMetadaten(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg'),
    ).toThrow(/beschädigt/);
  });
});

describe('entferneMetadaten — PNG', () => {
  it('entfernt EXIF mit Ort, Textchunks, XMP, Zeitstempel und Farbprofil', () => {
    const bereinigt = entferneMetadaten(pngVomHandy(), 'image/png');
    for (const kennwort of [
      'GPSORT',
      'Testkamera',
      'VORSCHAUBILD',
      'TEXTCHUNK',
      'XMPORT',
      'PROFIL',
      'tIME',
    ]) {
      expect(enthaelt(bereinigt, kennwort)).toBe(false);
    }
  });

  it('lässt Kopf und Bilddaten unverändert und behält die Farbangabe', () => {
    const original = basis(CHROMIUM_PNG);
    const bereinigt = entferneMetadaten(pngVomHandy(), 'image/png');
    const stuecke = (bytes: Uint8Array, typ: string) =>
      pngChunks(bytes)
        .filter((chunk) => chunk.typ === typ)
        .map((c) => Buffer.from(bytes.subarray(c.start, c.ende)));

    expect(stuecke(bereinigt, 'IHDR')).toEqual(stuecke(original, 'IHDR'));
    // Chromium schreibt die Bilddaten in zwei IDAT-Chunks; beide bleiben gleich.
    expect(stuecke(bereinigt, 'IDAT')).toEqual(stuecke(original, 'IDAT'));
    expect(stuecke(original, 'IDAT').length).toBeGreaterThan(0);
    expect(pngChunks(bereinigt).map((c) => c.typ)).toEqual([
      'IHDR',
      'eXIf',
      'gAMA',
      ...stuecke(original, 'IDAT').map(() => 'IDAT'),
      'IEND',
    ]);
  });

  it('schreibt die Ausrichtung in einen neuen eXIf-Chunk mit gültiger Prüfsumme', () => {
    const bereinigt = entferneMetadaten(pngVomHandy(8), 'image/png');
    const exif = pngChunks(bereinigt).find((c) => c.typ === 'eXIf')!;
    const daten = bereinigt.subarray(exif.start + 8, exif.ende - 4);

    expect(daten).toHaveLength(26);
    expect(daten[19]).toBe(8);

    // CRC-32 über Typ und Daten, wie PNG sie verlangt - unabhängig nachgerechnet.
    let crc = 0xffffffff;
    for (const byte of bereinigt.subarray(exif.start + 4, exif.ende - 4)) {
      crc ^= byte;
      for (let k = 0; k < 8; k += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    const erwartet = (crc ^ 0xffffffff) >>> 0;
    expect(Buffer.from(bereinigt.subarray(exif.ende - 4, exif.ende)).readUInt32BE()).toBe(erwartet);
  });

  it('entfernt unbekannte Hilfschunks und weist unbekannte kritische Chunks ab', () => {
    const original = basis(CHROMIUM_PNG);
    const kopf = pngChunks(original)[0]!;
    const mit = (chunk: Uint8Array) =>
      verbinde(original.subarray(0, kopf.ende), chunk, original.subarray(kopf.ende));

    const privat = entferneMetadaten(mit(pngChunk('prVt', text('GPSSECRET'))), 'image/png');
    expect(enthaelt(privat, 'GPSSECRET')).toBe(false);

    expect(() => entferneMetadaten(mit(pngChunk('GEOX', text('GPSSECRET'))), 'image/png')).toThrow(
      /beschädigt/,
    );
  });

  it('ohne Drehung kein eXIf-Chunk', () => {
    const bereinigt = entferneMetadaten(pngVomHandy(1), 'image/png');
    expect(pngChunks(bereinigt).some((c) => c.typ === 'eXIf')).toBe(false);
  });

  it('weist ein unlesbares PNG ab', () => {
    expect(() => entferneMetadaten(text('kein Bild'), 'image/png')).toThrow(/beschädigt/);
    const original = basis(CHROMIUM_PNG);
    expect(() => entferneMetadaten(original.subarray(0, original.length - 5), 'image/png')).toThrow(
      /beschädigt/,
    );
  });
});

describe('bereinigeBild', () => {
  it('liefert eine bereinigte Datei gleichen Typs', async () => {
    const datei = new File([jpegVomHandy() as BlobPart], 'IMG_4711.jpg', { type: 'image/jpeg' });
    const bereinigt = await bereinigeBild(datei);
    const bytes = await alleBytes(bereinigt);

    expect(bereinigt.type).toBe('image/jpeg');
    expect(bereinigt.size).toBeLessThan(datei.size);
    expect(enthaelt(bytes, 'GPSORT')).toBe(false);
    expect(jpegSegmente(bytes).some((s) => s.marker === 0xda)).toBe(true);
  });

  it('lässt ein PDF unverändert', async () => {
    const pdf = new File(['%PDF-1.7 Autor'], 'Arztbrief.pdf', { type: 'application/pdf' });
    expect(await bereinigeBild(pdf)).toBe(pdf);
  });
});

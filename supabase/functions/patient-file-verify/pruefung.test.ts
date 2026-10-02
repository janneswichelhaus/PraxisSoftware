import { describe, expect, it } from 'vitest';
import { entferneMetadaten } from '../../../src/features/files/metadaten';
import {
  CHROMIUM_JPEG,
  CHROMIUM_PNG,
  basis,
  jpegSegment,
  jpegVomHandy,
  pngChunk,
  pngVomHandy,
  text,
  verbinde,
} from '../../../src/features/files/testbilder';
import { metadatenfrei, pruefeInhalt, sha256, typPasst } from './pruefung';

/**
 * Die Prüfung am Inhalt (ABN-025, ADR-017 Punkt 49).
 *
 * Der wichtigste Teil ist der Abgleich mit dem Gerät: Was
 * `entferneMetadaten` aus einem Handybild macht, besteht; das Handybild
 * selbst fällt durch. Läuft die Erlaubnisliste in Browser und Function je
 * auseinander, scheitert dieser Test.
 */

const PDF = verbinde(text('%PDF-1.7\n'), text('1 0 obj<<>>endobj\n%%EOF'));

describe('Typ an der Signatur', () => {
  it('erkennt die drei erlaubten Formate an ihren ersten Bytes', () => {
    expect(typPasst(basis(CHROMIUM_JPEG), 'image/jpeg')).toBe(true);
    expect(typPasst(basis(CHROMIUM_PNG), 'image/png')).toBe(true);
    expect(typPasst(PDF, 'application/pdf')).toBe(true);
  });

  it('weist eine umbenannte Datei und jedes andere Format ab', () => {
    expect(typPasst(basis(CHROMIUM_PNG), 'image/jpeg')).toBe(false);
    expect(typPasst(PDF, 'image/png')).toBe(false);
    expect(typPasst(text('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')).toBe(
      false,
    );
    expect(typPasst(new Uint8Array(), 'application/pdf')).toBe(false);
  });
});

describe('SHA-256', () => {
  it('rechnet wie der Browser, hexadezimal in Kleinbuchstaben', async () => {
    expect(await sha256(text('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('Metadatenfreiheit nach der Erlaubnisliste des Geräts', () => {
  it('laesst ein vom Gerät bereinigtes JPEG mit Ausrichtung durch, das Original nicht', () => {
    const handy = jpegVomHandy(6);
    expect(metadatenfrei(handy, 'image/jpeg')).toBe(false);
    expect(metadatenfrei(entferneMetadaten(handy, 'image/jpeg'), 'image/jpeg')).toBe(true);
  });

  it('laesst ein vom Gerät bereinigtes PNG mit Ausrichtung durch, das Original nicht', () => {
    const handy = pngVomHandy(8);
    expect(metadatenfrei(handy, 'image/png')).toBe(false);
    expect(metadatenfrei(entferneMetadaten(handy, 'image/png'), 'image/png')).toBe(true);
  });

  it('nimmt die Bilder aus dem Kameradialog ohne Weiteres an', () => {
    const jpeg = entferneMetadaten(basis(CHROMIUM_JPEG), 'image/jpeg');
    expect(metadatenfrei(jpeg, 'image/jpeg')).toBe(true);
    expect(metadatenfrei(entferneMetadaten(basis(CHROMIUM_PNG), 'image/png'), 'image/png')).toBe(
      true,
    );
  });

  it.each([
    ['ein Kommentar', jpegSegment(0xfe, text('KOMMENTAR'))],
    ['ein XMP-Segment', jpegSegment(0xe1, text('http://ns.adobe.com/xap/1.0/\0<x/>'))],
    ['ein Farbprofil', jpegSegment(0xe2, text('ICC_PROFILE\0\x01\x01PROFIL'))],
    ['ein JFIF-Kopf', jpegSegment(0xe0, text('JFIF\0\x01\x02\0\0\x01\0\x01\0\0'))],
  ])('findet im JPEG %s', (_name, segment) => {
    const sauber = entferneMetadaten(basis(CHROMIUM_JPEG), 'image/jpeg');
    const mit = verbinde(sauber.subarray(0, 2), segment, sauber.subarray(2));
    expect(metadatenfrei(mit, 'image/jpeg')).toBe(false);
  });

  it('findet Bytes hinter dem Bildende', () => {
    const sauber = entferneMetadaten(basis(CHROMIUM_JPEG), 'image/jpeg');
    expect(metadatenfrei(verbinde(sauber, text('ZWEITBILD')), 'image/jpeg')).toBe(false);
    const png = entferneMetadaten(basis(CHROMIUM_PNG), 'image/png');
    expect(metadatenfrei(verbinde(png, text('ZWEITBILD')), 'image/png')).toBe(false);
  });

  it('findet im PNG einen Textchunk', () => {
    const sauber = entferneMetadaten(basis(CHROMIUM_PNG), 'image/png');
    const ihdrEnde = 8 + 25;
    const mit = verbinde(
      sauber.subarray(0, ihdrEnde),
      pngChunk('tEXt', text('Comment\0x')),
      sauber.subarray(ihdrEnde),
    );
    expect(metadatenfrei(mit, 'image/png')).toBe(false);
  });

  it('fragt bei PDF nicht (null)', () => {
    expect(metadatenfrei(PDF, 'application/pdf')).toBeNull();
  });
});

describe('alle drei gegen die Ankuendigung', () => {
  it('besteht mit passendem Typ, Groesse und Pruefsumme', async () => {
    const bild = entferneMetadaten(jpegVomHandy(3), 'image/jpeg');
    expect(
      await pruefeInhalt(bild, {
        mime_type: 'image/jpeg',
        byte_size: bild.length,
        checksum_sha256: await sha256(bild),
      }),
    ).toEqual({ content_type_ok: true, checksum_ok: true, metadata_ok: true });
  });

  it('meldet eine abweichende Pruefsumme und eine umbenannte Datei', async () => {
    expect(
      await pruefeInhalt(PDF, {
        mime_type: 'application/pdf',
        byte_size: PDF.length,
        checksum_sha256: 'f'.repeat(64),
      }),
    ).toEqual({ content_type_ok: true, checksum_ok: false, metadata_ok: null });

    expect(
      await pruefeInhalt(PDF, {
        mime_type: 'image/png',
        byte_size: PDF.length,
        checksum_sha256: await sha256(PDF),
      }),
    ).toEqual({ content_type_ok: false, checksum_ok: true, metadata_ok: false });
  });
});

import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { hatFarbprofil, nachSrgb } from './farbe';
import { alleBytes, entferneMetadaten, pngChunks } from './metadaten';
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
} from './testbilder';

/**
 * Farbe: sRGB vor dem Entfernen der Metadaten (ABN-026, ADR-017 Punkt 53).
 * Die Umrechnung selbst braucht einen Browser (`fotos.spec.ts`); hier stehen
 * die Regeln: nur mit Profil, sonst byte-gleich.
 */

/** Das Chromium-JPEG ohne sein eigenes sRGB-Profil. */
function ohneProfil(): Uint8Array {
  return entferneMetadaten(basis(CHROMIUM_JPEG), 'image/jpeg');
}

function mitProfil(): Uint8Array {
  const original = ohneProfil();
  return verbinde(
    original.subarray(0, 2),
    jpegSegment(0xe2, text('ICC_PROFILE\0\x01\x01PROFIL-WEITRAUM')),
    original.subarray(2),
  );
}

function blob(bytes: Uint8Array, typ: string): Blob {
  return new Blob([bytes as BlobPart], { type: typ });
}

/** Ein ICC-Kopf mit RGB-Farbraum und einer Beschreibung in UTF-16, wie `mluc`. */
function profil(beschreibung: string): Uint8Array {
  const kopf = new Uint8Array(128);
  kopf.set(text('RGB '), 16);
  const utf16 = new Uint8Array(beschreibung.length * 2);
  for (let i = 0; i < beschreibung.length; i += 1) utf16[i * 2 + 1] = beschreibung.charCodeAt(i);
  return verbinde(kopf, text('mluc'), utf16);
}

function jpegMit(icc: Uint8Array): Uint8Array {
  const original = ohneProfil();
  return verbinde(
    original.subarray(0, 2),
    jpegSegment(0xe2, verbinde(text('ICC_PROFILE\0\x01\x01'), icc)),
    original.subarray(2),
  );
}

describe('hatFarbprofil', () => {
  it('erkennt ein abweichendes Profil im JPEG und im PNG', async () => {
    expect(await hatFarbprofil(mitProfil(), 'image/jpeg')).toBe(true);
    expect(await hatFarbprofil(jpegMit(profil('Display P3')), 'image/jpeg')).toBe(true);
    // Ein Profil, das sich nicht entpacken laesst, gilt als abweichend.
    expect(await hatFarbprofil(pngVomHandy(), 'image/png')).toBe(true);
  });

  it('laesst ein sRGB-Profil stehen - so kodiert Chromium jedes Canvas-JPEG', async () => {
    expect(await hatFarbprofil(jpegMit(profil('sRGB IEC61966-2.1')), 'image/jpeg')).toBe(false);
    expect(await hatFarbprofil(basis(CHROMIUM_JPEG), 'image/jpeg')).toBe(false);
    expect(await hatFarbprofil(jpegVomHandy(), 'image/jpeg')).toBe(false);
  });

  it('entpackt das Profil eines PNG und liest seine Beschreibung', async () => {
    const original = basis(CHROMIUM_PNG);
    const kopf = pngChunks(original)[0]!;
    const mit = (icc: Uint8Array) =>
      verbinde(
        original.subarray(0, kopf.ende),
        pngChunk('iCCP', verbinde(text('Profil\0\0'), new Uint8Array(deflateSync(icc)))),
        original.subarray(kopf.ende),
      );
    expect(await hatFarbprofil(mit(profil('sRGB built-in')), 'image/png')).toBe(false);
    expect(await hatFarbprofil(mit(profil('Display P3')), 'image/png')).toBe(true);
  });

  it('findet in Bildern ohne Profil keins', async () => {
    expect(await hatFarbprofil(ohneProfil(), 'image/jpeg')).toBe(false);
    expect(await hatFarbprofil(basis(CHROMIUM_PNG), 'image/png')).toBe(false);
  });

  it('haelt ein unlesbares Bild fuer profillos; die Bereinigung meldet es danach', async () => {
    expect(await hatFarbprofil(text('kein Bild'), 'image/jpeg')).toBe(false);
  });
});

describe('nachSrgb', () => {
  it('rechnet nur ein Bild mit Profil um', async () => {
    const umgerechnet = blob(basis(CHROMIUM_JPEG), 'image/jpeg');
    const umrechnen = vi.fn().mockResolvedValue(umgerechnet);
    const ergebnis = await nachSrgb(blob(mitProfil(), 'image/jpeg'), umrechnen);
    expect(umrechnen).toHaveBeenCalledTimes(1);
    expect(ergebnis).toBe(umgerechnet);
  });

  it('laesst ein Bild ohne Profil byte-gleich (Punkt 34)', async () => {
    const umrechnen = vi.fn();
    const original = blob(jpegVomHandy(), 'image/jpeg');
    const ergebnis = await nachSrgb(original, umrechnen);
    expect(umrechnen).not.toHaveBeenCalled();
    expect(await alleBytes(ergebnis)).toEqual(jpegVomHandy());
  });

  it('laesst PDF unangetastet', async () => {
    const umrechnen = vi.fn();
    const pdf = blob(text('%PDF-1.7'), 'application/pdf');
    expect(await nachSrgb(pdf, umrechnen)).toBe(pdf);
    expect(umrechnen).not.toHaveBeenCalled();
  });

  it('meldet eine gescheiterte Umrechnung, statt das Profil still zu verlieren', async () => {
    const umrechnen = vi.fn().mockRejectedValue(new Error('dekodieren'));
    await expect(nachSrgb(blob(mitProfil(), 'image/jpeg'), umrechnen)).rejects.toThrow(
      /Farbprofil/,
    );
  });
});

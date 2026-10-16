// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { alleBytes } from '@/features/files/metadaten';
import { enthaelt, mp4AusSafari, webmAusChromium } from './testvideos';
import { bereinigeVideo, videotyp } from './videometadaten';

/**
 * Programm- und Zeitangaben verlassen das Gerät nicht (ADR-017 Punkt 64,
 * ANN-336), und ein Video mit Ton wird gar nicht erst hochgeladen (Punkt 63).
 */

async function bereinigt(daten: Uint8Array, typ: string): Promise<Uint8Array> {
  const ergebnis = await bereinigeVideo(new Blob([daten as BlobPart], { type: typ }));
  if (!ergebnis.ok) throw new Error(ergebnis.grund);
  return alleBytes(ergebnis.video);
}

describe('Video ohne Angaben (KOM-006)', () => {
  it('WebM: das Programm wird geleert, Länge und Bilddaten bleiben', async () => {
    const roh = webmAusChromium();
    expect(enthaelt(roh, 'Chrome')).toBe(true);
    const sauber = await bereinigt(roh, 'video/webm;codecs=vp8');
    expect(enthaelt(sauber, 'Chrome')).toBe(false);
    expect(sauber.length).toBe(roh.length);
    // Nur die Programmangaben sind anders - je sechs Bytes.
    expect(roh.filter((b, i) => b !== sauber[i]).length).toBe(12);
  });

  it('WebM: Datum und Tags werden zu Void derselben Länge', async () => {
    const roh = webmAusChromium({ datum: true, tags: true });
    const sauber = await bereinigt(roh, 'video/webm');
    expect(sauber.length).toBe(roh.length);
    expect(enthaelt(sauber, 'Kennwort-Titel')).toBe(false);
    expect(enthaelt(sauber, 'TITLE')).toBe(false);
  });

  it('MP4: Aufnahmezeiten null, udta wird free', async () => {
    const roh = mp4AusSafari({ udta: true });
    expect(enthaelt(roh, 'Kennwort-Datum')).toBe(true);
    const sauber = await bereinigt(roh, 'video/mp4');
    expect(sauber.length).toBe(roh.length);
    expect(enthaelt(sauber, 'Kennwort-Datum')).toBe(false);
    expect(enthaelt(sauber, 'udta')).toBe(false);
    expect(enthaelt(sauber, 'free')).toBe(true);
    // Die Zeitstempel 0xE1234567 kommen nicht mehr vor.
    expect(enthaelt(sauber, '\xe1\x23\x45\x67')).toBe(false);
  });

  it('ein Video mit Tonspur wird nicht hochgeladen (Punkt 63)', async () => {
    for (const [daten, typ] of [
      [webmAusChromium({ ton: true }), 'video/webm'],
      [mp4AusSafari({ ton: true }), 'video/mp4'],
    ] as const) {
      expect(await bereinigeVideo(new Blob([daten as BlobPart], { type: typ }))).toEqual({
        ok: false,
        grund: 'ton',
      });
    }
  });

  it('fremde Formate und kaputte Container werden abgewiesen', async () => {
    const quicktime = new Blob([mp4AusSafari() as BlobPart], { type: 'video/quicktime' });
    expect(await bereinigeVideo(quicktime)).toEqual({ ok: false, grund: 'format' });
    const abgeschnitten = webmAusChromium().slice(0, 60);
    expect(
      await bereinigeVideo(new Blob([abgeschnitten as BlobPart], { type: 'video/webm' })),
    ).toEqual({ ok: false, grund: 'format' });
    const vertauscht = new Blob([webmAusChromium() as BlobPart], { type: 'video/mp4' });
    expect(await bereinigeVideo(vertauscht)).toEqual({ ok: false, grund: 'format' });
  });

  it('der Typ verliert die Codec-Angabe', () => {
    expect(videotyp('video/webm;codecs=vp9')).toBe('video/webm');
    expect(videotyp('video/mp4; codecs="avc1.42E01E"')).toBe('video/mp4');
    expect(videotyp('video/x-matroska')).toBeNull();
  });
});

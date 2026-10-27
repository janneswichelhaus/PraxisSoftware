// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { alleBytes } from '@/lib/dateien/metadaten';
import { enthaelt, mp4AusSafari, webmAusChromium } from './testvideos';
import { bereinigeTon, bereinigeVideo, tontyp, videotyp } from './videometadaten';

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

describe('Sprachnachricht ohne Angaben (TEAM-004, ADR-017 Punkt 84)', () => {
  async function tonBereinigt(daten: Uint8Array, typ: string): Promise<Uint8Array> {
    const ergebnis = await bereinigeTon(new Blob([daten as BlobPart], { type: typ }));
    if (!ergebnis.ok) throw new Error(ergebnis.grund);
    expect(ergebnis.ton.type).toBe(typ.split(';')[0]);
    return alleBytes(ergebnis.ton);
  }

  it('WebM und MP4 nur mit Ton: Programm, Datum, Tags und Zeiten leer, die Länge bleibt', async () => {
    const webm = webmAusChromium({ bild: false, ton: true, datum: true, tags: true });
    const sauberWebm = await tonBereinigt(webm, 'audio/webm;codecs=opus');
    expect(sauberWebm.length).toBe(webm.length);
    expect(enthaelt(sauberWebm, 'Chrome')).toBe(false);
    expect(enthaelt(sauberWebm, 'Kennwort-Titel')).toBe(false);

    const mp4 = mp4AusSafari({ bild: false, ton: true, udta: true });
    const sauberMp4 = await tonBereinigt(mp4, 'audio/mp4');
    expect(sauberMp4.length).toBe(mp4.length);
    expect(enthaelt(sauberMp4, 'Kennwort-Datum')).toBe(false);
    expect(enthaelt(sauberMp4, '\xe1\x23\x45\x67')).toBe(false);
  });

  it('nimmt mehrere Cluster unbekannter Länge an - wie die Aufnahme mit Zeitscheibe', async () => {
    // Die echte Aufnahme in Chromium (`start(1000)`) schreibt je Stück einen
    // Cluster ohne Länge; der erste E2E-Lauf fand das (TEAM-004).
    const ton = webmAusChromium({ bild: false, ton: true, cluster: 3 });
    const sauber = await tonBereinigt(ton, 'audio/webm;codecs=opus');
    expect(sauber.length).toBe(ton.length);
    expect(enthaelt(sauber, 'Chrome')).toBe(false);
    const video = webmAusChromium({ cluster: 2 });
    expect((await bereinigeVideo(new Blob([video as BlobPart], { type: 'video/webm' }))).ok).toBe(
      true,
    );
  });

  it('prüft auch nach mehreren Clustern alles: Angaben, Spuren, unbekannte Länge (Zweitreview)', async () => {
    const mitAngaben = webmAusChromium({
      bild: false,
      ton: true,
      cluster: 3,
      datum: true,
      tags: true,
    });
    const sauber = await tonBereinigt(mitAngaben, 'audio/webm');
    expect(enthaelt(sauber, 'Chrome')).toBe(false);
    expect(enthaelt(sauber, 'Kennwort-Titel')).toBe(false);
    const ablehnen = async (daten: Uint8Array, typ: string) =>
      typ.startsWith('audio/')
        ? bereinigeTon(new Blob([daten as BlobPart], { type: typ }))
        : bereinigeVideo(new Blob([daten as BlobPart], { type: typ }));
    expect(await ablehnen(webmAusChromium({ ton: true, cluster: 3 }), 'audio/webm')).toEqual({
      ok: false,
      grund: 'bild',
    });
    expect(await ablehnen(webmAusChromium({ ton: true, cluster: 3 }), 'video/webm')).toEqual({
      ok: false,
      grund: 'ton',
    });
    // Unbekannte Länge nur für Segment und Cluster darin - sonst nicht lesbar.
    for (const daten of [
      webmAusChromium({ bild: false, ton: true, cluster: 2, tagsOhneLaenge: true }),
      webmAusChromium({ bild: false, ton: true, versteckteBildspur: true }),
      webmAusChromium({ bild: false, ton: true, versteckteBildspur: 'segment' }),
    ]) {
      expect(await ablehnen(daten, 'audio/webm')).toEqual({ ok: false, grund: 'format' });
    }
  });

  it('eine Bildspur heißt nicht senden - auch neben dem Ton', async () => {
    for (const [daten, typ] of [
      [webmAusChromium({ ton: true }), 'audio/webm'],
      [mp4AusSafari({ ton: true }), 'audio/mp4'],
    ] as const) {
      expect(await bereinigeTon(new Blob([daten as BlobPart], { type: typ }))).toEqual({
        ok: false,
        grund: 'bild',
      });
    }
  });

  it('ohne Tonspur, in fremdem Format oder abgeschnitten: nicht angenommen', async () => {
    for (const [daten, typ] of [
      [webmAusChromium({ bild: false }), 'audio/webm'],
      [webmAusChromium({ bild: false, ton: true }), 'audio/ogg'],
      [webmAusChromium({ bild: false, ton: true }).slice(0, 60), 'audio/webm'],
      [webmAusChromium({ bild: false, ton: true }), 'audio/mp4'],
    ] as const) {
      expect(await bereinigeTon(new Blob([daten as BlobPart], { type: typ }))).toEqual({
        ok: false,
        grund: 'format',
      });
    }
  });

  it('ein Video bleibt bei seiner Regel: reiner Ton ist kein Video', async () => {
    const ton = webmAusChromium({ bild: false, ton: true });
    expect(await bereinigeVideo(new Blob([ton as BlobPart], { type: 'video/webm' }))).toEqual({
      ok: false,
      grund: 'format',
    });
  });

  it('der Typ verliert die Codec-Angabe; nur WebM und MP4', () => {
    expect(tontyp('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(tontyp('audio/mp4')).toBe('audio/mp4');
    expect(tontyp('audio/ogg;codecs=opus')).toBeNull();
    expect(tontyp('video/webm')).toBeNull();
  });
});

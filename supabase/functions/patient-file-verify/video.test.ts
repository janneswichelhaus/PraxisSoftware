// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { alleBytes } from '../../../src/features/files/metadaten';
import { enthaelt, mp4AusSafari, webmAusChromium } from '../../../src/features/platform/testvideos';
import { bereinigeVideo } from '../../../src/features/platform/videometadaten';
import { pruefeVideo } from './video';

/**
 * Die Prüfung eines Videos am Server (KOM-006, ADR-017 Punkte 49, 63, 64),
 * deckungsgleich mit der Bereinigung auf dem Gerät: Was das Gerät bereinigt
 * hat, besteht; was es durchließe, fiele hier auf.
 */

async function vomGeraet(daten: Uint8Array, typ: string): Promise<Uint8Array> {
  const ergebnis = await bereinigeVideo(new Blob([daten as BlobPart], { type: typ }));
  if (!ergebnis.ok) throw new Error(ergebnis.grund);
  return alleBytes(ergebnis.video);
}

describe('Video am Server (KOM-006)', () => {
  it('was das Gerät bereinigt hat, besteht', async () => {
    for (const [daten, typ] of [
      [webmAusChromium(), 'video/webm'],
      [webmAusChromium({ datum: true, tags: true }), 'video/webm'],
      [mp4AusSafari(), 'video/mp4'],
      [mp4AusSafari({ udta: true }), 'video/mp4'],
    ] as const) {
      expect(pruefeVideo(await vomGeraet(daten, typ), typ)).toEqual({
        lesbar: true,
        ohneTon: true,
        ohneAngaben: true,
      });
    }
  });

  it('unbereinigt fällt es auf: Programm, Datum, Tags, Zeiten, udta', () => {
    expect(pruefeVideo(webmAusChromium(), 'video/webm').ohneAngaben).toBe(false);
    expect(pruefeVideo(webmAusChromium({ tags: true }), 'video/webm').ohneAngaben).toBe(false);
    expect(pruefeVideo(mp4AusSafari(), 'video/mp4').ohneAngaben).toBe(false);
    expect(pruefeVideo(mp4AusSafari({ udta: true }), 'video/mp4').ohneAngaben).toBe(false);
  });

  it('eine Tonspur ist ein Befund (Punkt 63)', () => {
    expect(pruefeVideo(webmAusChromium({ ton: true }), 'video/webm').ohneTon).toBe(false);
    expect(pruefeVideo(mp4AusSafari({ ton: true }), 'video/mp4').ohneTon).toBe(false);
  });

  it('falsche Signatur, abgeschnitten, falscher Typ: nicht lesbar', () => {
    expect(pruefeVideo(webmAusChromium(), 'video/mp4').lesbar).toBe(false);
    expect(pruefeVideo(mp4AusSafari(), 'video/webm').lesbar).toBe(false);
    expect(pruefeVideo(webmAusChromium().slice(0, 70), 'video/webm').lesbar).toBe(false);
    expect(pruefeVideo(mp4AusSafari().slice(0, 50), 'video/mp4').lesbar).toBe(false);
    expect(pruefeVideo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'video/webm').lesbar).toBe(false);
  });

  it('die Bereinigung entfernt die Kennwörter wirklich', async () => {
    const sauber = await vomGeraet(webmAusChromium({ tags: true }), 'video/webm');
    expect(enthaelt(sauber, 'Kennwort-Titel')).toBe(false);
  });

  it('eine tief verschachtelte Datei ist nicht lesbar, ohne Stapelüberlauf (Zweitreview S2)', async () => {
    const kasten = (typ: string, inhalt: Uint8Array) => {
      const aus = new Uint8Array(8 + inhalt.length);
      new DataView(aus.buffer).setUint32(0, aus.length);
      aus.set(
        [...typ].map((z) => z.charCodeAt(0)),
        4,
      );
      aus.set(inhalt, 8);
      return aus;
    };
    let innen = new Uint8Array(0);
    for (let i = 0; i < 20_000; i += 1) innen = kasten('moov', innen);
    const ftyp = kasten('ftyp', new Uint8Array(8));
    const datei = new Uint8Array(ftyp.length + innen.length);
    datei.set(ftyp);
    datei.set(innen, ftyp.length);
    expect(pruefeVideo(datei, 'video/mp4').lesbar).toBe(false);
    expect(await bereinigeVideo(new Blob([datei as BlobPart], { type: 'video/mp4' }))).toEqual({
      ok: false,
      grund: 'format',
    });
  });
});

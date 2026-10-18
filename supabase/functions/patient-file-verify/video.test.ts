// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { alleBytes } from '../../../src/features/files/metadaten';
import { enthaelt, mp4AusSafari, webmAusChromium } from '../../../src/features/platform/testvideos';
import { bereinigeTon, bereinigeVideo } from '../../../src/features/platform/videometadaten';
import { pruefeInhalt, pruefeTeamanhang, sha256 } from './pruefung';
import { pruefeTon, pruefeVideo } from './video';

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
      [webmAusChromium({ cluster: 2 }), 'video/webm'],
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

describe('Sprachnachricht am Server (TEAM-004, ADR-017 Punkt 84)', () => {
  async function tonVomGeraet(daten: Uint8Array, typ: string): Promise<Uint8Array> {
    const ergebnis = await bereinigeTon(new Blob([daten as BlobPart], { type: typ }));
    if (!ergebnis.ok) throw new Error(ergebnis.grund);
    return alleBytes(ergebnis.ton);
  }

  it('was das Gerät bereinigt hat, besteht - WebM und MP4', async () => {
    for (const [daten, typ] of [
      [webmAusChromium({ bild: false, ton: true }), 'audio/webm'],
      [webmAusChromium({ bild: false, ton: true, datum: true, tags: true }), 'audio/webm'],
      // Mehrere Cluster unbekannter Länge, wie mit Zeitscheibe aufgenommen.
      [webmAusChromium({ bild: false, ton: true, cluster: 3 }), 'audio/webm'],
      [mp4AusSafari({ bild: false, ton: true }), 'audio/mp4'],
      [mp4AusSafari({ bild: false, ton: true, udta: true }), 'audio/mp4'],
    ] as const) {
      expect(pruefeTon(await tonVomGeraet(daten, typ), typ)).toEqual({
        lesbar: true,
        nurTon: true,
        ohneAngaben: true,
      });
    }
  });

  it('unbereinigt fällt es auf; eine Bildspur ist ein Befund', () => {
    expect(pruefeTon(webmAusChromium({ bild: false, ton: true }), 'audio/webm').ohneAngaben).toBe(
      false,
    );
    expect(
      pruefeTon(mp4AusSafari({ bild: false, ton: true, udta: true }), 'audio/mp4').ohneAngaben,
    ).toBe(false);
    expect(pruefeTon(webmAusChromium({ ton: true }), 'audio/webm').nurTon).toBe(false);
    expect(pruefeTon(mp4AusSafari({ ton: true }), 'audio/mp4').nurTon).toBe(false);
  });

  it('prüft auch nach mehreren Clustern alles: Angaben, Spuren, unbekannte Länge (Zweitreview)', () => {
    const roh = webmAusChromium({ bild: false, ton: true, cluster: 3, datum: true, tags: true });
    expect(pruefeTon(roh, 'audio/webm')).toEqual({
      lesbar: true,
      nurTon: true,
      ohneAngaben: false,
    });
    expect(pruefeTon(webmAusChromium({ ton: true, cluster: 3 }), 'audio/webm').nurTon).toBe(false);
    expect(pruefeVideo(webmAusChromium({ ton: true, cluster: 3 }), 'video/webm').ohneTon).toBe(
      false,
    );
    // Unbekannte Länge nur für Segment und Cluster darin - sonst nicht lesbar.
    expect(
      pruefeTon(
        webmAusChromium({ bild: false, ton: true, cluster: 2, tagsOhneLaenge: true }),
        'audio/webm',
      ).lesbar,
    ).toBe(false);
    expect(
      pruefeTon(webmAusChromium({ bild: false, ton: true, versteckteBildspur: true }), 'audio/webm')
        .lesbar,
    ).toBe(false);
  });

  it('ohne Tonspur, mit falschem Typ oder abgeschnitten: nicht lesbar', () => {
    expect(pruefeTon(webmAusChromium(), 'audio/webm').lesbar).toBe(false);
    expect(pruefeTon(webmAusChromium({ bild: false, ton: true }), 'audio/mp4').lesbar).toBe(false);
    expect(pruefeTon(webmAusChromium({ bild: false, ton: true }), 'audio/ogg').lesbar).toBe(false);
    expect(
      pruefeTon(webmAusChromium({ bild: false, ton: true }).slice(0, 70), 'audio/webm').lesbar,
    ).toBe(false);
    // Ein Video bleibt bei seiner Regel: reiner Ton ist kein Video.
    expect(pruefeVideo(webmAusChromium({ bild: false, ton: true }), 'video/webm').lesbar).toBe(
      false,
    );
  });

  it('der Teamchat prüft Ton an der Struktur - die Akte kennt keinen Ton', async () => {
    const ton = await tonVomGeraet(webmAusChromium({ bild: false, ton: true }), 'audio/webm');
    const ankuendigung = {
      mime_type: 'audio/webm',
      byte_size: ton.length,
      checksum_sha256: await sha256(ton),
    };
    expect(await pruefeTeamanhang(ton, ankuendigung)).toEqual({
      content_type_ok: true,
      checksum_ok: true,
      metadata_ok: true,
    });
    const roh = webmAusChromium({ bild: false, ton: true });
    expect(
      await pruefeTeamanhang(roh, { ...ankuendigung, checksum_sha256: await sha256(roh) }),
    ).toEqual({ content_type_ok: true, checksum_ok: true, metadata_ok: false });
    const mitBild = webmAusChromium({ ton: true });
    expect((await pruefeTeamanhang(mitBild, ankuendigung)).content_type_ok).toBe(false);
    expect((await pruefeInhalt(ton, ankuendigung)).content_type_ok).toBe(false);
  });
});

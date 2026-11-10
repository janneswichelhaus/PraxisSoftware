import { describe, expect, it } from 'vitest';
import {
  DIKTAT_ABSCHNITTE as ABSCHNITTE_IM_BROWSER,
  DIKTAT_HOECHSTBYTES,
  DIKTAT_HOECHSTDAUER_S,
  ASSISTENZ_FEHLERTEXTE,
  GATEWAY_FEHLERKLASSEN,
  KI_FEHLERTEXTE,
  ZWECK_DIKTAT,
  saetze as saetzeImBrowser,
} from '@/lib/ki/gateway';
import {
  AUSZUG_HOECHST_EINTRAEGE as EINTRAEGE_IM_BROWSER,
  AUSZUG_HOECHST_JE_EINTRAG as JE_EINTRAG_IM_BROWSER,
  AUSZUG_HOECHSTZEICHEN,
  ZWECK_AUSZUG,
  auszugGetreu,
  auszugssaetze as auszugssaetzeImBrowser,
} from '@/lib/ki/auszug';
import { einheiten as einheitenImBrowser } from '@/lib/ki/einheiten';
import { ORDNEN_HOECHSTZEICHEN, ZWECK_ORDNEN } from '@/lib/ki/ordnen';
import {
  UMFORMEN_HOECHSTZEICHEN,
  ZWECK_ALLTAGSSPRACHE,
  ZWECK_ENTWURF,
  stuecke as stueckeImBrowser,
} from '@/lib/ki/umformen';
import { auszugssaetze, setzeAuszug } from './auszug.ts';
import { einheiten, saetze } from './inhaltstreue.ts';
import { ersterUndLetzter } from './mock.ts';
import { FEHLERKLASSEN } from './typen.ts';
import { stuecke } from './waechter.ts';
import {
  AUSZUG_HOECHST_EINTRAEGE,
  AUSZUG_HOECHST_JE_EINTRAG,
  AUSZUG_HOECHST_ZEICHEN,
  DIKTAT_ABSCHNITTE,
  HOECHST_BYTES,
  HOECHST_DAUER_S,
  NACHRICHT_HOECHST_ZEICHEN,
  ORDNEN_HOECHST_ZEICHEN,
  ZWECKE,
} from './zwecke.ts';

/**
 * Browser und Gateway sprechen denselben Vertrag (wie `typen.test.ts` beim
 * Kartendienst): Die Kopie im Gateway ist Absicht, weil Deno aus dem eigenen
 * Verzeichnis bündelt - aber keine freie. Wer auf einer Seite eine
 * Fehlerklasse, einen Abschnitt oder eine Grenze ändert, bekommt hier einen
 * roten Test.
 */

describe('Vertrag zwischen Browser und AI Gateway', () => {
  it('kennt auf beiden Seiten dieselben Fehlerklassen', () => {
    expect([...GATEWAY_FEHLERKLASSEN]).toEqual([...FEHLERKLASSEN]);
  });

  it('hat für jede Fehlerklasse einen Satz für die Oberfläche', () => {
    for (const klasse of [...FEHLERKLASSEN, 'function_unavailable'] as const) {
      expect(KI_FEHLERTEXTE[klasse], klasse).toMatch(/\S/);
      expect(ASSISTENZ_FEHLERTEXTE[klasse], klasse).toMatch(/\S/);
    }
  });

  it('ordnet in dieselben Abschnitte ein (ANN-522)', () => {
    expect([...ABSCHNITTE_IM_BROWSER]).toEqual([...DIKTAT_ABSCHNITTE]);
  });

  it('hält dieselben Grenzen (ANN-523)', () => {
    expect(DIKTAT_HOECHSTBYTES).toBe(HOECHST_BYTES);
    expect(DIKTAT_HOECHSTDAUER_S).toBe(HOECHST_DAUER_S);
  });

  it.each([
    'Patientin sagt, seit der 2. Behandlung besser. Keine Schwellung.',
    'Z. B. Brücke, ca. 3 Min.!  Treppe?\nNein… gut',
    'Beugung 110,5 Grad. Dr. Beispiel: Plan in 2 Wochen? ',
    '',
  ])('zerlegt auf beiden Seiten gleich in Sätze (ANN-824): „%s“', (text) => {
    expect(saetzeImBrowser(text)).toEqual(saetze(text));
  });

  it('nennt nur Zwecke, die der Gateway kennt', () => {
    const genannt = [ZWECK_DIKTAT, ZWECK_ORDNEN, ZWECK_ENTWURF, ZWECK_ALLTAGSSPRACHE, ZWECK_AUSZUG];
    for (const zweck of genannt) expect(Object.keys(ZWECKE)).toContain(zweck);
  });

  it('hält beim Auszug dieselben Grenzen', () => {
    expect(EINTRAEGE_IM_BROWSER).toBe(AUSZUG_HOECHST_EINTRAEGE);
    expect(JE_EINTRAG_IM_BROWSER).toBe(AUSZUG_HOECHST_JE_EINTRAG);
    expect(AUSZUG_HOECHSTZEICHEN).toBe(AUSZUG_HOECHST_ZEICHEN);
  });

  it.each([
    'Angaben der Patient:in\nPatientin berichtet Schmerz 3 von 10.\n\nBefund\nBeugung 110 Grad. Kein Erguss.\n\nPlan\nWeiter üben.',
    'Weiter üben.\nBeugung 110 Grad.\nWeiter üben.',
    'Z. B. Brücke, ca. 3 Min.! Treppe?',
    'Befund:\r\nKein Erguss seit der 2. Woche, aber li. deutliche Schwellung. Geht 30 Min. am Stück.\r\n\r\nPLAN\r\nmax. 2x tägl.',
  ])('nimmt im Browser an, was der Gateway aus Stellen setzt (ANN-861): %j', (text) => {
    const eintraege = [
      { id: '88888888-8888-4888-8888-000000000001', text },
      { id: '88888888-8888-4888-8888-000000000002', text: 'Keine Schwellung.' },
    ];
    expect(auszugssaetzeImBrowser(text, DIKTAT_ABSCHNITTE)).toEqual(
      auszugssaetze(text, DIKTAT_ABSCHNITTE),
    );
    const quellen = eintraege.map((eintrag) => ({
      id: eintrag.id,
      saetze: auszugssaetze(eintrag.text, DIKTAT_ABSCHNITTE),
    }));
    const gesetzt = setzeAuszug(
      quellen,
      ersterUndLetzter(quellen.map((quelle) => quelle.saetze)),
      AUSZUG_HOECHST_JE_EINTRAG,
    );
    expect(gesetzt).not.toBeNull();
    expect(auszugGetreu(eintraege, gesetzt!)).toBe(true);
  });

  it('hält beim Ordnen und Umformen dieselben Grenzen', () => {
    expect(ORDNEN_HOECHSTZEICHEN).toBe(ORDNEN_HOECHST_ZEICHEN);
    expect(UMFORMEN_HOECHSTZEICHEN).toBe(NACHRICHT_HOECHST_ZEICHEN);
  });

  it.each([
    'knie li. kühlen, 10 Min.\n\nübungen 2x tägl. weiter. alles ok',
    'Am 12. kommen, z. B. um 9. Passt das?  Sonst Dr. Probst fragen!',
    'Tape lat. anlegen (max. 3 Std.) und ggf. bds. kühlen… fertig',
    'Zeile eins\r\n   \r\nZeile drei. Noch ein Satz.',
    '',
  ])('teilt eine Antwort auf beiden Seiten gleich in Sätze (ANN-861): %j', (text) => {
    expect(stueckeImBrowser(text)).toEqual(stuecke(text));
  });

  it.each([
    'Patient sagt, es zieht links. Beugung 100 Grad.\nWeiter mit Dehnung.',
    'Befund\nBeugung 110,5 Grad. Kein Erguss.\n\nPLAN:\nTreppe üben\n\nfrei danach, z. B. Brücke.',
    'Angaben der Patient:in\r\nSeit der 2. Behandlung besser.\r\n\r\nBefund unauffällig.',
    'Plan\nPlan\n  \nBehandlung :\nNur Text',
    '',
  ])('zerlegt getippten Text auf beiden Seiten gleich (ANN-861): %j', (text) => {
    expect(einheitenImBrowser(text, DIKTAT_ABSCHNITTE)).toEqual(einheiten(text, DIKTAT_ABSCHNITTE));
    expect(einheitenImBrowser(text, [])).toEqual(einheiten(text, []));
  });
});

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
import { einheiten as einheitenImBrowser } from '@/lib/ki/einheiten';
import { ORDNEN_HOECHSTZEICHEN, ZWECK_ORDNEN } from '@/lib/ki/ordnen';
import {
  UMFORMEN_HOECHSTZEICHEN,
  ZWECK_ALLTAGSSPRACHE,
  ZWECK_ENTWURF,
  stuecke as stueckeImBrowser,
} from '@/lib/ki/umformen';
import { einheiten, saetze } from './inhaltstreue.ts';
import { FEHLERKLASSEN } from './typen.ts';
import { stuecke } from './waechter.ts';
import {
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
    for (const zweck of [ZWECK_DIKTAT, ZWECK_ORDNEN, ZWECK_ENTWURF, ZWECK_ALLTAGSSPRACHE]) {
      expect(Object.keys(ZWECKE)).toContain(zweck);
    }
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

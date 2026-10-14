import { describe, expect, it } from 'vitest';
import {
  DIKTAT_ABSCHNITTE as ABSCHNITTE_IM_BROWSER,
  DIKTAT_HOECHSTBYTES,
  DIKTAT_HOECHSTDAUER_S,
  GATEWAY_FEHLERKLASSEN,
  KI_FEHLERTEXTE,
  ZWECK_DIKTAT,
} from '@/lib/ki/gateway';
import { FEHLERKLASSEN } from './typen.ts';
import { DIKTAT_ABSCHNITTE, HOECHST_BYTES, HOECHST_DAUER_S, ZWECKE } from './zwecke.ts';

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
    }
  });

  it('ordnet in dieselben Abschnitte ein (ANN-522)', () => {
    expect([...ABSCHNITTE_IM_BROWSER]).toEqual([...DIKTAT_ABSCHNITTE]);
  });

  it('hält dieselben Grenzen (ANN-523)', () => {
    expect(DIKTAT_HOECHSTBYTES).toBe(HOECHST_BYTES);
    expect(DIKTAT_HOECHSTDAUER_S).toBe(HOECHST_DAUER_S);
  });

  it('nennt einen Zweck, den der Gateway kennt', () => {
    expect(Object.keys(ZWECKE)).toContain(ZWECK_DIKTAT);
  });
});

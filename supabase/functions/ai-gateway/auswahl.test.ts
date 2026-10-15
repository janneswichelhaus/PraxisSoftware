import { describe, expect, it } from 'vitest';
import { umgebungsart as kartenumgebung } from '../location-provider/auswahl.ts';
import { richteEin, umgebungsart } from './auswahl.ts';

/**
 * Die Anbieterwahl (ANN-524): `AI_PROVIDER=mock` ist die Nachbildung, alles
 * andere „nicht eingerichtet" - nie stillschweigend die Nachbildung. In der
 * Produktion (auch ohne `APP_ENVIRONMENT`) ist die Nachbildung ausgeschlossen.
 */

describe('Anbieterwahl des Gateways', () => {
  it.each(['development', 'test', ' Development '])(
    'gibt die Nachbildung in der Umgebung %j frei',
    (umgebung) => {
      const { adapter, gateAbgewiesen } = richteEin({
        AI_PROVIDER: 'mock',
        APP_ENVIRONMENT: umgebung,
      });
      expect(adapter?.id).toBe('mock');
      expect(adapter?.quelle).toBe('nachbildung');
      expect(gateAbgewiesen).toBe(false);
    },
  );

  it.each([['production'], [undefined], [''], ['prod'], ['staging']])(
    'schließt die Nachbildung in der Produktion aus (APP_ENVIRONMENT %j)',
    (umgebung) => {
      expect(richteEin({ AI_PROVIDER: 'mock', APP_ENVIRONMENT: umgebung })).toEqual({
        adapter: null,
        gateAbgewiesen: true,
      });
    },
  );

  it.each([
    [undefined],
    [''],
    ['  '],
    ['openai'],
    ['whisper'],
    ['anbieter'],
    ['mock2'],
    ['m o c k'],
  ])('heißt mit AI_PROVIDER %j „nicht eingerichtet" und nie Nachbildung', (anbieter) => {
    expect(richteEin({ AI_PROVIDER: anbieter, APP_ENVIRONMENT: 'development' })).toEqual({
      adapter: null,
      gateAbgewiesen: false,
    });
  });

  it('liest die Umgebung wie der Kartendienst', () => {
    for (const wert of [undefined, '', 'development', 'test', 'production', 'TEST', 'x']) {
      expect(umgebungsart(wert)).toBe(kartenumgebung(wert));
    }
  });
});

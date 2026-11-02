import { describe, expect, it } from 'vitest';
import { umgebungsart as kartenumgebung } from '../location-provider/auswahl.ts';
import { umgebungsart, waehleTerminal } from './auswahl.ts';

// Grundsatz 5: nur die Nachbildung, nur außerhalb der Produktion; alles andere „nicht eingerichtet“.
describe('Wahl des Terminals', () => {
  it.each(['development', 'test', ' Test '])('gibt die Nachbildung in %j frei', (umgebung) => {
    const terminal = waehleTerminal({ CARD_TERMINAL_PROVIDER: 'mock', APP_ENVIRONMENT: umgebung });
    expect(terminal?.id).toBe('mock');
    expect(terminal?.quelle).toBe('nachbildung');
  });

  it.each([['production'], [undefined], [''], ['prod'], ['staging']])(
    'schließt die Nachbildung in der Produktion aus (APP_ENVIRONMENT %j)',
    (umgebung) => {
      expect(
        waehleTerminal({ CARD_TERMINAL_PROVIDER: 'mock', APP_ENVIRONMENT: umgebung }),
      ).toBeNull();
    },
  );

  it.each([[undefined], [''], ['sumup'], ['zettle'], ['mock2'], ['m o c k']])(
    'heißt mit CARD_TERMINAL_PROVIDER %j „nicht eingerichtet“, nie Nachbildung',
    (anbieter) => {
      expect(
        waehleTerminal({ CARD_TERMINAL_PROVIDER: anbieter, APP_ENVIRONMENT: 'development' }),
      ).toBeNull();
    },
  );

  it('liest die Umgebung wie der Kartendienst', () => {
    for (const wert of [undefined, '', 'development', 'test', 'production', 'TEST', 'x']) {
      expect(umgebungsart(wert)).toBe(kartenumgebung(wert));
    }
  });
});

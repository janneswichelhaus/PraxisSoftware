import { describe, expect, it } from 'vitest';
import { einmalCodeAusAdresse, traegtEinmalCode } from './linkEinloesen';

/**
 * Der Einmal-Code steht im Fragment und geht damit an keinen Server und in
 * kein Zugriffsprotokoll (ANN-043, Fassung 2). Ältere Links mit dem Code in
 * der Abfrage gelten weiter, bis sie ablaufen.
 */
describe('einmalCodeAusAdresse', () => {
  it('liest den Code aus dem Fragment', () => {
    expect(einmalCodeAusAdresse({ hash: '#token_hash=abc&type=recovery', search: '' })).toBe('abc');
  });

  it('nimmt einen älteren Link mit dem Code in der Abfrage noch an', () => {
    expect(einmalCodeAusAdresse({ hash: '', search: '?token_hash=alt&type=recovery' })).toBe('alt');
  });

  it('kennt ohne Code keinen', () => {
    expect(einmalCodeAusAdresse({ hash: '', search: '' })).toBeNull();
    expect(traegtEinmalCode({ hash: '#abschnitt', search: '?x=1' })).toBe(false);
  });
});

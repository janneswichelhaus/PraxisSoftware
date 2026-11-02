import { describe, expect, it } from 'vitest';
import { erstelleNachbildung } from './mock.ts';

describe('Nachbildung des Terminals', () => {
  const REFERENZ = '0b7d1c2e-3f4a-4b5c-8d6e-7f8091a2b3c4';

  it('nimmt an und nennt eine Kennung, die die Datenbank annimmt', async () => {
    const ergebnis = await erstelleNachbildung().kassiere({
      betragCent: 14000,
      waehrung: 'EUR',
      referenz: REFERENZ,
    });
    expect(ergebnis).toEqual({ status: 'angenommen', transaktion: `mock-${REFERENZ}` });
    // Dasselbe Muster wie payments_terminal_transaction_check.
    if (ergebnis.status === 'angenommen') {
      expect(ergebnis.transaktion).toMatch(/^[A-Za-z0-9._:-]{1,100}$/);
    }
  });

  it('lehnt einen auf 13 Cent endenden Betrag ab', async () => {
    expect(
      await erstelleNachbildung().kassiere({
        betragCent: 1213,
        waehrung: 'EUR',
        referenz: REFERENZ,
      }),
    ).toEqual({ status: 'abgelehnt' });
  });
});

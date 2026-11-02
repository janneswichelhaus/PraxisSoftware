import type { Terminaladapter } from './typen.ts';

// Die Nachbildung eines Terminals: nimmt jeden Betrag an, außer einem auf 13 Cent endenden, damit sich
// „abgelehnt“ ohne Karte prüfen lässt. Es fließt kein Geld; die Oberfläche sagt das dazu.
export function erstelleNachbildung(): Terminaladapter {
  return {
    id: 'mock',
    quelle: 'nachbildung',
    kassiere: ({ betragCent, referenz }) =>
      Promise.resolve(
        betragCent % 100 === 13
          ? { status: 'abgelehnt' }
          : { status: 'angenommen', transaktion: `mock-${referenz}` },
      ),
  };
}

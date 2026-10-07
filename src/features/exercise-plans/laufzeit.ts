/**
 * Wo ein zugewiesener Plan in seiner Laufzeit steht (UEB-005, UEB-007).
 *
 * Kalendertage als `YYYY-MM-DD` in der Zeitzone der Praxis; „heute" liefert
 * der Server. Ob die Wiedervorlage ansteht, entscheidet der Server
 * (`review_due`, ANN-302) - hier steht nur, was am Datum abzulesen ist.
 */
export type Laufzeitstand = 'laeuft' | 'laeuft_aus' | 'abgelaufen';

export function laufzeitStand(
  laeuftBis: string,
  heute: string,
  wiedervorlage = false,
): Laufzeitstand {
  if (laeuftBis < heute) return 'abgelaufen';
  return wiedervorlage ? 'laeuft_aus' : 'laeuft';
}

/**
 * Geldwerte anzeigen.
 *
 * Gerechnet und gespeichert wird in ganzen Cent (ADR-014: keine
 * Fließkommazahlen für Geldwerte); geteilt wird erst hier, an der Stelle, an
 * der die Zahl auf den Bildschirm geht. Die Währung steht an der
 * Katalogposition und ist heute überall Euro — die Formatierung nimmt sie
 * trotzdem entgegen, damit eine zweite Währung keine zweite Funktion braucht.
 */
export function formatEuro(cent: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cent / 100);
}

/**
 * Eingegebener Betrag als ganze Cent.
 *
 * Nimmt „45", „45,50" und „45.50" an. `null` heißt: keine gültige Zahl — die
 * aufrufende Stelle entscheidet, ob das ein Fehler ist. Gerundet wird
 * kaufmännisch auf ganze Cent, damit aus einer Eingabe nie ein Bruchteil
 * eines Cents entsteht.
 */
export function parseEuroZuCent(eingabe: string): number | null {
  const bereinigt = eingabe.trim().replace(/\s/g, '').replace(',', '.');
  // Verankert, die optionale Gruppe hat ein festes Endzeichen und eine feste
  // Laenge - das Muster laeuft linear und kann nicht rueckwaerts laufen.
  // eslint-disable-next-line security/detect-unsafe-regex
  const zahl = /^\d+(\.\d{1,2})?$/;
  if (bereinigt === '' || !zahl.test(bereinigt)) return null;
  return Math.round(Number(bereinigt) * 100);
}

/** Cent als Eingabewert, also „45,50" ohne Währungszeichen. */
export function centZuEingabe(cent: number): string {
  return (cent / 100).toFixed(2).replace('.', ',');
}

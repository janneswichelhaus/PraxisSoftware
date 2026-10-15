/** Die Zeilen eines Freitexts ohne Leerzeilen - die Schritte, die Fehler. */
export function zeilen(text: string | null): string[] {
  return (text ?? '')
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter(Boolean);
}

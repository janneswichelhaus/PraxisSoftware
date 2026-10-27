/** „0:07" aus Sekunden - die Zeitmarke einer Antwort (ADR-017 Punkt 68, ANN-338). */
export function zeitmarke(sekunden: number): string {
  const s = Math.max(0, Math.round(sekunden));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Kleine Hilfen für Foto und Video an der Rückfrage (KOM-007), getrennt von
 * den Komponenten in `Anhaenge.tsx`.
 */

/** „0:07" aus Sekunden. */
export function zeitmarke(sekunden: number): string {
  const s = Math.max(0, Math.round(sekunden));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Was im Bild sein soll - am Kamera- und am Videodialog (Punkte 35, 62). */
export const AUFNAHMEHINWEIS =
  'Bitte nur zeigen, worum es in Ihrer Frage geht. Ihr Gesicht nur, wenn es dazugehört, und keine anderen Personen.';

/** Was eine geöffnete Aufnahme ist: welcher Anhang, ab welcher Sekunde. */
export interface Ansicht {
  anhangId: string;
  ab: number;
}

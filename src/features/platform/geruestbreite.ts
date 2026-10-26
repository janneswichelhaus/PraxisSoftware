import { useSyncExternalStore } from 'react';

/**
 * Ab dieser Fensterbreite hat die Plattform ihre Rechneransicht: Navigation im Kopf, keine
 * Reiterleiste, der Inhalt bis `max-w-inhalt`. Tailwinds `lg`, 64rem - wer im Browser eine größere
 * Schrift eingestellt hat, behält länger die Ansicht des Telefons, wie unter 23rem.
 */
export const RECHNER_ABFRAGE = '(min-width: 64rem)';

const ABFRAGE = RECHNER_ABFRAGE;

function abonnieren(melden: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const abfrage = window.matchMedia(ABFRAGE);
  abfrage.addEventListener('change', melden);
  return () => abfrage.removeEventListener('change', melden);
}

/** Ohne `matchMedia` (jsdom) gilt das Telefon - der Maßstab der Plattform. */
function rechnerJetzt(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(ABFRAGE).matches;
}

/** Ist das Fenster so breit wie ein Rechner? Folgt jeder Änderung der Breite. */
export function useRechner(): boolean {
  return useSyncExternalStore(abonnieren, rechnerJetzt, () => false);
}

/**
 * Die Spalte des Gerüsts für Kopf, Bänder und Inhalt: am Telefon
 * `max-w-formular` mit 20 px Rand, unter 23rem (200 %) 12 px, am Rechner
 * `max-w-inhalt` mit 40 px (Handoff Abschnitt 4). So stehen Marke, Bereich,
 * Bänder und Seitentitel an derselben Kante.
 */
export function geruestSpalte(rechner: boolean): string {
  // Im Druck füllt der Inhalt das Papier, gleich auf welchem Gerät gedruckt
  // wird: Am Telefon hätte die Spalte das Planblatt auf 36rem begrenzt
  // (Design-Review 2d, H2).
  return rechner
    ? 'max-w-inhalt mx-auto px-10 print:max-w-none'
    : 'max-w-formular mx-auto px-5 max-[23rem]:px-3 print:max-w-none';
}

/**
 * Stufe 1 oder 2 der Reiterleiste (ANN-679): Passen die vier Wörter
 * nebeneinander hinein? `benoetigt` ist die Breite der Messreihe - alle
 * Wörter in 700 mit dem kleinsten Abstand -, `verfuegbar` die der Leiste.
 * Ein halbes Pixel Rundung zählt noch als passend.
 */
export function reiterstufe(benoetigt: number, verfuegbar: number): 1 | 2 {
  return benoetigt <= verfuegbar + 0.5 ? 1 : 2;
}

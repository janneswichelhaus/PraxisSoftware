import { useSyncExternalStore } from 'react';

/**
 * Ab dieser Fensterbreite hat die Plattform ihre Rechneransicht (Handoff
 * 2026-10-22, Abschnitt 4; DR-113): Navigation im Kopf, keine Reiterleiste,
 * der Inhalt bis `max-w-inhalt`. Tailwinds `lg`, 64rem - bei der
 * Standardschrift 1024 px; wer im Browser eine größere Schrift eingestellt
 * hat, behält länger die Ansicht des Telefons, wie unter 23rem.
 *
 * Gefragt wird im Code, nicht mit `lg:` an den Klassen: Die Einsicht der
 * Praxis (E-001) zeigt dasselbe Gerüst am breiten Bildschirm in einem
 * Telefon von 390 px - dort gälte `lg:` nach der Breite des Fensters, und im
 * Telefon stünde die Navigation des Rechners. Die Einsicht bekommt deshalb
 * immer die Ansicht des Telefons (`PlattformApp`).
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
  return rechner ? 'max-w-inhalt mx-auto px-10' : 'max-w-formular mx-auto px-5 max-[23rem]:px-3';
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

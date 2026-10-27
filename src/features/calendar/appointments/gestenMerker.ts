/**
 * Der Merker des Gesten-Hinweises im Kalender (Runde 3, Handoff Kalender und
 * Tour 2026-10-06; ANN-255).
 *
 * „Zweites Feld antippen: Spanne bis dorthin" steht, bis zum ersten Mal eine
 * Spanne aufgezogen wurde; danach ist die Geste bekannt, und die Zeile kostet
 * am Handy nur Höhe über dem Raster.
 *
 * `localStorage` statt `sessionStorage`: Gelernt ist gelernt, auch im nächsten
 * Tab. Ein Wahrheitswert, kein Inhalt - nichts über Person, Praxis oder Akte
 * (ANN-019 bleibt gewahrt). Ohne Speicher gilt „noch nicht gelernt", und der
 * Fehler bleibt still: Ein Hinweis zu viel ist kein Schaden.
 */
export const GESTEN_MERKER = 'kalender-spanne-gelernt';

function speicher(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Hat diese Person auf diesem Gerät schon eine Spanne aufgezogen? */
export function spanneGelernt(): boolean {
  try {
    return speicher()?.getItem(GESTEN_MERKER) === '1';
  } catch {
    return false;
  }
}

/** Nach der ersten fertigen Spanne. */
export function spanneMerken(): void {
  try {
    speicher()?.setItem(GESTEN_MERKER, '1');
  } catch {
    // Kein Speicher - dann steht der Hinweis eben weiter.
  }
}

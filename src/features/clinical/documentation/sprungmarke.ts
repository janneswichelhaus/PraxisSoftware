import { useEffect, type RefObject } from 'react';

/**
 * Sprungmarke der Übungspläne im Reiter „Doku" der Akte (Praxis-Review R2,
 * P5): „Plan mitgeben →" in „Danach" führt hierher. Am Telefon stehen die
 * Pläne rund 1750 px tief - unter Befund und Dokumentation. Eine eigene
 * Adresse zum Anlegen eines Plans gibt es nicht; er entsteht dort mit einem
 * Tipp.
 */
export const PLAENE_ANKER = 'uebungsplaene';

/** Wie lange der Blick der Sprungmarke folgt, solange niemand selbst rollt. */
export const SPRUNG_FOLGEN_MS = 8000;

/** Was zeigt, dass die Person selbst rollt oder tippt - dann folgt der Blick nicht mehr. */
const EIGENE_EINGABEN = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Rollt zur Sprungmarke `anker`, wenn die Adresse sie trägt (`fragment`, etwa
 * `location.hash`). Der Router rollt nicht von selbst zum Anker, und die
 * Abschnitte darüber laden einzeln nach - jede fertige Liste schöbe das Ziel
 * wieder aus dem Bild. Der Blick folgt deshalb jeder Größenänderung von
 * `raster`, bis die Person selbst rollt, tippt oder eine Taste drückt,
 * höchstens `SPRUNG_FOLGEN_MS` lang. Kein Serveraufruf.
 */
export function useSprungmarke(
  anker: string,
  fragment: string,
  raster: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (fragment !== `#${anker}`) return;
    const ziel = () => document.getElementById(anker)?.scrollIntoView?.({ block: 'start' });
    const beobachter = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(ziel);
    let frist = 0;
    function ende() {
      beobachter?.disconnect();
      window.clearTimeout(frist);
      for (const art of EIGENE_EINGABEN) window.removeEventListener(art, ende);
    }
    ziel();
    if (raster.current) beobachter?.observe(raster.current);
    for (const art of EIGENE_EINGABEN) window.addEventListener(art, ende, { passive: true });
    frist = window.setTimeout(ende, SPRUNG_FOLGEN_MS);
    return ende;
  }, [anker, fragment, raster]);
}

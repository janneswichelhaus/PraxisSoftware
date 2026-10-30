import { useRef } from 'react';

/** So lange nach dem Wählen gilt ein zweiter Tipp auf dieselbe Wahl als Doppeltipp. */
export const DOPPELTIPP_MS = 500;

/**
 * Ein zweiter Tipp auf eine eben gewählte Stufe oder Fläche nimmt nicht zurück: Zittrig doppelt
 * getippt, ginge die Antwort sonst unbemerkt verloren (ANN-787). Später nimmt er zurück wie bisher.
 */
export function useDoppeltipp() {
  const zuletzt = useRef<{ schluessel: string; zeit: number } | null>(null);
  return {
    gewaehlt(schluessel: string) {
      zuletzt.current = { schluessel, zeit: Date.now() };
    },
    zuFrueh(schluessel: string) {
      const z = zuletzt.current;
      return z !== null && z.schluessel === schluessel && Date.now() - z.zeit < DOPPELTIPP_MS;
    },
  };
}

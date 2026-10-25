import { createContext, useContext } from 'react';

/** Kennung und Titel eines Vollbild-Fensters mit `titelImInhalt` (`Dialogfenster`). */
export const TitelKontext = createContext<{ id: string; titel: string } | null>(null);

/**
 * Die Kennung, nach der ein Vollbild-Fenster mit `titelImInhalt` heißt - für
 * eine Überschrift, die ein anderer Baustein zeichnet, etwa der Name einer
 * Übung auf der `Buehne`. Außerhalb eines solchen Fensters `undefined`.
 */
export function useFenstertitelId(): string | undefined {
  return useContext(TitelKontext)?.id;
}

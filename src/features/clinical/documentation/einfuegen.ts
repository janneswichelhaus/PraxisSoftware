import { useEffect, useState } from 'react';
import { bausteinEinfuegen } from './textbausteine';

/**
 * Einfügen mit sichtbarem Ergebnis (DOK-10).
 *
 * Ein Tipp auf einen Textbaustein - oder „In den Text übernehmen" aus dem
 * Bausteinfeld - hängt den Text ans Ende des Feldes. Stand dort schon mehr,
 * als das Feld zeigt, geschah scheinbar nichts: kein Scrollen, keine Meldung.
 * Wer dann ein zweites Mal tippte, hatte den Baustein doppelt im Eintrag, und
 * so ging er in die Akte. Das Rückgängig der Tastatur hilft dabei nicht
 * verlässlich, weil der Wert aus React gesetzt wird.
 *
 * Deshalb hier: das Feld ans Ende scrollen - **ohne** Fokus, sonst öffnet am
 * Handy die Tastatur und verdeckt die Seite -, eine Meldung darunter und ein
 * eigenes „Rückgängig", das den Stand vor dem Einfügen wiederherstellt. Es
 * gilt nur, bis weitergetippt wird: Danach wäre „vorher" nicht mehr, was die
 * Person zurückhaben will.
 *
 * Nichts davon speichert etwas. Der Text bleibt ungespeichert im Feld, und
 * der Textverlustschutz sieht ihn wie jeden getippten.
 */

/** Was zuletzt eingefügt wurde. */
export interface Einfuegung {
  /** Wie der Baustein heißt - „Manuelle Therapie" oder „Befund aus Bausteinen". */
  titel: string;
  /** Der Feldinhalt vor dem Einfügen; „Rückgängig" stellt ihn wieder her. */
  vorher: string;
  /** Der Feldinhalt direkt nach dem Einfügen. */
  nachher: string;
}

export interface Einfuegen {
  /** Die letzte Einfügung, solange seitdem nicht weitergetippt wurde. */
  letzte: Einfuegung | null;
  /** Hängt `text` an `vorher` an, setzt das Feld und merkt sich beides. */
  einfuegen: (titel: string, vorher: string, text: string) => void;
  /** Stellt den Stand vor der letzten Einfügung wieder her. */
  rueckgaengig: () => void;
  /** Vergisst die Einfügung - beim Weitertippen. */
  vergessen: () => void;
}

/**
 * @param feldId Kennung des Textfeldes (`TextArea` mit `feldId`), das nach
 *   dem Einfügen ans Ende scrollt.
 * @param setzen Setzt den Feldinhalt der Seite.
 */
export function useEinfuegen(feldId: string, setzen: (wert: string) => void): Einfuegen {
  const [letzte, setLetzte] = useState<Einfuegung | null>(null);

  useEffect(() => {
    if (!letzte) return;
    // Nach dem Zeichnen, damit die neue Höhe schon gilt. Kein `focus()`:
    // am Telefon öffnete das die Tastatur über der halben Seite.
    const feld = document.getElementById(feldId);
    if (feld) feld.scrollTop = feld.scrollHeight;
  }, [letzte, feldId]);

  return {
    letzte,
    einfuegen(titel, vorher, text) {
      const nachher = bausteinEinfuegen(vorher, text);
      setzen(nachher);
      setLetzte({ titel, vorher, nachher });
    },
    rueckgaengig() {
      if (!letzte) return;
      setzen(letzte.vorher);
      setLetzte(null);
    },
    vergessen() {
      setLetzte(null);
    },
  };
}

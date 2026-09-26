import { useCallback, useMemo, useState } from 'react';
import { bibliothek } from './bibliothek';
import { dokumentationstext, type Angabe, type Auswahl } from './dokumentationstext';
import type { BausteinRegion } from './schema';

/** Was eine Dokumentationsseite vom Bausteinfeld hält. */
export interface BausteinAuswahl {
  regionen: readonly BausteinRegion[];
  auswahl: Auswahl;
  /** Stabil über die Lebensdauer der Seite (`memo` der Zeilen). */
  setzen: (kennung: string, angabe: Angabe | undefined) => void;
  leeren: () => void;
  /** Der Vorschlag aus der Auswahl; leer, solange nichts angegeben ist. */
  text: string;
}

/**
 * Die abgehakten Bausteine einer Dokumentationsseite (FRB-003b).
 *
 * Der Zustand liegt bei der Seite und nicht im Feld: Nur sie weiß, wann der
 * Vorschlag im Entwurf angekommen ist, und nur sie kann den Textverlustschutz
 * fragen lassen, solange er es nicht ist (`PROJECT_PRINCIPLES.md` §13).
 * Gespeichert wird die Auswahl nirgends (ANN-120).
 */
export function useBausteinAuswahl(
  regionen: readonly BausteinRegion[] = bibliothek.bausteine,
): BausteinAuswahl {
  const [auswahl, setAuswahl] = useState<Auswahl>({});

  const setzen = useCallback((kennung: string, angabe: Angabe | undefined) => {
    setAuswahl((bisher) => {
      const neu = { ...bisher };
      if (angabe === undefined) delete neu[kennung];
      else neu[kennung] = angabe;
      return neu;
    });
  }, []);

  const leeren = useCallback(() => setAuswahl({}), []);
  const text = useMemo(() => dokumentationstext(regionen, auswahl), [regionen, auswahl]);

  return { regionen, auswahl, setzen, leeren, text };
}

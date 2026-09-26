import { useCallback, useMemo, useState } from 'react';
import { bibliothek } from './bibliothek';
import {
  dokumentationstext,
  seiteUmstellen,
  type Angabe,
  type Auswahl,
  type Regionsseite,
  type Seitenwahl,
} from './dokumentationstext';
import type { BausteinRegion } from './schema';

/** Was eine Dokumentationsseite vom Bausteinfeld hält. */
export interface BausteinAuswahl {
  regionen: readonly BausteinRegion[];
  auswahl: Auswahl;
  /** Die Seite je Region, wo die Region eine hat (ANN-129). */
  seitenwahl: Seitenwahl;
  /** Stabil über die Lebensdauer der Seite (`memo` der Zeilen). */
  setzen: (schluessel: string, angabe: Angabe | undefined) => void;
  seiteWaehlen: (region: BausteinRegion, seite: Regionsseite) => void;
  leeren: () => void;
  /** Der Vorschlag aus der Auswahl; leer, solange nichts angegeben ist. */
  text: string;
}

interface Zustand {
  auswahl: Auswahl;
  seitenwahl: Seitenwahl;
}

const LEER: Zustand = { auswahl: {}, seitenwahl: {} };

/**
 * Die abgehakten Bausteine einer Dokumentationsseite (FRB-003b).
 *
 * Der Zustand liegt bei der Seite und nicht im Feld: Nur sie weiß, wann der
 * Vorschlag im Entwurf angekommen ist, und nur sie kann den Textverlustschutz
 * fragen lassen, solange er es nicht ist (`PROJECT_PRINCIPLES.md` §13).
 * Gespeichert wird die Auswahl nirgends (ANN-120). Auswahl und Seitenwahl
 * stehen in einem Zustand, weil ein Seitenwechsel beide zugleich ändert.
 */
export function useBausteinAuswahl(
  regionen: readonly BausteinRegion[] = bibliothek.bausteine,
): BausteinAuswahl {
  const [{ auswahl, seitenwahl }, setZustand] = useState<Zustand>(LEER);

  const setzen = useCallback((schluessel: string, angabe: Angabe | undefined) => {
    setZustand((bisher) => {
      const neu = { ...bisher.auswahl };
      if (angabe === undefined) delete neu[schluessel];
      else neu[schluessel] = angabe;
      return { ...bisher, auswahl: neu };
    });
  }, []);

  const seiteWaehlen = useCallback((region: BausteinRegion, seite: Regionsseite) => {
    setZustand((bisher) => ({
      auswahl: seiteUmstellen(region, bisher.auswahl, bisher.seitenwahl[region.id], seite),
      seitenwahl: { ...bisher.seitenwahl, [region.id]: seite },
    }));
  }, []);

  const leeren = useCallback(() => setZustand(LEER), []);
  const text = useMemo(
    () => dokumentationstext(regionen, auswahl, seitenwahl),
    [regionen, auswahl, seitenwahl],
  );

  return { regionen, auswahl, seitenwahl, setzen, seiteWaehlen, leeren, text };
}

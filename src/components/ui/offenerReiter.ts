import { useSearchParams } from 'react-router-dom';

/** Ein Reiter der `Suchreiterleiste`: sein Wert im Suchteil und seine Beschriftung. */
export interface Suchreiter<W extends string> {
  wert: W;
  label: string;
}

/**
 * Der offene Reiter steht im Suchteil der Adresse (`?bereich=zugang`); ohne
 * oder mit unbekanntem Wert gilt der erste. So bleibt die Route des Objekts
 * dieselbe, und „Zurück" im Browser führt in den vorigen Reiter.
 *
 * Festlegung: ANN-460 (Reiter und Detail ohne eigene Route im Suchparameter).
 *
 * Eigene Datei neben `Reiterleiste.tsx`, damit dort nur Komponenten stehen
 * (schnelles Neuladen).
 */
export function useOffenerReiter<W extends string>(param: string, werte: readonly W[]): W {
  const [suche] = useSearchParams();
  const wert = suche.get(param);
  return werte.find((eintrag) => eintrag === wert) ?? (werte[0] as W);
}

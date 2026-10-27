import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  VorschauContext,
  type Protokolleintrag,
  type Simulation,
  type Vorschauzustand,
} from './vorschauContext';
import { erzeugeVorschauzustand, vorschauId } from './vorschauZustand';

/**
 * Haelt den Zustand des Vorschaugeruests.
 *
 * Dieses Modul spricht bewusst NICHT mit Supabase. Die Trennung ist die
 * eigentliche Zusicherung dieses Bereichs: Aus einer Vorschauaktion kann
 * technisch keine echte Speicherung, Genehmigung, Nachricht oder Zahlung
 * entstehen. Ein Test in `trennung.test.ts` prueft das ueber den Quelltext.
 */
export function VorschauProvider({ children }: { children: ReactNode }) {
  const [zustand, setZustand] = useState<Vorschauzustand>(() => erzeugeVorschauzustand());
  const [protokoll, setProtokoll] = useState<Protokolleintrag[]>([]);

  const simuliere = useCallback(
    (simulation: Simulation, aenderung?: (zustand: Vorschauzustand) => Vorschauzustand) => {
      const eintrag: Protokolleintrag = {
        id: vorschauId('protokoll'),
        zeitpunkt: new Date().toISOString(),
        bereich: simulation.bereich,
        vorgang: simulation.vorgang,
        folgen: simulation.folgen ?? [],
        nichtGeschehen: simulation.nichtGeschehen ?? [],
      };
      if (aenderung) setZustand((aktuell) => aenderung(aktuell));
      setProtokoll((bisher) => [eintrag, ...bisher].slice(0, 50));
      return eintrag;
    },
    [],
  );

  const zuruecksetzen = useCallback(() => {
    setZustand(erzeugeVorschauzustand());
    setProtokoll([]);
  }, []);

  const wert = useMemo(
    () => ({ zustand, protokoll, simuliere, zuruecksetzen }),
    [zustand, protokoll, simuliere, zuruecksetzen],
  );

  return <VorschauContext value={wert}>{children}</VorschauContext>;
}

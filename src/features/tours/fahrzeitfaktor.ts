import { useCallback } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { Coordinate } from '@/lib/location/contract';
import { matrixAbfrage, matrixZulaessig, type Matrixergebnis } from '@/lib/location/matrix';
import { routenAbfrage, type Routenergebnis } from '@/lib/location/route';
import { fetchFahrzeitfaktor } from './fahrzeitfaktor-api';
import { PRAXISPROFIL } from './tagesroute';

// -----------------------------------------------------------------------------
// Fahrzeitfaktor der Praxis (UBK-010, ANN-237)
//
// Der Kartendienst rechnet mit dem Lastenradprofil praktisch mit festen
// ~23 km/h; im Alltag fährt die Praxis eher 15 km/h. Jede Fahrzeit, die die
// Anwendung zeigt oder prüfen lässt, entsteht deshalb hier aus der Antwort
// des Kartendienstes: mal Faktor, auf ganze Sekunden gerundet. Diese Datei
// ist die **eine Stelle**; der Fachcode fragt Route und Matrix nur über die
// Hooks unten an (`fahrzeitfaktor.test.ts` hält das am Quelltext fest).
//
// Gespeichert wird wie bisher nichts (ADR-019 Punkt 16): Im Zwischenspeicher
// liegt die Antwort des Kartendienstes, der Faktor wirkt beim Lesen. Ändert
// owner den Faktor, gilt er beim nächsten Rendern, ohne neuen Abruf.
// -----------------------------------------------------------------------------

/** Die Voreinstellung der Datenbank (Entscheidung Jannes, 2026-10-05). */
export const FAHRZEITFAKTOR_VOREINSTELLUNG = 1.5;

/** Die wählbaren Werte: 1,0 bis 2,5 in Schritten von 0,1. */
export const FAHRZEITFAKTOR_WERTE: readonly number[] = Array.from(
  { length: 16 },
  (_, i) => Math.round((1 + i / 10) * 10) / 10,
);

/**
 * ANN-237: Aus einer Fahrzeit des Kartendienstes wird die Fahrzeit, mit der
 * die Praxis plant. **Die eine Stelle**, an der der Faktor greift — vor
 * Anzeige (Tour, Übersicht, Kalender), vor `check_travel_buffers` und
 * `rate_slot_travel`, vor der Auskunft „Passt es?“ und dem Lückenfinder.
 */
export function planungsfahrzeit(sekunden: number, faktor: number): number {
  return Math.round(sekunden * faktor);
}

/** Die Route mit Planungsfahrzeiten; Strecke und Linie bleiben, wie sie sind. */
export function planungsroute(antwort: Routenergebnis, faktor: number): Routenergebnis {
  if (!antwort.ok) return antwort;
  const route = antwort.value.route;
  return {
    ok: true,
    value: {
      ...antwort.value,
      route: {
        ...route,
        durationSeconds: planungsfahrzeit(route.durationSeconds, faktor),
        legs: route.legs.map((leg) => ({
          ...leg,
          durationSeconds: planungsfahrzeit(leg.durationSeconds, faktor),
        })),
      },
    },
  };
}

/** Die Matrix mit Planungsfahrzeiten; eine fehlende Fahrzeit bleibt `null`. */
export function planungsmatrix(antwort: Matrixergebnis, faktor: number): Matrixergebnis {
  if (!antwort.ok) return antwort;
  const matrix = antwort.value.matrix;
  return {
    ok: true,
    value: {
      ...antwort.value,
      matrix: {
        ...matrix,
        durationsSeconds: matrix.durationsSeconds.map((zeile) =>
          zeile.map((sekunden) => (sekunden === null ? null : planungsfahrzeit(sekunden, faktor))),
        ),
      },
    },
  };
}

// -----------------------------------------------------------------------------
// Der Faktor der Praxis
// -----------------------------------------------------------------------------

export const FAHRZEITFAKTOR_SCHLUESSEL = ['travel-time-factor'] as const;

/**
 * Der Faktor der Praxis — `null`, solange er lädt.
 *
 * ANN-237: Lässt er sich nicht lesen, gilt die Voreinstellung 1,5 und nie
 * 1,0. Ohne Faktor ganz auf Fahrzeiten zu verzichten, nähme der Praxis die
 * Auskunft wegen eines Planungszuschlags; ohne Zuschlag zu rechnen, zeigte
 * zu kurze Wege.
 */
export function useFahrzeitfaktor(): number | null {
  const abfrage = useQuery({
    queryKey: FAHRZEITFAKTOR_SCHLUESSEL,
    queryFn: fetchFahrzeitfaktor,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  if (abfrage.data !== undefined) return abfrage.data;
  return abfrage.isError ? FAHRZEITFAKTOR_VOREINSTELLUNG : null;
}

// -----------------------------------------------------------------------------
// Route und Matrix mit Planungsfahrzeiten
//
// Die Abfrage selbst ist dieselbe wie ohne Faktor (Schlüssel, Lebensdauer):
// Der Zwischenspeicher hält die Antwort des Kartendienstes, `select` wendet
// den Faktor beim Lesen an. Bis der Faktor feststeht, geht nichts hinaus -
// sonst stünde kurz eine Zeit ohne Zuschlag da und eine Prüfung liefe zweimal.
// -----------------------------------------------------------------------------

export function usePlanungsroute(
  punkte: readonly Coordinate[],
  { aktiv = true }: { aktiv?: boolean } = {},
) {
  const faktor = useFahrzeitfaktor();
  const auswahl = useCallback(
    (antwort: Routenergebnis) => planungsroute(antwort, faktor ?? FAHRZEITFAKTOR_VOREINSTELLUNG),
    [faktor],
  );
  return useQuery({
    ...routenAbfrage(punkte, PRAXISPROFIL),
    enabled: aktiv && faktor !== null && punkte.length >= 2,
    select: auswahl,
  });
}

/** Mehrere Routen auf einmal (Kalender, je Spalte eine Folge von Wegpunkten). */
export function usePlanungsrouten(folgen: readonly (readonly Coordinate[])[]) {
  const faktor = useFahrzeitfaktor();
  const auswahl = useCallback(
    (antwort: Routenergebnis) => planungsroute(antwort, faktor ?? FAHRZEITFAKTOR_VOREINSTELLUNG),
    [faktor],
  );
  return useQueries({
    queries: folgen.map((punkte) => ({
      ...routenAbfrage(punkte, PRAXISPROFIL),
      enabled: faktor !== null && punkte.length >= 2,
      select: auswahl,
    })),
  });
}

export function usePlanungsmatrix(
  origins: readonly Coordinate[],
  destinations: readonly Coordinate[],
  { aktiv = true }: { aktiv?: boolean } = {},
) {
  const faktor = useFahrzeitfaktor();
  const auswahl = useCallback(
    (antwort: Matrixergebnis) => planungsmatrix(antwort, faktor ?? FAHRZEITFAKTOR_VOREINSTELLUNG),
    [faktor],
  );
  return useQuery({
    ...matrixAbfrage(origins, destinations, PRAXISPROFIL),
    enabled: aktiv && faktor !== null && matrixZulaessig(origins, destinations),
    select: auswahl,
  });
}

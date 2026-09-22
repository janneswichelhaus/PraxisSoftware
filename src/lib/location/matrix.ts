/**
 * Die Fahrzeitmatrix aus der eigenen Function — der Client-Teil von MAP-004.
 *
 * Der Weg dorthin steht in `funktion.ts`; hier steht nur, was die Matrix von
 * der Route unterscheidet: ihr Anfragekörper, die Prüfung ihres Ergebnisses
 * und die Obergrenze, unter der sie überhaupt losgeschickt wird.
 *
 * Wie die Route wird die Matrix **nicht abgelegt**: Sie wird im Moment der
 * Planung abgerufen, angezeigt und verworfen (ADR-019 Punkt 16). Aus ihr
 * entsteht keine Statistik und keine Auswertung je Person (§20, B6) — die
 * Erreichbarkeit ist eine Warnung im Augenblick, kein Maß über jemanden.
 *
 * Diese Datei liegt wie `route.ts` in `src/lib/location/` und nicht im
 * Kartenprototyp: Ein Vorschaubereich spricht nicht selbst mit einem Server
 * (`src/features/preview/trennung.test.ts`). Sie ist dort namentlich für den
 * Prototyp freigegeben — und nur für ihn.
 */

import { useQuery } from '@tanstack/react-query';
import type { Coordinate, LocationError, MatrixResult, TravelProfile } from './contract';
import { rufeFunktionAuf, type Quelle } from './funktion';

/**
 * Höchstzahl der Punkte je Seite einer Matrix — **ANN-091**.
 *
 * Diese Zahl ist **unsere** und nicht die des Anbieters: Wie viele Relationen
 * eine Matrix-Anfrage tragen darf, hat PTV auf die Supportanfrage vom
 * 2026-09-21 nicht beantwortet (ADR-019, „Offene Folgefragen"). Ohne Grenze
 * löste ein einziger Aufruf beliebig viele Relationen aus — bezahlt werden
 * sie je Relation, und das Kontingent des Free-Abos ist klein.
 *
 * Genommen ist die Zahl des Nachbarn: Die Routing OSM API trägt 25 Wegpunkte
 * (Providerprüfung, Teil 1, Punkt 3), und mehr als 25 Stopps hat kein Tag
 * dieser Praxis. Fällt die Antwort des Supports anders aus, ändert sich diese
 * Konstante und die Kopie in `supabase/functions/location-provider/typen.ts`,
 * die `typen.test.ts` daran bindet — sonst nichts.
 */
export const MAX_MATRIX_PUNKTE = 25;

export interface Matrixantwort {
  readonly matrix: MatrixResult;
  readonly quelle: Quelle;
}

/** Wie im Vertrag: kein Werfen, der Fehlerpfad steht im Typ. */
export type Matrixergebnis =
  | { readonly ok: true; readonly value: Matrixantwort }
  | { readonly ok: false; readonly error: LocationError };

/** Ein Aufruf der Function für eine Matrix. Nur Koordinaten und Profil gehen hinaus. */
export async function fordereMatrixAn(
  origins: readonly Coordinate[],
  destinations: readonly Coordinate[],
  profile: TravelProfile,
  signal?: AbortSignal,
): Promise<Matrixergebnis> {
  const antwort = await rufeFunktionAuf(
    'matrix',
    { origins, destinations, profile },
    istMatrix,
    signal,
  );
  return antwort.ok
    ? { ok: true, value: { matrix: antwort.value, quelle: antwort.quelle } }
    : antwort;
}

/**
 * Die Fahrzeiten zwischen mehreren Stopps (MAP-004a).
 *
 * `staleTime: Infinity` hält das Ergebnis für die Sitzung, wie bei der Route:
 * Dieselben Punkte ergeben dieselbe Matrix, und jeder erneute Abruf kostet
 * beim Anbieter — bei einer Matrix je Relation. `gcTime` bleibt kurz, damit
 * nichts länger im Speicher steht als nötig.
 *
 * Die Abfrage startet gar nicht erst, wenn die Grenze aus ANN-091 überschritten
 * ist: Die Function wiese sie ab, und der Aufruf wäre umsonst. Die Prüfung
 * dort bleibt die verbindliche — eine Grenze im Browser ist keine Kontrolle.
 */
export function useMatrix(
  origins: readonly Coordinate[],
  destinations: readonly Coordinate[],
  profile: TravelProfile,
  { aktiv = true }: { aktiv?: boolean } = {},
) {
  return useQuery({
    queryKey: ['matrix', profile, origins, destinations],
    queryFn: ({ signal }) => fordereMatrixAn(origins, destinations, profile, signal),
    enabled:
      aktiv &&
      origins.length > 0 &&
      destinations.length > 0 &&
      origins.length <= MAX_MATRIX_PUNKTE &&
      destinations.length <= MAX_MATRIX_PUNKTE,
    staleTime: Infinity,
    gcTime: 30_000,
    retry: false,
  });
}

/**
 * Ist das eine Matrix?
 *
 * Geprüft wird die Form, nicht nur das Vorhandensein: Eine Zeile, die keine
 * Liste ist, stünde in der Tabelle als leere Zeile — und eine leere Zeile
 * sieht aus wie „keine Fahrzeit" und nicht wie „kaputte Antwort".
 */
function istMatrix(wert: unknown): wert is MatrixResult {
  if (typeof wert !== 'object' || wert === null) return false;
  const zeilen = (wert as Record<string, unknown>)['durationsSeconds'];
  return Array.isArray(zeilen) && zeilen.every((zeile) => Array.isArray(zeile));
}

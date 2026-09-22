/**
 * Die Route aus der eigenen Function — der Client-Teil von MAP-003.
 *
 * Der Weg dorthin, die Fehlerklassen und die Regel, wer über den Kartendienst
 * sprechen darf, stehen in `funktion.ts`; hier steht nur, was die Route davon
 * unterscheidet: ihr Anfragekörper und die Prüfung ihres Ergebnisses.
 *
 * Diese Datei liegt in `src/lib/location/` und nicht im Kartenprototyp: Ein
 * Vorschaubereich spricht nicht selbst mit einem Server
 * (`src/features/preview/trennung.test.ts`). Sie ist dort namentlich für den
 * Prototyp freigegeben — und nur für ihn.
 */

import { useQuery } from '@tanstack/react-query';
import type { Coordinate, LocationError, RouteResult, TravelProfile } from './contract';
import { rufeFunktionAuf, type Quelle } from './funktion';

/** Woher die angezeigte Route stammt. */
export type Routenquelle = Quelle;

export interface Routenantwort {
  readonly route: RouteResult;
  readonly quelle: Routenquelle;
}

/** Wie im Vertrag: kein Werfen, der Fehlerpfad steht im Typ. */
export type Routenergebnis =
  | { readonly ok: true; readonly value: Routenantwort }
  | { readonly ok: false; readonly error: LocationError };

/** Ein Aufruf der Function für eine Route. Nur Koordinaten und Profil gehen hinaus. */
export async function fordereRouteAn(
  waypoints: readonly Coordinate[],
  profile: TravelProfile,
  signal?: AbortSignal,
): Promise<Routenergebnis> {
  const antwort = await rufeFunktionAuf('route', { waypoints, profile }, istRoute, signal);
  return antwort.ok
    ? { ok: true, value: { route: antwort.value, quelle: antwort.quelle } }
    : antwort;
}

/**
 * Die Route zu einer Folge von Stopps (MAP-003b).
 *
 * `staleTime: Infinity` hält das Ergebnis für die Sitzung: Dieselben Stopps
 * ergeben dieselbe Route, und jeder erneute Abruf kostet Geld beim Anbieter.
 * `gcTime` ist kurz, damit nichts länger im Speicher steht als nötig — wer
 * die Seite verlässt, lässt nichts zurück.
 */
export function useRoute(
  waypoints: readonly Coordinate[],
  profile: TravelProfile,
  { aktiv = true }: { aktiv?: boolean } = {},
) {
  return useQuery({
    queryKey: ['route', profile, waypoints],
    queryFn: ({ signal }) => fordereRouteAn(waypoints, profile, signal),
    enabled: aktiv && waypoints.length >= 2,
    staleTime: Infinity,
    gcTime: 30_000,
    retry: false,
  });
}

/**
 * Ist das eine Route?
 *
 * Geprüft wird Feld für Feld: Eine Linie ohne Distanz sähe auf der Karte
 * richtig aus, und genau deshalb darf sie hier nicht durchkommen.
 */
function istRoute(wert: unknown): wert is RouteResult {
  if (typeof wert !== 'object' || wert === null) return false;
  const daten = wert as Record<string, unknown>;
  return (
    typeof daten['distanceMeters'] === 'number' &&
    typeof daten['durationSeconds'] === 'number' &&
    Array.isArray(daten['legs']) &&
    Array.isArray(daten['geometry'])
  );
}

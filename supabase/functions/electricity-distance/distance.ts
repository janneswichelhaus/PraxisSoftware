/**
 * Die Strecke der geplanten Touren eines Monats (BEF-181, ADR-019 Fassung 6).
 *
 * Je Tag eine Route über die Wegpunkte, die der Server geliefert hat, die
 * Längen summiert. Ein Tag mit mehr Punkten, als der Anbieter in einer Route
 * nimmt, wird in Stücke geteilt, die sich am Rand einen Punkt teilen - so
 * fehlt kein Abschnitt und keiner zählt doppelt.
 *
 * **Alles oder nichts.** Scheitert eine einzige Route, gibt es keine Summe:
 * Eine halbe Monatsstrecke sähe aus wie eine ganze und rechnete zu wenig ab.
 * Der Antrag behält dann den Wert je Stunde (ORG-008). Eine Schätzung des
 * Anbieters kommt hier gar nicht erst an - der Adapter gibt sie als Fehler
 * zurück (ADR-019 Punkt 38).
 *
 * Nichts davon wird gespeichert oder protokolliert; zurück geht nur die Summe.
 */

import {
  MAX_WEGPUNKTE,
  MIN_WEGPUNKTE,
  type Anbieteradapter,
  type Coordinate,
  type TravelProfile,
} from '../location-provider/typen.ts';

/** Das Fahrprofil der Praxis: das Lastenrad, wie die Tagesroute (`PRAXISPROFIL`). */
export const PROFILE: TravelProfile = 'cargo_bicycle';

/** Höchstens so viele Routen gleichzeitig beim Anbieter. */
const PARALLEL = 4;

/** Ein Tag mit mehr als 25 Punkten in Stücke, die sich am Rand einen Punkt teilen. */
export function segments(points: readonly Coordinate[], max = MAX_WEGPUNKTE): Coordinate[][] {
  if (points.length < MIN_WEGPUNKTE) return [];
  const result: Coordinate[][] = [];
  for (let start = 0; start < points.length - 1; start += max - 1) {
    result.push(points.slice(start, start + max));
  }
  return result;
}

/**
 * Die Monatssumme in Metern - oder `null`, wenn eine Route scheitert.
 * Ohne Tag mit Fahrt ist sie 0.
 */
export async function monthDistanceMeters(
  adapter: Anbieteradapter,
  days: readonly (readonly Coordinate[])[],
): Promise<number | null> {
  const parts = days.flatMap((day) => segments(day));
  let total = 0;
  let failed = false;
  let next = 0;

  async function worker(): Promise<void> {
    while (!failed && next < parts.length) {
      const part = parts[next]!;
      next += 1;
      const result = await adapter.route({ waypoints: part, profile: PROFILE });
      if (!result.ok || !Number.isFinite(result.value.distanceMeters)) {
        failed = true;
        return;
      }
      total += result.value.distanceMeters;
    }
  }

  await Promise.all(Array.from({ length: Math.min(PARALLEL, parts.length) }, () => worker()));
  return failed ? null : total;
}

/** Ganze Kilometer, kaufmännisch gerundet - so hält der Antrag sie fest. */
export function wholeKilometers(meters: number): number {
  return Math.floor(meters / 1000 + 0.5);
}

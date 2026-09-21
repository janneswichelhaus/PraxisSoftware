import { describe, expect, it } from 'vitest';
import type * as Vertrag from '@/lib/location/contract';
import { FEHLERKLASSEN } from './typen.ts';
import type * as Function from './typen.ts';

/**
 * Die Kopie der Vertragstypen darf nicht wegdriften (MAP-003a).
 *
 * Die Function bündelt nur ihr eigenes Verzeichnis und kann deshalb nicht aus
 * `src/` importieren (`typen.ts`, Kopf). Diese Datei ist der Preis dafür:
 * Sie vergleicht beide Seiten, und zwar zur **Übersetzungszeit** — die
 * Zuweisungen unten sind nur dann `true`, wenn die Typen zueinander passen.
 * Ein Feld mehr, ein Feld weniger, eine Fehlerklasse zu viel: `pnpm typecheck`
 * wird rot, nicht erst die Anwendung.
 */

/** Wechselseitige Zuweisbarkeit - beide Richtungen, sonst faellt ein fehlendes Feld nicht auf. */
type Passt<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const vertraeglich = {
  koordinate: true satisfies Passt<Vertrag.Coordinate, Function.Coordinate>,
  profil: true satisfies Passt<Vertrag.TravelProfile, Function.TravelProfile>,
  fehlerklasse: true satisfies Passt<Vertrag.LocationErrorCode, Function.LocationErrorCode>,
  fehler: true satisfies Passt<Vertrag.LocationError, Function.LocationError>,
  abschnitt: true satisfies Passt<Vertrag.RouteLeg, Function.RouteLeg>,
  ergebnis: true satisfies Passt<Vertrag.RouteResult, Function.RouteResult>,
  anfrage: true satisfies Passt<Vertrag.RouteRequest, Function.RouteRequest>,
  liste: true satisfies Passt<Vertrag.LocationErrorCode, (typeof FEHLERKLASSEN)[number]>,
};

describe('Vertragstypen der Function', () => {
  it('passen in beide Richtungen zu src/lib/location/contract.ts', () => {
    // Die eigentliche Pruefung steht oben und laeuft im Compiler. Hier wird
    // nur sichtbar, dass sie stattgefunden hat.
    expect(Object.values(vertraeglich).every(Boolean)).toBe(true);
    expect(Object.keys(vertraeglich)).toHaveLength(8);
  });

  it('fuehrt jede Fehlerklasse genau einmal', () => {
    expect(new Set(FEHLERKLASSEN).size).toBe(FEHLERKLASSEN.length);
    expect(FEHLERKLASSEN).toContain('not_configured');
  });

  it('nimmt ein Ergebnis der Function als Ergebnis des Vertrags an', () => {
    const ausDerFunction: Function.RouteResult = {
      distanceMeters: 3150,
      durationSeconds: 762,
      legs: [{ distanceMeters: 3150, durationSeconds: 762 }],
      geometry: [
        { lat: 48.5216, lon: 9.0576 },
        { lat: 48.5305, lon: 9.049 },
      ],
    };
    const imVertrag: Vertrag.RouteResult = ausDerFunction;

    expect(imVertrag.legs).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import type * as Vertrag from '@/lib/location/contract';
import { MAX_MATRIX_PUNKTE as GRENZE_IM_BROWSER } from '@/lib/location/matrix';
import { FEHLERKLASSEN, MAX_MATRIX_PUNKTE } from './typen.ts';
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
  matrixanfrage: true satisfies Passt<Vertrag.MatrixRequest, Function.MatrixRequest>,
  matrixergebnis: true satisfies Passt<Vertrag.MatrixResult, Function.MatrixResult>,
  anschrift: true satisfies Passt<Vertrag.GeocodeRequest, Function.GeocodeRequest>,
  treffer: true satisfies Passt<Vertrag.GeocodeResult, Function.GeocodeResult>,
  liste: true satisfies Passt<Vertrag.LocationErrorCode, (typeof FEHLERKLASSEN)[number]>,
};

describe('Vertragstypen der Function', () => {
  it('passen in beide Richtungen zu src/lib/location/contract.ts', () => {
    // Die eigentliche Pruefung steht oben und laeuft im Compiler. Hier wird
    // nur sichtbar, dass sie stattgefunden hat.
    expect(Object.values(vertraeglich).every(Boolean)).toBe(true);
    expect(Object.keys(vertraeglich)).toHaveLength(12);
  });

  it('haelt die Grenze aus ANN-091 auf derselben Zahl wie der Browser', () => {
    // Auch das ist eine Kopie, die nicht wegdriften darf: Der Anker der
    // Annahme steht in `src/lib/location/matrix.ts`, durchgesetzt wird sie
    // hier. Wer nur eine der beiden Zahlen aendert, schickte eine Anfrage
    // los, die die Gegenseite abweist.
    expect(MAX_MATRIX_PUNKTE).toBe(GRENZE_IM_BROWSER);
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

/**
 * Der Adapter ohne Anbieter (MAP-003a, ADR-019 Punkt 5).
 *
 * Er macht die ganze Kette — Browser, Function, Sitzungsprüfung, Karte —
 * entwickel- und prüfbar, ohne dass ein Schlüssel vorliegt oder eine Anfrage
 * das Haus verlässt (§3.1). In der Cloud-Entwicklungsumgebung ist er der
 * einzige Weg: `supabase start` läuft dort nicht, und `api.myptv.com` ist
 * gesperrt.
 *
 * **Er gibt sich zu erkennen.** Die Antwort trägt `quelle: 'nachbildung'`, und
 * die Oberfläche sagt es. Eine Luftlinie sieht auf einer Karte aus wie eine
 * Route; ohne diesen Hinweis wäre die Seite eine Behauptung — genau das, was
 * `src/features/preview/ehrlichkeit.test.tsx` an den heikelsten Stellen
 * ausschließt.
 */

import type {
  Anbieteradapter,
  Coordinate,
  MatrixErgebnis,
  MatrixRequest,
  RouteErgebnis,
  RouteLeg,
  RouteRequest,
} from './typen.ts';

/**
 * Angenommene Reisegeschwindigkeit der Nachbildung.
 *
 * 15 km/h ist eine Zahl für die Anzeige, keine Messung: Sie liegt im Bereich
 * dessen, was ein beladenes Rad in der Stadt erreicht, und macht die Fahrzeit
 * plausibel genug, um Zustände und Layout zu prüfen. Eine echte Fahrzeit
 * liefert nur der Anbieter.
 */
const METER_JE_SEKUNDE = 15_000 / 3600;

/** Erdradius für die Luftlinie zwischen zwei Punkten. */
const ERDRADIUS_METER = 6_371_000;

export function erstelleNachbildung(): Anbieteradapter {
  return {
    id: 'mock',
    quelle: 'nachbildung',
    route(request: RouteRequest): Promise<RouteErgebnis> {
      const abschnitte: RouteLeg[] = [];
      for (let i = 1; i < request.waypoints.length; i += 1) {
        const distanz = Math.round(luftlinie(request.waypoints[i - 1]!, request.waypoints[i]!));
        abschnitte.push({
          distanceMeters: distanz,
          durationSeconds: Math.round(distanz / METER_JE_SEKUNDE),
        });
      }

      return Promise.resolve({
        ok: true,
        value: {
          distanceMeters: summe(abschnitte, 'distanceMeters'),
          durationSeconds: summe(abschnitte, 'durationSeconds'),
          legs: abschnitte,
          // Die Wegpunkte selbst sind der Linienzug: eine Luftlinie je
          // Abschnitt. Sie liegt sichtbar quer über die Stadt und wird
          // deshalb nie mit einer gefahrenen Strecke verwechselt.
          geometry: request.waypoints,
        },
      });
    },
    /**
     * Dieselbe Rechnung über alle Paare (MAP-004a).
     *
     * Die Nachbildung findet immer einen Weg — eine Luftlinie gibt es zwischen
     * je zwei Punkten. `null` steht deshalb in keiner Zelle; dass der Vertrag
     * es zulässt, ist eine Eigenschaft des Anbieters, nicht dieser Rechnung.
     */
    matrix(request: MatrixRequest): Promise<MatrixErgebnis> {
      const strecken = request.origins.map((von) =>
        request.destinations.map((nach) => Math.round(luftlinie(von, nach))),
      );

      return Promise.resolve({
        ok: true,
        value: {
          durationsSeconds: strecken.map((zeile) =>
            zeile.map((distanz) => Math.round(distanz / METER_JE_SEKUNDE)),
          ),
          distancesMeters: strecken,
        },
      });
    },
  };
}

function summe(abschnitte: readonly RouteLeg[], feld: keyof RouteLeg): number {
  return abschnitte.reduce((gesamt, abschnitt) => gesamt + abschnitt[feld], 0);
}

function luftlinie(von: Coordinate, nach: Coordinate): number {
  const bogen = (grad: number) => (grad * Math.PI) / 180;
  const dLat = bogen(nach.lat - von.lat);
  const dLon = bogen(nach.lon - von.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(bogen(von.lat)) * Math.cos(bogen(nach.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * ERDRADIUS_METER * Math.asin(Math.min(1, Math.sqrt(a)));
}

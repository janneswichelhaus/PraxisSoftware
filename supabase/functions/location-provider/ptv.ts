/**
 * Der Routing-Adapter für PTV Developer (MAP-003a, ADR-019).
 *
 * Diese Datei ist — neben `src/lib/location/ptv-display.ts` für die Kacheln —
 * die **einzige** Stelle, an der der Name des Anbieters, sein Host, sein
 * Schlüsselformat und seine Profilnamen stehen. Fällt PTV am Gate aus ADR-019
 * Punkt 9 durch, wird diese Datei ersetzt und sonst nichts (Punkt 1 und 6).
 *
 * Genutzt wird ausschließlich die **OSM**-Variante: OSM-Daten halten HERE und
 * TomTom aus dem Datenweg (ADR-019 Punkt 7). Übergeben werden Koordinaten und
 * ein Profil, nie eine Adresse, nie ein Name, nie eine Uhrzeit (Punkt 12, 13).
 *
 * **Belegtiefe.** Am 2026-09-21 mit dem Schlüssel gegen die echte API geprüft
 * (BEF-023); vorher war die Schreibweise der Abfrageparameter nur aus PTVs
 * Clients abgeleitet, und sie war an drei Stellen falsch:
 *
 *   * Die OSM-Welt hat einen **eigenen Pfad** — `routing-osm/v1`, so wie die
 *     Kacheln unter `maps-osm/v1`. Auf `routing/v1` ist `OSM_BICYCLE`
 *     schlicht unbekannt (`ROUTING_PROFILE_NOT_FOUND`).
 *   * `results` darf **nicht doppelt** vorkommen
 *     (`GENERAL_DUPLICATE_PARAMETER`), es ist eine Liste.
 *   * `polylineFormat` gibt es nicht (`GENERAL_UNRECOGNIZED_PARAMETER`).
 *     GeoJSON ist der Vorgabewert — aber als **Zeichenkette**, nicht als
 *     Objekt.
 *
 * Der Pfad ist dabei mehr als eine Formalie: `routing/v1` antwortet mit dem
 * Profil `BICYCLE` klaglos und rechnet dabei auf HERE-Daten. Er hätte
 * funktioniert und dabei einen zweiten Datenlieferanten in den Datenweg
 * geholt — genau das schließt ADR-019 Punkt 7 aus.
 */

import {
  MAX_WEGPUNKTE,
  type Coordinate,
  type LocationErrorCode,
  type RouteAdapter,
  type RouteErgebnis,
  type RouteLeg,
  type RouteRequest,
  type TravelProfile,
} from './typen.ts';

/** Routing OSM API. Der Pfad trägt die OSM-Wahl, nicht erst das Profil (2026-09-21 geprüft). */
const ROUTING_URL = 'https://api.myptv.com/routing-osm/v1/routes';

/**
 * Die Fahrprofile des Anbieters.
 *
 * `cargo_bicycle` bildet `OSM_CARGO_BICYCLE` ab. Beide Namen sind am
 * 2026-09-21 gegen die echte API geprüft; beide liefern eine Route.
 *
 * **Welches** die Räder der Praxis trifft, ist damit nicht beantwortet — und
 * die erste Messung geht gegen die Erwartung: Auf derselben 1,7-km-Strecke
 * war das Lastenradprofil das **schnellere** (1771 m in 290 s gegen 1731 m in
 * 312 s). Beide rechnen um die 20 km/h, also eher flach als geländekundig.
 * Eine Strecke ist keine Bewertung; die Entscheidung trifft Jannes nach der
 * Abnahme (MAP-003c), und eine Einstellung dafür gibt es bewusst nicht
 * (ADR-019, „bewusst nicht Bestandteil").
 */
const PROFILE: Readonly<Record<TravelProfile, string>> = {
  bicycle: 'OSM_BICYCLE',
  cargo_bicycle: 'OSM_CARGO_BICYCLE',
};

/** Zeitgrenze eines Aufrufs. Danach gilt der Versuch als gescheitert (MAP-003a). */
export const TIMEOUT_MS = 10_000;

interface PtvOptionen {
  readonly apiKey: string;
  /** Für Tests; sonst der `fetch` der Laufzeit. */
  readonly abrufen?: typeof fetch;
  readonly timeoutMs?: number;
}

export function erstellePtvAdapter({
  apiKey,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: PtvOptionen): RouteAdapter {
  return {
    id: 'ptv',
    quelle: 'anbieter',
    async route(request: RouteRequest, signal?: AbortSignal): Promise<RouteErgebnis> {
      if (request.waypoints.length > MAX_WEGPUNKTE) {
        // Ohne Aufruf: Der Anbieter antwortete hier mit
        // ROUTING_TOO_MANY_WAYPOINTS, und eine Anfrage, deren Antwort
        // feststeht, muss ihn nicht erreichen.
        return fehler('invalid_request', 'zu viele Wegpunkte');
      }

      const frist = AbortSignal.timeout(timeoutMs);
      const abbruch = signal === undefined ? frist : AbortSignal.any([signal, frist]);

      let antwort: Response;
      try {
        antwort = await abrufen(adresse(request), {
          method: 'GET',
          // Der Schlüssel geht als Kopfzeile, nicht als Abfrageparameter: Ein
          // Parameter stünde in Proxy- und Serverprotokollen (ADR-019 Punkt 19).
          headers: { ApiKey: apiKey, Accept: 'application/json' },
          signal: abbruch,
        });
      } catch {
        // Die Ausnahme selbst wird nicht weitergereicht: Ihre Meldung trägt
        // die angefragte URL und damit die Koordinaten (ADR-011).
        return frist.aborted
          ? fehler('timeout', 'Zeitüberschreitung')
          : fehler('unavailable', 'Anbieter nicht erreichbar');
      }

      if (!antwort.ok) return fehler(klasse(antwort.status), `HTTP ${antwort.status}`);

      let koerper: unknown;
      try {
        koerper = await antwort.json();
      } catch {
        return fehler('unavailable', 'Antwort ist kein JSON');
      }
      return auswerten(koerper);
    },
  };
}

/**
 * Die Abfrage — und damit alles, was den Anbieter erreicht.
 *
 * Wegpunkte in Fahrtreihenfolge als `lat,lon`, das Profil und die beiden
 * benötigten Ergebnisteile. Mehr steht nicht darin: kein Zeitpunkt, keine
 * Kennung, kein Zähler.
 */
function adresse(request: RouteRequest): string {
  const abfrage = new URLSearchParams();
  // Wegpunkte einzeln, Ergebnisse als **eine** Liste: Ein zweites `results`
  // lehnt die API als doppelten Parameter ab (2026-09-21 geprüft).
  for (const punkt of request.waypoints) abfrage.append('waypoints', `${punkt.lat},${punkt.lon}`);
  abfrage.append('profile', PROFILE[request.profile]);
  abfrage.append('results', 'POLYLINE,LEGS');
  return `${ROUTING_URL}?${abfrage.toString()}`;
}

/**
 * Die Antwort des Anbieters im Format des Vertrags.
 *
 * Gelesen wird ausdrücklich Feld für Feld statt „was da ist, wird schon
 * passen": Ein fehlendes Feld ist ein Fehler mit Klasse, keine Route mit
 * Lücken — eine Linie ohne Distanz sähe auf der Karte richtig aus.
 */
function auswerten(koerper: unknown): RouteErgebnis {
  if (typeof koerper !== 'object' || koerper === null) {
    return fehler('unavailable', 'Antwort ohne Objekt');
  }
  const daten = koerper as Record<string, unknown>;

  const distanz = zahl(daten['distance']);
  const dauer = zahl(daten['travelTime']);
  if (distanz === null || dauer === null) return fehler('unavailable', 'Antwort ohne Fahrzeit');

  const linie = geometrie(daten['polyline']);
  if (linie === null) return fehler('unavailable', 'Antwort ohne GeoJSON-Polylinie');

  const abschnitte = legs(daten['legs']);
  if (abschnitte === null) return fehler('unavailable', 'Antwort ohne Abschnitte');

  return {
    ok: true,
    value: {
      distanceMeters: distanz,
      durationSeconds: dauer,
      legs: abschnitte,
      geometry: linie,
    },
  };
}

function legs(wert: unknown): readonly RouteLeg[] | null {
  if (!Array.isArray(wert)) return null;
  const abschnitte: RouteLeg[] = [];
  for (const eintrag of wert as unknown[]) {
    if (typeof eintrag !== 'object' || eintrag === null) return null;
    const distanz = zahl((eintrag as Record<string, unknown>)['distance']);
    const dauer = zahl((eintrag as Record<string, unknown>)['travelTime']);
    if (distanz === null || dauer === null) return null;
    abschnitte.push({ distanceMeters: distanz, durationSeconds: dauer });
  }
  return abschnitte;
}

/**
 * GeoJSON-Linienzug in Koordinaten des Vertrags.
 *
 * Der Anbieter liefert das GeoJSON als **Zeichenkette** im Feld `polyline`,
 * nicht als Objekt (2026-09-21 geprüft, BEF-023) — es wird hier ein zweites
 * Mal gelesen. Ein Objekt nimmt diese Funktion ebenfalls an: Beides ist
 * dasselbe GeoJSON, und ein Formatwechsel des Anbieters soll nicht die ganze
 * Karte kosten.
 *
 * GeoJSON schreibt `[lon, lat]`, der Vertrag `{ lat, lon }` — die Drehung
 * geschieht genau hier. Eine vertauschte Reihenfolge fiele auf der Karte als
 * Linie im Indischen Ozean auf; ein Test hält sie fest.
 */
function geometrie(wert: unknown): readonly Coordinate[] | null {
  const linie = typeof wert === 'string' ? gelesen(wert) : wert;
  if (typeof linie !== 'object' || linie === null) return null;
  const paare = (linie as Record<string, unknown>)['coordinates'];
  if (!Array.isArray(paare)) return null;

  const punkte: Coordinate[] = [];
  for (const paar of paare as unknown[]) {
    if (!Array.isArray(paar)) return null;
    const lon = zahl((paar as unknown[])[0]);
    const lat = zahl((paar as unknown[])[1]);
    if (lon === null || lat === null) return null;
    punkte.push({ lat, lon });
  }
  return punkte.length >= 2 ? punkte : null;
}

/** JSON aus einer Zeichenkette — oder `null`, wenn es keines ist. Wirft nie. */
function gelesen(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function zahl(wert: unknown): number | null {
  return typeof wert === 'number' && Number.isFinite(wert) ? wert : null;
}

/** HTTP-Status des Anbieters in die Klassen, die die Oberfläche unterscheidet. */
function klasse(status: number): LocationErrorCode {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'not_found';
  if (status >= 400 && status < 500) return 'invalid_request';
  return 'unavailable';
}

/** Jede Meldung beginnt mit der Anbieterkennung und trägt sonst nur Technik. */
function fehler(code: LocationErrorCode, meldung: string): RouteErgebnis {
  return { ok: false, error: { code, message: `ptv: ${meldung}` } };
}

/**
 * Die Typen, die zwischen Browser, Function und Anbieter gelten (MAP-003a).
 *
 * **Warum das hier steht und nicht aus `src/lib/location/contract.ts` kommt:**
 * Diese Function läuft in Deno und wird aus ihrem eigenen Verzeichnis gebündelt
 * — ein Import aus `src/` wäre je nach Werkzeug mal auflösbar und mal nicht.
 * Die Kopie ist deshalb Absicht, aber keine freie: `typen.test.ts` prüft in
 * beide Richtungen, dass sie zum Vertrag passt. Wer hier ein Feld ergänzt oder
 * eine Fehlerklasse erfindet, bekommt einen roten Test, keinen stillen Drift.
 *
 * Datenminimierung gilt wie im Vertrag als Typsache (ADR-019 Punkt 12): Kein
 * Typ trägt einen Namen, eine Patienten- oder Terminkennung, eine Uhrzeit oder
 * eine Diagnose. Zum Anbieter gehen Koordinaten und ein Fahrprofil, sonst
 * nichts.
 */

/** WGS84-Koordinate in Dezimalgrad. */
export interface Coordinate {
  readonly lat: number;
  readonly lon: number;
}

export type TravelProfile = 'bicycle' | 'cargo_bicycle';

/**
 * Fehlerklassen der Oberfläche.
 *
 * `not_configured` ist die Klasse für „hier ist nichts eingerichtet" und
 * bewusst von `unavailable` getrennt (ANN-090): Eine fehlende Einrichtung als
 * Ausfall des Anbieters zu melden wäre eine falsche Auskunft.
 */
export type LocationErrorCode =
  | 'timeout'
  | 'unavailable'
  | 'rate_limited'
  | 'unauthorized'
  | 'invalid_request'
  | 'not_found'
  | 'not_configured';

/** Dieselbe Liste zur Laufzeit — die Gegenprobe des Vertrags hängt daran. */
export const FEHLERKLASSEN = [
  'timeout',
  'unavailable',
  'rate_limited',
  'unauthorized',
  'invalid_request',
  'not_found',
  'not_configured',
] as const satisfies readonly LocationErrorCode[];

/**
 * `message` ist eine technische Meldung für Logs. Sie trägt weder Koordinaten
 * noch Teile der Anbieterantwort (ADR-011, ADR-019 Punkt 18); die Oberfläche
 * zeigt ohnehin einen eigenen Text je `code`.
 */
export interface LocationError {
  readonly code: LocationErrorCode;
  readonly message: string;
}

export interface RouteLeg {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
}

export interface RouteResult {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  /** Ein Abschnitt je Paar aufeinanderfolgender Wegpunkte. */
  readonly legs: readonly RouteLeg[];
  /** Linienzug der Route in Fahrtreihenfolge, zum Zeichnen auf der Karte. */
  readonly geometry: readonly Coordinate[];
}

export interface RouteRequest {
  readonly waypoints: readonly Coordinate[];
  readonly profile: TravelProfile;
}

export type RouteErgebnis =
  | { readonly ok: true; readonly value: RouteResult }
  | { readonly ok: false; readonly error: LocationError };

/**
 * Woher die Antwort stammt.
 *
 * Steht in jeder Antwort und nicht nur im Log, weil die Oberfläche es sagen
 * muss: Eine Nachbildung sieht auf der Karte aus wie eine Route, ist aber
 * keine. Die Kennung des Anbieters selbst bleibt draußen — Fachcode kennt
 * keinen Kartendienst (ADR-019 Punkt 1).
 */
export type Quelle = 'anbieter' | 'nachbildung';

/** Der Antwortkörper der Function. Fehlerfall und Erfolg haben dieselbe Form. */
export type RouteAntwort =
  | { readonly ok: true; readonly value: RouteResult; readonly quelle: Quelle }
  | { readonly ok: false; readonly error: LocationError };

/**
 * Der eine Aufruf, den diese Function kennt.
 *
 * `geocode()` und `calculateMatrix()` aus dem Vertrag fehlen hier mit Absicht:
 * Die Matrix baut MAP-004, das Geocoding MAP-006 — und ein leerer Vorbau wäre
 * genau das Zukunftsfeature, das ADR-014 ausschließt.
 */
export interface RouteAdapter {
  /** Kennung für das Log, zum Beispiel `ptv` oder `mock`. */
  readonly id: string;
  readonly quelle: Quelle;
  route(request: RouteRequest, signal?: AbortSignal): Promise<RouteErgebnis>;
}

/**
 * Was ein Aufruf im Log hinterlässt.
 *
 * Der Typ ist die Durchsetzung von ADR-019 Punkt 18: Er hat kein Feld für eine
 * Koordinate, eine Adresse oder eine Antwort. Was nicht hineinpasst, kann auch
 * nicht versehentlich hineingeraten.
 */
export interface Protokolleintrag {
  readonly anbieter: string;
  readonly code: LocationErrorCode | 'ok';
  readonly dauerMs: number;
}

/** Zwei Wegpunkte sind das Mindeste; 25 ist die Grenze der Routing OSM API. */
export const MIN_WEGPUNKTE = 2;
export const MAX_WEGPUNKTE = 25;

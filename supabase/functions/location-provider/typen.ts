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
 *
 * `session_invalid` trennt aus demselben Grund die abgewiesene Sitzung vom
 * abgelehnten Serverschlüssel (BEF-027). `unauthorized` heißt hier ab jetzt
 * ausschließlich: **der Anbieter** hat unseren Schlüssel abgelehnt.
 * `function_unavailable` vergibt nur der Client, wenn gar nicht diese Function
 * geantwortet hat; die Function selbst gibt es nie aus.
 */
export type LocationErrorCode =
  | 'timeout'
  | 'unavailable'
  | 'rate_limited'
  | 'unauthorized'
  | 'session_invalid'
  | 'function_unavailable'
  | 'invalid_request'
  | 'not_found'
  | 'not_configured';

/** Dieselbe Liste zur Laufzeit — die Gegenprobe des Vertrags hängt daran. */
export const FEHLERKLASSEN = [
  'timeout',
  'unavailable',
  'rate_limited',
  'unauthorized',
  'session_invalid',
  'function_unavailable',
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

export interface MatrixRequest {
  readonly origins: readonly Coordinate[];
  readonly destinations: readonly Coordinate[];
  readonly profile: TravelProfile;
}

/**
 * `durationsSeconds[i][j]` ist die Fahrzeit von `origins[i]` nach
 * `destinations[j]`; `null`, wenn der Anbieter keinen Weg findet. Wie das
 * Routenergebnis wird die Matrix nicht persistiert.
 */
export interface MatrixResult {
  readonly durationsSeconds: ReadonlyArray<ReadonlyArray<number | null>>;
  readonly distancesMeters?: ReadonlyArray<ReadonlyArray<number | null>>;
}

export type MatrixErgebnis =
  | { readonly ok: true; readonly value: MatrixResult }
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

export type MatrixAntwort =
  | { readonly ok: true; readonly value: MatrixResult; readonly quelle: Quelle }
  | { readonly ok: false; readonly error: LocationError };

/**
 * Was die Function schickt — der Fehlerfall ist für beide Aufgaben derselbe.
 *
 * `value` steht hier als **beides**, nicht als Paar aus zwei Antworttypen:
 * Der Ablauf im Handler ist für Route und Matrix derselbe, und wer ihn liest,
 * hat an dieser Stelle nur die Aufgabe zur Hand. Welche Form es tatsächlich
 * ist, weiß der Aufrufer — er hat sie erfragt — und liest sie als
 * `RouteAntwort` oder `MatrixAntwort`.
 */
export type Antwort =
  | { readonly ok: true; readonly value: RouteResult | MatrixResult; readonly quelle: Quelle }
  | { readonly ok: false; readonly error: LocationError };

/**
 * Welche der beiden Aufgaben eine Anfrage meint.
 *
 * Sie steht als eigenes Feld im Körper und wird nicht aus der Form geraten:
 * Eine Anfrage, der `origins` fehlt, ist dann eine unvollständige Matrix und
 * nicht stillschweigend eine Route. Seit MAP-004 trägt **jede** Anfrage das
 * Feld — auch die Route, die es bis dahin nicht brauchte.
 */
export type Aufgabe = 'route' | 'matrix';

/**
 * Die zwei Aufrufe, die diese Function kennt.
 *
 * `geocode()` aus dem Vertrag fehlt hier weiter mit Absicht: Es kommt mit
 * MAP-006, und ein leerer Vorbau wäre genau das Zukunftsfeature, das ADR-014
 * ausschließt. `matrix()` ist mit MAP-004 dazugekommen und heißt im Vertrag
 * `calculateMatrix()`.
 */
export interface Anbieteradapter {
  /** Kennung für das Log, zum Beispiel `ptv` oder `mock`. */
  readonly id: string;
  readonly quelle: Quelle;
  route(request: RouteRequest, signal?: AbortSignal): Promise<RouteErgebnis>;
  matrix(request: MatrixRequest, signal?: AbortSignal): Promise<MatrixErgebnis>;
}

/**
 * Was ein Aufruf im Log hinterlässt.
 *
 * Der Typ ist die Durchsetzung von ADR-019 Punkt 18: Er hat kein Feld für eine
 * Koordinate, eine Adresse oder eine Antwort. Was nicht hineinpasst, kann auch
 * nicht versehentlich hineingeraten.
 */
export interface Protokolleintrag {
  /** Wer meldet: die Anbieterkennung des Adapters, oder `sitzung` für die Prüfung davor. */
  readonly anbieter: string;
  readonly code: LocationErrorCode | 'ok';
  readonly dauerMs: number;
}

/** Zwei Wegpunkte sind das Mindeste; 25 ist die Grenze der Routing OSM API. */
export const MIN_WEGPUNKTE = 2;
export const MAX_WEGPUNKTE = 25;

/**
 * Höchstzahl der Punkte je Seite einer Matrix — **ANN-091**.
 *
 * Anders als bei der Route ist das **keine** Grenze des Anbieters: Wie viele
 * Relationen eine Matrix-Anfrage tragen darf, hat PTV bis heute nicht
 * beantwortet (offene Supportfrage in ADR-019). Bis dahin begrenzt die
 * Function selbst, damit ein einziger Aufruf nicht beliebig viele Relationen
 * beim Anbieter auslöst.
 *
 * Die Zahl ist die des Nachbarn: Die Routing OSM API trägt 25 Wegpunkte, und
 * eine Tagesplanung mit mehr als 25 Stopps gibt es in dieser Praxis nicht.
 * Der Anker der Annahme steht in `src/lib/location/matrix.ts`; diese Kopie
 * hängt über `typen.test.ts` daran, so wie die Typen oben am Vertrag.
 */
export const MAX_MATRIX_PUNKTE = 25;

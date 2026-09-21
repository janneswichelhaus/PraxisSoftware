/**
 * Vertrag des Kartendienst-Adapters (MAP-001, ADR-019).
 *
 * Diese Datei enthält ausschließlich Typen: keine Implementierung, keine
 * Abhängigkeit, kein Aufruf nach außen. Sie legt fest, was die Anwendung von
 * einem Kartendienst braucht — nicht mehr —, damit der Anbieter (zunächst zur
 * Erprobung PTV Developer) später ohne Umbau der Oberfläche austauschbar
 * bleibt. Der Zuschnitt folgt ADR-005 sinngemäß: Fachmodule sprechen ein
 * internes, providerneutrales Format; Anbieter-Eigenheiten bleiben im Adapter.
 *
 * Datenminimierung ist hier Typsache: Kein Typ dieses Vertrags trägt einen
 * Namen, eine Patienten- oder Terminkennung, eine Uhrzeit oder eine Diagnose.
 * Was der Kartendienst nicht sehen darf, kann ihm über diesen Vertrag nicht
 * übergeben werden. Marker, Beschriftungen und Reihenfolgen entstehen in der
 * Anwendung, nie beim Anbieter.
 *
 * Bewusst nicht enthalten (ADR-014, §11): Tourenoptimierung, Sequenzierung,
 * Live-Standort, Bewegungsverläufe, Speicherung von Fahrzeiten oder
 * Rohantworten.
 */

// -----------------------------------------------------------------------------
// Grundtypen
// -----------------------------------------------------------------------------

/** WGS84-Koordinate in Dezimalgrad. */
export interface Coordinate {
  readonly lat: number;
  readonly lon: number;
}

/** Postanschrift ohne Personenbezug im Feldzuschnitt der Terminadresse (`visit_*`). */
export interface PostalAddress {
  readonly street: string;
  readonly houseNumber: string;
  readonly postalCode: string;
  readonly city: string;
  /** ISO 3166-1 alpha-2, zum Beispiel `DE`. */
  readonly countryCode: string;
}

/**
 * Fahrprofil. `bicycle` ist gesetzt; `cargo_bicycle` wird in MAP-003 gegen
 * das Angebot des Anbieters geprüft und bleibt bis dahin ein Kandidat, keine
 * Zusage.
 */
export type TravelProfile = 'bicycle' | 'cargo_bicycle';

// -----------------------------------------------------------------------------
// Ergebnis und Fehler
// -----------------------------------------------------------------------------

/**
 * Fehlerklassen, die die Oberfläche unterscheiden muss. Mehr braucht sie nicht.
 *
 * `not_configured` kam mit MAP-003 dazu und ist bewusst von `unavailable`
 * getrennt (**ANN-090**): „Hier ist kein Kartendienst eingerichtet" ist keine
 * Störung des Anbieters, sondern ein offener Einrichtungsschritt — und der
 * Regelfall, solange Abo und Schlüssel bei Jannes liegen (ADR-019 Punkt 24).
 * Beides in eine Klasse zu legen hieße, der Therapeutin einen Ausfall zu
 * melden, den es nicht gibt.
 */
export type LocationErrorCode =
  | 'timeout'
  | 'unavailable'
  | 'rate_limited'
  | 'unauthorized'
  | 'invalid_request'
  | 'not_found'
  | 'not_configured';

/**
 * Fehler des Adapters. `message` ist eine technische Meldung für Logs und
 * darf weder Adressen noch Koordinaten noch Teile der Anbieterantwort
 * enthalten (ADR-011). Die Oberfläche zeigt einen eigenen Text je `code`.
 */
export interface LocationError {
  readonly code: LocationErrorCode;
  readonly message: string;
}

/** Ergebnisform aller Adapteraufrufe: kein Werfen, damit der Fehlerpfad im Typ sichtbar ist. */
export type LocationResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: LocationError };

// -----------------------------------------------------------------------------
// Kartenanzeige (Browser)
// -----------------------------------------------------------------------------

/**
 * Was die Kartenkomponente vom Anbieter braucht, um Kartenmaterial zu zeigen.
 * Der Renderer ist MapLibre GL JS; die Komponente kennt nur diesen Typ, nicht
 * den Anbieter. Der hier verwendete Schlüssel ist ein **Client-Schlüssel** für
 * Kartenkacheln — im Browser sichtbar, deshalb domaingebunden und mit Limit,
 * und getrennt vom serverseitigen Schlüssel für Geocoding, Routing und Matrix.
 */
export interface MapDisplayConfig {
  /** URL des MapLibre-Styles des Anbieters. */
  readonly styleUrl: string;
  /** Quellenangabe, die die Karte sichtbar anzeigen muss (Lizenzbedingung des Anbieters). */
  readonly attribution: string;
  /**
   * Hook für Anbieter, die den Schlüssel als Header statt als Query-Parameter
   * erwarten. Wird an `transformRequest` von MapLibre durchgereicht.
   */
  readonly authorizeRequest?: (url: string) => {
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
  };
  readonly minZoom?: number;
  readonly maxZoom?: number;
}

/**
 * Ein Stopp als Overlay der Anwendung. Beschriftung und Reihenfolge entstehen
 * hier, in der Anwendung — der Anbieter sieht nur Kacheln, nie diese Objekte.
 * Die Beschriftung ist eine Nummer oder ein Kürzel, kein Name.
 */
export interface MapOverlayStop {
  readonly position: Coordinate;
  readonly label: string;
}

// -----------------------------------------------------------------------------
// Geocoding
// -----------------------------------------------------------------------------

/**
 * Geocoding läuft nur beim Anlegen oder Ändern einer Adresse, nie beim Öffnen
 * einer Karte; die Koordinate wird bei der Adresse abgelegt
 * (ANN-016, siehe Annahmenregister).
 */
export type GeocodeRequest = PostalAddress;

export interface GeocodeResult {
  readonly position: Coordinate;
  /** Wie genau der Treffer ist; unterhalb `address` bestätigt die Person den Treffer ausdrücklich. */
  readonly precision: 'address' | 'street' | 'locality' | 'unknown';
  /**
   * Anzeigetext des Treffers, damit die Person die Zuordnung prüfen kann.
   * Wird angezeigt, nicht gespeichert.
   */
  readonly matchLabel?: string;
}

// -----------------------------------------------------------------------------
// Route von Punkt zu Punkt (mit Zwischenzielen in Fahrtreihenfolge)
// -----------------------------------------------------------------------------

export interface RouteRequest {
  /** Mindestens zwei Punkte in Fahrtreihenfolge. Nur Koordinaten, keine Adressen. */
  readonly waypoints: readonly Coordinate[];
  readonly profile: TravelProfile;
}

export interface RouteLeg {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
}

/**
 * Ergebnis einer Routenberechnung. Es wird angezeigt und verworfen: keine
 * Speicherung der Fahrzeit, keine Speicherung der Rohantwort (§18, §20,
 * ADR-019).
 */
export interface RouteResult {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  /** Ein Abschnitt je Paar aufeinanderfolgender Wegpunkte. */
  readonly legs: readonly RouteLeg[];
  /** Linienzug der Route in Fahrtreihenfolge, zum Zeichnen auf der Karte. */
  readonly geometry: readonly Coordinate[];
}

// -----------------------------------------------------------------------------
// Fahrzeitmatrix
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Serverseitiger Anbieteradapter
// -----------------------------------------------------------------------------

/**
 * Die drei Aufrufe, die Daten zum Anbieter tragen. Sie laufen **serverseitig**
 * (ANN-017), damit der Schlüssel und die Browser-Metadaten der Person nicht
 * beim Anbieter landen. Der Browser spricht mit der eigenen Anwendung, nie
 * direkt mit dem Kartendienst — die Kartenkacheln (`MapDisplayConfig`) sind
 * die einzige Ausnahme.
 *
 * Ein `mock`-Adapter mit festen Antworten macht alles Weitere ohne Anbieter
 * entwickel- und testbar (§3.1).
 */
export interface LocationProvider {
  /** Kennung des Adapters, zum Beispiel `ptv` oder `mock`. Erscheint in Logs, sonst nirgends. */
  readonly id: string;
  geocode(request: GeocodeRequest, signal?: AbortSignal): Promise<LocationResult<GeocodeResult>>;
  calculateRoute(request: RouteRequest, signal?: AbortSignal): Promise<LocationResult<RouteResult>>;
  calculateMatrix(
    request: MatrixRequest,
    signal?: AbortSignal,
  ): Promise<LocationResult<MatrixResult>>;
}

// -----------------------------------------------------------------------------
// Übergabe an eine externe Navigation
// -----------------------------------------------------------------------------

/**
 * Ziel der Navigation. Vorrang hat die Koordinate; die Adresse ohne Namen ist
 * die Übergangsform, solange zu einer Adresse noch keine Koordinate vorliegt
 * (ANN-018). Nichts anderes wird übergeben: kein Name, keine Uhrzeit, keine
 * Kennung.
 */
export type NavigationTarget =
  | { readonly kind: 'coordinate'; readonly position: Coordinate }
  | { readonly kind: 'address'; readonly address: PostalAddress };

/** Welche Navigation geöffnet wird. Die Auswahl der Ziel-App prüft MAP-005. */
export type NavigationApp = 'google_maps' | 'apple_maps' | 'system';

/**
 * Baut die URL, die das Gerät der Person öffnet. Sie wird **erst beim Tippen**
 * gebaut und nie gespeichert oder automatisch geöffnet — diese Regel trägt die
 * datenschutzrechtliche Einordnung des Handoffs (ADR-019) und ist eine
 * Prüfregel im Review, keine Gestaltungsfrage.
 */
export interface NavigationHandoff {
  buildUrl(target: NavigationTarget, app: NavigationApp): string;
}

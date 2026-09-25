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
  type Anbieteradapter,
  type Coordinate,
  type GeocodeErgebnis,
  type GeocodeRequest,
  type GeocodeResult,
  type LocationError,
  type LocationErrorCode,
  type MatrixErgebnis,
  type MatrixRequest,
  type RouteErgebnis,
  type RouteLeg,
  type RouteRequest,
  type TravelProfile,
} from './typen.ts';

/** Routing OSM API. Der Pfad trägt die OSM-Wahl, nicht erst das Profil (2026-09-21 geprüft). */
const ROUTING_URL = 'https://api.myptv.com/routing-osm/v1/routes';

/**
 * Matrix Routing OSM API (MAP-004a).
 *
 * **Belegtiefe: abgeleitet, nicht geprüft.** Der Pfad folgt derselben Regel
 * wie `routing-osm/v1` und `maps-osm/v1` — die OSM-Welt hat einen eigenen —,
 * und die Antwortfelder stehen so im offiziellen Client
 * `clients-matrix-routing-osm-api` (Providerprüfung, Teil 1, Punkt 4). Gegen
 * die echte API geprüft ist davon **nichts**: `api.myptv.com` ist aus der
 * Cloud-Umgebung gesperrt, und der Schlüssel liegt bei Jannes. Genau diese
 * Lage hat bei der Route drei Fehler gekostet (BEF-023), deshalb hat die
 * Abnahme dafür einen eigenen Schritt.
 */
const MATRIX_URL = 'https://api.myptv.com/matrixrouting-osm/v1/matrices';

/**
 * Geocoding OSM API (MAP-006a).
 *
 * **Belegtiefe: abgeleitet, nicht geprüft** — wie die Matrix bis zu ihrer
 * Abnahme. Die OSM-Variante hat nach derselben Regel wie Routing und Kacheln
 * einen eigenen Pfad (`geocoding-osm/v1`); die Feldnamen der Antwort
 * (`locations`, `referencePosition`, `locationType`, `formattedAddress`)
 * stammen aus PTVs Client `clients-geocoding-api` der HERE-Variante
 * (Providerprüfung, Teil 1, Punkt 2). Die HERE-Variante `geocoding/v1` wird
 * **nicht** verwendet (ADR-019 Punkt 7). Die Sichtung Kartendienst hat einen
 * Schritt dafür.
 *
 * Die Anschrift steht — anders als die Matrix-Punkte — in der Adresse der
 * Anfrage, weil der Endpunkt nur `GET` kennt. Sie verlässt damit genau diese
 * Function und erreicht genau den Anbieter; in unserem Log steht sie nie
 * (ADR-019 Punkt 18).
 */
const GEOCODING_URL = 'https://api.myptv.com/geocoding-osm/v1/locations/by-address';

/**
 * Kantenlänge des erlaubten Rechtecks um alle Punkte einer Matrix.
 *
 * Grenze des Anbieters, nicht unsere: Liegen die Orte weiter auseinander,
 * antwortet er mit `MATRIXROUTING_LOCATIONS_TOO_FAR_AWAY` (Providerprüfung,
 * Teil 1, Punkt 4).
 */
const MATRIX_BOX_METER = 100_000;

/** Ein Breitengrad in Metern — die Zahl, mit der die Box geschätzt wird. */
const METER_JE_BREITENGRAD = 111_320;

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

/** Die gemeinsame Form von `RouteErgebnis` und `MatrixErgebnis`. */
type Ergebnis<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: LocationError };

export function erstellePtvAdapter({
  apiKey,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: PtvOptionen): Anbieteradapter {
  /**
   * Ein Aufruf beim Anbieter — und alles, was daran schiefgehen kann.
   *
   * Route und Matrix unterscheiden sich in Adresse, Methode und Auswertung,
   * nicht im Fehlerverhalten: Zeitgrenze, Netzfehler, HTTP-Status und „kein
   * JSON" sind für beide dieselben Klassen. Sie stehen deshalb einmal hier
   * und nicht zweimal daneben.
   */
  async function hole<T>(
    ziel: string,
    optionen: { readonly koerper?: unknown; readonly signal?: AbortSignal | undefined },
    auswerten: (koerper: unknown) => Ergebnis<T>,
  ): Promise<Ergebnis<T>> {
    const frist = AbortSignal.timeout(timeoutMs);
    const abbruch =
      optionen.signal === undefined ? frist : AbortSignal.any([optionen.signal, frist]);

    let antwort: Response;
    try {
      antwort = await abrufen(ziel, {
        method: optionen.koerper === undefined ? 'GET' : 'POST',
        // Der Schlüssel geht als Kopfzeile, nicht als Abfrageparameter: Ein
        // Parameter stünde in Proxy- und Serverprotokollen (ADR-019 Punkt 19).
        headers: {
          ApiKey: apiKey,
          Accept: 'application/json',
          ...(optionen.koerper === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(optionen.koerper === undefined ? {} : { body: JSON.stringify(optionen.koerper) }),
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
  }

  return {
    id: 'ptv',
    quelle: 'anbieter',
    route(request: RouteRequest, signal?: AbortSignal): Promise<RouteErgebnis> {
      if (request.waypoints.length > MAX_WEGPUNKTE) {
        // Ohne Aufruf: Der Anbieter antwortete hier mit
        // ROUTING_TOO_MANY_WAYPOINTS, und eine Anfrage, deren Antwort
        // feststeht, muss ihn nicht erreichen.
        return Promise.resolve(fehler('invalid_request', 'zu viele Wegpunkte'));
      }
      return hole(adresse(request), { signal }, auswerten);
    },
    matrix(request: MatrixRequest, signal?: AbortSignal): Promise<MatrixErgebnis> {
      if (!inEinerBox([...request.origins, ...request.destinations])) {
        // Dieselbe Regel wie oben: Der Anbieter antwortete hier mit
        // MATRIXROUTING_LOCATIONS_TOO_FAR_AWAY.
        return Promise.resolve(fehler('invalid_request', 'Punkte liegen zu weit auseinander'));
      }
      return hole(matrixAdresse(request), { koerper: matrixKoerper(request), signal }, (koerper) =>
        matrixAuswerten(koerper, request),
      );
    },
    geocode(request: GeocodeRequest, signal?: AbortSignal): Promise<GeocodeErgebnis> {
      return hole(geocodingAdresse(request), { signal }, geocodingAuswerten);
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
 * Die Abfrage der Matrix — Profil und die zwei Ergebnisteile, sonst nichts.
 *
 * Die Punkte stehen anders als bei der Route **nicht** in der Adresse,
 * sondern im Körper: Eine Matrix über acht Stopps trüge sechzehn Koordinaten
 * in der URL, und eine URL steht in jedem Proxy- und Serverprotokoll
 * (ADR-019 Punkt 18 und 19).
 */
function matrixAdresse(request: MatrixRequest): string {
  const abfrage = new URLSearchParams();
  abfrage.append('profile', PROFILE[request.profile]);
  abfrage.append('results', 'TRAVEL_TIMES,DISTANCES');
  return `${MATRIX_URL}?${abfrage.toString()}`;
}

/** Nur Koordinaten — in der Schreibweise des Anbieters, die `latitude` und `longitude` heißt. */
function matrixKoerper(request: MatrixRequest) {
  const punkt = ({ lat, lon }: Coordinate) => ({ latitude: lat, longitude: lon });
  return {
    origins: request.origins.map(punkt),
    destinations: request.destinations.map(punkt),
  };
}

/** Die fünf Felder der Anschrift, sonst nichts — kein Name, keine Kennung (ADR-019 Punkt 12). */
function geocodingAdresse(request: GeocodeRequest): string {
  const abfrage = new URLSearchParams();
  abfrage.append('countryFilter', request.countryCode);
  abfrage.append('postalCode', request.postalCode);
  abfrage.append('locality', request.city);
  abfrage.append('street', request.street);
  if (request.houseNumber !== '') abfrage.append('houseNumber', request.houseNumber);
  return `${GEOCODING_URL}?${abfrage.toString()}`;
}

/**
 * Genauigkeit des Treffers in der Sprache des Vertrags. Unterhalb von
 * `address` bestätigt die Person den Treffer (ANN-016); was hier unbekannt
 * ist, wird deshalb nie zur Hausnummer hochgestuft.
 */
function genauigkeit(typ: unknown): GeocodeResult['precision'] {
  if (typ === 'EXACT_ADDRESS' || typ === 'INTERPOLATED_ADDRESS') return 'address';
  if (typ === 'STREET') return 'street';
  if (typ === 'LOCALITY' || typ === 'POSTAL_CODE' || typ === 'DISTRICT' || typ === 'SUBDISTRICT')
    return 'locality';
  return 'unknown';
}

/** Der erste Treffer des Anbieters — der beste nach seiner eigenen Reihenfolge. */
function geocodingAuswerten(koerper: unknown): GeocodeErgebnis {
  if (typeof koerper !== 'object' || koerper === null) {
    return fehler('unavailable', 'Antwort ohne Objekt');
  }
  const treffer = (koerper as Record<string, unknown>)['locations'];
  if (!Array.isArray(treffer)) return fehler('unavailable', 'Antwort ohne Trefferliste');
  if (treffer.length === 0) return fehler('not_found', 'kein Treffer');

  const erster = treffer[0] as Record<string, unknown> | null;
  if (typeof erster !== 'object' || erster === null)
    return fehler('unavailable', 'Treffer ohne Objekt');
  const punkt = erster['referencePosition'] as Record<string, unknown> | undefined;
  const lat = zahl(punkt?.['latitude']);
  const lon = zahl(punkt?.['longitude']);
  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return fehler('unavailable', 'Treffer ohne Koordinate');
  }
  const label = erster['formattedAddress'];
  return {
    ok: true,
    value: {
      position: { lat, lon },
      precision: genauigkeit(erster['locationType']),
      ...(typeof label === 'string' && label.trim() !== '' ? { matchLabel: label.trim() } : {}),
    },
  };
}

/**
 * Liegen alle Punkte in einem Rechteck von höchstens 100 km Kantenlänge?
 *
 * Gerechnet wird mit der gestreckten Erdkugel und mit dem Breitengrad des
 * Rechtecks, der dem Äquator am nächsten liegt: Dort ist ein Längengrad am
 * breitesten, die Schätzung also die großzügigste — wer hier irrt, irrt in
 * Richtung „lieber doch fragen". Und wenn der Anbieter die Anfrage dann
 * ablehnt, kommt dieselbe Fehlerklasse zurück wie hier.
 */
function inEinerBox(punkte: readonly Coordinate[]): boolean {
  if (punkte.length === 0) return true;
  const lats = punkte.map((p) => p.lat);
  const lons = punkte.map((p) => p.lon);
  const hoehe = (Math.max(...lats) - Math.min(...lats)) * METER_JE_BREITENGRAD;
  const naechsteAmAequator = Math.min(...lats.map(Math.abs));
  const breite =
    (Math.max(...lons) - Math.min(...lons)) *
    METER_JE_BREITENGRAD *
    Math.cos((naechsteAmAequator * Math.PI) / 180);
  return hoehe <= MATRIX_BOX_METER && breite <= MATRIX_BOX_METER;
}

/**
 * Die Matrix des Anbieters im Format des Vertrags.
 *
 * Der Anbieter liefert **flache** Listen; `k = i·N + j` mit `N` als Zahl der
 * Ziele ist die Übersetzung (Providerprüfung, Teil 1, Punkt 4). Eine Liste
 * mit falscher Länge ist deshalb ein Fehler und keine halbe Matrix: Jede Zahl
 * darin stünde sonst in der falschen Zelle, und das sähe in der Tabelle
 * richtig aus.
 *
 * Was kein Weg ist, wird `null`. Ob der Anbieter dafür `null` schickt oder
 * eine negative Zahl, ist nicht belegt — beides wird gleich behandelt, statt
 * eine Vermutung zur Bedingung zu machen.
 */
function matrixAuswerten(koerper: unknown, request: MatrixRequest): MatrixErgebnis {
  if (typeof koerper !== 'object' || koerper === null) {
    return fehler('unavailable', 'Antwort ohne Objekt');
  }
  const daten = koerper as Record<string, unknown>;

  const zeilen = request.origins.length;
  const spalten = request.destinations.length;

  const fahrzeiten = gefaltet(daten['travelTimes'], zeilen, spalten);
  if (fahrzeiten === null) return fehler('unavailable', 'Antwort ohne Fahrzeiten');

  const strecken = gefaltet(daten['distances'], zeilen, spalten);

  return {
    ok: true,
    value: {
      durationsSeconds: fahrzeiten,
      // Ohne Strecken ist die Matrix vollständig: Gefragt ist die Fahrzeit,
      // die Strecke ist die Zugabe (`distancesMeters` ist im Vertrag optional).
      ...(strecken === null ? {} : { distancesMeters: strecken }),
    },
  };
}

/** Flache Liste in Zeilen — oder `null`, wenn sie keine Matrix dieser Größe ist. */
function gefaltet(wert: unknown, zeilen: number, spalten: number): (number | null)[][] | null {
  if (!Array.isArray(wert) || wert.length !== zeilen * spalten) return null;
  const werte = wert as unknown[];
  const matrix: (number | null)[][] = [];
  for (let i = 0; i < zeilen; i += 1) {
    const zeile: (number | null)[] = [];
    for (let j = 0; j < spalten; j += 1) {
      const zahlwert = zahl(werte[i * spalten + j]);
      zeile.push(zahlwert === null || zahlwert < 0 ? null : zahlwert);
    }
    matrix.push(zeile);
  }
  return matrix;
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
function fehler(code: LocationErrorCode, meldung: string): { ok: false; error: LocationError } {
  return { ok: false, error: { code, message: `ptv: ${meldung}` } };
}

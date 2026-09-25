import { describe, expect, it, vi } from 'vitest';
import { erstellePtvAdapter } from './ptv.ts';
import type { MatrixRequest, RouteRequest } from './typen.ts';

/**
 * Der Routing-Adapter für PTV (MAP-003a, Akzeptanzkriterium 1).
 *
 * Geprüft wird beides: was den Anbieter erreicht und was von ihm
 * zurückkommt. Der `fetch` ist dafür ausgetauscht — es geht in keinem dieser
 * Tests eine Anfrage hinaus.
 */

const STOPPS: RouteRequest = {
  waypoints: [
    { lat: 48.5216, lon: 9.0576 },
    { lat: 48.5305, lon: 9.049 },
  ],
  profile: 'bicycle',
};

/**
 * Eine Antwort in der Form, die der Anbieter tatsaechlich liefert.
 *
 * `polyline` ist eine **Zeichenkette** mit GeoJSON darin, kein Objekt - am
 * 2026-09-21 gegen die echte API geprueft (BEF-023).
 */
const LINIE = {
  type: 'LineString',
  coordinates: [
    [9.0576, 48.5216],
    [9.0521, 48.5268],
    [9.049, 48.5305],
  ],
};

const ANTWORT = {
  distance: 3150,
  travelTime: 762,
  legs: [{ distance: 3150, travelTime: 762 }],
  polyline: JSON.stringify(LINIE),
};

function antwortMit(koerper: unknown, status = 200) {
  return vi.fn((_ziel: RequestInfo | URL, _optionen?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(koerper), { status })),
  );
}

/** Das Ziel eines Aufrufs als URL - der Adapter uebergibt immer eine Zeichenkette. */
function alsUrl(ziel: RequestInfo | URL): URL {
  return new URL(typeof ziel === 'string' ? ziel : ziel instanceof URL ? ziel.href : ziel.url);
}

describe('PTV-Routing-Adapter', () => {
  it('schickt nur Koordinaten und Profil - und den Schluessel als Kopfzeile', async () => {
    const abrufen = antwortMit(ANTWORT);
    const adapter = erstellePtvAdapter({ apiKey: 'geheim', abrufen });

    await adapter.route(STOPPS);

    const [ziel, optionen] = abrufen.mock.calls[0]!;
    const url = alsUrl(ziel);
    // `routing-osm`, nicht `routing`: Der Pfad traegt die OSM-Wahl. Auf dem
    // anderen rechnet PTV auf HERE-Daten - er antwortet, und genau deshalb
    // haengt diese Zeile an einem Test (ADR-019 Punkt 7, BEF-023).
    expect(url.origin + url.pathname).toBe('https://api.myptv.com/routing-osm/v1/routes');
    expect(url.searchParams.getAll('waypoints')).toEqual(['48.5216,9.0576', '48.5305,9.049']);
    expect(url.searchParams.get('profile')).toBe('OSM_BICYCLE');
    // Eine Liste, kein zweimaliges `results` - sonst: doppelter Parameter.
    expect(url.searchParams.getAll('results')).toEqual(['POLYLINE,LEGS']);

    // Die Feldliste: mehr als diese drei Angaben geht nicht hinaus - kein
    // Zeitpunkt, keine Kennung, kein Name (ADR-019 Punkt 12).
    expect([...new Set(url.searchParams.keys())].sort()).toEqual([
      'profile',
      'results',
      'waypoints',
    ]);

    // Der Schluessel steht in der Kopfzeile, nicht in der Adresse: Sonst
    // stuende er in jedem Proxy- und Serverprotokoll (ADR-019 Punkt 19).
    expect(url.search).not.toContain('geheim');
    expect(new Headers(optionen?.headers).get('ApiKey')).toBe('geheim');
  });

  it('nimmt fuer das Lastenrad das Lastenradprofil', async () => {
    const abrufen = antwortMit(ANTWORT);
    await erstellePtvAdapter({ apiKey: 'k', abrufen }).route({
      ...STOPPS,
      profile: 'cargo_bicycle',
    });

    const url = alsUrl(abrufen.mock.calls[0]![0]);
    expect(url.searchParams.get('profile')).toBe('OSM_CARGO_BICYCLE');
  });

  it('uebersetzt die Antwort in den Vertrag und dreht die Koordinaten', async () => {
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit(ANTWORT),
    }).route(STOPPS);

    expect(ergebnis).toEqual({
      ok: true,
      value: {
        distanceMeters: 3150,
        durationSeconds: 762,
        legs: [{ distanceMeters: 3150, durationSeconds: 762 }],
        // GeoJSON schreibt [lon, lat], der Vertrag { lat, lon }. Wer das
        // vertauscht, zeichnet eine Linie in den Indischen Ozean.
        geometry: [
          { lat: 48.5216, lon: 9.0576 },
          { lat: 48.5268, lon: 9.0521 },
          { lat: 48.5305, lon: 9.049 },
        ],
      },
    });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'rate_limited'],
    [404, 'not_found'],
    [400, 'invalid_request'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ])('bildet HTTP %i auf %s ab', async (status, klasse) => {
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit({ message: 'egal' }, status),
    }).route(STOPPS);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok === false && ergebnis.error.code).toBe(klasse);
  });

  it('meldet eine Zeitueberschreitung als solche', async () => {
    const abrufen: typeof fetch = (_ziel, optionen) =>
      new Promise((_, ablehnen) => {
        optionen?.signal?.addEventListener('abort', () =>
          ablehnen(new DOMException('Aborted', 'AbortError')),
        );
      });

    const ergebnis = await erstellePtvAdapter({ apiKey: 'k', abrufen, timeoutMs: 5 }).route(STOPPS);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok === false && ergebnis.error.code).toBe('timeout');
  });

  it('meldet einen Netzfehler als "nicht erreichbar"', async () => {
    const abrufen: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    const ergebnis = await erstellePtvAdapter({ apiKey: 'k', abrufen }).route(STOPPS);

    expect(ergebnis.ok === false && ergebnis.error.code).toBe('unavailable');
  });

  it('weist zu viele Wegpunkte ab, ohne den Anbieter zu fragen', async () => {
    const abrufen = antwortMit(ANTWORT);
    const zuViele = Array.from({ length: 26 }, (_, i) => ({ lat: 48.5 + i / 1000, lon: 9.05 }));

    const ergebnis = await erstellePtvAdapter({ apiKey: 'k', abrufen }).route({
      waypoints: zuViele,
      profile: 'bicycle',
    });

    expect(ergebnis.ok === false && ergebnis.error.code).toBe('invalid_request');
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('nimmt die Polylinie auch als Objekt an', async () => {
    // Beobachtet ist die Zeichenkette. Ein Objekt ist dasselbe GeoJSON, und
    // ein Formatwechsel des Anbieters soll nicht die ganze Karte kosten.
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit({ ...ANTWORT, polyline: LINIE }),
    }).route(STOPPS);

    expect(ergebnis.ok && ergebnis.value.geometry).toHaveLength(3);
  });

  it.each([
    ['ohne Fahrzeit', { ...ANTWORT, travelTime: undefined }],
    ['ohne Polylinie', { ...ANTWORT, polyline: undefined }],
    ['mit unlesbarer Polylinie', { ...ANTWORT, polyline: 'gfo}Hovq_A' }],
    ['mit Polylinie ohne Koordinaten', { ...ANTWORT, polyline: '{"type":"LineString"}' }],
    ['ohne Abschnitte', { ...ANTWORT, legs: undefined }],
    ['gar keine', 'kein Objekt'],
  ])(
    'meldet eine unvollstaendige Antwort %s als Fehler, nicht als halbe Route',
    async (_, koerper) => {
      const ergebnis = await erstellePtvAdapter({
        apiKey: 'k',
        abrufen: antwortMit(koerper),
      }).route(STOPPS);

      expect(ergebnis.ok).toBe(false);
      expect(ergebnis.ok === false && ergebnis.error.code).toBe('unavailable');
    },
  );

  it('traegt in keiner Meldung eine Zahl aus der Anfrage', async () => {
    const faelle: (typeof fetch)[] = [
      antwortMit({ message: 'waypoints 48.5216,9.0576 unreachable' }, 400),
      antwortMit({ ...ANTWORT, polyline: undefined }),
      () => Promise.reject(new TypeError('connect to 48.5216 failed')),
    ];

    for (const abrufen of faelle) {
      const ergebnis = await erstellePtvAdapter({ apiKey: 'geheim', abrufen }).route(STOPPS);
      expect(ergebnis.ok).toBe(false);
      const meldung = ergebnis.ok === false ? ergebnis.error.message : '';
      // Keine Koordinate der Anfrage und kein Schluessel - die Meldung geht
      // ins Log (ADR-011, ADR-019 Punkt 18).
      expect(meldung).not.toMatch(/48[.,]5|9[.,]05/);
      expect(meldung).not.toContain('geheim');
      expect(meldung).toMatch(/^ptv: /);
    }
  });
});

/**
 * Der Matrix-Adapter (MAP-004a, Akzeptanzkriterium 1).
 *
 * **Diese Schreibweise ist nicht gegen die echte API geprüft** — sie ist aus
 * dem offiziellen Client abgeleitet, weil `api.myptv.com` aus der
 * Cloud-Umgebung gesperrt ist. Die Tests halten fest, was der Adapter tut,
 * nicht, dass der Anbieter es so erwartet; das klärt der Abnahmeschritt bei
 * Jannes. Geprüft ist hier das, was an keinem Anbieter hängt: die
 * Indexübersetzung, die Grenzen und die Fehlerklassen.
 */
describe('PTV-Matrix-Adapter', () => {
  const ZWEI_MAL_DREI: MatrixRequest = {
    origins: [
      { lat: 48.5216, lon: 9.0576 },
      { lat: 48.5305, lon: 9.049 },
    ],
    destinations: [
      { lat: 48.5164, lon: 9.0349 },
      { lat: 48.5092, lon: 9.0655 },
      { lat: 48.5241, lon: 9.0762 },
    ],
    profile: 'cargo_bicycle',
  };

  /** Sechs Werte in Zeilen zu drei: `k = i·N + j` mit `N` gleich drei Zielen. */
  const MATRIX_ANTWORT = {
    travelTimes: [600, 660, 720, 300, 360, 420],
    distances: [2000, 2200, 2400, 1000, 1200, 1400],
  };

  it('schickt Koordinaten im Koerper und nur Profil und Ergebnisteile in der Adresse', async () => {
    const abrufen = antwortMit(MATRIX_ANTWORT);

    await erstellePtvAdapter({ apiKey: 'geheim', abrufen }).matrix(ZWEI_MAL_DREI);

    const [ziel, optionen] = abrufen.mock.calls[0]!;
    const url = alsUrl(ziel);
    // `matrixrouting-osm`, nicht `matrixrouting`: dieselbe Regel wie bei der
    // Route - der Pfad traegt die OSM-Wahl (ADR-019 Punkt 7).
    expect(url.origin + url.pathname).toBe('https://api.myptv.com/matrixrouting-osm/v1/matrices');
    expect(url.searchParams.get('profile')).toBe('OSM_CARGO_BICYCLE');
    expect(url.searchParams.getAll('results')).toEqual(['TRAVEL_TIMES,DISTANCES']);
    expect([...new Set(url.searchParams.keys())].sort()).toEqual(['profile', 'results']);
    // Keine Koordinate in der Adresse: Sie stuende in jedem Serverprotokoll.
    expect(url.search).not.toMatch(/48[.,]5|9[.,]05/);
    expect(optionen?.method).toBe('POST');
    expect(new Headers(optionen?.headers).get('ApiKey')).toBe('geheim');

    // Die Feldliste des Koerpers: zwei Listen mit Koordinaten, sonst nichts.
    // Der Adapter uebergibt den Koerper als Zeichenkette; alles andere waere
    // hier ein Fehler und soll die Pruefung nicht stillschweigend passieren.
    expect(typeof optionen?.body).toBe('string');
    const koerper = JSON.parse(optionen?.body as string) as Record<string, unknown>;
    expect(Object.keys(koerper).sort()).toEqual(['destinations', 'origins']);
    expect(koerper['origins']).toEqual([
      { latitude: 48.5216, longitude: 9.0576 },
      { latitude: 48.5305, longitude: 9.049 },
    ]);
  });

  it('faltet die flachen Listen nach k = i*N + j', async () => {
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit(MATRIX_ANTWORT),
    }).matrix(ZWEI_MAL_DREI);

    expect(ergebnis).toEqual({
      ok: true,
      value: {
        durationsSeconds: [
          [600, 660, 720],
          [300, 360, 420],
        ],
        distancesMeters: [
          [2000, 2200, 2400],
          [1000, 1200, 1400],
        ],
      },
    });
  });

  it.each([
    ['als null', null],
    ['als negative Zahl', -1],
  ])('macht ein unerreichbares Paar %s zu null', async (_, wert) => {
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit({ travelTimes: [600, 660, wert, 300, 360, 420] }),
    }).matrix(ZWEI_MAL_DREI);

    expect(ergebnis.ok && ergebnis.value.durationsSeconds[0]).toEqual([600, 660, null]);
  });

  it('nimmt eine Antwort ohne Strecken an - gefragt ist die Fahrzeit', async () => {
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit({ travelTimes: MATRIX_ANTWORT.travelTimes }),
    }).matrix(ZWEI_MAL_DREI);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.ok && ergebnis.value.distancesMeters).toBeUndefined();
  });

  it.each([
    ['zu kurz', { travelTimes: [600, 660, 720] }],
    ['zu lang', { travelTimes: [1, 2, 3, 4, 5, 6, 7] }],
    ['gar nicht da', { distances: MATRIX_ANTWORT.distances }],
    ['keine Liste', { travelTimes: 600 }],
  ])('meldet eine Fahrzeitliste %s als Fehler, nicht als halbe Matrix', async (_, koerper) => {
    // Eine Liste falscher Laenge stuende zellenweise verschoben in der
    // Tabelle - und saehe dort richtig aus.
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit(koerper),
    }).matrix(ZWEI_MAL_DREI);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok === false && ergebnis.error.code).toBe('unavailable');
  });

  it('weist Punkte ausserhalb der 100-km-Box ab, ohne den Anbieter zu fragen', async () => {
    const abrufen = antwortMit(MATRIX_ANTWORT);
    const ergebnis = await erstellePtvAdapter({ apiKey: 'k', abrufen }).matrix({
      ...ZWEI_MAL_DREI,
      // Tübingen und Hamburg: gut 500 km auseinander.
      destinations: [{ lat: 53.5511, lon: 9.9937 }],
    });

    expect(ergebnis.ok === false && ergebnis.error.code).toBe('invalid_request');
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('laesst eine Tagestour durch - sie passt in die Box', async () => {
    const abrufen = antwortMit({ travelTimes: [0] });
    const ergebnis = await erstellePtvAdapter({ apiKey: 'k', abrufen }).matrix({
      origins: [{ lat: 48.5216, lon: 9.0576 }],
      destinations: [{ lat: 48.5241, lon: 9.0762 }],
      profile: 'cargo_bicycle',
    });

    expect(ergebnis.ok).toBe(true);
    expect(abrufen).toHaveBeenCalled();
  });

  it.each([
    [401, 'unauthorized'],
    [429, 'rate_limited'],
    [400, 'invalid_request'],
    [500, 'unavailable'],
  ])('bildet HTTP %i auch bei der Matrix auf %s ab', async (status, klasse) => {
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit({ message: 'egal' }, status),
    }).matrix(ZWEI_MAL_DREI);

    expect(ergebnis.ok === false && ergebnis.error.code).toBe(klasse);
  });

  it('traegt auch bei der Matrix keine Zahl aus der Anfrage in der Meldung', async () => {
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'geheim',
      abrufen: antwortMit({ message: 'origin 48.5216,9.0576 too far away' }, 400),
    }).matrix(ZWEI_MAL_DREI);

    const meldung = ergebnis.ok === false ? ergebnis.error.message : '';
    expect(meldung).not.toMatch(/48[.,]5|9[.,]05/);
    expect(meldung).not.toContain('geheim');
    expect(meldung).toMatch(/^ptv: /);
  });

  it('meldet eine Zeitueberschreitung auch bei der Matrix als solche', async () => {
    const abrufen: typeof fetch = (_ziel, optionen) =>
      new Promise((_, ablehnen) => {
        optionen?.signal?.addEventListener('abort', () =>
          ablehnen(new DOMException('Aborted', 'AbortError')),
        );
      });

    const ergebnis = await erstellePtvAdapter({ apiKey: 'k', abrufen, timeoutMs: 5 }).matrix(
      ZWEI_MAL_DREI,
    );

    expect(ergebnis.ok === false && ergebnis.error.code).toBe('timeout');
  });
});

describe('PTV-Geocoding-Adapter (MAP-006a)', () => {
  const ANSCHRIFT = {
    street: 'Musterweg',
    houseNumber: '1',
    postalCode: '72070',
    city: 'Tübingen',
    countryCode: 'DE',
  };

  const TREFFER = {
    locations: [
      {
        formattedAddress: 'Musterweg 1, 72070 Tübingen',
        locationType: 'EXACT_ADDRESS',
        referencePosition: { latitude: 48.5201, longitude: 9.0512 },
      },
    ],
  };

  it('fragt die OSM-Variante mit genau den Feldern der Anschrift', async () => {
    const abrufen = antwortMit(TREFFER);
    await erstellePtvAdapter({ apiKey: 'geheim', abrufen }).geocode(ANSCHRIFT);

    const [ziel, optionen] = abrufen.mock.calls[0]!;
    const url = alsUrl(ziel);
    expect(url.pathname).toBe('/geocoding-osm/v1/locations/by-address');
    expect([...url.searchParams.keys()].sort()).toEqual(
      ['countryFilter', 'houseNumber', 'locality', 'postalCode', 'street'].sort(),
    );
    expect(url.searchParams.get('apiKey')).toBeNull();
    expect((optionen?.headers as Record<string, string>)['ApiKey']).toBe('geheim');
    expect(optionen?.method).toBe('GET');
  });

  it('laesst eine leere Hausnummer weg', async () => {
    const abrufen = antwortMit(TREFFER);
    await erstellePtvAdapter({ apiKey: 'k', abrufen }).geocode({ ...ANSCHRIFT, houseNumber: '' });
    expect(alsUrl(abrufen.mock.calls[0]![0]).searchParams.has('houseNumber')).toBe(false);
  });

  it('uebersetzt den ersten Treffer in den Vertrag', async () => {
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit(TREFFER),
    }).geocode(ANSCHRIFT);
    expect(ergebnis).toEqual({
      ok: true,
      value: {
        position: { lat: 48.5201, lon: 9.0512 },
        precision: 'address',
        matchLabel: 'Musterweg 1, 72070 Tübingen',
      },
    });
  });

  it.each([
    ['INTERPOLATED_ADDRESS', 'address'],
    ['STREET', 'street'],
    ['LOCALITY', 'locality'],
    ['POSTAL_CODE', 'locality'],
    ['IRGENDWAS', 'unknown'],
    [undefined, 'unknown'],
  ])('stuft %j als %s ein - nie hoeher', async (typ, erwartet) => {
    const koerper = { locations: [{ ...TREFFER.locations[0], locationType: typ }] };
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit(koerper),
    }).geocode(ANSCHRIFT);
    expect(ergebnis.ok && ergebnis.value.precision).toBe(erwartet);
  });

  it('meldet "kein Treffer" als not_found', async () => {
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit({ locations: [] }),
    }).geocode(ANSCHRIFT);
    expect(ergebnis.ok === false && ergebnis.error.code).toBe('not_found');
  });

  it.each([
    ['ohne Trefferliste', {}],
    ['ohne Koordinate', { locations: [{ locationType: 'EXACT_ADDRESS' }] }],
    [
      'mit Koordinate ausserhalb der Erde',
      { locations: [{ referencePosition: { latitude: 91, longitude: 9 } }] },
    ],
  ])('nimmt eine Antwort %s nicht als Treffer', async (_, koerper) => {
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit(koerper),
    }).geocode(ANSCHRIFT);
    expect(ergebnis.ok === false && ergebnis.error.code).toBe('unavailable');
  });

  it('traegt keine Anschrift in eine Fehlermeldung', async () => {
    const ergebnis = await erstellePtvAdapter({
      apiKey: 'k',
      abrufen: antwortMit({ message: 'Musterweg 1 Tübingen invalid' }, 400),
    }).geocode(ANSCHRIFT);
    expect(ergebnis.ok).toBe(false);
    expect(JSON.stringify(ergebnis)).not.toMatch(/Musterweg|72070|Tübingen/);
  });
});

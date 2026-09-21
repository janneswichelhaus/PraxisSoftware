import { describe, expect, it, vi } from 'vitest';
import { erstellePtvAdapter } from './ptv.ts';
import type { RouteRequest } from './typen.ts';

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

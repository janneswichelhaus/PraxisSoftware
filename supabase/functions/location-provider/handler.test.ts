import { describe, expect, it, vi } from 'vitest';
import { erstelleHandler } from './handler.ts';
import { erstelleNachbildung } from './mock.ts';
import type { Protokolleintrag, RouteAdapter, RouteAntwort, RouteErgebnis } from './typen.ts';

/**
 * Der Ablauf der Function (MAP-003a, Akzeptanzkriterien 1 bis 4).
 *
 * Die Laufzeit fehlt in der Cloud-Umgebung, der Ablauf nicht: Sitzung,
 * Methode, Prüfung der Eingabe, Fehlerklassen, Log. Alles, was von außen
 * kommt, ist hier eingesetzt.
 */

const KOERPER = {
  waypoints: [
    { lat: 48.5216, lon: 9.0576 },
    { lat: 48.5305, lon: 9.049 },
  ],
  profile: 'bicycle',
};

function anfrage(koerper: unknown, kopf: Record<string, string> = { Authorization: 'Bearer gut' }) {
  return new Request('https://beispiel.invalid/location-provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...kopf },
    body: JSON.stringify(koerper),
  });
}

function adapterMit(ergebnis: RouteErgebnis) {
  const route = vi.fn(() => Promise.resolve(ergebnis));
  const adapter: RouteAdapter = { id: 'prueflauf', quelle: 'anbieter', route };
  return { adapter, route };
}

function handler(
  adapter: RouteAdapter | null,
  {
    sitzungGueltig = true,
    protokolliere = () => {},
  }: { sitzungGueltig?: boolean; protokolliere?: (eintrag: Protokolleintrag) => void } = {},
) {
  let uhr = 1000;
  return erstelleHandler({
    adapter,
    pruefeSitzung: () => Promise.resolve(sitzungGueltig),
    protokolliere,
    jetzt: () => (uhr += 12),
  });
}

async function gelesen(antwort: Response): Promise<RouteAntwort> {
  return (await antwort.json()) as RouteAntwort;
}

describe('location-provider', () => {
  it('lehnt einen Aufruf ohne gueltige Sitzung mit 401 ab - ohne den Anbieter zu fragen', async () => {
    const { adapter, route } = adapterMit({ ok: true, value: leereRoute() });
    const antwort = await handler(adapter, { sitzungGueltig: false })(anfrage(KOERPER, {}));

    expect(antwort.status).toBe(401);
    const koerper = await gelesen(antwort);
    expect(koerper.ok).toBe(false);
    expect(koerper.ok === false && koerper.error.code).toBe('unauthorized');
    expect(route).not.toHaveBeenCalled();
  });

  it('beantwortet die Vorabanfrage des Browsers', async () => {
    const antwort = await handler(null)(
      new Request('https://beispiel.invalid/location-provider', { method: 'OPTIONS' }),
    );

    expect(antwort.status).toBe(204);
    expect(antwort.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('nimmt nur POST', async () => {
    const antwort = await handler(null)(
      new Request('https://beispiel.invalid/location-provider', { method: 'GET' }),
    );

    expect(antwort.status).toBe(405);
  });

  it.each([
    ['ohne Profil', { waypoints: KOERPER.waypoints }],
    ['mit erfundenem Profil', { ...KOERPER, profile: 'helicopter' }],
    ['mit nur einem Wegpunkt', { ...KOERPER, waypoints: [KOERPER.waypoints[0]] }],
    ['mit Text statt Koordinate', { ...KOERPER, waypoints: ['48.5,9.0', '48.6,9.1'] }],
    [
      'mit Koordinate ausserhalb der Erdkugel',
      {
        ...KOERPER,
        waypoints: [
          { lat: 91, lon: 9 },
          { lat: 48, lon: 9 },
        ],
      },
    ],
    ['als Zahl statt Objekt', 42],
  ])('weist eine Anfrage %s mit 400 ab', async (_, koerper) => {
    const { adapter, route } = adapterMit({ ok: true, value: leereRoute() });
    const antwort = await handler(adapter)(anfrage(koerper));

    expect(antwort.status).toBe(400);
    expect(route).not.toHaveBeenCalled();
  });

  it('sagt "nicht eingerichtet", statt eine Nachbildung unterzuschieben', async () => {
    const antwort = await handler(null)(anfrage(KOERPER));

    expect(antwort.status).toBe(503);
    const koerper = await gelesen(antwort);
    expect(koerper.ok === false && koerper.error.code).toBe('not_configured');
  });

  it('liefert die Route mit der Angabe, woher sie stammt', async () => {
    const antwort = await handler(erstelleNachbildung())(anfrage(KOERPER));

    expect(antwort.status).toBe(200);
    // Nichts wird zwischengespeichert: Eine Route ist ein Ergebnis des
    // Augenblicks (ADR-019 Punkt 16).
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');

    const koerper = await gelesen(antwort);
    expect(koerper.ok).toBe(true);
    if (!koerper.ok) return;
    expect(koerper.quelle).toBe('nachbildung');
    expect(koerper.value.legs).toHaveLength(1);
    expect(koerper.value.geometry).toEqual(KOERPER.waypoints);
    expect(koerper.value.distanceMeters).toBeGreaterThan(0);
  });

  it.each([
    ['timeout', 504],
    ['unavailable', 502],
    ['rate_limited', 429],
    ['not_found', 502],
    ['invalid_request', 400],
  ] as const)('gibt der Fehlerklasse %s den Status %i', async (code, status) => {
    const antwort = await handler(
      adapterMit({ ok: false, error: { code, message: 'ptv: x' } }).adapter,
    )(anfrage(KOERPER));

    expect(antwort.status).toBe(status);
    const koerper = await gelesen(antwort);
    expect(koerper.ok === false && koerper.error.code).toBe(code);
  });

  it('meldet einen abgelehnten Serverschluessel nicht als abgelaufene Anmeldung', async () => {
    // 401 bliebe der Sitzung der Person vorbehalten. Der Anbieter, der
    // unseren Schluessel ablehnt, ist ein Einrichtungsfehler bei uns.
    const antwort = await handler(
      adapterMit({ ok: false, error: { code: 'unauthorized', message: 'ptv: HTTP 401' } }).adapter,
    )(anfrage(KOERPER));

    expect(antwort.status).toBe(502);
    const koerper = await gelesen(antwort);
    expect(koerper.ok === false && koerper.error.code).toBe('unauthorized');
  });

  it('protokolliert Anbieter, Fehlerklasse und Dauer - und keine Koordinate', async () => {
    const eintraege: Protokolleintrag[] = [];
    await handler(
      adapterMit({ ok: false, error: { code: 'timeout', message: 'ptv: x' } }).adapter,
      {
        protokolliere: (eintrag) => eintraege.push(eintrag),
      },
    )(anfrage(KOERPER));

    expect(eintraege).toEqual([{ anbieter: 'prueflauf', code: 'timeout', dauerMs: 12 }]);
    // Die Gegenprobe zum Typ: Was im Eintrag steht, traegt keine Koordinate
    // und keine Adresse (ADR-011, ADR-019 Punkt 18).
    expect(JSON.stringify(eintraege)).not.toMatch(/48[.,]5|9[.,]05/);
  });

  it('protokolliert auch den geglueckten Aufruf mit seiner Dauer', async () => {
    const eintraege: Protokolleintrag[] = [];
    await handler(erstelleNachbildung(), { protokolliere: (e) => eintraege.push(e) })(
      anfrage(KOERPER),
    );

    expect(eintraege).toEqual([{ anbieter: 'mock', code: 'ok', dauerMs: 12 }]);
  });
});

function leereRoute() {
  return { distanceMeters: 0, durationSeconds: 0, legs: [], geometry: [] };
}

import { describe, expect, it, vi } from 'vitest';
import { erstelleHandler } from './handler.ts';
import { erstelleNachbildung } from './mock.ts';
import type { Sitzungsergebnis } from './sitzung.ts';
import { MAX_MATRIX_PUNKTE } from './typen.ts';
import type {
  Anbieteradapter,
  Antwort,
  GeocodeAntwort,
  GeocodeErgebnis,
  MatrixAntwort,
  MatrixErgebnis,
  Protokolleintrag,
  RouteAntwort,
  RouteErgebnis,
} from './typen.ts';

/**
 * Der Ablauf der Function (MAP-003a, Akzeptanzkriterien 1 bis 4).
 *
 * Die Laufzeit fehlt in der Cloud-Umgebung, der Ablauf nicht: Sitzung,
 * Methode, Prüfung der Eingabe, Fehlerklassen, Log. Alles, was von außen
 * kommt, ist hier eingesetzt.
 */

const PUNKTE = [
  { lat: 48.5216, lon: 9.0576 },
  { lat: 48.5305, lon: 9.049 },
];

const KOERPER = {
  aufgabe: 'route',
  waypoints: PUNKTE,
  profile: 'bicycle',
};

const MATRIX_KOERPER = {
  aufgabe: 'matrix',
  origins: PUNKTE,
  destinations: PUNKTE,
  profile: 'bicycle',
};

function anfrage(koerper: unknown, kopf: Record<string, string> = { Authorization: 'Bearer gut' }) {
  return new Request('https://beispiel.invalid/location-provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...kopf },
    body: JSON.stringify(koerper),
  });
}

const LEERE_MATRIX: MatrixErgebnis = { ok: true, value: { durationsSeconds: [] } };

const TREFFER: GeocodeErgebnis = {
  ok: true,
  value: { position: { lat: 48.52, lon: 9.05 }, precision: 'address', matchLabel: 'Musterweg 1' },
};

function adapterMit(
  ergebnis: RouteErgebnis,
  matrixErgebnis: MatrixErgebnis = LEERE_MATRIX,
  geocodeErgebnis: GeocodeErgebnis = TREFFER,
) {
  const route = vi.fn(() => Promise.resolve(ergebnis));
  const matrix = vi.fn(() => Promise.resolve(matrixErgebnis));
  const geocode = vi.fn((_anschrift: unknown) => Promise.resolve(geocodeErgebnis));
  const adapter: Anbieteradapter = { id: 'prueflauf', quelle: 'anbieter', route, matrix, geocode };
  return { adapter, route, matrix, geocode };
}

function handler(
  adapter: Anbieteradapter | null,
  {
    sitzung = { befund: 'gueltig' },
    protokolliere = () => {},
  }: {
    sitzung?: Sitzungsergebnis;
    protokolliere?: (eintrag: Protokolleintrag) => void;
  } = {},
) {
  let uhr = 1000;
  return erstelleHandler({
    adapter,
    pruefeSitzung: () => Promise.resolve(sitzung),
    protokolliere,
    jetzt: () => (uhr += 12),
  });
}

/** Der Körper der Antwort. Ohne Angabe ist die Route gemeint — sie ist der Regelfall hier. */
async function gelesen<T extends Antwort = RouteAntwort>(antwort: Response): Promise<T> {
  return (await antwort.json()) as T;
}

describe('location-provider', () => {
  it('lehnt einen Aufruf ohne gueltige Sitzung mit 401 ab - ohne den Anbieter zu fragen', async () => {
    const { adapter, route } = adapterMit({ ok: true, value: leereRoute() });
    const antwort = await handler(adapter, { sitzung: { befund: 'abgelehnt' } })(
      anfrage(KOERPER, {}),
    );

    expect(antwort.status).toBe(401);
    const koerper = await gelesen(antwort);
    expect(koerper.ok).toBe(false);
    // `session_invalid`, nicht `unauthorized`: Die zweite Klasse gehoert seit
    // BEF-027 allein dem Anbieter, der unseren Serverschluessel ablehnt.
    expect(koerper.ok === false && koerper.error.code).toBe('session_invalid');
    expect(route).not.toHaveBeenCalled();
  });

  it('sagt es, wenn die Sitzung gar nicht geprueft werden konnte', async () => {
    // Der Fall aus dem ersten Abnahmelauf: Die Pruefung selbst kam nicht
    // durch, und die Oberflaeche zeigte auf den Kartendienst (BEF-027).
    const eintraege: Protokolleintrag[] = [];
    const { adapter, route } = adapterMit({ ok: true, value: leereRoute() });
    const antwort = await handler(adapter, {
      sitzung: {
        befund: 'nicht_pruefbar',
        grund: 'einrichtung',
        meldung: 'Sitzungsprüfung nicht eingerichtet: SUPABASE_URL fehlt',
      },
      protokolliere: (eintrag) => eintraege.push(eintrag),
    })(anfrage(KOERPER));

    expect(antwort.status).toBe(503);
    const koerper = await gelesen(antwort);
    expect(koerper.ok === false && koerper.error.code).toBe('not_configured');
    expect(koerper.ok === false && koerper.error.message).toContain('SUPABASE_URL');
    // Kein Anbieteraufruf - und anders als eine abgelehnte Sitzung steht
    // dieser Betriebsfehler im Log, weil er jeden Aufruf trifft.
    expect(route).not.toHaveBeenCalled();
    expect(eintraege).toEqual([{ anbieter: 'sitzung', code: 'not_configured', dauerMs: 0 }]);
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

/**
 * Die zweite Aufgabe (MAP-004a).
 *
 * Sitzung, Log und Fehlerklassen sind dieselben und stehen oben; hier steht
 * nur, was die Matrix von der Route unterscheidet — die Wahl der Aufgabe und
 * die Prüfung ihrer Eingabe.
 */
describe('location-provider · Matrix', () => {
  it('ruft fuer die Aufgabe "matrix" die Matrix und nicht die Route', async () => {
    const { adapter, route, matrix } = adapterMit({ ok: true, value: leereRoute() });

    const antwort = await handler(adapter)(anfrage(MATRIX_KOERPER));

    expect(antwort.status).toBe(200);
    expect(route).not.toHaveBeenCalled();
    expect(matrix).toHaveBeenCalledWith({
      origins: PUNKTE,
      destinations: PUNKTE,
      profile: 'bicycle',
    });
  });

  it('liefert die Matrix mit der Angabe, woher sie stammt - und ohne Zwischenspeicher', async () => {
    const antwort = await handler(erstelleNachbildung())(anfrage(MATRIX_KOERPER));

    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    const koerper = await gelesen<MatrixAntwort>(antwort);
    expect(koerper.ok).toBe(true);
    if (!koerper.ok) return;
    expect(koerper.quelle).toBe('nachbildung');
    expect(koerper.value.durationsSeconds).toHaveLength(2);
    expect(koerper.value.durationsSeconds[0]).toHaveLength(2);
    // Die Diagonale ist der Punkt zu sich selbst.
    expect(koerper.value.durationsSeconds[0]?.[0]).toBe(0);
  });

  it.each([
    ['ohne Aufgabe', { origins: PUNKTE, destinations: PUNKTE, profile: 'bicycle' }],
    ['mit erfundener Aufgabe', { ...MATRIX_KOERPER, aufgabe: 'optimize' }],
    ['ohne Ziele', { aufgabe: 'matrix', origins: PUNKTE, profile: 'bicycle' }],
    ['mit leerer Startliste', { ...MATRIX_KOERPER, origins: [] }],
    ['mit Text statt Koordinate', { ...MATRIX_KOERPER, destinations: ['48.5,9.0'] }],
    [
      'mit Koordinate ausserhalb der Erdkugel',
      { ...MATRIX_KOERPER, origins: [{ lat: 48.5, lon: 181 }] },
    ],
    // Die Wegpunkte einer Route sind keine Matrix: Wer sie schickt, bekommt
    // keine stillschweigend anders gelesene Anfrage.
    [
      'mit Wegpunkten statt Start und Ziel',
      { aufgabe: 'matrix', waypoints: PUNKTE, profile: 'bicycle' },
    ],
  ])('weist eine Matrixanfrage %s mit 400 ab', async (_, koerper) => {
    const { adapter, matrix } = adapterMit({ ok: true, value: leereRoute() });
    const antwort = await handler(adapter)(anfrage(koerper));

    expect(antwort.status).toBe(400);
    expect(matrix).not.toHaveBeenCalled();
  });

  it('weist eine zu grosse Matrix ab, ohne den Anbieter zu fragen (ANN-091)', async () => {
    const zuViele = Array.from({ length: MAX_MATRIX_PUNKTE + 1 }, (_, i) => ({
      lat: 48.5 + i / 1000,
      lon: 9.05,
    }));
    const { adapter, matrix } = adapterMit({ ok: true, value: leereRoute() });

    const antwort = await handler(adapter)(anfrage({ ...MATRIX_KOERPER, origins: zuViele }));

    expect(antwort.status).toBe(400);
    expect(matrix).not.toHaveBeenCalled();
  });

  it('nimmt genau so viele Punkte, wie die Grenze erlaubt', async () => {
    const gerade = Array.from({ length: MAX_MATRIX_PUNKTE }, (_, i) => ({
      lat: 48.5 + i / 1000,
      lon: 9.05,
    }));
    const { adapter, matrix } = adapterMit({ ok: true, value: leereRoute() });

    const antwort = await handler(adapter)(anfrage({ ...MATRIX_KOERPER, origins: gerade }));

    expect(antwort.status).toBe(200);
    expect(matrix).toHaveBeenCalled();
  });

  it('protokolliert die Matrix wie die Route - ohne Koordinate', async () => {
    const eintraege: Protokolleintrag[] = [];
    const { adapter } = adapterMit(
      { ok: true, value: leereRoute() },
      {
        ok: false,
        error: { code: 'rate_limited', message: 'ptv: HTTP 429' },
      },
    );

    const antwort = await handler(adapter, { protokolliere: (e) => eintraege.push(e) })(
      anfrage(MATRIX_KOERPER),
    );

    expect(antwort.status).toBe(429);
    expect(eintraege).toEqual([{ anbieter: 'prueflauf', code: 'rate_limited', dauerMs: 12 }]);
    expect(JSON.stringify(eintraege)).not.toMatch(/48[.,]5|9[.,]05/);
  });
});

function leereRoute() {
  return { distanceMeters: 0, durationSeconds: 0, legs: [], geometry: [] };
}

describe('location-provider: Geocoding (MAP-006a)', () => {
  const ANSCHRIFT = {
    street: 'Musterweg',
    houseNumber: '1',
    postalCode: '72070',
    city: 'Tübingen',
    countryCode: 'DE',
  };

  it('reicht genau die fuenf Felder der Anschrift an den Adapter weiter', async () => {
    const { adapter, geocode, route } = adapterMit({ ok: true, value: leereRoute() });
    const antwort = await handler(adapter)(
      anfrage({
        aufgabe: 'geocode',
        // Ein Name im Koerper darf den Anbieter nicht erreichen (ADR-019 Punkt 12).
        address: { ...ANSCHRIFT, givenName: 'Erika', street: '  Musterweg ' },
      }),
    );

    expect(antwort.status).toBe(200);
    const koerper = await gelesen<GeocodeAntwort>(antwort);
    expect(koerper.ok && koerper.value.precision).toBe('address');
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode.mock.calls[0]).toEqual([ANSCHRIFT]);
    expect(route).not.toHaveBeenCalled();
  });

  it('nimmt eine Anschrift ohne Hausnummer an - die Genauigkeit sagt dann der Anbieter', async () => {
    const { adapter, geocode } = adapterMit({ ok: true, value: leereRoute() });
    const antwort = await handler(adapter)(
      anfrage({ aufgabe: 'geocode', address: { ...ANSCHRIFT, houseNumber: '' } }),
    );
    expect(antwort.status).toBe(200);
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ohne Anschrift', {}],
    ['ohne Strasse', { address: { ...ANSCHRIFT, street: ' ' } }],
    ['ohne Ort', { address: { ...ANSCHRIFT, city: '' } }],
    ['mit zu kurzer Postleitzahl', { address: { ...ANSCHRIFT, postalCode: '7' } }],
    ['mit Laendercode in Kleinschrift', { address: { ...ANSCHRIFT, countryCode: 'de' } }],
    ['mit zu langer Strasse', { address: { ...ANSCHRIFT, street: 'x'.repeat(201) } }],
    ['mit Zahl statt Text', { address: { ...ANSCHRIFT, houseNumber: 1 } }],
  ])('weist eine Anfrage %s ab, ohne den Anbieter zu fragen', async (_, rest) => {
    const { adapter, geocode } = adapterMit({ ok: true, value: leereRoute() });
    const antwort = await handler(adapter)(anfrage({ aufgabe: 'geocode', ...rest }));
    expect(antwort.status).toBe(400);
    expect(geocode).not.toHaveBeenCalled();
  });

  it('protokolliert einen fehlgeschlagenen Aufruf ohne Anschrift', async () => {
    const eintraege: Protokolleintrag[] = [];
    const { adapter } = adapterMit({ ok: true, value: leereRoute() }, LEERE_MATRIX, {
      ok: false,
      error: { code: 'not_found', message: 'ptv: kein Treffer' },
    });
    const antwort = await handler(adapter, { protokolliere: (e) => eintraege.push(e) })(
      anfrage({ aufgabe: 'geocode', address: ANSCHRIFT }),
    );

    expect(antwort.status).toBe(502);
    expect(JSON.stringify(eintraege)).not.toMatch(/Musterweg|72070|Tübingen/);
    expect(eintraege).toEqual([{ anbieter: 'prueflauf', code: 'not_found', dauerMs: 12 }]);
  });

  it('antwortet mit der Nachbildung und gibt sich als solche zu erkennen', async () => {
    const antwort = await handler(erstelleNachbildung())(
      anfrage({ aufgabe: 'geocode', address: ANSCHRIFT }),
    );
    const koerper = await gelesen<GeocodeAntwort>(antwort);
    expect(koerper.ok && koerper.quelle).toBe('nachbildung');
  });
});

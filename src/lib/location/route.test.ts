import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fordereRouteAn } from './route';

/**
 * Der Weg vom Browser zur eigenen Function (MAP-003b).
 *
 * Geprüft wird beides: was hinausgeht — nur Koordinaten und Profil — und dass
 * jede Antwort in einer Fehlerklasse landet, die die Oberfläche kennt. Eine
 * Ausnahme darf diese Schicht nicht verlassen.
 */

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke } }),
}));

const STOPPS = [
  { lat: 48.5216, lon: 9.0576 },
  { lat: 48.5305, lon: 9.049 },
];

const ROUTE = {
  distanceMeters: 3150,
  durationSeconds: 762,
  legs: [{ distanceMeters: 3150, durationSeconds: 762 }],
  geometry: STOPPS,
};

beforeEach(() => {
  invoke.mockReset();
});

describe('Routenabruf', () => {
  it('schickt nur Koordinaten und Profil an die eigene Function', async () => {
    invoke.mockResolvedValue({ data: { ok: true, value: ROUTE, quelle: 'anbieter' }, error: null });

    await fordereRouteAn(STOPPS, 'cargo_bicycle');

    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, optionen] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(name).toBe('location-provider');
    // `aufgabe` kam mit MAP-004 dazu, seit die Function zwei davon kennt. Es
    // ist ein Verb und sagt nichts über eine Person; die Feldliste bleibt
    // sonst dieselbe (ADR-019 Punkt 12).
    expect(Object.keys(optionen.body).sort()).toEqual(['aufgabe', 'profile', 'waypoints']);
    expect(optionen.body['aufgabe']).toBe('route');
    expect(optionen.body['profile']).toBe('cargo_bicycle');
    expect(optionen.body['waypoints']).toEqual(STOPPS);
  });

  it('liefert die Route mit der Angabe, woher sie stammt', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, value: ROUTE, quelle: 'nachbildung' },
      error: null,
    });

    const ergebnis = await fordereRouteAn(STOPPS, 'bicycle');

    expect(ergebnis).toEqual({ ok: true, value: { route: ROUTE, quelle: 'nachbildung' } });
  });

  it('liest die Fehlerklasse aus der Antwort und nicht aus der Meldung der Bibliothek', async () => {
    // Die Function antwortet mit einem Status ausserhalb 2xx; supabase-js
    // macht daraus einen Fehler und reicht die Antwort durch.
    invoke.mockResolvedValue({
      data: null,
      error: new Error('Edge Function returned a non-2xx status code'),
      response: new Response(
        JSON.stringify({ ok: false, error: { code: 'not_configured', message: 'x' } }),
        { status: 503 },
      ),
    });

    const ergebnis = await fordereRouteAn(STOPPS, 'bicycle');

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok === false && ergebnis.error.code).toBe('not_configured');
  });

  it('macht aus einem Netzfehler "Function antwortet nicht" statt einer Ausnahme', async () => {
    invoke.mockResolvedValue({ data: null, error: new TypeError('fetch failed') });

    const ergebnis = await fordereRouteAn(STOPPS, 'bicycle');

    // Nicht `unavailable`: Ueber den Kartendienst sagt ein Netzfehler zur
    // eigenen Function nichts (BEF-027).
    expect(ergebnis.ok === false && ergebnis.error.code).toBe('function_unavailable');
  });

  it('gibt einer Antwort der Plattform nicht dem Kartendienst die Schuld', async () => {
    // Genau so kam es im ersten Abnahmelauf: Kong antwortete 503 mit
    // „name resolution failed", weil die Laufzeit nicht lief - auf dem
    // Bildschirm stand „Kartendienst nicht erreichbar" (BEF-027).
    invoke.mockResolvedValue({
      data: null,
      error: new Error('Edge Function returned a non-2xx status code'),
      response: new Response(JSON.stringify({ message: 'name resolution failed' }), {
        status: 503,
      }),
    });

    const ergebnis = await fordereRouteAn(STOPPS, 'bicycle');

    expect(ergebnis.ok === false && ergebnis.error.code).toBe('function_unavailable');
    expect(ergebnis.ok === false && ergebnis.error.message).toContain('503');
  });

  it.each([401, 403])(
    'liest aus einer %i der Plattform eine ungueltige Sitzung',
    async (status) => {
      invoke.mockResolvedValue({
        data: null,
        error: new Error('non-2xx'),
        response: new Response(
          JSON.stringify({
            code: 'UNAUTHORIZED_NO_AUTH_HEADER',
            message: 'Missing authorization header',
          }),
          { status },
        ),
      });

      const ergebnis = await fordereRouteAn(STOPPS, 'bicycle');

      expect(ergebnis.ok === false && ergebnis.error.code).toBe('session_invalid');
    },
  );

  it.each([
    ['gar nichts', null],
    ['eine Zeichenkette', 'kaputt'],
    ['ein Objekt ohne Route', { ok: true, quelle: 'anbieter' }],
    ['eine Route ohne Geometrie', { ok: true, value: { ...ROUTE, geometry: undefined } }],
    ['einen Fehler ohne Klasse', { ok: false, error: {} }],
  ])('macht aus %s einen Fehler mit Klasse', async (_, koerper) => {
    invoke.mockResolvedValue({ data: koerper, error: null });

    const ergebnis = await fordereRouteAn(STOPPS, 'bicycle');

    expect(ergebnis.ok).toBe(false);
    // Was nicht im Format dieser Function kommt, ist keine Aussage ueber den
    // Anbieter - auch dann nicht, wenn der Status 200 lautet.
    expect(ergebnis.ok === false && ergebnis.error.code).toBe('function_unavailable');
  });

  it('traegt in keiner Meldung eine Koordinate der Anfrage', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new TypeError('POST https://instanz.invalid/functions/v1/... 48.5216 failed'),
    });

    const ergebnis = await fordereRouteAn(STOPPS, 'bicycle');

    expect(ergebnis.ok === false && ergebnis.error.message).not.toMatch(/48[.,]5|9[.,]05/);
  });
});

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
    expect(Object.keys(optionen.body).sort()).toEqual(['profile', 'waypoints']);
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

  it('macht aus einem Netzfehler "nicht erreichbar" statt einer Ausnahme', async () => {
    invoke.mockResolvedValue({ data: null, error: new TypeError('fetch failed') });

    const ergebnis = await fordereRouteAn(STOPPS, 'bicycle');

    expect(ergebnis.ok === false && ergebnis.error.code).toBe('unavailable');
  });

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
    expect(ergebnis.ok === false && ergebnis.error.code).toBe('unavailable');
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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fordereMatrixAn } from './matrix';

/**
 * Der Weg vom Browser zur Matrix (MAP-004a).
 *
 * Die Fehlerklassen teilt sie sich mit der Route und sind dort geprüft
 * (`route.test.ts`, `funktion.ts`). Hier steht, was die Matrix eigenes hat:
 * ihre Feldliste und die Prüfung, dass eine Antwort ohne verwertbare Matrix
 * nicht als leere Matrix durchgeht.
 */

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke } }),
}));

const STOPPS = [
  { lat: 48.5216, lon: 9.0576 },
  { lat: 48.5305, lon: 9.049 },
];

const MATRIX = {
  durationsSeconds: [
    [0, 660],
    [600, 0],
  ],
  distancesMeters: [
    [0, 2200],
    [2000, 0],
  ],
};

beforeEach(() => {
  invoke.mockReset();
});

describe('Matrixabruf', () => {
  it('schickt nur Koordinaten, Profil und die Aufgabe an die eigene Function', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, value: MATRIX, quelle: 'anbieter' },
      error: null,
    });

    await fordereMatrixAn(STOPPS, STOPPS, 'cargo_bicycle');

    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, optionen] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(name).toBe('location-provider');
    // Die Feldliste: kein Name, keine Kennung, keine Uhrzeit (ADR-019 Punkt 12).
    // `aufgabe` ist ein Verb und sagt nichts über eine Person.
    expect(Object.keys(optionen.body).sort()).toEqual([
      'aufgabe',
      'destinations',
      'origins',
      'profile',
    ]);
    expect(optionen.body['aufgabe']).toBe('matrix');
    expect(optionen.body['profile']).toBe('cargo_bicycle');
    expect(optionen.body['origins']).toEqual(STOPPS);
  });

  it('liefert die Matrix mit der Angabe, woher sie stammt', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, value: MATRIX, quelle: 'nachbildung' },
      error: null,
    });

    const ergebnis = await fordereMatrixAn(STOPPS, STOPPS, 'bicycle');

    expect(ergebnis).toEqual({ ok: true, value: { matrix: MATRIX, quelle: 'nachbildung' } });
  });

  it.each([
    ['gar nichts', null],
    ['ein Objekt ohne Matrix', { ok: true, quelle: 'anbieter' }],
    ['eine Matrix ohne Zeilen', { ok: true, value: { durationsSeconds: 'viele' } }],
    ['eine Zeile, die keine Liste ist', { ok: true, value: { durationsSeconds: [[0], 7] } }],
  ])('macht aus %s einen Fehler mit Klasse', async (_, koerper) => {
    invoke.mockResolvedValue({ data: koerper, error: null });

    const ergebnis = await fordereMatrixAn(STOPPS, STOPPS, 'bicycle');

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok === false && ergebnis.error.code).toBe('function_unavailable');
  });

  it('liest die Fehlerklasse aus der Antwort der Function', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new Error('Edge Function returned a non-2xx status code'),
      response: new Response(
        JSON.stringify({ ok: false, error: { code: 'rate_limited', message: 'x' } }),
        { status: 429 },
      ),
    });

    const ergebnis = await fordereMatrixAn(STOPPS, STOPPS, 'bicycle');

    expect(ergebnis.ok === false && ergebnis.error.code).toBe('rate_limited');
  });

  it('traegt in keiner Meldung eine Koordinate der Anfrage', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new TypeError('POST https://instanz.invalid/functions/v1/... 48.5216 failed'),
    });

    const ergebnis = await fordereMatrixAn(STOPPS, STOPPS, 'bicycle');

    expect(ergebnis.ok === false && ergebnis.error.message).not.toMatch(/48[.,]5|9[.,]05/);
    expect(ergebnis.ok === false && ergebnis.error.message).toMatch(/^matrix: /);
  });
});

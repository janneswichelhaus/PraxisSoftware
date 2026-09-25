import { beforeEach, describe, expect, it, vi } from 'vitest';
import { brauchtBestaetigung, geocodiere } from './geocode';

/**
 * Geocoding aus dem Browser (MAP-006a, ANN-016): was hinausgeht und wann
 * bestätigt werden muss.
 */

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke } }),
}));

const ANSCHRIFT = {
  street: 'Musterweg',
  houseNumber: '1',
  postalCode: '72070',
  city: 'Tübingen',
  countryCode: 'DE',
};

beforeEach(() => invoke.mockReset());

describe('Geocoding', () => {
  it('schickt nur die fuenf Felder der Anschrift und die Aufgabe', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        value: { position: { lat: 48.52, lon: 9.05 }, precision: 'address' },
        quelle: 'anbieter',
      },
      error: null,
    });

    // Ein zusaetzliches Feld am Objekt (etwa ein Name) geht nicht mit hinaus.
    const ergebnis = await geocodiere({ ...ANSCHRIFT, givenName: 'Erika' } as typeof ANSCHRIFT);

    const [, optionen] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(Object.keys(optionen.body).sort()).toEqual(['address', 'aufgabe']);
    expect(optionen.body['aufgabe']).toBe('geocode');
    expect(optionen.body['address']).toEqual(ANSCHRIFT);
    expect(ergebnis.ok && ergebnis.value.precision).toBe('address');
  });

  it('nimmt eine Antwort ohne gueltige Genauigkeit nicht als Treffer', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, value: { position: { lat: 1, lon: 2 }, precision: 'exakt' } },
      error: null,
    });
    const ergebnis = await geocodiere(ANSCHRIFT);
    expect(ergebnis.ok === false && ergebnis.error.code).toBe('function_unavailable');
  });

  it.each([
    ['address', false],
    ['street', true],
    ['locality', true],
    ['unknown', true],
  ] as const)('verlangt bei Genauigkeit %s eine Bestaetigung: %s', (precision, erwartet) => {
    expect(brauchtBestaetigung({ position: { lat: 0, lon: 0 }, precision })).toBe(erwartet);
  });
});

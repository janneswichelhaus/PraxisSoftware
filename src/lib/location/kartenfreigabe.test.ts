import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Die Frage der Karte an den Schalter (ABN-028, ADR-019 Punkt 35): offen nur
 * bei ausdrücklichem `mapReleased: true`, alles andere heißt zu.
 */

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke } }) }));

const { kartenFreigegeben } = await import('./kartenfreigabe');

describe('kartenFreigegeben', () => {
  beforeEach(() => invoke.mockReset());

  it('fragt die Function mit der Aufgabe status und nichts sonst', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, value: { mapReleased: true }, quelle: 'anbieter' },
      error: null,
    });
    expect(await kartenFreigegeben()).toBe(true);
    expect(invoke).toHaveBeenCalledWith('location-provider', { body: { aufgabe: 'status' } });
  });

  it.each([
    ['zu', { data: { ok: true, value: { mapReleased: false } }, error: null }],
    [
      'ein Fehler',
      { data: { ok: false, error: { code: 'not_configured', message: 'x' } }, error: null },
    ],
    ['eine fremde Antwort', { data: { ok: true, value: {} }, error: null }],
    ['keine Function', { data: null, error: new Error('weg'), response: undefined }],
  ])('heisst bei %s: zu', async (_, antwort) => {
    invoke.mockResolvedValue(antwort);
    expect(await kartenFreigegeben()).toBe(false);
  });
});

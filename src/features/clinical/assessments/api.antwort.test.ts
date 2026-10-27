import { describe, expect, it, vi } from 'vitest';

/**
 * Unerwartete Antwort beim Speichern einer Erhebung (BEF-070, Muster R3-023).
 */

const rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc }),
}));

const { erhebungSpeichern } = await import('./api');

describe('Unerwartete Antwortform bei der Erhebung', () => {
  it('meldet den deutschen Satz statt des Prüftexts', async () => {
    rpc.mockResolvedValue({ data: { id: 1 }, error: null });

    let satz = '';
    try {
      await erhebungSpeichern({
        patientId: '66666666-6666-4666-8666-000000000002',
        erhebungId: null,
        instrumentId: 'nrs',
        version: '1',
        datum: '2027-05-12',
        antworten: {},
        korrigiert: null,
        begruendung: null,
      });
    } catch (fehler) {
      satz = (fehler as Error).message;
    }

    expect(satz).toBe('Der Bogen konnte nicht gespeichert werden.');
    expect(satz.startsWith('[')).toBe(false);
    expect(satz).not.toMatch(/expected|invalid_type/);
  });
});

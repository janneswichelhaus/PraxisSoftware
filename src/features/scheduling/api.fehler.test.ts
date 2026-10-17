import { describe, expect, it, vi } from 'vitest';

/**
 * Abweisungen beim Pflegen einer Abweichung in Sätzen der Praxis.
 *
 * URL-001 (ANN-578): Ein Tag aus genehmigtem Urlaub lässt sich nicht
 * überschreiben - die Seite sagt, was stattdessen zu tun ist, statt eines
 * allgemeinen „konnte nicht gespeichert werden“.
 */

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

const { saveWorkingHourException } = await import('./api');

describe('saveWorkingHourException', () => {
  it('nennt den Urlaub, wenn der Tag zu genehmigtem Urlaub gehört', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'day is part of approved leave', code: '55000' },
    });
    await expect(
      saveWorkingHourException('55555555-5555-4555-8555-000000000002', '2027-05-04', false, []),
    ).rejects.toThrow('An diesem Tag hat die Person genehmigten Urlaub.');
  });

  it('nennt den Freizeitausgleich, wenn der Tag einen trägt (ZK-001)', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'day has time off in lieu', code: '55000' },
    });
    await expect(
      saveWorkingHourException('55555555-5555-4555-8555-000000000002', '2027-05-04', false, []),
    ).rejects.toThrow('An diesem Tag steht ein Freizeitausgleich im Zeitkonto.');
  });

  it('bleibt sonst beim allgemeinen Satz', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'kaputt' } });
    await expect(
      saveWorkingHourException('55555555-5555-4555-8555-000000000002', '2027-05-04', true, []),
    ).rejects.toThrow('Die Abweichung konnte nicht gespeichert werden.');
  });
});

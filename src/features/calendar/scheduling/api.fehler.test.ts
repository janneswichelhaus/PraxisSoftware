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

const { saveWorkingWeek } = await import('./api');

describe('saveWorkingWeek (Wochenplan in einem Zug)', () => {
  it('schickt die Tage in einem Aufruf', async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null });
    await saveWorkingWeek('55555555-5555-4555-8555-000000000002', [
      { tag: 1, bloecke: [{ von: '08:00', bis: '12:00' }] },
      { tag: 3, bloecke: [] },
    ]);
    expect(rpc).toHaveBeenLastCalledWith('set_staff_working_week', {
      p_staff_member_id: '55555555-5555-4555-8555-000000000002',
      p_days: [
        { weekday: 1, blocks: [{ von: '08:00', bis: '12:00' }] },
        { weekday: 3, blocks: [] },
      ],
    });
  });

  it('nennt den Tag, an dem es scheitert', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'day has time off in lieu', code: '55000', hint: 'weekday 3' },
    });
    await expect(
      saveWorkingWeek('55555555-5555-4555-8555-000000000002', [{ tag: 3, bloecke: [] }]),
    ).rejects.toThrow('Mittwoch: An diesem Tag steht ein Freizeitausgleich im Zeitkonto.');
  });

  it('bleibt ohne Tag beim allgemeinen Satz', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'kaputt' } });
    await expect(
      saveWorkingWeek('55555555-5555-4555-8555-000000000002', [{ tag: 1, bloecke: [] }]),
    ).rejects.toThrow(/^Der Wochenplan konnte nicht gespeichert werden\.$/);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Zeitkonto: Antworten des Servers in Sätzen der Praxis (BEF-180).
 */

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

const { withdrawEntry } = await import('./api');

beforeEach(() => {
  rpc.mockReset();
});

describe('withdrawEntry (BEF-180)', () => {
  it('sagt, dass die freie Zeit schon begonnen hat', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'time off has begun', code: '55000' },
    });
    await expect(withdrawEntry('eintrag-1')).rejects.toThrow(
      'Die freie Zeit hat schon begonnen – zurücknehmen geht nur vorher.',
    );
    expect(rpc).toHaveBeenCalledWith('withdraw_time_account_entry', { p_entry_id: 'eintrag-1' });
  });

  it('bleibt bei einem unbekannten Eintrag beim Satz dafür', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'time account entry not found', code: 'P0002' },
    });
    await expect(withdrawEntry('eintrag-1')).rejects.toThrow(
      'Diesen Eintrag gibt es nicht mehr, oder er ist schon zurückgenommen oder zurückgewiesen.',
    );
  });
});

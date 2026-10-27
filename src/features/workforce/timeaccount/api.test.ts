import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Zeitkonto: Antworten des Servers in Sätzen der Praxis und die schmale
 * Abfrage für die Übersicht (BEF-179, BEF-180).
 */

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

const { fetchRejectedTimeOff, withdrawEntry } = await import('./api');

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

describe('fetchRejectedTimeOff (BEF-179)', () => {
  it('liest Tag und Zeiten der eigenen Zurückweisungen ohne Angaben', async () => {
    const zeilen = [{ id: 'z1', on_date: '2026-10-22', starts_at: '08:00', ends_at: '10:00' }];
    rpc.mockResolvedValueOnce({ data: zeilen, error: null });
    await expect(fetchRejectedTimeOff()).resolves.toEqual(zeilen);
    expect(rpc).toHaveBeenCalledWith('list_rejected_time_off', {});
  });

  it('wirft bei unerwarteter Form einen Satz statt der Zod-Meldung', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'z1' }], error: null });
    await expect(fetchRejectedTimeOff()).rejects.toThrow(
      'Zurückgewiesene Freizeitausgleiche konnten nicht geladen werden.',
    );
  });
});

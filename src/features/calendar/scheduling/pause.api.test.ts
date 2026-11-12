import { describe, expect, it, vi } from 'vitest';

// Die Antworten von set_break_placement in Sätzen der Praxis; die 6-Stunden-Rückfrage als eigener Fehler.
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

const { PauseRueckfrage, setPausenlage } = await import('./pause');

const AUFTRAG = {
  staffMemberId: '55555555-5555-4555-8555-000000000002',
  datum: '2027-05-12',
  planVonMinute: 720,
  vonMinute: 615,
  bestaetigt: false,
};

describe('setPausenlage', () => {
  it('schickt Planbeginn und neue Lage als Uhrzeit', async () => {
    rpc.mockResolvedValueOnce({ data: 'moved', error: null });
    await expect(setPausenlage(AUFTRAG)).resolves.toBe('moved');
    expect(rpc).toHaveBeenLastCalledWith('set_break_placement', {
      p_staff_member_id: AUFTRAG.staffMemberId,
      p_date: '2027-05-12',
      p_plan_starts_at: '12:00',
      p_starts_at: '10:15',
      p_confirmed: false,
    });
  });

  it('macht aus mehr als 6 Stunden am Stück eine Rückfrage', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'more_than_six_hours_in_a_row', code: '22023' },
    });
    await expect(setPausenlage(AUFTRAG)).rejects.toBeInstanceOf(PauseRueckfrage);
  });

  it.each([
    ['break overlaps appointment', 'Dort liegt ein Termin.'],
    ['break outside working time', 'Die Pause bleibt in der Arbeitszeit des Tages.'],
    ['not allowed to move breaks', 'Die Pause verschiebt nur die Person selbst'],
    ['kaputt', 'Die Pause konnte nicht verschoben werden.'],
  ])('nennt „%s“ verständlich', async (message, satz) => {
    rpc.mockResolvedValueOnce({ data: null, error: { message } });
    await expect(setPausenlage(AUFTRAG)).rejects.toThrow(satz);
  });

  it('nimmt keine unerwartete Antwort als Erfolg', async () => {
    rpc.mockResolvedValueOnce({ data: 'irgendwas', error: null });
    await expect(setPausenlage(AUFTRAG)).rejects.toThrow(
      'Die Pause konnte nicht verschoben werden.',
    );
  });
});

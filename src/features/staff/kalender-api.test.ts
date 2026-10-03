import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `setzeKalender` (AKTE-009): Eine Abweisung kommt seit G6c als HTTP 403 ohne
 * Fehlerkörper. Ohne die Statusprüfung hielte die Oberfläche sie für einen
 * Erfolg (ANN-115).
 */
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc }),
}));

const { setzeKalender } = await import('./api');

const NINA = '55555555-5555-4555-8555-000000000005';

describe('setzeKalender', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('ruft den Server mit beiden Merkmalen', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 204 });
    await setzeKalender(NINA, { behandlung: true, training: false });
    expect(rpc).toHaveBeenCalledWith('set_staff_member_schedulable', {
      p_staff_member_id: NINA,
      p_treatment: true,
      p_training: false,
    });
  });

  it('meldet eine Abweisung mit HTTP 403 als Fehler, auch ohne Fehlerkörper', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 403 });
    await expect(setzeKalender(NINA, { behandlung: true, training: true })).rejects.toThrow(
      'Die Angabe zum Kalender konnte nicht gespeichert werden.',
    );
  });

  it('meldet einen Serverfehler', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' }, status: 400 });
    await expect(setzeKalender(NINA, { behandlung: false, training: false })).rejects.toThrow();
  });
});

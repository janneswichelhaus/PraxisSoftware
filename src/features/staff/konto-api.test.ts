import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Die Zustellung der Anmeldemail unterscheidet drei Fälle (ANN-025, R3-008).
 *
 * „Kein Konto" ist der Normalfall bei einer ersten Einladung und kein Fehler.
 * Ein **Netzfehler** ist aber auch kein „kein Konto": Wer das verwechselt,
 * schickt jemanden los, ein Konto anzulegen, das längst existiert.
 */

const signInWithOtp = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signInWithOtp } }),
}));

const { sendeZugangsMail } = await import('./konto-api');

describe('sendeZugangsMail', () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
  });

  it('meldet die zugestellte Mail', async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    expect(await sendeZugangsMail('nina.neu@praxis.invalid')).toBe('gesendet');
  });

  it('meldet ein fehlendes Konto als solches', async () => {
    signInWithOtp.mockResolvedValue({
      error: { name: 'AuthApiError', message: 'Signups not allowed for otp' },
    });
    expect(await sendeZugangsMail('nina.neu@praxis.invalid')).toBe('kein_konto');
  });

  it('meldet einen Netzfehler getrennt (R3-008)', async () => {
    signInWithOtp.mockResolvedValue({
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' },
    });
    expect(await sendeZugangsMail('nina.neu@praxis.invalid')).toBe('dienst_nicht_erreichbar');
  });
});

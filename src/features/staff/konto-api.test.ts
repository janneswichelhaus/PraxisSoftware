import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Die Zustellung der Anmeldemail unterscheidet drei Fälle (ANN-025, R3-008).
 *
 * „Kein Konto" ist der Normalfall bei einer ersten Einladung und kein Fehler.
 * Ein **Netzfehler** ist aber auch kein „kein Konto": Wer das verwechselt,
 * schickt jemanden los, ein Konto anzulegen, das längst existiert.
 */

const signInWithOtp = vi.fn();
const rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signInWithOtp }, rpc }),
}));

const { ladeZugangEin, sendeZugangsMail, setzeRollen } = await import('./konto-api');

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

/**
 * G6c, ANN-115: Eine abgewiesene Einladung kommt als HTTP 403 mit dem Körper
 * `null` zurück - supabase-js meldet dabei keinen Fehler. Die Mail darf dann
 * nicht hinausgehen.
 */
describe('Abweisung ohne Fehlerobjekt', () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    rpc.mockReset();
  });

  it('verschickt nach einer abgewiesenen Einladung keine Mail', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 403 });

    await expect(
      ladeZugangEin('55555555-5555-4555-8555-000000000009', 'nina.neu@praxis.invalid', [
        'therapist',
      ]),
    ).rejects.toThrow();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('meldet einen abgewiesenen Rollenwechsel als Fehler', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 403 });

    await expect(setzeRollen('55555555-5555-4555-8555-000000000002', ['office'])).rejects.toThrow();
  });
});

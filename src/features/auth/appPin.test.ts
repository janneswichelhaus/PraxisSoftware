import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

const { pinProblem, setzePin, gibMitPinFrei, ErneutAnmeldenError, PIN_SAETZE } =
  await import('./appPin');

describe('App-PIN im Client (ADR-025 Punkt 11, ANN-324)', () => {
  it.each([
    ['483920', null],
    ['000000', 'trivial'],
    ['123456', 'trivial'],
    ['456789', 'trivial'],
    ['654321', 'trivial'],
    ['12345', 'format'],
    ['12a456', 'format'],
  ])('%s ergibt %s - wie app.pin_problem im Server', (pin, erwartet) => {
    expect(pinProblem(pin)).toBe(erwartet);
  });

  it('fragt eine triviale PIN gar nicht erst beim Server an', async () => {
    await expect(setzePin('111111')).rejects.toThrow(PIN_SAETZE.trivial);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('verlangt nach zehn Minuten die Bestätigung mit dem Passkey (ANN-325)', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'reauthentication required' } });
    await expect(setzePin('483920')).rejects.toBeInstanceOf(ErneutAnmeldenError);
  });

  it('liest das Ergebnis eines Versuchs', async () => {
    rpc.mockResolvedValueOnce({ data: [{ unlocked: true, attempts_left: 5, consumed: false }] });
    expect(await gibMitPinFrei('483920')).toEqual({ art: 'frei' });
    rpc.mockResolvedValueOnce({ data: [{ unlocked: false, attempts_left: 2, consumed: false }] });
    expect(await gibMitPinFrei('111222')).toEqual({ art: 'falsch', versucheUebrig: 2 });
    rpc.mockResolvedValueOnce({ data: [{ unlocked: false, attempts_left: 0, consumed: true }] });
    expect(await gibMitPinFrei('111222')).toEqual({ art: 'verbraucht' });
  });

  it('wirft bei einer unerwarteten Antwort einen deutschen Satz', async () => {
    rpc.mockResolvedValueOnce({ data: [{ unlocked: 'ja' }] });
    await expect(gibMitPinFrei('483920')).rejects.toThrow('Die PIN konnte nicht geprüft werden.');
  });
});

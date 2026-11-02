import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke }, rpc }) }));

const { aboAdressen, beendeAbo, erzeugeAbo, fetchAboDienst, fetchEigenesAbo } =
  await import('./kalenderabo-api');

const ADRESSE = 'Zz09_-'.padEnd(43, 'q');

describe('Kalender-Abo im Browser (ANN-838)', () => {
  beforeEach(() => {
    invoke.mockReset();
    rpc.mockReset();
  });

  it('baut die Adresse für Google und Outlook und zum Öffnen im Kalender', () => {
    expect(aboAdressen(ADRESSE, 'https://instanz.test/')).toEqual({
      https: `https://instanz.test/functions/v1/calendar-feed/${ADRESSE}.ics`,
      webcal: `webcal://instanz.test/functions/v1/calendar-feed/${ADRESSE}.ics`,
    });
    expect(aboAdressen(ADRESSE, 'http://127.0.0.1:54321').webcal).toBe(
      `webcal://127.0.0.1:54321/functions/v1/calendar-feed/${ADRESSE}.ics`,
    );
  });

  it('nennt den Dienst nur bei klarer Antwort eingerichtet; ein Ausfall wirft', async () => {
    invoke.mockResolvedValue({ data: { ok: true, value: { verfuegbar: true } }, error: null });
    expect(await fetchAboDienst()).toBe(true);
    expect(invoke).toHaveBeenCalledWith('calendar-feed', { method: 'GET' });
    invoke.mockResolvedValue({ data: { ok: true, value: { verfuegbar: false } }, error: null });
    expect(await fetchAboDienst()).toBe(false);
    for (const antwort of [
      { data: null, error: new Error('weg') },
      { data: { ok: true, value: {} }, error: null },
      { data: 'irgendwas', error: null },
    ]) {
      invoke.mockResolvedValue(antwort);
      await expect(fetchAboDienst()).rejects.toThrow(
        'Das Kalender-Abo konnte nicht gefragt werden.',
      );
    }
  });

  it('liest nur, seit wann das Abo gilt', async () => {
    rpc.mockResolvedValue({ data: [{ created_at: '2026-11-02T17:00:00+00:00' }], error: null });
    expect(await fetchEigenesAbo()).toEqual({ seit: '2026-11-02T17:00:00+00:00' });
    expect(rpc).toHaveBeenCalledWith('get_own_calendar_feed');
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchEigenesAbo()).toBeNull();
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    await expect(fetchEigenesAbo()).rejects.toThrow();
  });

  it('nimmt nur eine Adresse in der erwarteten Form an', async () => {
    rpc.mockResolvedValue({ data: ADRESSE, error: null });
    expect(await erzeugeAbo()).toBe(ADRESSE);
    expect(rpc).toHaveBeenCalledWith('create_own_calendar_feed');
    for (const antwort of [
      { data: 'zu-kurz', error: null },
      { data: `${ADRESSE}/`, error: null },
      { data: null, error: { message: 'not allowed to subscribe a calendar' } },
    ]) {
      rpc.mockResolvedValue(antwort);
      await expect(erzeugeAbo()).rejects.toThrow('Die Abo-Adresse konnte nicht erzeugt werden.');
    }
  });

  it('beendet über die Datenbank und meldet einen Fehler', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await beendeAbo();
    expect(rpc).toHaveBeenCalledWith('end_own_calendar_feed');
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    await expect(beendeAbo()).rejects.toThrow('Das Abo konnte nicht beendet werden.');
  });
});

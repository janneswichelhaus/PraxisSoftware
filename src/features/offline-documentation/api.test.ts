import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc }),
}));

const { ENTWURF_ABWEISUNG, EntwurfAbgewiesen, EntwurfNichtAngekommen, entwurfUebertragen } =
  await import('./api');

/** OFF-002: Was der Server sagt, wird ein Urteil - oder bleibt keins (ADR-024 Punkt 8). */

const ENTWURF = {
  id: '0b8a3f8c-0000-4000-8000-000000000001',
  terminId: '0b8a3f8c-0000-4000-8000-000000000002',
  text: 'Synthetisch.',
  geschriebenAm: '2026-10-12T08:15:00Z',
};

beforeEach(() => rpc.mockReset());

describe('entwurfUebertragen', () => {
  it('sendet Kennung, Termin, Text und Zeit des Geräts', async () => {
    rpc.mockResolvedValue({ data: { status: 'created', note_id: 'n' }, error: null });
    expect(await entwurfUebertragen(ENTWURF)).toEqual({ status: 'created', note_id: 'n' });
    expect(rpc).toHaveBeenCalledWith('sync_offline_treatment_note', {
      p_offline_id: ENTWURF.id,
      p_appointment_id: ENTWURF.terminId,
      p_content: ENTWURF.text,
      p_written_at: ENTWURF.geschriebenAm,
    });
  });

  it.each([
    [
      { code: '42501', message: 'not allowed to write treatment documentation' },
      ENTWURF_ABWEISUNG.recht,
    ],
    [{ code: 'P0002', message: 'appointment not found' }, ENTWURF_ABWEISUNG.termin],
    [
      { code: '22023', message: 'cancelled appointment cannot be documented' },
      ENTWURF_ABWEISUNG.abgesagt,
    ],
    [
      { code: '22023', message: 'no-show appointment cannot be documented' },
      ENTWURF_ABWEISUNG.nichtAngetroffen,
    ],
    [{ code: '22023', message: 'invalid offline draft' }, ENTWURF_ABWEISUNG.form],
  ])('%o ist ein Urteil mit Satz', async (error, satz) => {
    rpc.mockResolvedValue({ data: null, error });
    const fehler = await entwurfUebertragen(ENTWURF).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(EntwurfAbgewiesen);
    expect((fehler as Error).message).toBe(satz);
  });

  it('gesperrte Sitzung (28000) und Funkloch sind kein Urteil', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '28000' } });
    const gesperrt = await entwurfUebertragen(ENTWURF).catch((e: unknown) => e);
    expect(gesperrt).not.toBeInstanceOf(EntwurfAbgewiesen);
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST000', message: 'fetch failed' } });
    const funkloch = await entwurfUebertragen(ENTWURF).catch((e: unknown) => e);
    expect(funkloch).not.toBeInstanceOf(EntwurfAbgewiesen);
  });

  it('ohne Sitzung (anon: permission denied) ist kein Urteil (Zweitreview B2)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for function sync_offline_treatment_note',
      },
    });
    const fehler = await entwurfUebertragen(ENTWURF).catch((e: unknown) => e);
    expect(fehler).not.toBeInstanceOf(EntwurfAbgewiesen);
    expect(fehler).not.toBeInstanceOf(EntwurfNichtAngekommen);
  });

  it('ein unbekannter Code betrifft nur diesen Entwurf (Zweitreview S5)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'trigger' } });
    expect(await entwurfUebertragen(ENTWURF).catch((e: unknown) => e)).toBeInstanceOf(
      EntwurfNichtAngekommen,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Wie der Client die Antworten des Servers auf eine Übertragung liest
 * (TRK-007, Zweitreview B1): Eine gesperrte Sitzung (28000) ist kein Urteil
 * über die Daten - sie bleiben auf dem Gerät; ein entzogener Zugang (42501)
 * und ein ungültiger Plan (P0002) sind es.
 */

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

const { einheitUebertragen, UebertragungAbgewiesen } = await import('./api');

const EINHEIT = {
  id: 'cccccccc-0000-4000-8000-000000000001',
  planId: 'aaaaaaaa-0000-4000-8000-000000000001',
  tag: '2026-10-12',
  begonnenAm: '2026-10-12T06:00:00Z',
  ereignisse: [],
};

beforeEach(() => rpc.mockReset());

describe('einheitUebertragen', () => {
  it('gesperrte Sitzung: kein Abweisen, die Einheit bleibt', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '28000' } });
    const fehler = await einheitUebertragen('zugang', EINHEIT).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(Error);
    expect(fehler).not.toBeInstanceOf(UebertragungAbgewiesen);
  });

  it('entzogener Zugang und ungültiger Plan: abgewiesen mit Grund', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(einheitUebertragen('zugang', EINHEIT)).rejects.toBeInstanceOf(
      UebertragungAbgewiesen,
    );
    rpc.mockResolvedValue({ data: null, error: { code: 'P0002' } });
    await expect(einheitUebertragen('zugang', EINHEIT)).rejects.toThrow(
      'Der Plan gilt nicht mehr.',
    );
  });

  it('nimmt „closed" als Antwort an', async () => {
    rpc.mockResolvedValue({
      data: { session_id: EINHEIT.id, status: 'closed', note_dropped: false },
      error: null,
    });
    await expect(einheitUebertragen('zugang', EINHEIT)).resolves.toMatchObject({
      status: 'closed',
    });
  });
});

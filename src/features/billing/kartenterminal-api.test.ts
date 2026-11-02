import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke } }) }));

const { fetchKartenterminal, kassiereMitKarte } = await import('./kartenterminal-api');

const RECHNUNG = '9a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';

function fehlerAntwort(koerper: unknown) {
  return {
    data: null,
    error: new Error('FunctionsHttpError'),
    response: new Response(JSON.stringify(koerper), { status: 409 }),
  };
}

describe('Kartenterminal im Browser (ANN-837)', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('nennt das Terminal nur bei ausdrücklichem Ja verfügbar', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, value: { verfuegbar: true, quelle: 'nachbildung' } },
      error: null,
    });
    expect(await fetchKartenterminal()).toEqual({ verfuegbar: true, nachbildung: true });

    for (const antwort of [
      { data: { ok: true, value: { verfuegbar: 'ja' } }, error: null },
      { data: null, error: new Error('weg') },
      { data: 'irgendwas', error: null },
    ]) {
      invoke.mockResolvedValue(antwort);
      expect(await fetchKartenterminal()).toEqual({ verfuegbar: false, nachbildung: false });
    }
    invoke.mockRejectedValue(new Error('Netz'));
    expect(await fetchKartenterminal()).toEqual({ verfuegbar: false, nachbildung: false });
  });

  it('schickt nur Rechnung und Betrag und meldet die Buchung', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, value: { zahlung: 'z1', transaktion: 'mock-1', quelle: 'nachbildung' } },
      error: null,
    });
    expect(await kassiereMitKarte(RECHNUNG, 14000)).toEqual({
      ok: true,
      transaktion: 'mock-1',
      nachbildung: true,
    });
    expect(invoke).toHaveBeenCalledWith('card-terminal', {
      body: { rechnung: RECHNUNG, betrag_cent: 14000 },
    });
  });

  it('hat für jeden Ausgang einen Satz, und bei „nicht gebucht“ die Kennung', async () => {
    invoke.mockResolvedValue(
      fehlerAntwort({ ok: false, error: { code: 'declined', message: 'x' } }),
    );
    expect(await kassiereMitKarte(RECHNUNG, 100)).toEqual({
      ok: false,
      satz: 'Die Karte wurde abgelehnt. Nichts gebucht.',
    });

    invoke.mockResolvedValue(
      fehlerAntwort({
        ok: false,
        error: { code: 'not_payable', message: 'x', detail: 'open_amount' },
      }),
    );
    expect(await kassiereMitKarte(RECHNUNG, 100)).toEqual({
      ok: false,
      satz: 'Der Betrag ist höher als offen. Nichts gebucht.',
    });

    invoke.mockResolvedValue(
      fehlerAntwort({
        ok: false,
        error: { code: 'not_booked', message: 'x', transaktion: 'mock-2' },
      }),
    );
    expect(await kassiereMitKarte(RECHNUNG, 100)).toEqual({
      ok: false,
      satz: 'Am Terminal bezahlt, aber nicht gebucht. Bitte von Hand als Karte buchen.',
      transaktion: 'mock-2',
    });
  });

  it('sagt bei unklarem Ausgang, am Terminal nachzusehen', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('weg') });
    const unklar = await kassiereMitKarte(RECHNUNG, 100);
    expect(unklar.ok).toBe(false);
    expect(unklar.ok ? '' : unklar.satz).toMatch(/am Terminal nachsehen/);
    invoke.mockRejectedValue(new Error('Netz'));
    expect(await kassiereMitKarte(RECHNUNG, 100)).toEqual({
      ok: false,
      satz: 'Das Terminal ist nicht erreichbar. Nichts gebucht.',
    });
  });
});

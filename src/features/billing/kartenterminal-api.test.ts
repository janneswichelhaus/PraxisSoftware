import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke }, rpc }) }));

const { bucheKartenzahlungNach, fetchKartenterminal, kassiereMitKarte } =
  await import('./kartenterminal-api');

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
    rpc.mockReset();
  });

  it('nennt das Terminal nur bei ausdrücklichem Ja verfügbar; ein Ausfall wirft statt „nein“', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, value: { verfuegbar: true, quelle: 'nachbildung' } },
      error: null,
    });
    expect(await fetchKartenterminal()).toEqual({ verfuegbar: true, nachbildung: true });
    invoke.mockResolvedValue({
      data: { ok: true, value: { verfuegbar: false, quelle: null } },
      error: null,
    });
    expect(await fetchKartenterminal()).toEqual({ verfuegbar: false, nachbildung: false });

    for (const antwort of [
      { data: { ok: true, value: { verfuegbar: 'ja' } }, error: null },
      { data: null, error: new Error('weg') },
      { data: 'irgendwas', error: null },
    ]) {
      invoke.mockResolvedValue(antwort);
      await expect(fetchKartenterminal()).rejects.toThrow(
        'Das Terminal konnte nicht gefragt werden.',
      );
    }
    invoke.mockRejectedValue(new Error('Netz'));
    await expect(fetchKartenterminal()).rejects.toThrow();
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
      art: 'nichts_gebucht',
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
      art: 'nichts_gebucht',
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
      art: 'nicht_gebucht',
      satz: 'Am Terminal bezahlt, aber nicht gebucht.',
      transaktion: 'mock-2',
    });
  });

  it('nennt einen Ausgang ohne klare Antwort unklar: erst am Terminal nachsehen', async () => {
    for (const fall of [
      () => invoke.mockResolvedValue({ data: null, error: new Error('weg') }),
      () =>
        invoke.mockResolvedValue(
          fehlerAntwort({ ok: false, error: { code: 'timeout', message: 'x' } }),
        ),
      () => invoke.mockResolvedValue({ data: { ok: true, value: {} }, error: null }),
      () => invoke.mockRejectedValue(new Error('Netz')),
    ]) {
      fall();
      const unklar = await kassiereMitKarte(RECHNUNG, 100);
      expect(unklar).toMatchObject({ ok: false, art: 'unklar' });
      expect(unklar.ok ? '' : unklar.satz).toMatch(/am Terminal nachsehen/);
    }
  });

  it('bucht mit derselben Kennung nach, über die Datenbank und ohne Terminal', async () => {
    rpc.mockResolvedValue({ error: null });
    expect(await bucheKartenzahlungNach(RECHNUNG, 14000, 'mock-9')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('record_card_payment', {
      p_invoice_id: RECHNUNG,
      p_amount_cents: 14000,
      p_terminal_transaction: 'mock-9',
    });
    expect(invoke).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ error: { message: 'terminal transaction already booked' } });
    expect(await bucheKartenzahlungNach(RECHNUNG, 14000, 'mock-9')).toBe(false);
  });
});

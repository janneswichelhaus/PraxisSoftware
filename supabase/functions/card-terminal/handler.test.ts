import { describe, expect, it, vi } from 'vitest';
import { erstelleHandler } from './handler.ts';
import type { Kasse } from './kasse.ts';
import { erstelleNachbildung } from './mock.ts';
import type { Sitzungspruefung } from './sitzung.ts';
import type { Terminaladapter, Zahlauftrag } from './typen.ts';

const RECHNUNG = '9a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const REFERENZ = '0b7d1c2e-3f4a-4b5c-8d6e-7f8091a2b3c4';
const ZAHLUNG = 'b1c2d3e4-0000-4000-8000-000000000001';

const gueltig: Sitzungspruefung = () => Promise.resolve({ befund: 'gueltig' });

function kasse(teil: Partial<Kasse> = {}): Kasse {
  return {
    pruefe: vi.fn(() => Promise.resolve({ ok: true as const, waehrung: 'EUR' })),
    buche: vi.fn(() => Promise.resolve({ ok: true as const, zahlung: ZAHLUNG })),
    ...teil,
  };
}

function anfrage(methode: string, koerper?: unknown): Request {
  return new Request('http://function.test/card-terminal', {
    method: methode,
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    ...(koerper === undefined ? {} : { body: JSON.stringify(koerper) }),
  });
}

async function lies(
  antwort: Response,
): Promise<{ status: number; koerper: Record<string, unknown> }> {
  return { status: antwort.status, koerper: (await antwort.json()) as Record<string, unknown> };
}

const KASSIEREN = { rechnung: RECHNUNG, betrag_cent: 14000 };

describe('Handler der Kartenzahlung', () => {
  it('beantwortet die Vorabanfrage und lässt nur GET und POST zu', async () => {
    const handler = erstelleHandler({ adapter: null, pruefeSitzung: gueltig, kasse: kasse() });
    expect((await handler(anfrage('OPTIONS'))).status).toBe(204);
    expect((await handler(anfrage('PUT'))).status).toBe(405);
  });

  it('gibt ohne gültige Sitzung nichts heraus', async () => {
    const handler = erstelleHandler({
      adapter: erstelleNachbildung(),
      pruefeSitzung: () => Promise.resolve({ befund: 'abgelehnt' }),
      kasse: kasse(),
    });
    expect(await lies(await handler(anfrage('GET')))).toMatchObject({ status: 401 });
    expect(await lies(await handler(anfrage('POST', KASSIEREN)))).toMatchObject({ status: 401 });
  });

  it('sagt auf GET, ob kassiert werden kann, und woher die Antwort käme', async () => {
    const mit = erstelleHandler({
      adapter: erstelleNachbildung(),
      pruefeSitzung: gueltig,
      kasse: kasse(),
    });
    expect(await lies(await mit(anfrage('GET')))).toEqual({
      status: 200,
      koerper: { ok: true, value: { verfuegbar: true, quelle: 'nachbildung' } },
    });
    const ohne = erstelleHandler({ adapter: null, pruefeSitzung: gueltig, kasse: kasse() });
    expect(await lies(await ohne(anfrage('GET')))).toEqual({
      status: 200,
      koerper: { ok: true, value: { verfuegbar: false, quelle: null } },
    });
  });

  it('kassiert ohne Terminal nicht und fragt dann auch die Datenbank nicht', async () => {
    const k = kasse();
    const handler = erstelleHandler({ adapter: null, pruefeSitzung: gueltig, kasse: k });
    expect((await handler(anfrage('POST', KASSIEREN))).status).toBe(503);
    expect(k.pruefe).not.toHaveBeenCalled();
  });

  it.each([
    [{ rechnung: RECHNUNG }],
    [{ ...KASSIEREN, name: 'Erika' }],
    [{ rechnung: 'keine-kennung', betrag_cent: 100 }],
    [{ rechnung: RECHNUNG, betrag_cent: 0 }],
    [{ rechnung: RECHNUNG, betrag_cent: 12.5 }],
    [{ rechnung: RECHNUNG, betrag_cent: 10_000_001 }],
    [[RECHNUNG, 100]],
  ])('weist einen Auftrag in falscher Form ab: %j', async (koerper) => {
    const handler = erstelleHandler({
      adapter: erstelleNachbildung(),
      pruefeSitzung: gueltig,
      kasse: kasse(),
    });
    expect((await handler(anfrage('POST', koerper))).status).toBe(400);
  });

  it('belastet keine Karte, wenn die Datenbank vorab nein sagt', async () => {
    const kassiere = vi.fn();
    const adapter: Terminaladapter = { id: 'mock', quelle: 'nachbildung', kassiere };
    for (const [antwort, status, code] of [
      [{ ok: false, grund: 'verweigert' }, 403, 'forbidden'],
      [{ ok: false, grund: 'nicht_zahlbar', detail: 'open_amount' }, 409, 'not_payable'],
      [{ ok: false, grund: 'abgelehnt' }, 401, 'session_invalid'],
      [{ ok: false, grund: 'nicht_pruefbar' }, 502, 'unavailable'],
    ] as const) {
      const handler = erstelleHandler({
        adapter,
        pruefeSitzung: gueltig,
        kasse: kasse({ pruefe: () => Promise.resolve(antwort) }),
      });
      const { status: echt, koerper } = await lies(await handler(anfrage('POST', KASSIEREN)));
      expect(echt).toBe(status);
      expect((koerper['error'] as { code: string }).code).toBe(code);
    }
    expect(kassiere).not.toHaveBeenCalled();
  });

  it('gibt dem Terminal nur Betrag, Währung und eine zufällige Referenz', async () => {
    const auftraege: Zahlauftrag[] = [];
    const adapter: Terminaladapter = {
      id: 'mock',
      quelle: 'nachbildung',
      kassiere: (auftrag) => {
        auftraege.push(auftrag);
        return Promise.resolve({ status: 'angenommen', transaktion: 'mock-1' });
      },
    };
    const k = kasse();
    const handler = erstelleHandler({
      adapter,
      pruefeSitzung: gueltig,
      kasse: k,
      neueReferenz: () => REFERENZ,
    });
    expect(await lies(await handler(anfrage('POST', KASSIEREN)))).toEqual({
      status: 200,
      koerper: {
        ok: true,
        value: { zahlung: ZAHLUNG, transaktion: 'mock-1', quelle: 'nachbildung' },
      },
    });
    expect(auftraege).toEqual([{ betragCent: 14000, waehrung: 'EUR', referenz: REFERENZ }]);
    expect(k.buche).toHaveBeenCalledWith('Bearer t', RECHNUNG, 14000, 'mock-1');
  });

  it('bucht nichts, wenn das Terminal ablehnt, abbricht, schweigt oder ausfällt', async () => {
    for (const [ergebnis, status, code] of [
      [{ status: 'abgelehnt' }, 402, 'declined'],
      [{ status: 'abgebrochen' }, 409, 'cancelled'],
      [{ status: 'nicht_erreichbar' }, 502, 'unavailable'],
    ] as const) {
      const k = kasse();
      const handler = erstelleHandler({
        adapter: { id: 'mock', quelle: 'nachbildung', kassiere: () => Promise.resolve(ergebnis) },
        pruefeSitzung: gueltig,
        kasse: k,
      });
      const antwort = await lies(await handler(anfrage('POST', KASSIEREN)));
      expect(antwort.status).toBe(status);
      expect((antwort.koerper['error'] as { code: string }).code).toBe(code);
      expect(k.buche).not.toHaveBeenCalled();
    }

    const k = kasse();
    const stumm = erstelleHandler({
      adapter: { id: 'mock', quelle: 'nachbildung', kassiere: () => new Promise(() => undefined) },
      pruefeSitzung: gueltig,
      kasse: k,
      fristMs: 10,
    });
    expect((await stumm(anfrage('POST', KASSIEREN))).status).toBe(504);
    const kaputt = erstelleHandler({
      adapter: {
        id: 'mock',
        quelle: 'nachbildung',
        kassiere: () => Promise.reject(new Error('x')),
      },
      pruefeSitzung: gueltig,
      kasse: k,
    });
    expect((await kaputt(anfrage('POST', KASSIEREN))).status).toBe(502);
    expect(k.buche).not.toHaveBeenCalled();
  });

  it('nennt die Kennung, wenn abgebucht, aber nicht gebucht wurde', async () => {
    const handler = erstelleHandler({
      adapter: erstelleNachbildung(),
      pruefeSitzung: gueltig,
      kasse: kasse({ buche: () => Promise.resolve({ ok: false, grund: 'nicht_pruefbar' }) }),
      neueReferenz: () => REFERENZ,
    });
    expect(await lies(await handler(anfrage('POST', KASSIEREN)))).toEqual({
      status: 409,
      koerper: {
        ok: false,
        error: {
          code: 'not_booked',
          message: 'abgebucht, nicht gebucht',
          transaktion: `mock-${REFERENZ}`,
        },
      },
    });
  });

  it('antwortet ohne Zwischenspeicher', async () => {
    const handler = erstelleHandler({
      adapter: erstelleNachbildung(),
      pruefeSitzung: gueltig,
      kasse: kasse(),
    });
    expect((await handler(anfrage('GET'))).headers.get('Cache-Control')).toBe('no-store');
  });
});

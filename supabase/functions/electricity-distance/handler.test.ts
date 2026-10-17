import { describe, expect, it } from 'vitest';
import type { Anbieteradapter } from '../location-provider/typen.ts';
import { erstelleNachbildung } from '../location-provider/mock.ts';
import { createHandler, type Reply } from './handler.ts';
import type { Instance, Result } from './instance.ts';

/**
 * BEF-181: der Ablauf der Function - Sitzung, Pfad, Einrichtung, Wegpunkte
 * aus der eigenen Instanz, Strecke, Eintragen nur auf dem Weg `record`.
 */

const KONTO = '11111111-1111-4111-8111-000000000002';
const ANTRAG = '99999999-9999-4999-8999-000000000001';
const TAG = [
  { lat: 48.5216, lon: 9.0576 },
  { lat: 48.5305, lon: 9.049 },
  { lat: 48.5216, lon: 9.0576 },
];

interface Protokoll {
  punkte: { authorization: string; month: string }[];
  eingetragen: { id: string; konto: string; monat: string; km: number }[];
}

function instanz(
  opts: {
    konto?: Result<string | null>;
    punkte?: Result<{ lat: number; lon: number }[][]>;
    eintragen?: Result<{ km: number; amountCents: number }>;
  } = {},
  protokoll: Protokoll = { punkte: [], eingetragen: [] },
): Instance {
  return {
    account: () => Promise.resolve(opts.konto ?? { ok: true, value: KONTO }),
    tourPoints: (authorization, month) => {
      protokoll.punkte.push({ authorization, month });
      return Promise.resolve(opts.punkte ?? { ok: true, value: [TAG] });
    },
    record: (id, konto, monat, km) => {
      protokoll.eingetragen.push({ id, konto, monat, km });
      return Promise.resolve(opts.eintragen ?? { ok: true, value: { km, amountCents: 999 } });
    },
  };
}

/** Ein Anbieter, der je Route eine feste Länge liefert. */
function anbieter(meter: number | null): Anbieteradapter {
  return {
    ...erstelleNachbildung(),
    route: () =>
      Promise.resolve(
        meter === null
          ? { ok: false, error: { code: 'timeout', message: 'location-provider: zu langsam' } }
          : {
              ok: true,
              value: { distanceMeters: meter, durationSeconds: 1, legs: [], geometry: [] },
            },
      ),
  };
}

function anfrage(
  pfad: 'preview' | 'record' | 'anders',
  koerper: unknown,
  opts: { methode?: string; token?: string | null } = {},
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.token !== null) headers.set('Authorization', opts.token ?? 'Bearer abc');
  return new Request(`http://instanz.invalid/electricity-distance/${pfad}`, {
    method: opts.methode ?? 'POST',
    headers,
    ...(opts.methode === 'OPTIONS' || opts.methode === 'GET'
      ? {}
      : { body: JSON.stringify(koerper) }),
  });
}

async function lies(antwort: Response): Promise<Reply> {
  return (await antwort.json()) as Reply;
}

describe('electricity-distance', () => {
  it('beantwortet die Vorabanfrage und nimmt nur POST', async () => {
    const handler = createHandler({ instance: instanz(), adapter: anbieter(1000) });
    expect((await handler(anfrage('preview', null, { methode: 'OPTIONS' }))).status).toBe(204);
    expect((await handler(anfrage('preview', null, { methode: 'GET' }))).status).toBe(405);
  });

  it('rechnet nichts ohne Einrichtung, ohne Sitzung oder ohne Anbieter', async () => {
    const ohneInstanz = createHandler({ instance: null, adapter: anbieter(1000) });
    expect((await ohneInstanz(anfrage('preview', { month: '2026-09-01' }))).status).toBe(503);

    const protokoll: Protokoll = { punkte: [], eingetragen: [] };
    const ohneSitzung = createHandler({
      instance: instanz({ konto: { ok: true, value: null } }, protokoll),
      adapter: anbieter(1000),
    });
    expect((await ohneSitzung(anfrage('preview', { month: '2026-09-01' }))).status).toBe(401);
    const ohneToken = createHandler({ instance: instanz({}, protokoll), adapter: anbieter(1000) });
    expect(
      (await ohneToken(anfrage('preview', { month: '2026-09-01' }, { token: null }))).status,
    ).toBe(401);

    const ohneAnbieter = createHandler({ instance: instanz({}, protokoll), adapter: null });
    const antwort = await ohneAnbieter(anfrage('preview', { month: '2026-09-01' }));
    expect(antwort.status).toBe(503);
    expect(await lies(antwort)).toEqual({ ok: false, error: 'not_configured' });
    expect(protokoll.punkte).toEqual([]);
  });

  it('weist einen unbekannten Pfad und eine unvollständige Anfrage ab', async () => {
    const handler = createHandler({ instance: instanz(), adapter: anbieter(1000) });
    expect((await handler(anfrage('anders', { month: '2026-09-01' }))).status).toBe(400);
    expect((await handler(anfrage('preview', { month: '2026-09-15' }))).status).toBe(400);
    expect((await handler(anfrage('preview', { month: 202609 }))).status).toBe(400);
    expect((await handler(anfrage('record', { month: '2026-09-01' }))).status).toBe(400);
    expect(
      (await handler(anfrage('record', { month: '2026-09-01', reimbursementId: 'x' }))).status,
    ).toBe(400);
  });

  it('zeigt auf dem Weg preview die Kilometer und trägt nichts ein', async () => {
    const protokoll: Protokoll = { punkte: [], eingetragen: [] };
    const handler = createHandler({ instance: instanz({}, protokoll), adapter: anbieter(20_600) });
    const antwort = await handler(anfrage('preview', { month: '2026-09-01' }));
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    expect(await lies(antwort)).toEqual({ ok: true, value: { km: 21 }, quelle: 'nachbildung' });
    expect(protokoll.punkte).toEqual([{ authorization: 'Bearer abc', month: '2026-09-01' }]);
    expect(protokoll.eingetragen).toEqual([]);
  });

  it('trägt auf dem Weg record die Summe für das geprüfte Konto ein', async () => {
    const protokoll: Protokoll = { punkte: [], eingetragen: [] };
    const handler = createHandler({ instance: instanz({}, protokoll), adapter: anbieter(20_600) });
    const antwort = await handler(
      anfrage('record', { month: '2026-09-01', reimbursementId: ANTRAG }),
    );
    expect(await lies(antwort)).toEqual({
      ok: true,
      value: { km: 21, amountCents: 999 },
      quelle: 'nachbildung',
    });
    expect(protokoll.eingetragen).toEqual([
      { id: ANTRAG, konto: KONTO, monat: '2026-09-01', km: 21 },
    ]);
  });

  it('trägt ohne Tour oder ohne Ergebnis nichts ein und sagt km: null', async () => {
    const protokoll: Protokoll = { punkte: [], eingetragen: [] };
    const ohneTour = createHandler({
      instance: instanz({ punkte: { ok: true, value: [] } }, protokoll),
      adapter: anbieter(1000),
    });
    expect(
      await lies(
        await ohneTour(anfrage('record', { month: '2026-09-01', reimbursementId: ANTRAG })),
      ),
    ).toEqual({ ok: true, value: { km: null }, quelle: 'nachbildung' });

    const ohneRoute = createHandler({ instance: instanz({}, protokoll), adapter: anbieter(null) });
    expect(
      await lies(
        await ohneRoute(anfrage('record', { month: '2026-09-01', reimbursementId: ANTRAG })),
      ),
    ).toEqual({ ok: true, value: { km: null }, quelle: 'nachbildung' });
    expect(protokoll.eingetragen).toEqual([]);
  });

  it('gibt eine Abweisung der Datenbank als not_allowed weiter, einen Ausfall als unavailable', async () => {
    const abgewiesen = createHandler({
      instance: instanz({ punkte: { ok: false, reason: 'refused' } }),
      adapter: anbieter(1000),
    });
    expect((await abgewiesen(anfrage('preview', { month: '2026-09-01' }))).status).toBe(403);

    const nichtPassend = createHandler({
      instance: instanz({ eintragen: { ok: false, reason: 'refused' } }),
      adapter: anbieter(5000),
    });
    expect(
      (await nichtPassend(anfrage('record', { month: '2026-09-01', reimbursementId: ANTRAG })))
        .status,
    ).toBe(403);

    const ausfall = createHandler({
      instance: instanz({ konto: { ok: false, reason: 'unavailable' } }),
      adapter: anbieter(1000),
    });
    expect((await ausfall(anfrage('preview', { month: '2026-09-01' }))).status).toBe(502);
  });

  it('gibt keine Wegpunkte an den Browser zurück', async () => {
    const handler = createHandler({ instance: instanz(), adapter: anbieter(20_600) });
    const text = await (await handler(anfrage('preview', { month: '2026-09-01' }))).text();
    expect(text).not.toContain('48.5');
  });
});

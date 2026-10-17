import { describe, expect, it } from 'vitest';
import { createInstance, missingSetup, parseTourPoints } from './instance.ts';

/** BEF-181: die drei Aufrufe an die eigene Instanz, ohne Laufzeit. */

const SETUP = {
  supabaseUrl: 'http://instanz.invalid/',
  serviceKey: 'dienst-schluessel',
  anonKey: 'anon-schluessel',
};
const KONTO = '11111111-1111-4111-8111-000000000002';
const ANTRAG = '99999999-9999-4999-8999-000000000001';

interface Aufruf {
  url: string;
  init: RequestInit;
}

function abrufen(antworten: Response[], aufrufe: Aufruf[] = []): typeof fetch {
  return (url, init) => {
    aufrufe.push({ url: url instanceof Request ? url.url : url.toString(), init: init ?? {} });
    const antwort = antworten.shift();
    return antwort ? Promise.resolve(antwort) : Promise.reject(new Error('kein Netz'));
  };
}

function json(wert: unknown, status = 200): Response {
  return new Response(JSON.stringify(wert), { status });
}

function kopf(aufruf: Aufruf, name: string): string | undefined {
  return (aufruf.init.headers as Record<string, string>)[name];
}

describe('missingSetup', () => {
  it('nennt fehlende Einrichtung beim Namen, ohne Werte', () => {
    expect(missingSetup({ supabaseUrl: '', serviceKey: ' ', anonKey: 'x' })).toEqual([
      'SUPABASE_URL',
      'ELECTRICITY_DISTANCE_SERVICE_KEY',
    ]);
    expect(missingSetup(SETUP)).toEqual([]);
  });
});

describe('account', () => {
  it('fragt den Anmeldedienst mit dem Token der Person und dem öffentlichen Schlüssel', async () => {
    const aufrufe: Aufruf[] = [];
    const instanz = createInstance(SETUP, abrufen([json({ id: KONTO })], aufrufe));
    expect(await instanz.account('Bearer abc')).toEqual({ ok: true, value: KONTO });
    expect(aufrufe[0]!.url).toBe('http://instanz.invalid/auth/v1/user');
    expect(kopf(aufrufe[0]!, 'Authorization')).toBe('Bearer abc');
    expect(kopf(aufrufe[0]!, 'apikey')).toBe('anon-schluessel');
  });

  it('kennt ohne Token, mit abgelehntem Token oder ohne Kennung niemanden', async () => {
    expect(await createInstance(SETUP, abrufen([])).account(null)).toEqual({
      ok: true,
      value: null,
    });
    expect(await createInstance(SETUP, abrufen([json({}, 401)])).account('Bearer x')).toEqual({
      ok: true,
      value: null,
    });
    expect(
      await createInstance(SETUP, abrufen([json({ id: 'keine-uuid' })])).account('Bearer x'),
    ).toEqual({ ok: true, value: null });
  });

  it('unterscheidet einen Ausfall des Anmeldedienstes von einer abgelehnten Sitzung', async () => {
    expect(await createInstance(SETUP, abrufen([json({}, 503)])).account('Bearer x')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(await createInstance(SETUP, abrufen([])).account('Bearer x')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});

describe('tourPoints', () => {
  it('holt die Wegpunkte mit dem Token der Person, nie mit dem Dienstschlüssel', async () => {
    const aufrufe: Aufruf[] = [];
    const tage = [
      [
        { lat: 48.52, lon: 9.05 },
        { lat: 48.53, lon: 9.04 },
      ],
    ];
    const instanz = createInstance(SETUP, abrufen([json(tage)], aufrufe));
    expect(await instanz.tourPoints('Bearer abc', '2026-09-01')).toEqual({ ok: true, value: tage });
    expect(aufrufe[0]!.url).toBe('http://instanz.invalid/rest/v1/rpc/electricity_tour_points');
    expect(kopf(aufrufe[0]!, 'Authorization')).toBe('Bearer abc');
    expect(kopf(aufrufe[0]!, 'apikey')).toBe('anon-schluessel');
    expect(JSON.stringify(aufrufe[0]!.init)).not.toContain('dienst-schluessel');
    expect(JSON.parse(aufrufe[0]!.init.body as string)).toEqual({ p_month: '2026-09-01' });
  });

  it('meldet eine Abweisung der Datenbank als abgewiesen, einen Ausfall als Ausfall', async () => {
    expect(
      await createInstance(SETUP, abrufen([json({ code: '42501' }, 403)])).tourPoints(
        'Bearer x',
        '2026-09-01',
      ),
    ).toEqual({ ok: false, reason: 'refused' });
    expect(
      await createInstance(SETUP, abrufen([json({}, 500)])).tourPoints('Bearer x', '2026-09-01'),
    ).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('parseTourPoints', () => {
  it('nimmt nur Listen von Koordinaten auf der Erdkugel', () => {
    expect(parseTourPoints([[{ lat: 1, lon: 2 }]])).toEqual([[{ lat: 1, lon: 2 }]]);
    expect(parseTourPoints([])).toEqual([]);
    expect(parseTourPoints({})).toBeNull();
    expect(parseTourPoints([[{ lat: 91, lon: 2 }]])).toBeNull();
    expect(parseTourPoints([[{ lat: '1', lon: 2 }]])).toBeNull();
    expect(parseTourPoints([{ lat: 1, lon: 2 }])).toBeNull();
  });
});

describe('record', () => {
  it('trägt mit dem Dienstschlüssel ein und nennt Antrag, Konto und Kilometer', async () => {
    const aufrufe: Aufruf[] = [];
    const instanz = createInstance(
      SETUP,
      abrufen([json({ id: ANTRAG, tour_km: 412, amount_cents: 274 })], aufrufe),
    );
    expect(await instanz.record(ANTRAG, KONTO, '2026-09-01', 412)).toEqual({
      ok: true,
      value: { km: 412, amountCents: 274 },
    });
    expect(aufrufe[0]!.url).toBe(
      'http://instanz.invalid/rest/v1/rpc/record_electricity_tour_distance',
    );
    expect(kopf(aufrufe[0]!, 'Authorization')).toBe('Bearer dienst-schluessel');
    expect(JSON.parse(aufrufe[0]!.init.body as string)).toEqual({
      p_reimbursement_id: ANTRAG,
      p_account_id: KONTO,
      p_month: '2026-09-01',
      p_km: 412,
    });
  });

  it('meldet einen nicht passenden Antrag als abgewiesen', async () => {
    const instanz = createInstance(SETUP, abrufen([json({ code: 'P0002' }, 404)]));
    expect(await instanz.record(ANTRAG, KONTO, '2026-09-01', 412)).toEqual({
      ok: false,
      reason: 'refused',
    });
  });
});

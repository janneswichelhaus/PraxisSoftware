import { describe, expect, it, vi } from 'vitest';
import { PROFIL, erstelleKartendienst } from './kartendienst.ts';

const A = { lat: 48.52, lon: 9.06 };
const B = { lat: 48.53, lon: 9.05 };

function mit(status: number, koerper: unknown) {
  const abrufen = vi.fn((_adresse: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(koerper), { status })),
  );
  const kartendienst = erstelleKartendienst({
    supabaseUrl: 'http://eigene.test/',
    anonKey: ' anon ',
    abrufen,
  });
  return { abrufen, kartendienst };
}

describe('Fahrzeiten über die eigene Function location-provider', () => {
  it('fragt mit dem Token der Person und nur mit Koordinaten und Profil', async () => {
    const { abrufen, kartendienst } = mit(200, {
      ok: true,
      value: { durationsSeconds: [[600], [null]] },
      quelle: 'nachbildung',
    });
    expect(await kartendienst.matrix('Bearer person', [A, B], [B])).toEqual({
      ok: true,
      sekunden: [[600], [null]],
    });
    const [adresse, init] = abrufen.mock.calls[0]!;
    expect(adresse).toBe('http://eigene.test/functions/v1/location-provider');
    expect(init?.headers).toEqual({
      apikey: 'anon',
      Authorization: 'Bearer person',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      aufgabe: 'matrix',
      profile: PROFIL,
      origins: [A, B],
      destinations: [B],
    });
  });

  it('meldet einen fehlenden Anbieter oder abgewiesenen Schalter als nicht eingerichtet', async () => {
    const { kartendienst } = mit(503, {
      ok: false,
      error: { code: 'not_configured', message: 'location-provider: kein Anbieter eingerichtet' },
    });
    expect(await kartendienst.matrix('Bearer p', [A], [B])).toEqual({
      ok: false,
      grund: 'not_configured',
    });
  });

  it.each([
    ['Zeitüberschreitung des Anbieters', 504, { ok: false, error: { code: 'timeout' } }],
    ['abgelaufene Sitzung', 401, { ok: false, error: { code: 'session_invalid' } }],
    ['eine Antwort ohne Matrix', 200, { ok: true, value: {} }],
    ['eine Matrix mit falscher Zeilenzahl', 200, { ok: true, value: { durationsSeconds: [] } }],
    [
      'eine Matrix mit falscher Spaltenzahl',
      200,
      { ok: true, value: { durationsSeconds: [[1, 2]] } },
    ],
    ['keinen Körper', 502, 'Bad Gateway'],
  ])('gibt bei %s keine Fahrzeit', async (_name, status, koerper) => {
    const { kartendienst } = mit(status, koerper);
    expect(await kartendienst.matrix('Bearer p', [A], [B])).toEqual({
      ok: false,
      grund: 'unavailable',
    });
  });

  it('macht aus einer Fahrzeit, die keine Zahl ist, eine fehlende', async () => {
    const { kartendienst } = mit(200, { ok: true, value: { durationsSeconds: [['schnell']] } });
    expect(await kartendienst.matrix('Bearer p', [A], [B])).toEqual({
      ok: true,
      sekunden: [[null]],
    });
  });

  it('meldet einen Ausfall als nicht erreichbar und fragt ohne Einrichtung gar nicht', async () => {
    const aus = erstelleKartendienst({
      supabaseUrl: 'http://eigene.test',
      anonKey: 'anon',
      abrufen: () => Promise.reject(new Error('aus')),
    });
    expect(await aus.matrix('Bearer p', [A], [B])).toEqual({ ok: false, grund: 'unavailable' });

    const abrufen = vi.fn<typeof fetch>();
    const ohne = erstelleKartendienst({ supabaseUrl: '', anonKey: 'anon', abrufen });
    expect(await ohne.matrix('Bearer p', [A], [B])).toEqual({ ok: false, grund: 'not_configured' });
    expect(abrufen).not.toHaveBeenCalled();
  });
});

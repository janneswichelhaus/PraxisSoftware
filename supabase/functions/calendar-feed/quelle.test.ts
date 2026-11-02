import { describe, expect, it, vi } from 'vitest';
import { erstelleQuelle } from './quelle.ts';

const ADRESSE = 'A'.repeat(43);
const EINTRAG = {
  uid: 'c'.repeat(64),
  beginn: '2026-11-03T09:00:00+00:00',
  ende: '2026-11-03T09:45:00+00:00',
  art: 'practice',
};

function antwort(status: number, koerper: unknown): Response {
  return new Response(JSON.stringify(koerper), { status });
}

function quelle(abrufen: typeof fetch, timeoutMs?: number) {
  return erstelleQuelle({
    supabaseUrl: 'http://instanz.test/',
    adminKey: ' dienst ',
    abrufen,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

describe('Das Abo aus der Datenbank (ANN-839)', () => {
  it('ruft mit dem eigenen Schlüssel genau calendar_feed und gibt nur die Adresse mit', async () => {
    const abrufen = vi.fn(() => Promise.resolve(antwort(200, [EINTRAG])));
    expect(await quelle(abrufen as unknown as typeof fetch).lies(ADRESSE)).toEqual({
      ok: true,
      eintraege: [
        {
          uid: EINTRAG.uid,
          beginn: new Date('2026-11-03T09:00:00Z'),
          ende: new Date('2026-11-03T09:45:00Z'),
          art: 'practice',
        },
      ],
    });
    const [ziel, optionen] = abrufen.mock.calls[0] as unknown as [string, RequestInit];
    expect(ziel).toBe('http://instanz.test/rest/v1/rpc/calendar_feed');
    expect(optionen.method).toBe('POST');
    expect(optionen.headers).toEqual({
      apikey: 'dienst',
      Authorization: 'Bearer dienst',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(optionen.body as string)).toEqual({ p_token: ADRESSE });
  });

  it('kennt „unbekannt“ als null und ein leeres Abo als leere Liste', async () => {
    const leer = vi.fn(() => Promise.resolve(antwort(200, null)));
    expect(await quelle(leer as unknown as typeof fetch).lies(ADRESSE)).toEqual({
      ok: true,
      eintraege: null,
    });
    const ohne = vi.fn(() => Promise.resolve(antwort(200, [])));
    expect(await quelle(ohne as unknown as typeof fetch).lies(ADRESSE)).toEqual({
      ok: true,
      eintraege: [],
    });
  });

  it('liefert nie eine halbe Datei: Ausfall, Fehler oder ein unlesbarer Termin heißen „nicht lesbar“', async () => {
    for (const fall of [
      () => Promise.resolve(antwort(500, { message: 'x' })),
      () => Promise.resolve(antwort(401, {})),
      () => Promise.resolve(new Response('kein json', { status: 200 })),
      () => Promise.resolve(antwort(200, { kein: 'array' })),
      () => Promise.resolve(antwort(200, [EINTRAG, { ...EINTRAG, art: 'patient' }])),
      () => Promise.resolve(antwort(200, [{ ...EINTRAG, uid: 'zu-kurz' }])),
      () => Promise.resolve(antwort(200, [{ ...EINTRAG, ende: EINTRAG.beginn }])),
      () => Promise.resolve(antwort(200, [{ ...EINTRAG, beginn: 'gestern' }])),
      () => Promise.reject(new Error('Netz')),
    ]) {
      const abrufen = vi.fn(fall);
      expect(await quelle(abrufen as unknown as typeof fetch).lies(ADRESSE)).toEqual({
        ok: false,
      });
    }
  });

  it('gibt nach der Frist auf', async () => {
    const abrufen = vi.fn(
      (_ziel: string, optionen: RequestInit) =>
        new Promise<Response>((_, ablehnen) => {
          optionen.signal?.addEventListener('abort', () => ablehnen(new Error('abgebrochen')));
        }),
    );
    expect(await quelle(abrufen as unknown as typeof fetch, 20).lies(ADRESSE)).toEqual({
      ok: false,
    });
  });
});

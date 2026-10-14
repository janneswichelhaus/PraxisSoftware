import { describe, expect, it, vi } from 'vitest';
import { erstelleBerechtigungspruefung } from './berechtigung.ts';

/**
 * Die Frage an die Datenbank (KI-001): mit dem Token der Person und dem
 * öffentlichen Schlüssel an `check_dictation_access`. Durchgelassen wird nur
 * ein ausdrückliches `true`.
 */

const TERMIN = '77777777-7777-4777-8777-000000000001';
const TOKEN = 'Bearer token-der-person';

function pruefung(antwort: () => Promise<Response>, url = 'https://instanz.invalid/') {
  const abrufen = vi.fn<typeof fetch>(() => antwort());
  return {
    abrufen,
    pruefe: erstelleBerechtigungspruefung({ supabaseUrl: url, anonKey: 'oeffentlich', abrufen }),
  };
}

function json(status: number, wert: unknown): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(wert), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
}

describe('Berechtigung des Diktats', () => {
  it('fragt check_dictation_access mit dem Token der Person und dem Termin', async () => {
    const { abrufen, pruefe } = pruefung(json(200, true));
    expect(await pruefe(TOKEN, TERMIN)).toBe('erlaubt');

    const [adresse, optionen] = abrufen.mock.calls[0]!;
    expect(adresse).toBe('https://instanz.invalid/rest/v1/rpc/check_dictation_access');
    expect(optionen?.method).toBe('POST');
    expect(optionen?.headers).toEqual({
      apikey: 'oeffentlich',
      Authorization: TOKEN,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(optionen?.body as string)).toEqual({ p_appointment_id: TERMIN });
  });

  it.each([
    ['false', json(200, false), 'verweigert'],
    ['403 (42501, ohne Organisation)', json(403, { code: '42501' }), 'verweigert'],
    ['400', json(400, { code: '22P02' }), 'verweigert'],
    ['401 (Token abgelaufen)', json(401, { code: 'PGRST301' }), 'abgelehnt'],
    ['404 (Funktion fehlt)', json(404, {}), 'nicht_pruefbar'],
    ['500', json(500, {}), 'nicht_pruefbar'],
    ['503', json(503, {}), 'nicht_pruefbar'],
    ['true als Text', json(200, 'true'), 'nicht_pruefbar'],
    ['null', json(200, null), 'nicht_pruefbar'],
    ['kein JSON', () => Promise.resolve(new Response('<html>', { status: 200 })), 'nicht_pruefbar'],
    ['Netzfehler', () => Promise.reject(new TypeError('fetch failed')), 'nicht_pruefbar'],
  ] as const)('lässt bei %s nicht durch', async (_fall, antwort, erwartet) => {
    const { pruefe } = pruefung(antwort);
    expect(await pruefe(TOKEN, TERMIN)).toBe(erwartet);
  });

  it('fragt ohne Einrichtung gar nicht erst', async () => {
    const abrufen = vi.fn<typeof fetch>();
    for (const [supabaseUrl, anonKey] of [
      ['', 'oeffentlich'],
      ['https://instanz.invalid', ' '],
    ]) {
      const pruefe = erstelleBerechtigungspruefung({
        supabaseUrl: supabaseUrl!,
        anonKey: anonKey!,
        abrufen,
      });
      expect(await pruefe(TOKEN, TERMIN)).toBe('nicht_pruefbar');
    }
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('wartet nicht endlos auf die Datenbank', async () => {
    const abrufen = vi.fn<typeof fetch>(
      (_adresse, optionen) =>
        new Promise((_ok, fehler) => {
          optionen?.signal?.addEventListener('abort', () => fehler(new Error('abgebrochen')));
        }),
    );
    const pruefe = erstelleBerechtigungspruefung({
      supabaseUrl: 'https://instanz.invalid',
      anonKey: 'oeffentlich',
      abrufen,
      timeoutMs: 10,
    });
    expect(await pruefe(TOKEN, TERMIN)).toBe('nicht_pruefbar');
  });
});

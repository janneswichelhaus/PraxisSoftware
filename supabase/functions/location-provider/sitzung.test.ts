import { describe, expect, it, vi } from 'vitest';
import { erstelleSitzungspruefung } from './sitzung.ts';

/**
 * Die Sitzungsprüfung (MAP-003a, Akzeptanzkriterium 2).
 *
 * Sie ist der Riegel vor einem Aufruf, der Geld kostet und einen Anbieter
 * erreicht. Geprüft wird deshalb vor allem, wann sie **nicht** öffnet.
 */

function pruefung(status: number) {
  const abrufen = vi.fn((_ziel: RequestInfo | URL, _optionen?: RequestInit) =>
    Promise.resolve(new Response(null, { status })),
  );
  return { pruefe: mitFetch(abrufen), abrufen };
}

function mitFetch(abrufen: typeof fetch) {
  return erstelleSitzungspruefung({
    supabaseUrl: 'https://instanz.invalid/',
    anonKey: 'anon',
    abrufen,
  });
}

describe('Sitzungspruefung der Function', () => {
  it('fragt den eigenen Anmeldedienst und reicht den Token weiter', async () => {
    const { pruefe, abrufen } = pruefung(200);

    await expect(pruefe('Bearer abc.def.ghi')).resolves.toBe(true);

    const [ziel, optionen] = abrufen.mock.calls[0]!;
    // Der abschliessende Schraegstrich der Adresse darf keinen doppelten
    // ergeben - sonst antwortet GoTrue mit 404 und jede Sitzung gilt als
    // ungueltig.
    expect(ziel).toBe('https://instanz.invalid/auth/v1/user');
    const kopf = new Headers(optionen?.headers);
    expect(kopf.get('Authorization')).toBe('Bearer abc.def.ghi');
    expect(kopf.get('apikey')).toBe('anon');
  });

  it.each([
    ['ohne Kopfzeile', null],
    ['mit leerem Token', 'Bearer '],
    ['mit fremdem Verfahren', 'Basic abc'],
    ['mit blossem Token', 'abc.def.ghi'],
  ])('oeffnet %s nicht und fragt gar nicht erst nach', async (_, kopf) => {
    const { pruefe, abrufen } = pruefung(200);

    await expect(pruefe(kopf)).resolves.toBe(false);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('oeffnet nicht, wenn der Anmeldedienst den Token ablehnt', async () => {
    const { pruefe } = pruefung(401);
    await expect(pruefe('Bearer abgelaufen')).resolves.toBe(false);
  });

  it('oeffnet nicht, wenn der Anmeldedienst gar nicht antwortet', async () => {
    // Fail closed: Ein Netzfehler ist kein Grund, jemanden durchzulassen.
    const pruefe = mitFetch(() => Promise.reject(new TypeError('fetch failed')));

    await expect(pruefe('Bearer gut')).resolves.toBe(false);
  });
});

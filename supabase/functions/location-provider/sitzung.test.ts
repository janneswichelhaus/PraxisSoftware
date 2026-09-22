import { describe, expect, it, vi } from 'vitest';
import { erstelleSitzungspruefung } from './sitzung.ts';

/**
 * Die Sitzungsprüfung (MAP-003a, Akzeptanzkriterium 2; korrigiert mit BEF-027).
 *
 * Sie ist der Riegel vor einem Aufruf, der Geld kostet und einen Anbieter
 * erreicht. Geprüft wird deshalb vor allem, wann sie **nicht** öffnet — und
 * seit BEF-027 auch, **warum** sie nicht öffnet: „abgelehnt" und „konnte gar
 * nicht prüfen" sind zwei Dinge, und wer sie zusammenwirft, schickt die
 * Fehlersuche zum Kartendienst statt zur eigenen Einrichtung.
 */

function antwortet(status: number) {
  const abrufen = vi.fn((_ziel: RequestInfo | URL, _optionen?: RequestInit) =>
    Promise.resolve(new Response(null, { status })),
  );
  return { pruefe: mitFetch(abrufen), abrufen };
}

function mitFetch(abrufen: typeof fetch, url = 'https://instanz.invalid/', anonKey = 'anon') {
  return erstelleSitzungspruefung({ supabaseUrl: url, anonKey, abrufen });
}

describe('Sitzungspruefung der Function', () => {
  it('fragt den eigenen Anmeldedienst und reicht den Token weiter', async () => {
    const { pruefe, abrufen } = antwortet(200);

    await expect(pruefe('Bearer abc.def.ghi')).resolves.toEqual({ befund: 'gueltig' });

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
  ])('lehnt %s ab und fragt gar nicht erst nach', async (_, kopf) => {
    const { pruefe, abrufen } = antwortet(200);

    await expect(pruefe(kopf)).resolves.toEqual({ befund: 'abgelehnt' });
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('lehnt ab, wenn der Anmeldedienst den Token nicht annimmt', async () => {
    const { pruefe } = antwortet(401);
    await expect(pruefe('Bearer abgelaufen')).resolves.toEqual({ befund: 'abgelehnt' });
  });

  it.each([
    ['ohne Adresse', '', 'anon', 'SUPABASE_URL fehlt'],
    ['ohne Schluessel', 'https://instanz.invalid', '', 'SUPABASE_ANON_KEY fehlt'],
    ['ohne beides', '   ', '  ', 'SUPABASE_URL und SUPABASE_ANON_KEY fehlen'],
  ])('sagt %s, dass sie nicht pruefen kann - und nennt die Variable', async (_, url, key, text) => {
    const abrufen = vi.fn((_ziel: RequestInfo | URL) => Promise.resolve(new Response(null)));
    const pruefe = mitFetch(abrufen, url, key);

    const ergebnis = await pruefe('Bearer gut');

    // Genau dieser Fall stand im ersten Abnahmelauf als „Kartendienst weist
    // den Serverschluessel ab" auf dem Bildschirm (BEF-027).
    expect(ergebnis.befund).toBe('nicht_pruefbar');
    expect(ergebnis.befund === 'nicht_pruefbar' && ergebnis.grund).toBe('einrichtung');
    expect(ergebnis.befund === 'nicht_pruefbar' && ergebnis.meldung).toContain(text);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('sagt es, wenn der Anmeldedienst gar nicht antwortet', async () => {
    const pruefe = mitFetch(() => Promise.reject(new TypeError('fetch failed')));

    const ergebnis = await pruefe('Bearer gut');

    expect(ergebnis.befund).toBe('nicht_pruefbar');
    expect(ergebnis.befund === 'nicht_pruefbar' && ergebnis.grund).toBe('anmeldedienst');
  });

  it('wertet einen Ausfall des Anmeldedienstes nicht als abgelaufene Sitzung', async () => {
    // 500 sagt nichts ueber den Token aus. Wer daraus „abgelehnt" macht,
    // schickt die Person zur Anmeldung, wo ein Dienst neu starten muesste.
    const { pruefe } = antwortet(500);

    const ergebnis = await pruefe('Bearer gut');

    expect(ergebnis.befund).toBe('nicht_pruefbar');
    expect(ergebnis.befund === 'nicht_pruefbar' && ergebnis.meldung).toContain('500');
  });

  it('laesst in keinem dieser Faelle jemanden durch', async () => {
    // Fail closed bleibt: Nur `gueltig` oeffnet, und das kommt allein vom
    // Anmeldedienst.
    const faelle = [
      await antwortet(401).pruefe('Bearer x'),
      await antwortet(500).pruefe('Bearer x'),
      await mitFetch(() => Promise.reject(new TypeError('x')))('Bearer x'),
      await mitFetch(() => Promise.resolve(new Response(null)), '', '')('Bearer x'),
    ];

    expect(faelle.map((einer) => einer.befund)).not.toContain('gueltig');
  });
});

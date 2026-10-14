import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke } }),
}));

const {
  DIKTAT_HOECHSTBYTES,
  KI_FEHLERTEXTE,
  diktatAufbereiten,
  unverstaendlicheStellen,
  vorschlagAlsText,
} = await import('./gateway');

/**
 * Der eine Weg der Oberfläche zum AI Gateway (KI-EPIC-001, ADR-005 Punkt 4):
 * genau vier Felder hinaus, die Antwort nur in der Form des Gateways, jede
 * Störung eine Fehlerklasse mit einem Satz - und keine zweite Stelle im
 * Quelltext, die die Function aufruft.
 */

const TERMIN = '77777777-7777-4777-8777-000000000001';

const ERFOLG = {
  ok: true,
  transkript: 'Keine Schwellung. Mobilisation Knie rechts.',
  abschnitte: [
    { titel: 'Befund', text: 'Keine Schwellung.' },
    { titel: 'Behandlung', text: 'Mobilisation Knie rechts.' },
  ],
  quelle: 'nachbildung',
};

function aufnahme(groesse = 16, typ = 'audio/webm;codecs=opus'): Blob {
  return new Blob([new Uint8Array(groesse)], { type: typ });
}

function antwortMit(status: number, koerper: unknown): Response {
  return new Response(typeof koerper === 'string' ? koerper : JSON.stringify(koerper), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('diktatAufbereiten', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('schickt Zweck, Termin, Dauer und Aufnahme - sonst nichts', async () => {
    invoke.mockResolvedValue({ data: ERFOLG, error: null, response: antwortMit(200, ERFOLG) });
    const audio = aufnahme();
    const ergebnis = await diktatAufbereiten({ terminId: TERMIN, audio, dauerS: 41.6 });

    expect(ergebnis).toEqual({
      ok: true,
      vorschlag: {
        transkript: ERFOLG.transkript,
        abschnitte: ERFOLG.abschnitte,
        quelle: 'nachbildung',
      },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    const [funktion, optionen] = invoke.mock.calls[0] as [string, { body: FormData }];
    expect(funktion).toBe('ai-gateway');
    const formular = optionen.body;
    expect([...formular.keys()].sort()).toEqual(['audio', 'dauer_s', 'termin', 'zweck']);
    expect(formular.get('zweck')).toBe('dokumentation.diktat');
    expect(formular.get('termin')).toBe(TERMIN);
    expect(formular.get('dauer_s')).toBe('42');
    const datei = formular.get('audio') as File;
    expect(datei.size).toBe(audio.size);
    expect(datei.name).toBe('aufnahme.webm');
  });

  it('begrenzt die Dauerangabe auf eine Sekunde bis fünf Minuten', async () => {
    invoke.mockResolvedValue({ data: ERFOLG, error: null });
    await diktatAufbereiten({ terminId: TERMIN, audio: aufnahme(), dauerS: 0.2 });
    await diktatAufbereiten({ terminId: TERMIN, audio: aufnahme(), dauerS: 300.4 });
    const dauern = invoke.mock.calls.map(
      ([, optionen]) => (optionen as { body: FormData }).body.get('dauer_s') as string,
    );
    expect(dauern).toEqual(['1', '300']);
  });

  it('schickt eine leere oder zu große Aufnahme gar nicht erst', async () => {
    expect(
      await diktatAufbereiten({ terminId: TERMIN, audio: aufnahme(0), dauerS: 3 }),
    ).toMatchObject({ ok: false, fehler: 'invalid_request' });
    expect(
      await diktatAufbereiten({
        terminId: TERMIN,
        audio: aufnahme(DIKTAT_HOECHSTBYTES + 1),
        dauerS: 3,
      }),
    ).toMatchObject({ ok: false, fehler: 'too_large', meldung: KI_FEHLERTEXTE.too_large });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ['forbidden', 403, false],
    ['not_configured', 503, false],
    ['too_large', 413, false],
    ['invalid_request', 400, false],
    ['session_invalid', 401, false],
    ['unavailable', 502, true],
    ['timeout', 504, true],
  ] as const)('übersetzt die Fehlerklasse %s des Gateways', async (code, status, erneut) => {
    const koerper = { ok: false, error: { code, message: 'ai-gateway: technisch' } };
    invoke.mockResolvedValue({
      data: null,
      error: new Error('http'),
      response: antwortMit(status, koerper),
    });
    expect(await diktatAufbereiten({ terminId: TERMIN, audio: aufnahme(), dauerS: 5 })).toEqual({
      ok: false,
      fehler: code,
      meldung: KI_FEHLERTEXTE[code],
      erneutMoeglich: erneut,
    });
  });

  it('ordnet eine Antwort, die nicht vom Gateway stammt, nach ihrem Status ein (BEF-027)', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: new Error('http'),
      response: antwortMit(401, { code: 401, message: 'Invalid JWT' }),
    });
    invoke.mockResolvedValueOnce({
      data: null,
      error: new Error('http'),
      response: new Response('<html>Bad Gateway</html>', { status: 502 }),
    });
    invoke.mockResolvedValueOnce({ data: null, error: new Error('fetch'), response: undefined });
    const fehler = [];
    for (let i = 0; i < 3; i += 1) {
      const ergebnis = await diktatAufbereiten({ terminId: TERMIN, audio: aufnahme(), dauerS: 5 });
      fehler.push(ergebnis.ok ? 'ok' : ergebnis.fehler);
    }
    expect(fehler).toEqual(['session_invalid', 'function_unavailable', 'function_unavailable']);
  });

  it('nimmt keinen Vorschlag mit einem Abschnitt an, den die Vorlage nicht kennt', async () => {
    const erfunden = { ...ERFOLG, abschnitte: [{ titel: 'Diagnose', text: 'Gonarthrose.' }] };
    invoke.mockResolvedValue({ data: erfunden, error: null });
    expect(
      await diktatAufbereiten({ terminId: TERMIN, audio: aufnahme(), dauerS: 5 }),
    ).toMatchObject({ ok: false, fehler: 'function_unavailable' });
  });

  it('wirft nie, auch wenn die Bibliothek wirft', async () => {
    invoke.mockRejectedValue(new Error('kaputt'));
    expect(
      await diktatAufbereiten({ terminId: TERMIN, audio: aufnahme(), dauerS: 5 }),
    ).toMatchObject({ ok: false, fehler: 'function_unavailable', erneutMoeglich: true });
  });
});

describe('Vorschlag als Text', () => {
  it('setzt je Abschnitt den Titel in eine Zeile und trennt mit einer Leerzeile', () => {
    expect(
      vorschlagAlsText({
        abschnitte: [
          { titel: 'Angaben der Patient:in', text: 'Patientin berichtet, besser.' },
          { titel: 'Befund', text: '  ' },
          { titel: 'Plan', text: 'Eigenübungen weiter. ' },
        ],
      }),
    ).toBe('Angaben der Patient:in\nPatientin berichtet, besser.\n\nPlan\nEigenübungen weiter.');
  });

  it('zählt die unverständlichen Stellen', () => {
    expect(unverstaendlicheStellen('Treppe [unverständlich].')).toBe(1);
    expect(unverstaendlicheStellen('[unverständlich] und [unverständlich]')).toBe(2);
    expect(unverstaendlicheStellen('alles klar')).toBe(0);
  });
});

describe('Eine Stelle für KI-Aufrufe (ADR-005 Punkt 4)', () => {
  function quelldateien(verzeichnis: string): string[] {
    return readdirSync(verzeichnis).flatMap((eintrag) => {
      const pfad = join(verzeichnis, eintrag);
      if (statSync(pfad).isDirectory()) return quelldateien(pfad);
      return /\.(ts|tsx)$/.test(eintrag) && !/\.test\.(ts|tsx)$/.test(eintrag) ? [pfad] : [];
    });
  }

  it('ruft das AI Gateway nur aus src/lib/ki/gateway.ts auf', () => {
    const stamm = process.cwd();
    const treffer = quelldateien(join(stamm, 'src'))
      .filter((pfad) => /['"`]ai-gateway['"`]/.test(readFileSync(pfad, 'utf8')))
      .map((pfad) => relative(stamm, pfad));
    expect(treffer).toEqual(['src/lib/ki/gateway.ts']);
  });
});

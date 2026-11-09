import { describe, expect, it, vi } from 'vitest';
import type { Assistenzfrage, Assistenzpruefung, Berechtigungsbefund } from './berechtigung.ts';
import { erstelleHandler } from './handler.ts';
import { erstelleAssistenznachbildung, erstelleNachbildung } from './mock.ts';
import type { Sitzungsergebnis } from './sitzung.ts';
import type { Assistenzadapter, Protokolleintrag, Zuordnungsanfrage } from './typen.ts';
import { DIKTAT_ABSCHNITTE, ORDNEN_HOECHST_ZEICHEN, ORDNEN_REGELN } from './zwecke.ts';

// Der Ablauf der Hilfen ohne Ton: Sitzung, Zweck, Anbieter, Eingabe, Berechtigung, Adapter,
// Antwort. An den Adapter geht keine Kennung, in den Protokolleintrag kein Inhalt.

const TERMIN = '77777777-7777-4777-8777-000000000001';
const TOKEN = 'Bearer synthetisches-token-der-person';
const NOTIZEN = 'Patient sagt, es zieht links. Beugung 100 Grad.\nWeiter mit Dehnung.';

function adresse(zweck: string): string {
  return `https://beispiel.invalid/ai-gateway?zweck=${zweck}`;
}

function anfrage(zweck: string, koerper: unknown, typ = 'application/json'): Request {
  return new Request(adresse(zweck), {
    method: 'POST',
    headers: { 'Content-Type': typ, Authorization: TOKEN },
    body: typeof koerper === 'string' ? koerper : JSON.stringify(koerper),
  });
}

/** Ein Adapter, der mitschreibt, was er bekommt, und liefert, was man ihm sagt. */
function spion(ersatz: Partial<Assistenzadapter> = {}) {
  const echt = erstelleAssistenznachbildung();
  const zuordnungen: Zuordnungsanfrage[] = [];
  const adapter: Assistenzadapter = {
    ...echt,
    ordneZu: (auftrag, signal) => {
      zuordnungen.push(auftrag);
      return echt.ordneZu(auftrag, signal);
    },
    ...ersatz,
  };
  return { adapter, zuordnungen };
}

function gateway({
  assistenz = erstelleAssistenznachbildung(),
  sitzung = { befund: 'gueltig' },
  berechtigung = 'erlaubt',
  gateAbgewiesen = false,
  fristMs,
}: {
  assistenz?: Assistenzadapter | null;
  sitzung?: Sitzungsergebnis;
  berechtigung?: Berechtigungsbefund;
  gateAbgewiesen?: boolean;
  fristMs?: number;
} = {}) {
  const protokoll: Protokolleintrag[] = [];
  const pruefeAssistenz = vi.fn<Assistenzpruefung>(() => Promise.resolve(berechtigung));
  const pruefeBerechtigung = vi.fn(() => Promise.resolve<Berechtigungsbefund>('erlaubt'));
  let uhr = 1000;
  const handler = erstelleHandler({
    adapter: erstelleNachbildung(),
    assistenz,
    gateAbgewiesen,
    pruefeSitzung: () => Promise.resolve(sitzung),
    pruefeBerechtigung,
    pruefeAssistenz,
    protokolliere: (eintrag) => protokoll.push(eintrag),
    jetzt: () => (uhr += 7),
    ...(fristMs ? { fristen: { transkriptionMs: fristMs, strukturierungMs: fristMs } } : {}),
  });
  return { handler, protokoll, pruefeAssistenz, pruefeBerechtigung };
}

interface Koerper {
  ok: boolean;
  error?: { code: string; message: string };
  [feld: string]: unknown;
}

async function gelesen(antwort: Response): Promise<Koerper> {
  return (await antwort.json()) as Koerper;
}

describe('ai-gateway: Ordnen', () => {
  const ZWECK = 'dokumentation.ordnen';

  it('ordnet die Sätze des Textes wörtlich in die Abschnitte der Vorlage', async () => {
    const { handler, pruefeAssistenz, pruefeBerechtigung, protokoll } = gateway();
    const antwort = await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    expect(await gelesen(antwort)).toEqual({
      ok: true,
      art: 'ordnen',
      abschnitte: [
        { titel: 'Angaben der Patient:in', text: 'Patient sagt, es zieht links.' },
        { titel: 'Befund', text: 'Beugung 100 Grad.' },
        { titel: 'Plan', text: 'Weiter mit Dehnung.' },
      ],
      quelle: 'nachbildung',
    });
    expect(pruefeAssistenz).toHaveBeenCalledExactlyOnceWith(TOKEN, { art: 'termin', id: TERMIN });
    // Die Prüfung des Diktats gilt dem Ton, nicht dem getippten Text.
    expect(pruefeBerechtigung).not.toHaveBeenCalled();
    expect(protokoll).toEqual([]);
  });

  it('gibt dem Adapter nur Sätze, Sprache, Regeln und Abschnitte - keine Kennung', async () => {
    const { adapter, zuordnungen } = spion();
    const { handler } = gateway({ assistenz: adapter });
    await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));

    expect(zuordnungen).toEqual([
      {
        saetze: ['Patient sagt, es zieht links.', 'Beugung 100 Grad.', 'Weiter mit Dehnung.'],
        sprache: 'de',
        regeln: ORDNEN_REGELN,
        abschnitte: DIKTAT_ABSCHNITTE,
      },
    ]);
    expect(JSON.stringify(zuordnungen)).not.toContain(TERMIN);
    expect(JSON.stringify(zuordnungen)).not.toContain('token');
  });

  it('fragt den Adapter nicht, wenn schon alles unter einem Titel steht', async () => {
    const { adapter, zuordnungen } = spion();
    const { handler } = gateway({ assistenz: adapter });
    const antwort = await handler(
      anfrage(ZWECK, { termin: TERMIN, text: 'Befund\nBeugung 100 Grad.' }),
    );
    expect((await gelesen(antwort)).abschnitte).toEqual([
      { titel: 'Befund', text: 'Beugung 100 Grad.' },
    ]);
    expect(zuordnungen).toEqual([]);
  });

  it.each([
    ['ein erfundener Abschnitt', ['Diagnose', 'Befund', 'Plan']],
    ['ein Titel zu wenig', ['Befund', 'Plan']],
    ['Text statt Titel', ['Verdacht auf Meniskusriss.', 'Befund', 'Plan']],
    ['ein Satz mehr', ['Befund', 'Befund', 'Plan', 'Plan']],
  ])('zeigt nichts, wenn der Adapter anderes liefert: %s', async (_fall, zuordnung) => {
    const { adapter } = spion({
      ordneZu: () => Promise.resolve({ ok: true, value: { zuordnung } }),
    });
    const { handler, protokoll } = gateway({ assistenz: adapter });
    const antwort = await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));

    expect(antwort.status).toBe(502);
    const koerper = await gelesen(antwort);
    expect(koerper.error?.code).toBe('unavailable');
    expect(JSON.stringify(koerper)).not.toContain('Meniskus');
    expect(protokoll).toEqual([
      { zweck: ZWECK, anbieter: 'mock', code: 'unavailable', dauerMs: 7 },
    ]);
  });

  it.each([
    ['kein JSON', 'termin=1', 'application/json', 400, 'invalid_request'],
    ['ein Formular statt JSON', '{}', 'multipart/form-data; boundary=x', 400, 'invalid_request'],
    ['eine Liste', [TERMIN, NOTIZEN], 'application/json', 400, 'invalid_request'],
    ['ohne Termin', { text: NOTIZEN }, 'application/json', 400, 'invalid_request'],
    [
      'ein Name als Termin',
      { termin: 'Max Mustermann', text: NOTIZEN },
      'application/json',
      400,
      'invalid_request',
    ],
    ['ohne Text', { termin: TERMIN }, 'application/json', 400, 'invalid_request'],
    ['leerer Text', { termin: TERMIN, text: '  \n ' }, 'application/json', 400, 'invalid_request'],
    [
      'Text als Liste',
      { termin: TERMIN, text: [NOTIZEN] },
      'application/json',
      400,
      'invalid_request',
    ],
    [
      'ein zusätzliches Feld',
      { termin: TERMIN, text: NOTIZEN, patient: 'Max Mustermann' },
      'application/json',
      400,
      'invalid_request',
    ],
    [
      'zu langer Text',
      { termin: TERMIN, text: 'a'.repeat(ORDNEN_HOECHST_ZEICHEN + 1) },
      'application/json',
      413,
      'too_large',
    ],
  ])('weist ab: %s', async (_fall, koerper, typ, status, code) => {
    const { adapter, zuordnungen } = spion();
    const { handler, pruefeAssistenz } = gateway({ assistenz: adapter });
    const antwort = await handler(anfrage(ZWECK, koerper, typ));

    expect(antwort.status).toBe(status);
    expect((await gelesen(antwort)).error?.code).toBe(code);
    // Vor der Datenbank und vor dem Adapter.
    expect(pruefeAssistenz).not.toHaveBeenCalled();
    expect(zuordnungen).toEqual([]);
  });

  it('liest eine zu große Anfrage nicht zu Ende', async () => {
    const { handler } = gateway();
    const antwort = await handler(
      new Request(adresse(ZWECK), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: TOKEN,
          'Content-Length': String(ORDNEN_HOECHST_ZEICHEN * 4 + 1024 * 1024),
        },
        body: '{}',
      }),
    );
    expect(antwort.status).toBe(413);
  });

  it.each([
    ['verweigert', 403, 'forbidden', []],
    ['abgelehnt', 401, 'session_invalid', []],
    [
      'nicht_pruefbar',
      502,
      'unavailable',
      [{ zweck: ZWECK, anbieter: 'berechtigung', code: 'unavailable', dauerMs: 0 }],
    ],
  ] as const)(
    'geht mit Befund %s nicht an den Adapter',
    async (befund, status, code, eintraege) => {
      const { adapter, zuordnungen } = spion();
      const { handler, protokoll } = gateway({ assistenz: adapter, berechtigung: befund });
      const antwort = await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));

      expect(antwort.status).toBe(status);
      expect((await gelesen(antwort)).error?.code).toBe(code);
      expect(zuordnungen).toEqual([]);
      expect(protokoll).toEqual(eintraege);
    },
  );

  it('gilt ohne eingerichtete Prüfung als nicht prüfbar', async () => {
    const handler = erstelleHandler({
      adapter: null,
      assistenz: erstelleAssistenznachbildung(),
      pruefeSitzung: () => Promise.resolve({ befund: 'gueltig' }),
      pruefeBerechtigung: () => Promise.resolve('erlaubt'),
      protokolliere: () => undefined,
    });
    const antwort = await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));
    expect(antwort.status).toBe(502);
  });

  it('weist ohne gültige Sitzung ab, bevor etwas gelesen wird', async () => {
    const { handler, pruefeAssistenz } = gateway({ sitzung: { befund: 'abgelehnt' } });
    const antwort = await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));
    expect(antwort.status).toBe(401);
    expect(pruefeAssistenz).not.toHaveBeenCalled();
  });

  it('meldet einen Adapter, der nicht antwortet, als timeout - ohne Inhalt im Eintrag', async () => {
    const { adapter } = spion({ ordneZu: () => new Promise(() => undefined) });
    const { handler, protokoll } = gateway({ assistenz: adapter, fristMs: 5 });
    const antwort = await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));

    expect(antwort.status).toBe(504);
    expect(protokoll).toHaveLength(1);
    expect(Object.keys(protokoll[0]!).sort()).toEqual(['anbieter', 'code', 'dauerMs', 'zweck']);
    expect(JSON.stringify(protokoll)).not.toContain('zieht');
  });

  it('meldet einen Adapter, der wirft, als unavailable', async () => {
    const { adapter } = spion({ ordneZu: () => Promise.reject(new Error('Beugung 100 Grad')) });
    const { handler } = gateway({ assistenz: adapter });
    const antwort = await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));
    expect(antwort.status).toBe(502);
    expect(JSON.stringify(await gelesen(antwort))).not.toContain('Beugung');
  });
});

describe('ai-gateway: Hilfen ohne Ton und ihr Anbieter', () => {
  const ZWECK = 'dokumentation.ordnen';

  function status(handler: (anfrage: Request) => Promise<Response>, zweck: string) {
    return handler(new Request(adresse(zweck), { headers: { Authorization: TOKEN } }));
  }

  it('meldet den Zweck als verfügbar, wenn die Nachbildung eingerichtet ist', async () => {
    const { handler } = gateway();
    expect(await gelesen(await status(handler, ZWECK))).toEqual({ ok: true, verfuegbar: true });
  });

  it('meldet ihn ohne Assistenzadapter als nicht verfügbar - das Diktat bleibt', async () => {
    const { handler, protokoll } = gateway({ assistenz: null });
    expect(await gelesen(await status(handler, ZWECK))).toEqual({ ok: true, verfuegbar: false });
    expect(await gelesen(await status(handler, 'dokumentation.diktat'))).toEqual({
      ok: true,
      verfuegbar: true,
    });

    const antwort = await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));
    expect(antwort.status).toBe(503);
    expect((await gelesen(antwort)).error?.code).toBe('not_configured');
    expect(protokoll).toEqual([]);
  });

  it('meldet die in der Produktion abgewiesene Nachbildung als Protokolleintrag', async () => {
    const { handler, protokoll } = gateway({ assistenz: null, gateAbgewiesen: true });
    const antwort = await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));
    expect(antwort.status).toBe(503);
    expect(protokoll).toEqual([
      { zweck: ZWECK, anbieter: 'gate', code: 'gate_rejected', dauerMs: 0 },
    ]);
  });

  it('bedient den Zweck nicht mit einem Adapter, den er nicht nennt', async () => {
    const { adapter, zuordnungen } = spion({ id: 'fremd' });
    const { handler, protokoll } = gateway({ assistenz: adapter });
    expect(await gelesen(await status(handler, ZWECK))).toEqual({ ok: true, verfuegbar: false });

    const antwort = await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));
    expect(antwort.status).toBe(503);
    expect(zuordnungen).toEqual([]);
    expect(protokoll).toEqual([
      { zweck: ZWECK, anbieter: 'fremd', code: 'not_configured', dauerMs: 0 },
    ]);
  });

  it('nimmt für einen Textzweck kein Formular mit Ton an', async () => {
    const { handler } = gateway();
    const antwort = await handler(
      anfrage(ZWECK, '--x\r\n\r\n--x--', 'multipart/form-data; boundary=x'),
    );
    expect(antwort.status).toBe(400);
  });

  it('stellt die Frage an die Datenbank mit dem Gegenstand des Zwecks', async () => {
    const fragen: Assistenzfrage[] = [];
    const handler = erstelleHandler({
      adapter: null,
      assistenz: erstelleAssistenznachbildung(),
      pruefeSitzung: () => Promise.resolve({ befund: 'gueltig' }),
      pruefeBerechtigung: () => Promise.resolve('verweigert'),
      pruefeAssistenz: (_token, frage) => {
        fragen.push(frage);
        return Promise.resolve('erlaubt');
      },
      protokolliere: () => undefined,
    });
    await handler(anfrage(ZWECK, { termin: TERMIN, text: NOTIZEN }));
    expect(fragen).toEqual([{ art: 'termin', id: TERMIN }]);
  });
});

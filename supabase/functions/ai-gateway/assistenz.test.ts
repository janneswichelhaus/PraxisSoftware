import { describe, expect, it, vi } from 'vitest';
import type { Assistenzfrage, Assistenzpruefung, Berechtigungsbefund } from './berechtigung.ts';
import { erstelleHandler } from './handler.ts';
import { erstelleAssistenznachbildung, erstelleNachbildung } from './mock.ts';
import type { Sitzungsergebnis } from './sitzung.ts';
import type {
  Assistenzadapter,
  Auswahlanfrage,
  Protokolleintrag,
  Umformanfrage,
  Zuordnungsanfrage,
} from './typen.ts';
import {
  ALLTAG_REGELN,
  AUSZUG_HOECHST_EINTRAEGE,
  AUSZUG_HOECHST_ZEICHEN,
  AUSZUG_REGELN,
  DIKTAT_ABSCHNITTE,
  ENTWURF_REGELN,
  NACHRICHT_HOECHST_ZEICHEN,
  ORDNEN_HOECHST_ZEICHEN,
  ORDNEN_REGELN,
} from './zwecke.ts';

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
  const umformungen: Umformanfrage[] = [];
  const auswahlen: Auswahlanfrage[] = [];
  const adapter: Assistenzadapter = {
    ...echt,
    ordneZu: (auftrag, signal) => {
      zuordnungen.push(auftrag);
      return echt.ordneZu(auftrag, signal);
    },
    formuliere: (auftrag, signal) => {
      umformungen.push(auftrag);
      return echt.formuliere(auftrag, signal);
    },
    waehleAus: (auftrag, signal) => {
      auswahlen.push(auftrag);
      return echt.waehleAus(auftrag, signal);
    },
    ...ersatz,
  };
  return { adapter, zuordnungen, umformungen, auswahlen };
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

describe('ai-gateway: Antwort ausformulieren', () => {
  const ZWECK = 'nachricht.entwurf';
  const RUECKFRAGE = 'd1d1d1d1-d1d1-4d1d-8d1d-000000000001';
  const STICHPUNKTE = 'knie li. kühlen, 10 Min.\n\nübungen 2x tägl. weiter';

  it('macht aus jedem Stichpunkt einen Satz und sagt, was im Wortlaut blieb', async () => {
    const { handler, pruefeAssistenz, protokoll } = gateway();
    const antwort = await handler(anfrage(ZWECK, { rueckfrage: RUECKFRAGE, text: STICHPUNKTE }));

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    expect(await gelesen(antwort)).toEqual({
      ok: true,
      art: 'umformen',
      saetze: [
        { text: 'Knie links kühlen, 10 Minuten.', unveraendert: false },
        { text: 'Übungen 2-mal täglich weiter.', unveraendert: false },
      ],
      quelle: 'nachbildung',
    });
    expect(pruefeAssistenz).toHaveBeenCalledExactlyOnceWith(TOKEN, {
      art: 'rueckfrage',
      id: RUECKFRAGE,
    });
    expect(protokoll).toEqual([]);
  });

  it('gibt dem Adapter nur die Sätze, die Aufgabe und die Regeln - keine Kennung', async () => {
    const { adapter, umformungen } = spion();
    const { handler } = gateway({ assistenz: adapter });
    await handler(anfrage(ZWECK, { rueckfrage: RUECKFRAGE, text: STICHPUNKTE }));

    expect(umformungen).toEqual([
      {
        saetze: ['knie li. kühlen, 10 Min.', 'übungen 2x tägl. weiter'],
        aufgabe: 'ausformulieren',
        sprache: 'de',
        regeln: ENTWURF_REGELN,
      },
    ]);
    expect(JSON.stringify(umformungen)).not.toContain(RUECKFRAGE);
  });

  it.each([
    ['eine andere Seite', ['Knie rechts kühlen, 10 Minuten.', 'Übungen 2-mal täglich weiter.']],
    ['eine andere Zahl', ['Knie links kühlen, 20 Minuten.', 'Übungen 2-mal täglich weiter.']],
    [
      'ein Rat dazu',
      ['Knie links kühlen, 10 Minuten. Bitte hochlagern.', 'Übungen 2-mal täglich weiter.'],
    ],
    ['ein leerer Satz', ['', 'Übungen 2-mal täglich weiter.']],
  ])('lässt die Quelle stehen, wo der Adapter abweicht: %s', async (_fall, saetze) => {
    const { adapter } = spion({
      formuliere: () => Promise.resolve({ ok: true, value: { saetze } }),
    });
    const { handler } = gateway({ assistenz: adapter });
    const antwort = await handler(anfrage(ZWECK, { rueckfrage: RUECKFRAGE, text: STICHPUNKTE }));

    expect((await gelesen(antwort)).saetze).toEqual([
      { text: 'knie li. kühlen, 10 Min.', unveraendert: true },
      { text: 'Übungen 2-mal täglich weiter.', unveraendert: false },
    ]);
  });

  it.each([
    ['ein Satz zu wenig', ['Knie links kühlen, 10 Minuten.']],
    [
      'ein Satz zu viel',
      ['Knie links kühlen, 10 Minuten.', 'Übungen 2-mal täglich weiter.', 'Gute Besserung.'],
    ],
    ['kein Text', [1, 2]],
  ])('zeigt nichts, wenn die Antwort die Form nicht hat: %s', async (_fall, saetze) => {
    const { adapter } = spion({
      formuliere: () =>
        Promise.resolve({ ok: true, value: { saetze: saetze as unknown as string[] } }),
    });
    const { handler, protokoll } = gateway({ assistenz: adapter });
    const antwort = await handler(anfrage(ZWECK, { rueckfrage: RUECKFRAGE, text: STICHPUNKTE }));

    expect(antwort.status).toBe(502);
    expect(JSON.stringify(await gelesen(antwort))).not.toContain('Besserung');
    expect(protokoll).toEqual([
      { zweck: ZWECK, anbieter: 'mock', code: 'unavailable', dauerMs: 7 },
    ]);
  });

  it.each([
    ['ohne Rückfrage', { text: STICHPUNKTE }, 400, 'invalid_request'],
    [
      'mit dem Feld eines anderen Zwecks',
      { termin: RUECKFRAGE, text: STICHPUNKTE },
      400,
      'invalid_request',
    ],
    [
      'ein Name als Rückfrage',
      { rueckfrage: 'Erika Beispiel', text: STICHPUNKTE },
      400,
      'invalid_request',
    ],
    [
      'mit der Frage der Person dazu',
      { rueckfrage: RUECKFRAGE, text: STICHPUNKTE, frage: 'Darf ich joggen?' },
      400,
      'invalid_request',
    ],
    ['leerer Text', { rueckfrage: RUECKFRAGE, text: ' \n ' }, 400, 'invalid_request'],
    [
      'zu langer Text',
      { rueckfrage: RUECKFRAGE, text: 'a'.repeat(NACHRICHT_HOECHST_ZEICHEN + 1) },
      413,
      'too_large',
    ],
  ])('weist ab: %s', async (_fall, koerper, status, code) => {
    const { adapter, umformungen } = spion();
    const { handler, pruefeAssistenz } = gateway({ assistenz: adapter });
    const antwort = await handler(anfrage(ZWECK, koerper));

    expect(antwort.status).toBe(status);
    expect((await gelesen(antwort)).error?.code).toBe(code);
    expect(pruefeAssistenz).not.toHaveBeenCalled();
    expect(umformungen).toEqual([]);
  });

  it.each([
    ['verweigert', 403, 'forbidden'],
    ['abgelehnt', 401, 'session_invalid'],
    ['nicht_pruefbar', 502, 'unavailable'],
  ] as const)('geht mit Befund %s nicht an den Adapter', async (befund, status, code) => {
    const { adapter, umformungen } = spion();
    const { handler } = gateway({ assistenz: adapter, berechtigung: befund });
    const antwort = await handler(anfrage(ZWECK, { rueckfrage: RUECKFRAGE, text: STICHPUNKTE }));

    expect(antwort.status).toBe(status);
    expect((await gelesen(antwort)).error?.code).toBe(code);
    expect(umformungen).toEqual([]);
  });

  it('meldet einen Adapter, der nicht antwortet, als timeout - ohne Inhalt im Eintrag', async () => {
    const { adapter } = spion({ formuliere: () => new Promise(() => undefined) });
    const { handler, protokoll } = gateway({ assistenz: adapter, fristMs: 5 });
    const antwort = await handler(anfrage(ZWECK, { rueckfrage: RUECKFRAGE, text: STICHPUNKTE }));

    expect(antwort.status).toBe(504);
    expect(protokoll).toEqual([{ zweck: ZWECK, anbieter: 'mock', code: 'timeout', dauerMs: 7 }]);
    expect(JSON.stringify(protokoll)).not.toContain('kühlen');
  });
});

describe('ai-gateway: Antwort in Alltagssprache', () => {
  const ZWECK = 'nachricht.alltagssprache';
  const RUECKFRAGE = 'd1d1d1d1-d1d1-4d1d-8d1d-000000000001';
  const ANTWORT = 'Das Ödem lateral am Knöchel li. geht zurück. Bitte weiter kühlen.';

  it('erklärt Satz für Satz und lässt im Wortlaut, was kein Fachwort hat', async () => {
    const { adapter, umformungen } = spion();
    const { handler, pruefeAssistenz } = gateway({ assistenz: adapter });
    const antwort = await handler(anfrage(ZWECK, { rueckfrage: RUECKFRAGE, text: ANTWORT }));

    expect(await gelesen(antwort)).toEqual({
      ok: true,
      art: 'umformen',
      saetze: [
        {
          text: 'Das Ödem (Schwellung) lateral (außen) am Knöchel links geht zurück.',
          unveraendert: false,
        },
        { text: 'Bitte weiter kühlen.', unveraendert: true },
      ],
      quelle: 'nachbildung',
    });
    // Dieselbe Berechtigung wie beim Ausformulieren: das Antwortrecht am Vorgang.
    expect(pruefeAssistenz).toHaveBeenCalledExactlyOnceWith(TOKEN, {
      art: 'rueckfrage',
      id: RUECKFRAGE,
    });
    expect(umformungen).toEqual([
      {
        saetze: ['Das Ödem lateral am Knöchel li. geht zurück.', 'Bitte weiter kühlen.'],
        aufgabe: 'alltagssprache',
        sprache: 'de',
        regeln: ALLTAG_REGELN,
      },
    ]);
  });

  it('lässt die Quelle stehen, wenn die Erklärung Seite, Zahl oder Verneinung ändert', async () => {
    const { adapter } = spion({
      formuliere: () =>
        Promise.resolve({
          ok: true,
          value: {
            saetze: [
              'Die Schwellung außen am rechten Knöchel geht zurück.',
              'Bitte nicht weiter kühlen.',
            ],
          },
        }),
    });
    const { handler } = gateway({ assistenz: adapter });
    const antwort = await handler(anfrage(ZWECK, { rueckfrage: RUECKFRAGE, text: ANTWORT }));

    expect((await gelesen(antwort)).saetze).toEqual([
      { text: 'Das Ödem lateral am Knöchel li. geht zurück.', unveraendert: true },
      { text: 'Bitte weiter kühlen.', unveraendert: true },
    ]);
  });

  it('geht ohne Antwortrecht nicht an den Adapter', async () => {
    const { adapter, umformungen } = spion();
    const { handler } = gateway({ assistenz: adapter, berechtigung: 'verweigert' });
    const antwort = await handler(anfrage(ZWECK, { rueckfrage: RUECKFRAGE, text: ANTWORT }));
    expect(antwort.status).toBe(403);
    expect(umformungen).toEqual([]);
  });
});

describe('ai-gateway: Verlauf in Auszügen', () => {
  const ZWECK = 'verlauf.auszug';
  const AKTE = '66666666-6666-4666-8666-000000000002';
  const EINS = '88888888-8888-4888-8888-000000000001';
  const ZWEI = '88888888-8888-4888-8888-000000000002';
  const EINTRAEGE = [
    {
      id: EINS,
      text: 'Angaben der Patient:in\nPatientin berichtet Schmerz 3 von 10.\n\nBefund\nBeugung 110 Grad.\n\nPlan\nWeiter üben.',
    },
    { id: ZWEI, text: 'Keine Schwellung.' },
  ];

  it('setzt aus den genannten Stellen die Sätze im Wortlaut zusammen', async () => {
    const { handler, pruefeAssistenz, protokoll } = gateway();
    const antwort = await handler(anfrage(ZWECK, { akte: AKTE, eintraege: EINTRAEGE }));

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    expect(await gelesen(antwort)).toEqual({
      ok: true,
      art: 'auszug',
      auszuege: [
        { id: EINS, saetze: ['Patientin berichtet Schmerz 3 von 10.', 'Weiter üben.'] },
        { id: ZWEI, saetze: ['Keine Schwellung.'] },
      ],
      quelle: 'nachbildung',
    });
    expect(pruefeAssistenz).toHaveBeenCalledExactlyOnceWith(TOKEN, { art: 'akte', id: AKTE });
    expect(protokoll).toEqual([]);
  });

  it('gibt dem Adapter nur die Sätze je Eintrag - keine Kennung, kein Titel der Vorlage', async () => {
    const { adapter, auswahlen } = spion();
    const { handler } = gateway({ assistenz: adapter });
    await handler(anfrage(ZWECK, { akte: AKTE, eintraege: EINTRAEGE }));

    expect(auswahlen).toEqual([
      {
        eintraege: [
          ['Patientin berichtet Schmerz 3 von 10.', 'Beugung 110 Grad.', 'Weiter üben.'],
          ['Keine Schwellung.'],
        ],
        hoechstJeEintrag: 2,
        sprache: 'de',
        regeln: AUSZUG_REGELN,
      },
    ]);
    const gesendet = JSON.stringify(auswahlen);
    for (const kennung of [AKTE, EINS, ZWEI]) expect(gesendet).not.toContain(kennung);
  });

  it.each([
    ['ein eigener Satz statt einer Stelle', ['Insgesamt rückläufige Beschwerden.']],
    ['eine Stelle, die es nicht gibt', [{ eintrag: 1, satz: 4 }]],
    [
      'drei Sätze aus einem Eintrag',
      [
        { eintrag: 0, satz: 0 },
        { eintrag: 0, satz: 1 },
        { eintrag: 0, satz: 2 },
      ],
    ],
  ])('zeigt nichts, wenn der Adapter anderes liefert: %s', async (_fall, auswahl) => {
    const { adapter } = spion({
      waehleAus: () => Promise.resolve({ ok: true, value: { auswahl: auswahl as never } }),
    });
    const { handler, protokoll } = gateway({ assistenz: adapter });
    const antwort = await handler(anfrage(ZWECK, { akte: AKTE, eintraege: EINTRAEGE }));

    expect(antwort.status).toBe(502);
    expect(JSON.stringify(await gelesen(antwort))).not.toContain('rückläufig');
    expect(protokoll).toEqual([
      { zweck: ZWECK, anbieter: 'mock', code: 'unavailable', dauerMs: 7 },
    ]);
  });

  it.each([
    ['ohne Akte', { eintraege: EINTRAEGE }, 400, 'invalid_request'],
    ['ein Name als Akte', { akte: 'Erika Beispiel', eintraege: EINTRAEGE }, 400, 'invalid_request'],
    ['ohne Einträge', { akte: AKTE, eintraege: [] }, 400, 'invalid_request'],
    ['Einträge als Text', { akte: AKTE, eintraege: 'Keine Schwellung.' }, 400, 'invalid_request'],
    [
      'ein Eintrag ohne Kennung',
      { akte: AKTE, eintraege: [{ text: 'x' }] },
      400,
      'invalid_request',
    ],
    [
      'ein Eintrag mit Datum und Namen',
      {
        akte: AKTE,
        eintraege: [{ id: EINS, text: 'x', datum: '2026-11-02', autor: 'Anna Beispiel' }],
      },
      400,
      'invalid_request',
    ],
    [
      'ein leerer Eintrag',
      { akte: AKTE, eintraege: [{ id: EINS, text: ' ' }] },
      400,
      'invalid_request',
    ],
    [
      'derselbe Eintrag zweimal',
      { akte: AKTE, eintraege: [EINTRAEGE[1], EINTRAEGE[1]] },
      400,
      'invalid_request',
    ],
    [
      'zu viele Einträge',
      {
        akte: AKTE,
        eintraege: Array.from({ length: AUSZUG_HOECHST_EINTRAEGE + 1 }, (_wert, nummer) => ({
          id: `88888888-8888-4888-8888-0000000000${String(nummer + 10)}`,
          text: 'Keine Schwellung.',
        })),
      },
      413,
      'too_large',
    ],
    [
      'zu viel Text',
      {
        akte: AKTE,
        eintraege: [
          { id: EINS, text: 'a'.repeat(AUSZUG_HOECHST_ZEICHEN / 2) },
          { id: ZWEI, text: 'b'.repeat(AUSZUG_HOECHST_ZEICHEN / 2 + 1) },
        ],
      },
      413,
      'too_large',
    ],
  ])('weist ab: %s', async (_fall, koerper, status, code) => {
    const { adapter, auswahlen } = spion();
    const { handler, pruefeAssistenz } = gateway({ assistenz: adapter });
    const antwort = await handler(anfrage(ZWECK, koerper));

    expect(antwort.status).toBe(status);
    expect((await gelesen(antwort)).error?.code).toBe(code);
    expect(pruefeAssistenz).not.toHaveBeenCalled();
    expect(auswahlen).toEqual([]);
  });

  it.each([
    ['verweigert', 403, 'forbidden'],
    ['abgelehnt', 401, 'session_invalid'],
    ['nicht_pruefbar', 502, 'unavailable'],
  ] as const)('geht mit Befund %s nicht an den Adapter', async (befund, status, code) => {
    const { adapter, auswahlen } = spion();
    const { handler } = gateway({ assistenz: adapter, berechtigung: befund });
    const antwort = await handler(anfrage(ZWECK, { akte: AKTE, eintraege: EINTRAEGE }));

    expect(antwort.status).toBe(status);
    expect((await gelesen(antwort)).error?.code).toBe(code);
    expect(auswahlen).toEqual([]);
  });

  it('meldet einen Adapter, der nicht antwortet, als timeout - ohne Inhalt im Eintrag', async () => {
    const { adapter } = spion({ waehleAus: () => new Promise(() => undefined) });
    const { handler, protokoll } = gateway({ assistenz: adapter, fristMs: 5 });
    const antwort = await handler(anfrage(ZWECK, { akte: AKTE, eintraege: EINTRAEGE }));

    expect(antwort.status).toBe(504);
    expect(protokoll).toEqual([{ zweck: ZWECK, anbieter: 'mock', code: 'timeout', dauerMs: 7 }]);
    expect(JSON.stringify(protokoll)).not.toContain('Schwellung');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke } }),
}));

const { ASSISTENZ_FEHLERTEXTE } = await import('./gateway');
const {
  UMFORMEN_HOECHSTZEICHEN,
  ZWECK_ALLTAGSSPRACHE,
  ZWECK_ENTWURF,
  stuecke,
  textUmformen,
  umformenVerfuegbar,
} = await import('./umformen');

// Umformen im Browser (ANN-861): der Zweck in der Adresse, genau Rückfrage und Text hinaus, je
// Satz der Eingabe ein Satz mit seiner Quelle - und kein Vorschlag, der diese Form nicht hat.

const RUECKFRAGE = 'd1d1d1d1-d1d1-4d1d-8d1d-000000000001';
const TEXT = 'knie li. kühlen, 10 Min.\n\nübungen 2x tägl. weiter. alles ok';

const ERFOLG = {
  ok: true,
  art: 'umformen',
  saetze: [
    { text: 'Knie links kühlen, 10 Minuten.', unveraendert: false },
    { text: 'Übungen 2-mal täglich weiter.', unveraendert: false },
    { text: 'alles ok', unveraendert: true },
  ],
  quelle: 'nachbildung',
};

function anfrage(text = TEXT) {
  return textUmformen({ zweck: ZWECK_ENTWURF, rueckfrageId: RUECKFRAGE, text });
}

describe('textUmformen', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('schickt den Zweck in der Adresse, dazu Rückfrage und Text - sonst nichts', async () => {
    invoke.mockResolvedValue({ data: ERFOLG, error: null });
    const ergebnis = await anfrage();

    expect(ergebnis).toEqual({
      ok: true,
      vorschlag: {
        saetze: [
          {
            quelle: 'knie li. kühlen, 10 Min.',
            text: 'Knie links kühlen, 10 Minuten.',
            unveraendert: false,
          },
          {
            quelle: 'übungen 2x tägl. weiter.',
            text: 'Übungen 2-mal täglich weiter.',
            unveraendert: false,
          },
          { quelle: 'alles ok', text: 'alles ok', unveraendert: true },
        ],
        // Zeilen und Absätze der Eingabe bleiben: Leerzeile zwischen den Absätzen.
        text: 'Knie links kühlen, 10 Minuten.\n\nÜbungen 2-mal täglich weiter. alles ok',
        quelle: 'nachbildung',
      },
    });
    const [funktion, optionen] = invoke.mock.calls[0] as [string, { body: unknown }];
    expect(funktion).toBe('ai-gateway?zweck=nachricht.entwurf');
    expect(optionen.body).toEqual({ rueckfrage: RUECKFRAGE, text: TEXT });
  });

  it('schickt leeren oder zu langen Text gar nicht erst', async () => {
    expect(await anfrage('  ')).toMatchObject({ ok: false, fehler: 'invalid_request' });
    expect(await anfrage('a'.repeat(UMFORMEN_HOECHSTZEICHEN + 1))).toEqual({
      ok: false,
      fehler: 'too_large',
      meldung: ASSISTENZ_FEHLERTEXTE.too_large,
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ['ein Satz zu wenig', ERFOLG.saetze.slice(0, 2)],
    ['ein Satz zu viel', [...ERFOLG.saetze, { text: 'Gute Besserung.', unveraendert: false }]],
    [
      '„unverändert“ mit anderem Wortlaut',
      [...ERFOLG.saetze.slice(0, 2), { text: 'Alles ist in Ordnung.', unveraendert: true }],
    ],
    [
      'ein Satz über zwei Zeilen',
      [{ text: 'Knie links kühlen,\n10 Minuten.', unveraendert: false }, ...ERFOLG.saetze.slice(1)],
    ],
  ])('zeigt keinen Vorschlag mit: %s', async (_fall, saetze) => {
    invoke.mockResolvedValue({ data: { ...ERFOLG, saetze }, error: null });
    expect(await anfrage()).toEqual({
      ok: false,
      fehler: 'nicht_satzgetreu',
      meldung: ASSISTENZ_FEHLERTEXTE.nicht_satzgetreu,
    });
  });

  it.each([
    ['die Antwort eines anderen Zwecks', { ...ERFOLG, art: 'ordnen' }],
    ['ein leerer Satz', { ...ERFOLG, saetze: [{ text: '', unveraendert: false }] }],
    ['Sätze ohne Merkmal', { ...ERFOLG, saetze: ERFOLG.saetze.map(({ text }) => ({ text })) }],
    ['kein Objekt', null],
  ])('nimmt nicht an: %s', async (_fall, wert) => {
    invoke.mockResolvedValue({ data: wert, error: null });
    expect(await anfrage()).toMatchObject({ ok: false, fehler: 'function_unavailable' });
  });

  it.each([
    ['forbidden', 403],
    ['not_configured', 503],
    ['unavailable', 502],
    ['timeout', 504],
  ] as const)('übersetzt die Fehlerklasse %s des Gateways', async (code, status) => {
    invoke.mockResolvedValue({
      data: null,
      error: new Error('http'),
      response: new Response(
        JSON.stringify({ ok: false, error: { code, message: 'ai-gateway: technisch' } }),
        { status, headers: { 'Content-Type': 'application/json' } },
      ),
    });
    expect(await anfrage()).toEqual({
      ok: false,
      fehler: code,
      meldung: ASSISTENZ_FEHLERTEXTE[code],
    });
  });

  it('fragt die Verfügbarkeit je Zweck', async () => {
    invoke.mockResolvedValue({ data: { ok: true, verfuegbar: true }, error: null });
    expect(await umformenVerfuegbar(ZWECK_ENTWURF)).toBe(true);
    expect(await umformenVerfuegbar(ZWECK_ALLTAGSSPRACHE)).toBe(true);
    expect(invoke.mock.calls.map((aufruf) => aufruf[0] as string)).toEqual([
      'ai-gateway?zweck=nachricht.entwurf',
      'ai-gateway?zweck=nachricht.alltagssprache',
    ]);
  });

  it('schickt Alltagssprache unter ihrem eigenen Zweck', async () => {
    invoke.mockResolvedValue({ data: ERFOLG, error: null });
    await textUmformen({ zweck: ZWECK_ALLTAGSSPRACHE, rueckfrageId: RUECKFRAGE, text: TEXT });
    expect(invoke.mock.calls[0]![0]).toBe('ai-gateway?zweck=nachricht.alltagssprache');
  });
});

describe('Stücke im Browser', () => {
  it('teilt in Sätze je Zeile und hält Abkürzungen zusammen', () => {
    expect(stuecke(TEXT)).toEqual([
      { text: 'knie li. kühlen, 10 Min.', zeile: 0 },
      { text: 'übungen 2x tägl. weiter.', zeile: 2 },
      { text: 'alles ok', zeile: 2 },
    ]);
  });
});

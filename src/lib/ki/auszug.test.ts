import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke } }),
}));

const { ASSISTENZ_FEHLERTEXTE } = await import('./gateway');
const {
  AUSZUG_HOECHST_EINTRAEGE,
  AUSZUG_HOECHSTZEICHEN,
  auszuegeAnfragen,
  auszugGetreu,
  auszugVerfuegbar,
  passendeEintraege,
} = await import('./auszug');

// Auszüge im Browser (ANN-861): der Zweck in der Adresse, hinaus nur Akte, Kennung und Wortlaut,
// und gezeigt wird nur ein Satz, der so in seinem Eintrag steht.

const AKTE = '66666666-6666-4666-8666-000000000002';
const EINS = '88888888-8888-4888-8888-000000000001';
const ZWEI = '88888888-8888-4888-8888-000000000002';
const DREI = '88888888-8888-4888-8888-000000000003';
const EINTRAEGE = [
  {
    id: EINS,
    text: 'Angaben der Patient:in\nPatientin berichtet Schmerz 3 von 10.\n\nBefund\nBeugung 110 Grad.\n\nPlan\nWeiter üben.',
  },
  { id: ZWEI, text: 'Keine Schwellung.' },
  { id: DREI, text: 'Geht wieder 30 Min. am Stück.' },
];

const ERFOLG = {
  ok: true,
  art: 'auszug',
  auszuege: [
    { id: EINS, saetze: ['Patientin berichtet Schmerz 3 von 10.', 'Weiter üben.'] },
    { id: ZWEI, saetze: ['Keine Schwellung.'] },
  ],
  quelle: 'nachbildung',
};

function antwortMit(status: number, koerper: unknown): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('auszuegeAnfragen', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('schickt den Zweck in der Adresse, dazu Akte, Kennung und Wortlaut - sonst nichts', async () => {
    invoke.mockResolvedValue({ data: ERFOLG, error: null });
    const ergebnis = await auszuegeAnfragen({
      akteId: AKTE,
      // Was die Seite sonst am Eintrag kennt, geht nicht mit.
      eintraege: EINTRAEGE.map((eintrag) => ({
        ...eintrag,
        datum: '2026-11-02',
        autor: 'Anna Beispiel',
      })),
    });

    expect(ergebnis).toEqual({ ok: true, auszuege: ERFOLG.auszuege, quelle: 'nachbildung' });
    expect(invoke).toHaveBeenCalledTimes(1);
    const [funktion, optionen] = invoke.mock.calls[0] as [string, { body: unknown }];
    expect(funktion).toBe('ai-gateway?zweck=verlauf.auszug');
    expect(optionen.body).toEqual({ akte: AKTE, eintraege: EINTRAEGE });
  });

  it('fragt ohne Eintrag mit Text gar nicht erst', async () => {
    expect(await auszuegeAnfragen({ akteId: AKTE, eintraege: [] })).toEqual({
      ok: false,
      fehler: 'invalid_request',
      meldung: ASSISTENZ_FEHLERTEXTE.invalid_request,
    });
    expect(
      await auszuegeAnfragen({ akteId: AKTE, eintraege: [{ id: EINS, text: ' \n ' }] }),
    ).toMatchObject({ ok: false, fehler: 'invalid_request' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    [
      'ein Satz in eigenen Worten',
      [{ id: EINS, saetze: ['Insgesamt rückläufige Beschwerden.'] }, ERFOLG.auszuege[1]],
    ],
    ['eine geänderte Zahl', [{ id: EINS, saetze: ['Beugung 120 Grad.'] }]],
    ['ein Satz aus einem anderen Eintrag', [{ id: EINS, saetze: ['Keine Schwellung.'] }]],
    ['ein Titel der Vorlage als Satz', [{ id: EINS, saetze: ['Befund'] }]],
    [
      'zwei Sätze zu einem zusammengezogen',
      [{ id: EINS, saetze: ['Beugung 110 Grad. Weiter üben.'] }],
    ],
    ['ein Eintrag, der nicht gesendet wurde', [{ id: AKTE, saetze: ['Keine Schwellung.'] }]],
    ['derselbe Eintrag zweimal', [ERFOLG.auszuege[1], ERFOLG.auszuege[1]]],
    ['ein halber Satz bis zur Abkürzung', [{ id: DREI, saetze: ['Geht wieder 30 Min.'] }]],
    ['derselbe Satz zweimal', [{ id: ZWEI, saetze: ['Keine Schwellung.', 'Keine Schwellung.'] }]],
    ['eine andere Reihenfolge der Einträge', [ERFOLG.auszuege[1], ERFOLG.auszuege[0]]],
    [
      'eine andere Reihenfolge der Sätze',
      [{ id: EINS, saetze: ['Weiter üben.', 'Patientin berichtet Schmerz 3 von 10.'] }],
    ],
  ])('zeigt nichts: %s', async (_fall, auszuege) => {
    invoke.mockResolvedValue({ data: { ...ERFOLG, auszuege }, error: null });
    expect(await auszuegeAnfragen({ akteId: AKTE, eintraege: EINTRAEGE })).toEqual({
      ok: false,
      fehler: 'nicht_satzgetreu',
      meldung: ASSISTENZ_FEHLERTEXTE.nicht_satzgetreu,
    });
  });

  it.each([
    ['drei Sätze zu einem Eintrag', [{ id: EINS, saetze: ['a', 'b', 'c'] }]],
    ['ein Eintrag ohne Satz', [{ id: EINS, saetze: [] }]],
    ['ein Feld mit einer Bewertung', undefined],
  ])('nimmt eine Antwort anderer Form nicht an: %s', async (_fall, auszuege) => {
    const koerper =
      auszuege === undefined
        ? { ok: true, art: 'auszug', zusammenfassung: 'Insgesamt besser.', quelle: 'anbieter' }
        : { ...ERFOLG, auszuege };
    invoke.mockResolvedValue({ data: koerper, error: null });
    expect(await auszuegeAnfragen({ akteId: AKTE, eintraege: EINTRAEGE })).toMatchObject({
      ok: false,
      fehler: 'function_unavailable',
    });
  });

  it('nimmt eine leere Auswahl an', async () => {
    invoke.mockResolvedValue({ data: { ...ERFOLG, auszuege: [] }, error: null });
    expect(await auszuegeAnfragen({ akteId: AKTE, eintraege: EINTRAEGE })).toEqual({
      ok: true,
      auszuege: [],
      quelle: 'nachbildung',
    });
  });

  it.each([
    [403, 'forbidden'],
    [503, 'not_configured'],
    [504, 'timeout'],
  ] as const)('gibt die Fehlerklasse des Gateways weiter: %s', async (status, code) => {
    invoke.mockResolvedValue({
      data: null,
      error: new Error('x'),
      response: antwortMit(status, { ok: false, error: { code, message: 'x' } }),
    });
    expect(await auszuegeAnfragen({ akteId: AKTE, eintraege: EINTRAEGE })).toEqual({
      ok: false,
      fehler: code,
      meldung: ASSISTENZ_FEHLERTEXTE[code],
    });
  });

  it('wirft nicht, wenn die Function nicht antwortet', async () => {
    invoke.mockRejectedValue(new Error('Failed to fetch'));
    expect(await auszuegeAnfragen({ akteId: AKTE, eintraege: EINTRAEGE })).toMatchObject({
      ok: false,
      fehler: 'function_unavailable',
    });
  });
});

describe('auszugGetreu', () => {
  it('lässt denselben Wortlaut zweimal zu, wenn er zweimal im Eintrag steht', () => {
    const doppelt = [{ id: EINS, text: 'Weiter üben.\nBeugung 110 Grad.\nWeiter üben.' }];
    expect(auszugGetreu(doppelt, [{ id: EINS, saetze: ['Weiter üben.', 'Weiter üben.'] }])).toBe(
      true,
    );
  });
});

describe('passendeEintraege', () => {
  it('lässt leere Einträge aus und hält die Grenze der Einträge', () => {
    const viele = Array.from({ length: AUSZUG_HOECHST_EINTRAEGE + 3 }, (_wert, nummer) => ({
      id: `88888888-8888-4888-8888-0000000001${String(nummer + 10)}`,
      text: nummer === 0 ? '  ' : `Eintrag ${String(nummer)}.`,
    }));
    const liste = passendeEintraege(viele);
    expect(liste).toHaveLength(AUSZUG_HOECHST_EINTRAEGE);
    expect(liste[0]!.text).toBe('Eintrag 1.');
  });

  it('hört auf, bevor die Zeichen nicht mehr passen - ohne einen Eintrag zu kürzen', () => {
    const lang = 'a'.repeat(AUSZUG_HOECHSTZEICHEN / 2);
    const liste = passendeEintraege([
      { id: EINS, text: lang },
      { id: ZWEI, text: `${lang}b` },
      { id: AKTE, text: 'Kurz.' },
    ]);
    expect(liste).toEqual([{ id: EINS, text: lang }]);
  });
});

describe('auszugVerfuegbar', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('fragt den Zweck ab und sagt nur bei ausdrücklichem Ja zu', async () => {
    invoke.mockResolvedValue({ data: { ok: true, verfuegbar: true }, error: null });
    expect(await auszugVerfuegbar()).toBe(true);
    expect(invoke.mock.calls[0]![0]).toBe('ai-gateway?zweck=verlauf.auszug');

    invoke.mockResolvedValue({ data: { ok: true, verfuegbar: false }, error: null });
    expect(await auszugVerfuegbar()).toBe(false);
    invoke.mockRejectedValue(new Error('x'));
    expect(await auszugVerfuegbar()).toBe(false);
  });
});

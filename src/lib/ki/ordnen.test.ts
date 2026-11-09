import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke } }),
}));

const { ASSISTENZ_FEHLERTEXTE } = await import('./gateway');
const { ORDNEN_HOECHSTZEICHEN, geordnetGetreu, ordnenVerfuegbar, textOrdnen } =
  await import('./ordnen');
const { einheiten, gleicheSaetze, verbinde } = await import('./einheiten');

// Ordnen im Browser (ANN-861): der Zweck in der Adresse, genau Termin und Text hinaus, und die
// Seite zeigt nur einen Vorschlag, in dem genau die Sätze des Textes stehen.

const TERMIN = '77777777-7777-4777-8777-000000000001';
const TEXT = 'Patient sagt, es zieht links. Beugung 100 Grad.\nWeiter mit Dehnung.';

const ERFOLG = {
  ok: true,
  art: 'ordnen',
  abschnitte: [
    { titel: 'Angaben der Patient:in', text: 'Patient sagt, es zieht links.' },
    { titel: 'Befund', text: 'Beugung 100 Grad.' },
    { titel: 'Plan', text: 'Weiter mit Dehnung.' },
  ],
  quelle: 'nachbildung',
};

function antwortMit(status: number, koerper: unknown): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('textOrdnen', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('schickt den Zweck in der Adresse, dazu Termin und Text - sonst nichts', async () => {
    invoke.mockResolvedValue({ data: ERFOLG, error: null });
    const ergebnis = await textOrdnen({ terminId: TERMIN, text: TEXT });

    expect(ergebnis).toEqual({
      ok: true,
      vorschlag: {
        text:
          'Angaben der Patient:in\nPatient sagt, es zieht links.\n\n' +
          'Befund\nBeugung 100 Grad.\n\nPlan\nWeiter mit Dehnung.',
        abschnitte: ERFOLG.abschnitte,
        quelle: 'nachbildung',
      },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    const [funktion, optionen] = invoke.mock.calls[0] as [string, { body: unknown }];
    expect(funktion).toBe('ai-gateway?zweck=dokumentation.ordnen');
    expect(optionen.body).toEqual({ termin: TERMIN, text: TEXT });
  });

  it('schickt leeren oder zu langen Text gar nicht erst', async () => {
    expect(await textOrdnen({ terminId: TERMIN, text: ' \n ' })).toMatchObject({
      ok: false,
      fehler: 'invalid_request',
    });
    expect(
      await textOrdnen({ terminId: TERMIN, text: 'a'.repeat(ORDNEN_HOECHSTZEICHEN + 1) }),
    ).toEqual({ ok: false, fehler: 'too_large', meldung: ASSISTENZ_FEHLERTEXTE.too_large });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ['ein ergänzter Satz', [...ERFOLG.abschnitte, { titel: 'Behandlung', text: 'Massage.' }]],
    ['ein ausgelassener Satz', ERFOLG.abschnitte.slice(0, 2)],
    [
      'eine geänderte Zahl',
      [ERFOLG.abschnitte[0], { titel: 'Befund', text: 'Beugung 110 Grad.' }, ERFOLG.abschnitte[2]],
    ],
    [
      'eine vertauschte Seite',
      [
        { titel: 'Angaben der Patient:in', text: 'Patient sagt, es zieht rechts.' },
        ...ERFOLG.abschnitte.slice(1),
      ],
    ],
    ['ein doppelter Satz', [...ERFOLG.abschnitte, ERFOLG.abschnitte[1]].slice(0, 4)],
  ])('zeigt keinen Vorschlag mit: %s', async (_fall, abschnitte) => {
    invoke.mockResolvedValue({ data: { ...ERFOLG, abschnitte }, error: null });
    expect(await textOrdnen({ terminId: TERMIN, text: TEXT })).toEqual({
      ok: false,
      fehler: 'nicht_satzgetreu',
      meldung: ASSISTENZ_FEHLERTEXTE.nicht_satzgetreu,
    });
  });

  it.each([
    [
      'ein Abschnitt, den die Vorlage nicht kennt',
      { ...ERFOLG, abschnitte: [{ titel: 'Diagnose', text: TEXT }] },
    ],
    ['die Antwort eines anderen Zwecks', { ...ERFOLG, art: 'umformen' }],
    ['das Diktat', { ok: true, transkript: TEXT, abschnitte: [], quelle: 'nachbildung' }],
    ['kein Objekt', 'ok'],
  ])('nimmt nicht an: %s', async (_fall, wert) => {
    invoke.mockResolvedValue({ data: wert, error: null });
    expect(await textOrdnen({ terminId: TERMIN, text: TEXT })).toMatchObject({
      ok: false,
      fehler: 'function_unavailable',
    });
  });

  it.each([
    ['forbidden', 403],
    ['not_configured', 503],
    ['too_large', 413],
    ['invalid_request', 400],
    ['session_invalid', 401],
    ['unavailable', 502],
    ['timeout', 504],
  ] as const)('übersetzt die Fehlerklasse %s des Gateways', async (code, status) => {
    const koerper = { ok: false, error: { code, message: 'ai-gateway: technisch' } };
    invoke.mockResolvedValue({
      data: null,
      error: new Error('http'),
      response: antwortMit(status, koerper),
    });
    expect(await textOrdnen({ terminId: TERMIN, text: TEXT })).toEqual({
      ok: false,
      fehler: code,
      meldung: ASSISTENZ_FEHLERTEXTE[code],
    });
  });

  it('ordnet eine Antwort, die nicht vom Gateway stammt, nach ihrem Status ein', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: new Error('http'),
      response: antwortMit(401, { code: 401, message: 'Invalid JWT' }),
    });
    invoke.mockResolvedValueOnce({ data: null, error: new Error('fetch'), response: undefined });
    invoke.mockRejectedValueOnce(new Error('kaputt'));
    const fehler = [];
    for (let i = 0; i < 3; i += 1) {
      const ergebnis = await textOrdnen({ terminId: TERMIN, text: TEXT });
      fehler.push(ergebnis.ok ? 'ok' : ergebnis.fehler);
    }
    expect(fehler).toEqual(['session_invalid', 'function_unavailable', 'function_unavailable']);
  });
});

describe('ordnenVerfuegbar', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('fragt den Gateway mit GET nach genau diesem Zweck', async () => {
    invoke.mockResolvedValue({ data: { ok: true, verfuegbar: true }, error: null });
    expect(await ordnenVerfuegbar()).toBe(true);
    const [funktion, optionen] = invoke.mock.calls[0] as [string, { method: string }];
    expect(funktion).toBe('ai-gateway?zweck=dokumentation.ordnen');
    expect(optionen.method).toBe('GET');
  });

  it('heißt bei allem anderen als einem ausdrücklichen Ja nein', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, verfuegbar: false }, error: null });
    invoke.mockResolvedValueOnce({ data: null, error: new Error('http') });
    invoke.mockRejectedValueOnce(new Error('kaputt'));
    expect(await ordnenVerfuegbar()).toBe(false);
    expect(await ordnenVerfuegbar()).toBe(false);
    expect(await ordnenVerfuegbar()).toBe(false);
  });
});

describe('Wortlautprüfung beim Ordnen', () => {
  it('zählt Titelzeilen des Textes nicht als Satz', () => {
    const text = 'Befund\nBeugung 100 Grad.\n\nfrei danach';
    expect(geordnetGetreu(text, [{ text: 'Beugung 100 Grad.\nfrei danach' }])).toBe(true);
    expect(geordnetGetreu(text, [{ text: 'Befund\nBeugung 100 Grad.\nfrei danach' }])).toBe(false);
  });

  it('prüft unabhängig von Abschnitt, Reihenfolge und Zeilenwechsel', () => {
    expect(geordnetGetreu('Eins. Zwei.\nDrei', [{ text: 'Drei' }, { text: 'Zwei.\nEins.' }])).toBe(
      true,
    );
    expect(geordnetGetreu('Knie rechts.', [{ text: 'Knie links.' }])).toBe(false);
    expect(geordnetGetreu('Rechts. Rechts.', [{ text: 'Rechts.' }])).toBe(false);
    expect(geordnetGetreu('', [])).toBe(true);
  });

  it('zerlegt zeilenweise in Sätze und setzt sie wieder zusammen', () => {
    const liste = einheiten('Eins. Zwei.\n\nplan:\nDrei', ['Plan']);
    expect(liste).toEqual([
      { text: 'Eins.', zeile: 0, titel: null },
      { text: 'Zwei.', zeile: 0, titel: null },
      { text: 'Drei', zeile: 3, titel: 'Plan' },
    ]);
    expect(verbinde(liste)).toBe('Eins. Zwei.\nDrei');
    expect(gleicheSaetze(['a', 'b', 'a'], ['a', 'a', 'b'])).toBe(true);
    expect(gleicheSaetze(['a', 'b'], ['a', 'a', 'b'])).toBe(false);
  });
});

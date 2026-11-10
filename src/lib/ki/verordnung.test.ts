import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke } }),
}));

const { ASSISTENZ_FEHLERTEXTE } = await import('./gateway');
const { SCAN_HOECHSTBYTES, felderGetreu, felderVerfuegbar, felderVorschlagen, scanTauglich } =
  await import('./verordnung');

// Felder vom Foto im Browser (ANN-861): der Zweck in der Adresse, hinaus nur Kennung und Bytes
// des Scans, und gezeigt wird nur ein Wert, der so in seiner erkannten Zeile steht.

const DATEI = '99999999-9999-4999-8999-000000000001';
const BILD = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], { type: 'image/jpeg' });

const ERFOLG = {
  ok: true,
  art: 'felder',
  fundstellen: [
    { feld: 'ausgestellt_am', wert: '02.11.2026', zeile: 'Ausgestellt am 02.11.2026' },
    { feld: 'icd10', wert: 'M17.1', zeile: 'ICD-10: M17.1' },
    { feld: 'heilmittel', wert: 'Krankengymnastik 6 x', zeile: 'Krankengymnastik 6 x' },
  ],
  quelle: 'nachbildung',
};

describe('felderVorschlagen', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('schickt den Zweck in der Adresse, dazu Kennung und Bytes des Scans - sonst nichts', async () => {
    invoke.mockResolvedValue({ data: ERFOLG, error: null });
    const ergebnis = await felderVorschlagen({ dateiId: DATEI, bild: BILD });

    expect(ergebnis).toEqual({ ok: true, fundstellen: ERFOLG.fundstellen, quelle: 'nachbildung' });
    const [funktion, optionen] = invoke.mock.calls[0] as [string, { body: FormData }];
    expect(funktion).toBe('ai-gateway?zweck=verordnung.felder');
    expect([...optionen.body.keys()]).toEqual(['datei', 'bild']);
    expect(optionen.body.get('datei')).toBe(DATEI);
    const gesendet = optionen.body.get('bild') as File;
    expect(gesendet.type).toBe('image/jpeg');
    expect(gesendet.name).toBe('scan');
    expect(new Uint8Array(await gesendet.arrayBuffer())).toEqual(
      new Uint8Array(await BILD.arrayBuffer()),
    );
  });

  it.each([
    ['ein leeres Bild', new Blob([], { type: 'image/jpeg' }), 'invalid_request'],
    ['ein GIF', new Blob([new Uint8Array(4)], { type: 'image/gif' }), 'invalid_request'],
    ['ein Bild ohne Format', new Blob([new Uint8Array(4)]), 'invalid_request'],
    [
      'ein Bild über der Grenze',
      new Blob([new Uint8Array(SCAN_HOECHSTBYTES + 1)], { type: 'image/png' }),
      'too_large',
    ],
  ])('schickt %s gar nicht erst', async (_fall, bild, fehler) => {
    expect(await felderVorschlagen({ dateiId: DATEI, bild })).toEqual({
      ok: false,
      fehler,
      meldung: ASSISTENZ_FEHLERTEXTE[fehler as 'too_large'],
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    [
      'ein Wert, der nicht in seiner Zeile steht',
      [{ feld: 'icd10', wert: 'M17.9', zeile: 'ICD-10: M17.1' }],
    ],
    ['ein Wert mit Leerraum am Rand', [{ feld: 'icd10', wert: ' M17.1', zeile: 'ICD-10: M17.1' }]],
    [
      'ein Feld öfter als erlaubt',
      [
        { feld: 'icd10', wert: 'M17.1', zeile: 'ICD-10: M17.1' },
        { feld: 'icd10', wert: 'M17', zeile: 'ICD-10: M17.1' },
      ],
    ],
  ])('zeigt nichts: %s', async (_fall, fundstellen) => {
    invoke.mockResolvedValue({ data: { ...ERFOLG, fundstellen }, error: null });
    expect(await felderVorschlagen({ dateiId: DATEI, bild: BILD })).toEqual({
      ok: false,
      fehler: 'nicht_satzgetreu',
      meldung: ASSISTENZ_FEHLERTEXTE.nicht_satzgetreu,
    });
  });

  it.each([
    ['ein Feld, das es nicht gibt', [{ feld: 'geburtsdatum', wert: '1', zeile: '1' }]],
    ['ein leerer Wert', [{ feld: 'icd10', wert: '', zeile: 'ICD-10: M17.1' }]],
    ['eine Bewertung neben den Fundstellen', undefined],
  ])('nimmt eine Antwort anderer Form nicht an: %s', async (_fall, fundstellen) => {
    const koerper =
      fundstellen === undefined
        ? { ok: true, art: 'felder', zusammenfassung: 'Passt.', quelle: 'anbieter' }
        : { ...ERFOLG, fundstellen };
    invoke.mockResolvedValue({ data: koerper, error: null });
    expect(await felderVorschlagen({ dateiId: DATEI, bild: BILD })).toMatchObject({
      ok: false,
      fehler: 'function_unavailable',
    });
  });

  it('gibt die Abweisung des Gateways weiter und wirft nicht', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new Error('x'),
      response: new Response(
        JSON.stringify({ ok: false, error: { code: 'forbidden', message: 'x' } }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    });
    expect(await felderVorschlagen({ dateiId: DATEI, bild: BILD })).toMatchObject({
      ok: false,
      fehler: 'forbidden',
    });
    invoke.mockRejectedValue(new Error('Failed to fetch'));
    expect(await felderVorschlagen({ dateiId: DATEI, bild: BILD })).toMatchObject({
      ok: false,
      fehler: 'function_unavailable',
    });
  });
});

describe('felderGetreu und scanTauglich', () => {
  it('lässt einen leeren Vorschlag und Werte mitten in der Zeile zu', () => {
    expect(felderGetreu([])).toBe(true);
    expect(felderGetreu([{ feld: 'art', wert: 'Folge', zeile: 'Folgeverordnung' }])).toBe(true);
  });

  it('nimmt Format mit Parametern und PDF an', () => {
    expect(scanTauglich(new Blob([new Uint8Array(3)], { type: 'image/png; x=1' }))).toBe(true);
    expect(scanTauglich(new Blob([new Uint8Array(3)], { type: 'application/pdf' }))).toBe(true);
  });
});

describe('felderVerfuegbar', () => {
  it('fragt den Zweck ab und sagt nur bei ausdrücklichem Ja zu', async () => {
    invoke.mockResolvedValue({ data: { ok: true, verfuegbar: true }, error: null });
    expect(await felderVerfuegbar()).toBe(true);
    expect(invoke.mock.calls.at(-1)![0]).toBe('ai-gateway?zweck=verordnung.felder');
    invoke.mockResolvedValue({ data: { ok: true, verfuegbar: false }, error: null });
    expect(await felderVerfuegbar()).toBe(false);
  });
});

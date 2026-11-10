import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Assistenzpruefung, Berechtigungsbefund } from './berechtigung.ts';
import { erstelleHandler } from './handler.ts';
import { erstelleAssistenznachbildung, erstelleNachbildung } from './mock.ts';
import type {
  Assistenzadapter,
  Erkennungsanfrage,
  Fundstellenanfrage,
  Protokolleintrag,
} from './typen.ts';
import { FELDER_REGELN, SCAN_HOECHST_BYTES, VERORDNUNG_FELDER } from './zwecke.ts';

// Felder vom Foto: Das Bild geht nur hinaus, wenn die Datenbank Art, Zustand und Prüfsumme genau
// dieser Bytes bestätigt (ADR-017 Punkt 39); an den Adapter keine Kennung, in das Protokoll kein
// Inhalt, und jeder Wert steht wörtlich in seiner Zeile.

const ZWECK = 'verordnung.felder';
const DATEI = '99999999-9999-4999-8999-000000000001';
const TOKEN = 'Bearer synthetisches-token-der-person';
/** Beginnt wie ein JPEG; geprüft wird die Signatur in der Ablage, nicht hier. */
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function scan({
  datei = DATEI,
  bild = new Blob([BYTES], { type: 'image/jpeg' }),
  extra = {},
}: {
  datei?: string | null;
  bild?: Blob | null;
  extra?: Record<string, string>;
} = {}): Request {
  const formular = new FormData();
  if (datei !== null) formular.append('datei', datei);
  if (bild !== null) formular.append('bild', bild, 'scan');
  for (const [feld, wert] of Object.entries(extra)) formular.append(feld, wert);
  return new Request(`https://beispiel.invalid/ai-gateway?zweck=${ZWECK}`, {
    method: 'POST',
    headers: { Authorization: TOKEN },
    body: formular,
  });
}

function spion(ersatz: Partial<Assistenzadapter> = {}) {
  const echt = erstelleAssistenznachbildung();
  const erkennungen: Erkennungsanfrage[] = [];
  const suchen: Fundstellenanfrage[] = [];
  const adapter: Assistenzadapter = {
    ...echt,
    erkenne: (auftrag, signal) => {
      erkennungen.push(auftrag);
      return echt.erkenne(auftrag, signal);
    },
    findeFelder: (auftrag, signal) => {
      suchen.push(auftrag);
      return echt.findeFelder(auftrag, signal);
    },
    ...ersatz,
  };
  return { adapter, erkennungen, suchen };
}

function gateway({
  assistenz = spion().adapter,
  berechtigung = 'erlaubt',
  fristMs,
}: {
  assistenz?: Assistenzadapter;
  berechtigung?: Berechtigungsbefund;
  fristMs?: number;
} = {}) {
  const protokoll: Protokolleintrag[] = [];
  const pruefeAssistenz = vi.fn<Assistenzpruefung>(() => Promise.resolve(berechtigung));
  let uhr = 1000;
  const handler = erstelleHandler({
    adapter: erstelleNachbildung(),
    assistenz,
    pruefeSitzung: () => Promise.resolve({ befund: 'gueltig' }),
    pruefeBerechtigung: () => Promise.resolve('erlaubt'),
    pruefeAssistenz,
    protokolliere: (eintrag) => protokoll.push(eintrag),
    jetzt: () => (uhr += 7),
    ...(fristMs ? { fristen: { transkriptionMs: fristMs, strukturierungMs: fristMs } } : {}),
  });
  return { handler, protokoll, pruefeAssistenz };
}

interface Koerper {
  ok: boolean;
  error?: { code: string };
  fundstellen?: { feld: string; wert: string; zeile: string }[];
  [feld: string]: unknown;
}

async function gelesen(antwort: Response): Promise<Koerper> {
  return (await antwort.json()) as Koerper;
}

describe('ai-gateway: Felder vom Foto', () => {
  it('schlägt Werte im Wortlaut ihrer Zeile vor, nach bestätigter Prüfsumme', async () => {
    const { handler, pruefeAssistenz, protokoll } = gateway();
    const antwort = await handler(scan());

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    const koerper = await gelesen(antwort);
    expect(koerper).toMatchObject({ ok: true, art: 'felder', quelle: 'nachbildung' });
    expect(koerper.fundstellen).toContainEqual({
      feld: 'icd10',
      wert: 'M17.1',
      zeile: 'ICD-10: M17.1',
    });
    for (const fund of koerper.fundstellen ?? []) expect(fund.zeile).toContain(fund.wert);
    expect(pruefeAssistenz).toHaveBeenCalledExactlyOnceWith(TOKEN, {
      art: 'scan',
      id: DATEI,
      pruefsumme: sha256(BYTES),
    });
    expect(protokoll).toEqual([]);
  });

  it('gibt dem Adapter nur Bytes, Format und Regeln - keine Kennung der Datei', async () => {
    const { adapter, erkennungen, suchen } = spion();
    const { handler } = gateway({ assistenz: adapter });
    await handler(scan());

    expect(erkennungen).toHaveLength(1);
    expect(Object.keys(erkennungen[0]!).sort()).toEqual(['bild', 'mime', 'regeln', 'sprache']);
    expect([...erkennungen[0]!.bild]).toEqual([...BYTES]);
    expect(erkennungen[0]).toMatchObject({ mime: 'image/jpeg', regeln: FELDER_REGELN });
    expect(suchen[0]!.felder).toEqual(Object.keys(VERORDNUNG_FELDER));
    expect(JSON.stringify(suchen)).not.toContain(DATEI);
  });

  it('nimmt PNG und PDF wie JPEG', async () => {
    for (const typ of ['image/png', 'application/pdf']) {
      const { handler } = gateway();
      const antwort = await handler(scan({ bild: new Blob([BYTES], { type: typ }) }));
      expect(antwort.status, typ).toBe(200);
    }
  });

  it.each([
    ['ohne Datei', { datei: null }],
    ['ein Name als Datei', { datei: 'Verordnung Erika' }],
    ['ohne Bild', { bild: null }],
    ['ein leeres Bild', { bild: new Blob([], { type: 'image/jpeg' }) }],
    ['ein GIF', { bild: new Blob([BYTES], { type: 'image/gif' }) }],
    ['ein SVG', { bild: new Blob(['<svg/>'], { type: 'image/svg+xml' }) }],
    ['HTML als Bild', { bild: new Blob(['<p>x</p>'], { type: 'text/html' }) }],
    ['ein Feld mehr', { extra: { patient: 'Erika Beispiel' } }],
    ['die Datei zweimal', { extra: { datei: DATEI } }],
  ])('weist ab, bevor die Datenbank fragt: %s', async (_fall, teile) => {
    const { adapter, erkennungen } = spion();
    const { handler, pruefeAssistenz } = gateway({ assistenz: adapter });
    const antwort = await handler(scan(teile));

    expect(antwort.status).toBe(400);
    expect((await gelesen(antwort)).error?.code).toBe('invalid_request');
    expect(pruefeAssistenz).not.toHaveBeenCalled();
    expect(erkennungen).toEqual([]);
  });

  it('weist JSON statt eines Formulars ab', async () => {
    const { handler, pruefeAssistenz } = gateway();
    const antwort = await handler(
      new Request(`https://beispiel.invalid/ai-gateway?zweck=${ZWECK}`, {
        method: 'POST',
        headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ datei: DATEI, bild: 'AAAA' }),
      }),
    );
    expect(antwort.status).toBe(400);
    expect(pruefeAssistenz).not.toHaveBeenCalled();
  });

  it('weist ein Bild über der Grenze der Ablage ab', async () => {
    const { handler, pruefeAssistenz } = gateway();
    const zuGross = new Blob([new Uint8Array(SCAN_HOECHST_BYTES + 1)], { type: 'image/jpeg' });
    const antwort = await handler(scan({ bild: zuGross }));

    expect(antwort.status).toBe(413);
    expect((await gelesen(antwort)).error?.code).toBe('too_large');
    expect(pruefeAssistenz).not.toHaveBeenCalled();
  });

  it.each([
    ['verweigert', 403, 'forbidden'],
    ['abgelehnt', 401, 'session_invalid'],
    ['nicht_pruefbar', 502, 'unavailable'],
  ] as const)('schickt mit Befund %s nichts an den Adapter', async (befund, status, code) => {
    const { adapter, erkennungen } = spion();
    const { handler } = gateway({ assistenz: adapter, berechtigung: befund });
    const antwort = await handler(scan());

    expect(antwort.status).toBe(status);
    expect((await gelesen(antwort)).error?.code).toBe(code);
    expect(erkennungen).toEqual([]);
  });

  it('antwortet ohne erkannten Text mit einem leeren Vorschlag und sucht nichts', async () => {
    const { adapter, suchen } = spion({
      erkenne: () => Promise.resolve({ ok: true, value: { zeilen: ['  ', ''] } }),
    });
    const { handler } = gateway({ assistenz: adapter });
    const antwort = await handler(scan());

    expect(await gelesen(antwort)).toEqual({
      ok: true,
      art: 'felder',
      fundstellen: [],
      quelle: 'nachbildung',
    });
    expect(suchen).toEqual([]);
  });

  it.each([
    [
      'eine Zeile mit Zeilenwechsel',
      { erkenne: () => Promise.resolve({ ok: true, value: { zeilen: ['a\nb'] } }) },
    ],
    [
      'eine Stelle außerhalb der Zeile',
      {
        findeFelder: () =>
          Promise.resolve({
            ok: true,
            value: { fundstellen: [{ feld: 'icd10', zeile: 4, von: 8, bis: 99 }] },
          }),
      },
    ],
    [
      'ein Feld, nach dem niemand fragte',
      {
        findeFelder: () =>
          Promise.resolve({
            ok: true,
            value: { fundstellen: [{ feld: 'geburtsdatum', zeile: 1, von: 0, bis: 5 }] },
          }),
      },
    ],
  ])('zeigt nichts, wenn der Adapter anderes liefert: %s', async (_fall, ersatz) => {
    const { adapter } = spion(ersatz as Partial<Assistenzadapter>);
    const { handler, protokoll } = gateway({ assistenz: adapter });
    const antwort = await handler(scan());

    expect(antwort.status).toBe(502);
    expect(protokoll).toEqual([
      { zweck: ZWECK, anbieter: 'mock', code: 'unavailable', dauerMs: 7 },
    ]);
  });

  it('meldet einen Adapter, der nicht antwortet, als timeout - ohne Inhalt im Eintrag', async () => {
    const { adapter } = spion({ erkenne: () => new Promise(() => undefined) });
    const { handler, protokoll } = gateway({ assistenz: adapter, fristMs: 5 });
    const antwort = await handler(scan());

    expect(antwort.status).toBe(504);
    expect(protokoll).toEqual([{ zweck: ZWECK, anbieter: 'mock', code: 'timeout', dauerMs: 7 }]);
    expect(JSON.stringify(protokoll)).not.toContain(DATEI);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { Anbieteradapter, MatrixErgebnis, MatrixRequest } from '../location-provider/typen.ts';
import type { Datenbank } from './datenbank.ts';
import { HOECHSTENS_NOCHMAL, HOECHSTENS_SEITEN, auftragAus, erstelleHandler } from './handler.ts';
import type { Sitzungsergebnis } from './sitzung.ts';
import type { Antwort, Buchung, Plan, Termin, Weg } from './typen.ts';

const PATIENT = '66666666-6666-4666-8666-000000000001';
const KOERPER = {
  patient: PATIENT,
  person: null,
  dauer_minuten: 60,
  von: '2026-12-01',
  bis: '2026-12-14',
  wunschzeiten: [],
  grundlage: null,
  warteliste: null,
};
const ZIEL = { lat: 48.53, lon: 9.05 };
const PRAXIS = { lat: 48.52, lon: 9.06 };
const HIN: Weg = { key: 'hin', from: PRAXIS, to: ZIEL };
const WEITER: Weg = { key: 'weiter', from: ZIEL, to: PRAXIS };
const TERMIN: Termin = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  person: '55555555-5555-4555-8555-000000000002',
  name: 'Anna Beispiel',
  datum: '2026-12-02',
  beginn: '08:15',
  ende: '09:15',
  gebiet: 'none',
};

const plan = (over: Partial<Plan> = {}): Plan => ({
  tage: 3,
  seitengroesse: 7,
  ziel: ZIEL,
  wege: [HIN, WEITER],
  ...over,
});
const gebucht: Buchung = { ausgang: 'gebucht', termin: TERMIN };
const keiner = (ungeprueft = 0, knapp = 0): Buchung => ({ ausgang: 'keiner', ungeprueft, knapp });

function aufbau(
  opts: {
    sitzung?: Sitzungsergebnis;
    plaene?: (Plan | { grund: Parameters<typeof fehlerVon>[0] })[];
    buchungen?: (Buchung | { grund: Parameters<typeof fehlerVon>[0] })[];
    matrix?: ((anfrage: MatrixRequest) => MatrixErgebnis) | null;
  } = {},
) {
  const plaene = [...(opts.plaene ?? [plan()])];
  const buchungen = [...(opts.buchungen ?? [gebucht])];
  const datenbank = {
    plane: vi.fn(() => {
      const naechster = plaene.length > 1 ? plaene.shift()! : plaene[0]!;
      return Promise.resolve(
        'grund' in naechster ? fehlerVon(naechster.grund) : { ok: true as const, plan: naechster },
      );
    }),
    buche: vi.fn(() => {
      const naechste = buchungen.length > 1 ? buchungen.shift()! : buchungen[0]!;
      return Promise.resolve(
        'grund' in naechste ? fehlerVon(naechste.grund) : { ok: true as const, buchung: naechste },
      );
    }),
  } satisfies Datenbank;
  const matrix = vi.fn((anfrage: MatrixRequest) =>
    Promise.resolve(
      (opts.matrix ?? (() => ({ ok: true, value: { durationsSeconds: [[600]] } })))(anfrage),
    ),
  );
  const adapter =
    opts.matrix === null
      ? null
      : ({ id: 'probe', quelle: 'nachbildung', matrix } as unknown as Anbieteradapter);
  const handler = erstelleHandler({
    adapter,
    pruefeSitzung: () => Promise.resolve(opts.sitzung ?? { befund: 'gueltig' }),
    datenbank,
  });
  return { handler, datenbank, matrix };
}

function fehlerVon(
  grund: 'forbidden' | 'not_found' | 'address_not_located' | 'unavailable' | 'waitlist_closed',
) {
  return { ok: false as const, grund };
}

function anfrage(koerper: unknown = KOERPER, init: RequestInit = {}): Request {
  return new Request('http://function.test/auto-booking', {
    method: 'POST',
    headers: { Authorization: 'Bearer person', 'Content-Type': 'application/json' },
    body: typeof koerper === 'string' ? koerper : JSON.stringify(koerper),
    ...init,
  });
}

async function lies(antwort: Response): Promise<Antwort> {
  return (await antwort.json()) as Antwort;
}

describe('Ablauf der automatischen Buchung', () => {
  it('plant, lässt die Wege rechnen und bucht in einem Aufruf', async () => {
    const { handler, datenbank, matrix } = aufbau();
    const antwort = await handler(anfrage());

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    expect(await lies(antwort)).toEqual({
      ok: true,
      value: { ergebnis: 'gebucht', termin: TERMIN },
    });
    expect(matrix).toHaveBeenCalledTimes(2);
    expect(datenbank.plane).toHaveBeenCalledWith(
      'Bearer person',
      expect.objectContaining({ patient: PATIENT }),
      0,
    );
    expect(datenbank.buche).toHaveBeenCalledWith('Bearer person', expect.anything(), 0, [
      { key: 'hin', seconds: 600 },
      { key: 'weiter', seconds: 600 },
    ]);
  });

  it('bucht ohne Kartendienst nicht und schätzt nichts', async () => {
    const { handler, datenbank } = aufbau({ matrix: null });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(502);
    expect((await lies(antwort)).ok).toBe(false);
    expect(await lies(await handler(anfrage()))).toMatchObject({
      error: { code: 'travel_unavailable' },
    });
    expect(datenbank.buche).not.toHaveBeenCalled();
  });

  it('bucht nicht, wenn der Kartendienst nicht antwortet', async () => {
    const { handler, datenbank } = aufbau({
      matrix: () => ({ ok: false, error: { code: 'unavailable', message: 'aus' } }),
    });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(502);
    expect(await lies(antwort)).toMatchObject({ error: { code: 'travel_unavailable' } });
    expect(datenbank.buche).not.toHaveBeenCalled();
  });

  it('braucht keinen Kartendienst, wenn kein Weg zu prüfen ist', async () => {
    const { handler, datenbank } = aufbau({ matrix: null, plaene: [plan({ wege: [] })] });
    const antwort = await handler(anfrage());
    expect(await lies(antwort)).toMatchObject({ ok: true, value: { ergebnis: 'gebucht' } });
    expect(datenbank.buche).toHaveBeenCalledWith('Bearer person', expect.anything(), 0, []);
  });

  it('reicht einen Weg ohne Fahrzeit als ungeprüft weiter', async () => {
    const { handler, datenbank } = aufbau({
      matrix: () => ({ ok: true, value: { durationsSeconds: [[null]] } }),
      buchungen: [keiner(4, 0)],
    });
    const antwort = await handler(anfrage());
    expect(await lies(antwort)).toEqual({
      ok: true,
      value: { ergebnis: 'kein_platz', ungeprueft: 4, knapp: 0 },
    });
    expect(datenbank.buche).toHaveBeenCalledWith('Bearer person', expect.anything(), 0, [
      { key: 'hin', seconds: null },
      { key: 'weiter', seconds: null },
    ]);
  });

  it('blättert zur nächsten Seite und fragt bekannte Wege nicht noch einmal', async () => {
    const neu: Weg = { key: 'neu', from: { lat: 48.51, lon: 9.04 }, to: ZIEL };
    const { handler, datenbank, matrix } = aufbau({
      plaene: [plan({ tage: 7 }), plan({ tage: 2, wege: [HIN, neu] })],
      buchungen: [keiner(1, 5), gebucht],
    });
    const antwort = await handler(anfrage());
    expect(await lies(antwort)).toMatchObject({ value: { ergebnis: 'gebucht' } });
    expect(datenbank.plane.mock.calls.map((aufruf) => (aufruf as unknown[])[2])).toEqual([0, 7]);
    // Seite eins: hin und weiter. Seite zwei: nur der neue Weg.
    expect(matrix).toHaveBeenCalledTimes(3);
    expect(matrix.mock.calls[2]![0].origins).toEqual([neu.from]);
    expect((datenbank.buche.mock.calls[1] as unknown[])[2]).toBe(7);
  });

  it('meldet keinen Platz, wenn die letzte Seite nichts ergibt, und zählt zusammen', async () => {
    const { handler } = aufbau({
      plaene: [plan({ tage: 7 }), plan({ tage: 4 })],
      buchungen: [keiner(2, 10), keiner(1, 3)],
    });
    expect(await lies(await handler(anfrage()))).toEqual({
      ok: true,
      value: { ergebnis: 'kein_platz', ungeprueft: 3, knapp: 13 },
    });
  });

  it('meldet keinen Platz, wenn der Zeitraum keinen freien Tag hat', async () => {
    const { handler, datenbank, matrix } = aufbau({ plaene: [plan({ tage: 0, wege: [] })] });
    expect(await lies(await handler(anfrage()))).toEqual({
      ok: true,
      value: { ergebnis: 'kein_platz', ungeprueft: 0, knapp: 0 },
    });
    expect(matrix).not.toHaveBeenCalled();
    expect(datenbank.buche).not.toHaveBeenCalled();
  });

  it('hört nach der letzten erlaubten Seite auf', async () => {
    const { handler, datenbank } = aufbau({ plaene: [plan({ tage: 7 })], buchungen: [keiner()] });
    expect(await lies(await handler(anfrage()))).toMatchObject({
      value: { ergebnis: 'kein_platz' },
    });
    expect(datenbank.plane).toHaveBeenCalledTimes(HOECHSTENS_SEITEN);
  });

  it('plant neu, wenn der Platz zwischen Planen und Buchen belegt wurde', async () => {
    const { handler, datenbank } = aufbau({ buchungen: [{ ausgang: 'nochmal' }, gebucht] });
    expect(await lies(await handler(anfrage()))).toMatchObject({ value: { ergebnis: 'gebucht' } });
    expect(datenbank.plane.mock.calls.map((aufruf) => (aufruf as unknown[])[2])).toEqual([0, 0]);
  });

  it('gibt nach mehreren Anläufen auf, statt endlos neu zu planen', async () => {
    const { handler, datenbank } = aufbau({ buchungen: [{ ausgang: 'nochmal' }] });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(409);
    expect(await lies(antwort)).toMatchObject({ error: { code: 'busy' } });
    expect(datenbank.buche).toHaveBeenCalledTimes(HOECHSTENS_NOCHMAL + 1);
  });

  it.each([
    ['forbidden', 403],
    ['not_found', 404],
    ['address_not_located', 409],
    ['unavailable', 502],
  ] as const)('gibt die Abweisung der Planung weiter: %s', async (grund, status) => {
    const { handler, datenbank } = aufbau({ plaene: [{ grund }] });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(status);
    expect(await lies(antwort)).toMatchObject({ ok: false, error: { code: grund } });
    expect(datenbank.buche).not.toHaveBeenCalled();
  });

  it('nennt den Ausgang unklar, wenn die Datenbank beim Buchen nicht antwortet', async () => {
    const { handler } = aufbau({ buchungen: [{ grund: 'unavailable' }] });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(502);
    expect(await lies(antwort)).toMatchObject({ error: { code: 'outcome_unknown' } });
  });

  it('gibt die Abweisung der Buchung weiter', async () => {
    const { handler } = aufbau({ buchungen: [{ grund: 'waitlist_closed' }] });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(409);
    expect(await lies(antwort)).toMatchObject({ error: { code: 'waitlist_closed' } });
  });
});

describe('Eingang der automatischen Buchung', () => {
  it('beantwortet die Vorabanfrage des Browsers', async () => {
    const { handler } = aufbau();
    const antwort = await handler(anfrage(undefined, { method: 'OPTIONS', body: null }));
    expect(antwort.status).toBe(204);
    expect(antwort.headers.get('Access-Control-Allow-Headers')).toContain('x-client-info');
  });

  it('nimmt nur POST', async () => {
    const { handler } = aufbau();
    const antwort = await handler(anfrage(undefined, { method: 'GET', body: null }));
    expect(antwort.status).toBe(405);
  });

  it('fragt ohne gültige Sitzung weder Datenbank noch Kartendienst', async () => {
    const { handler, datenbank, matrix } = aufbau({ sitzung: { befund: 'abgelehnt' } });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(401);
    expect(await lies(antwort)).toMatchObject({ error: { code: 'session_invalid' } });
    expect(datenbank.plane).not.toHaveBeenCalled();
    expect(matrix).not.toHaveBeenCalled();
  });

  it('sagt es, wenn die Sitzung nicht prüfbar ist', async () => {
    const { handler, datenbank } = aufbau({
      sitzung: { befund: 'nicht_pruefbar', grund: 'einrichtung', meldung: 'SUPABASE_URL fehlt' },
    });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(503);
    expect(await lies(antwort)).toMatchObject({ error: { code: 'not_configured' } });
    expect(datenbank.plane).not.toHaveBeenCalled();
  });

  it.each([
    ['kein JSON', '{'],
    ['eine Liste', []],
    ['ohne Feld', { ...KOERPER, warteliste: undefined }],
    ['mit zusätzlichem Feld', { ...KOERPER, name: 'Max Mustermann' }],
    ['ohne Akte', { ...KOERPER, patient: null }],
    ['mit Akte ohne Kennung', { ...KOERPER, patient: 'max' }],
    ['mit Person ohne Kennung', { ...KOERPER, person: 'anna' }],
    ['mit Dauer als Text', { ...KOERPER, dauer_minuten: '60' }],
    ['mit zu kurzer Dauer', { ...KOERPER, dauer_minuten: 0 }],
    ['mit zu langer Dauer', { ...KOERPER, dauer_minuten: 300 }],
    ['mit Tag im falschen Format', { ...KOERPER, von: '01.12.2026' }],
    [
      'mit Wunschzeit außerhalb der Woche',
      { ...KOERPER, wunschzeiten: [{ weekday: 8, from: '09:00', to: '10:00' }] },
    ],
    [
      'mit Wunschzeit ohne Uhrzeit',
      { ...KOERPER, wunschzeiten: [{ weekday: 1, from: 'früh', to: '10:00' }] },
    ],
    [
      'mit zu vielen Wunschzeiten',
      {
        ...KOERPER,
        wunschzeiten: Array.from({ length: 22 }, () => ({
          weekday: 1,
          from: '09:00',
          to: '10:00',
        })),
      },
    ],
  ])('weist einen Auftrag ab: %s', async (_name, koerper) => {
    const { handler, datenbank } = aufbau();
    const antwort = await handler(anfrage(koerper));
    expect(antwort.status).toBe(400);
    expect(await lies(antwort)).toMatchObject({ error: { code: 'invalid_request' } });
    expect(datenbank.plane).not.toHaveBeenCalled();
  });

  it('liest genau die acht Felder', () => {
    expect(
      auftragAus({
        ...KOERPER,
        person: '55555555-5555-4555-8555-000000000002',
        wunschzeiten: [{ weekday: 3, from: '13:00', to: '24:00', egal: 1 }],
      }),
    ).toEqual({
      patient: PATIENT,
      person: '55555555-5555-4555-8555-000000000002',
      dauerMinuten: 60,
      von: '2026-12-01',
      bis: '2026-12-14',
      wunschzeiten: [{ weekday: 3, from: '13:00', to: '24:00' }],
      grundlage: null,
      warteliste: null,
    });
  });
});

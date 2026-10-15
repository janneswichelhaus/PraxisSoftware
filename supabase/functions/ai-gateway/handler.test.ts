import { describe, expect, it, vi } from 'vitest';
import type { Berechtigungsbefund, Berechtigungspruefung } from './berechtigung.ts';
import { erstelleHandler, STATUS } from './handler.ts';
import { NACHGEBILDETES_DIKTAT, erstelleNachbildung } from './mock.ts';
import type { Sitzungsergebnis } from './sitzung.ts';
import {
  FEHLERKLASSEN,
  type Abschnitt,
  type Adapterergebnis,
  type Antwort,
  type Protokolleintrag,
  type Sprachadapter,
  type Strukturierungsanfrage,
  type Transkriptionsanfrage,
} from './typen.ts';
import { DIKTAT_ABSCHNITTE, DIKTAT_REGELN, HOECHST_BYTES } from './zwecke.ts';

/**
 * Der Ablauf des Gateways (KI-EPIC-001, BEF-153): Sitzung, Zweck, Anbieter,
 * Formular, Eingaben, Berechtigung, Adapter, Antwort und Protokolleintrag -
 * jede Fehlerklasse mit ihrem Status, die Nachbildung in der Produktion
 * ausgeschlossen, keine Kennung an den Adapter und kein Inhalt im
 * Protokolleintrag. Einen Ausgang ins Betriebslog hat er noch nicht
 * (`index.ts`, ADR-011 Punkt 6).
 */

const TERMIN = '77777777-7777-4777-8777-000000000001';
const TOKEN = 'Bearer synthetisches-token-der-person';
const AUDIO = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01]);

type Feld = string | { daten: Uint8Array; typ: string; datei: string };

/**
 * Ein Formular als `multipart/form-data`, von Hand geschrieben: In jsdom
 * verträgt sich dessen `FormData` nicht mit dem `Request` der Laufzeit.
 */
function multipart(felder: ReadonlyArray<readonly [string, Feld]>) {
  const grenze = 'grenze-des-pruefformulars';
  const text = new TextEncoder();
  const teile: Uint8Array[] = [];
  for (const [name, wert] of felder) {
    if (typeof wert === 'string') {
      teile.push(
        text.encode(
          `--${grenze}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${wert}\r\n`,
        ),
      );
    } else {
      teile.push(
        text.encode(
          `--${grenze}\r\nContent-Disposition: form-data; name="${name}"; filename="${wert.datei}"\r\n` +
            `Content-Type: ${wert.typ}\r\n\r\n`,
        ),
        wert.daten,
        text.encode('\r\n'),
      );
    }
  }
  teile.push(text.encode(`--${grenze}--\r\n`));
  const koerper = new Uint8Array(teile.reduce((summe, teil) => summe + teil.byteLength, 0));
  let stelle = 0;
  for (const teil of teile) {
    koerper.set(teil, stelle);
    stelle += teil.byteLength;
  }
  return { koerper, typ: `multipart/form-data; boundary=${grenze}` };
}

function felder(
  ersatz: Partial<Record<'termin' | 'audio' | 'dauer_s', Feld | null>> = {},
): Array<readonly [string, Feld]> {
  const standard: Record<string, Feld> = {
    termin: TERMIN,
    audio: { daten: AUDIO, typ: 'audio/webm;codecs=opus', datei: 'aufnahme.webm' },
    dauer_s: '187',
  };
  return Object.entries({ ...standard, ...ersatz })
    .filter((eintrag): eintrag is [string, Feld] => eintrag[1] !== null)
    .map(([name, wert]) => [name, wert] as const);
}

/** Die Adresse der Function; der Zweck steht in ihr, nicht im Formular. */
function adresse(suche = '?zweck=dokumentation.diktat'): string {
  return `https://beispiel.invalid/ai-gateway${suche}`;
}

function anfrage(liste: ReadonlyArray<readonly [string, Feld]> = felder(), suche?: string) {
  const { koerper, typ } = multipart(liste);
  return new Request(adresse(suche), {
    method: 'POST',
    headers: { 'Content-Type': typ, Authorization: TOKEN },
    body: koerper,
  });
}

/** Die Frage vor „Sprechen“. */
function statusanfrage(suche?: string) {
  return new Request(adresse(suche), { method: 'GET', headers: { Authorization: TOKEN } });
}

/** Ein Körper, der mitzählt, wie viel von ihm gelesen wurde. */
function zaehlenderStrom(stueckBytes = 1024 * 1024) {
  const zaehler = { gelesen: 0 };
  const stueck = new Uint8Array(stueckBytes);
  // Ohne Vorrat (`highWaterMark: 0`): Ein Stück entsteht erst, wenn jemand liest.
  const strom = new ReadableStream<Uint8Array>(
    {
      pull(steuerung) {
        zaehler.gelesen += stueck.byteLength;
        steuerung.enqueue(stueck);
      },
    },
    { highWaterMark: 0 },
  );
  return { strom, zaehler, stueckBytes };
}

function stromanfrage(strom: ReadableStream<Uint8Array>, suche?: string) {
  return new Request(adresse(suche), {
    method: 'POST',
    headers: { Authorization: TOKEN, 'Content-Type': 'multipart/form-data; boundary=x' },
    body: strom,
    duplex: 'half',
  } as RequestInit);
}

interface Aufbau {
  adapter?: Sprachadapter | null;
  sitzung?: Sitzungsergebnis;
  berechtigung?: Berechtigungsbefund;
  gateAbgewiesen?: boolean;
  fristen?: { transkriptionMs: number; strukturierungMs: number };
}

function gateway({
  adapter = erstelleNachbildung(),
  sitzung = { befund: 'gueltig' },
  berechtigung = 'erlaubt',
  gateAbgewiesen = false,
  fristen,
}: Aufbau = {}) {
  const protokoll: Protokolleintrag[] = [];
  const pruefeBerechtigung = vi.fn<Berechtigungspruefung>(() => Promise.resolve(berechtigung));
  const pruefeSitzung = vi.fn(() => Promise.resolve(sitzung));
  let uhr = 1000;
  const handler = erstelleHandler({
    adapter,
    gateAbgewiesen,
    pruefeSitzung,
    pruefeBerechtigung,
    protokolliere: (eintrag) => protokoll.push(eintrag),
    jetzt: () => (uhr += 7),
    ...(fristen ? { fristen } : {}),
  });
  return { handler, protokoll, pruefeBerechtigung, pruefeSitzung };
}

async function gelesen(antwort: Response): Promise<Antwort> {
  return (await antwort.json()) as Antwort;
}

async function fehlerklasse(antwort: Response): Promise<string> {
  const koerper = await gelesen(antwort);
  return koerper.ok ? 'ok' : koerper.error.code;
}

/** Ein Adapter, der mitschreibt, was er bekommt, und liefert, was man ihm sagt. */
function spion({
  transkript = NACHGEBILDETES_DIKTAT,
  transkription,
  einordnung,
  id = 'mock',
}: {
  transkript?: string;
  transkription?: () => Promise<Adapterergebnis<{ readonly transkript: string }>>;
  einordnung?: (
    anfrage: Strukturierungsanfrage,
  ) => Promise<Adapterergebnis<{ readonly abschnitte: readonly Abschnitt[] }>>;
  id?: string;
} = {}) {
  const echt = erstelleNachbildung();
  const transkribiert: Transkriptionsanfrage[] = [];
  const strukturiert: Strukturierungsanfrage[] = [];
  const signale: AbortSignal[] = [];
  const adapter: Sprachadapter = {
    id,
    quelle: 'nachbildung',
    transkribiere: (anfrage, signal) => {
      transkribiert.push(anfrage);
      signale.push(signal);
      return transkription ? transkription() : Promise.resolve({ ok: true, value: { transkript } });
    },
    strukturiere: (anfrage, signal) => {
      strukturiert.push(anfrage);
      signale.push(signal);
      return einordnung ? einordnung(anfrage) : echt.strukturiere(anfrage, signal);
    },
  };
  return { adapter, transkribiert, strukturiert, signale };
}

describe('ai-gateway: Ablauf', () => {
  it('beantwortet die Vorabanfrage mit CORS und ohne Inhalt', async () => {
    const { handler } = gateway();
    const antwort = await handler(new Request('https://beispiel.invalid/', { method: 'OPTIONS' }));
    expect(antwort.status).toBe(204);
    expect(antwort.headers.get('Access-Control-Allow-Headers')).toContain('x-client-info');
    expect(antwort.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
  });

  it('nimmt nur GET und POST an', async () => {
    const { handler, pruefeSitzung } = gateway();
    const antwort = await handler(new Request(adresse(), { method: 'PUT' }));
    expect(antwort.status).toBe(405);
    expect(await fehlerklasse(antwort)).toBe('invalid_request');
    expect(pruefeSitzung).not.toHaveBeenCalled();
  });

  it('liefert mit der Nachbildung Transkript, Abschnitte der Vorlage und die Quelle', async () => {
    const { handler, protokoll } = gateway();
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    const koerper = await gelesen(antwort);
    expect(koerper).toEqual({
      ok: true,
      transkript: NACHGEBILDETES_DIKTAT,
      quelle: 'nachbildung',
      abschnitte: [
        {
          titel: 'Angaben der Patient:in',
          text: 'Patientin berichtet, das rechte Knie sei seit dem letzten Termin besser, Schmerz drei von zehn.',
        },
        { titel: 'Befund', text: 'Keine Schwellung. Beugung rechts 110 Grad, links 135 Grad.' },
        { titel: 'Behandlung', text: 'Mobilisation Knie rechts und Kräftigung Quadrizeps.' },
        {
          titel: 'Plan',
          text: 'Eigenübungen weiter, vielleicht nächstes Mal Treppe [unverständlich].',
        },
      ],
    });
    // Ein geglückter Aufruf hinterlässt nichts.
    expect(protokoll).toEqual([]);
  });

  it('fragt die Datenbank mit dem Token der Person und dem Termin der Anfrage', async () => {
    const { handler, pruefeBerechtigung, pruefeSitzung } = gateway();
    await handler(anfrage());
    expect(pruefeSitzung).toHaveBeenCalledWith(TOKEN);
    expect(pruefeBerechtigung).toHaveBeenCalledWith(TOKEN, TERMIN);
  });
});

describe('ai-gateway: Sitzung', () => {
  it('weist ohne gültige Sitzung mit 401 ab, ohne Protokolleintrag, Datenbank oder Adapter', async () => {
    const { adapter, transkribiert } = spion();
    const { handler, protokoll, pruefeBerechtigung } = gateway({
      adapter,
      sitzung: { befund: 'abgelehnt' },
    });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(401);
    expect(await fehlerklasse(antwort)).toBe('session_invalid');
    expect(pruefeBerechtigung).not.toHaveBeenCalled();
    expect(transkribiert).toEqual([]);
    expect(protokoll).toEqual([]);
  });

  it('meldet eine nicht prüfbare Sitzung als nicht eingerichtet und protokolliert das', async () => {
    const { handler, protokoll } = gateway({
      sitzung: { befund: 'nicht_pruefbar', grund: 'einrichtung', meldung: 'SUPABASE_URL fehlt' },
    });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(503);
    expect(await fehlerklasse(antwort)).toBe('not_configured');
    expect(protokoll).toEqual([
      { zweck: 'unbekannt', anbieter: 'sitzung', code: 'not_configured', dauerMs: 0 },
    ]);
  });
});

describe('ai-gateway: Formular und Eingaben', () => {
  async function klasse(liste: ReadonlyArray<readonly [string, Feld]>) {
    const { adapter, transkribiert } = spion();
    const { handler, pruefeBerechtigung } = gateway({ adapter });
    const antwort = await handler(anfrage(liste));
    return {
      status: antwort.status,
      code: await fehlerklasse(antwort),
      datenbank: pruefeBerechtigung.mock.calls.length,
      adapter: transkribiert.length,
    };
  }

  it('weist einen Körper ohne Formular ab', async () => {
    const { handler } = gateway();
    const antwort = await handler(
      new Request(adresse(), {
        method: 'POST',
        headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ termin: TERMIN }),
      }),
    );
    expect(antwort.status).toBe(400);
    expect(await fehlerklasse(antwort)).toBe('invalid_request');
  });

  it.each([
    ['mit dem Zweck im Formular', [...felder(), ['zweck', 'dokumentation.diktat'] as const]],
    ['ohne Termin', felder({ termin: null })],
    ['mit einem Termin, der keine Kennung ist', felder({ termin: 'Max Mustermann' })],
    ['ohne Aufnahme', felder({ audio: null })],
    ['mit der Aufnahme als Text', felder({ audio: 'Synthetisch: das Diktat als Text' })],
    [
      'mit einem Format, das kein Ton ist',
      felder({ audio: { daten: AUDIO, typ: 'video/mp4', datei: 'film.mp4' } }),
    ],
    [
      'mit einer leeren Aufnahme',
      felder({ audio: { daten: new Uint8Array(0), typ: 'audio/webm', datei: 'leer.webm' } }),
    ],
    ['ohne Dauer', felder({ dauer_s: null })],
    ['mit Dauer null', felder({ dauer_s: '0' })],
    ['mit einer Dauer, die keine Zahl ist', felder({ dauer_s: 'fünf Minuten' })],
    ['mit einem zusätzlichen Feld', [...felder(), ['name', 'Max Mustermann'] as const]],
    ['mit einem doppelten Feld', [...felder(), ['termin', TERMIN] as const]],
  ])(
    'weist eine Anfrage %s mit 400 ab, bevor Datenbank oder Adapter etwas sehen',
    async (_f, liste) => {
      expect(await klasse(liste)).toEqual({
        status: 400,
        code: 'invalid_request',
        datenbank: 0,
        adapter: 0,
      });
    },
  );

  it.each([
    ['ohne Zweck', ''],
    ['mit unbekanntem Zweck', '?zweck=befund.deuten'],
    ['mit doppeltem Zweck', '?zweck=dokumentation.diktat&zweck=dokumentation.diktat'],
  ])('weist eine Anfrage %s mit 400 ab, ohne die Aufnahme zu lesen', async (_f, suche) => {
    const { handler, pruefeBerechtigung } = gateway();
    const { strom, zaehler } = zaehlenderStrom();
    const antwort = await handler(stromanfrage(strom, suche));
    expect(antwort.status).toBe(400);
    expect(await fehlerklasse(antwort)).toBe('invalid_request');
    expect(zaehler.gelesen).toBe(0);
    expect(pruefeBerechtigung).not.toHaveBeenCalled();
  });

  it('weist eine Aufnahme über fünf Minuten mit 413 ab', async () => {
    expect(await klasse(felder({ dauer_s: '301' }))).toEqual({
      status: 413,
      code: 'too_large',
      datenbank: 0,
      adapter: 0,
    });
  });

  it('weist eine Aufnahme über der Größengrenze mit 413 ab', async () => {
    const gross = new Uint8Array(HOECHST_BYTES + 1);
    expect(
      await klasse(felder({ audio: { daten: gross, typ: 'audio/webm', datei: 'lang.webm' } })),
    ).toEqual({ status: 413, code: 'too_large', datenbank: 0, adapter: 0 });
  });

  it('liest eine Anfrage über der Grenze nicht erst ganz ein', async () => {
    const { handler, pruefeBerechtigung } = gateway();
    const { strom, zaehler, stueckBytes } = zaehlenderStrom();
    const antwort = await handler(stromanfrage(strom));
    expect(antwort.status).toBe(413);
    expect(await fehlerklasse(antwort)).toBe('too_large');
    // Höchstens die Grenze und ein Stück darüber, nicht ein endloser Strom.
    expect(zaehler.gelesen).toBeLessThanOrEqual(HOECHST_BYTES + 3 * stueckBytes);
    expect(pruefeBerechtigung).not.toHaveBeenCalled();
  });

  it('nimmt die üblichen Formate des Browsers an und gibt sie ohne Parameter weiter', async () => {
    for (const typ of [
      'audio/webm;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
    ]) {
      const { adapter, transkribiert } = spion();
      const { handler } = gateway({ adapter });
      const antwort = await handler(
        anfrage(felder({ audio: { daten: AUDIO, typ, datei: 'aufnahme' } })),
      );
      expect(antwort.status, typ).toBe(200);
      expect(transkribiert[0]!.mime).toBe(typ.split(';')[0]);
    }
  });
});

describe('ai-gateway: Berechtigung', () => {
  it('weist ab, was die Datenbank verweigert - ohne Adapter und ohne Protokolleintrag', async () => {
    const { adapter, transkribiert } = spion();
    const { handler, protokoll } = gateway({ adapter, berechtigung: 'verweigert' });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(403);
    expect(await fehlerklasse(antwort)).toBe('forbidden');
    expect(transkribiert).toEqual([]);
    // Den Versuch hält die Datenbank selbst fest (access.denied), nicht der Gateway.
    expect(protokoll).toEqual([]);
  });

  it('meldet eine Sitzung, die die Datenbank nicht annimmt, als ungültig', async () => {
    const { handler } = gateway({ berechtigung: 'abgelehnt' });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(401);
    expect(await fehlerklasse(antwort)).toBe('session_invalid');
  });

  it('lässt nichts durch, wenn die Berechtigung nicht prüfbar ist', async () => {
    const { adapter, transkribiert } = spion();
    const { handler, protokoll } = gateway({ adapter, berechtigung: 'nicht_pruefbar' });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(502);
    expect(await fehlerklasse(antwort)).toBe('unavailable');
    expect(transkribiert).toEqual([]);
    expect(protokoll).toEqual([
      { zweck: 'dokumentation.diktat', anbieter: 'berechtigung', code: 'unavailable', dauerMs: 0 },
    ]);
  });
});

describe('ai-gateway: die Frage vor „Sprechen“ (GET)', () => {
  it('meldet einen bedienten Zweck als verfügbar - ohne Datenbank, Adapter und Protokolleintrag', async () => {
    const { adapter, transkribiert } = spion();
    const { handler, protokoll, pruefeBerechtigung, pruefeSitzung } = gateway({ adapter });
    const antwort = await handler(statusanfrage());
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    expect(await antwort.json()).toEqual({ ok: true, verfuegbar: true });
    expect(pruefeSitzung).toHaveBeenCalledWith(TOKEN);
    expect(pruefeBerechtigung).not.toHaveBeenCalled();
    expect(transkribiert).toEqual([]);
    expect(protokoll).toEqual([]);
  });

  it.each([
    ['ohne Anbieter', { adapter: null }],
    ['mit der Nachbildung in der Produktion', { adapter: null, gateAbgewiesen: true }],
    ['mit einem Adapter, den der Zweck nicht nennt', { adapter: spion({ id: 'fremd' }).adapter }],
  ] as const)('meldet %s „nicht verfügbar“, ohne Protokolleintrag', async (_f, aufbau) => {
    const { handler, protokoll } = gateway(aufbau);
    const antwort = await handler(statusanfrage());
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({ ok: true, verfuegbar: false });
    expect(protokoll).toEqual([]);
  });

  it('antwortet ohne gültige Sitzung nicht', async () => {
    const { handler } = gateway({ sitzung: { befund: 'abgelehnt' } });
    const antwort = await handler(statusanfrage());
    expect(antwort.status).toBe(401);
    expect(await fehlerklasse(antwort)).toBe('session_invalid');
  });

  it('kennt nur die Zwecke der Zweckliste', async () => {
    const { handler } = gateway();
    const antwort = await handler(statusanfrage('?zweck=befund.deuten'));
    expect(antwort.status).toBe(400);
    expect(await fehlerklasse(antwort)).toBe('invalid_request');
  });
});

describe('ai-gateway: Anbieter', () => {
  it('prüft den Anbieter, bevor er die Aufnahme liest', async () => {
    for (const aufbau of [
      { adapter: null },
      { adapter: spion({ id: 'irgendein-anbieter' }).adapter },
    ]) {
      const { handler, pruefeBerechtigung } = gateway(aufbau);
      const { strom, zaehler } = zaehlenderStrom();
      const antwort = await handler(stromanfrage(strom));
      expect(antwort.status).toBe(503);
      expect(await fehlerklasse(antwort)).toBe('not_configured');
      expect(zaehler.gelesen).toBe(0);
      expect(pruefeBerechtigung).not.toHaveBeenCalled();
    }
  });

  it('antwortet ohne eingerichteten Anbieter „nicht eingerichtet" - ohne Protokolleintrag', async () => {
    const { handler, protokoll } = gateway({ adapter: null });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(503);
    expect(await fehlerklasse(antwort)).toBe('not_configured');
    expect(protokoll).toEqual([]);
  });

  it('schließt die Nachbildung in der Produktion aus und meldet das als Protokolleintrag', async () => {
    const { handler, protokoll } = gateway({ adapter: null, gateAbgewiesen: true });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(503);
    expect(await fehlerklasse(antwort)).toBe('not_configured');
    expect(protokoll).toEqual([
      { zweck: 'dokumentation.diktat', anbieter: 'gate', code: 'gate_rejected', dauerMs: 0 },
    ]);
  });

  it('lässt einen Adapter, den der Zweck nicht nennt, nicht an das Diktat', async () => {
    const { adapter, transkribiert } = spion({ id: 'irgendein-anbieter' });
    const { handler, protokoll } = gateway({ adapter });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(503);
    expect(await fehlerklasse(antwort)).toBe('not_configured');
    expect(transkribiert).toEqual([]);
    expect(protokoll).toEqual([
      {
        zweck: 'dokumentation.diktat',
        anbieter: 'irgendein-anbieter',
        code: 'not_configured',
        dauerMs: 0,
      },
    ]);
  });

  it('gibt dem Adapter nur Audio, Format, Sprache und die Regeln des Zwecks', async () => {
    const { adapter, transkribiert, strukturiert } = spion();
    const { handler } = gateway({ adapter });
    await handler(anfrage());

    expect(transkribiert).toHaveLength(1);
    expect(Object.keys(transkribiert[0]!).sort()).toEqual(['audio', 'mime', 'sprache']);
    expect(Array.from(transkribiert[0]!.audio)).toEqual(Array.from(AUDIO));
    expect(transkribiert[0]!.sprache).toBe('de');

    expect(strukturiert).toHaveLength(1);
    expect(Object.keys(strukturiert[0]!).sort()).toEqual([
      'abschnitte',
      'regeln',
      'sprache',
      'transkript',
    ]);
    expect(strukturiert[0]!.regeln).toBe(DIKTAT_REGELN);
    expect(strukturiert[0]!.abschnitte).toEqual(DIKTAT_ABSCHNITTE);

    // Termin, Token und Dauer bleiben im Gateway (Datenminimierung, 6.1).
    const hinaus = JSON.stringify([...transkribiert, ...strukturiert], (_k, wert: unknown) =>
      wert instanceof Uint8Array ? `[${wert.byteLength} Bytes]` : wert,
    );
    expect(hinaus).not.toContain(TERMIN);
    expect(hinaus).not.toContain('synthetisches-token-der-person');
    expect(hinaus).not.toContain('187');
  });

  it('beantwortet eine Aufnahme ohne verständliches Wort ohne Einordnung', async () => {
    const { adapter, strukturiert } = spion({ transkript: '   ' });
    const { handler } = gateway({ adapter });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(200);
    expect(await gelesen(antwort)).toEqual({
      ok: true,
      transkript: '',
      abschnitte: [],
      quelle: 'nachbildung',
    });
    expect(strukturiert).toEqual([]);
  });

  it('meldet einen Ausfall des Adapters mit 502 und protokolliert Klasse und Dauer', async () => {
    const { adapter } = spion({
      transkription: () =>
        Promise.resolve({ ok: false, error: { code: 'unavailable', message: 'weg' } }),
    });
    const { handler, protokoll } = gateway({ adapter });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(502);
    expect(await fehlerklasse(antwort)).toBe('unavailable');
    expect(protokoll).toEqual([
      { zweck: 'dokumentation.diktat', anbieter: 'mock', code: 'unavailable', dauerMs: 7 },
    ]);
  });

  it('meldet eine Frist des Adapters bei der Einordnung mit 504', async () => {
    const { adapter } = spion({
      einordnung: () =>
        Promise.resolve({ ok: false, error: { code: 'timeout', message: 'zu lang' } }),
    });
    const { handler, protokoll } = gateway({ adapter });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(504);
    expect(await fehlerklasse(antwort)).toBe('timeout');
    expect(protokoll.map((eintrag) => eintrag.code)).toEqual(['timeout']);
  });

  it('bricht einen Adapter ab, der nicht antwortet, und meldet timeout', async () => {
    const { adapter, signale } = spion({ transkription: () => new Promise(() => undefined) });
    const { handler } = gateway({
      adapter,
      fristen: { transkriptionMs: 20, strukturierungMs: 20 },
    });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(504);
    expect(await fehlerklasse(antwort)).toBe('timeout');
    expect(signale[0]!.aborted).toBe(true);
  });

  it('behandelt einen Adapter, der wirft, als nicht erreichbar', async () => {
    const { adapter } = spion({ transkription: () => Promise.reject(new Error('Absturz')) });
    const { handler } = gateway({ adapter });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(502);
    expect(await fehlerklasse(antwort)).toBe('unavailable');
  });

  it.each([
    ['keinem Abschnitt', []],
    ['nur leeren Abschnitten', [{ titel: 'Befund', text: '   ' }]],
    ['einen erfundenen Abschnitt', [{ titel: 'Diagnose', text: 'Gonarthrose rechts.' }]],
    [
      'einen Abschnitt doppelt',
      [
        { titel: 'Befund', text: 'Keine Schwellung.' },
        { titel: 'Befund', text: 'Beugung rechts 110 Grad.' },
      ],
    ],
  ])('gibt eine Einordnung mit %s nicht weiter', async (_f, abschnitte) => {
    const { adapter } = spion({
      einordnung: () => Promise.resolve({ ok: true, value: { abschnitte } }),
    });
    const { handler, protokoll } = gateway({ adapter });
    const antwort = await handler(anfrage());
    expect(antwort.status).toBe(502);
    expect(await fehlerklasse(antwort)).toBe('unavailable');
    expect(protokoll.map((eintrag) => eintrag.code)).toEqual(['unavailable']);
  });

  it('ordnet die Abschnitte nach der Vorlage und lässt leere weg', async () => {
    const { adapter } = spion({
      einordnung: () =>
        Promise.resolve({
          ok: true,
          value: {
            abschnitte: [
              { titel: 'Plan', text: 'Eigenübungen weiter.' },
              { titel: 'Behandlung', text: '  ' },
              { titel: 'Befund', text: 'Keine Schwellung.' },
            ],
          },
        }),
    });
    const { handler } = gateway({ adapter });
    const koerper = await gelesen(await handler(anfrage()));
    expect(koerper.ok && koerper.abschnitte).toEqual([
      { titel: 'Befund', text: 'Keine Schwellung.' },
      { titel: 'Plan', text: 'Eigenübungen weiter.' },
    ]);
  });
});

describe('ai-gateway: Fehlerklassen und Protokolleinträge', () => {
  it('kennt für jede Fehlerklasse einen festen HTTP-Status', () => {
    expect(Object.keys(STATUS).sort()).toEqual([...FEHLERKLASSEN].sort());
    expect(STATUS).toEqual({
      session_invalid: 401,
      invalid_request: 400,
      forbidden: 403,
      not_configured: 503,
      too_large: 413,
      unavailable: 502,
      timeout: 504,
    });
  });

  it('meldet im Protokolleintrag nie einen Inhalt, eine Kennung oder eine Größe', async () => {
    const geheim = 'Synthetisch: Herr Beispiel klagt über Knieschmerz rechts';
    const protokoll: Protokolleintrag[] = [];
    const laeufe: Aufbau[] = [
      { sitzung: { befund: 'nicht_pruefbar', grund: 'anmeldedienst', meldung: 'weg' } },
      { berechtigung: 'nicht_pruefbar' },
      { adapter: null, gateAbgewiesen: true },
      {
        adapter: spion({
          transkript: geheim,
          einordnung: () =>
            Promise.resolve({ ok: false, error: { code: 'timeout', message: geheim } }),
        }).adapter,
      },
      {
        adapter: spion({
          transkription: () =>
            Promise.resolve({ ok: false, error: { code: 'unavailable', message: geheim } }),
        }).adapter,
      },
    ];
    for (const lauf of laeufe) {
      const { handler, protokoll: eigenes } = gateway(lauf);
      await handler(anfrage());
      protokoll.push(...eigenes);
    }

    expect(protokoll).toHaveLength(laeufe.length);
    for (const eintrag of protokoll) {
      expect(Object.keys(eintrag).sort()).toEqual(['anbieter', 'code', 'dauerMs', 'zweck']);
    }
    const alles = JSON.stringify(protokoll);
    for (const verboten of [
      geheim,
      TERMIN,
      'synthetisches-token-der-person',
      'audio/webm',
      '187',
    ]) {
      expect(alles).not.toContain(verboten);
    }
  });

  it('nennt im Fehlertext der Antwort keinen Inhalt aus der Anfrage', async () => {
    const { handler } = gateway({ berechtigung: 'verweigert' });
    const koerper = JSON.stringify(await gelesen(await handler(anfrage())));
    expect(koerper).not.toContain(TERMIN);
  });
});

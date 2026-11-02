import type { Kasse } from './kasse.ts';
import type { Sitzungspruefung } from './sitzung.ts';
import type {
  Antwort,
  Fehler,
  Fehlerklasse,
  Statuswert,
  Terminaladapter,
  Terminalergebnis,
  Zahlungswert,
} from './typen.ts';

// Ablauf ohne Laufzeit (ANN-837): Sitzung, Vorprüfung in der Datenbank, Terminal, Buchung. `GET` fragt
// nur, ob kassiert werden kann; `POST` kassiert. Gespeichert wird hier nichts, geloggt auch nicht.

const CORS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export const STATUS: Readonly<Record<Fehlerklasse, number>> = {
  session_invalid: 401,
  invalid_request: 400,
  forbidden: 403,
  not_configured: 503,
  not_payable: 409,
  declined: 402,
  cancelled: 409,
  unavailable: 502,
  timeout: 504,
  not_booked: 409,
};

/** So lange darf eine Karte am Terminal dauern, bevor die Function aufgibt. */
export const TERMINAL_FRIST_MS = 120_000;

/** Ein Betrag über 100.000 € ist am Hausbesuch ein Tippfehler. */
const HOECHSTBETRAG_CENT = 10_000_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface HandlerOptionen {
  /** `null`, wenn kein Terminal eingerichtet ist - dann `not_configured`. */
  readonly adapter: Terminaladapter | null;
  readonly pruefeSitzung: Sitzungspruefung;
  readonly kasse: Kasse;
  /** Für Tests; sonst `crypto.randomUUID`. */
  readonly neueReferenz?: () => string;
  readonly fristMs?: number;
}

function antworte<T>(status: number, koerper: Antwort<T>): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fehler(
  code: Fehlerklasse,
  message: string,
  extra: Partial<Pick<Fehler, 'detail' | 'transaktion'>> = {},
  status: number = STATUS[code],
): Response {
  return antworte(status, { ok: false, error: { code, message, ...extra } });
}

/** Genau zwei Felder: die Rechnung und der Betrag in ganzen Cent. */
function auftragAus(wert: unknown): { rechnung: string; betragCent: number } | null {
  if (typeof wert !== 'object' || wert === null || Array.isArray(wert)) return null;
  const felder = Object.keys(wert).sort();
  if (felder.join(',') !== 'betrag_cent,rechnung') return null;
  const { rechnung, betrag_cent: betragCent } = wert as Record<string, unknown>;
  if (typeof rechnung !== 'string' || !UUID.test(rechnung)) return null;
  if (typeof betragCent !== 'number' || !Number.isInteger(betragCent)) return null;
  if (betragCent <= 0 || betragCent > HOECHSTBETRAG_CENT) return null;
  return { rechnung, betragCent };
}

async function mitFrist(
  versprechen: Promise<Terminalergebnis>,
  ms: number,
): Promise<Terminalergebnis | 'zeit'> {
  let uhr: ReturnType<typeof setTimeout> | undefined;
  const ablauf = new Promise<'zeit'>((fertig) => {
    uhr = setTimeout(() => fertig('zeit'), ms);
  });
  try {
    return await Promise.race([versprechen, ablauf]);
  } finally {
    clearTimeout(uhr);
  }
}

export function erstelleHandler({
  adapter,
  pruefeSitzung,
  kasse,
  neueReferenz = () => crypto.randomUUID(),
  fristMs = TERMINAL_FRIST_MS,
}: HandlerOptionen): (anfrage: Request) => Promise<Response> {
  return async (anfrage) => {
    if (anfrage.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (anfrage.method !== 'GET' && anfrage.method !== 'POST') {
      return fehler('invalid_request', 'nur GET und POST', {}, 405);
    }

    const authorization = anfrage.headers.get('Authorization');
    const sitzung = await pruefeSitzung(authorization);
    if (sitzung.befund === 'abgelehnt') return fehler('session_invalid', 'keine gültige Sitzung');
    if (sitzung.befund === 'nicht_pruefbar') return fehler('not_configured', sitzung.meldung);

    if (anfrage.method === 'GET') {
      return antworte<Statuswert>(200, {
        ok: true,
        value: { verfuegbar: adapter !== null, quelle: adapter?.quelle ?? null },
      });
    }
    if (adapter === null || authorization === null) {
      return fehler('not_configured', 'kein Terminal eingerichtet');
    }

    let koerper: unknown;
    try {
      koerper = await anfrage.json();
    } catch {
      return fehler('invalid_request', 'Körper ist kein JSON');
    }
    const auftrag = auftragAus(koerper);
    if (auftrag === null) return fehler('invalid_request', 'Rechnung und Betrag erwartet');

    // Vor dem Terminal: Wer nicht kassieren darf oder was nicht zahlbar ist, belastet keine Karte.
    const vorab = await kasse.pruefe(authorization, auftrag.rechnung, auftrag.betragCent);
    if (!vorab.ok) {
      if (vorab.grund === 'abgelehnt') return fehler('session_invalid', 'keine gültige Sitzung');
      if (vorab.grund === 'verweigert') return fehler('forbidden', 'nicht erlaubt');
      if (vorab.grund === 'nicht_zahlbar') {
        return fehler('not_payable', 'nicht zahlbar', { detail: vorab.detail });
      }
      return fehler('unavailable', 'Prüfung nicht erreichbar');
    }

    const ergebnis = await mitFrist(
      adapter
        .kassiere({
          betragCent: auftrag.betragCent,
          waehrung: vorab.waehrung,
          referenz: neueReferenz(),
        })
        .catch((): Terminalergebnis => ({ status: 'nicht_erreichbar' })),
      fristMs,
    );
    if (ergebnis === 'zeit') return fehler('timeout', 'Terminal ohne Antwort');
    if (ergebnis.status === 'abgelehnt') return fehler('declined', 'Karte abgelehnt');
    if (ergebnis.status === 'abgebrochen') return fehler('cancelled', 'am Terminal abgebrochen');
    if (ergebnis.status === 'nicht_erreichbar')
      return fehler('unavailable', 'Terminal nicht erreichbar');

    const buchung = await kasse.buche(
      authorization,
      auftrag.rechnung,
      auftrag.betragCent,
      ergebnis.transaktion,
    );
    if (!buchung.ok) {
      return fehler('not_booked', 'abgebucht, nicht gebucht', {
        transaktion: ergebnis.transaktion,
      });
    }
    return antworte<Zahlungswert>(200, {
      ok: true,
      value: {
        zahlung: buchung.zahlung,
        transaktion: ergebnis.transaktion,
        quelle: adapter.quelle,
      },
    });
  };
}

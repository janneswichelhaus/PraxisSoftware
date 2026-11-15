import type { Anbieteradapter } from '../location-provider/typen.ts';
import type { Datenbank } from './datenbank.ts';
import type { Sitzungspruefung } from './sitzung.ts';
import type { Antwort, Auftrag, Fahrzeit, Fehlerklasse, Wert, Wunschfenster } from './typen.ts';
import { berechneFahrzeiten } from './wege.ts';

// Der ganze Ablauf ohne Laufzeit, Umgebung und Anbieter (ANN-865): Sitzung prüfen, die Datenbank
// nach den Wegen fragen, sie beim Kartendienst rechnen lassen, buchen lassen, weiterblättern.
// Ohne Fahrzeit wird nicht gebucht und nichts geschätzt; gespeichert wird hier nichts.

const CORS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export const STATUS: Readonly<Record<Fehlerklasse, number>> = {
  session_invalid: 401,
  invalid_request: 400,
  forbidden: 403,
  not_configured: 503,
  not_found: 404,
  address_incomplete: 409,
  address_not_located: 409,
  waitlist_closed: 409,
  travel_unavailable: 502,
  unavailable: 502,
  outcome_unknown: 502,
  busy: 409,
};

/** 42 Tage in bis zu zwei Gebietsklassen sind höchstens zwölf Seiten zu je sieben Tagen. */
export const HOECHSTENS_SEITEN = 14;
/** So oft plant die Function neu, wenn ein Platz zwischen Planen und Buchen belegt wurde. */
export const HOECHSTENS_NOCHMAL = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const FELDER = [
  'bis',
  'dauer_minuten',
  'grundlage',
  'patient',
  'person',
  'von',
  'warteliste',
  'wunschzeiten',
];

interface HandlerOptionen {
  /** `null`, wenn kein Kartendienst eingerichtet oder freigegeben ist (ADR-019 Punkt 36). */
  readonly adapter: Anbieteradapter | null;
  readonly pruefeSitzung: Sitzungspruefung;
  readonly datenbank: Datenbank;
}

function antworte(status: number, koerper: Antwort): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fehler(code: Fehlerklasse, meldung: string, status: number = STATUS[code]): Response {
  return antworte(status, { ok: false, error: { code, message: `auto-booking: ${meldung}` } });
}

const erfolg = (value: Wert): Response => antworte(200, { ok: true, value });

function kennung(wert: unknown): string | null | undefined {
  if (wert === null) return null;
  return typeof wert === 'string' && UUID.test(wert) ? wert : undefined;
}

function fensterAus(wert: unknown): Wunschfenster[] | null {
  if (!Array.isArray(wert) || wert.length > 21) return null;
  const fenster: Wunschfenster[] = [];
  for (const eintrag of wert as unknown[]) {
    if (typeof eintrag !== 'object' || eintrag === null) return null;
    const { weekday, from, to } = eintrag as Record<string, unknown>;
    if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7)
      return null;
    if (typeof from !== 'string' || typeof to !== 'string') return null;
    if (!UHRZEIT.test(from) || !UHRZEIT.test(to)) return null;
    fenster.push({ weekday, from, to });
  }
  return fenster;
}

/** Genau die acht Felder des Auftrags; alles andere ist kein Auftrag. */
export function auftragAus(wert: unknown): Auftrag | null {
  if (typeof wert !== 'object' || wert === null || Array.isArray(wert)) return null;
  if (Object.keys(wert).sort().join(',') !== FELDER.join(',')) return null;
  const daten = wert as Record<string, unknown>;
  const patient = kennung(daten['patient']);
  const person = kennung(daten['person']);
  const grundlage = kennung(daten['grundlage']);
  const warteliste = kennung(daten['warteliste']);
  const dauer = daten['dauer_minuten'];
  const { von, bis } = daten;
  const wunschzeiten = fensterAus(daten['wunschzeiten']);
  if (typeof patient !== 'string') return null;
  if (person === undefined || grundlage === undefined || warteliste === undefined) return null;
  if (typeof dauer !== 'number' || !Number.isInteger(dauer) || dauer < 5 || dauer > 240)
    return null;
  if (typeof von !== 'string' || typeof bis !== 'string' || !TAG.test(von) || !TAG.test(bis))
    return null;
  if (wunschzeiten === null) return null;
  return { patient, person, dauerMinuten: dauer, von, bis, wunschzeiten, grundlage, warteliste };
}

export function erstelleHandler({
  adapter,
  pruefeSitzung,
  datenbank,
}: HandlerOptionen): (anfrage: Request) => Promise<Response> {
  return async (anfrage) => {
    if (anfrage.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (anfrage.method !== 'POST') return fehler('invalid_request', 'nur POST', 405);

    const authorization = anfrage.headers.get('Authorization');
    const sitzung = await pruefeSitzung(authorization);
    if (sitzung.befund === 'abgelehnt' || authorization === null) {
      return fehler('session_invalid', 'keine gültige Sitzung');
    }
    if (sitzung.befund === 'nicht_pruefbar') return fehler('not_configured', sitzung.meldung);

    let koerper: unknown;
    try {
      koerper = await anfrage.json();
    } catch {
      return fehler('invalid_request', 'Körper ist kein JSON');
    }
    const auftrag = auftragAus(koerper);
    if (auftrag === null) return fehler('invalid_request', 'Auftrag unvollständig');

    const bekannt = new Map<string, number | null>();
    let ungeprueft = 0;
    let knapp = 0;
    let nochmal = 0;
    let versatz = 0;
    for (let seite = 0; seite < HOECHSTENS_SEITEN;) {
      const geplant = await datenbank.plane(authorization, auftrag, versatz);
      if (!geplant.ok) return fehler(geplant.grund, 'Planung abgewiesen');
      const { plan } = geplant;
      if (plan.tage === 0) break;

      const offen = plan.wege.filter((w) => !bekannt.has(w.key));
      if (offen.length > 0) {
        // Ohne Kartendienst wird nicht gebucht: keine Schätzung an seiner Stelle.
        if (adapter === null) return fehler('travel_unavailable', 'kein Kartendienst eingerichtet');
        const gerechnet = await berechneFahrzeiten({ adapter, ziel: plan.ziel, wege: offen });
        if (!gerechnet.ok) return fehler('travel_unavailable', 'Kartendienst ohne Antwort');
        for (const f of gerechnet.fahrzeiten) bekannt.set(f.key, f.seconds);
      }
      const fahrzeiten: Fahrzeit[] = plan.wege.map((w) => ({
        key: w.key,
        seconds: bekannt.get(w.key) ?? null,
      }));

      const gebucht = await datenbank.buche(authorization, auftrag, versatz, fahrzeiten);
      if (!gebucht.ok) {
        // Ohne Antwort der Datenbank weiß niemand, ob der Termin steht.
        return gebucht.grund === 'unavailable'
          ? fehler('outcome_unknown', 'Buchung ohne Antwort')
          : fehler(gebucht.grund, 'Buchung abgewiesen');
      }
      const { buchung } = gebucht;
      if (buchung.ausgang === 'gebucht') {
        return erfolg({ ergebnis: 'gebucht', termin: buchung.termin });
      }
      if (buchung.ausgang === 'nochmal') {
        nochmal += 1;
        if (nochmal > HOECHSTENS_NOCHMAL) return fehler('busy', 'Kalender ändert sich gerade');
        continue;
      }
      ungeprueft += buchung.ungeprueft;
      knapp += buchung.knapp;
      if (plan.tage < plan.seitengroesse) break;
      versatz += plan.seitengroesse;
      seite += 1;
    }
    return erfolg({ ergebnis: 'kein_platz', ungeprueft, knapp });
  };
}

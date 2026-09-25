/**
 * Die Function selbst, ohne Laufzeit (MAP-003a, mit der Matrix aus MAP-004a).
 *
 * Hier steht der ganze Ablauf — Vorabanfrage, Methode, Sitzung, Prüfung der
 * Eingabe, Wahl der Aufgabe, Adapteraufruf, Antwort, Log —, und nichts davon
 * kennt Deno, eine Umgebungsvariable oder einen Anbieter. Alles, was von außen
 * kommt, ist eine Abhängigkeit im Aufruf: Genau deshalb ist diese Datei
 * vollständig mit Unit-Tests prüfbar, obwohl `supabase start` in der
 * Cloud-Umgebung nicht läuft (`MAP-LOOPS.md`, „Einschränkung der Umgebung").
 *
 * **Diese Function schreibt nichts.** Sie hat keinen Datenbankzugriff, keinen
 * Client, keine Tabelle; das Ergebnis wird angezeigt und verworfen (ADR-019
 * Punkt 16). Der einzige Kontakt zur eigenen Instanz ist die Sitzungsprüfung.
 */

import {
  MAX_MATRIX_PUNKTE,
  MIN_WEGPUNKTE,
  type Anbieteradapter,
  type Antwort,
  type Aufgabe,
  type Coordinate,
  type GeocodeRequest,
  type LocationErrorCode,
  type MatrixRequest,
  type Protokolleintrag,
  type RouteRequest,
  type TravelProfile,
} from './typen.ts';
import type { Sitzungspruefung } from './sitzung.ts';

/**
 * Die Kopfzeilen für den Aufruf aus dem Browser.
 *
 * `*` ist hier kein Zugeständnis: Der Endpunkt gibt ohne gültige Sitzung
 * nichts heraus, nimmt keine Cookies entgegen (`credentials` bleibt außen vor)
 * und antwortet mit Koordinaten, die der Aufrufer selbst geschickt hat. Eine
 * Herkunftsliste wäre hier eine Kontrolle, die nichts kontrolliert — die
 * Autorisierung liegt an der Sitzung.
 */
const CORS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/**
 * Welcher HTTP-Status zu welcher Fehlerklasse gehört.
 *
 * `unauthorized` steht hier auf 502 und nicht auf 401: Die Klasse heißt seit
 * BEF-027 ausschließlich „der Anbieter lehnt **unseren** Serverschlüssel ab" —
 * ein Einrichtungsfehler auf unserer Seite, kein Anmeldeproblem der Person.
 * Die 401 gehört `session_invalid`.
 */
const STATUS: Readonly<Record<LocationErrorCode, number>> = {
  timeout: 504,
  unavailable: 502,
  rate_limited: 429,
  unauthorized: 502,
  session_invalid: 401,
  // Vergibt nur der Client (BEF-027); steht hier, damit die Zuordnung
  // vollstaendig bleibt und kein Fall unbemerkt durchfaellt.
  function_unavailable: 502,
  invalid_request: 400,
  not_found: 502,
  not_configured: 503,
};

interface HandlerOptionen {
  /** `null`, wenn kein Anbieter eingerichtet ist — dann antwortet die Function `not_configured`. */
  readonly adapter: Anbieteradapter | null;
  readonly pruefeSitzung: Sitzungspruefung;
  readonly protokolliere: (eintrag: Protokolleintrag) => void;
  /** Für Tests; sonst die Uhr der Laufzeit. */
  readonly jetzt?: () => number;
}

export function erstelleHandler({
  adapter,
  pruefeSitzung,
  protokolliere,
  jetzt = () => Date.now(),
}: HandlerOptionen): (anfrage: Request) => Promise<Response> {
  return async (anfrage) => {
    if (anfrage.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (anfrage.method !== 'POST') {
      return antwort({ ok: false, error: fehler('invalid_request', 'nur POST') }, 405);
    }

    const sitzung = await pruefeSitzung(anfrage.headers.get('Authorization'));
    if (sitzung.befund === 'abgelehnt') {
      // Ohne Sitzung wird nicht protokolliert: Es gab keinen Anbieteraufruf,
      // und ein Log je abgewiesenem Aufruf wäre ein Zähler über Zugriffe.
      return antwort(
        { ok: false, error: fehler('session_invalid', 'keine gültige Sitzung') },
        STATUS.session_invalid,
      );
    }
    if (sitzung.befund === 'nicht_pruefbar') {
      // Hier **wird** protokolliert: Das ist kein abgewiesener Zugriff,
      // sondern ein Betriebsfehler bei uns - und er betrifft jeden Aufruf,
      // bis jemand ihn behebt (BEF-027).
      protokolliere({ anbieter: 'sitzung', code: 'not_configured', dauerMs: 0 });
      return antwort(
        { ok: false, error: fehler('not_configured', sitzung.meldung) },
        STATUS.not_configured,
      );
    }

    const auftrag = await liesAnfrage(anfrage);
    if (auftrag === null) {
      return antwort({ ok: false, error: fehler('invalid_request', 'Anfrage unvollständig') }, 400);
    }

    if (adapter === null) {
      return antwort(
        {
          ok: false,
          error: fehler('not_configured', 'kein Anbieter eingerichtet'),
        },
        STATUS.not_configured,
      );
    }

    const beginn = jetzt();
    const ergebnis =
      auftrag.aufgabe === 'route'
        ? await adapter.route(auftrag.anfrage)
        : auftrag.aufgabe === 'matrix'
          ? await adapter.matrix(auftrag.anfrage)
          : await adapter.geocode(auftrag.anfrage);
    protokolliere({
      anbieter: adapter.id,
      code: ergebnis.ok ? 'ok' : ergebnis.error.code,
      dauerMs: jetzt() - beginn,
    });

    if (!ergebnis.ok)
      return antwort({ ok: false, error: ergebnis.error }, STATUS[ergebnis.error.code]);
    return antwort({ ok: true, value: ergebnis.value, quelle: adapter.quelle }, 200);
  };
}

/**
 * Was gefragt ist, zusammen mit der Aufgabe.
 *
 * Die zwei Aufgaben liegen als getrennte Fälle vor und nicht als ein Objekt
 * mit optionalen Feldern: So kann keine Matrix mit Wegpunkten und keine Route
 * mit Zielen entstehen, und der Aufruf unten hat keinen dritten Zweig.
 */
type Auftrag =
  | { readonly aufgabe: 'route'; readonly anfrage: RouteRequest }
  | { readonly aufgabe: 'matrix'; readonly anfrage: MatrixRequest }
  | { readonly aufgabe: 'geocode'; readonly anfrage: GeocodeRequest };

/**
 * Die Anfrage des Browsers — oder `null`, wenn irgendetwas daran nicht stimmt.
 *
 * Geprüft wird vollständig und vor dem ersten Kontakt zum Anbieter: Eine
 * Koordinate außerhalb der Erdkugel oder ein erfundenes Profil ist ein Fehler
 * von hier, keiner, den der Anbieter beantworten muss.
 *
 * **Die Aufgabe steht im Körper und wird nicht geraten** (MAP-004a): Eine
 * Matrix ohne `origins` ist damit eine unvollständige Matrix und nicht
 * stillschweigend eine Route ohne Wegpunkte.
 */
async function liesAnfrage(anfrage: Request): Promise<Auftrag | null> {
  let koerper: unknown;
  try {
    koerper = await anfrage.json();
  } catch {
    return null;
  }
  if (typeof koerper !== 'object' || koerper === null) return null;

  const daten = koerper as Record<string, unknown>;

  // Geocoding trägt kein Profil, sondern eine Anschrift (MAP-006a).
  if (daten['aufgabe'] === 'geocode') {
    const anschrift = anschriftAus(daten['address']);
    return anschrift === null ? null : { aufgabe: 'geocode', anfrage: anschrift };
  }

  const profil = daten['profile'];
  if (profil !== 'bicycle' && profil !== 'cargo_bicycle') return null;
  const profile = profil satisfies TravelProfile;

  const gefragt = daten['aufgabe'];
  if (gefragt !== 'route' && gefragt !== 'matrix') return null;
  const aufgabe = gefragt satisfies Aufgabe;

  if (aufgabe === 'route') {
    const waypoints = koordinaten(daten['waypoints'], MIN_WEGPUNKTE);
    if (waypoints === null) return null;
    return { aufgabe, anfrage: { waypoints, profile } };
  }

  const origins = koordinaten(daten['origins'], 1);
  const destinations = koordinaten(daten['destinations'], 1);
  if (origins === null || destinations === null) return null;
  // Unsere Obergrenze, nicht die des Anbieters (ANN-091): Eine Anfrage über
  // beliebig viele Punkte löste beliebig viele Relationen aus. Die Grenze der
  // Route ist eine andere und steht beim Anbieter (`ptv.ts`).
  if (origins.length > MAX_MATRIX_PUNKTE || destinations.length > MAX_MATRIX_PUNKTE) return null;
  return { aufgabe, anfrage: { origins, destinations, profile } };
}

/**
 * Eine Anschrift — oder `null`, wenn sie nicht vollständig oder zu lang ist.
 *
 * Genau die fünf Felder des Vertrags; ein zusätzliches Feld (etwa ein Name)
 * wird nicht übernommen, weil nur diese fünf gelesen und weitergegeben werden
 * (ADR-019 Punkt 12). Die Grenzen folgen den Spalten der Adresse.
 */
function anschriftAus(wert: unknown): GeocodeRequest | null {
  if (typeof wert !== 'object' || wert === null) return null;
  const daten = wert as Record<string, unknown>;
  const feld = (name: string, hoechstens: number, mindestens = 1): string | null => {
    const inhalt = daten[name];
    if (typeof inhalt !== 'string') return null;
    const bereinigt = inhalt.trim();
    return bereinigt.length >= mindestens && bereinigt.length <= hoechstens ? bereinigt : null;
  };
  const street = feld('street', 200);
  const houseNumber = feld('houseNumber', 20, 0);
  const postalCode = feld('postalCode', 12, 2);
  const city = feld('city', 200);
  const countryCode = feld('countryCode', 2, 2);
  if (street === null || houseNumber === null || postalCode === null || city === null) return null;
  if (countryCode === null || !/^[A-Z]{2}$/.test(countryCode)) return null;
  return { street, houseNumber, postalCode, city, countryCode };
}

/** Eine Liste von Koordinaten — oder `null`, wenn irgendetwas daran nicht stimmt. */
function koordinaten(wert: unknown, mindestens: number): Coordinate[] | null {
  if (!Array.isArray(wert) || wert.length < mindestens) return null;

  const punkte: Coordinate[] = [];
  for (const eintrag of wert as unknown[]) {
    const gelesen = koordinate(eintrag);
    if (gelesen === null) return null;
    punkte.push(gelesen);
  }
  return punkte;
}

function koordinate(wert: unknown): Coordinate | null {
  if (typeof wert !== 'object' || wert === null) return null;
  const { lat, lon } = wert as Record<string, unknown>;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function fehler(code: LocationErrorCode, meldung: string) {
  return { code, message: `location-provider: ${meldung}` };
}

function antwort(koerper: Antwort, status: number): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      // Eine Route ist ein Ergebnis des Augenblicks und wird nirgends
      // abgelegt - auch nicht in einem Zwischenspeicher (ADR-019 Punkt 16).
      'Cache-Control': 'no-store',
    },
  });
}

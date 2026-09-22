/**
 * Die Function selbst, ohne Laufzeit (MAP-003a).
 *
 * Hier steht der ganze Ablauf — Vorabanfrage, Methode, Sitzung, Prüfung der
 * Eingabe, Adapteraufruf, Antwort, Log —, und nichts davon kennt Deno, eine
 * Umgebungsvariable oder einen Anbieter. Alles, was von außen kommt, ist eine
 * Abhängigkeit im Aufruf: Genau deshalb ist diese Datei vollständig mit
 * Unit-Tests prüfbar, obwohl `supabase start` in der Cloud-Umgebung nicht
 * läuft (`MAP-LOOPS.md`, „Einschränkung der Umgebung").
 *
 * **Diese Function schreibt nichts.** Sie hat keinen Datenbankzugriff, keinen
 * Client, keine Tabelle; das Ergebnis wird angezeigt und verworfen (ADR-019
 * Punkt 16). Der einzige Kontakt zur eigenen Instanz ist die Sitzungsprüfung.
 */

import {
  MIN_WEGPUNKTE,
  type Coordinate,
  type LocationErrorCode,
  type Protokolleintrag,
  type RouteAdapter,
  type RouteAntwort,
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
  readonly adapter: RouteAdapter | null;
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

    const angefragt = await liesAnfrage(anfrage);
    if (angefragt === null) {
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
    const ergebnis = await adapter.route(angefragt);
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
 * Die Anfrage des Browsers — oder `null`, wenn irgendetwas daran nicht stimmt.
 *
 * Geprüft wird vollständig und vor dem ersten Kontakt zum Anbieter: Eine
 * Koordinate außerhalb der Erdkugel oder ein erfundenes Profil ist ein Fehler
 * von hier, keiner, den der Anbieter beantworten muss.
 */
async function liesAnfrage(anfrage: Request): Promise<RouteRequest | null> {
  let koerper: unknown;
  try {
    koerper = await anfrage.json();
  } catch {
    return null;
  }
  if (typeof koerper !== 'object' || koerper === null) return null;

  const daten = koerper as Record<string, unknown>;
  const profil = daten['profile'];
  if (profil !== 'bicycle' && profil !== 'cargo_bicycle') return null;

  const punkte = daten['waypoints'];
  if (!Array.isArray(punkte) || punkte.length < MIN_WEGPUNKTE) return null;

  const wegpunkte: Coordinate[] = [];
  for (const punkt of punkte as unknown[]) {
    const gelesen = koordinate(punkt);
    if (gelesen === null) return null;
    wegpunkte.push(gelesen);
  }

  return { waypoints: wegpunkte, profile: profil satisfies TravelProfile };
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

function antwort(koerper: RouteAntwort, status: number): Response {
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

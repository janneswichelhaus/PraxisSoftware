/**
 * Der Ablauf der Function `patient-file-verify` (ABN-025, ADR-017 Punkte 49
 * bis 52).
 *
 * Eine Anfrage, ein Ablauf: Sitzung prüfen, Ankündigung holen (nur aus der
 * Organisation der Person, nur bestätigt), Objekt lesen, am Inhalt prüfen,
 * Ergebnis eintragen. Die Datenbank entscheidet, was daraus folgt — `ready`,
 * verworfen, schon geprüft. Die Function urteilt, sie repariert nicht, und sie
 * schreibt nur das Ergebnis (Punkt 52).
 *
 * Geantwortet wird mit einer Klasse, nie mit Inhalt: Die Anwendung erfährt
 * `passed` oder `rejected` und sagt es der Person (Punkt 52: „die hochladende
 * Person informiert").
 */

import type { Instanz } from './instanz.ts';
import { pruefeInhalt } from './pruefung.ts';
import type { Protokolleintrag } from './typen.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Abhaengigkeiten {
  /** `null`: nicht eingerichtet - dann prüft die Function nichts. */
  readonly instanz: Instanz | null;
  readonly protokolliere: (eintrag: Protokolleintrag) => void;
  readonly jetzt?: () => number;
}

/**
 * Die Kopfzeilen für den Aufruf aus dem Browser - wie bei `location-provider`.
 * `*` ist kein Zugeständnis: Ohne gültige Sitzung gibt der Endpunkt nichts
 * heraus, nimmt keine Cookies entgegen und antwortet nur mit einer Klasse.
 * Ohne diese Zeilen scheiterte jeder Aufruf aus der Anwendung am Preflight
 * (Zweitreview ABN-EPIC-001c, Befund 1).
 */
const CORS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(status: number, rumpf: Record<string, unknown>): Response {
  return new Response(JSON.stringify(rumpf), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function erstelleHandler({
  instanz,
  protokolliere,
  jetzt = () => Date.now(),
}: Abhaengigkeiten): (anfrage: Request) => Promise<Response> {
  return async (anfrage) => {
    const beginn = jetzt();
    let dateiId: string | null = null;
    const ende = (status: number, klasse: Protokolleintrag['klasse']) => {
      protokolliere({ dateiId, klasse, dauerMs: jetzt() - beginn });
      return json(status, { ergebnis: klasse });
    };

    if (anfrage.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (anfrage.method !== 'POST') return ende(405, 'bad_request');
    if (!instanz) return ende(503, 'not_configured');

    try {
      const rumpf = (await anfrage.json()) as { file_id?: unknown };
      if (typeof rumpf.file_id === 'string' && UUID.test(rumpf.file_id)) dateiId = rumpf.file_id;
    } catch {
      // unten als bad_request beantwortet
    }
    if (!dateiId) return ende(400, 'bad_request');

    const person = await instanz.person(anfrage.headers.get('Authorization'));
    if (!person.ok) return ende(502, 'instance_error');
    if (!person.wert) return ende(401, 'session_rejected');

    const ankuendigung = await instanz.ankuendigung(dateiId, person.wert);
    if (!ankuendigung.ok) return ende(502, 'instance_error');
    // Fremde und unbestätigte Dateien sehen gleich aus: nicht gefunden.
    if (!ankuendigung.wert) return ende(404, 'not_found');
    if (ankuendigung.wert.already_verified) return ende(200, 'already_verified');

    const objekt = await instanz.objekt(ankuendigung.wert.bucket_id, ankuendigung.wert.object_key);
    if (!objekt.ok) return ende(502, 'instance_error');

    const ergebnis = await pruefeInhalt(objekt.wert, ankuendigung.wert);
    const eintrag = await instanz.eintragen(dateiId, ergebnis);
    if (!eintrag.ok) return ende(502, 'instance_error');
    return ende(eintrag.wert === 'not_found' ? 404 : 200, eintrag.wert);
  };
}

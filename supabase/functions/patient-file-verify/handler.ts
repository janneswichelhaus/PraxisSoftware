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
import { pruefeAnhang, pruefeInhalt } from './pruefung.ts';
import type { Art, Protokolleintrag } from './typen.ts';

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

    // KOM-006 (ANN-337), FLT-002 (ANN-552), ERS-001 (ANN-600): eine Datei
    // der Akte, ein Anhang an einer Rückfrage, ein Foto am Rad oder ein Beleg
    // einer Erstattung - genau eines davon.
    let art: Art = 'datei';
    try {
      const rumpf = (await anfrage.json()) as {
        file_id?: unknown;
        attachment_id?: unknown;
        photo_id?: unknown;
        receipt_id?: unknown;
      };
      const datei = typeof rumpf.file_id === 'string' && UUID.test(rumpf.file_id);
      const anhang = typeof rumpf.attachment_id === 'string' && UUID.test(rumpf.attachment_id);
      const foto = typeof rumpf.photo_id === 'string' && UUID.test(rumpf.photo_id);
      const beleg = typeof rumpf.receipt_id === 'string' && UUID.test(rumpf.receipt_id);
      const genauEine =
        [rumpf.file_id, rumpf.attachment_id, rumpf.photo_id, rumpf.receipt_id].filter(
          (k) => k !== undefined,
        ).length === 1;
      if (genauEine && datei) {
        dateiId = rumpf.file_id as string;
      } else if (genauEine && anhang) {
        dateiId = rumpf.attachment_id as string;
        art = 'anhang';
      } else if (genauEine && foto) {
        dateiId = rumpf.photo_id as string;
        art = 'radfoto';
      } else if (genauEine && beleg) {
        dateiId = rumpf.receipt_id as string;
        art = 'beleg';
      }
    } catch {
      // unten als bad_request beantwortet
    }
    if (!dateiId) return ende(400, 'bad_request');

    const person = await instanz.person(anfrage.headers.get('Authorization'));
    if (!person.ok) return ende(502, 'instance_error');
    if (!person.wert) return ende(401, 'session_rejected');

    const ankuendigung = await instanz.ankuendigung(dateiId, person.wert, art);
    if (!ankuendigung.ok) return ende(502, 'instance_error');
    // Fremde und unbestätigte Dateien sehen gleich aus: nicht gefunden.
    if (!ankuendigung.wert) return ende(404, 'not_found');
    if (ankuendigung.wert.already_verified) return ende(200, 'already_verified');

    const objekt = await instanz.objekt(ankuendigung.wert.bucket_id, ankuendigung.wert.object_key);
    if (!objekt.ok) return ende(502, 'instance_error');

    // Zweitreview S2: Was sich nicht prüfen lässt, besteht nicht - ein
    // Fehler beim Zerlegen heißt verwerfen, nicht 500 ohne Ergebnis.
    // Ein Foto am Rad prüft sich wie ein Patientenfoto: JPEG an der Signatur,
    // Prüfsumme, Erlaubnisliste des Geräts (FLT-002, ANN-552); ein Beleg wie
    // eine Datei der Akte - JPEG, PNG oder PDF (ERS-001, ANN-600).
    let ergebnis: Awaited<ReturnType<typeof pruefeInhalt>>;
    try {
      ergebnis =
        art === 'anhang'
          ? await pruefeAnhang(objekt.wert, ankuendigung.wert)
          : await pruefeInhalt(objekt.wert, ankuendigung.wert);
    } catch {
      ergebnis = {
        content_type_ok: false,
        checksum_ok: false,
        metadata_ok: ankuendigung.wert.mime_type === 'application/pdf' ? null : false,
        ...(art === 'anhang' ? { no_audio_ok: false } : {}),
      };
    }
    const eintrag = await instanz.eintragen(dateiId, ergebnis, art);
    if (!eintrag.ok) return ende(502, 'instance_error');
    return ende(eintrag.wert === 'not_found' ? 404 : 200, eintrag.wert);
  };
}

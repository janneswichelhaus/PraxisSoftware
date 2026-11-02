import { baueKalender } from './ics.ts';
import type { Quelle } from './typen.ts';

// Ablauf ohne Laufzeit (ANN-838): `GET /calendar-feed` sagt der Anwendung, ob das Abo eingerichtet
// ist; `GET /calendar-feed/<adresse>` liefert die Kalenderdatei. Kein Log, nichts gespeichert.

const ADRESSE = /^[A-Za-z0-9_-]{43}$/;
const NAME = 'calendar-feed';

const SICHER: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

// Nur die Frage der Anwendung kommt aus dem Browser; die Kalenderdatei braucht kein CORS.
const CORS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface Optionen {
  /** `null`, solange der eigene Schlüssel fehlt: dann „nicht eingerichtet“. */
  readonly quelle: Quelle | null;
  /** Für Tests; sonst die Uhr der Laufzeit. */
  readonly jetzt?: () => Date;
}

function ohneInhalt(status: number, zusatz: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...SICHER, ...zusatz } });
}

export function erstelleHandler({ quelle, jetzt = () => new Date() }: Optionen) {
  return async (anfrage: Request): Promise<Response> => {
    const teile = new URL(anfrage.url).pathname.split('/').filter(Boolean);
    const stelle = teile.indexOf(NAME);
    const rest = stelle === -1 ? teile : teile.slice(stelle + 1);

    if (rest.length === 0) {
      if (anfrage.method === 'OPTIONS') return ohneInhalt(204, CORS);
      if (anfrage.method !== 'GET') return ohneInhalt(405, { ...CORS, Allow: 'GET, OPTIONS' });
      return Response.json(
        { ok: true, value: { verfuegbar: quelle !== null } },
        { headers: { ...SICHER, ...CORS } },
      );
    }

    if (anfrage.method !== 'GET' && anfrage.method !== 'HEAD') {
      return ohneInhalt(405, { Allow: 'GET, HEAD' });
    }
    const adresse = rest.length === 1 ? rest[0]!.replace(/\.ics$/, '') : '';
    if (!ADRESSE.test(adresse)) return ohneInhalt(404);
    if (quelle === null) return ohneInhalt(503);

    const abruf = await quelle.lies(adresse);
    if (!abruf.ok) return ohneInhalt(502);
    // Eine beendete oder ersetzte Adresse bekommt eine leere Datei statt 404: Das alte Abo im
    // Telefon leert sich beim nächsten Abruf, statt mit alten Terminen stehen zu bleiben.
    return new Response(anfrage.method === 'HEAD' ? null : baueKalender(abruf.kalender, jetzt()), {
      status: 200,
      headers: {
        ...SICHER,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="own-motion.ics"',
      },
    });
  };
}

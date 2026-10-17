/**
 * Die Function `electricity-distance` selbst, ohne Laufzeit (BEF-181,
 * ADR-019 Fassung 6).
 *
 * Zwei Wege, unterschieden am Pfad, damit der Lesewächter der Bildstrecke
 * den lesenden erkennt:
 *
 *   * `…/preview` mit `{ month }`: die Kilometer der eigenen geplanten Touren
 *     eines abgeschlossenen Monats - angezeigt in der Zusammenfassung des
 *     Antrags und verworfen, **gespeichert wird nichts**;
 *   * `…/record` mit `{ month, reimbursementId }`: dieselbe Rechnung, danach
 *     trägt die Function die Monatssumme am eben gestellten Antrag ein. Die
 *     Datenbank prüft, dass der Antrag zu Konto, Person und Monat passt.
 *
 * Die Wegpunkte holt die Function selbst, mit der Sitzung der Person - der
 * Browser liefert keine, und er bekommt keine zurück. Ohne Ergebnis (kein
 * Anbieter, eine Route scheitert, keine Tour) antwortet sie `km: null`, und
 * der Antrag behält den Wert je Stunde (ORG-008).
 *
 * Diese Datei kennt weder Deno noch eine Umgebungsvariable noch einen
 * Anbieter: Alles kommt im Aufruf herein und ist so mit Unit-Tests prüfbar.
 */

import type { Anbieteradapter, Quelle } from '../location-provider/typen.ts';
import { monthDistanceMeters, wholeKilometers } from './distance.ts';
import type { Instance } from './instance.ts';

/** Wie beim Kartendienst: Die Autorisierung liegt an der Sitzung, nicht an der Herkunft. */
const CORS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export type ErrorCode =
  'invalid_request' | 'session_invalid' | 'not_allowed' | 'not_configured' | 'unavailable';

const STATUS: Readonly<Record<ErrorCode, number>> = {
  invalid_request: 400,
  session_invalid: 401,
  not_allowed: 403,
  not_configured: 503,
  unavailable: 502,
};

export type Reply =
  | {
      readonly ok: true;
      /** `null`: keine Summe - keine Tour im Monat oder eine Route ohne Ergebnis. */
      readonly value: { readonly km: number | null; readonly amountCents?: number };
      readonly quelle: Quelle;
    }
  | { readonly ok: false; readonly error: ErrorCode };

interface HandlerOptions {
  /** `null`: nicht eingerichtet (Dienstschlüssel fehlt). */
  readonly instance: Instance | null;
  /** `null`: kein Anbieter oder der Schalter aus ADR-019 Punkt 9 ist zu. */
  readonly adapter: Anbieteradapter | null;
}

type Task =
  | { readonly kind: 'preview'; readonly month: string }
  | { readonly kind: 'record'; readonly month: string; readonly reimbursementId: string };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler({
  instance,
  adapter,
}: HandlerOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return reply({ ok: false, error: 'invalid_request' }, 405);
    if (instance === null) return failure('not_configured');

    const authorization = request.headers.get('Authorization');
    const account = await instance.account(authorization);
    if (!account.ok) return failure('unavailable');
    if (account.value === null || authorization === null) return failure('session_invalid');

    const task = await readTask(request);
    if (task === null) return failure('invalid_request');

    // Erst nach der Sitzung: Wer nicht angemeldet ist, erfährt nichts über
    // die Einrichtung.
    if (adapter === null) return failure('not_configured');

    const points = await instance.tourPoints(authorization, task.month);
    if (!points.ok) return failure(points.reason === 'refused' ? 'not_allowed' : 'unavailable');

    const meters = await monthDistanceMeters(adapter, points.value);
    const km = meters === null ? null : wholeKilometers(meters);
    if (km === null || km < 1)
      return reply({ ok: true, value: { km: null }, quelle: adapter.quelle }, 200);
    if (task.kind === 'preview')
      return reply({ ok: true, value: { km }, quelle: adapter.quelle }, 200);

    const recorded = await instance.record(task.reimbursementId, account.value, km);
    if (!recorded.ok) {
      return failure(recorded.reason === 'refused' ? 'not_allowed' : 'unavailable');
    }
    return reply(
      {
        ok: true,
        value: { km: recorded.value.km, amountCents: recorded.value.amountCents },
        quelle: adapter.quelle,
      },
      200,
    );
  };
}

/** Pfad und Körper - oder `null`, wenn etwas daran nicht stimmt. */
async function readTask(request: Request): Promise<Task | null> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const kind = path.endsWith('/preview') ? 'preview' : path.endsWith('/record') ? 'record' : null;
  if (kind === null) return null;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const { month, reimbursementId } = body as Record<string, unknown>;
  if (typeof month !== 'string' || !MONTH.test(month)) return null;
  if (kind === 'preview') return { kind, month };
  if (typeof reimbursementId !== 'string' || !UUID.test(reimbursementId)) return null;
  return { kind, month, reimbursementId };
}

function failure(error: ErrorCode): Response {
  return reply({ ok: false, error }, STATUS[error]);
}

function reply(body: Reply, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      // Eine Strecke ist ein Ergebnis des Augenblicks (ADR-019 Punkt 16).
      'Cache-Control': 'no-store',
    },
  });
}

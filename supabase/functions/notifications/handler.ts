/**
 * Die Function `notifications` ohne Laufzeit (KOM-010, ADR-024 Punkt 16).
 *
 * Eine Aufgabe: fällige Benachrichtigungen zustellen. Aufgerufen vom Zeitplan
 * des Betriebs mit dem Dienstschlüssel im Kopf - nie vom Browser. Die
 * Antwort ist das Betriebsprotokoll des Laufs: Auftragskennung, Weg und
 * Ergebnis, nie Mailadresse, Endpunkt oder Text (Punkt 17, ADR-011). Die
 * Function schreibt nichts auf die Konsole (`src/protokollierung.test.ts`).
 *
 * **Scharf erst mit OPS-001** (Edge Runtime, ADR-015 Punkt 20) und für Mails
 * mit B13, für Push nach der Prüfung aus Punkt 18.
 */

import type { Wege } from './versand.ts';
import { zustellen, type Auftragsbuch } from './zustellen.ts';

export interface HandlerOptionen {
  readonly buch: Auftragsbuch | null;
  readonly wege: Wege;
  readonly dienstschluessel: string;
  readonly appUrl: string;
}

function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i += 1) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

function antwort(koerper: unknown, status: number): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function erstelleHandler({
  buch,
  wege,
  dienstschluessel,
  appUrl,
}: HandlerOptionen): (anfrage: Request) => Promise<Response> {
  return async (anfrage) => {
    if (anfrage.method !== 'POST') return antwort({ ok: false, error: 'invalid_request' }, 405);
    const kopf = anfrage.headers.get('Authorization');
    if (
      dienstschluessel.trim() === '' ||
      kopf === null ||
      !gleich(kopf, `Bearer ${dienstschluessel}`)
    ) {
      return antwort({ ok: false, error: 'not_allowed' }, 403);
    }
    if (buch === null || appUrl.trim() === '' || (wege.mail === null && wege.push === null)) {
      return antwort({ ok: false, error: 'not_configured' }, 503);
    }
    const protokoll = await zustellen(buch, wege, appUrl);
    if (protokoll === null) return antwort({ ok: false, error: 'unavailable' }, 502);
    return antwort({ ok: true, value: protokoll }, 200);
  };
}

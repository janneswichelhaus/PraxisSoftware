/**
 * Der Einstiegspunkt der Edge Function `notifications` (KOM-010).
 *
 * Liest die Secrets und reicht jede Anfrage an `handler.ts` weiter.
 *
 * **Vorbehalt (ADR-024 Punkte 16, 18; ADR-015 Punkt 20).** Die Function hält
 * den Dienstschlüssel der Datenbank und gegebenenfalls den privaten
 * VAPID-Schlüssel. Scharf wird sie erst nach OPS-001; Mails erst mit B13,
 * Push erst nach der Prüfung aus Punkt 18. Bis dahin läuft sie lokal mit
 * `mock`.
 */

import { erstelleAuftragsbuch } from './auftragsbuch.ts';
import { erstelleHandler } from './handler.ts';
import { waehleWege } from './versand.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
// Ein eigenes Secret statt der Vorgabe der Laufzeit: scharf erst, wenn es
// jemand bewusst setzt (wie PLATFORM_ACCESS_ADMIN_KEY).
const dienstschluessel = Deno.env.get('NOTIFICATIONS_SERVICE_KEY') ?? '';

const buch =
  supabaseUrl.trim() !== '' && dienstschluessel.trim() !== ''
    ? erstelleAuftragsbuch({ supabaseUrl, dienstschluessel })
    : null;

Deno.serve(
  erstelleHandler({
    buch,
    dienstschluessel,
    appUrl: Deno.env.get('APP_URL') ?? '',
    wege: waehleWege({
      MAIL_PROVIDER: Deno.env.get('MAIL_PROVIDER'),
      MAIL_MOCK_URL: Deno.env.get('MAIL_MOCK_URL'),
      PUSH_PROVIDER: Deno.env.get('PUSH_PROVIDER'),
      PUSH_MOCK_URL: Deno.env.get('PUSH_MOCK_URL'),
      VAPID_PUBLIC_KEY: Deno.env.get('VAPID_PUBLIC_KEY'),
      VAPID_PRIVATE_KEY: Deno.env.get('VAPID_PRIVATE_KEY'),
      VAPID_SUBJECT: Deno.env.get('VAPID_SUBJECT'),
    }),
  }),
);

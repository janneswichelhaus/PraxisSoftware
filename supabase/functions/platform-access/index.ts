/**
 * Der Einstiegspunkt der Edge Function `platform-access` (POR-003).
 *
 * Die einzige Datei, die die Laufzeit kennt: Sie liest die Secrets, baut die
 * Abhängigkeiten zusammen und reicht jede Anfrage an `handler.ts` weiter.
 *
 * **Vorbehalt (ADR-023 Punkt 9).** Die Function hält den Admin-Schlüssel und
 * legt Konten an. Supabase Edge Functions sind nach ADR-015 Punkt 20 nicht
 * für produktive Gesundheitsdaten freigegeben; scharf wird sie erst nach der
 * Prüfung der Edge Runtime in OPS-001. Lokal läuft sie nur, wenn die Laufzeit
 * für den Lauf bewusst eingeschaltet wird (`docs/sichtung/plattform.md`).
 */

import { erstelleAnmeldedienst, fehlendeEinrichtung } from './anmeldedienst.ts';
import { erstelleHandler } from './handler.ts';
import { waehleVersand } from './versand.ts';

const einrichtung = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  // Ein eigenes Secret statt der Vorgabe der Laufzeit: scharf erst, wenn es
  // jemand bewusst setzt (ADR-023 Punkt 9, OPS-001).
  adminKey: Deno.env.get('PLATFORM_ACCESS_ADMIN_KEY') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
};

const anmeldedienst =
  fehlendeEinrichtung(einrichtung).length === 0 ? erstelleAnmeldedienst(einrichtung) : null;

const versand = waehleVersand({
  MAIL_PROVIDER: Deno.env.get('MAIL_PROVIDER'),
  MAIL_MOCK_URL: Deno.env.get('MAIL_MOCK_URL'),
});

Deno.serve(
  erstelleHandler({
    anmeldedienst,
    versand,
    appUrl: Deno.env.get('APP_URL') ?? '',
  }),
);

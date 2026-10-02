/**
 * Der Einstiegspunkt der Edge Function `patient-file-verify` (ABN-025).
 *
 * Die einzige Datei, die die Laufzeit kennt: Sie liest die Secrets, baut die
 * Abhängigkeiten zusammen und reicht jede Anfrage an `handler.ts` weiter.
 *
 * **Vorbehalt (ADR-017 Punkt 50).** Die Function liest Dateien der Akte mit
 * einem Dienstschlüssel. Supabase Edge Functions sind nach ADR-015 Punkt 20
 * nicht für produktive Gesundheitsdaten freigegeben: gebaut ja, scharf erst
 * mit OPS-001. Bis dahin bleibt `app.patient_file_verification_required()`
 * aus und jede Datei „nicht serverseitig geprüft" (Punkt 51).
 */

import { erstelleHandler } from './handler.ts';
import { erstelleInstanz, fehlendeEinrichtung } from './instanz.ts';
import type { Protokolleintrag } from './typen.ts';

const einrichtung = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  // Ein eigenes Secret statt der Vorgabe der Laufzeit: scharf erst, wenn es
  // jemand bewusst setzt (OPS-001), wie beim Zugangsdienst.
  dienstKey: Deno.env.get('PATIENT_FILE_VERIFY_SERVICE_KEY') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
};

const instanz = fehlendeEinrichtung(einrichtung).length === 0 ? erstelleInstanz(einrichtung) : null;

/** Kennung, Ergebnisklasse und Dauer - nie Bytes, Namen oder Objektschlüssel (ADR-011). */
function protokolliere(eintrag: Protokolleintrag): void {
  console.log(JSON.stringify({ dienst: 'patient-file-verify', ...eintrag }));
}

Deno.serve(erstelleHandler({ instanz, protokolliere }));

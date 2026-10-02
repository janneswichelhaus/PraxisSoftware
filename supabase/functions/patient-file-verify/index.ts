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

/**
 * Kein eigener Logausgang. Die Klasse jedes Laufs geht an die Anwendung
 * zurück, ein Befund steht im Auditlog (`patient_file.verification_failed`).
 * Ein dritter erklärter Ausgang für Betriebslogs neben `src/lib/protokoll.ts`
 * und `location-provider` wäre eine Entscheidung nach ADR-011 Punkt 6
 * (`eslint.config.js`, `src/protokollierung.test.ts`) und gehört zu OPS-004,
 * wenn die Function scharf wird. `protokolliere` bleibt die eine Stelle dafür.
 */
function protokolliere(_eintrag: Protokolleintrag): void {}

Deno.serve(erstelleHandler({ instanz, protokolliere }));

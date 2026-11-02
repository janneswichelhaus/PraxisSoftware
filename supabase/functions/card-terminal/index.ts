import { waehleTerminal } from './auswahl.ts';
import { erstelleHandler } from './handler.ts';
import { erstelleKasse } from './kasse.ts';
import { erstelleSitzungspruefung } from './sitzung.ts';

// Einziger Einstieg mit Laufzeit: liest die Secrets und reicht an `handler.ts` weiter. Scharf erst mit
// einem geprüften Zahlungsdienst und der Prüfung der Laufzeit (ADR-002, ADR-015 Punkt 20); bis dahin nur
// die Nachbildung.
const eigeneInstanz = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
};

Deno.serve(
  erstelleHandler({
    adapter: waehleTerminal({
      CARD_TERMINAL_PROVIDER: Deno.env.get('CARD_TERMINAL_PROVIDER'),
      APP_ENVIRONMENT: Deno.env.get('APP_ENVIRONMENT'),
    }),
    pruefeSitzung: erstelleSitzungspruefung(eigeneInstanz),
    kasse: erstelleKasse(eigeneInstanz),
  }),
);

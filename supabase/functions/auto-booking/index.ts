import { waehleAdapter } from '../location-provider/auswahl.ts';
import { erstelleDatenbank } from './datenbank.ts';
import { erstelleHandler } from './handler.ts';
import { erstelleSitzungspruefung } from './sitzung.ts';

// Einziger Einstieg mit Laufzeit: liest die Secrets und reicht an `handler.ts` weiter. Derselbe
// Kartendienst und derselbe Schalter wie `location-provider`; mit echten Adressen erst nach dem Gate
// aus ADR-019 Punkt 9 und der Prüfung der Laufzeit (ADR-015 Punkt 20).
const eigeneInstanz = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
};

Deno.serve(
  erstelleHandler({
    adapter: waehleAdapter({
      LOCATION_PROVIDER: Deno.env.get('LOCATION_PROVIDER'),
      PTV_API_KEY: Deno.env.get('PTV_API_KEY'),
      LOCATION_DATA_GATE: Deno.env.get('LOCATION_DATA_GATE'),
      APP_ENVIRONMENT: Deno.env.get('APP_ENVIRONMENT'),
    }),
    pruefeSitzung: erstelleSitzungspruefung(eigeneInstanz),
    datenbank: erstelleDatenbank(eigeneInstanz),
  }),
);

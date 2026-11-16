import { erstelleDatenbank } from './datenbank.ts';
import { erstelleHandler } from './handler.ts';
import { erstelleKartendienst } from './kartendienst.ts';
import { erstelleSitzungspruefung } from './sitzung.ts';

// Einziger Einstieg mit Laufzeit: liest die Adresse der eigenen Instanz und reicht an `handler.ts`
// weiter. Den Kartendienst spricht nur `location-provider` an; mit echten Adressen erst nach dem Gate
// aus ADR-019 Punkt 9 und der Prüfung der Laufzeit (ADR-015 Punkt 20).
const eigeneInstanz = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
};

Deno.serve(
  erstelleHandler({
    kartendienst: erstelleKartendienst(eigeneInstanz),
    pruefeSitzung: erstelleSitzungspruefung(eigeneInstanz),
    datenbank: erstelleDatenbank(eigeneInstanz),
  }),
);

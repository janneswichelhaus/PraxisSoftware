/**
 * Der Einstiegspunkt der Edge Function `electricity-distance` (BEF-181).
 *
 * Die einzige Datei, die die Laufzeit kennt: Sie liest die Secrets, baut die
 * Abhängigkeiten zusammen und reicht jede Anfrage an `handler.ts` weiter.
 *
 * **Vorbehalt.** Wie `location-provider` (ADR-019 Punkt 15, ADR-015 Punkt 20):
 * gebaut ja, scharf erst mit OPS-001 und dem Gate aus ADR-019 Punkt 9. Den
 * Anbieter und seinen Schalter wählt dieselbe Stelle wie beim Kartendienst
 * (`richteEin`); in der Produktion ohne `released` gibt es keinen, und jeder
 * Antrag behält den Wert je Stunde.
 *
 * **Kein Logausgang.** Ein dritter erklärter Ausgang für Betriebslogs neben
 * `src/lib/protokoll.ts` und `location-provider` wäre eine Entscheidung nach
 * ADR-011 Punkt 6; die Fehlerklasse geht an die Anwendung zurück.
 */

import { richteEin } from '../location-provider/auswahl.ts';
import { createHandler } from './handler.ts';
import { createInstance, missingSetup } from './instance.ts';

const setup = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  // Ein eigenes Secret statt der Vorgabe der Laufzeit: scharf erst, wenn es
  // jemand bewusst setzt (OPS-001), wie bei der Prüfung am Inhalt.
  serviceKey: Deno.env.get('ELECTRICITY_DISTANCE_SERVICE_KEY') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
};

const instance = missingSetup(setup).length === 0 ? createInstance(setup) : null;

const { adapter } = richteEin({
  LOCATION_PROVIDER: Deno.env.get('LOCATION_PROVIDER'),
  PTV_API_KEY: Deno.env.get('PTV_API_KEY'),
  LOCATION_DATA_GATE: Deno.env.get('LOCATION_DATA_GATE'),
  // ADR-019 Punkt 36: fehlt es, gilt die Produktion.
  APP_ENVIRONMENT: Deno.env.get('APP_ENVIRONMENT'),
});

Deno.serve(createHandler({ instance, adapter }));

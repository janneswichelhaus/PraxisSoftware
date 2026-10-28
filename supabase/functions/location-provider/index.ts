/**
 * Einziger Einstieg mit Laufzeit: liest die Secrets und reicht an `handler.ts` weiter. Nur mit
 * synthetischen Koordinaten (ADR-015 Punkt 20, ADR-019 Punkt 15); lokal nur für einen Lauf
 * eingeschaltet (`docs/DEVELOPMENT.md`, „Edge Functions lokal“).
 */

import { richteEin } from './auswahl.ts';
import { erstelleHandler } from './handler.ts';
import { erstelleSitzungspruefung } from './sitzung.ts';
import type { Protokolleintrag } from './typen.ts';

const { adapter, kartenFreigegeben, gateAbgewiesen } = richteEin({
  LOCATION_PROVIDER: Deno.env.get('LOCATION_PROVIDER'),
  PTV_API_KEY: Deno.env.get('PTV_API_KEY'),
  LOCATION_DATA_GATE: Deno.env.get('LOCATION_DATA_GATE'),
  // ADR-019 Punkt 36: fehlt es, gilt die Produktion.
  APP_ENVIRONMENT: Deno.env.get('APP_ENVIRONMENT'),
});

const pruefeSitzung = erstelleSitzungspruefung({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
});

/**
 * Geschrieben wird nur, was schiefging.
 *
 * Der Eintrag trägt Anbieterkennung, Fehlerklasse und Dauer — keine
 * Koordinate, keine Adresse, kein Stück Antwort (ADR-011, ADR-019 Punkt 18);
 * der Typ `Protokolleintrag` hat für nichts davon ein Feld. Ein geglückter
 * Aufruf hinterlässt nichts: Ein Log je Routenabruf wäre ein Verlauf darüber,
 * wer wann wohin plant, und genau den soll es nicht geben (§20).
 */
function protokolliere(eintrag: Protokolleintrag): void {
  if (eintrag.code === 'ok') return;
  console.error(
    `location-provider: ${eintrag.anbieter} ${eintrag.code} nach ${eintrag.dauerMs} ms`,
  );
}

Deno.serve(
  erstelleHandler({ adapter, kartenFreigegeben, gateAbgewiesen, pruefeSitzung, protokolliere }),
);

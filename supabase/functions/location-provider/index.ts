/**
 * Der Einstiegspunkt der Edge Function `location-provider` (MAP-003a).
 *
 * Diese Datei ist bewusst die einzige, die die Laufzeit kennt: Sie liest die
 * Secrets, baut die Abhängigkeiten zusammen und reicht jede Anfrage an
 * `handler.ts` weiter. Alles Prüfbare liegt daneben — deshalb kostet die
 * fehlende Deno-Laufzeit in der Cloud-Umgebung keine Testabdeckung außer für
 * diese fünfzehn Zeilen Verdrahtung.
 *
 * **Vorbehalt.** Supabase Edge Functions sind nach ADR-015 Punkt 20 nicht für
 * produktive Gesundheitsdaten freigegeben; ADR-019 Punkt 15 lässt sie für
 * diesen Datenweg ausdrücklich nur mit **synthetischen Koordinaten** laufen,
 * bis die Prüfung der Edge Runtime in OPS-001 vorliegt. Deshalb steht im
 * versionierten `supabase/config.toml` weiterhin `[edge_runtime] enabled =
 * false`: Wer den Prototyp lokal fahren will, schaltet sie für den Lauf
 * bewusst ein (`docs/sichtung/kartendienst.md`).
 */

import { waehleAdapter } from './auswahl.ts';
import { erstelleHandler } from './handler.ts';
import { erstelleSitzungspruefung } from './sitzung.ts';
import type { Protokolleintrag } from './typen.ts';

const adapter = waehleAdapter({
  LOCATION_PROVIDER: Deno.env.get('LOCATION_PROVIDER'),
  PTV_API_KEY: Deno.env.get('PTV_API_KEY'),
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

Deno.serve(erstelleHandler({ adapter, pruefeSitzung, protokolliere }));

/**
 * Der Einstiegspunkt des AI Gateways (KI-EPIC-001, ADR-005, BEF-153).
 *
 * Diese Datei ist die einzige, die die Laufzeit kennt: Sie liest die
 * Secrets, baut die Abhängigkeiten zusammen und reicht jede Anfrage an
 * `handler.ts` weiter - wie beim Kartendienst.
 *
 * **Vorbehalt.** Supabase Edge Functions sind nach ADR-015 Punkt 20 nicht für
 * produktive Gesundheitsdaten freigegeben; im versionierten
 * `supabase/config.toml` bleibt `[edge_runtime] enabled = false`. Bis zur
 * Anbieterentscheidung (OPEN_DECISIONS C6, E13) gibt es nur die Nachbildung,
 * und die läuft nur außerhalb der Produktion (`auswahl.ts`).
 */

import { richteEin } from './auswahl.ts';
import { erstelleBerechtigungspruefung } from './berechtigung.ts';
import { erstelleHandler } from './handler.ts';
import { erstelleSitzungspruefung } from './sitzung.ts';
import type { Protokolleintrag } from './typen.ts';

const { adapter, gateAbgewiesen } = richteEin({
  AI_PROVIDER: Deno.env.get('AI_PROVIDER'),
  // Fehlt es, gilt die Produktion - und dort antwortet die Nachbildung nicht.
  APP_ENVIRONMENT: Deno.env.get('APP_ENVIRONMENT'),
});

const eigeneInstanz = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
};

/**
 * Noch kein eigener Logausgang. Der Handler meldet jeden Fehler als
 * `Protokolleintrag` - Zweck, Anbieterkennung, Klasse, Dauer, kein Inhalt
 * (ADR-011) -, und `handler.test.ts` hält das fest. Ein dritter erklärter
 * Ausgang für Betriebslogs neben `src/lib/protokoll.ts` und dem Kartendienst
 * ist nach ADR-011 Punkt 6 eine Entscheidung (`src/protokollierung.test.ts`,
 * `eslint.config.js`) und keine Zeile; sie fällt mit der Anbieterentscheidung,
 * wie bei `patient-file-verify`. Bis dahin bleibt `protokolliere` die eine
 * Stelle dafür.
 */
function protokolliere(_eintrag: Protokolleintrag): void {}

Deno.serve(
  erstelleHandler({
    adapter,
    gateAbgewiesen,
    pruefeSitzung: erstelleSitzungspruefung(eigeneInstanz),
    pruefeBerechtigung: erstelleBerechtigungspruefung(eigeneInstanz),
    protokolliere,
  }),
);

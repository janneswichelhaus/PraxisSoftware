/**
 * Die Sitzungsprüfung des Gateways - dieselbe wie beim Kartendienst.
 *
 * Geprüft wird beim eigenen Anmeldedienst (`/auth/v1/user`) mit dem Token der
 * Person; drei Ergebnisse (`gueltig`, `abgelehnt`, `nicht_pruefbar`), durch
 * kommt nur `gueltig` (BEF-027). Die Regel steht genau einmal, in
 * `location-provider/sitzung.ts`, und ist dort getestet: Zwei Kopien einer
 * Sicherheitsprüfung liefen auseinander, ohne dass es jemand merkt. Supabase
 * bündelt den relativen Import mit (wie einen Ordner `_shared`).
 *
 * Die Plattformprüfung (`verify_jwt` in `supabase/config.toml`) bleibt
 * zusätzlich stehen, und die Rolle prüft danach die Datenbank
 * (`berechtigung.ts`): drei Riegel, nicht einer statt des anderen.
 */

export {
  erstelleSitzungspruefung,
  type Sitzungsergebnis,
  type Sitzungspruefung,
} from '../location-provider/sitzung.ts';

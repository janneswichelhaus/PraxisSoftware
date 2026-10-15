/**
 * Der Hinweis nach § 19 UStG für Rechnungen **vor** `schema_version` 6
 * (BEF-165). Neue Rechnungen tragen ihn im Dokument; die eine Stelle für den
 * Wortlaut ist `app.small_business_notice()` (ANN-541). Dieser Text ist nur
 * der Rückfall für ältere Snapshots und muss mit dem der Datenbank
 * übereinstimmen - `supabase/tests/invoices.test.ts` hält beide gleich.
 *
 * Eine eigene Datei ohne Abhängigkeiten, damit der Datenbanktest sie lesen
 * kann.
 */
export const KLEINUNTERNEHMER_HINWEIS =
  'Steuerbefreiung für Kleinunternehmer gemäß § 19 Abs. 1 UStG – es wird keine Umsatzsteuer berechnet.';

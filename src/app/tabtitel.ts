/**
 * Der Titel des Browser-Tabs je Route (BEF-050, Option 1; Handoff Rahmen vom
 * 2026-10-05, RAH-008).
 *
 * Bis dahin hieß jeder Tab „Own Motion": Wer Kalender und drei Akten
 * nebeneinander offen hatte, sah vier gleiche Tabs, und Vorlesesoftware sagte
 * nach einem Seitenwechsel denselben Titel an. Jetzt trägt jede Route einen
 * **festen** Titel aus dieser Tabelle, Trenner Gedankenstrich, Marke hinten -
 * so, wie Tabs sortiert und gelesen werden.
 *
 * **Nie aus dem Seitentitel abgeleitet, nie mit Daten.** Ein Tab-Titel landet
 * im Verlauf des Browsers, in Fensterlisten, in Bildschirmfotos und bei
 * Erweiterungen; ein Name oder klinischer Inhalt hat dort nichts zu suchen
 * (ADR-011, ADR-013 Punkt 9). Die Akte heißt deshalb „Akte", nicht wie die
 * Person. `tabtitel.test.ts` hält fest, dass jeder Titel aus der festen Menge
 * kommt und kein Teil des Pfads durchschlägt.
 *
 * Die Reihenfolge der Regeln: speziell vor allgemein, damit die Dokumentation
 * unter `/termine/:id/…` nicht als „Termin" läuft und die Rechnung nicht als
 * „Abrechnung".
 */

export const MARKE = 'Own Motion';

/** Anmeldemaske und Vollseiten außerhalb des Rahmens. */
export const ANMELDEN_TITEL = `Anmelden – ${MARKE}`;

/** Die festen Namen, aus denen ein Titel bestehen darf. */
export const TAB_NAMEN = [
  'Übersicht',
  'Kalender',
  'Patient:innen',
  'Akte',
  'Termin',
  'Dokumentation',
  'Warteliste',
  'Verordner:innen',
  'Abrechnung',
  'Rechnung',
  'Statistiken',
  'Organisatorisches',
  'Kommunikation',
  'Training',
  'Mein Konto',
  'Alle Bereiche',
  'Vorschau-Protokoll',
  'Anmelden',
] as const;

export type TabName = (typeof TAB_NAMEN)[number];

const REGELN: readonly [RegExp, TabName][] = [
  [/^\/$/, 'Übersicht'],
  // Die offenen Punkte gehören zur Frage der Übersicht (PRX-EPIC-003).
  [/^\/offen(\/|$)/, 'Übersicht'],
  // Die Tour ist eine Ansicht des Kalenders (BEF-044).
  [/^\/(kalender|touren)(\/|$)/, 'Kalender'],
  [/^\/patienten$/, 'Patient:innen'],
  [/^\/patienten\//, 'Akte'],
  [/^\/verordner(\/|$)/, 'Verordner:innen'],
  [/^\/termine\/[^/]+\/(dokumentation|abschluss)(\/|$)/, 'Dokumentation'],
  [/^\/termine(\/|$)/, 'Termin'],
  [/^\/warteliste(\/|$)/, 'Warteliste'],
  // Rechnung, Blatt, Storno und Erinnerung: ein Dokument, nicht die Liste.
  [/^\/abrechnung\/(rechnungen|erinnerungen)\//, 'Rechnung'],
  [/^\/abrechnung(\/|$)/, 'Abrechnung'],
  [/^\/statistiken(\/|$)/, 'Statistiken'],
  [/^\/(praxis|betrieb)(\/|$)/, 'Organisatorisches'],
  [/^\/team$/, 'Kommunikation'],
  [/^\/training(\/|$)/, 'Training'],
  [/^\/mein-konto$/, 'Mein Konto'],
  [/^\/bereiche$/, 'Alle Bereiche'],
  [/^\/vorschau\/protokoll$/, 'Vorschau-Protokoll'],
];

/** Der feste Name zu einem Pfad - oder `undefined`, wo keine Regel greift. */
export function tabName(pathname: string): TabName | undefined {
  return REGELN.find(([muster]) => muster.test(pathname))?.[1];
}

/**
 * Der ganze Titel: „Kalender – Own Motion". Wo keine Regel greift - die
 * Plattformoberfläche unter `/p`, ein unbekannter Pfad vor der Weiterleitung -,
 * bleibt es bei der Marke allein.
 */
export function tabTitel(pathname: string): string {
  const name = tabName(pathname);
  return name ? `${name} – ${MARKE}` : MARKE;
}

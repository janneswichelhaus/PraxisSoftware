/**
 * Der Titel des Browser-Tabs je Route (BEF-050, Option 1; Handoff Rahmen vom
 * 2026-10-05, RAH-008; ANN-245).
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

/** Die Einladung zur Plattform (DR-115): Wer sie öffnet, meldet sich noch nicht an. */
export const EINLADUNG_TITEL = `Einladung – ${MARKE}`;

/** Die Sperre der Plattform (Handoff 2026-10-22, Abschnitt 5.4); die Praxis bleibt bei „Anmelden“. */
export const GESPERRT_TITEL = `Gesperrt – ${MARKE}`;

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
  'Organisation',
  'Nachrichten',
  'Training',
  'Mein Konto',
  'Alle Bereiche',
  'Vorschau-Protokoll',
  'Anmelden',
  // Die Plattform der Patient:innen (DR-115), mit den Wörtern ihrer Seiten.
  'Einladung',
  'Gesperrt',
  'Termine',
  'Übungen',
  'Check-in',
  'Meine Angaben',
  'Fragebogen',
  'Gewohnheiten',
  'Ernährung',
  'Rechnungen',
  'Dokumente',
  'Einwilligungen',
  'Meine Daten',
  'Nachsorge-Abo',
  'Angebot',
  'Trainingsvertrag',
  'Trainingspaket',
  'Einstellungen',
  'Ich',
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
  [/^\/(praxis|betrieb|uebungen)(\/|$)/, 'Organisation'],
  [/^\/(team|rueckfragen|fuer-dich)(\/|$)/, 'Nachrichten'],
  [/^\/training(\/|$)/, 'Training'],
  [/^\/mein-konto$/, 'Mein Konto'],
  [/^\/bereiche$/, 'Alle Bereiche'],
  [/^\/vorschau\/protokoll$/, 'Vorschau-Protokoll'],
  // Die Plattform unter `/p` (DR-115): Bis dahin hieß dort jeder Tab nur
  // „Own Motion“. Der Reiter „Training“ steht in `PlattformApp`, weil der
  // Pfad derselbe ist wie für „Übungen“.
  [/^\/p\/?$/, 'Übersicht'],
  [/^\/p\/termine(\/|$)/, 'Termine'],
  [/^\/p\/nachrichten(\/|$)/, 'Nachrichten'],
  [/^\/p\/uebungen(\/|$)/, 'Übungen'],
  [/^\/p\/checkin$/, 'Check-in'],
  [/^\/p\/angaben$/, 'Meine Angaben'],
  // „Befundbogen“ ist ein Wort der Praxis; die Person füllt einen Fragebogen aus.
  [/^\/p\/befundbogen$/, 'Fragebogen'],
  [/^\/p\/gewohnheiten$/, 'Gewohnheiten'],
  [/^\/p\/ernaehrung(\/|$)/, 'Ernährung'],
  [/^\/p\/rechnungen\//, 'Rechnung'],
  [/^\/p\/rechnungen$/, 'Rechnungen'],
  [/^\/p\/dokumente$/, 'Dokumente'],
  [/^\/p\/einwilligungen$/, 'Einwilligungen'],
  [/^\/p\/daten$/, 'Meine Daten'],
  [/^\/p\/abo$/, 'Nachsorge-Abo'],
  [/^\/p\/angebot$/, 'Angebot'],
  [/^\/p\/vertrag$/, 'Trainingsvertrag'],
  [/^\/p\/paket$/, 'Trainingspaket'],
  [/^\/p\/einstellungen$/, 'Einstellungen'],
  [/^\/p\/ich$/, 'Ich'],
];

/** Der feste Name zu einem Pfad - oder `undefined`, wo keine Regel greift. */
export function tabName(pathname: string): TabName | undefined {
  return REGELN.find(([muster]) => muster.test(pathname))?.[1];
}

/**
 * Der ganze Titel: „Kalender – Own Motion". Wo keine Regel greift - ein
 * unbekannter Pfad vor der Weiterleitung -, bleibt es bei der Marke allein.
 */
export function tabTitel(pathname: string): string {
  const name = tabName(pathname);
  return name ? `${name} – ${MARKE}` : MARKE;
}

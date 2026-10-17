/**
 * Die Fragen des Barometers (ORG-006, ANN-607): drei Skalen von 1 bis 9 und
 * zwei Freitexte, in der Anrede „du“ - anders als die übrige Anwendung, weil
 * die Praxis sich im Team duzt. Jede Frage ist freiwillig, nichts ist
 * vorbelegt (§20.2 Nr. 1, 2).
 */

export type SkalenFrage = 'mood' | 'tours' | 'team';
export type TextFrage = 'easier' | 'more';

export const SKALEN: readonly {
  schluessel: SkalenFrage;
  frage: string;
  /** Kurzform für Zusammenfassung und Auswertung. */
  kurz: string;
  links: string;
  rechts: string;
}[] = [
  {
    schluessel: 'mood',
    frage: 'Wie geht es dir diesen Monat insgesamt?',
    kurz: 'Insgesamt',
    links: 'mies',
    rechts: 'richtig gut',
  },
  {
    schluessel: 'tours',
    frage: 'Wie gut passen Touren und Fahrzeiten für dich?',
    kurz: 'Touren und Fahrzeiten',
    links: 'passt gar nicht',
    rechts: 'passt bestens',
  },
  {
    schluessel: 'team',
    frage: 'Wie erlebst du das Miteinander im Team?',
    kurz: 'Miteinander im Team',
    links: 'angespannt',
    rechts: 'sehr gut',
  },
];

export const TEXTE: readonly { schluessel: TextFrage; frage: string; kurz: string }[] = [
  {
    schluessel: 'easier',
    frage: 'Was würde dir die Arbeit leichter machen?',
    kurz: 'Was die Arbeit leichter machen würde',
  },
  {
    schluessel: 'more',
    frage: 'Möchtest du sonst noch etwas loswerden?',
    kurz: 'Sonst noch',
  },
];

/** Höchstlänge je Freitext - dieselbe Grenze wie am Server. */
export const TEXT_MAX = 2000;

/** Wer was sieht - kurz, unter der Wahl mit oder ohne Namen. */
export const WER_SIEHT_WAS =
  'Nur die Praxisleitung sieht deine Antworten. Ohne Namen erscheinen sie nur in einer Summe, sobald genug Antworten da sind.';

const MONAT = new Intl.DateTimeFormat('de-DE', { month: 'long', timeZone: 'UTC' });
const MONAT_JAHR = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** „Oktober“ aus `2026-10-01`. */
export function monatsname(monat: string): string {
  return MONAT.format(new Date(`${monat.slice(0, 7)}-15T12:00:00Z`));
}

/** „Oktober 2026“ aus `2026-10-01`. */
export function monatUndJahr(monat: string): string {
  return MONAT_JAHR.format(new Date(`${monat.slice(0, 7)}-15T12:00:00Z`));
}

/** „August bis Oktober 2026“, „Oktober 2026“, „Dezember 2025 bis Januar 2026“. */
export function zeitraum(von: string, bis: string): string {
  if (von.slice(0, 7) === bis.slice(0, 7)) return monatUndJahr(von);
  return von.slice(0, 4) === bis.slice(0, 4)
    ? `${monatsname(von)} bis ${monatUndJahr(bis)}`
    : `${monatUndJahr(von)} bis ${monatUndJahr(bis)}`;
}

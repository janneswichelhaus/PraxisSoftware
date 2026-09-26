/**
 * Die Begriffe der Praxis — eine Quelle für die Oberfläche (UX-EPIC-002).
 *
 * Beschriftungen folgen der Sprache der Praxis, nicht dem Datenmodell
 * (`docs/PRODUCT_VISION.md`, Bedienprinzipien). Hier steht, wie die Dinge
 * heißen, die an mehr als einer Stelle genannt werden — Arbeitsbereiche,
 * Vorgänge, die Menü, Suche und Kalender zugleich anbieten, und die
 * Personen, um die es geht. Wer eine Bezeichnung ändert, ändert sie hier.
 *
 * Darunter stehen die **abgelösten** Wörter. `begriffe.test.ts` hält sie aus
 * jedem Oberflächentext unter `src/` heraus: „gleiche Sache, gleiches Wort"
 * (Oberflächen-Checkliste Punkt 9, `docs/sichtung/README.md`). Kennungen,
 * Routen und Datenbankwerte sind keine Beschriftung und bleiben, wie sie sind
 * (`/termine/ereignis`, `kind = 'internal'`).
 *
 * Welche Wörter abgelöst sind, trägt ANN-111.
 */

/** Die sechs Arbeitsbereiche; die Kennung ist fachlich und keine Beschriftung. */
export const BEREICHE = {
  heute: {
    label: 'Übersicht',
    kurz: 'Übersicht',
    leitfrage: 'Was muss ich als Nächstes tun?',
  },
  termine: {
    label: 'Kalender',
    kurz: 'Kalender',
    leitfrage: 'Wer behandelt wen, wann und mit welchen Wegen?',
  },
  patienten: {
    label: 'Patient:innen',
    kurz: 'Patienten',
    leitfrage: 'Was gehört zur Versorgung dieser Person?',
  },
  team: {
    label: 'Kommunikation',
    kurz: 'Nachrichten',
    leitfrage: 'Mit wem muss ich etwas klären?',
  },
  betrieb: {
    label: 'Organisatorisches',
    kurz: 'Organisation',
    leitfrage: 'Welche Voraussetzungen und Anträge sind zu bearbeiten?',
  },
  abrechnung: {
    label: 'Abrechnung',
    kurz: 'Abrechnung',
    leitfrage: 'Welche Leistungen sind abzurechnen oder zu bezahlen?',
  },
} as const satisfies Record<string, { label: string; kurz: string; leitfrage: string }>;

export type BereichsKennung = keyof typeof BEREICHE;

/** Wörter, die an mehreren Stellen dieselbe Sache benennen. */
export const BEGRIFFE = {
  patientIn: 'Patient:in',
  patientInnen: 'Patient:innen',
  verordnerIn: 'Verordner:in',
  verordnerInnen: 'Verordner:innen',
  /** Eine Person des Teams. */
  mitarbeiterIn: 'Mitarbeiter:in',
  /** Das Team als Liste — so heißt der Menüpunkt. */
  mitarbeitende: 'Mitarbeitende',
  termin: 'Termin',
  dauertermin: 'Dauertermin',
  /** Kalendereintrag ohne Patient:in: Meeting, Puffer, Pause (CAL-021). */
  fehlzeit: 'Fehlzeit',
  dauerfehlzeit: 'Dauerfehlzeit',
  arbeitszeiten: 'Arbeitszeiten',
  kennwort: 'Kennwort',
} as const;

export interface AbgeloesterBegriff {
  /** Das Wort, wie es nicht mehr in der Oberfläche stehen soll. */
  muster: RegExp;
  /** Was stattdessen dasteht. */
  statt: string;
  /** Woher die Ablösung kommt. */
  quelle: string;
  /**
   * Nur unter diesen Pfadanfängen verboten. Fehlt die Angabe, gilt das
   * Verbot für jeden Oberflächentext.
   */
  nurIn?: readonly string[];
}

export const ABGELOESTE_BEGRIFFE: readonly AbgeloesterBegriff[] = [
  {
    muster: /\bMein Tag\b/,
    statt: BEREICHE.heute.label,
    quelle: 'Beschriftungen von Jannes, 2026-09-12',
  },
  {
    muster: /Touren (&|&amp;|und) Termine/,
    statt: BEREICHE.termine.label,
    quelle: 'Beschriftungen von Jannes, 2026-09-12',
  },
  {
    muster: /Passwort/,
    statt: BEGRIFFE.kennwort,
    quelle: 'Bestand (STAFF-004, Mein Konto); ANN-111',
  },
  {
    muster: /Mitarbeitende:[nr]\b/,
    statt: BEGRIFFE.mitarbeiterIn,
    quelle: 'ANN-111: Einzahl wie Patient:in, Mehrzahl „Mitarbeitende" wie im Menü',
  },
  {
    // Im Kalender heißt der Eintrag ohne Patient:in „Fehlzeit" — so steht er
    // in der Anlegen-Leiste (BEF-035) und in der Suche. Im Auditlog und im
    // Verlauf der Messwerte ist „Ereignis" ein anderes Ding und bleibt.
    muster: /\bEreignis(se|ses)?\b/,
    statt: BEGRIFFE.fehlzeit,
    quelle: 'Anlegen-Leiste nach Jannes (BEF-035); ANN-111',
    nurIn: ['src/features/appointments/', 'src/features/today/', 'src/features/tours/'],
  },
];

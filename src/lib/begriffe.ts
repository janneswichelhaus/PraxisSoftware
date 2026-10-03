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

/**
 * Die Arbeitsbereiche; die Kennung ist fachlich und keine Beschriftung. Sechs
 * für alle Praxisrollen, dazu seit STA-EPIC-001 die Statistiken allein für owner.
 */
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
  training: {
    label: 'Training',
    kurz: 'Training',
    leitfrage: 'Wen betreue ich im Personal Training, und wie steht der Vertrag?',
  },
  statistik: {
    label: 'Statistiken',
    kurz: 'Statistiken',
    leitfrage: 'Wo steht die Praxis, und was ist als Nächstes zu steuern?',
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
  /** Kalendereintrag ohne Patient:in (CAL-021); Beispiele in `fehlzeitBeispiele`. */
  fehlzeit: 'Fehlzeit',
  /**
   * Wofür eine Fehlzeit steht - in der Anlegen-Leiste und auf beiden
   * Formularen dieselbe Reihe (KAL-27).
   */
  fehlzeitBeispiele: 'Meeting, Puffer, Pause',
  dauerfehlzeit: 'Dauerfehlzeit',
  /**
   * Das Honorar für einen abgesagten oder nicht wahrgenommenen Termin
   * (ADR-018, TER-10) - am Termin, in Katalog, Leistungen und Rechnung
   * dasselbe Wort.
   */
  ausfallhonorar: 'Ausfallhonorar',
  arbeitszeiten: 'Arbeitszeiten',
  kennwort: 'Kennwort',
  /** Person im Personal Training (TRN-EPIC-001) - nie „Kunde" allein, nie „PT" (ADR-021 Punkt 9). */
  trainingskundIn: 'Trainingskund:in',
  trainingskundInnen: 'Trainingskund:innen',
  /** Wer wann was getan hat (ADR-010) - Menü, Seitentitel und Aufbewahrung (BEF-080). */
  protokoll: 'Protokoll',
  /**
   * Das eine Blatt der Aufnahme: Kontaktdaten, Datenschutzinformation und
   * Behandlungsvertrag (AKTE-007, ANN-224). Nicht der Anamnesebogen - der ist
   * klinisch und steht in der Doku.
   */
  anmeldebogen: 'Anmeldebogen',
} as const;

/**
 * `Par. 630f Abs. 3 BGB` wird `§ 630f Abs. 3 BGB`.
 *
 * Die SQL-Dateien des Projekts bleiben frei von Umlauten und Sonderzeichen
 * (Migration `20260911150000_retention_schedule.sql`), deshalb steht die
 * Fundstelle in der Datenbank als `Par.`. In einem Brief an eine Patientin
 * steht das Zeichen — und auf jeder Seite der Anwendung (BEF-033).
 */
export function paragraf(fundstelle: string | null): string {
  if (!fundstelle) return '';
  return fundstelle.replace(/\bPar\.\s*/g, '§ ');
}

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
    muster: /\bAuditlogs?\b/,
    statt: BEGRIFFE.protokoll,
    quelle: 'Sichtung Praxisverwaltung, Jannes 2026-09-29 (BEF-080)',
  },
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
    muster: /\bEreignis(se|sen|ses)?\b/,
    statt: BEGRIFFE.fehlzeit,
    quelle: 'Anlegen-Leiste nach Jannes (BEF-035); ANN-111',
    nurIn: [
      'src/features/appointments/',
      'src/features/today/',
      'src/features/tours/',
      // Die Terminliste an der Person (UX-012) zeigt dieselben Einträge.
      'src/features/staff/',
    ],
  },
  {
    // Datenschutzinformation und Behandlungsvertrag sind Teil des
    // Anmeldebogens, kein eigener Punkt mehr (AKTE-007, ANN-224).
    muster: /Datenschutz und Vertrag/,
    statt: BEGRIFFE.anmeldebogen,
    quelle: 'Akte · Kopf, Reiter und Hinweis, Jannes 2026-10-03 (ANN-224)',
  },
];

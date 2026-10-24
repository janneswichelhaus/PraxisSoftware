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
    label: 'Nachrichten',
    kurz: 'Nachrichten',
    leitfrage: 'Mit wem muss ich etwas klären?',
  },
  betrieb: {
    label: 'Organisation',
    kurz: 'Organisation',
    leitfrage: 'Was ist im Team, an den Rädern und in der Praxis zu tun?',
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
  /**
   * Termine einer Grundlage in festem Rhythmus - in Kalender, Titel, Knopf und
   * Fehlermeldung (BEF-067). „Serie" bleibt das Wort für die Vorkommen
   * („Ganze Serie absagen").
   */
  dauertermin: 'Dauertermin',
  /** Wie lange ein Termin dauert - nie „Länge" oder „Terminfenster" (BEF-067). */
  dauer: 'Dauer',
  /** Ein bestätigter, noch offener Termin - Tageskarte, Terminseite, Akte (BEF-067). */
  stehtAus: 'Steht aus',
  /** Ob eine Person laufend behandelt wird; „abgeschlossen" nur für den Abschluss (BEF-067). */
  inVersorgung: 'in Versorgung',
  nichtInVersorgung: 'nicht in Versorgung',
  /** Die Mail, mit der man sich anmeldet - auch im Betreff (BEF-067). */
  anmeldemail: 'Anmeldemail',
  /** Die Seite mit E-Mail und Kennwort (BEF-067). */
  anmeldeseite: 'Anmeldeseite',
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
  /**
   * Übungsbibliothek (UEB-EPIC-001, IDEA-TRN-005): die Übung und die Form, in
   * der geübt wird. Nie „Workout", nie „Drill" (IDEA-QSN-007).
   */
  uebung: 'Übung',
  uebungen: 'Übungen',
  variante: 'Variante',
  varianten: 'Varianten',
  /** Die zweite Bezeichnung für Patient:innen und Kund:innen (IDEA-QSN-002). */
  alltagssprache: 'Alltagssprache',
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

/** Die Seiten der Patient:innen unter `/p` (DSN-001). */
const PLATTFORM = ['src/features/platform/'] as const;

/**
 * Die Türen der Plattform: Einladung, Einrichtung nach der Einladung und die
 * Sperre in ihrer Plattform-Fassung (Handoff 2026-10-22, Abschnitt 5.2). Die
 * Anmeldung und die Sperre der Praxis teilen sich Beschäftigte und
 * Patient:innen; sie stehen nicht in dieser Liste.
 */
const TUEREN = [
  'src/features/platform/EinladungPage.tsx',
  'src/features/auth/einrichtung/AnmeldungEinrichten.tsx',
  'src/features/auth/sitzungssperre/PlattformSperrseite.tsx',
] as const;

/**
 * Sätze, die Praxis und Plattform teilen und die auf den Türen erscheinen:
 * Fehler des Passkeys und der PIN, die Prüfung der Einrichtung. Sie sagen
 * weder „Konto“ noch „Sitzung“ (Design-Review 1c).
 */
const GETEILTE_TUERSAETZE = [
  'src/features/auth/passkey.ts',
  'src/features/auth/appPin.ts',
  'src/features/auth/einrichtung/PinFestlegen.tsx',
  'src/features/auth/einrichtung/Einrichtungspflicht.tsx',
] as const;

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
  // UX-009c, BEF-067 (Entscheidung Jannes 2026-10-09, Spalte „Vorschlag"):
  {
    muster: /\bTerminserien?\b/,
    statt: BEGRIFFE.dauertermin,
    quelle: 'BEF-067, Jannes 2026-10-09; ANN-111',
  },
  {
    muster: /\b(Terminfenstern?|Längen?|Terminlängen?)\b/,
    statt: BEGRIFFE.dauer,
    quelle: 'BEF-067, Jannes 2026-10-09; ANN-111',
    // „Länge" meint anderswo anderes (Textbausteine, Wegstrecken).
    nurIn: ['src/features/appointments/', 'src/features/training/', 'src/features/today/'],
  },
  {
    // Titel der Anlegeseiten sind Verben wie überall; die Anlegen-Leiste
    // behält ihre Nomen („Neuer Termin", BEF-035).
    muster: /\bNeue:r\b/,
    statt: '‹…› anlegen',
    quelle: 'BEF-067, Jannes 2026-10-09; ANN-111',
  },
  {
    muster: /\b(Zugangsmail|Anmeldemaske)\b/,
    statt: `${BEGRIFFE.anmeldemail} bzw. ${BEGRIFFE.anmeldeseite}`,
    quelle: 'BEF-067, Jannes 2026-10-09; ANN-111',
  },
  {
    muster: /\b([Ii]naktiv|Aktiv)\b|laufender Versorgung/,
    statt: `${BEGRIFFE.inVersorgung} / ${BEGRIFFE.nichtInVersorgung}`,
    quelle: 'BEF-067, Jannes 2026-10-09; ANN-111',
    nurIn: ['src/features/patients/', 'src/app/Funktionssuche.tsx'],
  },
  // Die Plattform der Patient:innen spricht nicht die Sprache der Technik und
  // nicht die der Praxis (Handoff 2026-10-22, Abschnitt 1; ANN-111). Ihre
  // Türen - Einladung, Einrichtung, Sperre - sagen „Zugang“ (Abschnitt 0).
  {
    muster: /\bSitzung(en)?\b/,
    statt: 'Zugang bzw. Anmeldung',
    quelle: 'Handoff 2026-10-22, Abschnitte 0 und 1; DR-106',
    nurIn: [...PLATTFORM, ...TUEREN, ...GETEILTE_TUERSAETZE],
  },
  {
    muster: /\bKont(o|os|en)\b/,
    statt: 'Zugang',
    quelle: 'Handoff 2026-10-22, Abschnitt 0 („Türen sprechen von Zugang“)',
    nurIn: [...TUEREN, ...GETEILTE_TUERSAETZE],
  },
  {
    // „Kein Kennwort“ und „Ein Kennwort brauchen Sie nicht“ sagen, dass es
    // keins gibt - das darf stehen.
    muster: /(?<![Kk]ein(en)? )\bKennw(o|ö)rt(e|er)?\b(?!-| brauchen Sie nicht)/,
    statt: 'Passkey bzw. PIN',
    quelle: 'Handoff 2026-10-22, Abschnitt 1',
    nurIn: [...PLATTFORM, ...TUEREN],
  },
  {
    muster: /\bMein(em)? Konto\b/,
    statt: '„Ich“',
    quelle: 'Handoff 2026-10-22, Abschnitt 1; DR-105',
    nurIn: PLATTFORM,
  },
  {
    muster: /\b(Projektion(en)?|Instrument(e|en)?)\b/,
    statt: 'Ihre Angaben bzw. Fragebogen',
    quelle: 'Handoff 2026-10-22, Abschnitt 1',
    nurIn: PLATTFORM,
  },
  {
    muster: /\b(Workouts?|Drills?|Kunden?|PT)\b/,
    statt: 'Training, Übung bzw. Sie',
    quelle: 'Handoff 2026-10-22, Abschnitt 1',
    nurIn: PLATTFORM,
  },
];

/**
 * Der Katalog der Benachrichtigungen (KOM-009, ADR-024 Punkte 13 und 14).
 *
 * Geschlossen und an einer Stelle: Jede Art hat einen festen Text, die
 * erlaubten Wege und die Angabe, ob die Ruhezeit gilt. Die Schlüssel stehen
 * genauso in `app.notification_kinds()`; `benachrichtigungen.test.ts` unter
 * `supabase/tests/` hält beide Listen gleich. Gelesen wird der Katalog von
 * der Oberfläche (Einstellungen), vom Versand (`supabase/functions/
 * notifications`) und vom Service Worker, der den Text einer Push-Nachricht
 * selbst setzt.
 *
 * Ein Text nennt die Art und höchstens Datum und Uhrzeit — nie den
 * Leistungsbereich, keine behandelnde Person, keinen Ort, keine Übung, keinen
 * Inhalt einer Nachricht, keinen Betrag (Punkt 14). Keine Werbung. Eine neue
 * Art ist eine Änderung dieses Katalogs und der Datenbank mit Review.
 */
export const BENACHRICHTIGUNGEN = {
  appointment_reminder: {
    name: 'Erinnerung an einen Termin',
    hinweis: 'Am Vortag ab 17 Uhr, für Montag am Freitag.',
    titel: 'Terminerinnerung',
    text: 'Erinnerung: Ihr Termin am {datum} um {uhrzeit}.',
    zeitangabe: true,
    ruhezeit: true,
    wege: ['email', 'push'],
  },
  appointment_changed: {
    name: 'Termin von der Praxis verschoben',
    hinweis: 'Wenn die Praxis einen Termin auf eine andere Zeit legt.',
    titel: 'Termin verschoben',
    text: 'Ihr Termin wurde verschoben. Neu: am {datum} um {uhrzeit}.',
    zeitangabe: true,
    ruhezeit: true,
    wege: ['email', 'push'],
  },
  appointment_cancelled: {
    name: 'Termin von der Praxis abgesagt',
    hinweis: 'Wenn die Praxis einen Termin absagt.',
    titel: 'Termin abgesagt',
    text: 'Ihr Termin am {datum} um {uhrzeit} wurde abgesagt.',
    zeitangabe: true,
    ruhezeit: true,
    wege: ['email', 'push'],
  },
  message_answered: {
    name: 'Antwort auf eine Rückfrage',
    hinweis: 'Wenn die Praxis auf Ihre Rückfrage geantwortet hat.',
    titel: 'Antwort da',
    text: 'Auf Ihre Rückfrage ist eine Antwort da.',
    zeitangabe: false,
    ruhezeit: true,
    wege: ['email', 'push'],
  },
  request_answered: {
    name: 'Terminwunsch beantwortet',
    hinweis: 'Wenn die Praxis auf Ihren Terminwunsch geantwortet hat.',
    titel: 'Terminwunsch beantwortet',
    text: 'Die Praxis hat auf Ihren Terminwunsch geantwortet.',
    zeitangabe: false,
    ruhezeit: true,
    wege: ['email', 'push'],
  },
  plan_assigned: {
    name: 'Neuer Übungsplan',
    hinweis: 'Wenn die Praxis Ihnen einen Plan zuweist.',
    titel: 'Neuer Übungsplan',
    text: 'Für Sie liegt ein neuer Übungsplan bereit.',
    zeitangabe: false,
    ruhezeit: true,
    wege: ['email', 'push'],
  },
  // ERN-009 (ADR-027 Punkt 12): fester Text ohne Ernährungsbezug; die
  // Uhrzeiten wählt die Person im Tagebuch.
  nutrition_diary_reminder: {
    name: 'Erinnerung an Ihr Tagebuch',
    hinweis: 'Zu den Uhrzeiten, die Sie im Ernährungstagebuch wählen.',
    titel: 'Erinnerung',
    text: 'Erinnerung: Ihr Eintrag für heute.',
    zeitangabe: false,
    ruhezeit: true,
    wege: ['email', 'push'],
  },
} as const satisfies Record<
  string,
  {
    name: string;
    hinweis: string;
    titel: string;
    text: string;
    zeitangabe: boolean;
    ruhezeit: boolean;
    wege: readonly ('email' | 'push')[];
  }
>;

export type Benachrichtigungsart = keyof typeof BENACHRICHTIGUNGEN;
export type Benachrichtigungsweg = 'email' | 'push';

export const BENACHRICHTIGUNGSARTEN = Object.keys(BENACHRICHTIGUNGEN) as Benachrichtigungsart[];

export function istBenachrichtigungsart(wert: unknown): wert is Benachrichtigungsart {
  return typeof wert === 'string' && Object.hasOwn(BENACHRICHTIGUNGEN, wert);
}

/**
 * Der fertige Text einer Benachrichtigung. Datum und Uhrzeit in der Zeitzone
 * der Praxis; eine Art ohne Zeitangabe ignoriert sie. Ohne Zeitpunkt, wo
 * einer gehört, fällt der Text auf den Titel zurück, statt eine Lücke zu
 * zeigen.
 */
export function benachrichtigungstext(
  art: Benachrichtigungsart,
  zeitpunkt: string | null,
  zeitzone = 'Europe/Berlin',
): { titel: string; text: string } {
  const eintrag = BENACHRICHTIGUNGEN[art];
  if (!eintrag.zeitangabe) return { titel: eintrag.titel, text: eintrag.text };
  const wann = zeitpunkt === null ? null : new Date(zeitpunkt);
  if (wann === null || Number.isNaN(wann.getTime())) {
    return { titel: eintrag.titel, text: `${eintrag.titel}.` };
  }
  const datum = wann.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zeitzone,
  });
  const uhrzeit = wann.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zeitzone,
  });
  return {
    titel: eintrag.titel,
    text: eintrag.text.replace('{datum}', datum).replace('{uhrzeit}', uhrzeit),
  };
}

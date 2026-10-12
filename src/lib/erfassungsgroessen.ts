/**
 * Erfassungsgrößen nach Takt (TRK-EPIC-001, IDEA-TRK-001, ANN-348;
 * TRK-EPIC-002: Schmerz differenziert, Bewegungssicherheit, ANN-353, ANN-354).
 *
 * Schlüssel, Takt und Wertebereich legt die Datenbank fest
 * (`app.tracking_parameters()`); hier stehen Frage, Kurzname und die Enden
 * der Skala in Alltagssprache. `supabase/tests/erfassungsgroessen.test.ts`
 * hält beide Seiten deckungsgleich.
 *
 * Erfassen und anzeigen, nie bewerten (ADR-006 Punkt 11): Es gibt hier
 * bewusst keine Schwelle, keine Richtung „gut/schlecht" und keine Farbe.
 * Plattform und Praxis teilen diese Datei wie `begriffe.ts` (ADR-023 Punkt 26).
 */

export type Erfassungstakt = 'session' | 'checkin';

export interface Erfassungsgroesse {
  key: string;
  takt: Erfassungstakt;
  min: number;
  max: number;
  /** Kurzname für Listen und Tabellen. */
  kurz: string;
  /** Die Frage an die Person, in der Anrede „Sie" (DSN-001 D6). */
  frage: string;
  /** Die beiden Enden einer Skala; fehlt bei einer Zahl mit Einheit. */
  enden?: readonly [string, string];
  /** Einheit einer freien Zahl, etwa „Minuten". */
  einheit?: string;
  /**
   * Die Wörter einer Auswahl, in der Reihenfolge der Werte ab `min`
   * (ANN-354). Gespeichert wird die ganze Zahl, angezeigt das Wort.
   */
  optionen?: readonly string[];
  /** Überschrift, unter der die Praxis die Frage beim Einstellen findet. */
  gruppe: 'Schmerz' | 'Bewegung und Alltag' | 'Einheit' | 'Zusammenhang';
  /**
   * `frage` ist eine Größe der Zeitreihe; `kontext` sagt, unter welchen
   * Bedingungen sie entstand, und zählt nicht zu den fünf Fragen (TRK-005,
   * IDEA-TRK-006, ANN-355).
   */
  rolle: 'frage' | 'kontext';
}

export const ERFASSUNGSGROESSEN: readonly Erfassungsgroesse[] = [
  {
    key: 'session_exertion',
    takt: 'session',
    min: 0,
    max: 10,
    kurz: 'Anstrengung',
    frage: 'Wie anstrengend war die Einheit?',
    enden: ['gar nicht', 'maximal'],
    gruppe: 'Einheit',
    rolle: 'frage',
  },
  {
    key: 'session_pain',
    takt: 'session',
    min: 0,
    max: 10,
    kurz: 'Schmerz',
    frage: 'Wie stark waren Schmerzen während der Einheit?',
    enden: ['keine', 'stärkste vorstellbare'],
    gruppe: 'Einheit',
    rolle: 'frage',
  },
  {
    key: 'session_confidence',
    takt: 'session',
    min: 0,
    max: 10,
    kurz: 'Bewegungssicherheit',
    frage: 'Wie sicher haben Sie sich bei den Übungen gefühlt?',
    enden: ['gar nicht sicher', 'völlig sicher'],
    gruppe: 'Einheit',
    rolle: 'frage',
  },
  {
    key: 'pain_rest',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Schmerz in Ruhe',
    frage: 'Wie stark sind Ihre Schmerzen in Ruhe?',
    enden: ['keine', 'stärkste vorstellbare'],
    gruppe: 'Schmerz',
    rolle: 'frage',
  },
  {
    key: 'pain_load',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Schmerz bei Belastung',
    frage: 'Wie stark sind Ihre Schmerzen bei Belastung?',
    enden: ['keine', 'stärkste vorstellbare'],
    gruppe: 'Schmerz',
    rolle: 'frage',
  },
  {
    key: 'pain_after_load',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Schmerz nach Belastung',
    frage: 'Wie stark sind Ihre Schmerzen nach einer Belastung?',
    enden: ['keine', 'stärkste vorstellbare'],
    gruppe: 'Schmerz',
    rolle: 'frage',
  },
  {
    key: 'pain_night',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Schmerz nachts',
    frage: 'Wie stark waren Ihre Schmerzen in der letzten Nacht?',
    enden: ['keine', 'stärkste vorstellbare'],
    gruppe: 'Schmerz',
    rolle: 'frage',
  },
  {
    key: 'pain_morning',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Schmerz morgens',
    frage: 'Wie stark sind Ihre Schmerzen morgens nach dem Aufstehen?',
    enden: ['keine', 'stärkste vorstellbare'],
    gruppe: 'Schmerz',
    rolle: 'frage',
  },
  {
    key: 'pain_recovery_hours',
    takt: 'checkin',
    min: 0,
    max: 72,
    kurz: 'Schmerz wieder wie vorher nach',
    frage:
      'Nach Ihrer letzten Belastung: Wie viele Stunden hat es gedauert, bis die Schmerzen wieder so waren wie vorher?',
    einheit: 'Stunden',
    gruppe: 'Schmerz',
    rolle: 'frage',
  },
  {
    key: 'pain_quality',
    takt: 'checkin',
    min: 1,
    max: 5,
    kurz: 'Schmerzart',
    frage: 'Wie fühlt sich der Schmerz vor allem an?',
    optionen: ['dumpf', 'stechend', 'brennend', 'elektrisierend', 'ziehend'],
    gruppe: 'Schmerz',
    rolle: 'frage',
  },
  {
    key: 'movement_confidence',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Bewegungssicherheit',
    frage: 'Wie sicher fühlen Sie sich, sich im Alltag zu bewegen?',
    enden: ['gar nicht sicher', 'völlig sicher'],
    gruppe: 'Bewegung und Alltag',
    rolle: 'frage',
  },
  {
    key: 'daily_impairment',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Einschränkung im Alltag',
    frage: 'Wie stark schränken Ihre Beschwerden Sie im Alltag ein?',
    enden: ['gar nicht', 'vollständig'],
    gruppe: 'Bewegung und Alltag',
    rolle: 'frage',
  },
  {
    key: 'sleep_quality',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Schlaf',
    frage: 'Wie gut haben Sie zuletzt geschlafen?',
    enden: ['sehr schlecht', 'sehr gut'],
    gruppe: 'Bewegung und Alltag',
    rolle: 'frage',
  },
  {
    key: 'stress',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Stress',
    frage: 'Wie angespannt oder gestresst fühlen Sie sich?',
    enden: ['gar nicht', 'sehr'],
    gruppe: 'Bewegung und Alltag',
    rolle: 'frage',
  },
  {
    key: 'morning_stiffness_minutes',
    takt: 'checkin',
    min: 0,
    max: 240,
    kurz: 'Morgensteifigkeit',
    frage: 'Wie viele Minuten waren Sie heute Morgen steif?',
    einheit: 'Minuten',
    gruppe: 'Bewegung und Alltag',
    rolle: 'frage',
  },
  {
    key: 'painkiller_24h',
    takt: 'checkin',
    min: 0,
    max: 1,
    kurz: 'Schmerzmittel in 24 Stunden',
    frage: 'Haben Sie in den letzten 24 Stunden Schmerzmittel genommen?',
    optionen: ['nein', 'ja'],
    gruppe: 'Zusammenhang',
    rolle: 'kontext',
  },
  {
    key: 'pain_side',
    takt: 'checkin',
    min: 1,
    max: 4,
    kurz: 'Seite',
    frage: 'Auf welcher Seite spüren Sie die Beschwerden vor allem?',
    optionen: ['links', 'rechts', 'beidseits', 'in der Mitte'],
    gruppe: 'Zusammenhang',
    rolle: 'kontext',
  },
];

/** Voreinstellung eines neuen Check-ins: drei Fragen (IDEA-TRK-002, ANN-349). */
export const CHECKIN_VOREINSTELLUNG: readonly string[] = [
  'pain_rest',
  'pain_load',
  'daily_impairment',
];

/**
 * Höchstens so viele Fragen je Check-in (IDEA-TRK-002, ANN-349); Angaben zum
 * Zusammenhang zählen nicht mit (ANN-355).
 */
export const CHECKIN_HOECHSTENS = 5;

export function groessenImTakt(takt: Erfassungstakt): Erfassungsgroesse[] {
  return ERFASSUNGSGROESSEN.filter((g) => g.takt === takt);
}

/** Nur die Fragen einer Liste von Schlüsseln, ohne den Zusammenhang (ANN-355). */
export function nurFragen(keys: readonly string[]): string[] {
  return keys.filter((k) => erfassungsgroesse(k)?.rolle !== 'kontext');
}

export function erfassungsgroesse(key: string): Erfassungsgroesse | undefined {
  return ERFASSUNGSGROESSEN.find((g) => g.key === key);
}

/** Der Wert, wie er gelesen wird: „3", „20 Minuten", „stechend" (ANN-354). */
export function wertText(groesse: Erfassungsgroesse, wert: number): string {
  if (groesse.optionen) return groesse.optionen[wert - groesse.min] ?? String(wert);
  return groesse.einheit ? `${wert} ${groesse.einheit}` : String(wert);
}

/**
 * „Schmerz in Ruhe 3", „Morgensteifigkeit 20 Minuten", „Schmerzart: stechend"
 * – der Wert, unverändert.
 */
export function angabeText(key: string, wert: number): string {
  const g = erfassungsgroesse(key);
  if (!g) return `${key} ${wert}`;
  return g.optionen ? `${g.kurz}: ${wertText(g, wert)}` : `${g.kurz} ${wertText(g, wert)}`;
}

/** Angaben in der Reihenfolge des Katalogs als eine Zeile. */
export function angabenZeile(werte: Record<string, number>): string {
  return ERFASSUNGSGROESSEN.filter((g) => werte[g.key] !== undefined)
    .map((g) => angabeText(g.key, werte[g.key]!))
    .join(' · ');
}

/** Ob eine eingegebene Zahl zur Größe passt; die Datenbank prüft verbindlich. */
export function angabeGueltig(groesse: Erfassungsgroesse, wert: number): boolean {
  return Number.isInteger(wert) && wert >= groesse.min && wert <= groesse.max;
}

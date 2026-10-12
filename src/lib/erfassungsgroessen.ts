/**
 * Erfassungsgrößen nach Takt (TRK-EPIC-001, IDEA-TRK-001, ANN-348).
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
  },
  {
    key: 'session_pain',
    takt: 'session',
    min: 0,
    max: 10,
    kurz: 'Schmerz',
    frage: 'Wie stark waren Schmerzen während der Einheit?',
    enden: ['keine', 'stärkste vorstellbare'],
  },
  {
    key: 'pain_rest',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Schmerz in Ruhe',
    frage: 'Wie stark sind Ihre Schmerzen in Ruhe?',
    enden: ['keine', 'stärkste vorstellbare'],
  },
  {
    key: 'pain_load',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Schmerz bei Belastung',
    frage: 'Wie stark sind Ihre Schmerzen bei Belastung?',
    enden: ['keine', 'stärkste vorstellbare'],
  },
  {
    key: 'daily_impairment',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Einschränkung im Alltag',
    frage: 'Wie stark schränken Ihre Beschwerden Sie im Alltag ein?',
    enden: ['gar nicht', 'vollständig'],
  },
  {
    key: 'sleep_quality',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Schlaf',
    frage: 'Wie gut haben Sie zuletzt geschlafen?',
    enden: ['sehr schlecht', 'sehr gut'],
  },
  {
    key: 'stress',
    takt: 'checkin',
    min: 0,
    max: 10,
    kurz: 'Stress',
    frage: 'Wie angespannt oder gestresst fühlen Sie sich?',
    enden: ['gar nicht', 'sehr'],
  },
  {
    key: 'morning_stiffness_minutes',
    takt: 'checkin',
    min: 0,
    max: 240,
    kurz: 'Morgensteifigkeit',
    frage: 'Wie viele Minuten waren Sie heute Morgen steif?',
    einheit: 'Minuten',
  },
];

/** Voreinstellung eines neuen Check-ins: drei Fragen (IDEA-TRK-002, ANN-349). */
export const CHECKIN_VOREINSTELLUNG: readonly string[] = [
  'pain_rest',
  'pain_load',
  'daily_impairment',
];

/** Höchstens so viele Fragen je Check-in (IDEA-TRK-002, ANN-349). */
export const CHECKIN_HOECHSTENS = 5;

export function groessenImTakt(takt: Erfassungstakt): Erfassungsgroesse[] {
  return ERFASSUNGSGROESSEN.filter((g) => g.takt === takt);
}

export function erfassungsgroesse(key: string): Erfassungsgroesse | undefined {
  return ERFASSUNGSGROESSEN.find((g) => g.key === key);
}

/** „Schmerz in Ruhe 3", „Morgensteifigkeit 20 Minuten" – der Wert, unverändert. */
export function angabeText(key: string, wert: number): string {
  const g = erfassungsgroesse(key);
  if (!g) return `${key} ${wert}`;
  return g.einheit ? `${g.kurz} ${wert} ${g.einheit}` : `${g.kurz} ${wert}`;
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

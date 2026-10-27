import type { Koerperregion } from '../types';

/**
 * Die Werte des Übungskatalogs (ANN-382). Reine Typen und feste Listen, ohne
 * Abhängigkeit - die Eintragsdateien unter `eintraege/` importieren nur von
 * hier (`import type`), damit `scripts/katalog-sql.mjs` sie mit Node lesen
 * kann.
 *
 * Gegenstücke in der Datenbank (`20261111100000_ueb_012_exercise_catalog.sql`):
 * `app.exercise_goals()`, `app.exercise_starting_positions()` und
 * `app.exercise_equipment_labels()`; `supabase/tests/exercise-catalog.test.ts`
 * hält beide Seiten gleich.
 *
 * KEIN Feld „Krankheitsbild" und keine Kontraindikation als Filter (ADR-006
 * Punkt 10): Der Katalog ist Nachschlagewerk, keine Auswahl.
 */

/** Die Gruppen der Liste, je eine Datei unter `eintraege/`. */
export const GRUPPEN = [
  'bt',
  'hw',
  'bw',
  'lw',
  'sh',
  'eh',
  'hu',
  'kn',
  'fu',
  'gg',
  'af',
  'at',
  'ne',
  'au',
] as const;
export type Gruppe = (typeof GRUPPEN)[number];

export const ZIELE = [
  'mobilitaet',
  'kraft',
  'stabilitaet',
  'gleichgewicht',
  'dehnung',
  'atmung',
  'koordination',
  'ausdauer',
] as const;
export type Ziel = (typeof ZIELE)[number];

export const ZIEL_LABEL: Readonly<Record<Ziel, string>> = {
  mobilitaet: 'Beweglichkeit',
  kraft: 'Kraft',
  stabilitaet: 'Stabilität',
  gleichgewicht: 'Gleichgewicht',
  dehnung: 'Dehnung',
  atmung: 'Atmung',
  koordination: 'Koordination',
  ausdauer: 'Ausdauer',
};

export const AUSGANGSSTELLUNGEN = [
  'rueckenlage',
  'bauchlage',
  'seitlage',
  'sitz',
  'stand',
  'vierfuessler',
  'kniestand',
  'gehen',
] as const;
export type Ausgangsstellung = (typeof AUSGANGSSTELLUNGEN)[number];

export const AUSGANGSSTELLUNG_LABEL: Readonly<Record<Ausgangsstellung, string>> = {
  rueckenlage: 'Rückenlage',
  bauchlage: 'Bauchlage',
  seitlage: 'Seitlage',
  sitz: 'Sitz',
  stand: 'Stand',
  vierfuessler: 'Vierfüßlerstand',
  kniestand: 'Kniestand',
  gehen: 'Gehen',
};

/**
 * Hilfsmittel als feste Liste - der Hausrat zuerst, weil im Hausbesuch kein
 * Gerätepark da ist. Die Bezeichnung landet beim Übernehmen in der Ausrüstung
 * der Variante (ANN-295 bleibt: eigene Übungen tragen freie Schlagworte).
 */
export const HILFSMITTEL = [
  'stuhl',
  'tisch',
  'wand',
  'tuerrahmen',
  'bett',
  'handtuch',
  'kissen',
  'theraband',
  'stufe',
  'hantel',
  'gewichtsmanschette',
  'ball',
  'stab',
  'matte',
  'gehhilfe',
  'pedaltrainer',
  'alltagsgegenstand',
] as const;
export type Hilfsmittel = (typeof HILFSMITTEL)[number];

export const HILFSMITTEL_LABEL: Readonly<Record<Hilfsmittel, string>> = {
  stuhl: 'Stuhl',
  tisch: 'Tisch oder Arbeitsplatte',
  wand: 'Wand',
  tuerrahmen: 'Türrahmen',
  bett: 'Bett',
  handtuch: 'Handtuch',
  kissen: 'Kissen',
  theraband: 'Theraband',
  stufe: 'Treppe oder Stufe',
  hantel: 'Hantel oder Wasserflasche',
  gewichtsmanschette: 'Gewichtsmanschette',
  ball: 'Ball',
  stab: 'Stab oder Besenstiel',
  matte: 'Matte',
  gehhilfe: 'Gehhilfe',
  pedaltrainer: 'Bewegungstrainer',
  alltagsgegenstand: 'Alltagsgegenstand',
};

/** Was an einem Hilfsmittel steht, das nur bei Bedarf dazukommt. */
export const NACH_BEDARF = ' (nach Bedarf)';

export const NIVEAUS = [1, 2, 3] as const;
export type Niveau = (typeof NIVEAUS)[number];

export const NIVEAU_LABEL: Readonly<Record<Niveau, string>> = {
  1: 'Leicht, mit Halt',
  2: 'Mittel',
  3: 'Anspruchsvoll',
};

/**
 * Die Standarddosierung (ANN-384): eine Eigenschaft des Katalogs, für alle
 * gleich und nie aus Angaben einer Person abgeleitet (ADR-006 Punkt 10).
 * Genau eines von `wiederholungen` und `dauer_s`; `halten_s` nur mit
 * Wiederholungen („10-mal, je 5 Sekunden halten").
 */
export interface Dosierung {
  /** Durchgänge; ohne Angabe 1. */
  saetze?: number;
  /** Eine Zahl oder ein Bereich [von, bis]. */
  wiederholungen?: number | readonly [number, number];
  halten_s?: number;
  dauer_s?: number;
  je_seite?: boolean;
  /** Wie oft am Tag; ohne Angabe gilt die Häufigkeit des Plans. */
  taeglich?: number;
}

export interface Katalogeintrag {
  /** Stabiler Schlüssel, etwa `KN-01` - nie wiederverwendet. */
  schluessel: string;
  /** semver; geänderter Inhalt braucht eine höhere Fassung. */
  version: string;
  /** Fachliche Bezeichnung. */
  name: string;
  /** Bezeichnung in Alltagssprache - was die Person liest. */
  alltagsname: string;
  region: Koerperregion;
  ziel: Ziel;
  ausgangsstellung: Ausgangsstellung;
  hilfsmittel: readonly Hilfsmittel[];
  /** Was nur bei Bedarf dazukommt, etwa eine Gewichtsmanschette. */
  hilfsmittel_optional?: readonly Hilfsmittel[];
  niveau: Niveau;
  dosierung: Dosierung;
  /** 3 bis 5 Schritte in Alltagssprache, je ein ganzer Satz. */
  anleitung: readonly string[];
  /** Typische Ausweichbewegungen, fachlich, für die Praxis. */
  fehler: readonly string[];
  /** Vorsicht und Abgrenzung, nur zum Nachlesen - nie Filter. */
  hinweise_praxis?: string;
}

/** Eine mitgelieferte Zusammenstellung - nach Thema benannt, ohne Person. */
export interface Katalogvorlage {
  schluessel: string;
  name: string;
  ziel: string;
  uebungen: readonly { schluessel: string; dosierung?: Dosierung }[];
}

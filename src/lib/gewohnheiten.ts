/**
 * Gewohnheiten mit sehr kleinen Zielen (ALT-003, IDEA-ALT-002, ANN-370).
 *
 * Plattform und Praxis teilen diese Datei wie `erfassungsgroessen.ts`: die
 * Längen der Felder (die Datenbank prüft verbindlich) und die Reihe der Tage,
 * an denen eine Gewohnheit vermerkt wurde.
 *
 * KEINE SERIE. Hier gibt es bewusst keine Zahl aufeinanderfolgender Tage,
 * keine Quote und kein „geschafft“: Ein Tag ohne Vermerk ist nur ein Tag ohne
 * Vermerk (IDEA-ALT-002 „Vorsicht“, ADR-006 Punkt 11).
 */

import { tagePlus } from './datum';

/** Was, Auslöser, Wo: höchstens so viele Zeichen (ANN-370). */
export const GEWOHNHEIT_TEXT_MAX = 120;

export interface Gewohnheitstag {
  /** ISO-Tag, „2026-10-12“. */
  datum: string;
  vermerkt: boolean;
  /** Vor dem Eintragen: weder vermerkt noch offen. */
  vorBeginn: boolean;
}

/**
 * Die letzten `anzahl` Tage bis `heute`, ältester zuerst, je mit „vermerkt“
 * – ohne Zählwerk.
 */
export function tagesreihe(
  heute: string,
  anzahl: number,
  vermerkte: readonly string[],
  beginn: string,
): Gewohnheitstag[] {
  const menge = new Set(vermerkte);
  return Array.from({ length: anzahl }, (_, i) => {
    const datum = tagePlus(heute, i + 1 - anzahl);
    return { datum, vermerkt: menge.has(datum), vorBeginn: datum < beginn };
  });
}

/** „Nach dem Zähneputzen: zwei Minuten Mobilität (im Bad)“. */
export function gewohnheitSatz(g: { action: string; cue: string; place: string | null }): string {
  return `${g.cue}: ${g.action}${g.place ? ` (${g.place})` : ''}`;
}

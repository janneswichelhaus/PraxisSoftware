/**
 * Die maßlichen Regeln der Marke „Own Motion" als Zahlen.
 *
 * `marke/README.md` ist die einzige Quelle dieser Regeln; hier stehen sie in
 * der Form, in der Code sie prüfen kann. Getrennt von `Wortmarke.tsx` nach
 * demselben Muster wie `buttonStile.ts` neben `Button.tsx`.
 */

/**
 * Seitenverhältnis des Blocks ohne Unterzeile: `5330.93 × 2035.73`
 * (Einheiten des Pfadraums, `marke/README.md`, Abschnitt „Dateien").
 */
export const MARKE_SEITENVERHAELTNIS = 5330.93 / 2035.73;

/**
 * Mindesthöhe in Pixeln, digital, für den Block ohne Unterzeile.
 *
 * `marke/README.md`: „Digital 24 px Höhe […] jeweils für den Block ohne
 * Unterzeile." Darunter fällt die zweite Zeile auseinander — dort gehört das
 * App-Symbol hin, nicht die verkleinerte Wortmarke.
 */
export const MARKE_MINDESTHOEHE = 24;

/**
 * Schutzraum in Pixeln, den die Marke bei dieser Höhe rundum braucht.
 *
 * `marke/README.md`: „Rundum mindestens die Höhe der MOTION-Zeile." Die zweite
 * Zeile misst 731 der 2035,73 Einheiten des Pfadraums, also 35,9 % der
 * Gesamthöhe — bei 24 px sind das 8,6 px, bei 40 px 14,4 px.
 */
export function schutzraum(hoehe: number): number {
  return hoehe * (731 / 2035.73);
}

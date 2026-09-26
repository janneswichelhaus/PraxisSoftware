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
 * Höhe der Marke im Rechnungskopf, in Pixeln.
 *
 * `marke/README.md`, Abschnitt „Anwendungsfälle": „Rechnungskopf —
 * schwarzweiß, A4-Kopf, Marke **14 mm** hoch". CSS rechnet beim Druck mit
 * 96 dpi, ein Millimeter sind also 96/25,4 = 3,7795 px; 14 mm ergeben
 * gerundet 53 px. Die Zahl steht hier und nicht im Rechnungsblatt, weil sie
 * aus der Markenregel stammt und nicht aus dem Layout.
 */
export const MARKE_RECHNUNGSHOEHE = 53;

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

/**
 * Schutzkreis eines maskierbaren Symbols als Anteil der Seitenlänge: Radius
 * 40 %, gemessen vom Mittelpunkt (Web App Manifest, „maskable"). Was außerhalb
 * liegt, darf eine Maske des Startbildschirms abschneiden.
 */
export const MASKIERBAR_SCHUTZKREIS = 0.4;

/**
 * Wo die Wortmarke im 1024er Master liegt, in Pixeln - gemessen am
 * 2026-09-26 (BEF-040, **ANN-110**): alles, was nicht Tiefgrün ist. Das Master
 * ist ohne durchsichtige Pixel. Daraus folgt, dass es selbst maskierbar ist und
 * das Web-Manifest keine zweite Fassung braucht (`marke/README.md`).
 */
export const MASTER_WORTMARKE = {
  seite: 1024,
  links: 184,
  rechts: 839,
  oben: 386,
  unten: 637,
} as const;

/** Abstand der äußersten Ecke der Wortmarke vom Mittelpunkt des Masters. */
export function masterWortmarkeEcke(): number {
  const { seite, links, rechts, oben, unten } = MASTER_WORTMARKE;
  const mitte = seite / 2;
  const dx = Math.max(mitte - links, rechts + 1 - mitte);
  const dy = Math.max(mitte - oben, unten + 1 - mitte);
  return Math.hypot(dx, dy);
}

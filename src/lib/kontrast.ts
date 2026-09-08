/**
 * Kontrastrechnung für die Farbtokens (UI-000).
 *
 * `src/index.css` ist und bleibt die einzige Quelle der Farbwerte. Diese Datei
 * rechnet nur — sie hält keine zweite Palette. Der zugehörige Test liest die
 * CSS-Datei, rechnet die Verhältnisse aus und hält fest, welcher Wert wofür
 * genügen muss. Ohne ihn wäre „auf Kontrast geprüft" eine Behauptung im
 * Kommentar; mit ihm ist es eine Zusicherung, die eine Änderung bricht.
 *
 * Umgesetzt sind die veröffentlichten Formeln: Oklch → Oklab → lineares sRGB
 * (Björn Ottosson) und die relative Helligkeit aus WCAG 2.1. Keine
 * Abhängigkeit dafür — es sind zwei Matrixmultiplikationen.
 */

export interface Farbe {
  /** Helligkeit als Anteil, 0 bis 1. */
  L: number;
  /** Buntheit. */
  C: number;
  /** Farbwinkel in Grad. */
  H: number;
}

/**
 * Oklch nach linearem sRGB.
 *
 * Die Rückgabe wird auf 0 bis 1 begrenzt — dasselbe, was ein Bildschirm mit
 * einem Wert außerhalb seines Farbraums macht. Browser bilden solche Farben
 * heute etwas feiner ab (CSS Color 4 reduziert die Buntheit, statt hart zu
 * beschneiden); bei kleinen Überschreitungen liegen beide Wege dicht
 * beieinander. `gamutAbweichung` misst deshalb, wie weit ein Wert überhaupt
 * hinausragt, und der Test hält fest, dass es bei allen Tokens wenig ist.
 */
export function oklchNachLinearSrgb({ L, C, H }: Farbe): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const lStrich = L + 0.3963377774 * a + 0.2158037573 * b;
  const mStrich = L - 0.1055613458 * a - 0.0638541728 * b;
  const sStrich = L - 0.0894841775 * a - 1.291485548 * b;

  const l = lStrich ** 3;
  const m = mStrich ** 3;
  const s = sStrich ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((wert) => Math.min(1, Math.max(0, wert))) as [number, number, number];
}

/**
 * Wie weit liegt die Farbe außerhalb von sRGB?
 *
 * 0 heißt: vollständig darstellbar. Der Wert ist der größte Abstand eines
 * Kanals zum Bereich 0 bis 1 im linearen sRGB — je kleiner, desto näher liegen
 * hartes Beschneiden und das Gamut-Mapping des Browsers beieinander.
 */
export function gamutAbweichung({ L, C, H }: Farbe): number {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const roh = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return Math.max(0, ...roh.map((wert) => Math.max(-wert, wert - 1)));
}

/** Relative Helligkeit nach WCAG 2.1 aus linearem sRGB. */
export function relativeHelligkeit([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastverhältnis nach WCAG 2.1. Die Reihenfolge der Farben ist egal. */
export function kontrastverhaeltnis(vordergrund: Farbe, hintergrund: Farbe): number {
  const eins = relativeHelligkeit(oklchNachLinearSrgb(vordergrund));
  const zwei = relativeHelligkeit(oklchNachLinearSrgb(hintergrund));
  const hell = Math.max(eins, zwei);
  const dunkel = Math.min(eins, zwei);
  return (hell + 0.05) / (dunkel + 0.05);
}

const OKLCH = /--color-([a-z0-9-]+):\s*oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/g;

/**
 * Liest die Farbtokens aus dem Inhalt von `src/index.css`.
 *
 * Bewusst eine schlichte Suche statt eines CSS-Parsers: die Tokens stehen alle
 * in einem `@theme`-Block in genau dieser Schreibweise, und eine Abweichung
 * soll auffallen, statt still ignoriert zu werden.
 */
export function tokensAusCss(css: string): Record<string, Farbe> {
  const tokens: Record<string, Farbe> = {};
  for (const treffer of css.matchAll(OKLCH)) {
    tokens[treffer[1]!] = {
      L: Number(treffer[2]) / 100,
      C: Number(treffer[3]),
      H: Number(treffer[4]),
    };
  }
  return tokens;
}

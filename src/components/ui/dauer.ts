/**
 * Die Skala und die Texte des Dauerreglers (ORG-007, ANN-606) - eigene Datei,
 * weil eine Datei mit Komponente und Hilfsfunktion das schnelle Neuladen
 * aushebelt (wie `buttonStile.ts`).
 *
 * Die Skala ist nicht linear: bis eine Stunde in Schritten von 5 Minuten,
 * darüber in Viertelstunden. So trifft der Daumen auf einer Spur von gut
 * 200 px am Telefon sowohl „20 min“ als auch „4 h 30 min“, ohne zwischen
 * Minuten und Stunden umzuschalten. Fein auf 5 Minuten stellen die Knöpfe
 * „−5“ und „+5“ über die ganze Skala.
 */

/** Bis hierhin in Schritten von 5 Minuten, darüber in Viertelstunden. */
export const FEIN_BIS = 60;
export const FEIN = 5;
export const GROB = 15;

/**
 * Die Stufen der Spur von `min` bis `max`, in Minuten. `min` wird auf 5
 * Minuten aufgerundet; liegt `max` zwischen zwei Viertelstunden, ist es die
 * letzte Stufe.
 */
export function dauerStufen(min: number, max: number): number[] {
  const stufen: number[] = [];
  let wert = Math.max(FEIN, Math.ceil(min / FEIN) * FEIN);
  while (wert <= max) {
    stufen.push(wert);
    if (wert < FEIN_BIS) wert += FEIN;
    else wert = (Math.floor(wert / GROB) + 1) * GROB;
  }
  if (stufen.at(-1) !== max && max >= min) stufen.push(max);
  return stufen;
}

/** Die Stufe, die einem Wert am nächsten liegt (bei Gleichstand die kleinere). */
export function naechsteStufe(stufen: readonly number[], wert: number): number {
  let beste = 0;
  for (let i = 1; i < stufen.length; i += 1) {
    if (Math.abs(stufen[i]! - wert) < Math.abs(stufen[beste]! - wert)) beste = i;
  }
  return beste;
}

/** „45 min“, „1 h“, „1 h 15 min“ - die große Anzeige. */
export function dauerKurz(minuten: number): string {
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  if (h === 0) return `${m}\u00a0min`;
  return m === 0 ? `${h}\u00a0h` : `${h}\u00a0h ${m}\u00a0min`;
}

/** „1 Stunde 15 Minuten“ - was der Screenreader am Regler vorliest. */
export function dauerLang(minuten: number): string {
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  const stunden = h === 1 ? '1 Stunde' : `${h} Stunden`;
  const min = m === 1 ? '1 Minute' : `${m} Minuten`;
  if (h === 0) return min;
  return m === 0 ? stunden : `${stunden} ${min}`;
}

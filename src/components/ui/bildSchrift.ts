/** Breite der Messreihe in Bildeinheiten (`viewBox`). */
export const BILD_BREITE = 320;

/**
 * Schriftgröße im Bild, in Bildeinheiten (RSP-09; Runde 2, BEF-068 Option 2).
 * Das Bild ist 320 Einheiten breit und skaliert mit. 13 Einheiten ergeben erst
 * ab rund 295 px Bildbreite 12 px am Schirm; am Telefon ist das Bild schmaler.
 * Seit Runde 2 rechnet die Schrift aus der gerenderten Breite, sodass sie nie
 * unter 12 px fällt (Handoff Schrift und Knöpfe, Abschnitt 3). Nach oben
 * begrenzt, damit Nummern über dem Bild nicht angeschnitten werden.
 */
const SCHRIFT_MIN = 13;
const SCHRIFT_MAX = 18;

/** Bildeinheiten, die bei `breitePx` Bildbreite 12 px am Schirm ergeben. */
export function schriftInEinheiten(breitePx: number | null): number {
  if (!breitePx || breitePx <= 0) return SCHRIFT_MIN;
  const noetig = Math.ceil(((12 * BILD_BREITE) / breitePx) * 10) / 10;
  return Math.min(SCHRIFT_MAX, Math.max(SCHRIFT_MIN, noetig));
}

/**
 * Kalendertage auf einer Zeitachse (FRB-002e, OUT-001): für das Punktbild im
 * Befund, in „Zwischen den Terminen“ und in „Meine Angaben“.
 */

/** Tage seit 1970 — genug, um Kalendertage auf eine Achse zu legen. */
export function tagZahl(datum: string): number {
  return Math.round(Date.parse(`${datum}T00:00:00Z`) / 86_400_000);
}

/** Der Kalendertag zu einer Tageszahl, „2026-09-20“. */
export function isoTag(tag: number): string {
  return new Date(tag * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Der gezeigte Zeitraum: vom frühesten bis zum spätesten Wert oder Ereignis,
 * mindestens zwei Wochen, damit ein einzelner Punkt nicht am Rand klebt.
 */
export function zeitraum(daten: readonly string[]): { von: number; bis: number } | null {
  if (daten.length === 0) return null;
  const tage = daten.map(tagZahl);
  let von = Math.min(...tage);
  let bis = Math.max(...tage);
  if (bis - von < 14) {
    const mitte = (von + bis) / 2;
    von = Math.floor(mitte - 7);
    bis = Math.ceil(mitte + 7);
  }
  const rand = Math.max(1, Math.round((bis - von) * 0.04));
  return { von: von - rand, bis: bis + rand };
}

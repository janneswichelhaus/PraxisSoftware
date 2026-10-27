import type { ScoreItem } from '@/features/clinical/assessments/schema';

/**
 * Der Befundbogen auf der Plattform in Schritten (Welle B, ANN-467).
 *
 * Der Anamnesebogen hat 46 Fragen und war am Telefon über 11.000 px lang -
 * für Menschen bis 78 Jahre ein Bildschirm ohne Ende. Jetzt steht er in
 * Schritten von höchstens `FRAGEN_JE_SCHRITT` Fragen, mit sichtbarem
 * Fortschritt. Die Fragen, ihre Reihenfolge und die gespeicherten Antworten
 * bleiben, wie sie sind: Geschnitten wird nur die Anzeige.
 *
 * Was zusammengehört, bleibt zusammen: Fragen mit derselben Nummer (12 a und
 * b, 26 mit „Welche?“, „Wann?“) und Fragen unter demselben Hinweis („Zur
 * Beantwortung der Fragen 13–20 …“). Ein solcher Block kann allein länger
 * sein als ein Schritt; dann ist er ein Schritt für sich. Die Regel kennt
 * keinen Bogen beim Namen - sie liest nur Nummer und Hinweis der Definition.
 */
export const FRAGEN_JE_SCHRITT = 8;

export function bogenschritte(
  items: readonly ScoreItem[],
  hoechstens = FRAGEN_JE_SCHRITT,
): ScoreItem[][] {
  const bloecke: ScoreItem[][] = [];
  for (const item of items) {
    const block = bloecke.at(-1);
    const vorher = block?.at(-1);
    const gehoertDazu =
      vorher !== undefined &&
      ((item.nummer !== undefined && item.nummer === vorher.nummer) ||
        (item.hinweis !== undefined && item.hinweis === vorher.hinweis));
    if (block && gehoertDazu) block.push(item);
    else bloecke.push([item]);
  }
  const schritte: ScoreItem[][] = [];
  for (const block of bloecke) {
    const schritt = schritte.at(-1);
    if (schritt && schritt.length + block.length <= hoechstens) schritt.push(...block);
    else schritte.push([...block]);
  }
  return schritte;
}

/** „Fragen 13 bis 20“, „Frage 39“ - nach den Nummern des Bogens. */
export function schrittTitel(items: readonly ScoreItem[]): string {
  const nummern = items.flatMap((item) => (item.nummer === undefined ? [] : [item.nummer]));
  if (nummern.length === 0) return 'Zu Ihrer Person';
  const erste = Math.min(...nummern);
  const letzte = Math.max(...nummern);
  return erste === letzte ? `Frage ${erste}` : `Fragen ${erste} bis ${letzte}`;
}

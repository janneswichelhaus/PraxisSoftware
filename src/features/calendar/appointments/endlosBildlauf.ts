// Streifen zum Nachbarzeitraum links und rechts im Gitter (ANN-864): in Ruhe außer Bild,
// zu zwei Dritteln hereingerollt blättert das Loslassen, sonst federt der Bildlauf zurück.

/** Ab diesem Anteil des sichtbaren Streifens wird geblättert. */
export const BLAETTERN_AB_ANTEIL = 2 / 3;

/** Nach dem Bildlauf: blättern (-1, 1), zurück an den Rand der Spalten oder nichts. */
export type Bildlaufschluss = -1 | 1 | 'links' | 'rechts' | null;

export function nachBildlauf({
  links,
  max,
  streifen,
}: {
  /** `scrollLeft` des Gitters. */
  links: number;
  /** `scrollWidth - clientWidth` des Gitters. */
  max: number;
  /** Breite eines Streifens in Pixeln. */
  streifen: number;
}): Bildlaufschluss {
  if (streifen <= 0 || max < 2 * streifen) return null;
  const rest = streifen * (1 - BLAETTERN_AB_ANTEIL);
  if (links <= rest) return -1;
  if (links >= max - rest) return 1;
  if (links < streifen) return 'links';
  if (links > max - streifen) return 'rechts';
  return null;
}

/**
 * Vorwärts am Anfang, rückwärts am Ende der Spalten: Der neue Zeitraum liegt dort, wo man
 * hingerollt hat. Ohne Richtung bleibt der Bildlauf, nur nicht in einem Streifen.
 */
export function landung({
  richtung,
  links,
  max,
  streifen,
}: {
  richtung: -1 | 1 | null;
  links: number;
  max: number;
  streifen: number;
}): number {
  const ende = Math.max(streifen, max - streifen);
  if (richtung === 1) return streifen;
  if (richtung === -1) return ende;
  return Math.min(Math.max(links, streifen), ende);
}

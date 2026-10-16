/**
 * Wann ein Antippen eine Nadel trifft. Eine Nadel ist 32 px breit gezeichnet
 * (aktiv 40), ein Ziel unter dem Finger braucht aber 44 px (DESIGN.md
 * Grundsatz 3, Handoff Lastenrad 3D AC 9): Getroffen ist die Nadel, deren
 * Kopf dem Finger am nächsten liegt, höchstens 22 px entfernt.
 */
export const NADEL_TREFFERRADIUS = 22;

/** Der Kopf einer Nadel am Bildschirm, mit dem, was ein Treffer zurückgibt. */
export interface Nadelkopf<T> {
  x: number;
  y: number;
  nadel: T;
}

export function naechsteNadel<T>(
  x: number,
  y: number,
  koepfe: readonly Nadelkopf<T>[],
  radius = NADEL_TREFFERRADIUS,
): T | null {
  let beste: { abstand: number; nadel: T } | null = null;
  for (const kopf of koepfe) {
    const abstand = Math.hypot(x - kopf.x, y - kopf.y);
    if (abstand <= radius && (!beste || abstand < beste.abstand)) {
      beste = { abstand, nadel: kopf.nadel };
    }
  }
  return beste?.nadel ?? null;
}

/**
 * Wie hoch über der Spitze der Kopf einer Nadel sitzt: Im Bild der Nadel
 * (`pinCanvas`, 160 px hoch) liegt seine Mitte 98 px über dem unteren Rand.
 */
export function kopfUeberSpitze(hoeheImBild: number): number {
  return hoeheImBild * (98 / 160);
}

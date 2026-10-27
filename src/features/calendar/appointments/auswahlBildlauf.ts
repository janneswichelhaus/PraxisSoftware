/**
 * Wie weit die Seite rollt, damit die Leiste die Auswahl nicht verdeckt
 * (Runde 3, Handoff Kalender und Tour 2026-10-06, Abschnitt 3).
 *
 * Die Anlegen-Leiste klebt am unteren Rand. Lag der erste Tipp im unteren
 * Drittel, verschwand die Auswahl hinter ihr, und für den zweiten Tipp einer
 * Spanne musste man erst selbst rollen. Jetzt rollt die Seite so, dass die
 * Auswahl im oberen Drittel des freien Bereichs über der Leiste steht -
 * darunter bleibt Platz für den zweiten Tipp. Liegt sie frei, rollt nichts.
 *
 * Alle Werte in Pixeln relativ zum Fenster (`getBoundingClientRect`). Ohne
 * Layout (jsdom) ist die Leiste 0 hoch an Stelle 0: kein Bildlauf.
 */
export function auswahlBildlauf({
  auswahlOben,
  auswahlUnten,
  leisteOben,
  abstand = 8,
}: {
  auswahlOben: number;
  auswahlUnten: number;
  leisteOben: number;
  abstand?: number;
}): number {
  if (leisteOben <= 0) return 0;
  if (auswahlUnten + abstand <= leisteOben && auswahlOben >= 0) return 0;
  return Math.round(auswahlOben - leisteOben / 3);
}

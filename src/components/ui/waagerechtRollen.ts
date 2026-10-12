/**
 * Waagerecht laufende Leisten - Untermenü (`SubNav`) und Reiter eines Objekts
 * (`Reiterleiste`) - rollen den aktiven Eintrag ins Bild (UIK-10, PAT-01,
 * RSP-04). Bis zum Design-Fundament stand dieselbe Funktion zweimal im Code,
 * in der `SubNav` und im Rahmen der Akte.
 *
 * Eigene Datei aus demselben Grund wie `buttonStile.ts`: eine Modul-Datei mit
 * Komponente *und* Hilfsfunktion hebelt das schnelle Neuladen aus.
 */

/**
 * Wie weit der Nachbar des aktiven Eintrags noch ins Bild ragt, wenn die
 * Leiste ihn heranrollt: ein angeschnittenes Wort sagt „hier geht es weiter".
 */
export const NACHBAR_PX = 24;

/**
 * Rollt die Leiste waagerecht, bis `eintrag` ganz zu sehen ist - über
 * `scrollLeft` der Liste und nicht über `scrollIntoView`: Das rollte auch die
 * Seite senkrecht, und wer mitten auf einer langen Seite den Bereich wechselt,
 * stünde plötzlich woanders (UIK-10).
 *
 * Nur, wo die Leiste überhaupt scrollt: ab 640 px bricht sie um, dann ist
 * ohnehin alles zu sehen.
 */
export function rolleInsBild(liste: HTMLElement, eintrag: HTMLElement): void {
  if (liste.scrollWidth <= liste.clientWidth) return;
  const rahmen = liste.getBoundingClientRect();
  const ziel = eintrag.getBoundingClientRect();
  const links = ziel.left - rahmen.left + liste.scrollLeft;
  const rechts = links + ziel.width;
  if (links - NACHBAR_PX < liste.scrollLeft) {
    liste.scrollLeft = Math.max(0, links - NACHBAR_PX);
  } else if (rechts + NACHBAR_PX > liste.scrollLeft + liste.clientWidth) {
    liste.scrollLeft = rechts + NACHBAR_PX - liste.clientWidth;
  }
}

import { useLayoutEffect, useState, type RefObject } from 'react';

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
 * Der Rand neben dem offenen Reiter in einer Leiste mit `Randverlauf`: Der
 * Verlauf ist 40 px breit (`w-10`), 8 px mehr halten den Reiter ganz davor -
 * er liegt nie unter dem Verlauf, der Nachbar ragt darunter angeschnitten ins
 * Bild.
 */
export const VERLAUF_FREI_PX = 40 + 8;

/**
 * Rollt die Leiste waagerecht, bis `eintrag` ganz zu sehen ist - über
 * `scrollLeft` der Liste und nicht über `scrollIntoView`: Das rollte auch die
 * Seite senkrecht, und wer mitten auf einer langen Seite den Bereich wechselt,
 * stünde plötzlich woanders (UIK-10).
 *
 * Nur, wo die Leiste überhaupt scrollt: ab 640 px bricht sie um, dann ist
 * ohnehin alles zu sehen. `nachbar` ist der Rand, der neben dem Eintrag frei
 * bleibt - eine Leiste mit Verlauf an beiden Rändern braucht mehr als die
 * 24 px, sonst läge der offene Eintrag halb unter dem Verlauf.
 */
export function rolleInsBild(liste: HTMLElement, eintrag: HTMLElement, nachbar = NACHBAR_PX): void {
  if (liste.scrollWidth <= liste.clientWidth) return;
  const rahmen = liste.getBoundingClientRect();
  const ziel = eintrag.getBoundingClientRect();
  const links = ziel.left - rahmen.left + liste.scrollLeft;
  const rechts = links + ziel.width;
  if (links - nachbar < liste.scrollLeft) {
    liste.scrollLeft = Math.max(0, links - nachbar);
  } else if (rechts + nachbar > liste.scrollLeft + liste.clientWidth) {
    liste.scrollLeft = rechts + nachbar - liste.clientWidth;
  }
}

/**
 * Liegen links oder rechts noch Einträge außer Sicht? Gemessen beim Einhängen,
 * bei jedem Rollen und wenn sich die Breite ändert; `abhaengig` misst neu, wenn
 * sich der Inhalt ändert (etwa ein anderer Pfad).
 *
 * Für den Verlauf an den Rändern der `Reiterleiste` (Sichtung vom 13.10.2026,
 * Befund A1): Bei 375 px blieben Reste wie „Stammd" oder „oku" stehen, ohne
 * Hinweis, dass es weitergeht. Die `SubNav` misst nur rechts; die Reiterleiste
 * rollt den offenen Reiter oft so weit, dass auch links etwas fehlt.
 */
export function useRandVerlauf(
  liste: RefObject<HTMLElement | null>,
  abhaengig: unknown,
): { links: boolean; rechts: boolean } {
  const [rand, setRand] = useState({ links: false, rechts: false });
  useLayoutEffect(() => {
    const element = liste.current;
    if (!element) return;
    const messen = () => {
      const links = element.scrollLeft > 1;
      const rechts = element.scrollWidth - element.clientWidth - element.scrollLeft > 1;
      setRand((alt) => (alt.links === links && alt.rechts === rechts ? alt : { links, rechts }));
    };
    messen();
    element.addEventListener('scroll', messen, { passive: true });
    const beobachter =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(messen);
    beobachter?.observe(element);
    return () => {
      element.removeEventListener('scroll', messen);
      beobachter?.disconnect();
    };
  }, [liste, abhaengig]);
  return rand;
}

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router-dom';
import { tabTitel } from './tabtitel';

/**
 * Was ein Seitenwechsel im Rahmen auslöst (NAV-09, VER-06).
 *
 * Die Anwendung wechselt Seiten, ohne das Dokument neu zu laden. Zwei Dinge,
 * die ein Browser beim Laden einer neuen Seite von selbst tut, blieben deshalb
 * bis UXR-002 aus:
 *
 *   1. **Die neue Seite beginnt oben.** Wer unten auf einer langen Seite
 *      „Bearbeiten" tippte, stand im Formular auf derselben Höhe - der Kopf mit
 *      dem Namen, der vor einer Verwechslung schützt, außer Sicht (VER-06).
 *      Zurück und Vor (`POP`) bleiben beim Browser: Er stellt die Stelle
 *      wieder her, an der man war. Ein Sprungziel (`#verordnung-…`) steuert
 *      die Seite selbst an.
 *   2. **Der Fokus geht auf den Inhalt.** Er stand sonst weiter auf dem Punkt
 *      der Seitenleiste oder im Suchfeld, und Vorlesesoftware merkte nicht,
 *      dass eine neue Seite da ist (NAV-09). Hat die neue Seite den Fokus
 *      selbst gesetzt - ein Feld, eine Rückfrage - oder liegt er auf einem
 *      Punkt im Inhalt, der den Wechsel überlebt hat (Untermenü, Reiter der
 *      Akte), bleibt er, wo er ist.
 *
 * Ein Wechsel nur der Suchparameter - Kalenderwoche, Filter einer Liste - ist
 * kein Seitenwechsel: Dort blieb man bisher stehen, und dabei bleibt es.
 * Deshalb **nicht** `<ScrollRestoration>` aus React Router: Es setzt auch bei
 * jedem neuen Suchparameter an den Anfang, und Filtern oder Blättern sprängen
 * nach oben.
 *
 *   3. **Der Tab heißt wie die Seite** (BEF-050, Option 1, RAH-008): ein
 *      fester Titel je Route aus `tabtitel.ts`, nie aus Daten. Mit dem Fokus
 *      auf dem Inhalt sagt Vorlesesoftware den neuen Titel an. Gesetzt bei
 *      jedem Pfad, auch beim ersten - sonst hieße der erste Tab nach dem
 *      Anmelden weiter „Own Motion".
 */
export function useSeitenwechsel(inhalt: RefObject<HTMLElement | null>): void {
  const { pathname, hash } = useLocation();
  const art = useNavigationType();
  const bisher = useRef(pathname);

  useEffect(() => {
    document.title = tabTitel(pathname);
  }, [pathname]);

  // Vor dem Zeichnen: Die neue Seite soll nicht erst auf der alten Höhe
  // erscheinen und dann springen. Eine Seite, die den Fokus in einem
  // gewöhnlichen Effekt setzt, kommt danach und behält ihn.
  useLayoutEffect(() => {
    if (bisher.current === pathname) return;
    bisher.current = pathname;

    if (art !== NavigationType.Pop && !hash) {
      (document.scrollingElement ?? document.documentElement).scrollTop = 0;
    }

    const bereich = inhalt.current;
    if (!bereich) return;
    const fokus = document.activeElement;
    if (fokus && fokus !== document.body && bereich.contains(fokus)) return;
    bereich.focus({ preventScroll: true });
  }, [pathname, hash, art, inhalt]);
}

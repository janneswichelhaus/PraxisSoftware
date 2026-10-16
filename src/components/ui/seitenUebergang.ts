import { useLayoutEffect, type MouseEvent, type RefObject } from 'react';

/**
 * „Zeile öffnet sich zur Seite“ (Auftrag Jannes vom 16.10.2026, ANN-567): Die
 * angetippte `ListRow` wächst in den Inhalt der neuen Seite hinein - ein View
 * Transition des Browsers. Wie es aussieht, steht in `index.css`
 * (`zeile-zur-seite`).
 *
 * **Selbst gestartet, nicht über `viewTransition` am Link.** Die Anwendung
 * rendert ihre Seiten in verschachtelten `<Routes>` unter einer einzigen
 * Route des Data Routers (`App.tsx`); dort navigiert der Link über den
 * einfachen Navigator, und der lässt die Option fallen (React Router 7,
 * nachgemessen am 16.10.2026). Deshalb startet der Tipp den Übergang hier und
 * gibt das neue Bild frei, sobald der Rahmen die neue Seite gezeichnet hat
 * (`useSeitenziel`) - spätestens nach `MAX_WARTEN_MS`.
 *
 * Der Übergang braucht genau ein Element mit diesem Namen im alten und eines
 * im neuen Bild. Deshalb trägt ihn nichts dauerhaft: die Zeile ab dem Tipp,
 * der Inhalt der Seite nur kurz nach jedem Seitenwechsel. Stünde er doch
 * einmal doppelt da, überspringt der Browser nur die Animation; die Seite
 * wechselt trotzdem. Ohne View Transitions (ältere Browser, Tests), bei
 * reduzierter Bewegung und bei einem Tipp mit Zusatztaste (neuer Tab)
 * übernimmt der Link wie bisher.
 *
 * Ebenso, wo niemand die neue Seite meldet - kein Rahmen mit
 * `useSeitenziel`, etwa in der Plattform der Patient:innen - und wo die Zeile
 * auf derselben Seite bleibt (nur andere Suchparameter oder ein Anker, etwa
 * im Zeitkonto): Sonst stünde die Seite bis zu `MAX_WARTEN_MS` still.
 */
const NAME = 'zeile-zur-seite';

/** So lange trägt ein Element den Namen; kein Übergang dauert länger. */
const DAUER_MS = 1000;

/**
 * So lange wartet der Übergang höchstens auf die neue Seite - etwa wenn ein
 * Textverlustschutz den Wechsel anhält und erst nachfragt.
 */
const MAX_WARTEN_MS = 400;

/** Gibt das neue Bild frei, sobald die neue Seite gezeichnet ist. */
let seiteGezeichnet: (() => void) | null = null;

/** Wie viele Rahmen gerade die neue Seite melden (`useSeitenziel`). */
let ziele = 0;

function benennen(element: HTMLElement): void {
  element.style.setProperty('view-transition-name', NAME);
  window.setTimeout(() => element.style.removeProperty('view-transition-name'), DAUER_MS);
}

function aufNeueSeite(): Promise<void> {
  return new Promise((fertig) => {
    const freigeben = () => {
      seiteGezeichnet = null;
      window.clearTimeout(uhr);
      fertig();
    };
    const uhr = window.setTimeout(freigeben, MAX_WARTEN_MS);
    seiteGezeichnet = freigeben;
  });
}

function bewegungReduziert(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Für das `onClick` des Links einer Zeile: startet den Übergang und darin den
 * Seitenwechsel (`weiter`). Wo der Übergang nicht läuft, tut es nichts - dann
 * navigiert der Link selbst. `gleicheSeite`: Das Ziel hat denselben Pfad wie
 * die Seite, auf der die Zeile steht.
 */
export function zeileOeffnen(
  event: MouseEvent<HTMLAnchorElement>,
  weiter: () => void,
  gleicheSeite = false,
): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    typeof document.startViewTransition !== 'function' ||
    bewegungReduziert() ||
    ziele === 0 ||
    gleicheSeite
  ) {
    return;
  }
  event.preventDefault();
  benennen(event.currentTarget);
  document.startViewTransition(() => {
    const gezeichnet = aufNeueSeite();
    weiter();
    return gezeichnet;
  });
}

/**
 * Der Inhalt der Seite (`main`) wird zum Zielbild - benannt nur kurz nach
 * jedem Wechsel von `pfad`, damit beim nächsten Tipp auf eine Zeile nur sie
 * den Namen trägt. Zugleich gibt er einen laufenden Übergang frei: Die neue
 * Seite steht.
 */
export function useSeitenziel(inhalt: RefObject<HTMLElement | null>, pfad: string): void {
  useLayoutEffect(() => {
    ziele += 1;
    return () => {
      ziele -= 1;
    };
  }, []);

  useLayoutEffect(() => {
    const element = inhalt.current;
    if (!element) return undefined;
    element.style.setProperty('view-transition-name', NAME);
    seiteGezeichnet?.();
    const uhr = window.setTimeout(
      () => element.style.removeProperty('view-transition-name'),
      DAUER_MS,
    );
    return () => {
      window.clearTimeout(uhr);
      element.style.removeProperty('view-transition-name');
    };
  }, [inhalt, pfad]);
}

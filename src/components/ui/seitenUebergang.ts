import { useLayoutEffect, type MouseEvent, type RefObject } from 'react';
import { bewegungErlaubt, type Richtung } from './bewegung';

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
 * **Bereich wechseln** (`bereichWechseln`, ANN-663): Ein Tipp in die Leiste
 * der Arbeitsbereiche schiebt die neue Seite waagerecht über die alte - von
 * rechts, wenn der Bereich weiter rechts (in der Seitenleiste weiter unten)
 * steht, sonst von links. Kopfzeile, Tableiste und Seitenleiste bleiben dabei
 * stehen (`index.css`, „Bereich wechseln“). Gemeinsam mit „Zeile zur Seite“:
 * dieselbe Freigabe über `useSeitenziel`, dieselben Ausnahmen.
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

/** Während ein Bereichswechsel läuft: Der Inhalt bekommt keinen Namen. */
let bereichswechsel = false;

/** Der Inhalt, der gerade den Namen trägt (`useSeitenziel`). */
let benannterInhalt: HTMLElement | null = null;

/** Wie viele Rahmen gerade die neue Seite melden (`useSeitenziel`). */
let ziele = 0;

function benennen(element: HTMLElement): void {
  element.style.setProperty('view-transition-name', NAME);
  window.setTimeout(() => element.style.removeProperty('view-transition-name'), DAUER_MS);
}

/** `true`, wenn die neue Seite steht; `false`, wenn die Wartezeit ablief. */
function aufNeueSeite(): Promise<boolean> {
  return new Promise((fertig) => {
    const freigeben = (gezeichnet: boolean) => {
      seiteGezeichnet = null;
      window.clearTimeout(uhr);
      fertig(gezeichnet);
    };
    const uhr = window.setTimeout(() => freigeben(false), MAX_WARTEN_MS);
    seiteGezeichnet = () => freigeben(true);
  });
}

/** Ob der Tipp beim Link bleibt: Zusatztaste, kein Übergang, kein Rahmen. */
function linkUebernimmt(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    typeof document.startViewTransition !== 'function' ||
    !bewegungErlaubt() ||
    ziele === 0
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
  if (linkUebernimmt(event) || gleicheSeite) return;
  event.preventDefault();
  benennen(event.currentTarget);
  document.startViewTransition(async () => {
    const gezeichnet = aufNeueSeite();
    weiter();
    await gezeichnet;
  });
}

/**
 * Die Richtung von einem Bereich zum anderen in der Reihenfolge der Leiste;
 * `null`, wo es keine gibt - derselbe Bereich, oder einer steht nicht darin
 * (etwa „Mein Konto“).
 */
export function richtungIn(
  reihe: readonly string[],
  von: string | undefined,
  nach: string,
): Richtung | null {
  const alt = von === undefined ? -1 : reihe.indexOf(von);
  const neu = reihe.indexOf(nach);
  if (alt < 0 || neu < 0 || alt === neu) return null;
  return neu > alt ? 'vor' : 'zurueck';
}

/**
 * Für das `onClick` eines Bereichs in der Leiste: schiebt die neue Seite in
 * `richtung` über die alte. Ohne Richtung, und wo der Übergang nicht läuft,
 * tut es nichts - dann navigiert der Link selbst. Bleibt die Seite stehen
 * (eine Rückfrage hält den Wechsel an), entfällt das Schieben.
 */
export function bereichWechseln(
  event: MouseEvent<HTMLAnchorElement>,
  weiter: () => void,
  richtung: Richtung | null,
): void {
  if (richtung === null || linkUebernimmt(event)) return;
  event.preventDefault();
  // Trägt der Inhalt vom letzten Wechsel noch den Namen, schöbe er sich
  // als eigenes Bild über das Schieben.
  benannterInhalt?.style.removeProperty('view-transition-name');
  const wurzel = document.documentElement;
  wurzel.dataset['wechsel'] = richtung;
  bereichswechsel = true;
  const uebergang = document.startViewTransition(async () => {
    const gezeichnet = aufNeueSeite();
    weiter();
    if (!(await gezeichnet)) uebergang.skipTransition();
  });
  void uebergang.finished.finally(() => {
    bereichswechsel = false;
    delete wurzel.dataset['wechsel'];
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
    if (bereichswechsel) {
      seiteGezeichnet?.();
      return undefined;
    }
    element.style.setProperty('view-transition-name', NAME);
    benannterInhalt = element;
    seiteGezeichnet?.();
    const uhr = window.setTimeout(
      () => element.style.removeProperty('view-transition-name'),
      DAUER_MS,
    );
    return () => {
      window.clearTimeout(uhr);
      element.style.removeProperty('view-transition-name');
      if (benannterInhalt === element) benannterInhalt = null;
    };
  }, [inhalt, pfad]);
}

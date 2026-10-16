import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/**
 * Der gleitende Anzeiger einer Reihe mit genau einem aktiven Eintrag: der
 * Unterstrich der `SubNav`, die Pille der `Reiterleiste`, der Strich der
 * Tableiste (Auftrag Jannes vom 16.10.2026, „Wechseln mit Schwung“, ANN-567).
 *
 * Wechselt der aktive Eintrag (`aria-current="page"`), dehnt sich der
 * Anzeiger zuerst über den alten und den neuen Eintrag und zieht sich dann
 * mit einer Feder auf den neuen zusammen. Der Ruhezustand bleibt, wie er war:
 * Der Anzeiger liegt genau dort, wo bisher die Markierung des Eintrags lag.
 * Solange er da ist, blendet die Reihe diese Markierung aus (`index.css`,
 * `gleitet-strich` und `gleitet-pille`), sonst stünde sie doppelt da.
 *
 * Ohne Layout - in den Tests unter jsdom - misst er nichts und bleibt weg;
 * dann trägt der aktive Eintrag seine Markierung wie bisher. Bei reduzierter
 * Bewegung springt er ohne Dehnen, und die Regel in der Basis kürzt den
 * Übergang auf 0,01 ms.
 */

/** Lage und Größe des aktiven Eintrags in der Reihe, in Pixeln. */
export interface Kasten {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

/**
 * `sofort` ohne Übergang (erstes Zeichnen, geänderte Breiten), `dehnen` über
 * alten und neuen Eintrag, `gleiten` mit der Feder auf den neuen.
 */
export type Phase = 'sofort' | 'dehnen' | 'gleiten';

/** So lange liegt der Anzeiger über beiden Einträgen, bevor er sich zusammenzieht. */
const DEHNEN_MS = 120;

function aktiverEintrag(reihe: HTMLElement): HTMLElement | null {
  return reihe.querySelector<HTMLElement>('[aria-current="page"]');
}

/**
 * Der aktive Eintrag relativ zur Reihe - samt dem, was waagerecht schon
 * weggerollt ist, denn der Anzeiger rollt mit dem Inhalt der Reihe.
 */
function messen(reihe: HTMLElement): Kasten | null {
  const aktiv = aktiverEintrag(reihe);
  if (!aktiv) return null;
  const eintrag = aktiv.getBoundingClientRect();
  if (eintrag.width === 0 || eintrag.height === 0) return null;
  const rahmen = reihe.getBoundingClientRect();
  return {
    x: eintrag.left - rahmen.left - reihe.clientLeft + reihe.scrollLeft,
    y: eintrag.top - rahmen.top - reihe.clientTop + reihe.scrollTop,
    breite: eintrag.width,
    hoehe: eintrag.height,
  };
}

function gleich(a: Kasten | null, b: Kasten | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.breite - b.breite) < 0.5 &&
    Math.abs(a.hoehe - b.hoehe) < 0.5
  );
}

function bewegungReduziert(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Misst den aktiven Eintrag in `reihe`, sobald sich `schluessel` ändert (der
 * Pfad, der offene Reiter), und liefert Kasten und Phase des Anzeigers.
 * `kasten` ist `null`, solange nichts zu messen ist.
 */
export function useGleitanzeiger(
  reihe: RefObject<HTMLElement | null>,
  schluessel: unknown,
): { kasten: Kasten | null; phase: Phase } {
  const [stand, setStand] = useState<{ kasten: Kasten | null; phase: Phase }>({
    kasten: null,
    phase: 'sofort',
  });
  const ziel = useRef<Kasten | null>(null);
  /** Läuft gerade das Dehnen? Dann übernimmt dessen Ende die neue Messung. */
  const dehnt = useRef(false);

  // Vor dem Zeichnen, damit nichts springt: erst dehnen, dann gleiten. Ein
  // Wechsel in eine andere Zeile der umgebrochenen Reihe gleitet ohne Dehnen.
  useLayoutEffect(() => {
    const element = reihe.current;
    if (!element) return undefined;
    const vorher = ziel.current;
    const neu = messen(element);
    ziel.current = neu;
    if (
      !neu ||
      !vorher ||
      gleich(vorher, neu) ||
      Math.abs(vorher.y - neu.y) >= 0.5 ||
      bewegungReduziert()
    ) {
      setStand({ kasten: neu, phase: neu && vorher ? 'gleiten' : 'sofort' });
      return undefined;
    }
    const links = Math.min(vorher.x, neu.x);
    const rechts = Math.max(vorher.x + vorher.breite, neu.x + neu.breite);
    setStand({ kasten: { ...neu, x: links, breite: rechts - links }, phase: 'dehnen' });
    dehnt.current = true;
    // Zieht sich auf die letzte Messung zusammen - sie kann sich während des
    // Dehnens noch geändert haben.
    const uhr = window.setTimeout(() => {
      dehnt.current = false;
      setStand({ kasten: ziel.current, phase: 'gleiten' });
    }, DEHNEN_MS);
    return () => {
      dehnt.current = false;
      window.clearTimeout(uhr);
    };
  }, [reihe, schluessel]);

  // Ändern sich Breiten - die Schrift ist nachgeladen, das Gerät gedreht,
  // die Vorschauen aufgeklappt -, liegt der Anzeiger ohne Bewegung neu. Nur,
  // wenn es einen Anzeiger gibt: Ohne Layout bleibt die Markierung des
  // Eintrags, und es gibt nichts nachzumessen.
  //
  // Beobachtet wird jeder Eintrag, nicht nur der aktive: Wird ein Eintrag
  // davor breiter - die Schrift kommt nach dem ersten Zeichnen -, rückt der
  // aktive weiter, ohne selbst die Größe zu ändern (Bildstrecke 16.10.2026:
  // der Strich stand unter dem Nachbarn). Dazu einmal, wenn die Schrift
  // geladen ist. Während des Dehnens wird nur die Messung erneuert; das Ende
  // des Dehnens gleitet dann dorthin, statt dass der Anzeiger springt.
  useLayoutEffect(() => {
    const element = reihe.current;
    if (!element || !ziel.current || typeof ResizeObserver === 'undefined') return undefined;
    let laeuft = true;
    const neuLegen = () => {
      if (!laeuft) return;
      const neu = messen(element);
      if (gleich(neu, ziel.current)) return;
      ziel.current = neu;
      if (!dehnt.current) setStand({ kasten: neu, phase: 'sofort' });
    };
    const beobachter = new ResizeObserver(neuLegen);
    beobachter.observe(element);
    for (const eintrag of Array.from(element.children)) {
      if (!eintrag.hasAttribute('data-gleitanzeiger')) beobachter.observe(eintrag);
    }
    void document.fonts?.ready.then(neuLegen);
    return () => {
      laeuft = false;
      beobachter.disconnect();
    };
  }, [reihe, schluessel]);

  return stand;
}

/**
 * Der Stil des Anzeigers: `unten` ein Strich an der Unterkante des Eintrags
 * (SubNav), `oben` an der Oberkante (Tableiste), `flaeche` der ganze Eintrag
 * (Reiterleiste). `dicke` ist die Stärke des Strichs, gleich dem Rand, den
 * der Eintrag bisher trug.
 */
export function anzeigerStil(
  kasten: Kasten,
  art: 'unten' | 'oben' | 'flaeche',
  dicke = 2,
): CSSProperties {
  if (art === 'flaeche') {
    return {
      transform: `translate(${kasten.x}px, ${kasten.y}px)`,
      width: kasten.breite,
      height: kasten.hoehe,
    };
  }
  const y = art === 'unten' ? kasten.y + kasten.hoehe - dicke : kasten.y;
  return { transform: `translate(${kasten.x}px, ${y}px)`, width: kasten.breite, height: dicke };
}

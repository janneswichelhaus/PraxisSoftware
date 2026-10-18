import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Die Chatfläche (TEAM-002, ANN-648): ein Bereich mit fester Höhe vom oberen
 * Rand der Fläche bis zum unteren Rand des sichtbaren Bildschirms - über der
 * Tableiste, und **bei geöffneter Tastatur direkt über ihr**.
 *
 * Gemessen wird am sichtbaren Ausschnitt (`visualViewport`): Die Tastatur
 * verkleinert ihn, nicht das Layout - auf dem iPhone gar nicht, in Chrome für
 * Android seit Version 108 ebenso. Bis TEAM-001 klebte die Eingabe am Fuß des
 * Layouts und konnte hinter der Tastatur verschwinden. Die Tableiste liegt
 * dann ohnehin unter der Tastatur; gerechnet wird mit ihrer oberen Kante,
 * nicht mit einer Zahl.
 *
 * Kein Umbau des Rahmens und keine geänderte `viewport`-Angabe für die ganze
 * Anwendung: Die Fläche misst selbst und rechnet bei jeder Änderung neu
 * (Größe, Tastatur, Bildlauf des Ausschnitts).
 */

/** Darunter wird die Fläche nicht kleiner - eine Eingabe und zwei Zeilen. */
export const MINDESTHOEHE_PX = 240;

/** Die sichtbare Höhe der Fläche - rein, damit sie sich ohne Browser prüfen lässt. */
export function flaechenhoehe({
  oben,
  sichtbarUnten,
  tableisteOben,
}: {
  /** Oberkante der Fläche im Layout. */
  oben: number;
  /** Unterkante des sichtbaren Ausschnitts im Layout (über der Tastatur). */
  sichtbarUnten: number;
  /** Oberkante der Tableiste - `null`, wenn es keine gibt (ab 640 px). */
  tableisteOben: number | null;
}): number {
  const unten = tableisteOben === null ? sichtbarUnten : Math.min(sichtbarUnten, tableisteOben);
  return Math.max(MINDESTHOEHE_PX, Math.round(unten - oben));
}

function tableiste(): HTMLElement | null {
  const leiste = document.querySelector<HTMLElement>('[data-tableiste]');
  if (!leiste || leiste.getClientRects().length === 0) return null;
  return leiste;
}

export function useChatflaeche(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ausschnitt = window.visualViewport ?? null;

    function setzen() {
      if (!el) return;
      const sichtbarUnten = ausschnitt
        ? ausschnitt.offsetTop + ausschnitt.height
        : window.innerHeight;
      const leiste = tableiste();
      const hoehe = flaechenhoehe({
        oben: el.getBoundingClientRect().top,
        sichtbarUnten,
        tableisteOben: leiste ? leiste.getBoundingClientRect().top : null,
      });
      el.style.height = `${hoehe}px`;
    }

    setzen();
    ausschnitt?.addEventListener('resize', setzen);
    ausschnitt?.addEventListener('scroll', setzen);
    window.addEventListener('resize', setzen);
    // Ändert sich über der Fläche etwas (Verbindungshinweis, Suche in der
    // Kopfzeile), wandert ihre Oberkante.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(setzen);
    ro?.observe(document.body);
    return () => {
      ausschnitt?.removeEventListener('resize', setzen);
      ausschnitt?.removeEventListener('scroll', setzen);
      window.removeEventListener('resize', setzen);
      ro?.disconnect();
    };
  }, [ref]);
}

/**
 * Wie viele Spalten die Fläche trägt (TEAM-002, ANN-648), gemessen an ihrer
 * eigenen Breite wie der `Zweispalter` - die Seitenleiste ist je nach
 * Fenster 0, 84 oder 248 px breit:
 *
 * * unter 900 px eine Ansicht nach der anderen (DESIGN.md Regel 10: Tablet
 *   wie Telefon) - Liste, Gespräch, Thread;
 * * ab 900 px die Gespräche links und das Gespräch daneben, ein Thread an
 *   seiner Stelle;
 * * ab 1000 px dazu der Thread rechts neben dem Gespräch (wie Slack).
 */
export type Spalten = 1 | 2 | 3;

export const ZWEISPALTIG_PX = 900;
export const DREISPALTIG_PX = 1000;

export function spaltenFuer(breite: number): Spalten {
  if (breite >= DREISPALTIG_PX) return 3;
  if (breite >= ZWEISPALTIG_PX) return 2;
  return 1;
}

/** Vor dem ersten Messen: das Fenster ohne Seitenleiste (DS-001). */
function geschaetzt(): number {
  if (typeof window === 'undefined') return 0;
  const breite = window.innerWidth;
  return breite - (breite >= 1024 ? 248 : breite >= 640 ? 84 : 0);
}

export function useSpalten(ref: RefObject<HTMLElement | null>): Spalten {
  const [spalten, setSpalten] = useState<Spalten>(() => spaltenFuer(geschaetzt()));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const messen = () => {
      const breite = el.getBoundingClientRect().width;
      // Ohne Layout (Tests ohne Browser) bleibt es bei der Schätzung.
      if (breite > 0) setSpalten(spaltenFuer(breite));
    };
    messen();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return spalten;
}

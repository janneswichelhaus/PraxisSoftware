import { useEffect, useRef, type RefObject } from 'react';

/**
 * Zoomen mit zwei Fingern im Raster (BEF-038).
 *
 * Gemeint ist das **Raster**, nicht die Seite (Jannes, 2026-09-26): Zwei
 * Finger auseinander wirken wie `+`, zusammen wie `−` — dieselben Zoomstufen
 * wie die Knöpfe (CAL-011), also Stundenhöhe und sichtbares Praxisraster.
 *
 * **Warum Touch-Ereignisse und nicht Pointer Events wie beim Ziehen.** Das
 * Gitter erlaubt dem Browser mit `touch-action: pan-x pan-y` das Wischen, und
 * sobald er mit zwei Fingern einen Bildlauf beginnt, bricht er die
 * Zeigerverfolgung mit `pointercancel` ab. Nur ein nicht passiver
 * `touchmove` kann ihm die Geste abnehmen: Liegen zwei Finger auf dem Gitter,
 * wird sie verhindert — mit einem Finger bleibt alles, wie es war.
 *
 * **Das Ziehen darf dabei nicht brechen.** Der zweite Finger beendet eine
 * begonnene Geste des ersten (langer Druck, Aufziehen, Verschieben) über
 * `onZweiterFinger`, statt sie mit dem Zoom zu vermischen. Der Klick, den
 * manche Browser nach dem Loslassen noch schicken, wird unterdrückt.
 */

/** Um so viel muss sich der Fingerabstand ändern, bis eine Stufe wechselt. */
export const PINCH_SCHWELLE = 1.25;

/**
 * Eine Stufe hinauf (1), hinunter (−1) oder keine (0) für das Verhältnis des
 * aktuellen zum Ausgangsabstand der beiden Finger.
 */
export function pinchSchritt(verhaeltnis: number): 1 | -1 | 0 {
  if (!Number.isFinite(verhaeltnis) || verhaeltnis <= 0) return 0;
  if (verhaeltnis >= PINCH_SCHWELLE) return 1;
  if (verhaeltnis <= 1 / PINCH_SCHWELLE) return -1;
  return 0;
}

interface Optionen {
  /** Eine Zoomstufe weiter; die Seite hält die Stufen und ihre Grenzen. */
  onZoom?: ((richtung: 1 | -1) => void) | undefined;
  /** Der zweite Finger ist da: begonnene Gesten des ersten beenden. */
  onZweiterFinger: () => void;
}

function abstand(touches: TouchList): number {
  const a = touches[0]!;
  const b = touches[1]!;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function useZweiFingerZoom(
  ziel: RefObject<HTMLElement | null>,
  optionen: Optionen,
): { klickUnterdruecken: () => boolean } {
  const opt = useRef(optionen);
  opt.current = optionen;
  const gezoomt = useRef(false);

  useEffect(() => {
    const element = ziel.current;
    if (!element) return;
    /** Abstand, von dem aus die nächste Stufe gemessen wird. */
    let basis: number | null = null;

    function beginnen(event: TouchEvent) {
      // Ein neuer Finger nach einer beendeten Zoomgeste ist eine neue Geste:
      // Sein Klick zählt wieder.
      if (event.touches.length === 1 && basis === null) gezoomt.current = false;
      if (!opt.current.onZoom || event.touches.length !== 2) return;
      basis = abstand(event.touches);
      gezoomt.current = true;
      opt.current.onZweiterFinger();
      event.preventDefault();
    }

    function bewegen(event: TouchEvent) {
      if (basis === null || event.touches.length !== 2) return;
      // Die Geste gehört jetzt dem Raster: kein Bildlauf, kein Seitenzoom.
      event.preventDefault();
      const jetzt = abstand(event.touches);
      const schritt = pinchSchritt(jetzt / basis);
      if (schritt === 0) return;
      // Weitergemessen wird ab hier: Wer die Finger weiter spreizt,
      // kommt eine Stufe weiter, statt bei jeder Bewegung zu springen.
      basis = jetzt;
      opt.current.onZoom?.(schritt);
    }

    function enden(event: TouchEvent) {
      if (event.touches.length < 2) basis = null;
    }

    element.addEventListener('touchstart', beginnen, { passive: false });
    element.addEventListener('touchmove', bewegen, { passive: false });
    element.addEventListener('touchend', enden);
    element.addEventListener('touchcancel', enden);
    return () => {
      element.removeEventListener('touchstart', beginnen);
      element.removeEventListener('touchmove', bewegen);
      element.removeEventListener('touchend', enden);
      element.removeEventListener('touchcancel', enden);
    };
  }, [ziel]);

  return {
    klickUnterdruecken: () => {
      if (!gezoomt.current) return false;
      gezoomt.current = false;
      return true;
    },
  };
}

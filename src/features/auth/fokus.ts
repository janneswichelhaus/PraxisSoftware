import { useLayoutEffect, useRef } from 'react';

/**
 * Setzt den Fokus, wenn ein Zustand der Seite wechselt - nicht beim ersten
 * Zeichnen (AUTH-06).
 *
 * Auf den Seiten der Anmeldung verschwinden Knöpfe mit dem Zustand, den sie
 * auslösen: „Kennwort vergessen?" wird zum Formular, „Link anfordern" zur
 * Bestätigung, „Trotzdem fortfahren" zum Ladezustand. Der Fokus fiel dabei
 * jedes Mal auf den Seitenanfang, und das Neue wurde nicht angesagt. Wie in
 * der `Rueckfrage` geht er jetzt dorthin, wo es weitergeht: ins neue Feld,
 * auf die Bestätigung oder den Fehlerkasten (mit `tabIndex={-1}`).
 *
 * Beim ersten Zeichnen bleibt er, wo der Browser ihn setzt: Eine Seite, die
 * beim Laden den Fokus an sich zöge, überspränge ihre eigene Überschrift.
 */
export function useFokusNachWechsel(
  zustand: unknown,
  ziel: () => HTMLElement | null | undefined,
): void {
  const bisher = useRef(zustand);

  // Ohne Abhängigkeiten: `ziel` ist bei jedem Zeichnen eine neue Funktion.
  // Gehandelt wird nur, wenn sich der Zustand wirklich geändert hat.
  //
  // `useLayoutEffect`, nicht `useEffect`: Der Fokus sitzt damit im selben
  // Schritt wie die neue Anzeige. Mit `useEffect` lief er eine Aufgabe später -
  // dazwischen stand die Auskunft schon da, ohne Fokus; die CI hat genau das
  // einmal gesehen (KennwortNeuPage, Lauf 398 auf main).
  useLayoutEffect(() => {
    if (Object.is(bisher.current, zustand)) return;
    bisher.current = zustand;
    ziel()?.focus();
  });
}

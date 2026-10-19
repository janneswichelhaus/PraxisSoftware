/**
 * Ob Bewegung laufen darf: nicht bei reduzierter Bewegung. Ob der Browser die
 * Bewegung kann (View Transitions, `Element.animate`), prüft jede Stelle
 * selbst - in jsdom kann er es nicht, dort springt alles.
 */
export function bewegungErlaubt(): boolean {
  return !(
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Die Regel der Richtungen (ANN-663): **Waagerecht wechselt, was
 * gleichrangig ist** - die Arbeitsbereiche der Leiste, die Schritte eines
 * geführten Ablaufs. Was weiter rechts (in der Seitenleiste weiter unten)
 * steht oder als Nächstes kommt, schiebt sich von rechts herein; zurück von
 * links. **Senkrecht legt sich eine Ebene darüber** - ein Fenster kommt von
 * unten und geht nach unten wieder weg; darunter bleibt die Seite, wie sie
 * war.
 */
export type Richtung = 'vor' | 'zurueck';

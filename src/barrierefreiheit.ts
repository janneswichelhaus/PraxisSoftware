import axe, { type AxeResults, type Result } from 'axe-core';

/**
 * Automatische Barrierefreiheitsprüfung für Komponententests (UI-000).
 *
 * `axe-core` prüft, was sich maschinell prüfen lässt: fehlende Beschriftungen,
 * doppelte Kennungen, kaputte ARIA-Bezüge, Überschriften ohne Text,
 * Formularfelder ohne Label. Das ist erfahrungsgemäß ein Teil der
 * Barrierefreiheit, nicht ihre Gesamtheit — Tastaturreihenfolge, Fokusführung
 * und verständliche Sprache prüft es nicht. Sie stehen weiter in der
 * Oberflächen-Checkliste in `docs/abnahme/README.md` und in eigenen Tests.
 *
 * Läuft innerhalb von `pnpm test` und damit in der CI-Pipeline (ADR-013), ohne
 * dass dort etwas zu ändern wäre.
 *
 * **Kontrast wird hier nicht geprüft.** axe braucht dafür einen echten
 * Renderer; jsdom rechnet keine Farben aus und liefert deshalb keine oder
 * falsche Ergebnisse. Den Kontrast prüft stattdessen
 * `src/lib/kontrast.test.ts` direkt an den Tokens — genauer, weil dort die
 * ungünstigste Fläche zählt und nicht nur die zufällig gerenderte.
 */
const ABGESCHALTET = {
  // Braucht einen Renderer, siehe oben.
  'color-contrast': { enabled: false },
} as const;

function beschreibe(verstoss: Result): string {
  const stellen = verstoss.nodes
    .slice(0, 3)
    .map((knoten) => knoten.html)
    .join('\n    ');
  return `${verstoss.id} (${verstoss.impact ?? 'ohne Einstufung'}): ${verstoss.help}\n    ${stellen}\n    ${verstoss.helpUrl}`;
}

/**
 * Prüft einen gerenderten Ausschnitt und wirft mit lesbarem Bericht.
 *
 * Bewusst kein eigener Matcher: ein `expect`-Aufruf im Test bleibt
 * durchschaubarer als eine erweiterte Zusicherung, deren Herkunft man erst
 * suchen muss.
 */
export async function pruefeBarrierefreiheit(element: Element): Promise<void> {
  const ergebnis: AxeResults = await axe.run(element, {
    rules: ABGESCHALTET,
    // Nur die Regeln, die einer anerkannten Anforderung entsprechen. Die
    // "best-practice"-Regeln sind Empfehlungen und würden die Zusicherung
    // unscharf machen.
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  });

  if (ergebnis.violations.length > 0) {
    throw new Error(
      `axe fand ${ergebnis.violations.length} Verstoß/Verstöße:\n\n` +
        ergebnis.violations.map(beschreibe).join('\n\n'),
    );
  }
}

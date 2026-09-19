import { Badge } from '@/components/ui/Badge';

/**
 * Das Zeichen für einen geplanten, aber ungedeckten Termin (CAL-022).
 *
 * Über das Kontingent einer Behandlungsgrundlage hinaus zu planen ist
 * ausdrücklich zulässig — so entstehen Dauertermine über das Verordnungsende
 * hinaus. Still bleiben darf es nicht: Ein Termin, den seine Grundlage nicht
 * mehr trägt, darf keine Leistung gegen sie erzeugen (§19, ADR-009), und eine
 * unbemerkte Überplanung ist genau der Abrechnungsfehler, den §13
 * ausschließt.
 *
 * Es warnt, es verbietet nicht: Ton `warnung` trägt das Zeichen „!", der Text
 * daneben sagt dasselbe ohne Farbe (WCAG 1.4.1).
 *
 * `gedeckt` kommt so aus der Datenbank, wie sie es meint:
 *
 *   * `true` — die Grundlage trägt den Termin. Kein Zeichen; ein „gedeckt" an
 *     jedem gewöhnlichen Termin wäre Rauschen.
 *   * `false` — geplant, ohne Deckung. Das Zeichen.
 *   * `null` — keine Aussage: kein Bezug zu einer Grundlage, oder der Termin
 *     ist abgesagt und verbraucht nichts mehr.
 */
export function Deckungszeichen({ gedeckt }: { gedeckt: boolean | null | undefined }) {
  if (gedeckt !== false) return null;

  return (
    <span data-testid="deckungszeichen" className="inline-flex shrink-0">
      <Badge ton="warnung">Ohne Deckung</Badge>
    </span>
  );
}

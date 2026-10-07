import type { ReactNode } from 'react';

/**
 * Kleingedrucktes am Seitenende: was gespeichert wird, wo, was protokolliert
 * wird (BEF-068 Option 2, Variante K-A; Handoff Schrift und Knöpfe
 * 2026-10-06, Abschnitt 3).
 *
 * 14 px in Leise (`text-kleingedruckt`), so groß wie der Hinweis am Feld - bis
 * Runde 2 standen rund 30 Stellen mit derselben Kette in 12 px. Die Größe ist
 * jetzt eine Zeile im Token. Den Abstand nach oben setzt die Seite
 * (`className`), weil die Stellen verschieden weit vom Inhalt stehen.
 */
export function Kleingedrucktes({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  /** Für `aria-describedby`, wenn ein Knopf auf den Satz verweist. */
  id?: string;
}) {
  return (
    <p
      id={id}
      className={`text-ink-muted text-kleingedruckt max-w-prose leading-relaxed ${className}`.trim()}
    >
      {children}
    </p>
  );
}

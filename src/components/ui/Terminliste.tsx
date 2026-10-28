import type { ReactNode } from 'react';

/**
 * Eine Liste der Termine mit Rahmen und Trennern ab der zweiten Zeile; die Zeilen (Termin, Wunsch,
 * Fragen, Tage) bringen Ziel und Maße selbst mit. `name` benennt die Liste für Vorlesesoftware.
 */
export function Terminliste({ children, name }: { children: ReactNode; name?: string }) {
  return (
    <ul
      aria-label={name}
      className="border-line bg-surface rounded-card [&>li+li]:border-line overflow-hidden border [&>li+li]:border-t"
    >
      {children}
    </ul>
  );
}

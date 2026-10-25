import type { ReactNode } from 'react';

/**
 * Eine Liste der Termine mit Rahmen (Handoff 2026-10-24 „Termine“,
 * Abschnitt 3): Linie `line`, `rounded-card`, Trenner ab der zweiten Zeile.
 * Darin stehen Terminzeilen, Wunschzeilen, die Fragen zu einem Termin und
 * die Tage von „Diese Woche“ - die Zeilen bringen ihr Ziel und ihre Maße
 * selbst mit. `name` gibt der Liste einen Namen für Vorlesesoftware.
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

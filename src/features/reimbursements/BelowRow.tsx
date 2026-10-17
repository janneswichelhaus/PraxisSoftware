import type { ReactNode } from 'react';

/**
 * Knöpfe unter einer Zeile in voller Breite, rechts: In der Zeile bräche eine
 * Rückfrage bei 375 px (Design-Review Überholung 7).
 */
export function BelowRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-x-3 pb-2">{children}</div>;
}

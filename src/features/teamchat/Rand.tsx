import type { ReactNode } from 'react';

/**
 * Der Rand einer Ansicht in der Chatfläche (TEAM-002): Die Fläche selbst hat
 * keinen Innenabstand, damit Verlauf und Eingabe bis an die Kanten reichen;
 * Listen, Laden und Fehler stehen mit dem Rand der übrigen Seiten.
 */
export function Rand({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6 sm:px-6">
      {children}
    </div>
  );
}

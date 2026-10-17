import type { ReactNode } from 'react';

/**
 * Ein Verlauf: Beiträge in zeitlicher Folge, eine Linie dazwischen statt
 * einer Karte je Beitrag (DESIGN.md Regel 2). Für Gespräche, in denen jeder
 * Beitrag eigene Handlungen trägt und deshalb nicht als Ganzes ein Ziel ist
 * wie eine `ListRow` - der Verlauf einer Rückfrage (KOM-002) und die
 * Nachrichten im Teamchat (TEAM-001).
 */
export function Verlauf({ beschriftung, children }: { beschriftung: string; children: ReactNode }) {
  return (
    <ol aria-label={beschriftung} className="flex flex-col">
      {children}
    </ol>
  );
}

/** Ein Beitrag im Verlauf; `hervorgehoben` für eine Stelle aus der Suche. */
export function Verlaufseintrag({
  id,
  hervorgehoben = false,
  children,
}: {
  id?: string;
  hervorgehoben?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      id={id}
      className={`border-line border-t py-3 first:border-t-0 ${
        hervorgehoben ? 'bg-accent-soft -mx-4 px-4' : ''
      }`.trim()}
    >
      {children}
    </li>
  );
}

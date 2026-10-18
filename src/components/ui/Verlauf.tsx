import type { ReactNode, Ref } from 'react';

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

/**
 * Ein Beitrag im Verlauf; `hervorgehoben` für eine Stelle aus der Suche.
 *
 * Seit TEAM-002 auch für einen langen Verlauf, der selbst rollt: `kennung`
 * steht als `data-nachricht` im Dokument (Sprungziel, gemerkter Scrollstand),
 * `ref` meldet den Beitrag dem Lesestand, und `fortsetzung` hängt einen
 * Beitrag derselben Person ohne Linie an den vorigen (wie Slack).
 */
export function Verlaufseintrag({
  id,
  kennung,
  ref,
  hervorgehoben = false,
  fortsetzung = false,
  children,
}: {
  id?: string;
  kennung?: string;
  ref?: Ref<HTMLLIElement>;
  hervorgehoben?: boolean;
  fortsetzung?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      id={id}
      ref={ref}
      data-nachricht={kennung}
      className={`border-line first:border-t-0 ${fortsetzung ? 'pt-1 pb-3' : 'border-t py-3'} ${
        hervorgehoben ? 'bg-accent-soft -mx-4 px-4' : ''
      }`.trim()}
    >
      {children}
    </li>
  );
}

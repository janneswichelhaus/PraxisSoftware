import type { ReactNode } from 'react';
import { KnopfGroesse } from './knopfGroesse';

/**
 * Kopf einer Spalte neben der Hauptspalte - der Thread neben dem Gespräch im
 * Teamchat (TEAM-002, wie die Threadspalte bei Slack).
 *
 * Wie `PageHeader kompakt`, aber als **h2**: Die Seite hat ihre Überschrift
 * schon in der Hauptspalte, eine zweite h1 daneben verwirrte Vorlesesoftware.
 * Titel in `--type-h4`, darunter eine Zeile, rechts die Aktionen (ohne
 * Angabe kompakt, ANN-403), unten eine Linie zum Inhalt der Spalte.
 */
export function Spaltenkopf({
  titel,
  beschreibung,
  aktionen,
}: {
  titel: ReactNode;
  /** Eine Zeile unter dem Titel; was länger ist, wird gekürzt. */
  beschreibung?: ReactNode;
  /** Höchstens zwei - meist „Schließen“. */
  aktionen?: ReactNode;
}) {
  return (
    <header className="border-line bg-surface flex shrink-0 items-center gap-2 border-b px-4 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="text-ink text-h4 truncate font-bold">{titel}</h2>
        {beschreibung ? (
          <div className="text-ink-muted truncate text-sm">{beschreibung}</div>
        ) : null}
      </div>
      {aktionen ? (
        <div className="flex shrink-0 items-center gap-1">
          <KnopfGroesse value="kompakt">{aktionen}</KnopfGroesse>
        </div>
      ) : null}
    </header>
  );
}

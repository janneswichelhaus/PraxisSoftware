import type { ReactNode } from 'react';
import { Terminsymbol, type Artzeichen } from './Terminsymbole';
import { titelklassen } from './titelstufe';

/**
 * Der Kopf der Seite eines Termins (Handoff 2026-10-24 „Termine“,
 * Abschnitt 3, „Kopf der Seite des Termins“; Schritt 3c): die Art mit
 * Zeichen und Wort in Leise, der Tag als Seitentitel („Mittwoch, 28.
 * Oktober“, „Heute, 24. Oktober“), darunter die Zeit in der Stufe des
 * Abschnitts und das Statuszeichen, wenn es eines gibt. Der Titel steht in
 * der Stufe des Seitentitels der Plattform, am Rechner 32 (`titelstufe.ts`).
 */
export function Terminkopf({
  zeichen,
  art,
  titel,
  zeit,
  zustand,
}: {
  zeichen: Artzeichen;
  /** Die Art in Worten: „Hausbesuch“, „In der Praxis“, „Videotermin“, „Training“. */
  art: string;
  titel: string;
  /** „9:30 bis 10:30“. */
  zeit: string;
  zustand?: ReactNode;
}) {
  return (
    <header className="flex flex-col items-start gap-1.5 hyphens-manual">
      <p className="text-ink-muted flex items-center gap-2 font-semibold">
        <Terminsymbol zeichen={zeichen} />
        {art}
      </p>
      <h1 className={titelklassen('seite', titel)}>{titel}</h1>
      <p className="text-abschnitt text-ink">{zeit}</p>
      {zustand ? <span className="mt-1 max-w-full">{zustand}</span> : null}
    </header>
  );
}

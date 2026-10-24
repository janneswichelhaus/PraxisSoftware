import type { ReactNode } from 'react';
import { HakenSymbol } from './HakenSymbol';

/**
 * Die Liste der Übungen eines Plans auf der Plattform (Handoff 2026-10-24,
 * Abschnitt 3, „Übungszeile“): mit Rahmen und Trennern wie `ListRows`, die
 * Zeilen ohne Außenabstand.
 */
export function Uebungsliste({
  beschriftung,
  children,
}: {
  /** Name der Liste für Vorlesesoftware, etwa „Die Übungen“. */
  beschriftung?: string;
  children: ReactNode;
}) {
  return (
    <ul
      aria-label={beschriftung}
      className="rounded-card border-line bg-surface overflow-hidden border"
    >
      {children}
    </ul>
  );
}

/**
 * Eine Übung eines Plans als Zeile (Muster `ListRow`): vorn die Nummer im
 * Kreis, dann Name und Dosierung kurz, hinten der Pfeil. Die ganze Zeile
 * öffnet „Übung zum Nachlesen“ und ist mindestens 80 hoch.
 *
 * `erledigt`: Alle Durchgänge der Übung sind in der heutigen Einheit gehakt -
 * der Kreis gefüllt mit Haken, darunter „Heute erledigt“ als Wort; Farbe
 * trägt nie allein. `beendet` (Lesefrist): der Kreis vertieft statt grün.
 *
 * Bei „Sehr groß“ fällt der Pfeil weg und der Kreis wächst auf 50; unter
 * 23rem (200 %) steht die Nummer über dem Text, innen 12, ohne Pfeil - wie
 * die `Aufgabenkarte`. Der Name trennt nur dort an der Silbe
 * (`trennen-schmal`, ANN-707).
 */
export function Uebungszeile({
  nummer,
  titel,
  dosierung,
  erledigt = false,
  beendet = false,
  onClick,
}: {
  nummer: number;
  titel: string;
  /** „3 Durchgänge · je 8 bis 12 Wiederholungen“. */
  dosierung: string;
  erledigt?: boolean;
  beendet?: boolean;
  onClick: () => void;
}) {
  const kreis = erledigt
    ? 'bg-accent text-surface'
    : beendet
      ? 'bg-surface-sunken text-ink'
      : 'bg-accent-soft text-accent';
  return (
    <li className="border-line not-first:border-t">
      <button
        type="button"
        onClick={onClick}
        className="text-ink hover:bg-surface-sunken active:bg-surface-sunken ease-druck flex min-h-20 w-full items-center gap-4 px-4 py-3.5 text-left transition-[background-color,scale] duration-120 focus-visible:-outline-offset-2 motion-safe:active:scale-98 max-[23rem]:flex-col max-[23rem]:items-start max-[23rem]:gap-2 max-[23rem]:p-3"
      >
        <span
          aria-hidden="true"
          className={`rounded-pill flex size-10 shrink-0 items-center justify-center font-bold tabular-nums [[data-schrift=sehr-gross]_&]:size-12.5 ${kreis}`}
        >
          {erledigt ? <HakenSymbol className="size-5" /> : nummer}
        </span>
        <span className="flex min-w-0 grow flex-col">
          {/* Die Nummer liest Vorlesesoftware mit, der Kreis ist ausgeblendet. */}
          <span className="trennen-schmal font-semibold">
            <span className="sr-only">{nummer}.</span> {titel}
          </span>{' '}
          <span className="text-ink-muted">{dosierung}</span>
          {erledigt ? (
            <>
              {' '}
              <span className="text-accent font-semibold">Heute erledigt</span>
            </>
          ) : null}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          data-pfeil=""
          className="text-ink-muted size-6 shrink-0 max-[23rem]:hidden [[data-schrift=sehr-gross]_&]:hidden"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </li>
  );
}

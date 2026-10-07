import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Die Liste um die Zeilen (Design-Handoff 2026-10-01, Abschnitt 3).
 *
 * Mit `rahmen` (der Regelfall) eine weiße Karte mit Linie; die Zeilen tragen
 * keinen Außenabstand, die Trenner stehen eingerückt. Ohne `rahmen` für eine
 * Liste, die schon in einer Karte mit 16 px Innenabstand steht - etwa in
 * einem `Disclosure` mit `inKarte`.
 */
export function ListRows({
  children,
  rahmen = true,
  className = '',
}: {
  children: ReactNode;
  rahmen?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={`${rahmen ? 'rounded-card border-line bg-surface overflow-hidden border px-4' : ''} ${className}`.trim()}
    >
      {children}
    </ul>
  );
}

/**
 * Eine Zeile: Zeit, Titel mit Nebenzeile, Status (Design-Handoff 2026-10-01,
 * Abschnitt 3). Ersetzt Listen mit bis zu vier Spalten; wo verglichen oder
 * bearbeitet wird (Leistungen, Rechnungen, Katalog, Mitarbeitende), bleibt die
 * Tabelle.
 *
 * **Die ganze Zeile ist das Ziel:** mit `to` ein Link, mit `onClick` ein
 * Knopf, sonst ein schlichter Kasten. 56 px hoch und damit ein Tippziel
 * (WCAG 2.5.8); das Überfahren vertieft die Zeile über die ganze Breite der
 * Karte - deshalb ragt ein Ziel um die 16 px Innenabstand der Karte hinaus,
 * und der Fokusrahmen liegt innen, damit die Karte ihn nicht abschneidet.
 *
 * `gedaempft` für Erledigtes: Zeit und Titel in `ink-muted`, der Titel in 500.
 * `dicht` für schmale Spalten wie den Tagesplan des Teams: 48 px, kleinere
 * Schrift, lange Namen werden gekürzt.
 */
export function ListRow({
  zeit,
  titel,
  meta,
  status,
  to,
  onClick,
  gedaempft = false,
  dicht = false,
}: {
  /** Uhrzeit oder zwei Zeilen (Datum über Uhrzeit). */
  zeit: ReactNode;
  titel: ReactNode;
  /** Nebenzeile unter dem Titel. */
  meta?: ReactNode;
  /** `Badge` oder `StatusMark`, rechts. */
  status?: ReactNode;
  to?: string;
  onClick?: () => void;
  gedaempft?: boolean;
  dicht?: boolean;
}) {
  // `listenzeile`: Haken für die Plattform, die die Zeile bei sehr wenig
  // Breite untereinander stellt (POR-020, `src/index.css`).
  const raster = `listenzeile grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-left ${
    dicht ? 'min-h-12 py-1.5' : 'min-h-14 py-2'
  }`;
  // Ein Ziel reicht über den Innenabstand der Karte hinaus; `w-[calc(…)]`
  // braucht der Knopf, der sonst nur so breit würde wie sein Inhalt.
  const ziel = `${raster} hover:bg-surface-sunken -mx-4 w-[calc(100%+2rem)] px-4 transition-colors duration-120 focus-visible:-outline-offset-2`;

  const inhalt = (
    <>
      <span
        className={`font-semibold tabular-nums ${dicht ? 'text-sm' : 'text-liste'} ${
          gedaempft ? 'text-ink-muted' : 'text-ink'
        }`}
      >
        {zeit}
      </span>
      <span className="min-w-0">
        <span
          className={`block ${dicht ? 'text-liste truncate' : 'text-base'} ${
            gedaempft ? 'text-ink-muted font-medium' : 'text-ink font-semibold'
          }`}
        >
          {titel}
        </span>
        {meta ? (
          <span className={`text-ink-muted block text-sm ${dicht ? 'truncate' : ''}`.trim()}>
            {meta}
          </span>
        ) : null}
      </span>
      {status ? <span className="shrink-0">{status}</span> : null}
    </>
  );

  return (
    <li className="border-line border-t first:border-t-0">
      {to ? (
        <Link to={to} className={ziel}>
          {inhalt}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={ziel}>
          {inhalt}
        </button>
      ) : (
        <div className={raster}>{inhalt}</div>
      )}
    </li>
  );
}

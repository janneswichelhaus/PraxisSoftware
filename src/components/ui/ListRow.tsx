import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { KnopfGroesse } from './knopfGroesse';

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
  beschriftung,
  className = '',
}: {
  children: ReactNode;
  rahmen?: boolean;
  /** Name der Liste für Vorlesesoftware, wenn mehrere Listen auf der Seite stehen. */
  beschriftung?: string;
  className?: string;
}) {
  return (
    <ul
      aria-label={beschriftung}
      className={`${rahmen ? 'rounded-card border-line bg-surface overflow-hidden border px-4' : ''} ${className}`.trim()}
    >
      {children}
    </ul>
  );
}

/**
 * Eine Zeile: Zeit, Titel mit Nebenzeile, Status (Design-Handoff 2026-10-01,
 * Abschnitt 3). Ersetzt Listen mit bis zu vier Spalten; wo verglichen oder
 * bearbeitet wird (Leistungen, Rechnungen, Katalog, Mitarbeitende), steht die
 * `Datenliste`.
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
 *
 * Seit dem Design-Fundament (DESIGN.md „Listen“) drei Plätze mehr:
 *
 *   * `bild` vorn, 56 × 56 px - ein `Medienbild` mit `vorschau`, etwa die
 *     Zeichnung einer Übung;
 *   * `betrag` rechts, tabellarisch und rechtsbündig, über dem Status;
 *   * `aktion` **neben** dem Ziel, nicht darin (Leitfaden L3: die Arbeit an
 *     jeder Zeile) - ein kompakter Knopf oder `Symbolknopf`. Ein Knopf in
 *     einem Link wäre ein Ziel im Ziel; deshalb endet das Ziel vor der
 *     Aktion, und nur es vertieft sich beim Überfahren. Knöpfe dort sind ohne
 *     Angabe kompakt.
 */
export function ListRow({
  zeit,
  bild,
  titel,
  meta,
  status,
  betrag,
  aktion,
  darunter,
  to,
  onClick,
  gedaempft = false,
  dicht = false,
}: {
  /**
   * Uhrzeit oder zwei Zeilen (Datum über Uhrzeit). Ohne Angabe entfällt die
   * Spalte - für Listen ohne Zeitbezug wie die Übungsbibliothek (UEB-001).
   */
  zeit?: ReactNode;
  /** Vorschaubild vorn, 56 × 56 px (`Medienbild vorschau`). */
  bild?: ReactNode;
  titel: ReactNode;
  /** Nebenzeile unter dem Titel. */
  meta?: ReactNode;
  /** `Badge` oder `StatusMark`, rechts. */
  status?: ReactNode;
  /** Geldbetrag oder Zahl rechts, tabellarisch (`formatEuro`). */
  betrag?: ReactNode;
  /** Knopf neben dem Ziel - nicht im Ziel. */
  aktion?: ReactNode;
  /**
   * Unter der Zeile, über die volle Breite: ein Knopf, der ein Feld aufklappt,
   * das neben dem Ziel keinen Platz hätte - etwa „Ausfall“ mit seinem
   * Protokoll (B12). Ohne Angabe bleibt die Zeile, wie sie ist.
   */
  darunter?: ReactNode;
  to?: string;
  onClick?: () => void;
  gedaempft?: boolean;
  dicht?: boolean;
}) {
  // `listenzeile`: Haken für die Plattform, die die Zeile bei sehr wenig
  // Breite untereinander stellt (POR-020, `src/index.css`).
  const vorne = (zeit === undefined ? 0 : 1) + (bild === undefined ? 0 : 1);
  const spalten =
    vorne === 0
      ? 'grid-cols-[minmax(0,1fr)_auto]'
      : vorne === 1
        ? 'grid-cols-[auto_minmax(0,1fr)_auto]'
        : 'grid-cols-[auto_auto_minmax(0,1fr)_auto]';
  const raster = `listenzeile grid ${spalten} items-center gap-3 text-left ${
    dicht ? 'min-h-12 py-1.5' : 'min-h-14 py-2'
  }`;
  // Ein Ziel reicht über den Innenabstand der Karte hinaus; `w-[calc(…)]`
  // braucht der Knopf, der sonst nur so breit würde wie sein Inhalt. Mit
  // Aktion reicht es nur links hinaus und endet vor ihr.
  const ziel = aktion
    ? `${raster} hover:bg-surface-sunken -ml-4 min-w-0 flex-1 pr-2 pl-4 transition-colors duration-120 focus-visible:-outline-offset-2`
    : `${raster} hover:bg-surface-sunken -mx-4 w-[calc(100%+2rem)] px-4 transition-colors duration-120 focus-visible:-outline-offset-2`;

  const hinten =
    betrag !== undefined ? (
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`text-liste font-semibold tabular-nums ${gedaempft ? 'text-ink-muted' : 'text-ink'}`}
        >
          {betrag}
        </span>
        {status}
      </span>
    ) : status ? (
      <span className="shrink-0">{status}</span>
    ) : null;

  const inhalt = (
    <>
      {bild === undefined ? null : <span className="block size-14 shrink-0">{bild}</span>}
      {zeit === undefined ? null : (
        <span
          className={`font-semibold tabular-nums ${dicht ? 'text-sm' : 'text-liste'} ${
            gedaempft ? 'text-ink-muted' : 'text-ink'
          }`}
        >
          {zeit}
        </span>
      )}
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
      {hinten}
    </>
  );

  const zeile = to ? (
    <Link to={to} className={ziel}>
      {inhalt}
    </Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} className={ziel}>
      {inhalt}
    </button>
  ) : (
    <div className={aktion ? `${raster} min-w-0 flex-1` : raster}>{inhalt}</div>
  );

  if (!aktion) {
    return (
      <li className="border-line border-t first:border-t-0">
        {zeile}
        {darunter}
      </li>
    );
  }
  const mitAktion = (
    <>
      {zeile}
      <div className="flex shrink-0 items-center gap-2">
        <KnopfGroesse value="kompakt">{aktion}</KnopfGroesse>
      </div>
    </>
  );
  if (darunter === undefined || darunter === null) {
    return (
      <li className="border-line flex items-center gap-2 border-t first:border-t-0">{mitAktion}</li>
    );
  }
  return (
    <li className="border-line border-t first:border-t-0">
      <div className="flex items-center gap-2">{mitAktion}</div>
      {darunter}
    </li>
  );
}

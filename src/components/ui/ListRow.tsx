import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate, useResolvedPath } from 'react-router-dom';
import { KnopfGroesse } from './knopfGroesse';
import { zeileOeffnen } from './seitenUebergang';

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
 * In einer Navigationsliste - den Gesprächen des Teamchats - trägt die Zeile
 * des offenen Ziels `aktiv`: `aria-current="page"` und die Fläche der
 * Auswahl. `uebergang={false}` lässt dort den Übergang „Zeile öffnet sich zur
 * Seite“ weg, wo die Liste neben dem Ziel stehen bleibt (TEAM-002).
 *
 * Seit dem Design-Fundament (DESIGN.md „Listen“) drei Plätze mehr:
 *
 *   * `bild` vorn - ein `Medienbild` mit `vorschau` (56 × 56 px), etwa die
 *     Zeichnung einer Übung, oder ein `Personenbild` (TEAM-006); die Größe
 *     bringt das Bild mit;
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
  aktiv,
  uebergang = true,
  fokusbeginn = false,
}: {
  /**
   * Uhrzeit oder zwei Zeilen (Datum über Uhrzeit). Ohne Angabe entfällt die
   * Spalte - für Listen ohne Zeitbezug wie die Übungsbibliothek (UEB-001).
   */
  zeit?: ReactNode;
  /** Bild vorn: `Medienbild vorschau` (56 × 56 px) oder `Personenbild`. */
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
  /** Das offene Ziel einer Navigationsliste (`aria-current="page"`). */
  aktiv?: boolean;
  /** Mit `to`: der Übergang zur neuen Seite (Vorgabe) oder ein schlichter Link. */
  uebergang?: boolean;
  /**
   * Hier beginnt der Fokus eines Fensters (`data-autofocus`, BEF-175): am
   * Ziel der Zeile, ohne Ziel an der Zeile selbst.
   */
  fokusbeginn?: boolean;
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
  const auswahl = 'aria-[current=page]:bg-accent-soft';
  // Druck auf der Plattform (DR-117): Die Zeile gibt beim Antippen nach -
  // vertiefte Fläche und 98 % in 120 ms, bei „Bewegung reduzieren“ nur die
  // Fläche. Die Praxis-App bleibt, wie sie ist.
  const druck =
    '[.plattform-schrift_&]:active:bg-surface-sunken motion-safe:[.plattform-schrift_&]:active:scale-98 [.plattform-schrift_&]:transition-[color,background-color,scale] [.plattform-schrift_&]:ease-druck';
  const ziel = aktion
    ? `${raster} hover:bg-surface-sunken ${auswahl} ${druck} -ml-4 min-w-0 flex-1 pr-2 pl-4 transition-colors duration-120 focus-visible:-outline-offset-2`
    : `${raster} hover:bg-surface-sunken ${auswahl} ${druck} -mx-4 w-[calc(100%+2rem)] px-4 transition-colors duration-120 focus-visible:-outline-offset-2`;

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
      {bild === undefined ? null : <span className="flex shrink-0 items-center">{bild}</span>}
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

  const fokus = fokusbeginn ? { 'data-autofocus': true } : {};
  const zeile = to ? (
    uebergang ? (
      <Zeilenlink to={to} className={ziel} aktiv={aktiv} fokusbeginn={fokusbeginn}>
        {inhalt}
      </Zeilenlink>
    ) : (
      <Link to={to} className={ziel} aria-current={aktiv ? 'page' : undefined} {...fokus}>
        {inhalt}
      </Link>
    )
  ) : onClick ? (
    <button type="button" onClick={onClick} className={ziel} {...fokus}>
      {inhalt}
    </button>
  ) : (
    <div
      className={`${aktion ? `${raster} min-w-0 flex-1` : raster} ${fokusbeginn ? 'focus:outline-none' : ''}`.trim()}
      {...(fokusbeginn ? { ...fokus, tabIndex: -1 } : {})}
    >
      {inhalt}
    </div>
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

/**
 * Das Ziel einer Zeile mit `to`: ein Link, der beim Tipp in die neue Seite
 * hineinwächst (ANN-567, „Zeile öffnet sich zur Seite“, `seitenUebergang.ts`).
 * Wo der Übergang nicht läuft - auch, wenn die Zeile auf derselben Seite
 * bleibt -, navigiert der Link wie bisher. Eigene Komponente, damit die
 * Router-Hooks nur dort stehen, wo es einen Router gibt - eine Zeile ohne Ziel
 * braucht keinen.
 */
function Zeilenlink({
  to,
  className,
  aktiv,
  fokusbeginn,
  children,
}: {
  to: string;
  className: string;
  aktiv?: boolean | undefined;
  fokusbeginn: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ziel = useResolvedPath(to);
  return (
    <Link
      to={to}
      onClick={(event) => zeileOeffnen(event, () => void navigate(to), ziel.pathname === pathname)}
      className={className}
      aria-current={aktiv ? 'page' : undefined}
      {...(fokusbeginn ? { 'data-autofocus': true } : {})}
    >
      {children}
    </Link>
  );
}

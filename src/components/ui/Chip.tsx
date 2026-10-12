import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Grundform eines Chips: Pille, 44 px hoch, Rand `line-strong`, 14 px in 600,
 * bricht nicht um. Wie die Monats-Chips der Doku (Akte entschlacken,
 * 2026-10-03), aus denen der Baustein stammt.
 */
const basis =
  'rounded-pill inline-flex min-h-11 shrink-0 items-center gap-1.5 border px-4 text-sm font-semibold whitespace-nowrap transition-colors';
const frei = 'border-line-strong text-ink hover:bg-accent-soft';
const gewaehlteForm = 'border-accent bg-accent-soft text-accent';

type Gemeinsam = {
  children: ReactNode;
  className?: string;
};

/**
 * Ein Chip: ein kurzes Ziel oder eine Wahl in einer Reihe (Design-Fundament,
 * DESIGN.md „Umschalter“).
 *
 *   * mit `to` ein Link in der Anwendung, mit `href` ein Sprung auf der Seite
 *     (die Monate der Doku: „#monat-2026-09“);
 *   * mit `onClick` ein Knopf; mit `gewaehlt` ein Schalter (`aria-pressed`) -
 *     gewählt liegt er auf der Akzentfläche in der Hauptfarbe.
 *
 * Ein Chip ist leiser als ein Knopf: Er wählt, filtert oder springt, er löst
 * keinen Vorgang aus. Mehrere Chips zum Filtern stehen in `Filterchips`.
 */
export function Chip(
  props: Gemeinsam &
    (
      | { to: string }
      | { href: string }
      | { onClick: () => void; gewaehlt?: boolean; disabled?: boolean }
    ),
) {
  const { children, className = '' } = props;
  if ('to' in props) {
    return (
      <Link to={props.to} className={`${basis} ${frei} ${className}`.trim()}>
        {children}
      </Link>
    );
  }
  if ('href' in props) {
    return (
      <a href={props.href} className={`${basis} ${frei} ${className}`.trim()}>
        {children}
      </a>
    );
  }
  const gewaehlt = props.gewaehlt;
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      {...(gewaehlt === undefined ? {} : { 'aria-pressed': gewaehlt })}
      className={`${basis} ${gewaehlt ? gewaehlteForm : frei} disabled:text-ink-muted disabled:cursor-not-allowed disabled:border-dashed ${className}`.trim()}
    >
      {gewaehlt ? (
        <span aria-hidden="true" className="-ml-1">
          ✓
        </span>
      ) : null}
      {children}
    </button>
  );
}

export interface Chipwahl<W extends string> {
  wert: W;
  text: string;
}

/**
 * Filter als Chips: eine beschriftete Reihe von Schaltern, keiner, einer oder
 * mehrere gewählt (DESIGN.md „Umschalter“, ANN-407). Für Filter mit vielen
 * Werten, die man sehen soll - Körperregion, Kategorie, Ausrüstung in der
 * Übungsbibliothek. Für zwei bis vier Ansichten, von denen genau eine gilt,
 * ist das `Segment` da.
 *
 * Gewählt trägt ein Chip vorn ein Häkchen (Farbe trägt nie allein). Am
 * Telefon läuft die Reihe waagerecht, statt in drei Zeilen umzubrechen; ab
 * 640 px bricht sie um. `mehrfach={false}`: Ein Tipp wählt nur diesen Wert,
 * ein zweiter hebt ihn auf.
 */
export function Filterchips<W extends string>({
  beschriftung,
  wahlen,
  gewaehlt,
  onAendern,
  mehrfach = true,
}: {
  beschriftung: string;
  wahlen: readonly Chipwahl<W>[];
  gewaehlt: readonly W[];
  onAendern: (gewaehlt: W[]) => void;
  mehrfach?: boolean;
}) {
  const id = useId();
  function umschalten(wert: W) {
    const an = gewaehlt.includes(wert);
    if (mehrfach) {
      onAendern(an ? gewaehlt.filter((w) => w !== wert) : [...gewaehlt, wert]);
    } else {
      onAendern(an ? [] : [wert]);
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {/* Beschriftung wie an einem Feld (14 px in 500), damit die Reihe in
          einer Filterleiste neben Auswahllisten gleich aussieht. */}
      <p id={id} className="text-ink text-sm font-medium">
        {beschriftung}
      </p>
      <div
        role="group"
        aria-labelledby={id}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0"
      >
        {wahlen.map((wahl) => (
          <Chip
            key={wahl.wert}
            gewaehlt={gewaehlt.includes(wahl.wert)}
            onClick={() => umschalten(wahl.wert)}
          >
            {wahl.text}
          </Chip>
        ))}
      </div>
    </div>
  );
}

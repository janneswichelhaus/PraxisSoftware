import type { Severity } from './bike3d/zones';

/**
 * Die Nummer einer Stelle als Nadelkopf, wie am 3D-Rad (Handoff Lastenrad 3D,
 * Abschnitt 3): „Problem“ ein roter Kreis, „Beobachten“ ein gelbes
 * abgerundetes Quadrat mit dunkler Kontur, die neue Stelle in der
 * Hauptfarbe. Form, Farbe und Nummer tragen die Einstufung gemeinsam; für
 * Vorlesesoftware steht „Stelle 2“ da, die Einstufung sagt die Zeile in
 * Worten.
 *
 * Dieselbe Nummer an der Nadel, in der Liste und in der Unterlage für die
 * Werkstatt (Handoff, Abschnitt 4).
 */
export function Nadel({
  nummer,
  einstufung,
  neu = false,
  aktiv = false,
}: {
  nummer: number;
  einstufung: Severity;
  /** Die Stelle, die gerade angelegt wird. */
  neu?: boolean;
  /** Die Stelle, die bearbeitet oder gezeigt wird: Ring in der Hauptfarbe. */
  aktiv?: boolean;
}) {
  const form = neu
    ? 'bg-accent text-surface rounded-pill'
    : einstufung === 'problem'
      ? 'bg-nadel-problem text-surface rounded-pill'
      : 'bg-nadel-beobachten text-nadel-beobachten-ink border-nadel-beobachten-ink rounded-button border-2';
  return (
    <span
      className={`inline-flex size-8 shrink-0 items-center justify-center text-sm font-bold tabular-nums ${form} ${
        aktiv ? 'outline-accent outline-2 outline-offset-2' : ''
      }`.trim()}
    >
      <span aria-hidden="true">{nummer}</span>
      <span className="sr-only">Stelle {nummer}</span>
    </span>
  );
}

/** Die Einstufung als Zeichen und Wort (DESIGN.md Regel 5). */
export function Einstufung({ einstufung }: { einstufung: Severity }) {
  return einstufung === 'problem' ? (
    <span className="text-danger font-medium">
      <span aria-hidden="true">× </span>Problem
    </span>
  ) : (
    <span className="text-warnung font-medium">
      <span aria-hidden="true">! </span>Beobachten
    </span>
  );
}

/** Form und Farbe einer Nadel ohne Nummer - für die Legende neben dem Rad. */
export function Nadelform({ einstufung }: { einstufung: Severity }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-4 shrink-0 ${
        einstufung === 'problem'
          ? 'bg-nadel-problem rounded-pill'
          : 'bg-nadel-beobachten border-nadel-beobachten-ink rounded-button border-2'
      }`}
    />
  );
}

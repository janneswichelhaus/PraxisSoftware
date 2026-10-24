import { useId, type ReactNode } from 'react';

/**
 * Ein Schalter als Karte (Handoff 2026-10-22, Abschnitt 5.3): links, was er
 * schaltet, und ein Satz dazu, rechts das Zustandswort „An“ oder „Aus“ neben
 * der Spur. Die ganze Karte ist das Ziel, mindestens 80 hoch, mit
 * `role="switch"` und `aria-checked` - der Zustand steht als Wort und als
 * Lage, nie nur als Farbe (DESIGN.md Regel 5). Spur 56 × 32, aus in
 * `line-strong` (4,2:1 gegen Papier), an in `accent`; der Knopf darin Papier,
 * 24. Alles in rem, damit es mit „Groß“ und „Sehr groß“ wächst; wird es eng
 * (200 %, „Sehr groß“), rücken Zustand und Spur unter die Beschriftung, statt
 * sie Buchstabe für Buchstabe umzubrechen.
 *
 * Für eine Wahl, die sofort gilt - eine Einstellung, kein Feld eines
 * Formulars, das man erst absendet. Solange der Wechsel läuft (`laeuft`, etwa
 * die Abfrage des Telefons), nimmt er keinen zweiten Tipp an und behält den
 * Fokus: `aria-disabled` statt `disabled`.
 */
export function Schalter({
  beschriftung,
  hinweis,
  an,
  onUmschalten,
  laeuft = false,
}: {
  /** Was er schaltet; ein Wort, das nicht brechen soll, in `whitespace-nowrap`. */
  beschriftung: ReactNode;
  /** Ein Satz unter der Beschriftung, als Beschreibung vorgelesen. */
  hinweis?: ReactNode;
  an: boolean;
  onUmschalten: (an: boolean) => void;
  laeuft?: boolean;
}) {
  const titelId = useId();
  const hinweisId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={an}
      aria-labelledby={titelId}
      aria-describedby={hinweis ? hinweisId : undefined}
      aria-disabled={laeuft || undefined}
      aria-busy={laeuft || undefined}
      onClick={() => {
        if (!laeuft) onUmschalten(!an);
      }}
      className="border-line bg-surface rounded-card [.plattform-schrift_&]:ease-druck [.plattform-schrift_&]:active:bg-surface-sunken flex min-h-20 w-full flex-wrap items-center gap-x-4 gap-y-3 border px-5 py-4 text-left transition-colors aria-disabled:cursor-progress [.plattform-schrift_&]:duration-120"
    >
      <span className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
        <span id={titelId} className="text-ink font-semibold">
          {beschriftung}
        </span>
        {hinweis ? (
          <span id={hinweisId} className="text-ink-muted">
            {hinweis}
          </span>
        ) : null}
      </span>
      <span aria-hidden="true" className="ml-auto flex shrink-0 items-center gap-3">
        <span data-zustand="" className="text-ink font-semibold">
          {an ? 'An' : 'Aus'}
        </span>
        <span
          data-spur=""
          className={`rounded-pill relative h-8 w-14 shrink-0 transition-colors ${
            an ? 'bg-accent' : 'bg-line-strong'
          }`}
        >
          <span
            className={`bg-surface rounded-pill absolute top-1 size-6 motion-safe:transition-[left] ${
              an ? 'left-7' : 'left-1'
            }`}
          />
        </span>
      </span>
    </button>
  );
}

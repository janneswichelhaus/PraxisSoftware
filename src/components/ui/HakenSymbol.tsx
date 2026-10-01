/**
 * Der Haken als Strichsymbol (Design-Handoff 2026-10-01, Abschnitt 6a).
 *
 * Ein Inline-SVG statt einer Symbolbibliothek: Raster 20, Strich 2, runde
 * Enden - die Strichstärke passt zur Schrift der Knöpfe. Es übernimmt die
 * Textfarbe des Knopfes und ist für Vorlesesoftware ausgeblendet; den Namen
 * trägt der Knopf (`Symbolknopf`, `beschriftung`).
 */
export function HakenSymbol({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M4 10.5 8 14.5 16 5.5" />
    </svg>
  );
}

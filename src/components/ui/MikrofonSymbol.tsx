/**
 * Das Mikrofon als Strichsymbol (DESIGN.md 9.15): Raster 20, Strich 1,75,
 * runde Enden. Es übernimmt die Textfarbe und ist für Vorlesesoftware
 * ausgeblendet; den Namen trägt der Knopf. Gebraucht vom Diktat auf der
 * Schreibseite und von der Sprachnachricht im Teamchat (ADR-017 Abschnitt N).
 */
export function MikrofonSymbol({ className = 'size-5 shrink-0' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="7.25" y="2.5" width="5.5" height="9.5" rx="2.75" />
      <path d="M4.5 9.75a5.5 5.5 0 0 0 11 0M10 15.25v2.25" />
    </svg>
  );
}

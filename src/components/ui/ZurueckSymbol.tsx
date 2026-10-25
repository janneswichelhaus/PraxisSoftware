/**
 * Der Winkel nach links, 24 px im Raster 24 (Handoff 2026-10-24,
 * Abschnitt 3): vor „Zurück“ im Kopf der Durchführung und über dem
 * Planblatt. Er übernimmt die Textfarbe; den Namen trägt das Wort daneben.
 */
export function ZurueckSymbol() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="size-6 shrink-0"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

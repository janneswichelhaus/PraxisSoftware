/**
 * Das durchgestrichene WLAN-Zeichen, 22 px (Raster 20, Strich 1,75, wie
 * `MikrofonSymbol`): die Verbindungszeile der Plattform und die Zeile ohne
 * Netz im Kopf der Durchführung. Für Vorlesesoftware ausgeblendet; der Satz
 * daneben sagt es.
 */
export function OhneNetzSymbol() {
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
      className="mt-0.5 size-5.5 shrink-0"
    >
      <path d="M2.5 7.4a10.8 10.8 0 0 1 15 0M5 10.1a7.2 7.2 0 0 1 10 0M7.5 12.75a3.6 3.6 0 0 1 5 0M10 15.75h.01M3 3l14 14" />
    </svg>
  );
}

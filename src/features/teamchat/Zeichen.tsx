/**
 * Die Symbole des Teamchats (TEAM-002) nach DESIGN.md 9.15: Raster 20, Strich
 * 1,75, runde Enden, `currentColor`, für Vorlesesoftware ausgeblendet - die
 * Bedeutung trägt das Wort daneben. Sie bleiben hier, bis eines anderswo
 * gebraucht wird.
 */

const strich = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** Privater Kanal. */
export function Schloss({ className = 'size-4 shrink-0' }: { className?: string }) {
  return (
    <svg {...strich} className={className}>
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

/** Angeheftet. */
export function Nadel({ className = 'size-4 shrink-0' }: { className?: string }) {
  return (
    <svg {...strich} className={className}>
      <path d="M7.5 3.5h5l-1 5 2.5 2.5h-8L8.5 8.5z" />
      <path d="M10 11v5.5" />
    </svg>
  );
}

/** Für später. */
export function Lesezeichen({ className = 'size-4 shrink-0' }: { className?: string }) {
  return (
    <svg {...strich} className={className}>
      <path d="M6 3.5h8a.5.5 0 0 1 .5.5v12.5L10 13.5l-4.5 3V4a.5.5 0 0 1 .5-.5z" />
    </svg>
  );
}

/** Später senden, Erinnerung. */
export function Uhr({ className = 'size-5 shrink-0' }: { className?: string }) {
  return (
    <svg {...strich} className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 2" />
    </svg>
  );
}

/** Zurück (Pfeil nach links). */
export function Zurueck({ className = 'size-5 shrink-0' }: { className?: string }) {
  return (
    <svg {...strich} className={className}>
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </svg>
  );
}

/** Schließen. */
export function Kreuz({ className = 'size-5 shrink-0' }: { className?: string }) {
  return (
    <svg {...strich} className={className}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </svg>
  );
}

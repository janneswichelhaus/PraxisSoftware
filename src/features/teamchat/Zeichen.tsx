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

/** Anhängen (TEAM-003). */
export function Bueroklammer({ className = 'size-5 shrink-0' }: { className?: string }) {
  return (
    <svg {...strich} className={className}>
      <path d="M14.5 9.5 9.6 14.4a3 3 0 0 1-4.2-4.2l5.7-5.7a2 2 0 0 1 2.8 2.8l-5.6 5.6a1 1 0 0 1-1.4-1.4l4.9-4.9" />
    </svg>
  );
}

/** Ein Foto als Anhang (TEAM-003). */
export function Bildzeichen({ className = 'size-5 shrink-0' }: { className?: string }) {
  return (
    <svg {...strich} className={className}>
      <rect x="3" y="4.5" width="14" height="11" rx="1.5" />
      <circle cx="7.5" cy="8.5" r="1.25" />
      <path d="m16.5 13-4-4-6.5 6.5" />
    </svg>
  );
}

/** Ein PDF als Anhang (TEAM-003). */
export function Dokument({ className = 'size-5 shrink-0' }: { className?: string }) {
  return (
    <svg {...strich} className={className}>
      <path d="M11.5 3H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.5z" />
      <path d="M11.5 3v3.5H15" />
      <path d="M7.5 10.5h5M7.5 13h3.5" />
    </svg>
  );
}

/** Eine Sprachnachricht (TEAM-004) - dasselbe Mikrofon wie beim Diktat. */
export function Mikrofon({ className = 'size-5 shrink-0' }: { className?: string }) {
  return (
    <svg {...strich} className={className}>
      <rect x="7.25" y="2.5" width="5.5" height="9.5" rx="2.75" />
      <path d="M4.5 9.75a5.5 5.5 0 0 0 11 0M10 15.25v2.25" />
    </svg>
  );
}

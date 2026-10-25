import type { ReactNode } from 'react';

/**
 * Die Zeichen der Termine (Handoff 2026-10-24 „Termine“, Abschnitt 3):
 * Raster 24, Linie 2, `currentColor`. Ein Zeichen steht nie allein - das
 * Wort daneben trägt die Bedeutung, deshalb `aria-hidden`.
 *
 * Die Art eines Termins: Haus, Praxis, Video und im Training die Hantel
 * (Festlegung „Zeichen der Art“). Dazu Kalender (ein Wunsch), Uhr (der
 * Wunsch wartet, Schritt 3b), Ort, Telefon, Nachricht, der Pfeil am Ende
 * einer Zeile und der Pfeil hinter „Termin ansehen“.
 */
export type Artzeichen = 'haus' | 'praxis' | 'video' | 'training';

export type Terminzeichen =
  Artzeichen | 'kalender' | 'uhr' | 'ort' | 'telefon' | 'nachricht' | 'pfeil' | 'vor';

const PFADE: Record<Terminzeichen, ReactNode> = {
  haus: (
    <>
      <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M10 21v-5h4v5" />
    </>
  ),
  praxis: (
    <>
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
      <path d="M15 9h4a1 1 0 0 1 1 1v11" />
      <path d="M3 21h18M8 8h3M8 12h3M8 16h3" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10.5l5-3v9l-5-3" />
    </>
  ),
  training: <path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" />,
  kalender: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  uhr: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  ort: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  telefon: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  ),
  nachricht: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" />,
  pfeil: <path d="M9 6l6 6-6 6" />,
  vor: <path d="M5 12h14M13 6l6 6-6 6" />,
};

/** Ein Zeichen der Termine; die Größe setzt die Stelle (Standard 22 wie im Kreis der Art). */
export function Terminsymbol({
  zeichen,
  className = 'size-5.5',
}: {
  zeichen: Terminzeichen;
  className?: string;
}) {
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
      className={`shrink-0 ${className}`}
    >
      {PFADE[zeichen]}
    </svg>
  );
}

/**
 * Der Kreis vor einer Termin- oder Wunschzeile, 40 in rem: die Art auf
 * Salbei hell in der Hauptfarbe, gedämpft (vergangen, abgesagt) und der
 * Kalender eines Wunschs auf der Vertiefung in Leise (Abschnitt 3).
 */
export function Terminkreis({
  zeichen,
  gedaempft = false,
}: {
  zeichen: Artzeichen | 'kalender';
  gedaempft?: boolean;
}) {
  const leise = gedaempft || zeichen === 'kalender';
  return (
    <span
      aria-hidden="true"
      className={`rounded-pill inline-flex size-10 shrink-0 items-center justify-center ${
        leise ? 'bg-surface-sunken text-ink-muted' : 'bg-accent-soft text-accent'
      }`}
    >
      <Terminsymbol zeichen={zeichen} />
    </span>
  );
}

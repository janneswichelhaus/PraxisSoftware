import type { ReactNode } from 'react';
import type { Thema } from './nachrichtentexte';

const LINIEN: Record<Thema, ReactNode> = {
  // Die Hantel des Reiters „Übungen“.
  exercise: <path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" />,
  complaint: (
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 8v6M8 10h8M12 14l-3 7M12 14l3 7" />
    </>
  ),
  // Der Kalender des Reiters „Termine“.
  organisational: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  other: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" />,
};

/** Das Bild eines Themas im Raster 24 mit Strich 2; nur Schmuck, das Wort steht daneben. */
export function Themenzeichen({ thema }: { thema: Thema }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {LINIEN[thema]}
    </svg>
  );
}

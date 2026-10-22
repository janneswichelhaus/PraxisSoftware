import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Eine Aufgabe der Plattform als Karte (Handoff 2026-10-22, Abschnitt 3):
 * Zeichen im Kreis, Titel, ein Satz. Die ganze Karte ist das Ziel, Titel und
 * Satz sind der Name des Links. Höchstens drei je Seite, alles Weitere als
 * `ListRow` (`docs/design/PLATTFORM.md`).
 *
 * Antippbar und deshalb mit der Tiefenstufe `shadow-plattform` (ANN-678);
 * gedrückt vertieft und 98 % groß, bei „Bewegung reduzieren“ nur vertieft.
 * Bei „Sehr groß“ fällt der Pfeil weg, damit der Text Platz hat.
 */
export function Aufgabenkarte({
  zeichen,
  titel,
  satz,
  to,
}: {
  /** Strichzeichen im Raster 24, Strich 2 (`currentColor`). */
  zeichen: ReactNode;
  titel: string;
  satz: ReactNode;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="border-line bg-surface text-ink rounded-card shadow-plattform hover:bg-surface-sunken active:bg-surface-sunken ease-druck flex min-h-20 items-center gap-4 border p-4 no-underline transition-[background-color,scale] duration-120 active:scale-98 motion-reduce:active:scale-100"
    >
      <span
        aria-hidden="true"
        className="bg-accent-soft text-accent rounded-pill flex size-12 shrink-0 items-center justify-center [&_svg]:size-6"
      >
        {zeichen}
      </span>
      <span className="flex min-w-0 grow flex-col">
        <span className="text-liste font-semibold">{titel}</span>{' '}
        {/* Das Leerzeichen trennt Titel und Satz im Namen des Links; sichtbar
            steht der Satz ohnehin in eigener Zeile. */}
        <span className="text-ink-muted">{satz}</span>
      </span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        data-pfeil=""
        className="text-ink-muted size-6 shrink-0 [[data-schrift=sehr-gross]_&]:hidden"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Wenige Wege von einer Seite der Plattform weiter, etwa „Zum Plan“ im Reiter
 * „Übungen“ (Handoff 2026-10-24, Abschnitt 5.1): am Telefon eine Liste mit
 * Rahmen, je Zeile 60 hoch mit Zeichen und Pfeil, die ganze Zeile das Ziel;
 * am Rechner (`data-rechner`) Textlinks mit Zeichen in einer Reihe, wie
 * `Textlink` in der Hauptfarbe und unterstrichen. Unter 23rem fällt der Pfeil
 * weg, damit das Wort Platz hat.
 *
 * Druck wie an jeder Zeile der Plattform: vertiefte Fläche und 98 % in
 * 120 ms, bei „Bewegung reduzieren“ nur die Fläche (DR-117).
 */
export function Linkliste({
  eintraege,
}: {
  eintraege: readonly { text: string; zeichen: ReactNode; to: string }[];
}) {
  return (
    <ul className="rounded-card border-line bg-surface overflow-hidden border [[data-rechner]_&]:flex [[data-rechner]_&]:flex-wrap [[data-rechner]_&]:gap-x-8 [[data-rechner]_&]:overflow-visible [[data-rechner]_&]:border-0 [[data-rechner]_&]:bg-transparent">
      {eintraege.map((e) => (
        <li key={e.to} className="border-line not-first:border-t [[data-rechner]_&]:border-0">
          <Link
            to={e.to}
            className="text-ink hover:bg-surface-sunken active:bg-surface-sunken ease-druck [[data-rechner]_&]:text-accent [[data-rechner]_&]:hover:text-accent-hover flex min-h-15 items-center gap-3 px-4 py-2 font-semibold transition-[color,background-color,scale] duration-120 focus-visible:-outline-offset-2 motion-safe:active:scale-98 max-[23rem]:gap-2 max-[23rem]:px-3 [[data-rechner]_&]:min-h-11 [[data-rechner]_&]:px-0 [[data-rechner]_&]:underline [[data-rechner]_&]:underline-offset-3 [[data-rechner]_&]:hover:bg-transparent [[data-rechner]_&]:active:bg-transparent [[data-rechner]_&]:motion-safe:active:scale-100"
          >
            <span aria-hidden="true" className="text-accent inline-flex shrink-0 [&_svg]:size-6">
              {e.zeichen}
            </span>
            <span className="min-w-0 grow">{e.text}</span>
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
              className="text-ink-muted size-6 shrink-0 max-[23rem]:hidden [[data-rechner]_&]:hidden"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        </li>
      ))}
    </ul>
  );
}

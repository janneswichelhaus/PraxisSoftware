import type { ReactNode } from 'react';

/**
 * Flächiger Container für einen einzelnen Gegenstand einer Liste.
 *
 * Radius 14, Papier, eine Linie als Rahmen, 24 innen (DS-001). Kein Schatten —
 * dass die Karte über der Seite liegt, tragen Fläche und Linie.
 */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border-line bg-surface border p-6 ${className}`}>{children}</div>
  );
}

/** Rasterlayout für Karten, das ohne feste Spaltenzahl auskommt. */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3">
      {children}
    </div>
  );
}

/**
 * Beschriftete Angabe innerhalb einer Karte.
 *
 * Bewusst als Definitionsliste: Screenreader lesen Bezeichnung und Wert
 * zusammen vor, statt zwei zusammenhanglose Textfragmente.
 */
export function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line flex items-baseline justify-between gap-3 border-t py-1.5 first:border-t-0">
      <dt className="text-ink-muted shrink-0 text-sm">{label}</dt>
      <dd className="text-ink min-w-0 text-right text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

export function DataList({ children }: { children: ReactNode }) {
  return <dl className="mt-2">{children}</dl>;
}

/** Aufklappbarer Zusatzbereich, etwa für Verläufe. */
export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="border-line mt-2 border-t pt-2">
      <summary className="text-ink-muted hover:text-ink flex min-h-9 cursor-pointer items-center text-sm">
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

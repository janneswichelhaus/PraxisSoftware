import type { ReactNode } from 'react';
import type { Protokolleintrag } from './vorschauContext';

/**
 * Gemeinsame Bausteine der Vorschaubereiche.
 *
 * Bis 2026-09-22 stand über jedem dieser Bereiche ein Warnbanner und neben
 * offenen Fachfragen eine Markierung. Beides ist entfernt: Es gibt genau eine
 * Person, die mit dieser Anwendung arbeitet, und sie weiß, welcher Bereich
 * angebunden ist. Was bleibt, ist die **Zustandsmeldung** nach einer Aktion —
 * sie sagt etwas, das man nicht wissen kann, ohne sie zu lesen.
 */

/**
 * Rückmeldung nach einer simulierten Aktion.
 *
 * Sie nennt immer beides: was die Vorschau übernommen hat und was
 * ausdrücklich nicht passiert ist. Ein bloßes „Gespeichert" wäre hier
 * schlicht falsch.
 */
export function SimulationsMeldung({ eintrag }: { eintrag: Protokolleintrag | null }) {
  if (!eintrag) return null;
  return (
    <div
      role="status"
      className="rounded-card border-accent/25 bg-accent-soft mb-5 border px-4 py-3"
    >
      <p className="text-accent text-[0.9375rem] font-medium">Vorschau: {eintrag.vorgang}</p>
      {eintrag.folgen.length > 0 ? (
        <>
          <p className="text-ink-muted mt-2 text-sm font-medium">In der Vorschau übernommen:</p>
          <ul className="text-ink-muted mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {eintrag.folgen.map((folge) => (
              <li key={folge}>{folge}</li>
            ))}
          </ul>
        </>
      ) : null}
      {eintrag.nichtGeschehen.length > 0 ? (
        <>
          <p className="text-ink-muted mt-2 text-sm font-medium">Nicht passiert:</p>
          <ul className="text-ink-muted mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {eintrag.nichtGeschehen.map((punkt) => (
              <li key={punkt}>{punkt}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** Abschnittsüberschrift innerhalb einer Seite. */
export function Abschnitt({
  titel,
  beschreibung,
  aktionen,
  children,
}: {
  titel: string;
  beschreibung?: string;
  aktionen?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-ink text-[1.0625rem] font-semibold tracking-[-0.01em]">{titel}</h2>
          {beschreibung ? <p className="text-ink-muted mt-0.5 text-sm">{beschreibung}</p> : null}
        </div>
        {aktionen}
      </div>
      {children}
    </section>
  );
}

/** Aufklappbarer Bereich mit eigener Überschrift, etwa für Übersichten. */
export function Klappbereich({
  titel,
  beschreibung,
  offen = false,
  children,
}: {
  titel: string;
  beschreibung?: string;
  offen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={offen} className="rounded-card border-line bg-surface mt-4 border px-4">
      <summary className="text-ink flex min-h-12 cursor-pointer items-center text-[0.9375rem] font-medium">
        {titel}
      </summary>
      <div className="pb-4">
        {beschreibung ? <p className="text-ink-muted mb-3 text-sm">{beschreibung}</p> : null}
        {children}
      </div>
    </details>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';
import { Aufklappzeichen } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
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
 *
 * **Sie holt sich den Blick (VOR-01).** Die Meldung steht oben auf der Seite,
 * die Aktion oft weit darunter - an einem Rad in der Liste, unter einem
 * Chatverlauf. Ungesehen ist sie wertlos: Wer sie nicht liest, hält die
 * Aktion für echt. Beim Erscheinen bekommt sie deshalb den Fokus und rollt ins
 * Bild; eine Tastaturbedienung steht danach an der Meldung statt am Seitenanfang.
 */
export function SimulationsMeldung({ eintrag }: { eintrag: Protokolleintrag | null }) {
  const meldungRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!eintrag) return;
    meldungRef.current?.focus({ preventScroll: true });
    meldungRef.current?.scrollIntoView({ block: 'nearest' });
  }, [eintrag]);

  if (!eintrag) return null;
  return (
    <div
      ref={meldungRef}
      role="status"
      tabIndex={-1}
      className="rounded-card border-accent/25 bg-accent-soft mb-5 border px-4 py-3"
    >
      <p className="text-accent text-liste font-medium">Vorschau: {eintrag.vorgang}</p>
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
          <h2 className="text-ink text-[1.0625rem] font-semibold">{titel}</h2>
          {beschreibung ? <p className="text-ink-muted mt-0.5 text-sm">{beschreibung}</p> : null}
        </div>
        {aktionen}
      </div>
      {children}
    </section>
  );
}

/**
 * Aufklappbarer Bereich mit eigener Überschrift, etwa für Übersichten.
 *
 * Der Kopf trägt das `Aufklappzeichen` des Systems (UEB-03, RSP-07, VOR-20):
 * Mit `display: flex` zeichnet der Browser sein Dreieck nicht, und
 * „Wochenübersicht – wer nutzt wann welches Rad" sah aus wie eine weiße Leiste
 * ohne Inhalt.
 */
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
    <details open={offen} className="group rounded-card border-line bg-surface mt-4 border px-4">
      <summary className={`${aufklappKopfKlassen} text-ink text-liste py-1 font-medium`}>
        <Aufklappzeichen />
        {titel}
      </summary>
      <div className="pb-4">
        {beschreibung ? <p className="text-ink-muted mb-3 text-sm">{beschreibung}</p> : null}
        {children}
      </div>
    </details>
  );
}

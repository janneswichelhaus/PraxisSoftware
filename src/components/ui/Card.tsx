import type { ReactNode } from 'react';
import { aufklappKopfKlassen } from './aufklappStile';

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

/**
 * Fläche für einen Abschnitt, der fachlichen Inhalt trägt (UI-002c).
 *
 * Der Unterschied zu `Card`: Die Karte ist **ein Gegenstand** einer Liste,
 * diese Fläche ist **der Rahmen um eine Liste** oder um eine Auskunft. Beide
 * liegen auf Papier, die Fläche ist nur knapper gepolstert, damit Zeilen mit
 * eigener Höhe nicht doppelt Luft bekommen.
 *
 * Wofür sie nicht da ist: Bedienung. Filterleisten, Legenden und Hinweise
 * bleiben vertieft (`bg-surface-sunken`) - sie erklären den Inhalt, sie sind
 * keiner.
 */
export function Inhaltsflaeche({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    // Die beiden Ausnahmen betreffen `DetailList`: Sie trägt eine eigene
    // Kopflinie und einen Abstand nach oben, weil sie auch ohne Rahmen
    // vorkommt - etwa in einer Karte, wo die Linie sie vom Kartenkopf trennt.
    // Im Rahmen wäre beides eine zweite Kante direkt neben der ersten.
    <div
      className={`border-line bg-surface rounded-card border px-4 py-3 sm:px-5 [&>dl:first-child]:mt-0 [&>dl:first-child]:border-t-0 ${className}`}
    >
      {children}
    </div>
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

/**
 * Das Zeichen eines Aufklappers: ein Winkel, der nach rechts zeigt und sich
 * beim Öffnen nach unten dreht (UIK-07, UEB-03, VOR-20).
 *
 * Bis UXR-001 stand an keinem Aufklapper ein Zeichen: Mit `display: flex`
 * zeichnet der Browser sein Dreieck nicht, und „Tagesplan des Teams" sah aus
 * wie eine leere Abschnittsüberschrift.
 *
 * Gezeichnet aus zwei Kanten eines gedrehten Quadrats - weder „▸" noch ein
 * SVG-Pfad. Das Zeichen führt die Schrift nicht, und jeder Rückfall sähe
 * anders aus. Und Pfade und Linienzüge sind in der Akte dem Verlaufsbild
 * vorbehalten, wo der Befund sie ausdrücklich ausschließt: Keine Linie
 * zwischen den Punkten (ADR-006 Punkt 11) - ein Test zählt dort jeden Pfad,
 * und das soll er ohne Ausnahme für Bedienzeichen dürfen.
 *
 * Für Vorlesesoftware ausgeblendet - ob offen oder zu, sagt das `<details>`
 * selbst. Die Drehung hängt am `open` des nächsten `<details>` mit der Klasse
 * `group`; bei reduzierter Bewegung springt sie ohne Übergang.
 *
 * Seiten mit eigenem `<details>` setzen es in ihren `<summary>` (Klassen dort:
 * `aufklappKopfKlassen`), statt ein eigenes Zeichen zu bauen.
 */
export function Aufklappzeichen() {
  return (
    <span
      aria-hidden="true"
      data-aufklappzeichen=""
      className="inline-flex size-4 shrink-0 items-center justify-center transition-transform group-open:rotate-90 motion-reduce:transition-none"
    >
      <span className="size-2 -translate-x-px rotate-45 border-t-2 border-r-2 border-current" />
    </span>
  );
}

/**
 * Aufklappbarer Zusatzbereich, etwa für Verläufe und Seltenes.
 *
 * Der Kopf ist 44 px hoch und trägt das `Aufklappzeichen` (UIK-07, RSP-07,
 * ZST-19). `summary` darf mehr als Text sein - eine Zahl in einem Abzeichen
 * etwa. `offen` öffnet den Bereich beim ersten Zeichnen; danach entscheidet
 * die Person (ANN-117: der Teamplan ist für das Büro offen, für Behandelnde
 * zu).
 */
export function Disclosure({
  summary,
  offen = false,
  children,
}: {
  summary: ReactNode;
  offen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={offen} className="group border-line mt-2 border-t pt-2">
      <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink text-sm`}>
        <Aufklappzeichen />
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

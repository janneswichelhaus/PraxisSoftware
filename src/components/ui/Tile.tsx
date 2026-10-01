import type { ReactNode } from 'react';

export type TileTone = 'neutral' | 'akzent' | 'warnung' | 'kritisch';

const flaechen: Record<TileTone, string> = {
  neutral: 'border-line bg-surface',
  // Die Akzentkarte des Systems (DS-001): Salbei hell mit einer Linie im
  // selben Ton. Für das, was an einer Seite heraussticht - ein Praxistermin
  // in einer Praxis, die Hausbesuche macht.
  akzent: 'border-accent/25 bg-accent-soft',
  warnung: 'border-warnung/25 bg-warnung-soft',
  kritisch: 'border-danger/25 bg-danger-soft',
};

const beschriftungen: Record<TileTone, string> = {
  neutral: 'text-ink-muted',
  akzent: 'text-accent',
  warnung: 'text-warnung',
  kritisch: 'text-danger',
};

/**
 * Eine Kachel: eine beschriftete Angabe mit eigener Fläche (UX-005a).
 *
 * Bis UX-005a stand jede Angabe eines Termins als Zeile einer Tabelle, und
 * die Zeilen sahen alle gleich aus - die Anschrift wie der Status, der
 * Zähler wie das Datum. Die Kachel hebt eine Angabe heraus, die für sich
 * steht und meist eine Handlung trägt: die Anschrift mit der Navigation, die
 * Grundlage mit dem Zähler, eine Absage mit ihrem Grund.
 *
 * Ihr Ton sagt, was sie ist (DS-001): neutral für Auskunft, Akzent für das
 * Besondere, Warnung und kritisch für Zustände. Farbe trägt nie allein - die
 * Beschriftung steht als Wort, der Zustand zusätzlich als Zeichen im Kopf der
 * Seite.
 *
 * Bewusst `dt`/`dd` in einem `dl` (`TileGrid`): Vorlesesoftware liest
 * Beschriftung und Inhalt zusammen, und die Prüfungen finden eine Angabe wie
 * bisher über ihre Beschriftung.
 */
export function Tile({
  label,
  ton = 'neutral',
  children,
  className = '',
}: {
  label: string;
  ton?: TileTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card min-w-0 border px-4 py-3 ${flaechen[ton]} ${className}`}>
      {/* Beschriftung als `--type-label`: 12 px in 600, Versalien mit 0.14em
          Laufweite - dieselbe Rolle wie ein Abschnittstitel. */}
      <dt className={`tracking-label text-xs font-semibold uppercase ${beschriftungen[ton]}`}>
        {label}
      </dt>
      <dd className="text-ink text-liste mt-1 min-w-0 wrap-anywhere">{children}</dd>
    </div>
  );
}

/**
 * Kacheln nebeneinander, so viele, wie die Breite trägt: am Telefon eine
 * Spalte, am Rechner zwei bis drei. Dieselbe Regel wie `CardGrid`.
 */
export function TileGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3">
      {children}
    </dl>
  );
}

/**
 * Beschriftete Zeilen innerhalb einer Kachel - Absagegrund, Eingang,
 * Ausfallhonorar in der Kachel „Absage". Ein eigenes `dl`, damit jede Zeile
 * für sich adressierbar bleibt.
 */
export function TileRows({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col gap-2">{children}</dl>;
}

export function TileRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-ink-muted text-sm">{label}</dt>
      <dd className="text-ink text-liste min-w-0 wrap-anywhere">{children}</dd>
    </div>
  );
}

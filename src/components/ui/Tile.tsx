import type { ReactNode } from 'react';

export type TileTone = 'neutral' | 'akzent' | 'warnung' | 'kritisch';

/**
 * Flächen nach dem Design-Handoff vom 2026-10-01 (Abschnitt 3): Die neutrale
 * Kachel liegt auf dem Seitengrund und trägt eine Linie; Akzent, Warnung und
 * kritisch tragen ihre weiche Fläche und **keinen** Rahmen - die Fläche hebt
 * sie schon ab. Der Rahmen bleibt als durchsichtige Linie stehen, damit alle
 * Kacheln einer Reihe gleich groß sind.
 */
const flaechen: Record<TileTone, string> = {
  neutral: 'border-line bg-canvas',
  // Die Akzentkarte des Systems (DS-001): Salbei hell. Für das, was an einer
  // Seite heraussticht - ein Praxistermin in einer Praxis, die Hausbesuche
  // macht.
  akzent: 'border-transparent bg-accent-soft',
  warnung: 'border-transparent bg-warnung-soft',
  kritisch: 'border-transparent bg-danger-soft',
};

/** Farbe von Beschriftung und Nebenzeile: leise, oder der Ton der Kachel. */
const beschriftungen: Record<TileTone, string> = {
  neutral: 'text-ink-muted',
  akzent: 'text-accent',
  warnung: 'text-warnung',
  kritisch: 'text-danger',
};

/** Das Zeichen vor der Beschriftung einer Zustandskachel, wie im `Badge`. */
const zeichen: Partial<Record<TileTone, string>> = {
  warnung: '!',
  kritisch: '×',
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
 *
 * Maße nach dem Design-Handoff vom 2026-10-01 (Abschnitt 3, dort „Kachel"):
 * Radius 14, innen 12/14, mindestens 72 px hoch. Der **Wert** (`children`)
 * steht in 16 px und 600, eine **Nebenzeile** (`zusatz`) in 14 px darunter,
 * eine **Handlung** (`aktion`, ein Textlink) am Fuß. Eine Zustandskachel
 * trägt ihr Zeichen vor der Beschriftung, für Vorlesesoftware ausgeblendet -
 * die Bedeutung trägt der Text. Für Fließtext ist die Kachel nicht da.
 */
export function Tile({
  label,
  ton = 'neutral',
  children,
  zusatz,
  aktion,
  className = '',
}: {
  label: string;
  ton?: TileTone;
  /** Der Wert: eine Zeile, höchstens zwei. */
  children: ReactNode;
  /** Nebenzeile unter dem Wert, 14 px. */
  zusatz?: ReactNode;
  /** Textlink am Fuß der Kachel, etwa „Navigation starten →". */
  aktion?: ReactNode;
  className?: string;
}) {
  const bild = zeichen[ton];
  return (
    <div
      className={`rounded-card px-kachel-x py-kachel-y min-h-18 min-w-0 border ${flaechen[ton]} ${className}`}
    >
      {/* Beschriftung als `--type-label`: 12 px in 600, Versalien mit 0.14em
          Laufweite - dieselbe Rolle wie ein Abschnittstitel. */}
      <dt className={`tracking-label text-xs font-semibold uppercase ${beschriftungen[ton]}`}>
        {bild ? <span aria-hidden="true">{bild} </span> : null}
        {label}
      </dt>
      <dd className="text-ink mt-1 min-w-0 text-base leading-[1.3] font-semibold wrap-anywhere">
        {children}
      </dd>
      {zusatz ? (
        <dd className={`mt-0.5 min-w-0 text-sm wrap-anywhere ${beschriftungen[ton]}`}>{zusatz}</dd>
      ) : null}
      {aktion ? (
        <dd className="flex min-h-9 items-center text-sm font-semibold">{aktion}</dd>
      ) : null}
    </div>
  );
}

/**
 * Wie breit eine Kachel mindestens ist, bevor die Reihe umbricht.
 *
 * `breit` ist die Reihe aus UX-005a (17rem, am Telefon eine Spalte) für
 * Kacheln mit einem Knopf oder mehreren Zeilen. `kachel` und `akte` sind die
 * Reihen aus dem Design-Handoff vom 2026-10-01: 150 px beziehungsweise 160 px
 * im Kopf der Akte, die Kacheln teilen sich die Breite (`auto-fit`), am
 * Telefon stehen zwei nebeneinander. Mehr als vier Kacheln gehören nicht in
 * eine Reihe.
 */
const reihen = {
  breit: '[grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3',
  kachel: '[grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-2',
  akte: '[grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-2',
} as const;

/**
 * Kacheln nebeneinander, so viele, wie die Breite trägt. Dieselbe Regel wie
 * `CardGrid`; die Mindestbreite wählt `spalte`.
 */
export function TileGrid({
  children,
  spalte = 'breit',
}: {
  children: ReactNode;
  spalte?: keyof typeof reihen;
}) {
  return <dl className={`grid ${reihen[spalte]}`}>{children}</dl>;
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
  // `font-normal` und die eigene Zeilenhöhe: Die Zeilen stehen im Wert der
  // Kachel und erbten sonst dessen 600 - sie sind aber Auskunft in mehreren
  // Zeilen, kein einzelner Wert.
  return (
    <div className="leading-normal font-normal">
      <dt className="text-ink-muted text-sm">{label}</dt>
      <dd className="text-ink text-liste min-w-0 wrap-anywhere">{children}</dd>
    </div>
  );
}

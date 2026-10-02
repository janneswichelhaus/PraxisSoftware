import { useState, type ReactNode } from 'react';
import { aufklappKoepfe, aufklappKopfKlassen } from './aufklappStile';

/**
 * Flächiger Container für einen einzelnen Gegenstand einer Liste.
 *
 * Radius 14, weiß, eine Linie als Rahmen, 16 innen (bis zum Design-Handoff
 * vom 2026-10-01 waren es 24). Kein Schatten — dass die Karte über der Seite
 * liegt, tragen Fläche und Linie.
 */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border-line bg-surface border p-4 ${className}`}>{children}</div>
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
 *
 * Seit dem Design-Handoff vom 2026-10-01 (Abschnitt 3, dort „Aufklapper")
 * kennt er vier Dinge mehr; ohne sie sieht er aus wie bisher:
 *
 *   * `anzahl` setzt einen Zähler in Klammern hinter den Titel („Erledigt
 *     heute (3)");
 *   * `kopf` wählt die Schrift des Kopfs: `text` (14 px, wie bisher), `betont`
 *     (14 px in 600) oder `label` (12 px Versalien, wie ein Abschnittstitel);
 *   * `inKarte` macht aus dem Aufklapper eine weiße Karte: Kopf 52 px hoch,
 *     der Inhalt mit einer Linie darüber;
 *   * `offenAb="lg"` öffnet ihn beim ersten Zeichnen ab 1024 px - für das,
 *     was am Rechner Platz hat und am Telefon nur auf Wunsch steht.
 *
 * `onUmschalten` meldet jedes Auf- und Zuklappen - für Inhalt, der erst beim
 * Öffnen geladen werden soll, weil schon das Lesen protokolliert wird.
 */
export function Disclosure({
  summary,
  anzahl,
  kopf = 'text',
  offen = false,
  offenAb,
  inKarte = false,
  onUmschalten,
  children,
}: {
  summary: ReactNode;
  anzahl?: number;
  kopf?: keyof typeof aufklappKoepfe;
  offen?: boolean;
  offenAb?: 'lg';
  inKarte?: boolean;
  onUmschalten?: (offen: boolean) => void;
  children: ReactNode;
}) {
  // Einmal beim ersten Zeichnen gelesen; danach entscheidet die Person. Wer
  // das Fenster später breiter zieht, bekommt nichts ungefragt aufgeklappt.
  const [anfangsOffen] = useState(() => offen || (offenAb === 'lg' && abBreite(BREITE_LG)));
  return (
    <details
      open={anfangsOffen}
      onToggle={onUmschalten ? (e) => onUmschalten(e.currentTarget.open) : undefined}
      // In der Karte 4 px über und unter dem 44 px hohen Kopf: zusammen die
      // 52 px des Handoffs, ohne zwei Mindesthöhen am selben Element.
      className={
        inKarte
          ? 'group rounded-card border-line bg-surface border px-4 py-1'
          : 'group border-line mt-2 border-t pt-2'
      }
    >
      <summary className={`${aufklappKopfKlassen} ${aufklappKoepfe[kopf]}`}>
        <Aufklappzeichen />
        {summary}
        {/* Der Zähler ist ein eigenes Element neben dem Titel: Der Titel darf
            eine Überschrift sein, und die gehört nicht in ein `span`. Das
            Leerzeichen davor steht für Vorlesesoftware da; sichtbar trägt den
            Abstand der Kopf selbst. */}
        {anzahl === undefined ? null : <span className="-ml-1"> ({anzahl})</span>}
      </summary>
      <div className={inKarte ? 'border-line mt-1 border-t pt-3 pb-2.5' : 'mt-2'}>{children}</div>
    </details>
  );
}

/** Ab dieser Fensterbreite gilt `offenAb="lg"` - Tailwinds `lg`. */
const BREITE_LG = 1024;

/** Ist das Fenster mindestens so breit? Ohne `matchMedia` (Tests): nein. */
function abBreite(pixel: number): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(`(min-width: ${pixel}px)`).matches
  );
}

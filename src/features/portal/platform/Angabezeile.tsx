import { Link } from 'react-router-dom';

/**
 * Die ganze Zeile ist das Ziel, Druck wie an jeder Zeile der Plattform. Der Fokus liegt außen, weil
 * die Zeile ohne Innenabstand an der Kante der Spalte steht.
 */
const ZIEL =
  'text-ink hover:bg-surface-sunken active:bg-surface-sunken ease-druck focus-visible:outline-ink grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 no-underline transition-[background-color,scale] duration-120 focus-visible:outline-3 focus-visible:outline-offset-2 motion-safe:active:scale-98 max-[23rem]:grid-cols-1 [[data-schrift=sehr-gross]_&]:grid-cols-1';

/** Der Pfeil 22 in Leise; wie an `Uebungszeile` fällt er unter 23rem und bei „Sehr groß“ weg. */
function Pfeil() {
  return (
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
      className="text-ink-muted size-5.5 shrink-0 max-[23rem]:hidden [[data-schrift=sehr-gross]_&]:hidden"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/**
 * Eine Frage unter „Meine Angaben“: Kurzname, Tag und der letzte Wert, wie er gesendet
 * wurde - kein Vergleich, keine Richtung, keine Farbe nach Wert (ADR-006 Punkt 11). Vorgelesen
 * „Schmerz in Ruhe, 3 von 10, zuletzt am 21. Oktober“; der sichtbare Wert ist dafür ausgeblendet.
 */
export function Angabezeile({
  to,
  kurz,
  wert,
  einheit,
  tag,
}: {
  to: string;
  /** Der Kurzname der Frage, etwa „Schmerz in Ruhe“. */
  kurz: string;
  wert: string;
  /** „von 10“ bei Skalen, sonst die Einheit der Frage („Stunden“, „von 7 Tagen“). */
  einheit: string;
  /** Der Tag der letzten Angabe in Worten, etwa „21. Oktober“. */
  tag: string;
}) {
  return (
    <li className="border-line border-b">
      <Link to={to} className={`${ZIEL} min-h-18 py-2.5`}>
        <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {/* Der Name schrumpft bis auf sein längstes Wort (`break-word`, nicht `anywhere`); erst
              dann rückt der Wert darunter - unter 23rem und bei „Sehr groß“ unter einen langen Namen. */}
          <span className="min-w-min grow basis-0 wrap-break-word">
            <span className="trennen-schmal block font-semibold">{kurz}</span>
            <span className="sr-only">{`, ${wert} ${einheit},`}</span>{' '}
            <span className="text-ink-muted block">zuletzt am {tag}</span>
          </span>
          <span aria-hidden="true" className="whitespace-nowrap tabular-nums">
            <span className="text-[1.625rem] leading-none font-bold">{wert}</span>
            <span className="text-ink-muted"> {einheit}</span>
          </span>
        </span>
        <Pfeil />
      </Link>
    </li>
  );
}

/** Ein Weg weiter unter „Meine Angaben“, etwa „Alle Antworten als Tabelle“: Zeile 56 mit Pfeil. */
export function Zielzeile({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className={`${ZIEL} border-line min-h-14 border-y py-2 font-semibold`}>
      <span className="min-w-0">{children}</span>
      <Pfeil />
    </Link>
  );
}

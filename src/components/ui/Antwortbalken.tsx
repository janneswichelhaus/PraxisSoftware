import { ProgressBar } from './ProgressBar';

/** Eine Antwort: Tag in Ziffern, Wert, wie er gelesen wird, und ein Vermerk wie „Vertretung“. */
export interface Antwort {
  datum: string;
  wert: number;
  text: string;
  vermerk?: string | undefined;
}

/**
 * Die Antworten einer Frage als Zeilen mit Tag, Balken und Zahl, die jüngste oben: jede Antwort
 * steht da, nichts geglättet, keine Linie, keine Farbe nach Wert (ADR-006 Punkt 11). Unter 23rem und
 * bei „Sehr groß“ steht der Tag über Balken und Zahl.
 */
export function Antwortbalken({
  beschriftung,
  antworten,
  min,
  max,
}: {
  /** Name der Liste für Vorlesesoftware. */
  beschriftung: string;
  antworten: readonly Antwort[];
  min: number;
  max: number;
}) {
  return (
    // Ein Raster für alle Zeilen: Die Spalte der Zahl ist überall gleich breit, die Balken gleich lang.
    <ul
      aria-label={beschriftung}
      className="border-line grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(2.5rem,auto)] gap-x-3 border-t max-[23rem]:grid-cols-[minmax(0,1fr)_minmax(2.5rem,auto)] [[data-schrift=sehr-gross]_&]:grid-cols-[minmax(0,1fr)_minmax(2.5rem,auto)]"
    >
      {antworten.map((a, i) => (
        <li
          key={`${a.datum}-${i}`}
          className="border-line col-span-full grid min-h-14 grid-cols-subgrid items-center gap-y-1 border-b py-1.5"
        >
          <span className="tabular-nums max-[23rem]:col-span-2 [[data-schrift=sehr-gross]_&]:col-span-2">
            {a.datum}
            {a.vermerk ? <span className="text-ink-muted"> ·&nbsp;{a.vermerk}</span> : null}
            <span className="sr-only">: </span>
          </span>
          <ProgressBar kante wert={a.wert - min} von={max - min} />
          <span className="text-abschnitt text-right font-bold whitespace-nowrap tabular-nums">
            {a.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

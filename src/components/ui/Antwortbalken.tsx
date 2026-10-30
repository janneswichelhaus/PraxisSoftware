import { ProgressBar } from './ProgressBar';

/** Eine Antwort: Tag in Ziffern, Wert, wie er gelesen wird, und ein Vermerk wie „Vertretung“. */
export interface Antwort {
  datum: string;
  wert: number;
  text: string;
  /** Die Einheit einer Zahl, etwa „Stunden“; eine Skala braucht keine. */
  einheit?: string | undefined;
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
      {antworten.map((a, i) => {
        // Gestapelt stehen Balken und Zahl unter dem Tag und dem Vermerk.
        const unten = a.vermerk
          ? 'max-[23rem]:row-start-3 [[data-schrift=sehr-gross]_&]:row-start-3'
          : 'max-[23rem]:row-start-2 [[data-schrift=sehr-gross]_&]:row-start-2';
        return (
          <li
            key={`${a.datum}-${i}`}
            className="border-line col-span-full grid min-h-14 grid-cols-subgrid content-center items-center gap-y-1 border-b py-1.5"
          >
            <span className="row-start-1 tabular-nums max-[23rem]:col-span-full [[data-schrift=sehr-gross]_&]:col-span-full">
              {a.datum}
              <span className="sr-only">{a.vermerk ? ' · ' : ': '}</span>
            </span>
            {/* Der Vermerk („Vertretung“, der Plan) in eigener Zeile unter dem Tag: In dessen Spalte
                bräche ein langer Plantitel mitten im Wort. Vorgelesen „14.10.2026 · Vertretung: 5“. */}
            {a.vermerk ? (
              <span className="text-ink-muted col-span-full row-start-2">
                {a.vermerk}
                <span className="sr-only">: </span>
              </span>
            ) : null}
            <span className={`row-start-1 ${unten}`}>
              <ProgressBar kante wert={a.wert - min} von={max - min} />
            </span>
            <span className={`row-start-1 text-right whitespace-nowrap tabular-nums ${unten}`}>
              <span className="text-abschnitt font-bold">{a.text}</span>
              {a.einheit ? <span className="text-ink-muted"> {a.einheit}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

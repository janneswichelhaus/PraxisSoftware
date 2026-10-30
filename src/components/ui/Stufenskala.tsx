import { useState } from 'react';
import { HakenSymbol } from './HakenSymbol';
import { useDoppeltipp } from './doppeltipp';

/**
 * Skala 0 bis 10 in zwei gleich langen Reihen, unter 23rem drei je Reihe, ab 44rem Feld eine
 * (ANN-787). Schalter wie beim Barometer: Ein zweiter Tipp nimmt zurück, nichts ist vorgewählt.
 */
export function Stufenskala({
  beschriftetVon,
  min = 0,
  max = 10,
  enden,
  wert,
  onChange,
  gesperrt = false,
}: {
  /** Kennung der Frage, die die Gruppe benennt. */
  beschriftetVon: string;
  min?: number;
  max?: number;
  /** Die Wörter an den Enden für Vorlesesoftware, etwa `['keine', 'stärkste vorstellbare']`. */
  enden?: readonly [string, string] | undefined;
  wert: number | null;
  onChange: (wert: number | null) => void;
  gesperrt?: boolean;
}) {
  // Der Haken federt nur nach einem Tipp, nicht beim ersten Zeichnen.
  const [getippt, setGetippt] = useState<number | null>(null);
  const doppeltipp = useDoppeltipp();
  const stufen = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const elf = stufen.length === 11;
  return (
    <div className="@container">
      <div
        role="group"
        aria-labelledby={beschriftetVon}
        className={
          elf
            ? '@skalenreihe:grid-cols-11 grid grid-cols-[repeat(30,minmax(0,1fr))] gap-2 max-[23rem]:grid-cols-6'
            : 'grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2'
        }
      >
        {stufen.map((stufe) => {
          const an = wert === stufe;
          const ende = enden ? (stufe === min ? enden[0] : stufe === max ? enden[1] : null) : null;
          return (
            <button
              key={stufe}
              type="button"
              aria-pressed={an}
              aria-label={ende ? `${stufe} – ${ende}` : undefined}
              disabled={gesperrt}
              onClick={() => {
                if (an && doppeltipp.zuFrueh(String(stufe))) return;
                if (!an) doppeltipp.gewaehlt(String(stufe));
                setGetippt(stufe);
                onChange(an ? null : stufe);
              }}
              className={`rounded-button ease-druck focus-visible:outline-ink text-abschnitt flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 tabular-nums transition-colors duration-120 focus-visible:outline-3 focus-visible:outline-offset-2 disabled:cursor-not-allowed max-[23rem]:min-h-13 max-[23rem]:text-xl [.plattform-schrift[data-rechner]_&]:min-h-15 ${spalte(stufe - min, elf)} ${
                an
                  ? 'border-accent bg-accent text-surface active:bg-accent-hover border-2 font-bold'
                  : 'border-line-strong bg-surface text-ink active:bg-surface-sunken border font-bold'
              }`}
            >
              {an ? (
                <HakenSymbol className={`size-4 ${getippt === stufe ? 'haken-gesetzt' : ''}`} />
              ) : null}
              <span aria-hidden={ende ? true : undefined}>{stufe}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Die Spalten einer Stufe in den Rastern aus 30, 6 und 11 Spalten. */
function spalte(index: number, elf: boolean): string {
  if (!elf) return '';
  const telefon = index <= 5 ? 'col-span-5' : 'col-span-6';
  const schmal = index <= 8 ? 'max-[23rem]:col-span-2' : 'max-[23rem]:col-span-3';
  return `${telefon} ${schmal} @skalenreihe:col-span-1`;
}

import { useEffect, useRef, useState } from 'react';
import { monatPlus, monatsBeginn, monatsRaster } from './calendar';

/**
 * Der Monatskalender zum Aufklappen über dem Raster (BEF-039, **ANN-109**).
 *
 * Er ersetzt den Weg über „Heute" und die Pfeile, wenn das Ziel weiter weg
 * liegt: ein Tipp auf einen Tag, und der Kalender steht dort — in der Ansicht,
 * die gerade gilt. Blättern im Blatt selbst ändert nichts am Kalender; erst
 * die Wahl eines Tages tut es.
 *
 * Tastatur: Der Fokus liegt beim Öffnen auf dem gewählten Tag, Escape
 * schließt. Jeder Tag trägt seinen vollen Namen für Vorlesesoftware.
 */

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

function monatsName(monatsErster: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${monatsErster}T00:00:00Z`));
}

function tagesName(tag: string): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(`${tag}T00:00:00Z`),
  );
}

export function Monatskalender({
  id,
  datum,
  heute,
  gewaehlt,
  onWaehlen,
  onSchliessen,
}: {
  id: string;
  /** Der Tag, auf dem der Kalender steht; sein Monat wird zuerst gezeigt. */
  datum: string;
  heute: string;
  /** Die Tage, die der Kalender gerade zeigt - ein Tag oder eine Woche. */
  gewaehlt: readonly string[];
  onWaehlen: (tag: string) => void;
  onSchliessen: () => void;
}) {
  const [monat, setMonat] = useState(() => monatsBeginn(datum));
  const gewaehltRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    gewaehltRef.current?.focus({ preventScroll: true });
  }, []);

  const wochen = monatsRaster(monat);

  return (
    <div
      id={id}
      role="group"
      aria-label="Monatskalender"
      className="border-line-strong bg-surface rounded-card mt-2 w-full max-w-sm border p-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onSchliessen();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Vorheriger Monat"
          onClick={() => setMonat(monatPlus(monat, -1))}
          className="text-accent hover:bg-surface-sunken rounded-button inline-flex size-11 items-center justify-center text-lg"
        >
          ‹
        </button>
        <p className="text-ink text-sm font-semibold" aria-live="polite">
          {monatsName(monat)}
        </p>
        <button
          type="button"
          aria-label="Nächster Monat"
          onClick={() => setMonat(monatPlus(monat, 1))}
          className="text-accent hover:bg-surface-sunken rounded-button inline-flex size-11 items-center justify-center text-lg"
        >
          ›
        </button>
      </div>
      <div className="mt-1 grid grid-cols-7 text-center">
        {WOCHENTAGE.map((w) => (
          <span key={w} aria-hidden="true" className="text-ink-subtle py-1 text-xs">
            {w}
          </span>
        ))}
        {wochen.flat().map((tag) => {
          const imMonat = tag.startsWith(monat.slice(0, 7));
          const istGewaehlt = gewaehlt.includes(tag);
          const istHeute = tag === heute;
          return (
            <button
              key={tag}
              ref={tag === datum ? gewaehltRef : undefined}
              type="button"
              aria-label={tagesName(tag)}
              aria-pressed={istGewaehlt}
              aria-current={istHeute ? 'date' : undefined}
              onClick={() => onWaehlen(tag)}
              className={[
                'rounded-button mx-auto inline-flex size-10 items-center justify-center text-sm tabular-nums',
                istGewaehlt
                  ? 'bg-accent text-surface font-semibold'
                  : imMonat
                    ? 'text-ink hover:bg-surface-sunken'
                    : 'text-ink-subtle hover:bg-surface-sunken',
                istHeute && !istGewaehlt ? 'ring-accent font-semibold ring-2 ring-inset' : '',
              ].join(' ')}
            >
              {Number(tag.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

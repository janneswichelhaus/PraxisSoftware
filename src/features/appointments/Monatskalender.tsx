import { useEffect, useRef, useState } from 'react';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
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
 * schließt. Jeder Tag trägt seinen vollen Namen für Vorlesesoftware. Wohin
 * der Fokus nach dem Schließen geht - auf den Monatsknopf (KAL-21) -,
 * entscheidet die Seite, die das Blatt aufgeklappt hat.
 *
 * Jeder Tag ist 44 × 44 px groß (KAL-08): sieben davon passen in `max-w-sm`,
 * und mit Handschuhen trifft man einen 40-px-Tag schlecht.
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
        <Symbolknopf
          beschriftung="Vorheriger Monat"
          className="text-lg"
          onClick={() => setMonat(monatPlus(monat, -1))}
        >
          ‹
        </Symbolknopf>
        <p className="text-ink text-sm font-semibold" aria-live="polite">
          {monatsName(monat)}
        </p>
        <Symbolknopf
          beschriftung="Nächster Monat"
          className="text-lg"
          onClick={() => setMonat(monatPlus(monat, 1))}
        >
          ›
        </Symbolknopf>
      </div>
      <div className="mt-1 grid grid-cols-7 text-center">
        {WOCHENTAGE.map((w) => (
          <span key={w} aria-hidden="true" className="text-ink-muted py-1 text-xs">
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
              aria-label={istHeute ? `${tagesName(tag)}, heute` : tagesName(tag)}
              aria-pressed={istGewaehlt}
              aria-current={istHeute ? 'date' : undefined}
              onClick={() => onWaehlen(tag)}
              className={[
                'rounded-button relative mx-auto inline-flex size-11 flex-col items-center justify-center text-sm tabular-nums',
                istGewaehlt
                  ? 'bg-accent text-surface font-semibold'
                  : imMonat
                    ? 'text-ink hover:bg-surface-sunken'
                    : 'text-ink-muted hover:bg-surface-sunken',
                istHeute && !istGewaehlt ? 'border-accent border-2 font-semibold' : '',
                // BEF-074: In der Woche ist heute mit sechs anderen Tagen
                // gewählt und wäre sonst nicht zu erkennen - der Ring bleibt.
                istHeute && istGewaehlt ? 'ring-ink ring-2 ring-offset-2' : '',
              ].join(' ')}
            >
              {Number(tag.slice(8))}
              {istHeute ? (
                // Ein Punkt unter der Zahl: heute, auch ohne Farbe erkennbar.
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 size-1 rounded-full bg-current"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

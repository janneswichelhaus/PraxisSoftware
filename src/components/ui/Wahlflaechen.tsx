import { useId, useState } from 'react';
import { HakenSymbol } from './HakenSymbol';
import { Zwischentitel } from './Zwischentitel';

/** Eine Wahl: Schlüssel für die Seite, Wort für die Person. */
export interface Wahl {
  schluessel: string;
  text: string;
}

/**
 * Wahlflächen statt Kästchen: je Wahl ein Schalter mit `aria-pressed`, mehrere zugleich, nichts
 * vorgewählt; was welche Wahl zurücknimmt, entscheidet die Seite. Gewählt tragen Linie, Fläche,
 * Schrift und Haken den Zustand, nie die Farbe allein; der Haken federt nur nach einem Tipp.
 */
export function Wahlflaechen({
  titel,
  ebene = 2,
  wahlen,
  gewaehlt,
  onUmschalten,
}: {
  /** Die Frage über den Flächen, etwa „Zu welcher Tageszeit?“. */
  titel: string;
  ebene?: 2 | 3;
  wahlen: readonly Wahl[];
  /** Die Schlüssel der gewählten Flächen. */
  gewaehlt: readonly string[];
  onUmschalten: (schluessel: string) => void;
}) {
  const titelId = useId();
  const [getippt, setGetippt] = useState<string | null>(null);
  return (
    <div>
      <Zwischentitel ebene={ebene} id={titelId}>
        {titel}
      </Zwischentitel>
      <div
        role="group"
        aria-labelledby={titelId}
        className="grid grid-cols-2 gap-3 max-[23rem]:grid-cols-1 [[data-schrift=sehr-gross]_&]:grid-cols-1"
      >
        {wahlen.map((w) => {
          const an = gewaehlt.includes(w.schluessel);
          return (
            <button
              key={w.schluessel}
              type="button"
              aria-pressed={an}
              onClick={() => {
                setGetippt(w.schluessel);
                onUmschalten(w.schluessel);
              }}
              className={`rounded-button ease-druck focus-visible:outline-ink flex min-h-16 min-w-0 items-center justify-between gap-3 text-left wrap-break-word hyphens-manual transition-colors duration-120 focus-visible:outline-3 focus-visible:outline-offset-2 [[data-schrift=sehr-gross]_&]:min-h-18 ${
                // Die Linie 2 der Wahl nimmt sich ihren Pixel aus dem Innenabstand:
                // Das Wort springt beim Wählen nicht.
                an
                  ? 'border-accent bg-accent-soft text-accent active:bg-surface-sunken border-2 px-[calc(1rem-1px)] py-[calc(0.5rem-1px)] font-bold'
                  : 'border-line-strong bg-surface text-ink active:bg-surface-sunken border px-4 py-2 font-semibold'
              }`}
            >
              <span className="min-w-0">{w.text}</span>
              {an ? (
                <span
                  aria-hidden="true"
                  className={`bg-accent text-surface rounded-pill inline-flex size-6 shrink-0 items-center justify-center ${
                    getippt === w.schluessel ? 'haken-gesetzt' : ''
                  }`}
                >
                  <HakenSymbol className="size-4" />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="border-line-strong rounded-pill inline-block size-5.5 shrink-0 border"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

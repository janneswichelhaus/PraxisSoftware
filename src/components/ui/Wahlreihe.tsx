import { useId, type ReactNode } from 'react';

export interface Wahl<W extends string> {
  wert: W;
  text: string;
  /** Ein Zeichen vor dem Text, etwa der Farbpunkt einer Person (TEAM-006). */
  zeichen?: ReactNode;
}

/**
 * Eine Wahl aus zwei bis vier Werten in einem Formular: „In Ordnung,
 * Beobachten, Problem“ je Prüfpunkt, „Beobachten, Problem“ an einer Stelle am
 * Rad (FLT-EPIC-001). Mit `zeichen` je Wahl auch mehr Werte, die man am
 * Zeichen erkennt - die acht Farben einer Person im Teamchat (TEAM-006).
 *
 * Radioknöpfe in einer Gruppe (`fieldset` mit `legend`), jeder als Tippfläche
 * von 44 px mit Rand; die gewählte trägt ein Häkchen und liegt auf der
 * Akzentfläche - Zeichen und Wort, nicht nur Farbe (DESIGN.md Regel 5). Der
 * Fokus steht auf dem ausgeblendeten Radio und wird an der Fläche sichtbar.
 * Die Pfeiltasten wechseln wie in jeder Radiogruppe des Browsers.
 *
 * Kein `Segment`: Das ist der Ansichtswechsel (ANN-407) und gefüllt in der
 * Hauptfarbe; hier wird ein Wert eingegeben. Bis FLT-EPIC-001 stand dieselbe
 * Gruppe als eigene Klassenkette in der Vorschau des Check-Ups und der
 * Erstattungen.
 */
export function Wahlreihe<W extends string>({
  legende,
  wahlen,
  gewaehlt,
  onWaehlen,
  legendeSichtbar = true,
  zusatz,
  gleichgewichtet = false,
}: {
  /** Name der Gruppe, etwa der Prüfpunkt „Bremsen“. */
  legende: ReactNode;
  wahlen: readonly Wahl<W>[];
  /** Der gewählte Wert; `null`, solange nichts gewählt ist. */
  gewaehlt: W | null;
  onWaehlen: (wert: W) => void;
  /** Ohne sichtbare Legende, wenn eine Beschriftung daneben schon steht. */
  legendeSichtbar?: boolean;
  /** Eine Zeile unter der Wahl, etwa „Am Rad markiert: Stelle 1“. */
  zusatz?: ReactNode;
  /**
   * Jede Wahl gleich breit und 48 hoch, das Wort mittig - für eine
   * Entscheidung, bei der keine Antwort näher liegen darf als die andere:
   * „Ja, erlauben“ / „Nein“ einer Einwilligung (Handoff 2026-10-22,
   * Abschnitt 5.3). Wird es eng, steht jede Wahl in einer eigenen Zeile.
   */
  gleichgewichtet?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className={legendeSichtbar ? 'text-ink text-liste mb-2' : 'sr-only'}>
        {legende}
      </legend>
      <div className="flex flex-wrap gap-2">
        {wahlen.map((wahl) => {
          const an = wahl.wert === gewaehlt;
          return (
            <label
              key={wahl.wert}
              className={`rounded-button has-[:focus-visible]:outline-accent inline-flex cursor-pointer items-center gap-1.5 border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                gleichgewichtet ? 'min-h-12 flex-1 basis-36 justify-center text-center' : 'min-h-11'
              } ${
                an
                  ? 'border-accent bg-accent-soft text-accent font-medium'
                  : 'border-line-strong bg-surface text-ink-muted'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={wahl.wert}
                className="sr-only"
                checked={an}
                onChange={() => onWaehlen(wahl.wert)}
              />
              {an ? <span aria-hidden="true">✓</span> : null}
              {wahl.zeichen}
              {wahl.text}
            </label>
          );
        })}
      </div>
      {zusatz ? <div className="mt-2">{zusatz}</div> : null}
    </fieldset>
  );
}

/**
 * Wie die `Wahlreihe`, aber mit Kästchen: keine, eine oder mehrere Werte -
 * etwa die Wochentage, an denen die Stammnutzer:in ihr Rad fährt
 * (FLT-EPIC-001). Dieselben Flächen, dasselbe Häkchen.
 */
export function Mehrfachwahl<W extends string>({
  legende,
  wahlen,
  gewaehlt,
  onAendern,
  legendeSichtbar = true,
}: {
  legende: ReactNode;
  wahlen: readonly Wahl<W>[];
  gewaehlt: readonly W[];
  onAendern: (werte: W[]) => void;
  legendeSichtbar?: boolean;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className={legendeSichtbar ? 'text-ink text-liste mb-2' : 'sr-only'}>
        {legende}
      </legend>
      <div className="flex flex-wrap gap-2">
        {wahlen.map((wahl) => {
          const an = gewaehlt.includes(wahl.wert);
          return (
            <label
              key={wahl.wert}
              className={`rounded-button has-[:focus-visible]:outline-accent inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                an
                  ? 'border-accent bg-accent-soft text-accent font-medium'
                  : 'border-line-strong bg-surface text-ink-muted'
              }`}
            >
              <input
                type="checkbox"
                value={wahl.wert}
                className="sr-only"
                checked={an}
                onChange={() =>
                  onAendern(
                    an
                      ? gewaehlt.filter((wert) => wert !== wahl.wert)
                      : wahlen
                          .map((w) => w.wert)
                          .filter((wert) => wert === wahl.wert || gewaehlt.includes(wert)),
                  )
                }
              />
              {an ? <span aria-hidden="true">✓</span> : null}
              {wahl.zeichen}
              {wahl.text}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

import { useId, useState, type CSSProperties } from 'react';
import { HakenSymbol } from './HakenSymbol';
import { Zwischentitel } from './Zwischentitel';

/** Ein Tag der Leiste: ISO-Nummer, sichtbar kurz, vorgelesen lang. */
export interface Wochentag {
  nummer: number;
  kurz: string;
  lang: string;
}

/**
 * Wochentage in einer Zeile (Handoff 2026-10-24, Abschnitt 3; DR-128): sieben
 * Schalter, „Mo“ bis „So“ sichtbar, vorgelesen „Montag“ bis „Sonntag“, mehrere
 * zugleich wählbar - die Übungstage der Plattform. Gewählt heißt gefüllt, mit
 * Haken und fett; Farbe trägt nie allein. Darunter der Satz der Seite als
 * Live-Region.
 *
 * **Ein Segment ohne Abstand** (ANN-708): Sieben Ziele mit 8 px Abstand
 * ließen bei 375 px je 41 px; aneinandergesetzt hat jedes knapp 48 × 56. Wie
 * beim `Segment` gilt die Ausnahme vom Abstand zwischen Zielen (PLATTFORM.md)
 * nur innerhalb der Leiste. Unter 23rem (200 %) wird sie ein Raster mit drei
 * Spalten, jede Zelle ein eigener Knopf 48 hoch mit 8 Abstand.
 *
 * Der Fokus ist ein Ring von 3 px innen: Tinte, auf einem gewählten Tag Papier
 * (auf der Hauptfarbe läge Tinte bei 1,6:1).
 *
 * `gesperrt` (ohne Netz): lesbar, aber gestrichelt und nicht bedienbar - der
 * Satz sagt, wann Ändern wieder geht, statt eines Tipps, der zurückspringt.
 * Speichern bleibt bei der Seite.
 */
export function Wochenleiste({
  titel,
  wochentage,
  tage,
  onUmschalten,
  satz,
  gesperrt = false,
  ebene = 3,
  autofokus = false,
}: {
  /** Die Überschrift der Gruppe, etwa „Ihre Übungstage“ (`h3`) oder „An welchen Tagen?“ (`h2`). */
  titel: string;
  /** Die Tage der Woche in ihrer Reihenfolge. */
  wochentage: readonly Wochentag[];
  /** Die gewählten Tage (ISO-Nummern). */
  tage: readonly number[];
  onUmschalten: (tag: number) => void;
  /** Der Satz darunter, etwa wie oft und was empfohlen ist. */
  satz: string;
  gesperrt?: boolean;
  /** Die Ebene der Überschrift: im Reiter 3, als Frage eines Ablaufs 2. */
  ebene?: 2 | 3;
  /** In einem Fenster beginnt der Fokus beim ersten Tag, nicht im Kopf. */
  autofokus?: boolean;
}) {
  const titelId = useId();
  // Der Haken federt nur nach einem Tipp, nicht beim ersten Zeichnen.
  const [getippt, setGetippt] = useState<number | null>(null);
  const linie = gesperrt ? 'border-dashed' : 'border-solid';
  return (
    <div>
      <Zwischentitel ebene={ebene} id={titelId}>
        {titel}
      </Zwischentitel>
      <div
        role="group"
        aria-labelledby={titelId}
        // So viele Spalten wie Tage: sieben im Reiter, Montag bis Freitag im
        // Wunsch (Handoff „Termine“, Abschnitt 3).
        style={{ '--spalten': wochentage.length } as CSSProperties}
        className={`border-line-strong rounded-button max-w-wochenleiste grid grid-cols-[repeat(var(--spalten),minmax(0,1fr))] overflow-hidden border max-[23rem]:grid-cols-3 max-[23rem]:gap-2 max-[23rem]:overflow-visible max-[23rem]:border-0 ${linie}`}
      >
        {wochentage.map((w, index) => {
          const an = tage.includes(w.nummer);
          return (
            <button
              key={w.nummer}
              type="button"
              aria-pressed={an}
              disabled={gesperrt}
              {...(autofokus && index === 0 ? { 'data-autofocus': true } : {})}
              onClick={() => {
                setGetippt(w.nummer);
                onUmschalten(w.nummer);
              }}
              className={`border-line-strong ease-druck focus-visible:outline-ink aria-pressed:focus-visible:outline-surface max-[23rem]:rounded-button flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 transition-colors duration-120 not-first:border-l focus-visible:outline-3 focus-visible:-outline-offset-3 disabled:cursor-not-allowed max-[23rem]:min-h-12 max-[23rem]:border ${linie} ${zelle(an, gesperrt)}`}
            >
              {an ? (
                <HakenSymbol className={`size-4 ${getippt === w.nummer ? 'haken-gesetzt' : ''}`} />
              ) : null}
              <span aria-hidden="true">{w.kurz}</span>
              <span className="sr-only">{w.lang}</span>
            </button>
          );
        })}
      </div>
      <p role="status" className="text-ink-muted mt-2">
        {satz}
      </p>
    </div>
  );
}

/** Fläche und Schrift einer Zelle: gewählt gefüllt, gesperrt leise. */
function zelle(an: boolean, gesperrt: boolean): string {
  if (gesperrt) {
    return an
      ? 'bg-accent-soft text-accent font-bold max-[23rem]:border-accent'
      : 'bg-surface text-ink-muted font-semibold';
  }
  return an
    ? 'bg-accent text-surface active:bg-accent-hover font-bold max-[23rem]:border-accent'
    : 'bg-surface text-ink active:bg-surface-sunken font-semibold';
}

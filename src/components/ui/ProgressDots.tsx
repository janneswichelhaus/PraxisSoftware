import type { ReactNode } from 'react';

/**
 * Zustand eines Punkts: erledigt, der nächste, ein späterer - und die beiden
 * Ausgänge ohne Behandlung.
 */
export type ProgressDot = 'erledigt' | 'naechster' | 'offen' | 'abgesagt' | 'nicht_angetroffen';

const punkte: Record<ProgressDot, string> = {
  erledigt: 'border-accent bg-accent',
  naechster: 'border-accent bg-surface',
  offen: 'border-line-strong bg-surface-sunken',
  abgesagt: 'border-danger bg-danger',
  nicht_angetroffen: 'border-warnung bg-warnung',
};

/**
 * Tagesfortschritt: ein Punkt je Behandlungstermin und daneben der Satz
 * (Design-Handoff 2026-10-01, Abschnitt 5a Punkt 3).
 *
 * Die Punkte sind Schmuck und für Vorlesesoftware ausgeblendet; was zählt,
 * steht als Text daneben („1 von 4 Besuchen erledigt"). Welche Termine
 * zählen - Fehlzeiten nicht - und wie der Satz lautet, weiß die Seite.
 *
 * Ein Punkt wechselt seine Farbe in 200 ms, wenn ein Termin abgeschlossen
 * wird; bei reduzierter Bewegung springt er (`index.css`).
 */
export function ProgressDots({
  punkte: zustaende,
  children,
}: {
  punkte: readonly ProgressDot[];
  /** Der Satz daneben, etwa „1 von 4 Besuchen erledigt". */
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center gap-2.5">
      {zustaende.length > 0 ? (
        <span aria-hidden="true" className="inline-flex gap-[5px]">
          {zustaende.map((zustand, index) => (
            <span
              // Die Punkte haben keine Kennung außer ihrer Stelle im Tag.
              key={index}
              data-punkt={zustand}
              className={`rounded-pill size-3 border-2 transition-colors duration-200 ${punkte[zustand]}`}
            />
          ))}
        </span>
      ) : null}
      <span className="text-ink-muted text-sm whitespace-nowrap">{children}</span>
    </div>
  );
}

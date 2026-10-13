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
 * Das Zeichen im gefüllten Punkt, wie im Abzeichen der Zeile (`Badge`):
 * ✓ erledigt, × abgesagt, ! nicht angetroffen. Ohne Zeichen unterschieden
 * sich der grüne und der rote Punkt nur durch die Farbe (DESIGN.md Regel 5;
 * Design-Review R2, U1). Gezeichnet wie im Zeitstrahl (`PunktZeichen`):
 * 8 × 8 Einheiten, mittig, in Papierfarbe.
 */
const zeichen: Partial<Record<ProgressDot, { name: string; pfad: string }>> = {
  erledigt: { name: 'haken', pfad: 'M1.2 4.2 3.1 6 6.8 2' },
  abgesagt: { name: 'kreuz', pfad: 'M1.8 1.8 6.2 6.2M6.2 1.8 1.8 6.2' },
  nicht_angetroffen: { name: 'ausrufezeichen', pfad: 'M4 1.3V4.2M4 6.6v.01' },
};

function Zeichen({ zustand }: { zustand: ProgressDot }) {
  const art = zeichen[zustand];
  if (!art) return null;
  return (
    <svg
      data-zeichen={art.name}
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d={art.pfad} />
    </svg>
  );
}

/**
 * Tagesfortschritt: ein Punkt je Behandlungstermin und daneben der Satz
 * (Design-Handoff 2026-10-01, Abschnitt 5a Punkt 3).
 *
 * Die Punkte sind Schmuck und für Vorlesesoftware ausgeblendet; was zählt,
 * steht als Text daneben („1 von 4 Besuchen erledigt"). Welche Termine
 * zählen - Fehlzeiten nicht - und wie der Satz lautet, weiß die Seite. Ein
 * gefüllter Punkt trägt sein Zeichen (✓, ×, !): So erklärt sich auch der
 * Punkt einer Absage, die der Satz nicht mitzählt.
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
              className={`rounded-pill text-surface flex size-3 items-center justify-center border-2 transition-colors duration-200 ${punkte[zustand]}`}
            >
              <Zeichen zustand={zustand} />
            </span>
          ))}
        </span>
      ) : null}
      <span className="text-ink-muted text-sm whitespace-nowrap">{children}</span>
    </div>
  );
}

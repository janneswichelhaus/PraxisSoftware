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

/** Diese Zustände teilt die Doku in zwei Hälften; Absage und „nicht angetroffen" brauchen keine. */
const teilbar: ReadonlySet<ProgressDot> = new Set(['erledigt', 'naechster', 'offen']);

/**
 * Ein Punkt in zwei Hälften (ANN-547): links der Haken, rechts die Doku.
 * Voll und mit ✓ wird er erst, wenn beides da ist - das zeichnet der Aufrufer
 * als `erledigt` ohne Hälften.
 */
function HalberPunkt({
  zustand,
  doku,
}: {
  zustand: 'erledigt' | 'naechster' | 'offen';
  doku: boolean;
}) {
  const haken = zustand === 'erledigt';
  const rand = zustand === 'naechster' || haken || doku ? 'border-accent' : 'border-line-strong';
  const grund = zustand === 'naechster' ? 'bg-surface' : 'bg-surface-sunken';
  const haelfte = 'absolute inset-y-0 w-1/2 transition-colors duration-200';
  return (
    <span
      data-punkt={zustand}
      data-doku={doku ? 'ja' : 'nein'}
      className={`rounded-pill relative size-3 overflow-hidden border-2 transition-colors duration-200 ${rand} ${grund}`}
    >
      <span data-haelfte="haken" className={`${haelfte} left-0 ${haken ? 'bg-accent' : ''}`} />
      <span data-haelfte="doku" className={`${haelfte} right-0 ${doku ? 'bg-accent' : ''}`} />
    </span>
  );
}

/**
 * Das Laufrad, das einmal über die Punkte rollt, wenn der Tag fertig wird
 * (ANN-547). Selbst gezeichnet wie im Startbild: Die Marke wird nie gedreht
 * (`marke/README.md`). Nur die Speichen drehen sich; bei reduzierter Bewegung
 * bleibt es weg.
 */
function Rad() {
  return (
    <span
      aria-hidden="true"
      data-rad
      className="fortschritt-rad text-accent pointer-events-none absolute top-1/2 left-0 motion-reduce:hidden"
    >
      <svg width="16" height="16" viewBox="-8 -8 16 16" fill="none" stroke="currentColor">
        <circle r="6.5" strokeWidth="1.6" />
        <g className="fortschritt-rad-speichen" strokeWidth="1">
          {Array.from({ length: 6 }, (_, i) => {
            const winkel = (i / 6) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={Math.cos(winkel) * 1.2}
                y1={Math.sin(winkel) * 1.2}
                x2={Math.cos(winkel) * 5.8}
                y2={Math.sin(winkel) * 5.8}
              />
            );
          })}
          <circle r="1.2" />
        </g>
      </svg>
    </span>
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
 * Mit `doku` hat ein Punkt zwei Hälften, Haken links und Doku rechts; voll
 * mit ✓ ist er erst mit beidem (ANN-547). Zählt `feier` hoch, rollt einmal
 * ein Laufrad über die Reihe.
 *
 * Ein Punkt wechselt seine Farbe in 200 ms, wenn ein Termin abgeschlossen
 * wird; bei reduzierter Bewegung springt er (`index.css`).
 */
export function ProgressDots({
  punkte: zustaende,
  doku,
  feier = 0,
  children,
}: {
  punkte: readonly ProgressDot[];
  /** Je Punkt: Doku festgeschrieben? Ohne Angabe ein Punkt ohne Hälften. */
  doku?: readonly boolean[];
  /** Zählt hoch, wenn der Tag gerade fertig geworden ist. */
  feier?: number;
  /** Der Satz daneben, etwa „1 von 4 Besuchen erledigt". */
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center gap-2.5">
      {zustaende.length > 0 ? (
        <span aria-hidden="true" data-fortschritt className="relative inline-flex gap-[5px]">
          {zustaende.map((zustand, index) => {
            const dokuDa = doku?.[index];
            if (
              dokuDa !== undefined &&
              teilbar.has(zustand) &&
              !(zustand === 'erledigt' && dokuDa)
            ) {
              return (
                <HalberPunkt
                  // Die Punkte haben keine Kennung außer ihrer Stelle im Tag.
                  key={index}
                  zustand={zustand as 'erledigt' | 'naechster' | 'offen'}
                  doku={dokuDa}
                />
              );
            }
            return (
              <span
                // Die Punkte haben keine Kennung außer ihrer Stelle im Tag.
                key={index}
                data-punkt={zustand}
                {...(dokuDa === undefined ? {} : { 'data-doku': dokuDa ? 'ja' : 'nein' })}
                className={`rounded-pill text-surface flex size-3 items-center justify-center border-2 transition-colors duration-200 ${punkte[zustand]}`}
              >
                <Zeichen zustand={zustand} />
              </span>
            );
          })}
          {feier > 0 ? <Rad key={feier} /> : null}
        </span>
      ) : null}
      <span className="text-ink-muted text-sm whitespace-nowrap">{children}</span>
    </div>
  );
}

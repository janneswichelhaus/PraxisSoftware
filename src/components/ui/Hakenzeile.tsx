import { useEffect, useRef, useState } from 'react';
import { HakenSymbol } from './HakenSymbol';

/**
 * Ein Durchgang zum Abhaken (Handoff 2026-10-24, Abschnitt 3): die ganze
 * Zeile ist der Knopf, groß genug für einen Finger, der gerade eine Übung
 * gemacht hat. Offen ein leerer Kreis; erledigt die Fläche in Salbei hell, das
 * Wort „erledigt“ und der gefüllte Kreis mit Haken - Farbe trägt nie allein.
 * „{n}. Durchgang“ bricht nie mitten im Wort (BEF-196).
 *
 * **Die Pause als Ring** (ANN-709): Nach einem Haken zeigt die Zeile des
 * nächsten Durchgangs „Pause · 60 Sekunden“ und rechts einen Ring, der sich
 * über die Pause der Fachperson füllt - keine Zahl, die herunterzählt, kein
 * Ton, keine Alarmfarbe (DSN-001 Abschnitt 7 Nr. 8). Danach ist die Zeile
 * wieder offen. Wer nicht warten mag, tippt sie an: Das hakt ab und beendet
 * die Pause. Angesagt wird die Pause einmal von der Seite, nicht hier. Bei
 * „Bewegung reduzieren“ steht ein gestrichelter Ring still; das Ende zeigt
 * der Wechsel zum offenen Kreis.
 */
export function Hakenzeile({
  durchgang,
  erledigt,
  pause = null,
  onUmschalten,
  onPauseEnde,
}: {
  durchgang: number;
  erledigt: boolean;
  /** Die laufende Pause vor diesem Durchgang; `nummer` startet den Ring neu. */
  pause?: { sekunden: number; nummer: number } | null;
  onUmschalten: () => void;
  onPauseEnde?: () => void;
}) {
  const inPause = pause !== null && !erledigt;
  // Der Haken federt nur nach einem Tipp, nicht beim ersten Zeichnen einer
  // schon erledigten Zeile.
  const [getippt, setGetippt] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={erledigt}
      onClick={() => {
        setGetippt(true);
        onUmschalten();
      }}
      className={`rounded-card border-line bg-surface aria-pressed:border-accent aria-pressed:bg-accent-soft active:bg-surface-sunken aria-pressed:active:bg-surface-sunken ease-druck flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 border-2 py-2.5 pr-3.5 pl-5 text-left font-semibold transition-[background-color,border-color,scale] duration-120 motion-safe:active:scale-98 ${
        inPause ? 'min-h-19' : 'min-h-16'
      }`}
    >
      {/* Die Leerzeichen zwischen den Teilen halten den Namen des Knopfs
          lesbar („1. Durchgang erledigt“); im Flex-Raster zeichnen sie nichts. */}
      <span className="flex flex-col">
        <span className="whitespace-nowrap">{durchgang}. Durchgang</span>{' '}
        {inPause ? (
          <span className="text-ink-muted font-normal">Pause · {pause.sekunden} Sekunden</span>
        ) : null}
      </span>{' '}
      {erledigt ? (
        <span className="inline-flex items-center gap-2">
          <span className="text-accent">erledigt</span>
          <span
            aria-hidden="true"
            className={`bg-accent text-surface rounded-pill inline-flex size-9 items-center justify-center ${
              getippt ? 'haken-gesetzt' : ''
            }`}
          >
            <HakenSymbol className="size-5.5" />
          </span>
        </span>
      ) : inPause ? (
        <Pausenring key={pause.nummer} sekunden={pause.sekunden} onEnde={onPauseEnde} />
      ) : (
        <span
          aria-hidden="true"
          className="border-line-strong rounded-pill inline-block size-9 shrink-0 border-2"
        />
      )}
    </button>
  );
}

/** Umfang des Rings mit dem Radius 19 im Raster 44. */
const UMFANG = 2 * Math.PI * 19;

/**
 * Der Ring der Pause (ANN-709), 44 px: Spur 3, Füllung 5 in der Hauptfarbe mit runden
 * Enden, von oben im Uhrzeigersinn, linear über die ganze Pause (CSS
 * `pausenring-fuellung`). Das Ende misst eine Uhr, nicht die Animation - bei
 * „Bewegung reduzieren“ läuft keine, und die Pause endet trotzdem.
 */
function Pausenring({ sekunden, onEnde }: { sekunden: number; onEnde?: (() => void) | undefined }) {
  // Die Seite gibt bei jedem Zeichnen eine neue Funktion; die Uhr soll davon
  // nicht neu anlaufen.
  const ende = useRef(onEnde);
  useEffect(() => {
    ende.current = onEnde;
  }, [onEnde]);
  useEffect(() => {
    const uhr = window.setTimeout(() => ende.current?.(), sekunden * 1000);
    return () => window.clearTimeout(uhr);
  }, [sekunden]);
  return (
    <svg
      viewBox="0 0 44 44"
      aria-hidden="true"
      focusable="false"
      data-pausenring=""
      className="size-11 shrink-0 -rotate-90"
    >
      <circle cx="22" cy="22" r="19" fill="none" strokeWidth={3} className="stroke-spur" />
      <circle
        cx="22"
        cy="22"
        r="19"
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={UMFANG}
        className="stroke-accent pausenring-fuellung"
        style={{ animationDuration: `${sekunden}s` }}
      />
    </svg>
  );
}

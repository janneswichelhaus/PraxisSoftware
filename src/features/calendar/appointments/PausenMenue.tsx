import { useEffect, useRef, type CSSProperties } from 'react';
import { Button } from '@/components/ui/Button';
import {
  PAUSENPROBLEM_TEXT,
  type Pause,
  type Pausenproblem,
} from '@/features/calendar/scheduling/pause';
import { minuteZuZeit } from './calendar';

/** So weit verschiebt ein Tipp im Menü; feiner geht es mit Ziehen. */
export const PAUSEN_SCHRITT = 15;

/**
 * Das Menü an der Pause (ANN-863): Lage, was nicht stimmt, und Verschieben ohne
 * Ziehen (WCAG 2.5.7). Ob die neue Lage passt, entscheidet der Server.
 */
export function PausenMenue({
  pause,
  probleme,
  onVerschieben,
  onSchliessen,
  className = '',
  style,
}: {
  pause: Pause;
  probleme: readonly Pausenproblem[];
  onVerschieben?: ((vonMinute: number) => void) | undefined;
  onSchliessen: () => void;
  className?: string;
  style?: CSSProperties | undefined;
}) {
  const ersterRef = useRef<HTMLButtonElement>(null);
  const schliessenRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (ersterRef.current ?? schliessenRef.current)?.focus({ preventScroll: true });
  }, [pause.vonMinute]);

  return (
    <div
      role="group"
      aria-label="Pause"
      data-testid="pausen-menue"
      className={`border-line-strong bg-surface rounded-card border-2 p-3 ${className}`}
      style={style}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onSchliessen();
      }}
    >
      <p className="text-ink text-sm font-semibold tabular-nums">
        Pause {minuteZuZeit(pause.vonMinute)}–{minuteZuZeit(pause.bisMinute)}
      </p>
      {pause.verschoben ? (
        <p className="text-ink-muted text-sm tabular-nums">
          Im Plan ab {minuteZuZeit(pause.planVonMinute)}
        </p>
      ) : null}
      {probleme.map((problem) => (
        <p key={problem} className="text-warnung mt-1 text-sm">
          <span aria-hidden="true">! </span>
          {PAUSENPROBLEM_TEXT[problem]}
        </p>
      ))}
      <div className="mt-3 flex flex-wrap gap-2">
        {onVerschieben ? (
          <>
            {pause.vonMinute >= PAUSEN_SCHRITT ? (
              <Button
                ref={ersterRef}
                type="button"
                variant="secondary"
                groesse="kompakt"
                onClick={() => onVerschieben(pause.vonMinute - PAUSEN_SCHRITT)}
              >
                {PAUSEN_SCHRITT} Min. früher
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              disabled={pause.bisMinute + PAUSEN_SCHRITT >= 24 * 60}
              onClick={() => onVerschieben(pause.vonMinute + PAUSEN_SCHRITT)}
            >
              {PAUSEN_SCHRITT} Min. später
            </Button>
            {pause.verschoben ? (
              <Button
                type="button"
                variant="secondary"
                groesse="kompakt"
                onClick={() => onVerschieben(pause.planVonMinute)}
              >
                Wie im Plan
              </Button>
            ) : null}
          </>
        ) : null}
        <Button
          ref={schliessenRef}
          type="button"
          variant="quiet"
          groesse="kompakt"
          onClick={onSchliessen}
        >
          Schließen
        </Button>
      </div>
    </div>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Ein Block im Zeitraster, der kein Termin ist, etwa die Pause: so hoch wie seine Dauer,
 * Zeit oben, Wort darunter, Warnung mit Zeichen und Farbe. Ziehen und Menü bringt die Seite mit.
 */
export function Rasterblock({
  oben,
  hoehe,
  ton = 'neutral',
  ziehbar = false,
  gedimmt = false,
  className = '',
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'style'> & {
  /** Abstand zum oberen Rand des Rasters in Pixeln. */
  oben: number;
  hoehe: number;
  ton?: 'neutral' | 'warnung';
  ziehbar?: boolean;
  /** Während des Ziehens bleibt der alte Platz blass stehen. */
  gedimmt?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={[
        'rounded-button absolute inset-x-1 flex flex-col items-start justify-start overflow-hidden border px-1.5 py-0.5 text-left text-xs leading-4 whitespace-nowrap',
        ton === 'warnung'
          ? 'border-warnung bg-warnung-soft text-warnung'
          : 'border-line bg-surface-sunken text-ink-muted',
        ziehbar ? 'cursor-grab touch-pan-x touch-pan-y' : 'cursor-pointer',
        gedimmt ? 'opacity-40' : '',
        className,
      ].join(' ')}
      style={{ top: `${oben}px`, height: `${Math.max(hoehe, 1)}px` }}
      {...props}
    >
      {children}
    </button>
  );
}

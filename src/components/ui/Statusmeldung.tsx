import type { ReactNode } from 'react';

export type Meldungston = 'neutral' | 'fehler';

/**
 * Kurze Meldung im Fluss der Seite (UI-000).
 *
 * Der Grund für diesen Baustein ist nicht das Aussehen, sondern das Vorlesen:
 * die Fehlerabsätze neben Schaltflächen trugen bisher gar keine Rolle. Wer
 * nicht auf den Bildschirm sieht, erfuhr also nicht, dass ein Speichern
 * fehlgeschlagen ist. `fehler` bekommt deshalb `role="alert"` (unterbricht),
 * `neutral` bekommt `role="status"` (wird bei nächster Gelegenheit gelesen).
 *
 * Für ganze Zustände einer Seite — laden, leer, Ladefehler — bleibt
 * `Feedback.tsx` zuständig; diese Meldung ist die kleine Zeile daneben.
 */
export function Statusmeldung({
  ton = 'neutral',
  children,
  className = '',
}: {
  ton?: Meldungston;
  children: ReactNode;
  className?: string;
}) {
  const farbe = ton === 'fehler' ? 'text-danger' : 'text-ink-muted';
  return (
    <p role={ton === 'fehler' ? 'alert' : 'status'} className={`${farbe} text-sm ${className}`}>
      {children}
    </p>
  );
}

import type { ReactNode } from 'react';

export type Meldungston = 'neutral' | 'warnung' | 'fehler';

/**
 * Kurze Meldung im Fluss der Seite (UI-000).
 *
 * Der Grund für diesen Baustein ist nicht das Aussehen, sondern das Vorlesen:
 * die Fehlerabsätze neben Schaltflächen trugen bisher gar keine Rolle. Wer
 * nicht auf den Bildschirm sieht, erfuhr also nicht, dass ein Speichern
 * fehlgeschlagen ist. `fehler` bekommt deshalb `role="alert"` (unterbricht),
 * `neutral` und `warnung` bekommen `role="status"` (wird bei nächster
 * Gelegenheit gelesen).
 *
 * `warnung` ist seit UX-011 dazugekommen und ausdrücklich **kein** milderer
 * Fehler: Es ist die Meldung, die sichtbar sein muss, aber nichts unterbricht
 * - „der angezeigte Stand kann veraltet sein" etwa. Sie mit `fehler` zu
 * setzen hieße, eine Vorlesesoftware mitten im Satz zu unterbrechen für
 * etwas, das niemanden zum Handeln zwingt.
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
  const farbe =
    ton === 'fehler' ? 'text-danger' : ton === 'warnung' ? 'text-warnung' : 'text-ink-muted';
  return (
    <p role={ton === 'fehler' ? 'alert' : 'status'} className={`${farbe} text-sm ${className}`}>
      {children}
    </p>
  );
}

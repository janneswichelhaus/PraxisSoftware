import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { buttonKlassen, type Variant } from './Button';

/**
 * Ein Link, der aussieht wie eine Schaltfläche (UI-000).
 *
 * Wo eine Aktion in Wahrheit ein Seitenwechsel ist — „Patient anlegen",
 * „Termin anlegen", „Verordnung erfassen" —, gehört ein `<a>` in den
 * Seitenquelltext und kein `<button>` mit `navigate()`: nur so funktionieren
 * Mittelklick, neuer Tab und die Vorlesereihenfolge „Link" statt
 * „Schaltfläche".
 *
 * Die Klassen kommen aus `Button`, damit beide nicht auseinanderlaufen.
 */
export function ButtonLink({
  to,
  variant = 'primary',
  children,
}: {
  to: string;
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={buttonKlassen(variant)}>
      {children}
    </Link>
  );
}

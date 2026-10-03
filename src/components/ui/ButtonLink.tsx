import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { knopfKlassen, type Groesse, type Variant } from './buttonStile';

/**
 * Ein Link, der aussieht wie eine Schaltfläche (UI-000).
 *
 * Wo eine Aktion in Wahrheit ein Seitenwechsel ist — „Patient anlegen",
 * „Termin anlegen", „Verordnung erfassen", „Abbrechen" in einem Formular —,
 * gehört ein `<a>` in den Seitenquelltext und kein `<button>` mit
 * `navigate()`: nur so funktionieren Mittelklick, neuer Tab und die
 * Vorlesereihenfolge „Link" statt „Schaltfläche".
 *
 * Die Klassen kommen aus `Button`, damit beide nicht auseinanderlaufen.
 * `className` ergänzt sie (Abstände, Breite), `groesse` wirkt wie beim
 * Button, und `replace` ersetzt den Verlaufseintrag, statt einen neuen
 * anzulegen - für Wege, zu denen „Zurück" nicht wieder führen soll (UIK-13).
 */
export function ButtonLink({
  to,
  variant = 'primary',
  groesse = 'normal',
  className = '',
  replace,
  'aria-label': beschriftung,
  children,
}: {
  to: string;
  variant?: Variant;
  groesse?: Groesse;
  className?: string;
  replace?: boolean;
  /** Wenn die sichtbare Beschriftung allein nicht sagt, was sie bearbeitet. */
  'aria-label'?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={knopfKlassen(variant, groesse, className)}
      {...(replace === undefined ? {} : { replace })}
      {...(beschriftung === undefined ? {} : { 'aria-label': beschriftung })}
    >
      {children}
    </Link>
  );
}

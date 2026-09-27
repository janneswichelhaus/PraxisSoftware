import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { knopfKlassen, type Groesse, type Variant } from './buttonStile';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /**
   * `kompakt`: 44 px hoch, 14 px Schrift - die Klassen von
   * `kartenAktionKlassen` (UIK-14). Für mehrere Aktionen nebeneinander auf
   * einer Karte und für den Knopf in einem Fehlerkasten.
   */
  groesse?: Groesse;
  children: ReactNode;
  /** Fuer Fokusfuehrung, etwa bei einer Rueckfrage vor einem Vorgang. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'primary',
  groesse = 'normal',
  className = '',
  ...props
}: ButtonProps) {
  return <button className={knopfKlassen(variant, groesse, className)} {...props} />;
}

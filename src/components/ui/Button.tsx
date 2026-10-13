import { useContext, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { knopfKlassen, type Groesse, type Variant } from './buttonStile';
import { KnopfGroesseKontext } from './knopfGroesse';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /**
   * `kompakt`: 44 px hoch, 14 px Schrift - die Klassen von
   * `kartenAktionKlassen` (UIK-14). Für mehrere Aktionen nebeneinander auf
   * einer Karte und für den Knopf in einem Fehlerkasten. Ohne Angabe gilt
   * die Größe der Umgebung (`knopfGroesse.ts`: im Seiten- und Objektkopf
   * kompakt), sonst `normal`.
   */
  groesse?: Groesse;
  children: ReactNode;
  /** Fuer Fokusfuehrung, etwa bei einer Rueckfrage vor einem Vorgang. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = 'primary', groesse, className = '', ...props }: ButtonProps) {
  const umgebung = useContext(KnopfGroesseKontext);
  return (
    <button
      className={knopfKlassen(variant, groesse ?? umgebung ?? 'normal', className)}
      {...props}
    />
  );
}

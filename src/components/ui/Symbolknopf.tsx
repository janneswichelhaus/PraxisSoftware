import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { symbolknopfKlassen, type SymbolGroesse, type Variant } from './buttonStile';

/**
 * Knopf, der nur ein Symbol zeigt (UIK-01).
 *
 * Für die Pfeile im Kalenderkopf, den Eckknopf „Ansicht und Filter", die
 * Monatspfeile und die Lupe. Diese Knöpfe standen bis UXR-001 einzeln in den
 * Seiten - mit 32, 40 und 44 px, je nach Stelle.
 *
 * Was der Baustein zusichert:
 *
 *   * **44 × 44 px** (`size-11`), auch am Telefon und mit Handschuhen;
 *     `groesse="gross"` 48 px für den Haken als Hauptknopf;
 *   * eine **Beschriftung ist Pflicht** und wird zum zugänglichen Namen
 *     (`aria-label`) - ein Symbol allein sagt der Vorlesesoftware nichts;
 *   * Varianten wie beim `Button`, ohne Angabe `quiet` (Hauptfarbe ohne
 *     Fläche, beim Überfahren vertieft). Ein Auswahlzustand - etwa der
 *     geöffnete Eckknopf - ist `primary`: „Hauptfarbe gefüllt" ist im System
 *     der Auswahlzustand;
 *   * ohne Angabe `type="button"`: Ein Symbolknopf schickt kein Formular ab.
 *
 * Das Symbol selbst ist Kind des Knopfes und für Vorlesesoftware
 * ausgeblendet (ein SVG mit `aria-hidden` oder ein Zeichen wie „‹").
 */
export function Symbolknopf({
  beschriftung,
  variant = 'quiet',
  groesse = 'normal',
  type = 'button',
  className = '',
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & {
  /** Zugänglicher Name, etwa „Vorheriger Zeitraum". */
  beschriftung: string;
  variant?: Variant;
  /** `gross` 48 px, sonst 44 px. */
  groesse?: SymbolGroesse;
  /** Das Symbol. */
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type={type}
      aria-label={beschriftung}
      className={symbolknopfKlassen(variant, className, groesse)}
      {...props}
    >
      <span aria-hidden="true" className="inline-flex items-center justify-center">
        {children}
      </span>
    </button>
  );
}

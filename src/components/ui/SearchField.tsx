import { Field } from './Field';

/**
 * Suchfeld über einer Liste (UI-000).
 *
 * Fünf Listen bauten sich dasselbe Feld selbst zusammen. Der Baustein legt
 * dreierlei fest: `type="search"` (Browser bieten dann eine Leerentaste an),
 * eine Beschriftung, die immer da ist — ein Platzhalter allein ist keine
 * Beschriftung (WCAG 3.3.2) —, und `autoComplete="off"`, damit im Hausbesuch
 * keine früheren Suchbegriffe über der Liste auftauchen.
 *
 * Die Breite bleibt bei der aufrufenden Seite: eine Kartei ordnet ihr Suchfeld
 * anders an als eine Liste mit Filtern daneben.
 */
export function SearchField({
  label = 'Suche',
  placeholder,
  value,
  onChange,
}: {
  label?: string;
  /** Was durchsucht wird, etwa „Name, Ort, Telefon". */
  placeholder?: string;
  value: string;
  onChange: (wert: string) => void;
}) {
  return (
    <Field
      label={label}
      type="search"
      autoComplete="off"
      {...(placeholder === undefined ? {} : { placeholder })}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

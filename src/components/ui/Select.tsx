import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  /**
   * Feste Kennung statt der erzeugten (UX-012).
   *
   * Die Fehlerzusammenfassung eines Formulars springt auf das Feld, in dem
   * der Fehler steht. Dafür muss die Kennung von außen bekannt sein; eine mit
   * `useId` erzeugte ist es nicht. Ohne Angabe bleibt alles wie bisher.
   */
  feldId?: string | undefined;
  children: ReactNode;
}

/**
 * Beschriftete Auswahlliste.
 *
 * Nach demselben Muster wie `Field`: Label, Hinweis und Fehlermeldung sind über
 * id/aria-describedby verbunden, damit Screenreader den Fehler zusammen mit dem
 * Feld vorlesen. Bewusst ein natives <select> - Tastaturbedienung und mobile
 * Auswahl funktionieren damit ohne eigenes Zutun.
 */
export function Select({
  label,
  hint,
  error,
  feldId,
  className = '',
  children,
  ...props
}: SelectProps) {
  const erzeugt = useId();
  const id = feldId ?? erzeugt;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-ink-subtle text-sm">
          {hint}
        </p>
      ) : null}
      <select
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={[
          'bg-surface-field text-ink rounded-field h-12 w-full border px-4 text-base',
          error ? 'border-danger' : 'border-line-strong',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p id={errorId} className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

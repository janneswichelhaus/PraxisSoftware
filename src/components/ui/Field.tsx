import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
}

/**
 * Beschriftetes Eingabefeld.
 *
 * Label, Hinweis und Fehlermeldung sind über id/aria-describedby verbunden -
 * Screenreader lesen den Fehler zusammen mit dem Feld vor.
 */
export function Field({ label, hint, error, className = '', ...props }: FieldProps) {
  const id = useId();
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
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={
          'bg-surface text-ink placeholder:text-ink-subtle min-h-11 rounded-lg border px-3 text-base ' +
          (error ? 'border-danger' : 'border-line-strong') +
          className
        }
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
}

/**
 * Mehrzeiliges Eingabefeld.
 *
 * Nach demselben Muster wie `Field`: Label, Hinweis und Fehlermeldung sind
 * über id/aria-describedby verbunden.
 */
export function Textarea({ label, hint, error, className = '', ...props }: TextareaProps) {
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
      <textarea
        id={id}
        rows={3}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={[
          'bg-surface text-ink placeholder:text-ink-subtle min-h-24 w-full rounded-lg border px-3 py-2 text-base',
          error ? 'border-danger' : 'border-line-strong',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
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

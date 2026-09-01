import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
}

/**
 * Mehrzeiliges Eingabefeld.
 *
 * Aufbau wie `Field`: Label, Hinweis und Fehlermeldung sind über id und
 * aria-describedby verbunden, damit Screenreader den Fehler zusammen mit dem
 * Feld vorlesen. Die Schriftgröße bleibt bei 16 px - kleinere Werte lassen
 * iOS beim Fokussieren hineinzoomen.
 */
export function TextArea({ label, hint, error, className = '', ...props }: TextAreaProps) {
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
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={[
          'bg-surface text-ink placeholder:text-ink-subtle w-full rounded-lg border px-3 py-2.5 text-base leading-relaxed',
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

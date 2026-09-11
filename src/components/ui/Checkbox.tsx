import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * Kontrollkästchen mit Beschriftung und optionalem Hinweis.
 *
 * Wie `Field` sind Label, Hinweis und Fehlertext über `aria-describedby`
 * verbunden. Die Trefferfläche umfasst die Beschriftung und ist mindestens
 * 44 px hoch - auf dem Rad mit Handschuhen ist ein 16-px-Kästchen nicht
 * bedienbar (Oberflächen-Checkliste Punkt 1).
 */
export function Checkbox({
  label,
  hint,
  error,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          id={id}
          type="checkbox"
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          // Radius 6 nach DS-001 - ein eigener Wert neben den vier Hauptradien.
          className="border-line-strong text-accent focus-visible:outline-accent size-5 shrink-0 rounded-[6px] border"
          {...props}
        />
        <span className="text-ink text-sm">{label}</span>
      </label>
      {hint ? (
        <p id={hintId} className="text-ink-subtle ml-8 text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-danger ml-8 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

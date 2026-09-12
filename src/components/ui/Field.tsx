import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
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
}

function EyeIcon({ crossedOut }: { crossedOut: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      {crossedOut ? (
        <path
          d="M2.5 2.5 17.5 17.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

/**
 * Beschriftetes Eingabefeld.
 *
 * Label, Hinweis und Fehlermeldung sind über id/aria-describedby verbunden -
 * Screenreader lesen den Fehler zusammen mit dem Feld vor. Ein Passwortfeld
 * (type="password") erhält zusätzlich einen Sichtbar-Schalter, damit
 * Tippfehler bei der Eingabe auffallen.
 */
export function Field({ label, hint, error, feldId, className = '', type, ...props }: FieldProps) {
  const erzeugt = useId();
  const id = feldId ?? erzeugt;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const isPassword = type === 'password';
  const [visible, setVisible] = useState(false);

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
      <div className="relative">
        <input
          id={id}
          type={isPassword ? (visible ? 'text' : 'password') : type}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={[
            // DS-001: Felder sind weiss, 48 px hoch, Radius 10, Schrift 16 px
            // - unter 16 px zoomt iOS beim Fokus. Seit UI-002b ist das Papier
            // darunter ebenfalls weiss; als Feld erkennbar macht das Feld
            // deshalb seine Umrandung, nicht mehr seine Flaeche.
            'bg-surface-field text-ink placeholder:text-ink-subtle rounded-field h-12 w-full border px-4 text-base',
            isPassword ? 'pr-11' : '',
            error ? 'border-danger' : 'border-line-strong',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Kennwort verbergen' : 'Kennwort anzeigen'}
            className="text-ink-subtle hover:text-ink-muted absolute inset-y-0 right-0 flex w-11 items-center justify-center"
          >
            <EyeIcon crossedOut={!visible} />
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

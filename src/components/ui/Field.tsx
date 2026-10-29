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
  /**
   * Was der Sichtbar-Schalter eines Passwortfelds zeigt oder verbirgt -
   * „Kennwort“ oder „PIN“ (SEC-EPIC-002). Ohne Angabe „Kennwort“.
   */
  geheimnis?: string | undefined;
  /** Eine kurze Einheit rechts im Feld, etwa „kg“; Vorlesesoftware hört sie als Beschreibung. */
  einheit?: string | undefined;
  /** Neben dem Feld, etwa der Knopf zum Eintragen; passt er nicht daneben, steht er darunter. */
  daneben?: ReactNode;
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
export function Field({
  label,
  hint,
  error,
  feldId,
  geheimnis = 'Kennwort',
  einheit,
  daneben,
  className = '',
  type,
  ...props
}: FieldProps) {
  const erzeugt = useId();
  const id = feldId ?? erzeugt;
  const einheitId = einheit ? `${id}-einheit` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [einheitId, hintId, errorId].filter(Boolean).join(' ') || undefined;
  const isPassword = type === 'password';
  const [visible, setVisible] = useState(false);
  // Mit `daneben` bricht die Reihe um: Titel, Hinweis und Fehler je eine ganze Zeile.
  const voll = daneben ? ' basis-full' : '';

  return (
    // `feld`: Der Titel reagiert auf den Fokus (ANN-567, `index.css`).
    <div
      className={daneben ? 'feld flex flex-wrap gap-x-2 gap-y-1.5' : 'feld flex flex-col gap-1.5'}
    >
      <label htmlFor={id} className={`text-ink text-sm font-medium${voll}`}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className={`text-ink-muted text-sm${voll}`}>
          {hint}
        </p>
      ) : null}
      <div className={daneben ? 'relative min-w-40 flex-1' : 'relative'}>
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
            'bg-surface-field text-ink placeholder:text-ink-muted rounded-field h-12 w-full border px-4 text-base',
            // Abgeschaltet vertieft, mit eigener Fläche statt Deckkraft
            // (DS-001, UIK-05): Bis UXR-001 sah ein gesperrtes Feld aus wie
            // ein bedienbares, nur der Mauszeiger wechselte. Der Rand bleibt
            // `line-strong` und hält die Form auch auf `canvas`.
            'disabled:bg-surface-sunken disabled:cursor-not-allowed',
            isPassword ? 'pr-11' : einheit ? 'pr-12' : '',
            error ? 'border-danger' : 'border-line-strong',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
        {einheit ? (
          <span
            id={einheitId}
            className="text-ink-muted pointer-events-none absolute inset-y-0 right-4 flex items-center"
          >
            {einheit}
          </span>
        ) : null}
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? `${geheimnis} verbergen` : `${geheimnis} anzeigen`}
            className="text-ink-muted hover:text-ink absolute inset-y-0 right-0 flex w-11 items-center justify-center"
          >
            <EyeIcon crossedOut={!visible} />
          </button>
        ) : null}
      </div>
      {daneben}
      {error ? (
        <p id={errorId} className={`feldfehler text-danger text-sm${voll}`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

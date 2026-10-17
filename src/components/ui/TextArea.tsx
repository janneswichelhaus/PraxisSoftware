import { useId, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
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
  /** Für den Fokus nach einer Auswahl, etwa einer Erwähnung (TEAM-001). */
  ref?: Ref<HTMLTextAreaElement>;
  /**
   * Beschriftung nur für Vorlesesoftware - für ein Feld, dessen Zweck die
   * Umgebung zeigt, etwa die Eingabe eines Gesprächs (TEAM-001).
   */
  labelVersteckt?: boolean;
}

/**
 * Mehrzeiliges Eingabefeld.
 *
 * Aufbau wie `Field`: Label, Hinweis und Fehlermeldung sind über id und
 * aria-describedby verbunden, damit Screenreader den Fehler zusammen mit dem
 * Feld vorlesen. Die Schriftgröße bleibt bei 16 px - kleinere Werte lassen
 * iOS beim Fokussieren hineinzoomen.
 */
export function TextArea({
  label,
  hint,
  error,
  feldId,
  labelVersteckt = false,
  className = '',
  ...props
}: TextAreaProps) {
  const erzeugt = useId();
  const id = feldId ?? erzeugt;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    // `feld`: Der Titel reagiert auf den Fokus (ANN-567, `index.css`).
    <div className="feld flex flex-col gap-1.5">
      <label htmlFor={id} className={labelVersteckt ? 'sr-only' : 'text-ink text-sm font-medium'}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-ink-muted text-sm">
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={[
          'bg-surface-field text-ink placeholder:text-ink-muted rounded-field w-full border px-4 py-3 text-base leading-relaxed',
          // Abgeschaltet vertieft wie `Field` (DS-001, UIK-05).
          'disabled:bg-surface-sunken disabled:cursor-not-allowed',
          error ? 'border-danger' : 'border-line-strong',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
      {error ? (
        <p id={errorId} className="feldfehler text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

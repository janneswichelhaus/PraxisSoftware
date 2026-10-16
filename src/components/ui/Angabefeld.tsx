import { useId, useRef, type CSSProperties } from 'react';
import { Button } from '@/components/ui/Button';
import { wertText, type Erfassungsgroesse } from '@/lib/erfassungsgroessen';

/**
 * Eine freiwillige Angabe zu einer Erfassungsgröße (TRK-EPIC-001).
 *
 * Eine Skala (0 bis 10) in Stufen wie im Befundbogen – am Handy zwei Reihen,
 * jede Stufe mindestens 44 × 44 px (BEF-057, ANN-258) – oder eine Zahl mit
 * Einheit oder eine Auswahl in Wörtern (TRK-004, ANN-354). Nichts ist vorausgewählt: Der letzte Wert steht als Hinweis
 * daneben, damit niemand durchklickt (IDEA-TRK-002, ANN-349). „Angabe
 * entfernen" nimmt eine Wahl zurück; ohne Angabe bleibt der Wert leer.
 *
 * Keine Farbe je Wert, keine Einordnung (ADR-006 Punkt 11).
 */
export function Angabefeld({
  groesse,
  wert,
  zuletzt,
  onChange,
}: {
  groesse: Erfassungsgroesse;
  wert: number | null;
  /** Der Wert der letzten Angabe, nur als Hinweis. */
  zuletzt?: number | undefined;
  onChange: (wert: number | null) => void;
}) {
  const name = useId();
  const titelId = useId();
  const hinweisId = useId();
  const feldsatz = useRef<HTMLFieldSetElement>(null);
  const hinweis =
    zuletzt !== undefined ? `Ihre letzte Angabe: ${wertText(groesse, zuletzt)}` : null;

  function entfernen() {
    onChange(null);
    feldsatz.current?.querySelector('input')?.focus();
  }

  if (groesse.einheit) {
    return (
      // `feld`: Der Titel reagiert auf den Fokus (ANN-567, `index.css`).
      <div className="feld flex flex-col gap-1">
        <label htmlFor={name} className="text-ink text-liste font-medium">
          {groesse.frage}
        </label>
        {hinweis ? (
          <p id={hinweisId} className="text-ink-muted text-sm">
            {hinweis}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <input
            id={name}
            type="number"
            inputMode="numeric"
            min={groesse.min}
            max={groesse.max}
            step={1}
            aria-describedby={hinweis ? hinweisId : undefined}
            className="border-line-strong rounded-field text-ink bg-surface min-h-11 w-28 border px-3 text-base tabular-nums"
            value={wert ?? ''}
            onChange={(e) => {
              const roh = e.target.value.trim();
              if (roh === '') return onChange(null);
              const zahl = Number(roh);
              onChange(Number.isFinite(zahl) ? zahl : null);
            }}
          />
          <span className="text-ink">{groesse.einheit}</span>
        </div>
      </div>
    );
  }

  const stufen = Array.from({ length: groesse.max - groesse.min + 1 }, (_, i) => groesse.min + i);
  const spaltenAmHandy = stufen.length > 6 ? Math.ceil(stufen.length / 2) : stufen.length;
  const auswahl = groesse.optionen !== undefined;

  return (
    <fieldset
      ref={feldsatz}
      aria-labelledby={titelId}
      aria-describedby={hinweis ? hinweisId : undefined}
      className="flex flex-col gap-1"
    >
      <div className="relative mb-2">
        <p id={titelId} className="text-ink text-liste font-medium">
          {wert !== null ? <span aria-hidden="true" className="float-right ml-3 h-5 w-40" /> : null}
          {groesse.frage}
        </p>
        {wert !== null ? (
          <Button
            type="button"
            variant="quiet"
            groesse="kompakt"
            className="absolute -top-2.5 right-0 w-40 whitespace-nowrap"
            onClick={entfernen}
          >
            Angabe entfernen<span className="sr-only">: {groesse.frage}</span>
          </Button>
        ) : null}
      </div>
      {hinweis ? (
        <p id={hinweisId} className="text-ink-muted text-sm">
          {hinweis}
        </p>
      ) : null}
      <div
        // `skala`: Haken für die Plattform, die bei sehr wenig Breite weniger
        // Stufen je Reihe setzt (POR-020). Eine Auswahl in Wörtern bricht
        // einfach um.
        className={
          auswahl
            ? 'flex flex-wrap gap-2'
            : 'skala grid max-w-md grid-cols-[repeat(var(--skala-spalten),minmax(2.75rem,1fr))] gap-1 sm:max-w-none sm:grid-flow-col sm:grid-cols-none sm:gap-0.5'
        }
        style={auswahl ? undefined : ({ '--skala-spalten': spaltenAmHandy } as CSSProperties)}
      >
        {stufen.map((stufe) => (
          <label
            key={stufe}
            className={`has-[:checked]:bg-accent has-[:checked]:border-accent has-[:checked]:text-surface border-line-strong text-ink rounded-field has-[:focus-visible]:outline-accent flex min-h-11 cursor-pointer items-center justify-center border text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
              auswahl ? 'px-4' : 'tabular-nums sm:min-w-11'
            }`}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={wert === stufe}
              onChange={() => onChange(stufe)}
            />
            {wertText(groesse, stufe)}
          </label>
        ))}
      </div>
      {groesse.enden ? (
        <div className="text-ink-muted flex max-w-md justify-between text-xs sm:max-w-none">
          <span>
            {groesse.min} = {groesse.enden[0]}
          </span>
          <span>
            {groesse.max} = {groesse.enden[1]}
          </span>
        </div>
      ) : null}
      <p aria-live="polite" className="text-ink-muted text-sm tabular-nums">
        {wert === null ? '' : `gewählt: ${wertText(groesse, wert)}`}
      </p>
    </fieldset>
  );
}

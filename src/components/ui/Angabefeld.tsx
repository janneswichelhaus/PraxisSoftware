import { useId } from 'react';
import { ankerSatz, wertText, type Erfassungsgroesse } from '@/lib/erfassungsgroessen';
import { useFenstertitelId } from './fenstertitel';
import { Stufenskala } from './Stufenskala';
import { Wahlflaechen } from './Wahlflaechen';

/**
 * Eine freiwillige Angabe: Skala 0 bis 10, Zahl mit Einheit oder Wahl in Wörtern. Nichts ist
 * vorausgewählt, die letzte Angabe steht nur als Hinweis darunter (ANN-349). Keine Farbe je Wert,
 * keine Einordnung (ADR-006 Punkt 11).
 */
export function Angabefeld({
  groesse,
  wert,
  zuletzt,
  zuletztAm,
  onChange,
  imAblauf = false,
  gesperrt = false,
}: {
  groesse: Erfassungsgroesse;
  wert: number | null;
  /** Der Wert der letzten Angabe, nur als Hinweis. */
  zuletzt?: number | undefined;
  /** Der Tag der letzten Angabe in Worten, etwa „21. Oktober“. */
  zuletztAm?: string | undefined;
  onChange: (wert: number | null) => void;
  /** Im geführten Ablauf ist die Frage der Titel des Fensters; das Feld zeigt sie nicht noch einmal. */
  imAblauf?: boolean;
  gesperrt?: boolean;
}) {
  const feldId = useId();
  const frageId = useId();
  const fenstertitel = useFenstertitelId();
  const titelId = imAblauf && fenstertitel ? fenstertitel : frageId;
  const zeigeFrage = !(imAblauf && fenstertitel);
  const hinweis =
    zuletzt === undefined
      ? null
      : `Ihre letzte Angabe: ${wertText(groesse, zuletzt)}${zuletztAm ? ` am ${zuletztAm}` : ''}`;
  const letzte = hinweis ? <p className="text-ink-muted">{hinweis}</p> : null;

  if (groesse.einheit) {
    return (
      // `feld`: Der Titel reagiert auf den Fokus (ANN-567, `index.css`).
      <div className="feld flex flex-col gap-2">
        {zeigeFrage ? (
          <label htmlFor={feldId} id={frageId} className="text-ink text-liste font-medium">
            {groesse.frage}
          </label>
        ) : null}
        <div className="flex items-center gap-2">
          <input
            id={feldId}
            type="number"
            inputMode="numeric"
            min={groesse.min}
            max={groesse.max}
            step={1}
            disabled={gesperrt}
            aria-labelledby={zeigeFrage ? undefined : titelId}
            className="border-line-strong rounded-field text-ink bg-surface min-h-12 w-28 border px-3 text-base tabular-nums"
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
        {letzte}
      </div>
    );
  }

  if (groesse.optionen) {
    const wahlen = groesse.optionen.map((text, i) => ({
      schluessel: String(groesse.min + i),
      text,
    }));
    return (
      <div className="flex flex-col gap-2">
        <Wahlflaechen
          {...(zeigeFrage
            ? { titel: groesse.frage, ebene: 3 as const }
            : { beschriftetVon: titelId })}
          form="zeilen"
          wahlen={wahlen}
          gewaehlt={wert === null ? [] : [String(wert)]}
          gesperrt={gesperrt}
          onUmschalten={(schluessel) => {
            const zahl = Number(schluessel);
            onChange(wert === zahl ? null : zahl);
          }}
        />
        {letzte}
        <p aria-live="polite" className="sr-only">
          {wert === null ? '' : `gewählt: ${wertText(groesse, wert)}`}
        </p>
      </div>
    );
  }

  const anker = ankerSatz(groesse);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {zeigeFrage ? (
          <p id={frageId} className="text-ink text-liste font-medium">
            {groesse.frage}
          </p>
        ) : null}
        {anker ? <p className="text-ink-muted">{anker}</p> : null}
      </div>
      <Stufenskala
        beschriftetVon={titelId}
        min={groesse.min}
        max={groesse.max}
        enden={groesse.enden}
        wert={wert}
        gesperrt={gesperrt}
        onChange={onChange}
      />
      {letzte}
      <p aria-live="polite" className="sr-only">
        {wert === null ? '' : `gewählt: ${wertText(groesse, wert)}`}
      </p>
    </div>
  );
}

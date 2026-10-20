import { useId, type CSSProperties } from 'react';
import { Symbolknopf } from './Symbolknopf';

/**
 * Einen Wert mit dem Daumen einstellen: die Beschriftung, darunter „−“, der
 * Schieberegler und „+“ (BEF-190, zuerst für den Zuschnitt des Profilbilds).
 * Für eine Dauer mit ihrer eigenen Skala gibt es den `Dauerregler`.
 *
 * Der Regler ist ein natives `input type="range"` - Tastatur, Screenreader
 * und Touch kommen vom Browser; `wertText` sagt den Wert in Worten. Die
 * Knöpfe gehen um `knopfschritt`, an der Grenze sind sie aus. Spur und Daumen
 * zeichnet `.dauerregler` in `index.css`: 48 px hohe Spur, Daumen 32 px,
 * Knöpfe 44 px (DESIGN.md Grundsatz 3).
 */
export function Schieberegler({
  beschriftung,
  wert,
  min,
  max,
  schritt,
  knopfschritt,
  wertText,
  weniger,
  mehr,
  onAendern,
}: {
  beschriftung: string;
  wert: number;
  min: number;
  max: number;
  /** Schritt des Reglers selbst. */
  schritt: number;
  /** Schritt eines Tipps auf „−“ oder „+“. */
  knopfschritt: number;
  wertText: (wert: number) => string;
  /** Zugängliche Namen der Knöpfe, etwa „Weniger vergrößern“. */
  weniger: string;
  mehr: string;
  onAendern: (wert: number) => void;
}) {
  const id = useId();
  const setze = (neu: number) => {
    const begrenzt = Math.min(max, Math.max(min, neu));
    if (begrenzt !== wert) onAendern(begrenzt);
  };
  const fuellung = max > min ? ((wert - min) / (max - min)) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-ink text-sm font-medium">
        {beschriftung}
      </label>
      <div className="flex items-center gap-3">
        <Symbolknopf
          beschriftung={weniger}
          variant="secondary"
          disabled={wert <= min}
          onClick={() => setze(wert - knopfschritt)}
        >
          −
        </Symbolknopf>
        <input
          id={id}
          type="range"
          className="dauerregler min-w-0 flex-1"
          min={min}
          max={max}
          step={schritt}
          value={wert}
          aria-valuetext={wertText(wert)}
          style={{ '--fuellung': `${fuellung}%` } as CSSProperties}
          onChange={(event) => setze(Number(event.target.value))}
        />
        <Symbolknopf
          beschriftung={mehr}
          variant="secondary"
          disabled={wert >= max}
          onClick={() => setze(wert + knopfschritt)}
        >
          +
        </Symbolknopf>
      </div>
    </div>
  );
}

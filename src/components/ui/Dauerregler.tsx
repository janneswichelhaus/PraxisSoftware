import { useId, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './Button';
import { FEIN, dauerKurz, dauerLang, dauerStufen, naechsteStufe } from './dauer';

/**
 * Eine Dauer mit dem Daumen einstellen (ORG-007, ANN-606): oben groß die
 * Dauer („1 h 15 min“) und auf Wunsch eine Zeile darunter („17:00–18:15“),
 * darunter der Schieberegler zwischen „−5“ und „+5“.
 *
 * Der Regler ist ein natives `input type="range"` - Tastatur, Screenreader
 * und Touch kommen vom Browser. Seine Skala ist nicht linear (`dauer.ts`):
 * bis eine Stunde in 5 Minuten, darüber in Viertelstunden, Minuten und
 * Stunden ohne Umschalten. Die Knöpfe stellen über die ganze Skala auf 5
 * Minuten genau; ein Wert zwischen zwei Stufen bleibt stehen, der Daumen
 * steht dann an der nächsten. Pfeiltasten gehen eine Stufe, Bild auf/ab eine
 * Stunde, Pos1 und Ende an die Grenzen - von Hand, damit die Schritte überall
 * dieselben sind.
 *
 * Am Telefon mit einer Hand: Daumen 32 px auf einer 48 px hohen Spur, die
 * Knöpfe 48 × 64 px (DESIGN.md Grundsatz 3). Spur und Daumen zeichnet
 * `.dauerregler` in `index.css` aus den Tokens.
 */
export function Dauerregler({
  beschriftung,
  wert,
  onAendern,
  min = FEIN,
  max,
  zusatz,
  autofokus = false,
}: {
  beschriftung: string;
  /** Minuten. */
  wert: number;
  onAendern: (minuten: number) => void;
  min?: number;
  max: number;
  /** Eine Zeile unter der Dauer, etwa die Uhrzeiten. */
  zusatz?: ReactNode;
  autofokus?: boolean;
}) {
  const id = useId();
  const stufen = dauerStufen(min, max);
  const unten = stufen[0] ?? min;
  const oben = stufen.at(-1) ?? max;
  const index = naechsteStufe(stufen, wert);
  const setze = (minuten: number) => {
    const neu = Math.min(oben, Math.max(unten, minuten));
    if (neu !== wert) onAendern(neu);
  };
  const stufe = (i: number) => setze(stufen[Math.min(stufen.length - 1, Math.max(0, i))]!);

  const taste = (event: KeyboardEvent<HTMLInputElement>) => {
    // Eine Stufe weiter - von der Stufe aus, die über oder unter dem Wert liegt.
    const hoeher = stufen.findIndex((s) => s > wert);
    const tiefer = stufen.findLastIndex((s) => s < wert);
    const schritte: Record<string, () => void> = {
      ArrowRight: () => stufe(hoeher < 0 ? stufen.length - 1 : hoeher),
      ArrowUp: () => stufe(hoeher < 0 ? stufen.length - 1 : hoeher),
      ArrowLeft: () => stufe(tiefer < 0 ? 0 : tiefer),
      ArrowDown: () => stufe(tiefer < 0 ? 0 : tiefer),
      PageUp: () => setze(wert + 60),
      PageDown: () => setze(wert - 60),
      Home: () => setze(unten),
      End: () => setze(oben),
    };
    const schritt = schritte[event.key];
    if (!schritt) return;
    event.preventDefault();
    schritt();
  };

  const fuellung = stufen.length > 1 ? (index / (stufen.length - 1)) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-ink text-sm font-medium">
        {beschriftung}
      </label>
      <div aria-hidden="true" className="flex flex-col gap-1">
        <p className="text-ink text-h2-mobil font-semibold tabular-nums">{dauerKurz(wert)}</p>
        {zusatz ? <p className="text-ink-muted text-sm tabular-nums">{zusatz}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          className="w-16 shrink-0"
          aria-label="5 Minuten weniger"
          disabled={wert <= unten}
          onClick={() => setze(wert - FEIN)}
        >
          −5
        </Button>
        <input
          id={id}
          type="range"
          className="dauerregler min-w-0 flex-1"
          min={0}
          max={stufen.length - 1}
          step={1}
          value={index}
          aria-valuetext={dauerLang(wert)}
          style={{ '--fuellung': `${fuellung}%` } as CSSProperties}
          {...(autofokus ? { 'data-autofocus': true } : {})}
          onChange={(event) => stufe(Number(event.target.value))}
          onKeyDown={taste}
        />
        <Button
          type="button"
          variant="secondary"
          className="w-16 shrink-0"
          aria-label="5 Minuten mehr"
          disabled={wert >= oben}
          onClick={() => setze(wert + FEIN)}
        >
          +5
        </Button>
      </div>
      <div aria-hidden="true" className="text-ink-muted flex justify-between px-19 text-sm">
        <span>{dauerKurz(unten)}</span>
        <span>{dauerKurz(oben)}</span>
      </div>
    </div>
  );
}

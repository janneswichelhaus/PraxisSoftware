import { useId } from 'react';
import { Symbolknopf } from '@/components/ui/Symbolknopf';

/**
 * Eine Zahl mit Minus und Plus statt eines Eingabefelds (Welle B,
 * Dosier-Stepper): Sätze, Wiederholungen, Dauer, Halten, „am Tag". Am
 * Telefon ohne Tastatur, mit dem Daumen, je Knopf 44 px (Symbolknopf).
 *
 * Lokal gebaut, weil `src/components/ui` keinen Baustein dafür hat - ein
 * Kandidat für die Bausteine. Für Vorlesesoftware eine beschriftete Gruppe;
 * die Knöpfe sagen, was sie tun („Sätze: eins mehr"), der Wert wird nach
 * jedem Tipp vorgelesen. Grenzen sperren den Knopf, statt still nichts zu tun.
 *
 * `leer`: Bei 0 steht statt der Zahl ein Wort („keins", „wie im Plan") -
 * 0 heißt dann „ohne Angabe" (Halten, am Tag).
 */
export function Zahlschritt({
  beschriftung,
  wert,
  onAendern,
  min,
  max,
  schritt = 1,
  einheit,
  leer,
}: {
  beschriftung: string;
  wert: number;
  onAendern: (wert: number) => void;
  min: number;
  max: number;
  schritt?: number;
  /** Hinter der Zahl, etwa „s". */
  einheit?: string;
  /** Text bei 0 (ohne Angabe). */
  leer?: string;
}) {
  const id = useId();
  const anzeige = wert === 0 && leer ? leer : `${wert}${einheit ? ` ${einheit}` : ''}`;
  const weniger = Math.max(min, wert - schritt);
  const mehr = Math.min(max, wert + schritt);
  return (
    <div role="group" aria-labelledby={id} className="flex min-w-0 flex-col gap-1.5">
      <span id={id} className="text-ink text-sm font-medium">
        {beschriftung}
      </span>
      <div className="border-line-strong rounded-button flex items-center justify-between border">
        <Symbolknopf
          beschriftung={`${beschriftung}: weniger`}
          disabled={wert <= min}
          onClick={() => onAendern(weniger)}
        >
          <MinusSymbol />
        </Symbolknopf>
        <output
          aria-live="polite"
          className="text-ink text-liste min-w-12 text-center font-semibold tabular-nums"
        >
          {anzeige}
        </output>
        <Symbolknopf
          beschriftung={`${beschriftung}: mehr`}
          disabled={wert >= max}
          onClick={() => onAendern(mehr)}
        >
          <PlusSymbol />
        </Symbolknopf>
      </div>
    </div>
  );
}

/** Minus und Plus des Zahlschritts - auch an der Häufigkeit des Plans (Befund B9). */
export function MinusSymbol() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor">
      <path d="M5 10h10" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PlusSymbol() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor">
      <path d="M5 10h10M10 5v10" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

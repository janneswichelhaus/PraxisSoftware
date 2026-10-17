import { Button } from './Button';

/**
 * Eine Skala von 1 bis 9 als Raster großer Knöpfe (ORG-006, Barometer):
 * drei mal drei, am Telefon mit dem Daumen erreichbar, jedes Ziel mindestens
 * 44 px hoch (DESIGN.md Grundsatz 3). Die Enden tragen ihr Wort („1 mies“,
 * „9 richtig gut“) im Knopf - ohne Legende daneben, die man suchen müsste.
 *
 * Der Tipp ist die Antwort: `onWaehlen` führt im geführten Ablauf weiter.
 * Nichts ist vorbelegt - auch nicht durch den Fokus: Kein Knopf trägt
 * `data-autofocus`, sonst sähe die 1 in der Sonne wie gewählt aus
 * (Praxis-Review ORG-006). Ein gewählter Wert (beim Zurückkommen) trägt die
 * Hauptfarbe, ein „✓“ und `aria-pressed` - nicht nur Farbe.
 */
export function Skala({
  beschriftung,
  links,
  rechts,
  wert,
  onWaehlen,
}: {
  /** Name der Gruppe für Vorlesesoftware, meist die Frage. */
  beschriftung: string;
  /** Das Wort an der 1. */
  links: string;
  /** Das Wort an der 9. */
  rechts: string;
  wert: number | null;
  onWaehlen: (wert: number) => void;
}) {
  return (
    <div role="group" aria-label={beschriftung} className="grid grid-cols-3 gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((zahl) => {
        const wort = zahl === 1 ? links : zahl === 9 ? rechts : null;
        const an = wert === zahl;
        return (
          <Button
            key={zahl}
            type="button"
            groesse="kompakt"
            variant={an ? 'primary' : 'secondary'}
            aria-pressed={an}
            aria-label={wort ? `${zahl} – ${wort}` : String(zahl)}
            className="w-full flex-col gap-0 py-2"
            onClick={() => onWaehlen(zahl)}
          >
            <span aria-hidden="true" className="text-xl tabular-nums">
              {an ? '✓ ' : ''}
              {zahl}
            </span>
            {wort ? (
              <span aria-hidden="true" className="text-xs leading-tight font-medium">
                {wort}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

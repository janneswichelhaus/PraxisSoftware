import { useId, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Aufklappzeichen } from './Card';

/**
 * Suche und Filter über einer Liste (Design-Fundament, DESIGN.md Lücke 9.8,
 * ANN-405).
 *
 *   * Die **Suche** (`suche`, ein `SearchField`) steht immer offen und über
 *     die volle Breite - sie ist der häufigste Weg.
 *   * Die **weiteren Filter** (`children`: `Select`, `Filterchips`, ein
 *     Datumsfeld) stehen am Telefon hinter einem Schalter „Filter“, mit der
 *     Zahl der gesetzten in Klammern („Filter (2)“); ab 640 px stehen sie offen
 *     nebeneinander, jeder höchstens 20rem breit. So beginnt die Liste am
 *     Telefon ohne drei Felder darüber.
 *   * Sind Filter gesetzt, bietet `onZuruecksetzen` den Weg zurück.
 *   * `ergebnis` ist die Zeile über der Liste: „12 Einträge“, „3 von 40“.
 *
 * Der Schalter ist ein Knopf mit `aria-expanded`, kein `<details>`: Ein
 * geschlossenes `<details>` verbirgt seinen Inhalt auch dort, wo die Filter
 * ab 640 px offen stehen sollen.
 */
export function Filterleiste({
  suche,
  gesetzt = 0,
  onZuruecksetzen,
  ergebnis,
  beschriftung = 'Liste filtern',
  children,
}: {
  suche?: ReactNode;
  /** Wie viele Filter (ohne die Suche) gerade etwas einschränken. */
  gesetzt?: number;
  onZuruecksetzen?: () => void;
  /** Zeile über der Liste, etwa „12 Einträge“. */
  ergebnis?: ReactNode;
  /** Name der Suchregion für Vorlesesoftware. */
  beschriftung?: string;
  /** Die weiteren Filter. */
  children?: ReactNode;
}) {
  const [offen, setOffen] = useState(gesetzt > 0);
  const bereich = useId();
  const zuruecksetzen =
    gesetzt > 0 && onZuruecksetzen ? (
      <Button type="button" variant="quiet" groesse="kompakt" onClick={onZuruecksetzen}>
        Filter zurücksetzen
      </Button>
    ) : null;

  return (
    <div role="search" aria-label={beschriftung} className="mb-4 flex flex-col gap-3">
      {suche ? <div className="min-w-0">{suche}</div> : null}
      {children ? (
        <>
          <button
            type="button"
            aria-expanded={offen}
            aria-controls={bereich}
            onClick={() => setOffen((wert) => !wert)}
            className="text-ink-muted hover:text-ink flex min-h-11 items-center gap-2 self-start text-sm font-semibold sm:hidden"
          >
            <Aufklappzeichen offen={offen} />
            Filter{gesetzt > 0 ? ` (${gesetzt})` : ''}
          </button>
          <div
            id={bereich}
            className={`${offen ? 'flex' : 'hidden'} flex-col gap-4 sm:flex sm:flex-row sm:flex-wrap sm:items-end sm:*:w-80 sm:*:max-w-full`}
          >
            {children}
          </div>
          {zuruecksetzen ? <div className="-mt-1">{zuruecksetzen}</div> : null}
        </>
      ) : null}
      {ergebnis ? <p className="text-ink-muted text-sm">{ergebnis}</p> : null}
    </div>
  );
}

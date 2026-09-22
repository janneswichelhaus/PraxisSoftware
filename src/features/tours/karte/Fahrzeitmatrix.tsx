import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { erreichbarkeit, type Erreichbarkeit } from '@/features/scheduling/erreichbarkeit';
import type { MapOverlayStop } from '@/lib/location/contract';
import type { Matrixergebnis } from '@/lib/location/matrix';
import { formatiereFahrzeit } from '@/lib/location/strecke';
import { FEHLERTEXTE } from './fehlertexte';
import { PUFFER_SEKUNDEN, beginnSekunden, endeSekunden, uhrzeit } from './terminraster';

/**
 * Die Fahrzeit zwischen je zwei Stopps — und ob sie reicht (MAP-004c).
 *
 * Die Tabelle liest sich zeilenweise: **von** dem Stopp links **nach** dem
 * Stopp oben. Die Zelle trägt die Fahrzeit, die der Kartendienst für dieses
 * Paar gerechnet hat, und dazu die Antwort der Erreichbarkeitsregel auf das
 * erfundene Terminraster (`terminraster.ts`).
 *
 * **Die Markierung ist eine Warnung, kein Verbot** (ADR-019, B6). Sie sperrt
 * nichts, sie schlägt nichts vor, und gespeichert wird von alledem nichts: Die
 * Matrix lebt, solange die Seite offen ist (ADR-019 Punkt 16).
 *
 * Die Komponente bekommt fertige Ergebnisse und ruft nichts ab; sie kennt
 * keinen Anbieter und rechnet selbst nur das, was auf dem Bildschirm steht.
 */

interface FahrzeitmatrixProps {
  readonly stopps: readonly MapOverlayStop[];
  readonly laedt: boolean;
  /** `undefined`, solange noch nichts vorliegt. */
  readonly ergebnis: Matrixergebnis | undefined;
  readonly erneutVersuchen: () => void;
}

export function Fahrzeitmatrix({ stopps, laedt, ergebnis, erneutVersuchen }: FahrzeitmatrixProps) {
  const erklaerungId = useId();

  if (laedt || ergebnis === undefined)
    return <LoadingState label="Fahrzeiten werden berechnet …" />;

  if (!ergebnis.ok) {
    const text = FEHLERTEXTE[ergebnis.error.code];
    return (
      <div>
        <ErrorState title={text.titel} description={text.erklaerung} />
        <Button variant="secondary" className="mt-3" onClick={erneutVersuchen}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  const { matrix, quelle } = ergebnis.value;

  return (
    <div>
      {quelle === 'nachbildung' ? (
        <Statusmeldung ton="warnung" className="mb-3">
          Nachbildung ohne Kartendienst: Die Fahrzeiten sind Luftlinien mit 15 km/h gerechnet. Keine
          gefahrene Strecke.
        </Statusmeldung>
      ) : null}

      {/* Die Beschreibung steht **vor** der Tabelle und nicht als `caption`
          darin: Eine Bildunterschrift ist so breit wie ihre Tabelle, und die
          ist hier breiter als ein Telefon — der Satz wäre bei 375 px
          abgeschnitten statt umgebrochen. */}
      <p id={erklaerungId} className="text-ink-muted mb-2 text-sm">
        Fahrzeit von einem Stopp (Zeile) zum anderen (Spalte), Lastenradprofil. Rückwärts durch den
        Tag ist nichts erreichbar — dort hat der nächste Termin längst begonnen.
      </p>

      {/* `relative` ist hier kein Gestaltungsmittel, sondern die Bedingung
          dafür, dass der Behälter überhaupt klemmt: Jede Zelle trägt eine
          `sr-only`-Beschriftung, und die ist absolut positioniert. Ohne einen
          Bezugsrahmen hier hängen alle 64 am Wurzelelement — sie entkommen
          dem Überlauf, und bei 375 px scrollt die ganze Seite seitwärts statt
          nur der Tabelle (gemessen am 2026-09-22). */}
      <div className="relative -mx-4 overflow-x-auto px-4">
        <table
          aria-describedby={erklaerungId}
          className="min-w-[32rem] border-separate border-spacing-1 text-sm"
        >
          <thead>
            <tr>
              <th scope="col" className="text-ink-muted text-left font-medium">
                von \ nach
              </th>
              {stopps.map((stopp, spalte) => (
                <th key={stopp.label} scope="col" className="text-ink-muted font-medium">
                  {stopp.label}
                  <span className="text-ink-subtle block text-xs font-normal tabular-nums">
                    {uhrzeit(beginnSekunden(spalte))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stopps.map((stopp, zeile) => (
              <tr key={stopp.label}>
                <th scope="row" className="text-ink-muted text-left font-medium whitespace-nowrap">
                  {stopp.label}
                  <span className="text-ink-subtle ml-1 text-xs font-normal tabular-nums">
                    bis {uhrzeit(endeSekunden(zeile))}
                  </span>
                </th>
                {stopps.map((ziel, spalte) => {
                  const fahrzeitSekunden = matrix.durationsSeconds[zeile]?.[spalte] ?? null;
                  return (
                    <Zelle
                      key={ziel.label}
                      beschriftung={`von ${stopp.label} nach ${ziel.label}`}
                      derselbeStopp={zeile === spalte}
                      fahrzeitSekunden={fahrzeitSekunden}
                      befund={erreichbarkeit(
                        endeSekunden(zeile),
                        beginnSekunden(spalte),
                        fahrzeitSekunden,
                        PUFFER_SEKUNDEN,
                      )}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-muted mt-3 text-sm">
        Das Terminraster ist erfunden: alle 45 Minuten ein Termin, 30 Minuten Behandlung, dazu 5
        Minuten Puffer neben der Fahrt. Markiert ist, wo die Fahrzeit in die verbleibende Lücke
        nicht passt — ein Hinweis, keine Sperre. Gespeichert wird nichts davon.
      </p>

      <Button variant="quiet" className="mt-2 px-0" onClick={erneutVersuchen}>
        Neu berechnen
      </Button>
    </div>
  );
}

/**
 * Eine Zelle — Fahrzeit und, wenn nötig, die Markierung.
 *
 * Die Bedeutung hängt **nicht an der Farbe** (WCAG 1.4.1, Design System): Das
 * Zeichen `×` steht daneben, und für Vorlesesoftware steht das Wort im Text.
 * Die Diagonale ist der Stopp zu sich selbst und trägt keine Frage.
 */
function Zelle({
  beschriftung,
  derselbeStopp,
  fahrzeitSekunden,
  befund,
}: {
  readonly beschriftung: string;
  readonly derselbeStopp: boolean;
  readonly fahrzeitSekunden: number | null;
  readonly befund: Erreichbarkeit;
}) {
  if (derselbeStopp) {
    return (
      <td className="text-ink-subtle text-center">
        <span aria-hidden="true">·</span>
        <span className="sr-only">{beschriftung}: derselbe Stopp</span>
      </td>
    );
  }

  if (fahrzeitSekunden === null) {
    return (
      <td className="text-ink-subtle text-center">
        <span aria-hidden="true">—</span>
        <span className="sr-only">{beschriftung}: keine Fahrzeit</span>
      </td>
    );
  }

  const nichtErreichbar = befund === 'nicht_erreichbar';

  return (
    <td
      className={`rounded-button px-2 py-1 text-center tabular-nums ${
        nichtErreichbar ? 'bg-danger-soft text-danger font-medium' : 'text-ink'
      }`}
    >
      {nichtErreichbar ? <span aria-hidden="true">× </span> : null}
      {formatiereFahrzeit(fahrzeitSekunden)}
      <span className="sr-only">
        {' '}
        {beschriftung}, {BEFUNDWORTE[befund]}
      </span>
    </td>
  );
}

/**
 * Der Befund als Wort.
 *
 * Alle drei Lagen stehen hier, auch `unbekannt`: Eine Zelle, die eine Zahl
 * zeigt, deren Beurteilung aber nicht gelang, darf nicht „erreichbar"
 * vorlesen — das wäre genau die Auskunft, die die Regel selbst vermeidet.
 */
const BEFUNDWORTE: Readonly<Record<Erreichbarkeit, string>> = {
  erreichbar: 'erreichbar',
  nicht_erreichbar: 'nicht erreichbar',
  unbekannt: 'nicht beurteilt',
};

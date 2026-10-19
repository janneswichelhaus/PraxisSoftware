import { Button } from './Button';
import { Rueckfrage } from './Rueckfrage';
import { Statusmeldung } from './Statusmeldung';

/**
 * Eine Aufnahme in der Leiste der Seite (PROJECT_PRINCIPLES.md 6.3): das
 * Diktat auf der Schreibseite und die Sprachnachricht im Teamchat (ADR-017
 * Punkt 83). Erst „Mikrofon wird geöffnet …“ mit „Abbrechen“, dann der
 * Status als Zeichen und Wort - ein roter Punkt und „Aufnahme 0:12“ -,
 * „Verwerfen“ nur über eine Rückfrage und „Fertig“, am Telefon in voller
 * Breite im Daumenbereich. Ein Fehltipp mit Handschuh kostet so nie die
 * ganze Aufnahme (Praxis-Review des Diktats).
 *
 * Vorgelesen wird der Beginn, nicht jede Sekunde. Rand und Abstand drumherum
 * setzt die Seite (`className`).
 */
export function Aufnahmeanzeige({
  zustand,
  zeit,
  verwerfenBezeichnung,
  onAbbrechen,
  onFertig,
  className = '',
}: {
  zustand: 'startet' | 'laeuft';
  /** Die Zeit seit dem Beginn, etwa „0:12“. */
  zeit: string;
  /** Name der Rückfrage für Vorlesesoftware, etwa „Sprachnachricht verwerfen“. */
  verwerfenBezeichnung: string;
  /** „Abbrechen“ beim Öffnen und „Verwerfen“: Die Aufnahme ist fort. */
  onAbbrechen: () => void;
  onFertig: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      {zustand === 'startet' ? (
        <>
          <Statusmeldung>Mikrofon wird geöffnet …</Statusmeldung>
          <Button type="button" variant="quiet" className="ml-auto" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        </>
      ) : (
        <>
          <p role="status" className="text-danger flex items-center gap-2 text-base font-bold">
            <span
              aria-hidden="true"
              className="bg-danger rounded-pill size-3 shrink-0 motion-safe:animate-pulse"
            />
            <span>
              Aufnahme{' '}
              <span aria-live="off" className="tabular-nums">
                {zeit}
              </span>
            </span>
          </p>
          <div className="ml-auto">
            <Rueckfrage
              ausloeser="Verwerfen"
              ausloeserVariante="quiet"
              bezeichnung={verwerfenBezeichnung}
              bestaetigen="Ja, verwerfen"
              onBestaetigen={onAbbrechen}
            >
              Die Aufnahme ist nicht gespeichert und lässt sich danach nicht zurückholen.
            </Rueckfrage>
          </div>
          <Button
            type="button"
            groesse="normal"
            className="w-full basis-full sm:w-auto sm:basis-auto"
            onClick={onFertig}
          >
            Fertig
          </Button>
        </>
      )}
    </div>
  );
}

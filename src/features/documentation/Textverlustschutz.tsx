import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { useIstVerbunden } from '@/app/verbindung';

/**
 * Schutz vor Textverlust in der Behandlungsdokumentation (UX-009, FIX-011).
 *
 * `PROJECT_PRINCIPLES.md` §13: Dokumentation darf niemals unbemerkt verloren
 * gehen. Das Feld hält den Text nur im Arbeitsspeicher der Seite - ein
 * versehentliches Neuladen, ein Tap ins Hauptmenü, ein Patientenwechsel oder
 * das Zurück des Browsers nimmt ihn mit, und im Hausbesuch merkt man es erst
 * danach.
 *
 * Drei Dinge, und ausdrücklich nur diese drei:
 *
 *   1. **Rückfrage vor jeder Navigation innerhalb der Anwendung.** Solange
 *      ungespeicherter Text im Feld steht, wird der Seitenwechsel angehalten
 *      und die Person entscheidet: speichern und weitergehen, verwerfen und
 *      weitergehen, oder hier bleiben. Das braucht den Data Router (FIX-010).
 *   2. **Warnung vor dem Verlassen des Fensters.** Neuladen und Schließen
 *      kann die Anwendung nicht anhalten; dort greift die native Warnung des
 *      Browsers. Den Wortlaut bestimmt der Browser; er lässt sich seit Jahren
 *      nicht mehr setzen.
 *   3. **Ein Hinweis, wenn das Gerät getrennt ist.** Die Verbindungsanzeige
 *      über der Kopfleiste sagt es allgemein; hier steht es dort, wo die
 *      Person gerade tippt und gleich auf „Speichern" tippen will (ANN-015).
 *
 * Die vier Festlegungen dahinter - Data Router, drei Wege, „Speichern" heißt
 * Entwurf, ein Fehlschlag navigiert nicht - stehen als **ANN-046** im
 * Annahmenregister, samt der bekannten Grenze: Das Abmelden ist keine
 * Navigation und wird hier nicht erfasst.
 *
 * **Kein lokaler Zwischenspeicher.** Ein Entwurf, der nur im Browser läge,
 * wäre nicht gespeichert, würde aber so aussehen - genau die Situation, die
 * ADR-001 und ADR-015 Punkt 16 ausschließen. „Speichern" schreibt deshalb auf
 * den Server, und zwar den **Entwurf**: Eine Finalisierung ist ein eigener,
 * ausdrücklicher Schritt und entsteht niemals nebenbei aus einer Navigation
 * (ADR-016). Schlägt das Speichern fehl, bleiben Text **und** Seite stehen -
 * ein Seitenwechsel nach einem Fehlschlag wäre genau der stille Verlust, den
 * dieser Schutz verhindern soll.
 */

/** Was der Schutz der Seite zurückgibt. */
export interface Textverlustschutz {
  /**
   * Gibt den nächsten Seitenwechsel ohne Rückfrage frei.
   *
   * Die Seite ruft das unmittelbar vor einer Navigation auf, die sie selbst
   * nach erfolgreichem Speichern auslöst. Ohne diesen Weg hielte der Schutz
   * den eigenen Rückweg an: Zwischen „gespeichert" und dem neu geladenen
   * Stand vergeht ein Augenblick, in dem der Text noch als geändert gilt.
   */
  freigeben: () => void;
  /** Hinweis und Rückfrage. Gehört ins Formular, dorthin, wo gearbeitet wird. */
  schutz: ReactNode;
}

/**
 * Meldet ungespeicherte Eingaben an den Browser.
 *
 * `preventDefault` genügt in aktuellen Browsern; `returnValue` ist die Form,
 * die ältere verlangen. Beides zu setzen ist der einzige Weg, der überall
 * greift, und kostet nichts.
 */
function useVerlassenWarnung(ungespeichert: boolean): void {
  useEffect(() => {
    if (!ungespeichert) return;

    function warnen(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', warnen);
    return () => window.removeEventListener('beforeunload', warnen);
  }, [ungespeichert]);
}

export function useTextverlustschutz({
  ungespeichert,
  speichern,
}: {
  /** Steht im Feld etwas, das noch nicht auf dem Server liegt? */
  ungespeichert: boolean;
  /**
   * Sichert den Entwurf auf dem Server. Fehlt der Weg - Korrektur und Nachtrag
   * kennen keinen Entwurfszustand -, bietet die Rückfrage nur Verwerfen und
   * Bleiben an. Wirft bei Fehlschlag; die Meldung steht dann im Kasten.
   */
  speichern?: () => Promise<void>;
}): Textverlustschutz {
  useVerlassenWarnung(ungespeichert);
  const verbunden = useIstVerbunden();

  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const [laeuft, setLaeuft] = useState(false);

  // Die Sperre liest ihren Anlass aus Referenzen und nicht aus der Hülle:
  // `useBlocker` meldet die Funktion nur neu an, wenn sie sich ändert, und
  // eine stabile Funktion, die den jeweils aktuellen Stand liest, ist
  // billiger als eine Neuanmeldung bei jedem Tastendruck.
  const ungespeichertRef = useRef(ungespeichert);
  ungespeichertRef.current = ungespeichert;
  const freigegeben = useRef(false);

  const anhalten = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    if (freigegeben.current || !ungespeichertRef.current) return false;
    // Ein Wechsel der Suchparameter auf derselben Seite ist kein Weggehen:
    // Er behält das Formular und seinen Inhalt.
    return currentLocation.pathname !== nextLocation.pathname;
  }, []);

  const blocker = useBlocker(anhalten);

  // Die Hülle der Sperre wird bei jedem Zustandswechsel neu erzeugt. Ein
  // Handler, der nach einem `await` weiterläuft, darf nicht auf der alten
  // sitzen bleiben.
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  const blockiert = blocker.state === 'blocked';
  const kasten = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Der Kasten erscheint, ohne dass jemand ihn angetippt hat. Ohne
    // Fokusführung stünde die Tastaturbedienung weiter auf einer Schaltfläche,
    // die gerade nichts mehr tut - und auf einem kleinen Bildschirm bliebe der
    // Kasten unter dem sichtbaren Bereich.
    if (blockiert) kasten.current?.querySelector('button')?.focus();
    if (!blockiert) setFehler(undefined);
  }, [blockiert]);

  function bleiben() {
    setFehler(undefined);
    blockerRef.current.reset?.();
  }

  function verwerfen() {
    blockerRef.current.proceed?.();
  }

  async function speichernUndWeiter() {
    if (!speichern || laeuft) return;
    setFehler(undefined);
    setLaeuft(true);
    try {
      await speichern();
    } catch (error) {
      // Fehler, Funkloch, Konflikt: Der Text steht weiter im Feld, die Seite
      // bleibt die alte, und die Rückfrage bleibt offen.
      setFehler(error instanceof Error ? error.message : 'Speichern nicht möglich.');
      return;
    } finally {
      setLaeuft(false);
    }
    blockerRef.current.proceed?.();
  }

  const schutz = (
    <>
      {!verbunden && ungespeichert ? (
        <Statusmeldung ton="fehler" className="mt-3">
          Ohne Verbindung lässt sich gerade nicht speichern. Der Text bleibt im Feld stehen – bitte
          warten, bis die Verbindung zurück ist, und dann erneut speichern.
        </Statusmeldung>
      ) : null}

      {blockiert ? (
        <div
          ref={kasten}
          role="group"
          aria-label="Ungespeicherte Dokumentation"
          className="border-line-strong bg-surface-sunken rounded-card mt-4 border p-4"
        >
          <p className="text-ink text-sm leading-relaxed">
            Der eingegebene Text ist noch nicht gespeichert. Beim Weitergehen geht er verloren.
          </p>
          {!speichern ? (
            <p className="text-ink-muted mt-2 text-sm leading-relaxed">
              Speichern ist hier kein Zwischenschritt: Korrektur und Nachtrag werden mit dem
              Absenden Bestandteil der Akte. Bitte zurückgehen und den Eintrag abschließen.
            </p>
          ) : null}

          {fehler ? (
            <Statusmeldung ton="fehler" className="mt-3">
              {fehler} Der Text steht weiter im Feld, die Seite bleibt geöffnet.
            </Statusmeldung>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-3">
            {speichern ? (
              <Button type="button" disabled={laeuft} onClick={() => void speichernUndWeiter()}>
                {laeuft ? 'Wird gespeichert …' : 'Speichern und weitergehen'}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" disabled={laeuft} onClick={verwerfen}>
              Verwerfen und weitergehen
            </Button>
            <Button type="button" variant="quiet" disabled={laeuft} onClick={bleiben}>
              Hier bleiben
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );

  return {
    freigeben: () => {
      freigegeben.current = true;
    },
    schutz,
  };
}

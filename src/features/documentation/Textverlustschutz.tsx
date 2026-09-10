import { useEffect } from 'react';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { useIstVerbunden } from '@/app/verbindung';

/**
 * Schutz vor Textverlust in der Behandlungsdokumentation (UX-009).
 *
 * `PROJECT_PRINCIPLES.md` §13: Dokumentation darf niemals unbemerkt verloren
 * gehen. Das Feld hält den Text bisher nur im Arbeitsspeicher der Seite - ein
 * versehentliches Neuladen, ein geschlossener Tab oder ein Zurück im Browser
 * nimmt ihn mit, und im Hausbesuch merkt man es erst danach.
 *
 * Zwei Dinge, und ausdrücklich nur diese zwei:
 *
 *   1. **Warnung vor dem Verlassen der Seite.** Solange ungespeicherter Text
 *      im Feld steht, fragt der Browser vor Neuladen, Schließen und
 *      Zurück-Navigation nach. Den Wortlaut bestimmt der Browser; er lässt
 *      sich seit Jahren nicht mehr setzen.
 *   2. **Ein Hinweis, wenn das Gerät getrennt ist.** Die Verbindungsanzeige
 *      über der Kopfleiste sagt es allgemein; hier steht es dort, wo die
 *      Person gerade tippt und gleich auf „Speichern" tippen will (ANN-015 -
 *      der Textverlust-Schutz war dort als offene Ergänzung vermerkt).
 *
 * **Kein lokaler Zwischenspeicher.** Ein Entwurf, der nur im Browser läge,
 * wäre nicht gespeichert, würde aber so aussehen - genau die Situation, die
 * ADR-001 und ADR-015 Punkt 16 ausschließen. Der Schutz warnt deshalb, statt
 * zu speichern. Die Bedienung ohne Verbindung bleibt ein eigenes Vorhaben
 * (begrenzte Offline-Fähigkeit nach ADR-001).
 */

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

export function Textverlustschutz({ ungespeichert }: { ungespeichert: boolean }) {
  useVerlassenWarnung(ungespeichert);
  const verbunden = useIstVerbunden();

  if (verbunden || !ungespeichert) return null;

  return (
    <Statusmeldung ton="fehler" className="mt-3">
      Ohne Verbindung lässt sich gerade nicht speichern. Der Text bleibt im Feld stehen – bitte
      warten, bis die Verbindung zurück ist, und dann erneut speichern.
    </Statusmeldung>
  );
}

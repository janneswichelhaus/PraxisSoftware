import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { useAbmeldewache } from '@/app/abmeldeschutz';
import { useIstVerbunden } from '@/app/verbindung';

/**
 * Schutz vor Textverlust in der Behandlungsdokumentation (UX-009, FIX-011,
 * FIX-014).
 *
 * `PROJECT_PRINCIPLES.md` §13: Dokumentation darf niemals unbemerkt verloren
 * gehen. Das Feld hält den Text nur im Arbeitsspeicher der Seite - ein
 * versehentliches Neuladen, ein Tap ins Hauptmenü, ein Patientenwechsel, das
 * Zurück des Browsers oder ein Tap auf „Abmelden" nimmt ihn mit, und im
 * Hausbesuch merkt man es erst danach.
 *
 * Fünf Dinge, und ausdrücklich nur diese fünf:
 *
 *   1. **Rückfrage vor jeder Navigation innerhalb der Anwendung.** Solange
 *      ungespeicherter Text im Feld steht, wird der Seitenwechsel angehalten
 *      und die Person entscheidet: speichern und weitergehen, verwerfen und
 *      weitergehen, oder hier bleiben. Das braucht den Data Router (FIX-010).
 *   2. **Dieselbe Rückfrage vor dem freiwilligen Abmelden.** Das Abmelden ist
 *      keine Navigation; `useBlocker` sieht davon nichts. Die Kopfzeile fragt
 *      deshalb über den `Abmeldeschutz`, und die Sitzung endet erst, wenn das
 *      Speichern **abgeschlossen** ist (FIX-014). Die **erzwungene**
 *      Beendigung - Ablauf, „Alle Sitzungen beenden", Entzug der Berechtigung -
 *      kommt hier nie vorbei und greift unverändert sofort.
 *   3. **Warnung vor dem Verlassen des Fensters.** Neuladen und Schließen
 *      kann die Anwendung nicht anhalten; dort greift die native Warnung des
 *      Browsers. Den Wortlaut bestimmt der Browser; er lässt sich seit Jahren
 *      nicht mehr setzen.
 *   4. **Ein Weg für alle Schreibvorgänge der Seite.** Speichern, Abschließen
 *      und das Speichern aus der Rückfrage laufen durch `schreiben`. Damit
 *      kann kein zweiter Vorgang starten, während einer läuft - zwei
 *      gleichzeitige Schreibzugriffe auf denselben Eintrag hätten sich
 *      gegenseitig überholt -, und **kein erfolgreicher Vorgang geht weiter,
 *      wenn währenddessen weitergeschrieben wurde** (FIX-014).
 *   5. **Ein Hinweis, wenn das Gerät getrennt ist.** Die Verbindungsanzeige
 *      über der Kopfleiste sagt es allgemein; hier steht es dort, wo die
 *      Person gerade tippt und gleich auf „Speichern" tippen will (ANN-015).
 *
 * Die Festlegungen dahinter - Data Router, drei Wege, „Speichern" heißt
 * Entwurf, ein Fehlschlag navigiert nicht, das Abmelden fragt ebenso - stehen
 * als **ANN-046** im Annahmenregister.
 *
 * **Kein lokaler Zwischenspeicher.** Ein Entwurf, der nur im Browser läge,
 * wäre nicht gespeichert, würde aber so aussehen - genau die Situation, die
 * ADR-001 und ADR-015 Punkt 16 ausschließen. „Speichern" schreibt deshalb auf
 * den Server, und zwar den **Entwurf**: Eine Finalisierung ist ein eigener,
 * ausdrücklicher Schritt und entsteht niemals nebenbei aus einer Navigation
 * oder einer Abmeldung (ADR-016). Schlägt das Speichern fehl, bleiben Text,
 * Seite **und** Sitzung stehen - ein Weitergehen nach einem Fehlschlag wäre
 * genau der stille Verlust, den dieser Schutz verhindern soll.
 */

/**
 * Ein Schreibvorgang der Seite.
 *
 * `ausfuehren` meldet mit `true`, dass **alles Getippte** jetzt auf dem Server
 * liegt. Das ist mehr als „der Aufruf ging durch": Wer während des Speicherns
 * weiterschreibt, hat danach wieder ungespeicherten Text, und dann darf weder
 * navigiert noch abgemeldet werden. Die Seite kann das genau beantworten - sie
 * hält den Text -, der Schutz nicht.
 */
export interface Schreibauftrag {
  ausfuehren: () => Promise<boolean>;
  /** Überschrift des Fehlerkastens, wenn der Vorgang scheitert. */
  fehlertitel: string;
  /** Läuft nur nach einem vollständig gesicherten Vorgang. */
  danach?: () => void;
}

/** Was der Schutz der Seite zurückgibt. */
export interface Textverlustschutz {
  /**
   * Der einzige Schreibweg der Seite (FIX-014).
   *
   * Startet nichts, solange ein anderer Vorgang läuft, hält Fehler fest und
   * führt `danach` nur aus, wenn nichts Ungespeichertes übrig blieb.
   */
  schreiben: (auftrag: Schreibauftrag) => Promise<void>;
  /** Läuft gerade ein Schreibvorgang - gleich über welche Schaltfläche? */
  laeuft: boolean;
  /**
   * Gibt den nächsten Seitenwechsel ohne Rückfrage frei - **einmal**.
   *
   * Die Seite ruft das unmittelbar vor einer Navigation auf, die sie selbst
   * nach erfolgreichem Speichern auslöst. Ohne diesen Weg hielte der Schutz
   * den eigenen Rückweg an: Zwischen „gespeichert" und dem neu geladenen
   * Stand vergeht ein Augenblick, in dem der Text noch als geändert gilt.
   *
   * Die Freigabe gilt für **eine** Navigation. Eine dauerhafte wäre ein Loch:
   * Bleibt die Seite nach dem Speichern doch stehen - weil der Rückweg
   * scheitert oder die Person zurückkommt -, stünde der Schutz für den Rest
   * der Sitzung offen.
   */
  freigeben: () => void;
  /** Hinweise, Fehler und Rückfrage. Gehört ins Formular, wo gearbeitet wird. */
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

interface Fehlerkasten {
  titel: string;
  text: string;
}

export function useTextverlustschutz({
  ungespeichert,
  speichern,
}: {
  /** Steht im Feld etwas, das noch nicht auf dem Server liegt? */
  ungespeichert: boolean;
  /**
   * Sichert den Entwurf auf dem Server und meldet, ob danach alles Getippte
   * dort liegt. Fehlt der Weg - Korrektur und Nachtrag kennen keinen
   * Entwurfszustand -, bietet die Rückfrage nur Verwerfen und Bleiben an.
   * Wirft bei Fehlschlag; die Meldung steht dann im Kasten.
   */
  speichern?: () => Promise<boolean>;
}): Textverlustschutz {
  useVerlassenWarnung(ungespeichert);
  const verbunden = useIstVerbunden();

  const [fehler, setFehler] = useState<Fehlerkasten | undefined>(undefined);
  const [laeuft, setLaeuft] = useState(false);
  const [abmeldenGefragt, setAbmeldenGefragt] = useState(false);

  // Die Sperre liest ihren Anlass aus Referenzen und nicht aus der Hülle:
  // `useBlocker` meldet die Funktion nur neu an, wenn sie sich ändert, und
  // eine stabile Funktion, die den jeweils aktuellen Stand liest, ist
  // billiger als eine Neuanmeldung bei jedem Tastendruck.
  const ungespeichertRef = useRef(ungespeichert);
  ungespeichertRef.current = ungespeichert;
  const freigegeben = useRef(false);
  // Zwei Schreibvorgänge gleichzeitig gäbe es sonst: Der Zustand `laeuft`
  // steht erst nach dem Rendern, zwei Taps kurz hintereinander lägen davor.
  const laufend = useRef(false);

  const anhalten = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    // Ein Wechsel der Suchparameter auf derselben Seite ist kein Weggehen:
    // Er behält das Formular und seinen Inhalt.
    if (currentLocation.pathname === nextLocation.pathname) return false;
    if (freigegeben.current) {
      freigegeben.current = false;
      return false;
    }
    return ungespeichertRef.current;
  }, []);

  const blocker = useBlocker(anhalten);

  // Die Hülle der Sperre wird bei jedem Zustandswechsel neu erzeugt. Ein
  // Handler, der nach einem `await` weiterläuft, darf nicht auf der alten
  // sitzen bleiben.
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  const blockiert = blocker.state === 'blocked';

  // Die Wache des Abmeldeschutzes: Sie übernimmt nur, wenn wirklich etwas im
  // Feld steht. Sonst meldet die Kopfzeile unmittelbar ab - eine Rückfrage
  // ohne Anlass wäre nur Reibung.
  const abmelden = useAbmeldewache(() => {
    if (!ungespeichertRef.current) return false;
    setAbmeldenGefragt(true);
    return true;
  });

  const offen = blockiert || abmeldenGefragt;
  const kasten = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Der Kasten erscheint, ohne dass jemand ihn angetippt hat. Ohne
    // Fokusführung stünde die Tastaturbedienung weiter auf einer Schaltfläche,
    // die gerade nichts mehr tut - und auf einem kleinen Bildschirm bliebe der
    // Kasten unter dem sichtbaren Bereich.
    if (offen) kasten.current?.querySelector('button')?.focus();
    if (!offen) setFehler(undefined);
  }, [offen]);

  async function schreiben(auftrag: Schreibauftrag): Promise<void> {
    if (laufend.current) return;
    laufend.current = true;
    setLaeuft(true);
    setFehler(undefined);

    let vollstaendig = false;
    try {
      vollstaendig = await auftrag.ausfuehren();
      if (!vollstaendig) {
        setFehler({
          titel: 'Noch nicht alles gespeichert',
          text: 'Während des Speicherns wurde weitergeschrieben. Der neue Text steht noch im Feld und liegt noch nicht auf dem Server – bitte noch einmal speichern.',
        });
      }
    } catch (error) {
      // Fehler, Funkloch, Konflikt: Der Text steht weiter im Feld, die Seite
      // bleibt die alte, die Sitzung bleibt offen.
      setFehler({
        titel: auftrag.fehlertitel,
        text: error instanceof Error ? error.message : 'Speichern nicht möglich.',
      });
    } finally {
      laufend.current = false;
      setLaeuft(false);
    }

    // Außerhalb des `try`: Ein Fehler im Weitergehen ist kein Schreibfehler
    // und darf nicht als solcher im Kasten landen.
    if (vollstaendig) auftrag.danach?.();
  }

  function bleiben() {
    setFehler(undefined);
    setAbmeldenGefragt(false);
    blockerRef.current.reset?.();
  }

  /**
   * Das, worauf die Rückfrage gewartet hat - je nachdem, wer gefragt hat.
   *
   * Nach einem Speichern läuft das hier erst, wenn der Vorgang abgeschlossen
   * **und** vollständig ist: Die Sitzung endet nie mitten in einem
   * Schreibvorgang (FIX-014).
   */
  function weitergehen() {
    if (abmeldenGefragt) {
      setAbmeldenGefragt(false);
      abmelden?.();
      return;
    }
    blockerRef.current.proceed?.();
  }

  function speichernUndWeiter() {
    if (!speichern) return;
    void schreiben({
      ausfuehren: speichern,
      fehlertitel: 'Nicht gespeichert',
      danach: weitergehen,
    });
  }

  const abmeldemodus = abmeldenGefragt && !blockiert;

  const schutz = (
    <>
      {!verbunden && ungespeichert ? (
        <Statusmeldung ton="fehler" className="mt-3">
          Ohne Verbindung lässt sich gerade nicht speichern. Der Text bleibt im Feld stehen – bitte
          warten, bis die Verbindung zurück ist, und dann erneut speichern.
        </Statusmeldung>
      ) : null}

      {/* Fehler eines Schreibvorgangs stehen hier, gleich über welche
          Schaltfläche er lief - ein Weg, eine Stelle (FIX-014). */}
      {fehler && !offen ? (
        <div className="mt-4">
          <ErrorState title={fehler.titel} description={fehler.text} />
        </div>
      ) : null}

      {offen ? (
        <div
          ref={kasten}
          role="group"
          aria-label="Ungespeicherte Dokumentation"
          className="border-line-strong bg-surface-sunken rounded-card mt-4 border p-4"
        >
          <p className="text-ink text-sm leading-relaxed">
            {abmeldemodus
              ? 'Der eingegebene Text ist noch nicht gespeichert. Beim Abmelden geht er verloren.'
              : 'Der eingegebene Text ist noch nicht gespeichert. Beim Weitergehen geht er verloren.'}
          </p>
          {!speichern ? (
            <p className="text-ink-muted mt-2 text-sm leading-relaxed">
              Speichern ist hier kein Zwischenschritt: Korrektur und Nachtrag werden mit dem
              Absenden Bestandteil der Akte. Bitte zurückgehen und den Eintrag abschließen.
            </p>
          ) : null}

          {fehler ? (
            <Statusmeldung ton="fehler" className="mt-3">
              {fehler.text} Der Text steht weiter im Feld, die Seite bleibt geöffnet
              {abmeldemodus ? ', die Sitzung bleibt bestehen' : ''}.
            </Statusmeldung>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-3">
            {speichern ? (
              <Button type="button" disabled={laeuft} onClick={speichernUndWeiter}>
                {laeuft
                  ? 'Wird gespeichert …'
                  : abmeldemodus
                    ? 'Speichern und abmelden'
                    : 'Speichern und weitergehen'}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" disabled={laeuft} onClick={weitergehen}>
              {abmeldemodus ? 'Verwerfen und abmelden' : 'Verwerfen und weitergehen'}
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
    schreiben,
    laeuft,
    freigeben: () => {
      freigegeben.current = true;
    },
    schutz,
  };
}

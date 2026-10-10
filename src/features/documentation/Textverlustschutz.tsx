import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { useAbmeldewache } from '@/app/abmeldeschutz';
import { useSperrsicherung } from '@/features/auth/sitzungssperre/sperrsicherung';
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
 * **Seit UX-EPIC-007 ein sechstes (BEF-056, ANN-319):** Wo die Seite es
 * verlangt (`selbst`), sichert der Schutz den Entwurf nach einer Pause im
 * Tippen von selbst - auf demselben Weg wie „Speichern", mit sichtbarem
 * Stand. Am iPhone fragt beim Wegwischen der App niemand nach; was bis zur
 * letzten Pause getippt war, liegt dann schon auf dem Server.
 *
 * **Auch für andere Formulare (UXR-001).** Mit eigenen Sätzen - meist
 * `EINGABETEXTE` - schützt derselbe Hook Formulare ohne Dokumentationsbezug.
 * Ohne `speichern` bietet die Rückfrage dort nur „Verwerfen und weitergehen"
 * und „Hier bleiben", wie ANN-046 es für die Korrektur festlegt. Sätze und
 * Verhalten der Dokumentation bleiben, wie sie sind.
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
interface Schreibauftrag {
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
  /**
   * Der Stand der Sicherung von selbst (BEF-056, ANN-319): „Wird gesichert …"
   * oder „Als Entwurf gesichert um 10:42". Leer, solange nichts von selbst
   * gesichert wurde. Die Seite stellt die Zeile dorthin, wo man sie beim
   * Schreiben sieht.
   */
  sicherungsstand: ReactNode;
}

/**
 * Die Pause im Tippen, nach der ein Entwurf von selbst gesichert wird
 * (BEF-056, ANN-319). Kurz genug, dass am Telefon kaum etwas verloren geht,
 * wenn die Anwendung im Hintergrund still beendet wird; lang genug, dass
 * nicht jeder Buchstabe einen Schreibvorgang auslöst.
 */
export const SELBST_SICHERN_PAUSE_MS = 3000;

/** „10:42" - die Uhrzeit des Geräts; es geht um „gerade eben", nicht um die Praxiszeit. */
function uhrzeit(zeitpunkt: Date): string {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(zeitpunkt);
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

/**
 * Die Sätze des Schutzes (UXR-001; PAT-02, NAV-01, ZST-05).
 *
 * Die Dokumentation spricht vom „Text" im Feld und nennt den Kasten
 * „Ungespeicherte Dokumentation" - das bleibt die Vorgabe (ANN-046,
 * `DOKUMENTATIONSTEXTE`). Ein Formular ohne Dokumentationsbezug - Neue:r
 * Patient:in, Termin, Mitarbeiter:in - gibt eigene Sätze mit, in der Regel
 * `EINGABETEXTE` oder eine Abwandlung davon mit passender Bezeichnung.
 *
 * Bewusst immer ein vollständiger Satz von Texten und keine einzelnen
 * Ersetzungen: Ein Formular, das nur die Bezeichnung tauscht, spräche sonst
 * weiter vom „Text" und erklärte, Korrektur und Nachtrag würden Bestandteil
 * der Akte.
 */
export interface Verlustschutztexte {
  /** Zugängliche Bezeichnung des Rückfragekastens. */
  bezeichnung: string;
  /** Rückfrage vor einem Seitenwechsel. */
  weitergehen: string;
  /** Rückfrage vor dem Abmelden. */
  abmelden: string;
  /** Zweiter Absatz, wenn es keinen Speicherweg gibt. Ohne Angabe entfällt er. */
  ohneSpeichern?: string | undefined;
  /**
   * Nachsatz eines Fehlers in der Rückfrage: was stehen bleibt. Der Schutz
   * ergänzt „, die Seite bleibt geöffnet" und beim Abmelden „, die Sitzung
   * bleibt bestehen".
   */
  bleibtStehen: string;
  /** Hinweis, solange das Gerät getrennt ist. */
  ohneVerbindung: string;
  /** Meldung, wenn während des Speicherns weiter eingegeben wurde. */
  weitergeschrieben: string;
}

/** Die Sätze der Behandlungsdokumentation - unverändert seit FIX-014 (ANN-046). */
export const DOKUMENTATIONSTEXTE: Verlustschutztexte = {
  bezeichnung: 'Ungespeicherte Dokumentation',
  weitergehen:
    'Der eingegebene Text ist noch nicht gespeichert. Beim Weitergehen geht er verloren.',
  abmelden: 'Der eingegebene Text ist noch nicht gespeichert. Beim Abmelden geht er verloren.',
  ohneSpeichern:
    'Speichern ist hier kein Zwischenschritt: Korrektur und Nachtrag werden mit dem Absenden Bestandteil der Akte. Bitte zurückgehen und den Eintrag abschließen.',
  bleibtStehen: 'Der Text steht weiter im Feld',
  ohneVerbindung:
    'Ohne Verbindung lässt sich gerade nicht speichern. Der Text bleibt im Feld stehen – bitte warten, bis die Verbindung zurück ist, und dann erneut speichern.',
  weitergeschrieben:
    'Während des Speicherns wurde weitergeschrieben. Der neue Text steht noch im Feld und liegt noch nicht auf dem Server – bitte noch einmal speichern.',
};

/**
 * Die Sätze für Formulare ohne Dokumentationsbezug: „Eingaben" statt
 * „Text", ohne den Absatz über Korrektur und Nachtrag. Die Bezeichnung
 * darf ein Formular genauer fassen, etwa
 * `{ ...EINGABETEXTE, bezeichnung: 'Ungespeicherte Patientendaten' }`.
 */
export const EINGABETEXTE: Verlustschutztexte = {
  bezeichnung: 'Ungespeicherte Eingaben',
  weitergehen: 'Die Eingaben sind noch nicht gespeichert. Beim Weitergehen gehen sie verloren.',
  abmelden: 'Die Eingaben sind noch nicht gespeichert. Beim Abmelden gehen sie verloren.',
  bleibtStehen: 'Die Eingaben stehen weiter im Formular',
  ohneVerbindung:
    'Ohne Verbindung lässt sich gerade nicht speichern. Die Eingaben bleiben im Formular stehen – bitte warten, bis die Verbindung zurück ist, und dann erneut speichern.',
  weitergeschrieben:
    'Während des Speicherns wurde weiter eingegeben. Die neuen Eingaben stehen noch im Formular und liegen noch nicht auf dem Server – bitte noch einmal speichern.',
};

export function useTextverlustschutz({
  ungespeichert,
  speichern,
  texte = DOKUMENTATIONSTEXTE,
  kompakt = false,
  selbst,
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
  /**
   * Eigene Sätze für ein Formular ohne Dokumentationsbezug (UXR-001), meist
   * `EINGABETEXTE`. Ohne Angabe die der Dokumentation.
   */
  texte?: Verlustschutztexte;
  /**
   * Als Zeile statt als Kasten (Design-Handoff 2026-10-01, Abschnitt 6a):
   * ein kurzer Satz und drei kompakte Knöpfe über der Fußleiste der
   * Schreibseite. Dieselben drei Wege (ANN-046), dieselben Fehler.
   */
  kompakt?: boolean;
  /**
   * Von selbst sichern (BEF-056, Entscheidung Jannes 2026-10-09; ANN-319).
   *
   * Steht `stand` für `SELBST_SICHERN_PAUSE_MS` still und ist noch etwas
   * ungespeichert, läuft `speichern` - derselbe Entwurfsweg wie die
   * Schaltfläche, nie eine Finalisierung (ADR-016 Punkt 4). `stand` ist das,
   * was die Person tippt - nie ein offener Bausteinvorschlag (ANN-120).
   * `bereit` hält die Sicherung an, solange die Eingabe nicht gesichert
   * werden kann (leer, zu lang) oder die Seite gerade etwas anderes schreibt.
   *
   * Scheitert die Sicherung, steht der Fehler wie sonst da, und sie setzt aus,
   * bis ein ausdrückliches Speichern gelingt: Im Konfliktfall überschriebe
   * sie sonst still den Stand einer Kollegin.
   */
  selbst?: { stand: string; bereit: boolean } | undefined;
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

  // Sicherung von selbst (BEF-056): wann zuletzt gelungen, ob sie gerade
  // läuft, ob sie nach einem Fehler aussetzt.
  const [selbstGesichertUm, setSelbstGesichertUm] = useState<Date | null>(null);
  const [selbstLaeuft, setSelbstLaeuft] = useState(false);
  const [ausgesetzt, setAusgesetzt] = useState(false);

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

  // Vor der Sitzungssperre (ADR-025 Punkt 4): Offener Text geht als Entwurf
  // auf den Server, auf demselben Weg wie „Speichern“ hier (ANN-046). Ohne
  // Entwurfsweg oder ohne Erfolg meldet die Sicherung „nein“ - dann hält die
  // Sperre die Seite verborgen fest (ANN-257).
  const speichernRef = useRef(speichern);
  speichernRef.current = speichern;
  useSperrsicherung(async () => {
    if (!ungespeichertRef.current) return true;
    const sichern = speichernRef.current;
    if (!sichern) return false;
    try {
      return await sichern();
    } catch {
      return false;
    }
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
          text: texte.weitergeschrieben,
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

    // Ein ausdrücklich gelungenes Speichern nimmt die Sicherung von selbst
    // wieder auf (BEF-056).
    if (vollstaendig) setAusgesetzt(false);

    // Außerhalb des `try`: Ein Fehler im Weitergehen ist kein Schreibfehler
    // und darf nicht als solcher im Kasten landen.
    if (vollstaendig) auftrag.danach?.();
  }

  /**
   * Der Entwurf, von selbst gesichert (BEF-056, ANN-319).
   *
   * Derselbe Vorgang wie `schreiben`, mit zwei Unterschieden: Wer während
   * der Sicherung weitertippt, bekommt keinen Fehler - die nächste Pause
   * sichert den Rest -, und ein Fehlschlag setzt die Sicherung aus, statt
   * sie bei jeder Pause zu wiederholen.
   */
  async function selbstSichern(): Promise<void> {
    const sichern = speichernRef.current;
    if (!sichern || laufend.current || !ungespeichertRef.current) return;
    laufend.current = true;
    setLaeuft(true);
    setSelbstLaeuft(true);
    setFehler(undefined);
    try {
      await sichern();
      setSelbstGesichertUm(new Date());
    } catch (error) {
      setAusgesetzt(true);
      setFehler({
        titel: 'Nicht von selbst gesichert',
        text: error instanceof Error ? error.message : 'Sichern nicht möglich.',
      });
    } finally {
      laufend.current = false;
      setLaeuft(false);
      setSelbstLaeuft(false);
    }
  }
  const selbstSichernRef = useRef(selbstSichern);
  selbstSichernRef.current = selbstSichern;

  const selbstAktiv = selbst !== undefined && speichern !== undefined;
  const selbstStand = selbst?.stand;
  const selbstBereit = selbst?.bereit ?? false;
  useEffect(() => {
    // Nach jeder Änderung beginnt die Pause neu; erst wenn sie verstreicht,
    // wird gesichert. Ohne Verbindung wartet die Sicherung, bis sie zurück
    // ist - `verbunden` steht deshalb in den Abhängigkeiten. Ebenso `laeuft`:
    // Was während eines Vorgangs dazukam, sichert die Pause danach.
    if (!selbstAktiv || !selbstBereit || !ungespeichert || !verbunden || ausgesetzt || laeuft) {
      return;
    }
    const zeitgeber = window.setTimeout(() => {
      void selbstSichernRef.current();
    }, SELBST_SICHERN_PAUSE_MS);
    return () => window.clearTimeout(zeitgeber);
  }, [selbstAktiv, selbstStand, selbstBereit, ungespeichert, verbunden, ausgesetzt, laeuft]);

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
          {texte.ohneVerbindung}
        </Statusmeldung>
      ) : null}

      {/* Fehler eines Schreibvorgangs stehen hier, gleich über welche
          Schaltfläche er lief - ein Weg, eine Stelle (FIX-014). */}
      {fehler && !offen ? (
        kompakt ? (
          <Statusmeldung ton="fehler" className="px-4 py-2">
            {fehler.titel}: {fehler.text}
          </Statusmeldung>
        ) : (
          <div className="mt-4">
            <ErrorState title={fehler.titel} description={fehler.text} />
          </div>
        )
      ) : null}

      {offen && kompakt ? (
        <div
          ref={kasten}
          role="group"
          aria-label={texte.bezeichnung}
          className="border-line-strong bg-canvas flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2"
        >
          <p className="text-ink text-sm font-semibold">
            {abmeldemodus
              ? 'Text noch nicht gespeichert – abmelden?'
              : 'Text noch nicht gespeichert.'}
          </p>
          {fehler ? (
            <Statusmeldung ton="fehler" className="basis-full">
              {fehler.text} {texte.bleibtStehen}, die Seite bleibt geöffnet
              {abmeldemodus ? ', die Sitzung bleibt bestehen' : ''}.
            </Statusmeldung>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            {speichern ? (
              <Button
                type="button"
                groesse="kompakt"
                disabled={laeuft}
                onClick={speichernUndWeiter}
              >
                {laeuft
                  ? 'Wird gespeichert …'
                  : abmeldemodus
                    ? 'Speichern und abmelden'
                    : 'Speichern und weiter'}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              disabled={laeuft}
              onClick={weitergehen}
            >
              {abmeldemodus ? 'Verwerfen und abmelden' : 'Verwerfen'}
            </Button>
            <Button
              type="button"
              variant="quiet"
              groesse="kompakt"
              disabled={laeuft}
              onClick={bleiben}
            >
              Weiterschreiben
            </Button>
          </div>
        </div>
      ) : offen ? (
        <div
          ref={kasten}
          role="group"
          aria-label={texte.bezeichnung}
          className="border-line-strong bg-surface-sunken rounded-card mt-4 border p-4"
        >
          <p className="text-ink text-sm leading-relaxed">
            {abmeldemodus ? texte.abmelden : texte.weitergehen}
          </p>
          {!speichern && texte.ohneSpeichern ? (
            <p className="text-ink-muted mt-2 text-sm leading-relaxed">{texte.ohneSpeichern}</p>
          ) : null}

          {fehler ? (
            <Statusmeldung ton="fehler" className="mt-3">
              {fehler.text} {texte.bleibtStehen}, die Seite bleibt geöffnet
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

  // Der Stand steht leise da, als Zeile ohne Unterbrechung: `role="status"`
  // liest ihn bei nächster Gelegenheit vor (Statusmeldung).
  const sicherungsstand = !selbstAktiv ? null : selbstLaeuft ? (
    <Statusmeldung className={kompakt ? 'px-4 py-1' : 'mt-2'}>Wird gesichert …</Statusmeldung>
  ) : selbstGesichertUm && !ausgesetzt ? (
    <Statusmeldung className={kompakt ? 'px-4 py-1' : 'mt-2'}>
      Als Entwurf gesichert um {uhrzeit(selbstGesichertUm)}
      {ungespeichert ? ' – Neues wird gleich gesichert.' : '.'}
    </Statusmeldung>
  ) : null;

  return {
    schreiben,
    laeuft,
    freigeben: () => {
      freigegeben.current = true;
    },
    schutz,
    sicherungsstand,
  };
}

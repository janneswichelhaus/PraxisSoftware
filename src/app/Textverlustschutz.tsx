import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavigationType, useBlocker, type BlockerFunction } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { ErrorState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { useAbmeldewache } from '@/app/abmeldeschutz';
import { useSperrsicherung } from '@/lib/sperrsicherung';
import { useIstVerbunden } from '@/app/verbindung';

/**
 * Schutz vor Textverlust (§13): Ungespeichertes hält Seitenwechsel, Abmelden und Schließen an.
 * Gesichert wird nur als Entwurf auf dem Server, nie lokal und nie als Finalisierung (ADR-001,
 * ADR-016); ein Fehlschlag lässt Text, Seite und Sitzung stehen (ANN-046).
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
   * Wartet, bis ein laufender Vorgang - auch eine Sicherung von selbst - zu
   * Ende ist. Für Schreibwege, die nicht durch `schreiben` laufen, etwa den
   * Abschluss des Therapieberichts (Zweitreview UX-EPIC-007).
   */
  abwarten: () => Promise<void>;
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
  /**
   * Die Zeile der kompakten Rückfrage und ihr Knopf zum Bleiben, etwa
   * „Check-Up noch nicht gespeichert.“ und „Weiter prüfen“ (FLT-005). Ohne
   * Angabe die Sätze der Schreibseite: „Text noch nicht gespeichert.“ und
   * „Weiterschreiben“.
   */
  zeile?: { weitergehen: string; abmelden: string; bleiben: string } | undefined;
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
  nichtSicherbar,
  texte = DOKUMENTATIONSTEXTE,
  kompakt = false,
  selbst,
  auchSuchparameter = false,
  schrittZurueck,
  ohneVerbindungImFuss = false,
}: {
  /** Steht im Feld etwas, das noch nicht auf dem Server liegt? */
  ungespeichert: boolean;
  /**
   * Was außer dem Text offen ist und nie gespeichert wird, als ein Satz für
   * die Rückfrage - etwa „Der Vorschlag aus der Aufnahme ist nicht
   * übernommen.“ (KI-EPIC-001). `undefined`: nichts.
   */
  nichtSicherbar?: string | undefined;
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
  selbst?:
    | {
        stand: string;
        bereit: boolean;
        /**
         * Hilft ein erneuter Versuch nicht (Konflikt, inzwischen
         * finalisiert)? Dann setzt die Sicherung aus. Ohne Angabe gilt das
         * für jeden Fehler.
         */
        aussetzenBei?: (fehler: unknown) => boolean;
      }
    | undefined;
  /**
   * Gilt auch ein Wechsel der Suchparameter als Weggehen? Für eine Seite,
   * deren Inhalt an einem Parameter hängt - der Check-Up an `?rad=` (FLT-005).
   */
  auchSuchparameter?: boolean;
  /**
   * Ein Ablauf mit Schritten (FLT-005): Das Zurück des Browsers geht einen
   * Schritt zurück, ohne Rückfrage. `undefined` auf dem ersten Schritt - dann
   * fragt der Schutz wie vor jedem Weggehen.
   */
  schrittZurueck?: (() => void) | undefined;
  /** Die Seite sagt am gesperrten Knopf selbst, dass ohne Verbindung nichts geht; die Zeile oben entfällt. */
  ohneVerbindungImFuss?: boolean;
}): Textverlustschutz {
  // Angehalten wird für beides: ungespeicherten Text und Offenes, das sich
  // nicht speichern lässt.
  const halten = ungespeichert || nichtSicherbar !== undefined;
  useVerlassenWarnung(halten);
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
  const haltenRef = useRef(halten);
  haltenRef.current = halten;
  const nichtSicherbarRef = useRef(nichtSicherbar);
  nichtSicherbarRef.current = nichtSicherbar;
  const freigegeben = useRef(false);
  // Zwei Schreibvorgänge gleichzeitig gäbe es sonst: Der Zustand `laeuft`
  // steht erst nach dem Rendern, zwei Taps kurz hintereinander lägen davor.
  const laufend = useRef(false);

  // Sicherung von selbst (BEF-056): wann zuletzt gelungen, ob sie gerade
  // läuft, ob sie nach einem Fehler aussetzt.
  const [selbstGesichertUm, setSelbstGesichertUm] = useState<Date | null>(null);
  const [selbstLaeuft, setSelbstLaeuft] = useState(false);
  const [ausgesetzt, setAusgesetzt] = useState(false);
  // Der Stand, an dem eine Sicherung von selbst vorübergehend scheiterte
  // (Funkloch, Zeitüberschreitung). Für ihn wird nicht erneut versucht - die
  // nächste Eingabe oder die zurückkehrende Verbindung tun es.
  const [gescheitertBei, setGescheitertBei] = useState<string | null>(null);
  // Der laufende Vorgang, damit andere auf ihn warten können: ein Tipp auf
  // „Festschreiben“ während einer Sicherung von selbst, die Sitzungssperre,
  // der Abschluss des Berichts (Zweitreview UX-EPIC-007).
  const laufenderVorgang = useRef<Promise<unknown> | null>(null);
  const selbstLaeuftRef = useRef(false);

  const auchSuchparameterRef = useRef(auchSuchparameter);
  auchSuchparameterRef.current = auchSuchparameter;
  // Kam die angehaltene Navigation aus dem Zurück des Browsers?
  const zurueckGeste = useRef(false);
  const schrittZurueckRef = useRef(schrittZurueck);
  schrittZurueckRef.current = schrittZurueck;

  const anhalten = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation, historyAction }) => {
      // Ein Wechsel der Suchparameter auf derselben Seite ist kein Weggehen:
      // Er behält das Formular und seinen Inhalt - außer die Seite hängt an
      // ihnen (FLT-005).
      if (
        currentLocation.pathname === nextLocation.pathname &&
        (!auchSuchparameterRef.current || currentLocation.search === nextLocation.search)
      ) {
        return false;
      }
      if (freigegeben.current) {
        freigegeben.current = false;
        return false;
      }
      zurueckGeste.current = historyAction === NavigationType.Pop;
      // Im Ablauf mit Schritten geht die Zurückgeste immer einen Schritt
      // zurück, nicht nur, wenn etwas ungespeichert ist (BEF-175): Sonst
      // verließe sie auf einer Seite ohne Eingabe den ganzen Ablauf.
      if (zurueckGeste.current && schrittZurueckRef.current !== undefined) return true;
      return haltenRef.current;
    },
    [],
  );

  const blocker = useBlocker(anhalten);

  // Die Hülle der Sperre wird bei jedem Zustandswechsel neu erzeugt. Ein
  // Handler, der nach einem `await` weiterläuft, darf nicht auf der alten
  // sitzen bleiben.
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  const blockiert = blocker.state === 'blocked';

  // Ein Schritt zurück statt einer Rückfrage (FLT-005): Die Adresse hat der
  // Router schon wiederhergestellt; die Seite geht zurück, die Sperre löst sich.
  const einSchrittZurueck = blockiert && zurueckGeste.current && schrittZurueck !== undefined;
  useEffect(() => {
    if (!einSchrittZurueck) return;
    schrittZurueckRef.current?.();
    blockerRef.current.reset?.();
  }, [einSchrittZurueck]);

  // Die Wache des Abmeldeschutzes: Sie übernimmt nur, wenn wirklich etwas im
  // Feld steht. Sonst meldet die Kopfzeile unmittelbar ab - eine Rückfrage
  // ohne Anlass wäre nur Reibung.
  const abmelden = useAbmeldewache(() => {
    if (!haltenRef.current) return false;
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
    // Eine laufende Sicherung von selbst erst zu Ende kommen lassen: Zwei
    // gleichzeitige Schreibvorgänge legten auf der Nachtragsseite sonst zwei
    // Nachträge an (Zweitreview UX-EPIC-007).
    await laufenderVorgang.current?.catch(() => undefined);
    // Offenes, das sich nicht speichern lässt, hält die Seite verborgen fest;
    // ungespeicherter Text geht trotzdem als Entwurf auf den Server.
    if (!ungespeichertRef.current) return nichtSicherbarRef.current === undefined;
    const sichern = speichernRef.current;
    if (!sichern) return false;
    try {
      return (await sichern()) && nichtSicherbarRef.current === undefined;
    } catch {
      return false;
    }
  });

  const offen = (blockiert && !einSchrittZurueck) || abmeldenGefragt;

  useEffect(() => {
    // Den Fokus führt das Fenster (`data-autofocus`): auf „Speichern und …“,
    // sonst auf „bleiben“ - nie auf „Verwerfen“, damit ein Enter nichts
    // verwirft (ANN-566).
    if (!offen) setFehler(undefined);
  }, [offen]);

  async function schreiben(auftrag: Schreibauftrag): Promise<void> {
    // Läuft gerade nur eine Sicherung von selbst, wartet ein ausdrücklicher
    // Vorgang auf sie, statt still verloren zu gehen (Zweitreview
    // UX-EPIC-007). Gegen den Doppeltipp bleibt die Sperre sonst bestehen.
    if (laufend.current && selbstLaeuftRef.current) {
      await laufenderVorgang.current?.catch(() => undefined);
    }
    if (laufend.current) return;
    laufend.current = true;
    setLaeuft(true);
    setFehler(undefined);

    let vollstaendig = false;
    try {
      const vorgang = auftrag.ausfuehren();
      laufenderVorgang.current = vorgang;
      vollstaendig = await vorgang;
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
    if (vollstaendig) {
      setAusgesetzt(false);
      setGescheitertBei(null);
    }

    // Außerhalb des `try`: Ein Fehler im Weitergehen ist kein Schreibfehler
    // und darf nicht als solcher im Kasten landen.
    if (vollstaendig) auftrag.danach?.();
  }

  /**
   * Der Entwurf, von selbst gesichert (BEF-056, ANN-319).
   *
   * Derselbe Vorgang wie `schreiben`, mit zwei Unterschieden: Wer während
   * der Sicherung weitertippt, bekommt keinen Fehler - die nächste Pause
   * sichert den Rest. Und ein Fehlschlag wird nicht bei jeder Pause
   * wiederholt: Ein dauerhafter (Konflikt, inzwischen finalisiert) setzt die
   * Sicherung aus, bis ausdrücklich gespeichert wurde - sonst überschriebe sie
   * im Konfliktfall still einen fremden Stand -; ein vorübergehender
   * (Funkloch) wartet auf die nächste Eingabe oder die Verbindung.
   */
  async function selbstSichern(): Promise<void> {
    const sichern = speichernRef.current;
    if (!sichern || laufend.current || !ungespeichertRef.current) return;
    const stand = selbstStandRef.current;
    laufend.current = true;
    selbstLaeuftRef.current = true;
    setLaeuft(true);
    setSelbstLaeuft(true);
    setFehler(undefined);
    try {
      const vorgang = sichern();
      laufenderVorgang.current = vorgang;
      await vorgang;
      setSelbstGesichertUm(new Date());
      setGescheitertBei(null);
    } catch (error) {
      if (aussetzenBeiRef.current(error)) setAusgesetzt(true);
      else setGescheitertBei(stand ?? null);
      setFehler({
        titel: 'Nicht von selbst gesichert',
        text: error instanceof Error ? error.message : 'Sichern nicht möglich.',
      });
    } finally {
      laufend.current = false;
      selbstLaeuftRef.current = false;
      setLaeuft(false);
      setSelbstLaeuft(false);
    }
  }
  const selbstSichernRef = useRef(selbstSichern);
  selbstSichernRef.current = selbstSichern;

  const selbstAktiv = selbst !== undefined && speichern !== undefined;
  const selbstStand = selbst?.stand;
  const selbstBereit = selbst?.bereit ?? false;
  const selbstStandRef = useRef(selbstStand);
  selbstStandRef.current = selbstStand;
  const aussetzenBeiRef = useRef(selbst?.aussetzenBei ?? (() => true));
  aussetzenBeiRef.current = selbst?.aussetzenBei ?? (() => true);

  // Kehrt die Verbindung zurück, gilt ein vorübergehendes Scheitern nicht mehr.
  useEffect(() => {
    if (verbunden) setGescheitertBei(null);
  }, [verbunden]);

  useEffect(() => {
    // Nach jeder Änderung beginnt die Pause neu; erst wenn sie verstreicht,
    // wird gesichert. Ohne Verbindung wartet die Sicherung, bis sie zurück
    // ist - `verbunden` steht deshalb in den Abhängigkeiten. Ebenso `laeuft`:
    // Was während eines Vorgangs dazukam, sichert die Pause danach. Steht
    // die Rückfrage offen, entscheidet die Person: Ein Sichern von selbst
    // nähme ihr „Verwerfen“ vorweg.
    if (
      !selbstAktiv ||
      !selbstBereit ||
      !ungespeichert ||
      !verbunden ||
      ausgesetzt ||
      laeuft ||
      offen ||
      selbstStand === gescheitertBei
    ) {
      return;
    }
    const zeitgeber = window.setTimeout(() => {
      void selbstSichernRef.current();
    }, SELBST_SICHERN_PAUSE_MS);
    return () => window.clearTimeout(zeitgeber);
  }, [
    selbstAktiv,
    selbstStand,
    selbstBereit,
    ungespeichert,
    verbunden,
    ausgesetzt,
    laeuft,
    offen,
    gescheitertBei,
  ]);

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
  // Ohne Offenes bleibt alles wie seit FIX-014. Ist nur Offenes da, gibt es
  // nichts zu speichern - dann kein „Speichern und weiter“.
  const speichernAnbieten =
    speichern !== undefined && (ungespeichert || nichtSicherbar === undefined);
  // Der Titel des Fensters: am Formular mit fester Fußleiste die gewohnte
  // Zeile, etwa „Check-Up noch nicht gespeichert“; was sich nicht speichern
  // lässt, steht darunter als eigener Absatz.
  const zeile = (
    abmeldemodus
      ? (texte.zeile?.abmelden ?? 'Text noch nicht gespeichert – abmelden?')
      : (texte.zeile?.weitergehen ?? 'Text noch nicht gespeichert.')
  ).replace(/\.$/, '');
  const titel =
    kompakt && (ungespeichert || nichtSicherbar === undefined)
      ? zeile
      : abmeldemodus
        ? 'Vor dem Abmelden'
        : 'Noch nicht gespeichert';

  const schutz = (
    <>
      {!verbunden && ungespeichert && !ohneVerbindungImFuss ? (
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

      {/* Die Rückfrage als Fenster über der Seite (Jannes 2026-10-16,
          ANN-566): Der Hintergrund ist gesperrt, und niemand übersieht sie
          am Ende einer langen Seite. Escape und ein Tipp daneben heißen
          „bleiben“, nie „verwerfen“. */}
      {offen ? (
        <Dialogfenster
          titel={titel}
          onSchliessen={() => {
            if (!laeuft) bleiben();
          }}
        >
          <div role="group" aria-label={texte.bezeichnung}>
            {ungespeichert || nichtSicherbar === undefined ? (
              <p className="text-ink text-sm leading-relaxed">
                {abmeldemodus ? texte.abmelden : texte.weitergehen}
              </p>
            ) : null}
            {nichtSicherbar !== undefined ? (
              <p className="text-ink mt-2 text-sm leading-relaxed first:mt-0">{nichtSicherbar}</p>
            ) : null}
            {!speichern && texte.ohneSpeichern ? (
              <p className="text-ink-muted mt-2 text-sm leading-relaxed">{texte.ohneSpeichern}</p>
            ) : null}

            {fehler ? (
              <Statusmeldung ton="fehler" className="mt-3">
                {fehler.text} {texte.bleibtStehen}, die Seite bleibt geöffnet
                {abmeldemodus ? ', die Sitzung bleibt bestehen' : ''}.
              </Statusmeldung>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              {speichernAnbieten ? (
                <Button type="button" disabled={laeuft} data-autofocus onClick={speichernUndWeiter}>
                  {laeuft
                    ? 'Wird gespeichert …'
                    : abmeldemodus
                      ? 'Speichern und abmelden'
                      : kompakt
                        ? 'Speichern und weiter'
                        : 'Speichern und weitergehen'}
                </Button>
              ) : null}
              <Button type="button" variant="secondary" disabled={laeuft} onClick={weitergehen}>
                {abmeldemodus
                  ? 'Verwerfen und abmelden'
                  : kompakt
                    ? 'Verwerfen'
                    : 'Verwerfen und weitergehen'}
              </Button>
              <Button
                type="button"
                variant="quiet"
                disabled={laeuft}
                data-autofocus={speichernAnbieten ? undefined : true}
                onClick={bleiben}
              >
                {kompakt ? (texte.zeile?.bleiben ?? 'Weiterschreiben') : 'Hier bleiben'}
              </Button>
            </div>
          </div>
        </Dialogfenster>
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
    abwarten: async () => {
      await laufenderVorgang.current?.catch(() => undefined);
    },
  };
}

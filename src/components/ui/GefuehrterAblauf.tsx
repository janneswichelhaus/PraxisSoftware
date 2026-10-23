import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { bewegungErlaubt } from './bewegung';
import { Button } from './Button';
import { Dialogfenster, Fenstertitel, type Titelstufe } from './Dialogfenster';
import { ProgressBar } from './ProgressBar';

/**
 * Nach jedem Seitenwechsel nimmt die Fläche so lange keinen Tipp an
 * (Praxis-Review FLT-005, ANN-563): Ein prellender Handschuh oder ein
 * ungeduldiger zweiter Tipp träfe sonst den Knopf an derselben Stelle der
 * nächsten Seite, und eine Frage wäre ungesehen beantwortet. Beim Check-Up so
 * lange, wie die Kamera fliegt.
 */
export const TIPPSPERRE_MS = 700;

/**
 * Der geführte Ablauf (DESIGN.md „Geführter Ablauf“, Überholung 6, ANN-572):
 * ein Fenster, eine Frage je Seite, die Antwort führt weiter. Entstanden aus
 * dem Check-Up am Rad (FLT-005); der Check-Up ist der erste, der ihn trägt.
 *
 * Was jeder Ablauf gleich bekommt:
 *
 *   * **Kopf** im `Dialogfenster vollbild`: worum es geht (`objekt`, etwa das
 *     Rad oder der Termin) und ✕ mit eigenem Namen („Check-Up abbrechen“). Am
 *     Telefon randlos, am Rechner groß in der Mitte.
 *   * **„← Zurück“ und der Schritt** darunter; der Balken nur mit fester
 *     Schrittzahl - ein verzweigter Weg (die Panne) hat keine.
 *   * **Die Frage als Überschrift** (`Fenstertitel`), nach ihr heißt das
 *     Fenster. Ohne Bühne steht sie oben, die Antworten im festen **Fuß**
 *     darunter, im Daumenbereich und ohne Rollen. Mit Bühne (das 3D-Rad)
 *     steht sie unter der Bühne, direkt über den Antworten (Jannes 2026-10-16).
 *   * **Der Abschluss** (`abschluss`): Die Zusammenfassung rollt, der Fuß mit
 *     dem einen Hauptknopf steht fest darunter, mit einer Linie.
 *   * **Die Seiten wechseln waagerecht** (ANN-663): Die nächste rückt von
 *     rechts nach, „← Zurück“ und die Zurückgeste holen die vorige von links.
 *     Das Fenster selbst kam von unten - es ist die Ebene, die Seiten darin
 *     sind gleichrangig.
 *   * **Tippsperre** nach jedem Wechsel der `seite` und eine **Ansage** für
 *     Vorlesesoftware; der Fokus folgt der neuen Seite (`data-autofocus`).
 *   * Die **Rückfrage vor dem Verlust** (`schutz` aus `useTextverlustschutz`)
 *     gleich unter dem Kopf - dort, wo ✕ liegt.
 *
 * Welche Seite auf welche folgt, steht nicht hier, sondern im Ablauf selbst
 * (`abfolge.ts` für den gemeinsamen Teil). Nicht für Tägliches: Dort kostet
 * ein Schritt je Frage nur Tipps (DESIGN.md).
 *
 * **Zusätzlich und abschaltbar** (Handoff 2026-10-22, Abschnitt 5.3; der
 * Einstieg der Plattform): `spaeter` statt der Zeile mit ✕, `balkenJeSchritt`,
 * `titelStufe`, `vorDemTitel` und `fussSchmalImFluss`. Ohne sie bleibt jeder
 * Ablauf, wie er ist.
 */
export function GefuehrterAblauf({
  titel,
  objekt,
  schliessen,
  onSchliessen,
  seite,
  stand,
  onZurueck,
  ansage,
  schutz,
  buehne,
  buehneAmTelefon = true,
  flaecheKnapp = false,
  abschluss = false,
  fuss,
  tippsperre = true,
  spaeter = false,
  balkenJeSchritt = false,
  titelStufe,
  vorDemTitel,
  fussSchmalImFluss = false,
  children,
}: {
  /** Die Frage der Seite: Überschrift und Name des Fensters. */
  titel: string;
  /** Worum es geht, eine Zeile im Kopf (DESIGN.md Regel 6). */
  objekt?: string | undefined;
  /** Name des ✕, etwa „Check-Up abbrechen“. */
  schliessen: string;
  onSchliessen: () => void;
  /**
   * Kennung der Seite. Ändert sie sich, greift die Tippsperre, und ohne Bühne
   * beginnt die Seite neu - samt Fokus auf ihrem `data-autofocus`.
   */
  seite: string;
  /** „Schritt 2 von 4“; mit `von` dazu der Balken. */
  stand?: { text: string; wert?: number; von?: number } | undefined;
  /** „← Zurück“; ohne Angabe (erste Seite) kein Knopf. */
  onZurueck?: (() => void) | undefined;
  /** Was Vorlesesoftware beim Wechsel hört; sonst Schritt und Frage. */
  ansage?: string | undefined;
  /** Hinweise und Rückfrage des Textverlustschutzes. */
  schutz?: ReactNode;
  /** Oben, über der Frage: etwa das 3D-Rad. */
  buehne?: ReactNode;
  /** Am Telefon die Bühne zeigen; im Abschluss des Check-Ups nicht. */
  buehneAmTelefon?: boolean;
  /** Mit Bühne: die Fläche der Frage höchstens 60 % hoch (lange Stelle). */
  flaecheKnapp?: boolean;
  /** Der Abschluss: Inhalt rollt, der Fuß steht fest mit Linie darüber. */
  abschluss?: boolean;
  /** Die Antworten oder der Hauptknopf, fest unten. */
  fuss?: ReactNode;
  /** Die Tippsperre nach jedem Wechsel; aus nur, wo nichts verwechselt werden kann. */
  tippsperre?: boolean;
  /**
   * Ein Ablauf, den man jederzeit auf später legen kann: Die Zeile mit ✕ und
   * `objekt` entfällt, links steht „← Zurück“, rechts „Später“, beide 48 hoch.
   * „Später“ schließt wie ✕ (`onSchliessen`), Escape und ein Tipp daneben
   * ebenso. Auf dem Abschluss steht es nicht - sein Fuß führt ohnehin hinaus.
   */
  spaeter?: boolean;
  /** Ein Balken je Schritt statt eines durchgehenden; braucht `stand.von`. */
  balkenJeSchritt?: boolean;
  /** Die Frage in einer Stufe der Plattform statt in der des Fensters. */
  titelStufe?: Titelstufe | undefined;
  /** Über der Frage, im Inhalt: etwa ein Bild und eine Bestätigung. Nicht mit Bühne. */
  vorDemTitel?: ReactNode;
  /**
   * Unter 23rem (200 % Zoom am Telefon) steht der Fuß am Ende des Inhalts und
   * rollt mit, statt fest unten ein Drittel der Höhe zu nehmen (ANN-682).
   */
  fussSchmalImFluss?: boolean;
  children?: ReactNode;
}) {
  const gesperrt = useTippsperre(seite, tippsperre);
  const schritt = useRef<HTMLDivElement>(null);
  const zurueck = useSchrittrichtung(schritt, seite);
  const zurueckGehen = onZurueck
    ? () => {
        zurueck.current = true;
        onZurueck();
      }
    : undefined;
  const sperre = gesperrt ? 'pointer-events-none' : '';
  // Die Fläche, die rollt, erreicht auch die Tastatur - auf einer Seite ohne
  // Bedienelement darin sonst nicht (axe `scrollable-region-focusable`,
  // BEF-175). Ohne eigene Rolle und ohne Namen: Das Fenster heißt schon nach
  // der Frage, und ein zweiter Name träfe jede Suche nach einem Feld, dessen
  // Beschriftung in der Frage steht („Wofür?“ in „Wie viel und wofür?“).
  const rollflaeche = { tabIndex: 0 } as const;
  const mitFuss = fuss !== undefined && fuss !== null && fuss !== false;
  const balken = stand?.von ? (
    balkenJeSchritt ? (
      <Schrittbalken wert={stand.wert ?? 0} von={stand.von} />
    ) : (
      <ProgressBar wert={stand.wert ?? 0} von={stand.von} />
    )
  ) : null;

  const kopf = (
    <>
      <p className="sr-only" aria-live="polite">
        {ansage ?? (stand ? `${stand.text}: ${titel}` : titel)}
      </p>
      {spaeter ? (
        // Der Kopf ohne ✕-Zeile (5.3): „← Zurück“ und „Später“ in einer
        // Reihe, darunter der Balken mit dem Schritt daneben.
        <div className="shrink-0 px-4 pt-2">
          <div className="flex min-h-12 items-center gap-3">
            {zurueckGehen ? (
              <Button variant="quiet" className="-ml-3" onClick={zurueckGehen}>
                ← Zurück
              </Button>
            ) : null}
            {abschluss ? null : (
              <Button variant="quiet" className="-mr-3 ml-auto" onClick={onSchliessen}>
                Später
              </Button>
            )}
          </div>
          {stand ? (
            <div className="flex items-center gap-3">
              {balken}
              <p className="text-ink-muted ml-auto shrink-0 text-sm">{stand.text}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="shrink-0 px-4 pt-2">
          <div className="flex min-h-11 items-center gap-3">
            {zurueckGehen ? (
              <Button variant="quiet" groesse="kompakt" onClick={zurueckGehen}>
                ← Zurück
              </Button>
            ) : null}
            {stand ? <p className="text-ink-muted ml-auto text-sm">{stand.text}</p> : null}
          </div>
          {balkenJeSchritt && balken ? <div className="mt-2 flex">{balken}</div> : balken}
        </div>
      )}
      {/* Die Rückfrage vor dem Weggehen, gleich unter dem Kopf: dort, wo das
          ✕ liegt, und auf jeder Seite ohne Rollen. */}
      {schutz ? <div className="shrink-0">{schutz}</div> : null}
    </>
  );

  const fussLeiste = mitFuss ? (
    <div className={`shrink-0 px-4 pt-2 pb-4 ${abschluss ? 'border-line border-t' : ''}`.trim()}>
      {fuss}
    </div>
  ) : null;

  if (buehne) {
    // Bühne und Fragefläche teilen sich die Höhe; ab 1024 px nebeneinander.
    // Im Abschluss rollt die Zusammenfassung, der Fuß steht fest darunter.
    const flaeche = abschluss
      ? 'flex min-h-0 flex-1 flex-col lg:flex-none'
      : `overflow-y-auto px-4 pt-2 pb-4 lg:pt-4 ${
          flaecheKnapp ? 'max-h-ablauf-knapp shrink-0 lg:max-h-none' : 'shrink-0'
        }`;
    return (
      <Dialogfenster
        vollbild
        titel={titel}
        beschreibung={objekt}
        onSchliessen={onSchliessen}
        schliessenBeschriftung={schliessen}
        titelImInhalt
        ohneKopfzeile={spaeter}
      >
        {kopf}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div
            className={`flex-col px-4 pt-3 pb-2 lg:p-4 ${
              buehneAmTelefon
                ? 'flex min-h-36 flex-1 lg:min-h-0'
                : 'hidden lg:flex lg:min-h-0 lg:flex-1'
            }`}
          >
            {buehne}
          </div>
          <div
            ref={schritt}
            className={`lg:border-line lg:w-ablaufspalte lg:shrink-0 lg:border-l ${flaeche} ${sperre}`.trim()}
          >
            {abschluss ? (
              <>
                <div className="shrink-0 px-4 pt-3 lg:pt-4">
                  <Fenstertitel stufe={titelStufe} />
                </div>
                <div
                  className={`min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4 lg:pt-4 ${ROLLFLAECHE}`}
                  {...rollflaeche}
                >
                  {children}
                </div>
                {fussLeiste}
              </>
            ) : (
              <>
                {/* Die Überschrift unter der Bühne, direkt über den Antworten -
                    wo der Daumen ist und der Blick als Nächstes hinwill. */}
                <div className="mb-3">
                  <Fenstertitel stufe={titelStufe} />
                </div>
                {children}
                {fuss}
              </>
            )}
          </div>
        </div>
      </Dialogfenster>
    );
  }

  // Unter 23rem rollt die ganze Seite samt Fuß, nicht nur ihr Inhalt.
  const schmal = fussSchmalImFluss
    ? {
        seite: 'max-[23rem]:overflow-y-auto',
        inhalt: 'max-[23rem]:flex-none max-[23rem]:overflow-visible',
      }
    : { seite: '', inhalt: '' };

  return (
    <Dialogfenster
      vollbild
      titel={titel}
      beschreibung={objekt}
      onSchliessen={onSchliessen}
      schliessenBeschriftung={schliessen}
      titelImInhalt
      ohneKopfzeile={spaeter}
    >
      {kopf}
      {/* Jede Seite beginnt neu (`key`): Eingaben einer anderen Seite stehen
          nicht im Weg, und der Fokus geht auf ihr `data-autofocus`. */}
      <div
        key={seite}
        ref={schritt}
        className={`flex min-h-0 flex-1 flex-col ${schmal.seite} ${sperre}`.trim()}
      >
        <div
          className={`min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4 ${schmal.inhalt} ${ROLLFLAECHE}`}
          {...rollflaeche}
        >
          <div className="max-w-formular mx-auto flex w-full flex-col gap-4">
            {vorDemTitel}
            <Fenstertitel stufe={titelStufe} />
            {children}
          </div>
        </div>
        {fussLeiste ? (
          <div className="max-w-formular mx-auto w-full shrink-0">{fussLeiste}</div>
        ) : null}
      </div>
    </Dialogfenster>
  );
}

/**
 * Ein Balken je Schritt (Handoff 2026-10-22, Abschnitt 5.3): 4 hoch, erledigt
 * und aktuell in der Hauptfarbe, offen in der Spur. Für Vorlesesoftware
 * ausgeblendet - „Schritt 2 von 3“ steht als Text daneben.
 */
function Schrittbalken({ wert, von }: { wert: number; von: number }) {
  return (
    <span aria-hidden="true" className="flex min-w-0 flex-1 gap-1">
      {Array.from({ length: von }, (_, i) => (
        <span
          key={i}
          data-schritt={i < wert ? 'erreicht' : 'offen'}
          className={`rounded-pill h-1 flex-1 ${i < wert ? 'bg-accent' : 'bg-spur'}`}
        />
      ))}
    </span>
  );
}

/** Wie die Rollfläche den Tastaturfokus zeigt: innen, wie eine Listenzeile. */
const ROLLFLAECHE =
  'focus-visible:outline-accent focus-visible:outline-2 focus-visible:-outline-offset-2';

/** So weit rückt die neue Seite nach, und so lange. */
const SCHRITT_WEG = '3rem';
const SCHRITT_MS = 320;

/**
 * Die neue Seite rückt waagerecht nach (ANN-663): von rechts, nach einem
 * Schritt zurück von links. Zurück ist, was über „← Zurück“ kam oder über die
 * Zurückgeste (`popstate`); die Kurve ist `--ease-feder-weich`. Nie beim
 * ersten Zeichnen, nicht bei reduzierter Bewegung, nicht ohne
 * `Element.animate`. Text blendet dabei nicht ein; er rückt nur.
 */
function useSchrittrichtung(
  schritt: RefObject<HTMLDivElement | null>,
  seite: string,
): RefObject<boolean> {
  const zurueck = useRef(false);
  const vorige = useRef(seite);

  useEffect(() => {
    const geste = () => {
      zurueck.current = true;
    };
    window.addEventListener('popstate', geste);
    return () => window.removeEventListener('popstate', geste);
  }, []);

  useLayoutEffect(() => {
    if (vorige.current === seite) return;
    vorige.current = seite;
    const richtung = zurueck.current ? '-' : '';
    zurueck.current = false;
    const element = schritt.current;
    if (!element || typeof element.animate !== 'function' || !bewegungErlaubt()) return;
    element.animate([{ translate: `${richtung}${SCHRITT_WEG} 0` }, { translate: '0 0' }], {
      duration: SCHRITT_MS,
      easing: 'cubic-bezier(0.3, 1.12, 0.5, 1)',
    });
  }, [seite, schritt]);

  return zurueck;
}

/**
 * Ob die Fläche gerade keinen Tipp annimmt: kurz nach jedem Wechsel der
 * Seite, nie beim ersten Zeichnen. Der Vergleich mit der vorigen Kennung hält
 * auch das doppelte Zeichnen des StrictMode aus.
 */
function useTippsperre(seite: string, an: boolean): boolean {
  const [gesperrt, setGesperrt] = useState(false);
  const vorige = useRef(seite);
  const uhr = useRef<number | undefined>(undefined);

  // Vor dem Zeichnen: Der zweite Tipp eines Doppeltipps trifft schon die
  // gesperrte Fläche.
  useLayoutEffect(() => {
    if (vorige.current === seite) return;
    vorige.current = seite;
    if (!an) return;
    setGesperrt(true);
    window.clearTimeout(uhr.current);
    uhr.current = window.setTimeout(() => setGesperrt(false), TIPPSPERRE_MS);
  }, [seite, an]);

  useEffect(() => () => window.clearTimeout(uhr.current), []);

  return gesperrt;
}

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
import { Dialogfenster, Fenstertitel } from './Dialogfenster';
import type { Titelstufe } from './titelstufe';
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
 * Der geführte Ablauf (DESIGN.md „Geführter Ablauf“, ANN-572): ein Fenster, eine Frage je Seite, die
 * Antwort führt weiter; Kopf, Schritt, Tippsperre, Ansage und Rückfrage bekommt jeder Ablauf gleich.
 * Welche Seite folgt, steht im Ablauf selbst (`abfolge.ts`).
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
  abschluss = false,
  fuss,
  tippsperre = true,
  spaeter = false,
  balkenJeSchritt = false,
  titelStufe,
  vorDemTitel,
  inhaltUnten = false,
  band,
  plattform = false,
  schmalesFenster = false,
  children,
}: {
  /** Die Frage der Seite: Überschrift und Name des Fensters. */
  titel: string;
  /** Worum es geht, eine Zeile im Kopf (DESIGN.md Regel 6). */
  objekt?: string | undefined;
  /** Name des ✕, etwa „Check-Up abbrechen“. */
  schliessen: string;
  onSchliessen: () => void;
  /** Kennung der Seite: Ändert sie sich, greift die Tippsperre, und die Seite beginnt neu. */
  seite: string;
  /** „Schritt 2 von 4“; mit `von` dazu der Balken. */
  stand?: { text: string; wert?: number; von?: number } | undefined;
  /** „← Zurück“; ohne Angabe (erste Seite) kein Knopf. */
  onZurueck?: (() => void) | undefined;
  /** Was Vorlesesoftware beim Wechsel hört; sonst Schritt und Frage. */
  ansage?: string | undefined;
  /** Hinweise und Rückfrage des Textverlustschutzes. */
  schutz?: ReactNode;
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
  /** Über der Frage, im Inhalt: etwa ein Bild und eine Bestätigung. */
  vorDemTitel?: ReactNode;
  /** Am Telefon steht der Inhalt unten über dem Fuß, im Daumenbereich (Antworten im Inhalt). */
  inhaltUnten?: boolean;
  /**
   * Unter dem Fortschritt über die ganze Breite des Fensters: das Band „Sie
   * handeln für …“ einer Vertretung (5.3), dieselbe Leiste wie im Gerüst.
   */
  band?: ReactNode;
  /**
   * Im Rhythmus der Plattform: 20 px Rand statt 16; unter 23rem (200 % Zoom) 12 px, und die ganze
   * Seite rollt samt Kopf und Fuß, statt oben und unten je ein Drittel festzuhalten (ANN-682).
   */
  plattform?: boolean;
  /** Am Rechner ein Fenster so breit wie ein Formular, innen 24; darunter wie am Telefon. */
  schmalesFenster?: boolean;
  children?: ReactNode;
}) {
  const gesperrt = useTippsperre(seite, tippsperre);
  const schritt = useRef<HTMLDivElement>(null);
  // Unter 23rem rollen Kopf und Seite in einer Fläche, die beim Wechsel
  // bleibt: Die neue Seite beginnt trotzdem oben, mit Kopf und Frage.
  const ganzeFlaeche = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ganzeFlaeche.current) ganzeFlaeche.current.scrollTop = 0;
  }, [seite]);
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
  const rand =
    `${plattform ? 'px-5 max-[23rem]:px-3' : 'px-4'} ${schmalesFenster ? 'lg:px-6' : ''}`.trim();
  // Das Band reicht über den Rand hinaus bis an die Kanten des Fensters.
  const bandleiste = band ? (
    <div className={`mt-3 ${plattform ? '-mx-5 max-[23rem]:-mx-3' : '-mx-4'}`}>{band}</div>
  ) : null;
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
        // Reihe, darunter der Balken mit dem Schritt daneben - an der Kante
        // des Inhalts. Wird es eng (200 %), rückt der Schritt unter den Balken.
        <div className={`shrink-0 pt-2 ${rand}`}>
          <div className="max-w-formular mx-auto w-full">
            {/* Wird es eng (200 %), rückt „Später“ in eine eigene Reihe, statt
                beide Wörter mitten im Wort zu brechen - mit 8 px Abstand. */}
            <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2">
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {balken}
                <p className="text-ink-muted ml-auto shrink-0 text-sm">{stand.text}</p>
              </div>
            ) : null}
          </div>
          {bandleiste}
        </div>
      ) : (
        <div className={`shrink-0 pt-2 ${rand}`}>
          <div className="flex min-h-11 items-center gap-3">
            {zurueckGehen ? (
              <Button variant="quiet" groesse="kompakt" onClick={zurueckGehen}>
                ← Zurück
              </Button>
            ) : null}
            {stand ? <p className="text-ink-muted ml-auto text-sm">{stand.text}</p> : null}
          </div>
          {balkenJeSchritt && balken ? <div className="mt-2 flex">{balken}</div> : balken}
          {bandleiste}
        </div>
      )}
      {/* Die Rückfrage vor dem Weggehen, gleich unter dem Kopf: dort, wo das
          ✕ liegt, und auf jeder Seite ohne Rollen. */}
      {schutz ? <div className="shrink-0">{schutz}</div> : null}
    </>
  );

  const fussLeiste = mitFuss ? (
    <div className={`shrink-0 pt-2 pb-4 ${rand} ${abschluss ? 'border-line border-t' : ''}`.trim()}>
      {fuss}
    </div>
  ) : null;

  // Unter 23rem rollt alles zusammen - Kopf, Inhalt und Fuß -, nicht nur der
  // Inhalt zwischen festem Kopf und Fuß.
  const schmal = plattform
    ? {
        seite: 'max-[23rem]:flex-none',
        inhalt: 'max-[23rem]:flex-none max-[23rem]:overflow-visible',
      }
    : { seite: '', inhalt: '' };
  const hoch = plattform || inhaltUnten ? 'h-full' : '';
  const seiteMitFuss = (
    <div
      key={seite}
      ref={schritt}
      className={`flex min-h-0 flex-1 flex-col ${schmal.seite} ${sperre}`.trim()}
    >
      <div
        className={`min-h-0 flex-1 overflow-y-auto pt-3 pb-4 ${rand} ${schmal.inhalt} ${ROLLFLAECHE}`}
        {...rollflaeche}
      >
        {/* Im Rhythmus der Plattform so hoch wie die Fläche: Was schrumpfen darf
            (ein Bild über der Frage), gibt Platz her, bevor die Seite rollt. */}
        <div className={`max-w-formular mx-auto flex w-full flex-col gap-4 ${hoch}`.trim()}>
          {vorDemTitel}
          <Fenstertitel stufe={titelStufe} />
          {inhaltUnten ? (
            <div className="mt-auto flex flex-col gap-4 lg:mt-0">{children}</div>
          ) : (
            children
          )}
        </div>
      </div>
      {fussLeiste ? (
        <div className="max-w-formular mx-auto w-full shrink-0">{fussLeiste}</div>
      ) : null}
    </div>
  );

  return (
    <Dialogfenster
      vollbild
      schmal={schmalesFenster}
      plattform={plattform}
      titel={titel}
      beschreibung={objekt}
      onSchliessen={onSchliessen}
      schliessenBeschriftung={schliessen}
      titelImInhalt
      ohneKopfzeile={spaeter}
    >
      {/* Jede Seite beginnt neu (`key`): Eingaben einer anderen Seite stehen
          nicht im Weg, und der Fokus geht auf ihr `data-autofocus`. */}
      {plattform ? (
        <div
          ref={ganzeFlaeche}
          className="flex min-h-0 flex-1 flex-col max-[23rem]:overflow-y-auto"
        >
          {kopf}
          {seiteMitFuss}
        </div>
      ) : (
        <>
          {kopf}
          {seiteMitFuss}
        </>
      )}
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
    <span aria-hidden="true" className="flex min-w-24 flex-1 gap-1">
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

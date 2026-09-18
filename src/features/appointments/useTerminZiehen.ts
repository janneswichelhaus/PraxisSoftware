import { useCallback, useEffect, useRef, useState } from 'react';
import { aufRaster, pixelZuMinute } from './calendar';

/**
 * Termine im Kalender mit dem Zeigegerät verschieben (CAL-006).
 *
 * Umgesetzt mit Pointer Events, ohne zusätzliche Abhängigkeit. Die Abwägung:
 * HTML5-Drag-and-drop ist eingebaut, funktioniert auf Touch-Geräten aber gar
 * nicht - und der Kalender soll ausdrücklich auch mobil bedienbar sein. Eine
 * Bibliothek hätte für genau eine Geste eine dauerhafte Abhängigkeit bedeutet;
 * Pointer Events decken Maus, Stift und Finger mit einem Modell ab
 * (PROJECT_PRINCIPLES.md: keine Abhängigkeit ohne fachliche Notwendigkeit).
 *
 * Bewusst NICHT enthalten: Größe ändern, Kopieren, Wechsel des Patienten,
 * Ziehen abgesagter oder abgeschlossener Termine (Auftrag Abschnitt 4).
 *
 * Das Ziehen erzeugt ausschließlich eine Vorschau. Geschrieben wird erst beim
 * Loslassen, und die Kachel bleibt bis zur Bestätigung des Servers an ihrer
 * alten Stelle - eine optimistisch verschobene Kachel würde eine Zusage
 * darstellen, die der Server noch gar nicht gegeben hat.
 *
 * **Finger und Maus sind verschieden (UX-010).** Am Zeigegerät ist eine
 * begonnene Bewegung eindeutig; am Finger ist sie es nicht - dieselbe Geste
 * heißt auf dem Telefon zuerst einmal „scrollen". Bisher fing eine Kachel die
 * Geste sofort ab (`touch-action: none`), und weil eine Kachel auf dem Telefon
 * fast die ganze Spalte einnimmt, ließ sich der Kalender über einem Termin gar
 * nicht mehr scrollen; wer es versuchte, verschob ihn.
 *
 * Deshalb: Mit dem Finger beginnt ein Verschieben erst nach einem **langen
 * Druck** (`LANGER_DRUCK_MS`), und nur, wenn der Finger dabei ruhig bleibt.
 * Wer scrollt, bewegt sich vorher - der lange Druck wird abgebrochen, und der
 * Browser scrollt ganz normal weiter. Am Zeigegerät bleibt alles wie bisher:
 * dort gibt es keinen Grund zu warten.
 *
 * **Über den Ausschnitt hinaus (FIX-018, BEF-014).** Ein Termin wandert um
 * Tage und Wochen, nicht nur innerhalb des sichtbaren Gitters. Deshalb bricht
 * ein Bildlauf ein **aktives** Ziehen nicht mehr ab (vorher ja - das galt dem
 * Finger, der scrollen wollte; der ist vor dem langen Druck weiterhin frei):
 * am oberen und unteren Rand des Fensters scrollt die Seite von selbst, ein
 * Mausrad wirkt ebenso, und die Vorschau rechnet den Bildlauf mit. Wer den
 * Zeiger über den seitlichen Rand des Gitters hält, blättert nach
 * `BLAETTER_MS` in den nächsten Ausschnitt - und behält die Geste.
 */

/** Bewegung in Pixeln, ab der aus einem Tippen ein Ziehen wird. */
const SCHWELLE = 6;

/**
 * Wie lange ein Finger ruhig liegen muss, bis das Verschieben beginnt.
 *
 * 450 ms ist die übliche Größenordnung für einen langen Druck: lang genug,
 * dass ein Scrollversuch vorher als Bewegung erkennbar ist, kurz genug, dass
 * es sich nicht nach Warten anfühlt.
 */
const LANGER_DRUCK_MS = 450;

/**
 * Wie weit der Finger während des langen Drucks wandern darf.
 *
 * Enger als SCHWELLE: Wer scrollen will, bewegt sich sofort; wer verschieben
 * will, hält still. Ein Finger zittert dabei um wenige Pixel.
 */
const RUHE_TOLERANZ = 8;

/** Abstand zum Fensterrand in Pixeln, ab dem die Seite von selbst scrollt. */
const RAND_SCROLL_PX = 72;
/** Bildlauf je Schritt (alle 16 ms) in Pixeln - langsam genug zum Zielen. */
const RAND_SCROLL_SCHRITT = 10;
/** Wie lange der Zeiger am seitlichen Rand liegen muss, bis geblättert wird. */
const BLAETTER_MS = 700;

interface ZiehZiel {
  /** Kennung der Zielspalte: behandelnde Person (Tag) oder Datum (Woche). */
  spalteId: string;
  /** Neuer Beginn als Minuten seit Mitternacht der Praxiszeitzone. */
  startMinute: number;
}

export interface ZiehZustand extends ZiehZiel {
  terminId: string;
  /** Dauer in Minuten. Bleibt beim Verschieben unverändert. */
  dauer: number;
}

interface Start {
  terminId: string;
  spalteId: string;
  startMinute: number;
  dauer: number;
  zeigerX: number;
  zeigerY: number;
  /** Bildlauf der Seite beim Start - die gezogene Strecke rechnet ihn mit. */
  bildlaufY: number;
  /** Ausschnitt beim Start (etwa das Datum der Tagesansicht); geblättert ist eine Änderung. */
  kontext: string;
  aktiv: boolean;
  /** Am Finger wartet das Verschieben auf den langen Druck. */
  wartetAufLangenDruck: boolean;
}

interface ZiehOptionen {
  /** Oberer Rand des Zeitfensters in Minuten seit Mitternacht. */
  fensterVon: number;
  fensterBis: number;
  /**
   * Höhe einer Stunde in Pixeln - die aktuelle Zoomstufe (CAL-011).
   *
   * Sie übersetzt die gezogene Strecke in Minuten. Ohne sie zöge ein Termin
   * bei jeder Zoomstufe gleich weit in Pixeln und damit unterschiedlich weit
   * in der Zeit.
   */
  stundenHoehe: number;
  /** Praxisraster in Minuten; der Beginn rastet darauf ein (CAL-005). */
  raster: number | null;
  /** Liefert die Spaltenkennung an einer Bildschirmposition, sonst null. */
  spalteAn: (clientX: number) => string | null;
  /**
   * Der gezeigte Ausschnitt als Kennung (FIX-018). Ändert er sich während
   * des Ziehens, ist das Loslassen eine Änderung - auch wenn Spalte und
   * Uhrzeit dieselben blieben (Tagesansicht: gleiche Person, anderer Tag).
   */
  kontext: string;
  /**
   * Liegt der Zeiger seitlich über dem Gitter hinaus? -1 links, 1 rechts,
   * sonst 0. Wer dort verharrt, blättert (FIX-018).
   */
  randAn?: ((clientX: number) => -1 | 0 | 1) | undefined;
  /** Blättert den Ausschnitt, ohne die Geste zu verlieren. */
  onBlaettern?: ((richtung: -1 | 1) => void) | undefined;
  /** Wird beim Loslassen aufgerufen, wenn sich tatsächlich etwas ändert. */
  onAblegen: (zustand: ZiehZustand) => void;
}

interface TerminZiehen {
  /** Aktuelle Vorschau, solange gezogen wird. */
  vorschau: ZiehZustand | null;
  /**
   * Kennung des Termins, dessen langer Druck gerade abgewartet wird - für die
   * Rückmeldung an der Kachel, damit der lange Druck nicht wie nichts aussieht.
   */
  wartetAuf: string | null;
  /** Startet das Ziehen an einer Kachel. */
  beginnen: (
    event: React.PointerEvent<HTMLElement>,
    termin: { id: string; spalteId: string; startMinute: number; dauer: number },
  ) => void;
  /**
   * True, solange der auf ein Ziehen folgende Klick unterdrückt werden muss -
   * sonst öffnete das Loslassen zusätzlich die Detailansicht.
   */
  klickUnterdruecken: () => boolean;
}

export function useTerminZiehen(optionen: ZiehOptionen): TerminZiehen {
  const [vorschau, setVorschau] = useState<ZiehZustand | null>(null);
  const [wartetAuf, setWartetAuf] = useState<string | null>(null);
  const start = useRef<Start | null>(null);
  const gezogen = useRef(false);
  const langerDruck = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Das Loslassen liest den zuletzt berechneten Stand. Ein State-Wert waere in
  // der einmal gebundenen Ereignisbehandlung veraltet.
  const vorschauRef = useRef<ZiehZustand | null>(null);
  vorschauRef.current = vorschau;
  // Die Optionen ändern sich mit jedem Rendern; die Ereignisbehandlung liest
  // sie deshalb aus einer Referenz statt sich neu zu binden.
  const opt = useRef(optionen);
  opt.current = optionen;
  // Letzte Zeigerposition: nach einem Bildlauf wird die Vorschau daraus neu
  // gerechnet, ohne dass sich der Zeiger bewegt haben muss (FIX-018).
  const zeiger = useRef<{ x: number; y: number } | null>(null);
  const randScroll = useRef<ReturnType<typeof setInterval> | null>(null);
  const blaettern = useRef<{ richtung: -1 | 1; timer: ReturnType<typeof setTimeout> } | null>(null);

  const randScrollStoppen = useCallback(() => {
    if (randScroll.current !== null) {
      clearInterval(randScroll.current);
      randScroll.current = null;
    }
  }, []);

  const blaetternStoppen = useCallback(() => {
    if (blaettern.current !== null) {
      clearTimeout(blaettern.current.timer);
      blaettern.current = null;
    }
  }, []);

  const langenDruckAbbrechen = useCallback(() => {
    if (langerDruck.current !== null) {
      clearTimeout(langerDruck.current);
      langerDruck.current = null;
    }
    setWartetAuf(null);
  }, []);

  const beenden = useCallback(() => {
    langenDruckAbbrechen();
    randScrollStoppen();
    blaetternStoppen();
    start.current = null;
    zeiger.current = null;
    setVorschau(null);
  }, [langenDruckAbbrechen, randScrollStoppen, blaetternStoppen]);

  const beginnen = useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      termin: { id: string; spalteId: string; startMinute: number; dauer: number },
    ) => {
      // Nur die primäre Taste beziehungsweise ein einzelner Finger.
      if (event.button !== 0) return;

      const amFinger = event.pointerType === 'touch';
      start.current = {
        terminId: termin.id,
        spalteId: termin.spalteId,
        startMinute: termin.startMinute,
        dauer: termin.dauer,
        zeigerX: event.clientX,
        zeigerY: event.clientY,
        bildlaufY: window.scrollY,
        kontext: opt.current.kontext,
        aktiv: false,
        wartetAufLangenDruck: amFinger,
      };
      gezogen.current = false;

      if (!amFinger) return;

      // Der lange Druck. Bleibt der Finger ruhig, wird das Verschieben
      // freigegeben; bewegt er sich vorher, bricht `bewegen` ab und der
      // Browser scrollt weiter.
      setWartetAuf(termin.id);
      langerDruck.current = setTimeout(() => {
        langerDruck.current = null;
        setWartetAuf(null);
        const s = start.current;
        if (!s) return;
        s.wartetAufLangenDruck = false;
        s.aktiv = true;
        gezogen.current = true;
        // Sofort eine Vorschau an der alten Stelle: Der lange Druck soll
        // sichtbar etwas bewirken, auch wenn der Finger noch nicht wandert.
        setVorschau({
          terminId: s.terminId,
          spalteId: s.spalteId,
          startMinute: s.startMinute,
          dauer: s.dauer,
        });
      }, LANGER_DRUCK_MS);
    },
    [],
  );

  useEffect(() => {
    /** Die Vorschau aus Zeigerposition und Bildlauf - die Strecke rechnet beide. */
    function berechnen(s: Start, clientX: number, clientY: number) {
      const { fensterVon, fensterBis, raster, spalteAn, stundenHoehe } = opt.current;
      const dy = clientY - s.zeigerY + (window.scrollY - s.bildlaufY);
      const verschoben = pixelZuMinute(dy, 0, stundenHoehe);
      const roh = aufRaster(s.startMinute + verschoben, raster);
      // Der Termin bleibt vollständig im dargestellten Fenster.
      const startMinute = Math.max(fensterVon, Math.min(fensterBis - s.dauer, roh));

      setVorschau({
        terminId: s.terminId,
        spalteId: spalteAn(clientX) ?? s.spalteId,
        startMinute,
        dauer: s.dauer,
      });
    }

    /** Am oberen oder unteren Fensterrand scrollt die Seite von selbst. */
    function randScrollPruefen(clientY: number) {
      const oben = clientY < RAND_SCROLL_PX;
      const unten = clientY > window.innerHeight - RAND_SCROLL_PX;
      if (!oben && !unten) {
        randScrollStoppen();
        return;
      }
      if (randScroll.current !== null) return;
      const schritt = oben ? -RAND_SCROLL_SCHRITT : RAND_SCROLL_SCHRITT;
      randScroll.current = setInterval(() => {
        const s = start.current;
        const z = zeiger.current;
        if (!s || !z) {
          randScrollStoppen();
          return;
        }
        window.scrollBy(0, schritt);
        berechnen(s, z.x, z.y);
      }, 16);
    }

    /** Wer seitlich über dem Gitter verharrt, blättert - und behält die Geste. */
    function blaetternPruefen(clientX: number) {
      const { randAn, onBlaettern } = opt.current;
      const richtung = randAn && onBlaettern ? randAn(clientX) : 0;
      if (richtung === 0) {
        blaetternStoppen();
        return;
      }
      if (blaettern.current?.richtung === richtung) return;
      blaetternStoppen();
      const timer = setTimeout(() => {
        blaettern.current = null;
        if (!start.current) return;
        opt.current.onBlaettern?.(richtung);
        // Weiter am Rand: nach derselben Zeit noch ein Blatt.
        blaetternPruefen(clientX);
      }, BLAETTER_MS);
      blaettern.current = { richtung, timer };
    }

    function bewegen(event: PointerEvent) {
      const s = start.current;
      if (!s) return;

      const dx = event.clientX - s.zeigerX;
      const dy = event.clientY - s.zeigerY;

      // Am Finger: Wer sich vor dem langen Druck bewegt, will scrollen.
      if (s.wartetAufLangenDruck) {
        if (Math.abs(dx) > RUHE_TOLERANZ || Math.abs(dy) > RUHE_TOLERANZ) {
          langenDruckAbbrechen();
          start.current = null;
        }
        return;
      }

      if (!s.aktiv) {
        if (Math.abs(dx) < SCHWELLE && Math.abs(dy) < SCHWELLE) return;
        s.aktiv = true;
        gezogen.current = true;
      }

      // Das Bildlaufverhalten des Browsers würde sonst mitziehen.
      event.preventDefault();

      zeiger.current = { x: event.clientX, y: event.clientY };
      berechnen(s, event.clientX, event.clientY);
      randScrollPruefen(event.clientY);
      blaetternPruefen(event.clientX);
    }

    /**
     * Ein Bildlauf: vor dem aktiven Ziehen ist es der Browser, der scrollt -
     * dann ist es kein Verschieben (UX-010). Während des Ziehens rechnet die
     * Vorschau ihn mit (FIX-018).
     */
    function bildlauf() {
      const s = start.current;
      if (!s) return;
      if (!s.aktiv) {
        beenden();
        return;
      }
      const z = zeiger.current;
      if (z) berechnen(s, z.x, z.y);
    }

    function loslassen() {
      const s = start.current;
      const ziel = vorschauRef.current;
      langenDruckAbbrechen();
      randScrollStoppen();
      blaetternStoppen();
      start.current = null;
      zeiger.current = null;
      setVorschau(null);
      if (!s || !s.aktiv || !ziel) return;

      // Ohne tatsächliche Änderung passiert nichts - kein Schreibvorgang, kein
      // Auditeintrag für ein Verschieben an dieselbe Stelle. Geblättert ist
      // eine Änderung, auch bei gleicher Spalte und Uhrzeit (FIX-018).
      if (
        ziel.spalteId === s.spalteId &&
        ziel.startMinute === s.startMinute &&
        opt.current.kontext === s.kontext
      ) {
        return;
      }
      opt.current.onAblegen(ziel);
    }

    function abbrechen(event: KeyboardEvent) {
      if (event.key === 'Escape') beenden();
    }

    window.addEventListener('pointermove', bewegen, { passive: false });
    window.addEventListener('pointerup', loslassen);
    window.addEventListener('pointercancel', beenden);
    window.addEventListener('scroll', bildlauf, true);
    window.addEventListener('keydown', abbrechen);
    // Fenster verloren (Alt-Tab, Zeiger draussen losgelassen): kein Ziehen
    // mehr - sonst liefe der Randbildlauf weiter.
    window.addEventListener('blur', beenden);
    return () => {
      window.removeEventListener('pointermove', bewegen);
      window.removeEventListener('pointerup', loslassen);
      window.removeEventListener('pointercancel', beenden);
      window.removeEventListener('scroll', bildlauf, true);
      window.removeEventListener('keydown', abbrechen);
      window.removeEventListener('blur', beenden);
      // Beim Abbau laufen weder Intervall noch Blaettern weiter.
      beenden();
    };
  }, [beenden, langenDruckAbbrechen, randScrollStoppen, blaetternStoppen]);

  const klickUnterdruecken = useCallback(() => {
    if (!gezogen.current) return false;
    gezogen.current = false;
    return true;
  }, []);

  return { vorschau, wartetAuf, beginnen, klickUnterdruecken };
}

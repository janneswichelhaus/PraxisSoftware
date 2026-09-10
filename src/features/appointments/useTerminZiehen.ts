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

export interface ZiehZiel {
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
  aktiv: boolean;
  /** Am Finger wartet das Verschieben auf den langen Druck. */
  wartetAufLangenDruck: boolean;
}

export interface ZiehOptionen {
  /** Oberer Rand des Zeitfensters in Minuten seit Mitternacht. */
  fensterVon: number;
  fensterBis: number;
  /** Praxisraster in Minuten; der Beginn rastet darauf ein (CAL-005). */
  raster: number | null;
  /** Liefert die Spaltenkennung an einer Bildschirmposition, sonst null. */
  spalteAn: (clientX: number) => string | null;
  /** Wird beim Loslassen aufgerufen, wenn sich tatsächlich etwas ändert. */
  onAblegen: (zustand: ZiehZustand) => void;
}

export interface TerminZiehen {
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

  const langenDruckAbbrechen = useCallback(() => {
    if (langerDruck.current !== null) {
      clearTimeout(langerDruck.current);
      langerDruck.current = null;
    }
    setWartetAuf(null);
  }, []);

  const beenden = useCallback(() => {
    langenDruckAbbrechen();
    start.current = null;
    setVorschau(null);
  }, [langenDruckAbbrechen]);

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

      const { fensterVon, fensterBis, raster, spalteAn } = opt.current;
      const verschoben = pixelZuMinute(dy, 0);
      const roh = aufRaster(s.startMinute + verschoben, raster);
      // Der Termin bleibt vollständig im dargestellten Fenster.
      const startMinute = Math.max(fensterVon, Math.min(fensterBis - s.dauer, roh));

      setVorschau({
        terminId: s.terminId,
        spalteId: spalteAn(event.clientX) ?? s.spalteId,
        startMinute,
        dauer: s.dauer,
      });
    }

    function loslassen() {
      const s = start.current;
      const ziel = vorschauRef.current;
      langenDruckAbbrechen();
      start.current = null;
      setVorschau(null);
      if (!s || !s.aktiv || !ziel) return;

      // Ohne tatsächliche Änderung passiert nichts - kein Schreibvorgang, kein
      // Auditeintrag für ein Verschieben an dieselbe Stelle.
      if (ziel.spalteId === s.spalteId && ziel.startMinute === s.startMinute) return;
      opt.current.onAblegen(ziel);
    }

    function abbrechen(event: KeyboardEvent) {
      if (event.key === 'Escape') beenden();
    }

    window.addEventListener('pointermove', bewegen, { passive: false });
    window.addEventListener('pointerup', loslassen);
    window.addEventListener('pointercancel', beenden);
    // Der Browser hat den Bildlauf uebernommen: dann ist es kein Verschieben.
    window.addEventListener('scroll', beenden, true);
    window.addEventListener('keydown', abbrechen);
    return () => {
      window.removeEventListener('pointermove', bewegen);
      window.removeEventListener('pointerup', loslassen);
      window.removeEventListener('pointercancel', beenden);
      window.removeEventListener('scroll', beenden, true);
      window.removeEventListener('keydown', abbrechen);
    };
  }, [beenden, langenDruckAbbrechen]);

  const klickUnterdruecken = useCallback(() => {
    if (!gezogen.current) return false;
    gezogen.current = false;
    return true;
  }, []);

  return { vorschau, wartetAuf, beginnen, klickUnterdruecken };
}

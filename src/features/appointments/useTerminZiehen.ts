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
 */

/** Bewegung in Pixeln, ab der aus einem Tippen ein Ziehen wird. */
const SCHWELLE = 6;

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
  const start = useRef<Start | null>(null);
  const gezogen = useRef(false);
  // Das Loslassen liest den zuletzt berechneten Stand. Ein State-Wert waere in
  // der einmal gebundenen Ereignisbehandlung veraltet.
  const vorschauRef = useRef<ZiehZustand | null>(null);
  vorschauRef.current = vorschau;
  // Die Optionen ändern sich mit jedem Rendern; die Ereignisbehandlung liest
  // sie deshalb aus einer Referenz statt sich neu zu binden.
  const opt = useRef(optionen);
  opt.current = optionen;

  const beenden = useCallback(() => {
    start.current = null;
    setVorschau(null);
  }, []);

  const beginnen = useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      termin: { id: string; spalteId: string; startMinute: number; dauer: number },
    ) => {
      // Nur die primäre Taste beziehungsweise ein einzelner Finger.
      if (event.button !== 0) return;
      start.current = {
        terminId: termin.id,
        spalteId: termin.spalteId,
        startMinute: termin.startMinute,
        dauer: termin.dauer,
        zeigerX: event.clientX,
        zeigerY: event.clientY,
        aktiv: false,
      };
      gezogen.current = false;
    },
    [],
  );

  useEffect(() => {
    function bewegen(event: PointerEvent) {
      const s = start.current;
      if (!s) return;

      const dx = event.clientX - s.zeigerX;
      const dy = event.clientY - s.zeigerY;
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
    window.addEventListener('keydown', abbrechen);
    return () => {
      window.removeEventListener('pointermove', bewegen);
      window.removeEventListener('pointerup', loslassen);
      window.removeEventListener('pointercancel', beenden);
      window.removeEventListener('keydown', abbrechen);
    };
  }, [beenden]);

  const klickUnterdruecken = useCallback(() => {
    if (!gezogen.current) return false;
    gezogen.current = false;
    return true;
  }, []);

  return { vorschau, beginnen, klickUnterdruecken };
}

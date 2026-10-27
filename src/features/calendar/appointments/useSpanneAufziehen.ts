import { useCallback, useEffect, useRef, useState } from 'react';
import { aufRaster, pixelZuMinute } from './calendar';

/**
 * Eine Zeitspanne auf der freien Fläche aufziehen (CAL-019).
 *
 * Bis CAL-019 führte ein Tap auf freie Zeit unmittelbar in die Terminanlage
 * (UX-005). Das ging, solange jeder Termin 60 Minuten lang war; seit CAL-020
 * ist die Länge frei, und dann ist „von wann bis wann" die eigentliche Frage.
 * Wer eine Spanne aufzieht, hat sie beantwortet, bevor das Formular aufgeht.
 *
 * **Dieselbe Mechanik wie beim Verschieben, nicht eine zweite.** Pointer
 * Events ohne zusätzliche Abhängigkeit, am Finger erst nach einem langen
 * Druck (`useTerminZiehen`, UX-010): Eine Fingerbewegung auf der freien Fläche
 * heißt auf dem Telefon zuerst einmal „scrollen", und das muss sie bleiben.
 * Am Zeigegerät genügt eine Bewegung über die Schwelle.
 *
 * **Ein Tap ohne Ziehen ist keine Spanne**, sondern ein Rasterpunkt: Dann
 * kommen beide Enden gleich zurück, und was daraus wird, entscheidet die
 * aufrufende Seite anhand der gewählten Art (CAL-019).
 *
 * Bewusst NICHT enthalten: das Ändern einer bestehenden Kachel an ihrem Rand
 * („resize"), eine Auswahl über mehrere Spalten und eine Auswahl, die über den
 * sichtbaren Ausschnitt hinausläuft. Das Erste ist eine eigene Geste mit
 * eigener Bedeutung (der Termin ist schon geschrieben), die beiden anderen
 * braucht CAL-019 nicht.
 */

/** Bewegung in Pixeln, ab der aus einem Tippen ein Aufziehen wird. */
const SCHWELLE = 6;

/** Wie lange ein Finger ruhig liegen muss, bis das Aufziehen beginnt. */
const LANGER_DRUCK_MS = 450;

/** Wie weit der Finger während des langen Drucks wandern darf. */
const RUHE_TOLERANZ = 8;

export interface Spanne {
  /** Kennung der Spalte: behandelnde Person (Tag) oder Datum (Woche). */
  spalteId: string;
  /** Beginn als Minuten seit Mitternacht der Praxiszeitzone, auf dem Raster. */
  vonMinute: number;
  /** Ende als Minuten seit Mitternacht; gleich `vonMinute` heißt „nur ein Punkt". */
  bisMinute: number;
}

interface Start {
  spalteId: string;
  /** Rasterpunkt, an dem der Zeiger aufgesetzt hat. */
  ankerMinute: number;
  zeigerX: number;
  zeigerY: number;
  aktiv: boolean;
  /** Am Finger wartet das Aufziehen auf den langen Druck. */
  wartetAufLangenDruck: boolean;
}

interface SpanneOptionen {
  /** Oberer Rand des Zeitfensters in Minuten seit Mitternacht. */
  fensterVon: number;
  fensterBis: number;
  /** Höhe einer Stunde in Pixeln - die aktuelle Zoomstufe (CAL-011). */
  stundenHoehe: number;
  /** Praxisraster in Minuten; beide Enden rasten darauf ein (CAL-005). */
  raster: number | null;
  /** Liefert die Spaltenkennung an einer Bildschirmposition, sonst null. */
  spalteAn: (clientX: number) => string | null;
  /** Obere Kante des Gitterkörpers in Bildschirmkoordinaten. */
  obenAn: () => number | null;
  /** Wird beim Loslassen aufgerufen - mit Spanne oder mit einem Punkt. */
  onAuswahl: (spanne: Spanne) => void;
}

interface SpanneAufziehen {
  /** Aktuelle Auswahl, solange aufgezogen wird. */
  vorschau: Spanne | null;
  /** Kennung der Spalte, deren langer Druck gerade abgewartet wird. */
  wartetAuf: string | null;
  /** Startet das Aufziehen auf der freien Fläche einer Spalte. */
  beginnen: (event: React.PointerEvent<HTMLElement>, spalteId: string) => void;
  /**
   * True, solange der auf ein Aufziehen folgende Klick unterdrückt werden muss -
   * sonst öffnete das Loslassen zusätzlich den Weg des einfachen Taps.
   */
  klickUnterdruecken: () => boolean;
  /** Beendet eine begonnene Geste ohne Ergebnis - etwa beim zweiten Finger (BEF-038). */
  abbrechen: () => void;
}

export function useSpanneAufziehen(optionen: SpanneOptionen): SpanneAufziehen {
  const [vorschau, setVorschau] = useState<Spanne | null>(null);
  const [wartetAuf, setWartetAuf] = useState<string | null>(null);
  const start = useRef<Start | null>(null);
  const gezogen = useRef(false);
  const langerDruck = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vorschauRef = useRef<Spanne | null>(null);
  vorschauRef.current = vorschau;
  // Die Optionen ändern sich mit jedem Rendern; die Ereignisbehandlung liest
  // sie deshalb aus einer Referenz statt sich neu zu binden.
  const opt = useRef(optionen);
  opt.current = optionen;

  /** Rasterpunkt an einer Bildschirmposition, im Fenster gehalten. */
  const minuteAn = useCallback((clientY: number): number | null => {
    const oben = opt.current.obenAn();
    if (oben === null) return null;
    const { fensterVon, fensterBis, raster, stundenHoehe } = opt.current;
    const roh = pixelZuMinute(clientY - oben, fensterVon, stundenHoehe);
    return Math.max(fensterVon, Math.min(fensterBis, aufRaster(roh, raster)));
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
    start.current = null;
    setVorschau(null);
  }, [langenDruckAbbrechen]);

  const beginnen = useCallback(
    (event: React.PointerEvent<HTMLElement>, spalteId: string) => {
      // Nur die primäre Taste beziehungsweise ein einzelner Finger.
      if (event.button !== 0) return;
      const anker = minuteAn(event.clientY);
      if (anker === null) return;

      const amFinger = event.pointerType === 'touch';
      start.current = {
        spalteId,
        ankerMinute: anker,
        zeigerX: event.clientX,
        zeigerY: event.clientY,
        aktiv: false,
        wartetAufLangenDruck: amFinger,
      };
      gezogen.current = false;

      if (!amFinger) return;

      setWartetAuf(spalteId);
      langerDruck.current = setTimeout(() => {
        langerDruck.current = null;
        setWartetAuf(null);
        const s = start.current;
        if (!s) return;
        s.wartetAufLangenDruck = false;
        s.aktiv = true;
        gezogen.current = true;
        // Sofort eine Vorschau am Aufsetzpunkt: Der lange Druck soll sichtbar
        // etwas bewirken, auch wenn der Finger noch nicht wandert.
        setVorschau({
          spalteId: s.spalteId,
          vonMinute: s.ankerMinute,
          bisMinute: s.ankerMinute,
        });
      }, LANGER_DRUCK_MS);
    },
    [minuteAn],
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

      const jetzt = minuteAn(event.clientY);
      if (jetzt === null) return;

      // Die Spalte bleibt die des Aufsetzpunkts: Eine Spanne über mehrere
      // Personen (oder Tage) hinweg gibt es nicht - sie wäre kein Termin.
      setVorschau({
        spalteId: s.spalteId,
        vonMinute: Math.min(s.ankerMinute, jetzt),
        bisMinute: Math.max(s.ankerMinute, jetzt),
      });
    }

    function loslassen() {
      const s = start.current;
      const ziel = vorschauRef.current;
      langenDruckAbbrechen();
      start.current = null;
      setVorschau(null);
      if (!s || !s.aktiv || !ziel) return;
      opt.current.onAuswahl(ziel);
    }

    function abbrechen(event: KeyboardEvent) {
      if (event.key === 'Escape') beenden();
    }

    window.addEventListener('pointermove', bewegen, { passive: false });
    window.addEventListener('pointerup', loslassen);
    window.addEventListener('pointercancel', beenden);
    window.addEventListener('keydown', abbrechen);
    window.addEventListener('blur', beenden);
    return () => {
      window.removeEventListener('pointermove', bewegen);
      window.removeEventListener('pointerup', loslassen);
      window.removeEventListener('pointercancel', beenden);
      window.removeEventListener('keydown', abbrechen);
      window.removeEventListener('blur', beenden);
      beenden();
    };
  }, [beenden, langenDruckAbbrechen, minuteAn]);

  const klickUnterdruecken = useCallback(() => {
    if (!gezogen.current) return false;
    gezogen.current = false;
    return true;
  }, []);

  return { vorschau, wartetAuf, beginnen, klickUnterdruecken, abbrechen: beenden };
}

/**
 * Was ein Tipp auf die freie Fläche aus der bestehenden Auswahl macht
 * (BEF-035, BEF-036, **ANN-108**).
 *
 * Aufziehen durch Ziehen braucht am Finger einen langen Druck; zwei Tipps
 * sind der schnellere Weg zur selben Spanne:
 *
 *   * zweiter Tipp auf **dasselbe** Feld  -> Auswahl aufgehoben (wie „Abbrechen")
 *   * auf ein anderes Feld derselben Spalte -> Spanne zwischen beiden Tipps
 *   * in einer anderen Spalte, oder nach einer fertigen Spanne -> neuer Punkt
 *
 * Die Richtung ist gleich: Ein zweiter Tipp oberhalb des ersten ergibt
 * dieselbe Spanne wie einer darunter. Eine aufgezogene Spanne (beide Enden
 * verschieden) ersetzt die Auswahl immer - sie ist schon eine Antwort.
 */
export function naechsteAuswahl(bisher: Spanne | null, neu: Spanne): Spanne | null {
  const istPunkt = neu.vonMinute === neu.bisMinute;
  if (!istPunkt || !bisher) return neu;
  const bisherPunkt = bisher.vonMinute === bisher.bisMinute;
  if (!bisherPunkt || bisher.spalteId !== neu.spalteId) return neu;
  if (bisher.vonMinute === neu.vonMinute) return null;
  return {
    spalteId: neu.spalteId,
    vonMinute: Math.min(bisher.vonMinute, neu.vonMinute),
    bisMinute: Math.max(bisher.vonMinute, neu.vonMinute),
  };
}

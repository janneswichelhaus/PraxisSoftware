import { useEffect, useState } from 'react';
import { bewegungErlaubt } from '@/components/ui/bewegung';

/**
 * Markenmoment B der Plattform (Handoff 2026-10-22, Entscheidung 1 und
 * Abschnitt 7; ANN-680): Auf Plattformwegen läuft kein Startbild. Die Seite
 * steht sofort; beim ersten Erscheinen der Übersicht je Tab kommen Gruß und
 * Abschnitte gestaffelt, die Hero-Karte läuft ein und ihr Laufrad dreht eine
 * Achtel (`markenmoment` in `src/index.css`). Nach 0,7 s steht alles.
 *
 * Ein Merker in `sessionStorage` wie beim Startbild (`startbildMerker.ts`):
 * Ein neuer Tab ist ein neuer Anfang, das Zurückkehren zur Übersicht nicht.
 * Ein Wahrheitswert, kein Inhalt. Ohne Speicher gilt „noch nicht gezeigt“ -
 * ein Moment zu viel ist kein Schaden.
 */
export const MARKENMOMENT_MERKER = 'markenmoment-gezeigt';

/** So lange trägt die Übersicht den Moment; danach entfallen die Klassen. */
export const MARKENMOMENT_DAUER_MS = 1000;

function speicher(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Steht der Moment in diesem Tab noch aus? */
export function markenmomentFaellig(): boolean {
  try {
    return speicher()?.getItem(MARKENMOMENT_MERKER) !== '1';
  } catch {
    return true;
  }
}

function markenmomentVormerken(): void {
  try {
    speicher()?.setItem(MARKENMOMENT_MERKER, '1');
  } catch {
    // Ohne Speicher kein Merker; siehe oben.
  }
}

/**
 * Läuft der Moment gerade? Beim ersten Erscheinen der Übersicht in diesem Tab
 * ja; danach, beim Zurückkehren und bei „Bewegung reduzieren“ nie - dann
 * steht alles sofort. Gemerkt wird schon beim Erscheinen, damit ein Wechsel
 * mitten im Moment ihn nicht wiederholt. Er endet eine Sekunde, nachdem die
 * Übersicht `bereit` ist: Abschnitte, die erst mit den Daten kommen, laufen
 * so noch ein, statt mitten in der Bewegung abgeschnitten zu werden.
 */
export function useMarkenmoment(bereit = true): boolean {
  const [moment, setMoment] = useState(() => markenmomentFaellig() && bewegungErlaubt());
  useEffect(() => {
    markenmomentVormerken();
  }, []);
  useEffect(() => {
    if (!moment || !bereit) return;
    const ende = window.setTimeout(() => setMoment(false), MARKENMOMENT_DAUER_MS);
    return () => window.clearTimeout(ende);
  }, [moment, bereit]);
  return moment;
}

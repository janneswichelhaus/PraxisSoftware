/**
 * Die Rechnung hinter dem Wegbalken (`TravelBar.tsx`), als reine Funktionen.
 *
 * Eigene Datei aus demselben Grund wie `buttonStile.ts`: Eine Modul-Datei mit
 * Komponente *und* Funktion hebelt das schnelle Neuladen aus
 * (`react-refresh`). Und die Stufen lassen sich so ohne Zeichnen prüfen.
 */

/**
 * Stufe eines Wegs nach seinem Puffer (Design-Handoff 2026-10-01, Abschnitt 3;
 * Entscheidung von Jannes vom selben Tag):
 *
 *   * `late` - kein Puffer oder weniger (≤ 0 min): rot;
 *   * `tight` - höchstens drei Minuten: dunkles Orange;
 *   * `narrow` - unter fünf Minuten: helleres Orange;
 *   * `clear` - ab fünf Minuten: grün.
 *
 * Die Grenzen stehen nur hier. Sie sind eine Darstellungsregel, keine
 * Sperre: Ob ein knapper Weg überhaupt geplant werden darf, entscheidet der
 * Kalender (ANN-097), nicht dieser Balken.
 */
export type TravelLevel = 'late' | 'tight' | 'narrow' | 'clear';

export function travelLevel(pufferMin: number): TravelLevel {
  if (pufferMin <= 0) return 'late';
  if (pufferMin <= 3) return 'tight';
  if (pufferMin < 5) return 'narrow';
  return 'clear';
}

/** „hh:mm" als Minuten seit Mitternacht; alles andere ist keine Uhrzeit. */
function minuten(zeit: string): number {
  const treffer = /^(\d{1,2}):(\d{2})$/.exec(zeit.trim());
  if (!treffer) return Number.NaN;
  return Number(treffer[1]) * 60 + Number(treffer[2]);
}

function uhrzeit(minutenSeitMitternacht: number): string {
  const stunde = Math.floor(minutenSeitMitternacht / 60);
  const minute = minutenSeitMitternacht % 60;
  return `${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export interface TravelPlan {
  /** Zeit zwischen dem Ende des vorigen und dem Beginn des nächsten Termins. */
  geplantMin: number;
  /** Was davon nach der Fahrt übrig bleibt; negativ, wenn es nicht reicht. */
  pufferMin: number;
  /** Späteste Abfahrt als „hh:mm": Beginn des nächsten Termins minus Fahrt. */
  abfahrt: string;
  /** Anteil der Fahrt an der geplanten Zeit in Prozent, höchstens 100. */
  anteil: number;
  stufe: TravelLevel;
}

/**
 * Rechnet einen Weg aus zwei Uhrzeiten und der geschätzten Fahrzeit.
 *
 * `von` ist das Ende des vorigen Termins (oder der Startort), `bis` der Beginn
 * des nächsten - beide als „hh:mm" in der Zeit der Praxis, so wie die Seite
 * sie auch anzeigt. Liegt `bis` nicht nach `von` oder ist eine der beiden
 * keine Uhrzeit, ist nichts eingeplant: Der Weg gilt dann als zu spät, statt
 * eine Zahl zu behaupten.
 */
export function travelPlan(von: string, bis: string, fahrtMin: number): TravelPlan {
  const start = minuten(von);
  const ziel = minuten(bis);
  const fahrt = Math.max(0, Math.round(fahrtMin));
  const geplantMin = Number.isNaN(start) || Number.isNaN(ziel) ? 0 : Math.max(0, ziel - start);
  const pufferMin = geplantMin - fahrt;
  return {
    geplantMin,
    pufferMin,
    abfahrt: Number.isNaN(ziel) ? bis : uhrzeit(Math.max(0, ziel - fahrt)),
    anteil: geplantMin > 0 ? Math.min(100, Math.round((fahrt / geplantMin) * 100)) : 100,
    stufe: travelLevel(pufferMin),
  };
}

/** „28 min Puffer" oder, wenn es nicht reicht, „4 min zu knapp". */
export function pufferText(pufferMin: number): string {
  return pufferMin < 0 ? `${Math.abs(pufferMin)} min zu knapp` : `${pufferMin} min Puffer`;
}

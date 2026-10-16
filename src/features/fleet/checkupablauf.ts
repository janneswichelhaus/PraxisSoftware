import {
  CHECK_ITEMS,
  ratingWithSpots,
  zoneCheckItem,
  type CheckItemKey,
  type CheckRating,
  type Severity,
} from './bike3d/zones';

/**
 * Der geführte Check-Up (FLT-005, ANN-562) ohne Oberfläche: welche Seite nach
 * welcher kommt, was „← Zurück“ heißt und was am Ende gespeichert wird.
 *
 * Eine Seite je Prüfpunkt in der Reihenfolge der Bauart. „In Ordnung“ führt
 * gleich zum nächsten; „Beobachten“ und „Problem“ fragen erst „Wo genau?“ und
 * dann „Was ist aufgefallen?“. Nach dem zwölften Punkt kommt der Abschluss.
 * Wer aus dem Abschluss einen Punkt ändert, landet danach wieder dort.
 */

export type Teil = 'bewerten' | 'wo' | 'was';

export type Seite =
  | { art: 'punkt'; index: number; teil: Teil }
  | { art: 'abschluss' }
  /** Eine Stelle ohne eigenen Prüfpunkt, aus dem Abschluss heraus. */
  | { art: 'weitere' };

export interface Antwort {
  rating: CheckRating;
  note: string;
}

export type Antworten = Partial<Record<CheckItemKey, Antwort>>;

export const PRUEFPUNKTE = CHECK_ITEMS.length;

export const START: Seite = { art: 'punkt', index: 0, teil: 'bewerten' };

export const ABSCHLUSS: Seite = { art: 'abschluss' };

export function punktSeite(index: number, teil: Teil = 'bewerten'): Seite {
  return { art: 'punkt', index, teil };
}

/** Wohin es nach der Antwort auf einen Punkt geht. */
export function nachDerAntwort(index: number, zurUebersicht: boolean): Seite {
  if (zurUebersicht || index >= PRUEFPUNKTE - 1) return ABSCHLUSS;
  return punktSeite(index + 1);
}

/** „← Zurück“; `null` auf der ersten Seite. */
export function vorigeSeite(seite: Seite, zurUebersicht: boolean): Seite | null {
  if (seite.art === 'weitere') return ABSCHLUSS;
  if (seite.art === 'abschluss') return punktSeite(PRUEFPUNKTE - 1);
  if (seite.teil === 'was') return punktSeite(seite.index, 'wo');
  if (seite.teil === 'wo') return punktSeite(seite.index);
  if (zurUebersicht) return ABSCHLUSS;
  return seite.index > 0 ? punktSeite(seite.index - 1) : null;
}

/** „Prüfpunkt 3 von 12“ und der Stand für den Balken. */
export function fortschritt(seite: Seite): { text: string; wert: number } {
  if (seite.art === 'punkt') {
    return { text: `Prüfpunkt ${seite.index + 1} von ${PRUEFPUNKTE}`, wert: seite.index + 1 };
  }
  return { text: 'Abschluss', wert: PRUEFPUNKTE };
}

/**
 * Die Bewertungen zum Speichern: jede Antwort, angehoben durch die Stellen
 * des Punkts (ANN-555). Ein Punkt ohne Antwort kommt hier nicht vor - der
 * Abschluss ist erst nach allen zwölf erreichbar; zur Sicherheit zählt er
 * als „In Ordnung“, wie früher vorbelegt.
 */
export function bewertungen(
  antworten: Antworten,
  stellen: readonly { zone: string; severity: Severity }[],
): Record<CheckItemKey, CheckRating> {
  return Object.fromEntries(
    CHECK_ITEMS.map((item) => [
      item.key,
      ratingWithSpots(item.key, antworten[item.key]?.rating ?? 'ok', stellen),
    ]),
  ) as Record<CheckItemKey, CheckRating>;
}

/** Ob alle zwölf Punkte eine Antwort haben. */
export function allesBeantwortet(antworten: Antworten): boolean {
  return CHECK_ITEMS.every((item) => antworten[item.key] !== undefined);
}

/** „1 Problem · 0 zu beobachten · 1 Stelle am Rad markiert“, Stellen ohne Prüfpunkt eingerechnet. */
export function zusammenfassung(
  bewertet: Record<CheckItemKey, CheckRating>,
  stellen: readonly { zone: string; severity: Severity }[],
): string {
  const weitere = stellen.filter((stelle) => zoneCheckItem(stelle.zone) === null);
  const zaehle = (wert: Severity) =>
    CHECK_ITEMS.filter((item) => bewertet[item.key] === wert).length +
    weitere.filter((stelle) => stelle.severity === wert).length;
  const probleme = zaehle('problem');
  return `${probleme === 1 ? '1 Problem' : `${probleme} Probleme`} · ${zaehle('beobachten')} zu beobachten · ${
    stellen.length === 1 ? '1 Stelle' : `${stellen.length} Stellen`
  } am Rad markiert`;
}

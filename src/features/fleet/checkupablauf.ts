import {
  CHECK_ITEMS,
  ratingWithSpots,
  zoneCheckItem,
  zonesOfCheckItem,
  type CheckItemKey,
  type CheckRating,
  type Severity,
  type ZoneKey,
} from './zones';

/**
 * Der geführte Check-Up (FLT-005, ANN-563) ohne Oberfläche: welche Seite nach
 * welcher kommt, was „← Zurück“ heißt und was am Ende gespeichert wird.
 *
 * Eine Seite je Prüfpunkt in der Reihenfolge der Bauart. „In Ordnung“ führt
 * gleich zum nächsten; „Beobachten“ und „Problem“ fragen erst „Wo genau?“ und
 * dann „Was ist aufgefallen?“ - bei einem Punkt mit nur einem Bauteil gleich
 * das Zweite. Nach dem zwölften Punkt werden die Werbeflächen abgewischt und
 * das Rad von allen vier Seiten fotografiert (FLT-007, ANN-568), dann kommt
 * der Abschluss. Wer aus dem Abschluss einen Schritt ändert, landet danach
 * wieder dort.
 */

export type Teil = 'bewerten' | 'wo' | 'was';

export type Seite =
  | { art: 'punkt'; index: number; teil: 'bewerten' | 'wo' }
  /** `vonWo`: über „Wo genau?“ gekommen, sonst gleich von der Frage. */
  | { art: 'punkt'; index: number; teil: 'was'; vonWo: boolean }
  /** Jede Werbefläche mit einem Desinfektions- oder Reinigungstuch abwischen. */
  | { art: 'werbung' }
  /** Ein Foto von einer Seite des Rads; `index` in `SEITEN`. */
  | { art: 'foto'; index: number }
  | { art: 'abschluss' }
  /** Eine Stelle ohne eigenen Prüfpunkt, aus dem Abschluss heraus. */
  | { art: 'weitere' };

export interface Antwort {
  rating: CheckRating;
  note: string;
}

export type Antworten = Partial<Record<CheckItemKey, Antwort>>;

export const PRUEFPUNKTE = CHECK_ITEMS.length;

/**
 * Die vier Seiten für die Fotos, in der Reihenfolge eines Gangs ums Rad (ANN-568). Die Schlüssel
 * stehen so in der Datenbank (`app.fleet_photo_sides`, `supabase/tests/fleet-pflege.test.ts`).
 */
export const SEITEN = [
  { key: 'left', label: 'Linke Seite', titel: 'Foto von links' },
  { key: 'front', label: 'Vorne', titel: 'Foto von vorne' },
  { key: 'right', label: 'Rechte Seite', titel: 'Foto von rechts' },
  { key: 'back', label: 'Hinten', titel: 'Foto von hinten' },
] as const;

export type SeitenKey = (typeof SEITEN)[number]['key'];

export type Seitenfotos = Partial<Record<SeitenKey, Blob>>;

/** Die Werbeflächen: abgewischt - oder nicht möglich, mit Grund (ANN-568). */
export type Werbeflaechen = { wert: 'wiped' } | { wert: 'not_possible'; grund: string };

/** Alle Schritte bis zum Abschluss: zwölf Punkte, Werbeflächen, vier Fotos. */
export const SCHRITTE = PRUEFPUNKTE + 1 + SEITEN.length;

export const WERBUNG: Seite = { art: 'werbung' };

export function fotoSeite(index: number): Seite {
  return { art: 'foto', index };
}

export const START: Seite = { art: 'punkt', index: 0, teil: 'bewerten' };

export const ABSCHLUSS: Seite = { art: 'abschluss' };

export function punktSeite(index: number, teil: 'bewerten' | 'wo' = 'bewerten'): Seite {
  return { art: 'punkt', index, teil };
}

/** „Was ist aufgefallen?“ zu einem Punkt. */
export function wasSeite(index: number, vonWo: boolean): Seite {
  return { art: 'punkt', index, teil: 'was', vonWo };
}

/**
 * Das Bauteil eines Punkts, der nur eines hat - Licht vorne und hinten, Akku,
 * Sattel, Klingel, Ständer, Transportbox. Dort fragt der Ablauf nicht „Wo
 * genau?“: Die Stelle sitzt gleich am Bauteil (Praxis-Review FLT-005, ANN-563).
 */
export function einzigesBauteil(key: CheckItemKey): ZoneKey | null {
  const zonen = zonesOfCheckItem(key);
  return zonen.length === 1 ? zonen[0]! : null;
}

/** Das Beispiel im Feld „Was ist aufgefallen?“, je Punkt ein eigenes. */
export const BEISPIEL: Record<CheckItemKey, string> = {
  reifen: 'z. B. Profil abgefahren',
  speichen: 'z. B. Speiche locker',
  bremsen: 'z. B. Belag schleift',
  antrieb: 'z. B. Riemen locker',
  licht_vorne: 'z. B. Licht flackert',
  licht_hinten: 'z. B. Rücklicht aus',
  akku: 'z. B. lädt nicht voll',
  schrauben_sattel: 'z. B. Sattel wackelt',
  klingel: 'z. B. Klingel klemmt',
  schutzbleche: 'z. B. Schutzblech schleift',
  staender: 'z. B. Ständer kippt',
  transportbox: 'z. B. Deckel klemmt',
};

/** Wohin es nach der Antwort auf einen Punkt geht. */
export function nachDerAntwort(index: number, zurUebersicht: boolean): Seite {
  if (zurUebersicht) return ABSCHLUSS;
  if (index >= PRUEFPUNKTE - 1) return WERBUNG;
  return punktSeite(index + 1);
}

/** Nach den Werbeflächen: das erste Foto, aus dem Abschluss heraus zurück dorthin. */
export function nachDerWerbung(zurUebersicht: boolean): Seite {
  return zurUebersicht ? ABSCHLUSS : fotoSeite(0);
}

/** Nach einem Foto das nächste, nach dem letzten der Abschluss. */
export function nachDemFoto(index: number, zurUebersicht: boolean): Seite {
  if (zurUebersicht || index >= SEITEN.length - 1) return ABSCHLUSS;
  return fotoSeite(index + 1);
}

/**
 * „← Zurück“ - auch die Zurückgeste des Telefons -, dorthin, woher man kam: ohne „Wo genau?“
 * (ein Bauteil, schon markiert) zur Frage, nicht auf eine Seite, die nie zu sehen war. `null`
 * auf der ersten Seite.
 */
export function vorigeSeite(seite: Seite, zurUebersicht: boolean): Seite | null {
  if (seite.art === 'weitere') return ABSCHLUSS;
  if (seite.art === 'abschluss') return fotoSeite(SEITEN.length - 1);
  if (seite.art === 'werbung') return zurUebersicht ? ABSCHLUSS : punktSeite(PRUEFPUNKTE - 1);
  if (seite.art === 'foto') {
    if (zurUebersicht) return ABSCHLUSS;
    return seite.index > 0 ? fotoSeite(seite.index - 1) : WERBUNG;
  }
  if (seite.teil === 'was') return punktSeite(seite.index, seite.vonWo ? 'wo' : 'bewerten');
  if (seite.teil === 'wo') return punktSeite(seite.index);
  if (zurUebersicht) return ABSCHLUSS;
  return seite.index > 0 ? punktSeite(seite.index - 1) : null;
}

/** „Prüfpunkt 3 von 12“, „Foto 2 von 4“ und der Stand für den Balken (von `SCHRITTE`). */
export function fortschritt(seite: Seite): { text: string; wert: number } {
  if (seite.art === 'punkt') {
    return { text: `Prüfpunkt ${seite.index + 1} von ${PRUEFPUNKTE}`, wert: seite.index + 1 };
  }
  if (seite.art === 'werbung') return { text: 'Reinigung', wert: PRUEFPUNKTE + 1 };
  if (seite.art === 'foto') {
    return {
      text: `Foto ${seite.index + 1} von ${SEITEN.length}`,
      wert: PRUEFPUNKTE + 2 + seite.index,
    };
  }
  return { text: 'Abschluss', wert: SCHRITTE };
}

/** Ob alle vier Seiten ein Foto haben. */
export function alleSeiten(fotos: Seitenfotos): boolean {
  return SEITEN.every((seite) => fotos[seite.key] !== undefined);
}

/** „Abgewischt“ oder „Nicht möglich: Kein Tuch im Depot“. */
export function werbeflaechenText(werbung: Werbeflaechen): string {
  return werbung.wert === 'wiped' ? 'Abgewischt' : `Nicht möglich: ${werbung.grund.trim()}`;
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

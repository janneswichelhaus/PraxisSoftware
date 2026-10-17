/**
 * Hinweise zwischendurch (ORG-005, ANN-603): ein kleiner, allgemeiner
 * Mechanismus der Übersicht. Ein Hinweis erscheint als Fenster mit „Jetzt“
 * und „Später“ - aber nur zu einem passenden Zeitpunkt, und höchstens einmal
 * am Tag. Erster Nutzer ist das Barometer (ORG-006).
 *
 * Nichts davon geht an den Server und nichts wird gezählt (§20): Der Merker,
 * dass ein Hinweis heute schon zu sehen war, liegt nur im Browser dieses
 * Geräts. Die Regel liest nur die eigenen Termine, die die Übersicht ohnehin
 * geladen hat.
 */

/** Wie weit der nächste eigene Termin mindestens entfernt sein muss. */
export const ABSTAND_MINUTEN = 20;

/** Ein eigener Termin des Tages, so wie die Tagesliste ihn liefert. */
export interface EigenerTermin {
  starts_at: string;
  ends_at: string;
  status: string;
}

/**
 * `zwischendurch`: gerade kein Termin, der nächste in mindestens
 * {@link ABSTAND_MINUTEN} Minuten oder keiner mehr vor einem leeren Tag;
 * `tagesabschluss`: alle Termine des Tages sind vorbei.
 */
export type Zeitpunkt = 'zwischendurch' | 'tagesabschluss';

/**
 * ANN-603: Passt jetzt ein Hinweis? Geprüft wird nur beim Öffnen der
 * Übersicht (die Seite fragt einmal), nie im Lauf der Zeit.
 *
 *   * `null`, solange die eigenen Termine nicht geladen sind - lieber kein
 *     Fenster als eines mitten in einem Besuch;
 *   * `null`, während ein eigener Termin läuft;
 *   * `null`, wenn der nächste eigene Termin heute näher als
 *     {@link ABSTAND_MINUTEN} Minuten ist - dann ist man auf dem Weg. Eine
 *     Navigationsführung in der Anwendung gibt es nicht (die Navigation
 *     läuft in der Karten-App, ADR-019); diese Regel deckt den Weg ab;
 *   * `tagesabschluss`, wenn alle Termine des Tages vorbei sind;
 *   * sonst `zwischendurch`.
 *
 * Abgesagte Termine zählen nicht: Zu ihnen fährt niemand.
 */
export function passenderZeitpunkt({
  jetzt,
  termine,
}: {
  /** Millisekunden seit 1970, wie `Date.now()`. */
  jetzt: number;
  /** Die eigenen Termine des Tages; `null`, solange nicht geladen. */
  termine: readonly EigenerTermin[] | null;
}): Zeitpunkt | null {
  if (termine === null) return null;
  const gueltig = termine
    .filter((termin) => termin.status !== 'cancelled')
    .map((termin) => ({ von: Date.parse(termin.starts_at), bis: Date.parse(termin.ends_at) }))
    .filter(({ von, bis }) => Number.isFinite(von) && Number.isFinite(bis));

  if (gueltig.some(({ von, bis }) => von <= jetzt && jetzt < bis)) return null;

  const kommende = gueltig.filter(({ von }) => von > jetzt).map(({ von }) => von);
  if (kommende.length === 0) return gueltig.length > 0 ? 'tagesabschluss' : 'zwischendurch';

  const naechster = Math.min(...kommende);
  return naechster - jetzt >= ABSTAND_MINUTEN * 60_000 ? 'zwischendurch' : null;
}

/** Ein Hinweis, den ein Bereich der Übersicht anbietet. */
export interface Hinweis {
  /** Eindeutig je Hinweis und Zeitraum, etwa `barometer-2026-10`. */
  schluessel: string;
  /** Titel des Fensters. */
  titel: string;
  /** Ein Satz darunter. */
  text: string;
  /** Wohin „Jetzt“ führt. */
  ziel: string;
}

const PRAEFIX = 'praxis.hinweis.';

/** Der Tag, an dem der Hinweis zuletzt erschien - oder `null`. */
function zuletzt(schluessel: string): string | null {
  try {
    return window.localStorage.getItem(`${PRAEFIX}${schluessel}`);
  } catch {
    return null;
  }
}

/** Ob der Hinweis heute schon zu sehen war (Merker nur auf diesem Gerät). */
export function heuteSchonGezeigt(schluessel: string, heute: string): boolean {
  return zuletzt(schluessel) === heute;
}

/**
 * Merkt sich, dass der Hinweis heute erschien. Ein Eintrag je Hinweis, der Tag
 * als Wert - kein Verlauf. Geht der Speicher nicht (privater Modus), erscheint
 * der Hinweis eben beim nächsten Öffnen noch einmal.
 */
export function merkeGezeigt(schluessel: string, heute: string): void {
  try {
    window.localStorage.setItem(`${PRAEFIX}${schluessel}`, heute);
  } catch {
    // Ohne Speicher kein Merker - nichts weiter.
  }
}

/**
 * Welcher Hinweis jetzt erscheint: der erste, der heute noch nicht zu sehen
 * war - und nur zu einem passenden Zeitpunkt. Sonst keiner.
 */
export function hinweisJetzt({
  hinweise,
  heute,
  jetzt,
  termine,
  schonGezeigt = heuteSchonGezeigt,
}: {
  hinweise: readonly Hinweis[];
  heute: string;
  jetzt: number;
  termine: readonly EigenerTermin[] | null;
  schonGezeigt?: (schluessel: string, heute: string) => boolean;
}): Hinweis | null {
  const offen = hinweise.find((hinweis) => !schonGezeigt(hinweis.schluessel, heute));
  if (!offen) return null;
  return passenderZeitpunkt({ jetzt, termine }) === null ? null : offen;
}

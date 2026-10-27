/**
 * Der zuletzt benutzte Kalenderstand (BEF-073).
 *
 * Wer in der Tagesansicht in Annas Spalte arbeitet, einen Termin anlegt und
 * danach über die Tableiste in den Kalender zurückgeht, landete bisher in der
 * Voreinstellung - der Woche der eigenen Person. Der Kalender öffnet ohne
 * Parameter jetzt dort, wo man zuletzt war: Ansicht, Tag, Person, Filter.
 *
 * * **Nur im Arbeitsspeicher**, wie der Abstecher (`src/lib/abstecher.ts`):
 *   kein `localStorage`, kein `sessionStorage`. Der Stand kann eine
 *   Patient:innen-Kennung als Filter tragen; ein Neuladen verwirft ihn.
 * * **Je Benutzer**: Ein Kontowechsel im selben Tab übernimmt nichts.
 * * **Nur für denselben Tag**: Am nächsten Morgen beginnt der Kalender wieder
 *   bei heute, nicht beim Tag, an dem man gestern aufgehört hat.
 */

type Stand = { suche: string; tag: string };

const staende = new Map<string, Stand>();

/** Merkt sich den Stand, den der Kalender gerade zeigt. */
export function merkeKalenderstand(benutzer: string, suche: URLSearchParams, heute: string): void {
  staende.set(benutzer, { suche: suche.toString(), tag: heute });
}

/** Der gemerkte Stand von heute, sonst `null`. */
export function letzterKalenderstand(benutzer: string, heute: string): URLSearchParams | null {
  const stand = staende.get(benutzer);
  if (!stand || stand.tag !== heute) return null;
  return new URLSearchParams(stand.suche);
}

/** Nur für Tests. */
export function vergissKalenderstaende(): void {
  staende.clear();
}

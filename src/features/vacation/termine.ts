import { mitRueckweg } from '@/lib/rueckweg';

/**
 * Termine in einem Urlaub, der schon gilt (URL-001, Praxis-Review Überholung
 * 7): Nach dem Genehmigen oder Selbsteintragen ist jeder Tag ein eigenes
 * „Tag umplanen“ (G2). Damit nach dem ersten Tag die übrigen nicht aus dem
 * Blick geraten, führt der Rückweg jedes Tags auf diese Seite - und sie zählt
 * neu, statt sich die Liste vom Entscheiden zu merken.
 */
export const URLAUB_TERMINE = '/betrieb/urlaub/termine';

/** Die Seite für eine Person und einen Zeitraum - Kennung und Tage, keine Namen (ADR-011). */
export function terminePfad(person: string, von: string, bis: string, rueckweg: string): string {
  const suche = new URLSearchParams({ person, von, bis });
  return mitRueckweg(`${URLAUB_TERMINE}?${suche.toString()}`, rueckweg);
}

import { mitRueckweg } from '@/lib/rueckweg';

/**
 * Nach dem Genehmigen ist jeder Urlaubstag mit Terminen ein eigenes „Tag umplanen“. Der Rückweg
 * jedes Tags führt hierher, damit die übrigen nicht aus dem Blick geraten; die Seite zählt neu,
 * statt sich die Liste vom Entscheiden zu merken.
 */
export const URLAUB_TERMINE = '/betrieb/urlaub/termine';

/** Die Seite für eine Person und einen Zeitraum - Kennung und Tage, keine Namen (ADR-011). */
export function terminePfad(person: string, von: string, bis: string, rueckweg: string): string {
  const suche = new URLSearchParams({ person, von, bis });
  return mitRueckweg(`${URLAUB_TERMINE}?${suche.toString()}`, rueckweg);
}

import type { ScoreItem } from './schema';

/**
 * Kleine Hilfen der Oberfläche für Erhebungen (FRB-002b), getrennt von den
 * Komponenten, damit das schnelle Neuladen im Entwicklungsserver greift.
 */

/** Die gedruckte Nummer und, wo die Praxis einträgt, der Hinweis darauf. */
export function beschriftung(item: ScoreItem): string {
  const nummer = item.nummer ? `${item.nummer}. ` : '';
  const praxis = item.ausgefuellt_von === 'therapeut' ? ' (Praxis)' : '';
  return `${nummer}${item.text}${praxis}`;
}

/** Der Weg zur Erhebungsseite: neu, als Entwurf oder als Korrektur. */
export function erhebenPfad(
  patientId: string,
  instrumentId: string,
  zusatz: { entwurf?: string; korrigiert?: string } = {},
): string {
  const suche = new URLSearchParams({ instrument: instrumentId });
  if (zusatz.entwurf) suche.set('entwurf', zusatz.entwurf);
  if (zusatz.korrigiert) suche.set('korrigiert', zusatz.korrigiert);
  return `/patienten/${patientId}/befund/erheben?${suche.toString()}`;
}

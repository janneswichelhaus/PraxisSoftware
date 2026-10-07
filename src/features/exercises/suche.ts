import type { Uebung } from './api';

/**
 * Suche und Filter der Übungsbibliothek (UEB-003).
 *
 * Gesucht wird in beiden Sprachebenen - fachlich und in Alltagssprache - an
 * Übung und Variante; gefiltert nach Körperregion und Ausrüstung. Das sind
 * die Ordnungen, die ADR-006 Punkt 10 ausdrücklich zulässt. Nichts hier liest
 * Angaben einer Person, und die Reihenfolge bleibt die der Bibliothek: nach
 * Bezeichnung.
 */

/** Ausrüstungsfilter: alle, nur Varianten ohne Ausrüstung, oder ein Schlagwort. */
export const OHNE_AUSRUESTUNG = '__ohne__';

export interface Filter {
  text: string;
  region: string;
  ausruestung: string;
}

export const KEIN_FILTER: Filter = { text: '', region: '', ausruestung: '' };

export interface Treffer {
  uebung: Uebung;
  /** Varianten, in denen der Suchtext stand, wenn er nicht schon an der Übung stand. */
  variantenTreffer: string[];
}

function normal(text: string): string {
  return text.toLocaleLowerCase('de').normalize('NFC').trim();
}

/** Wie viele Filter gesetzt sind - für den Zähler am Aufklapper. */
export function gesetzteFilter(filter: Filter): number {
  return (filter.region ? 1 : 0) + (filter.ausruestung ? 1 : 0);
}

/** Die Schlagworte der Ausrüstung über alle nicht archivierten Varianten, sortiert. */
export function ausruestungen(uebungen: readonly Uebung[]): string[] {
  const gesehen = new Map<string, string>();
  for (const uebung of uebungen) {
    for (const variante of uebung.variants) {
      if (variante.archived) continue;
      for (const wort of variante.equipment) {
        if (!gesehen.has(normal(wort))) gesehen.set(normal(wort), wort);
      }
    }
  }
  return [...gesehen.values()].sort((a, b) => a.localeCompare(b, 'de'));
}

export function filtere(uebungen: readonly Uebung[], filter: Filter): Treffer[] {
  const text = normal(filter.text);
  const ausruestung = normal(filter.ausruestung);
  const treffer: Treffer[] = [];

  for (const uebung of uebungen) {
    if (filter.region && uebung.body_region !== filter.region) continue;

    // Archivierte Varianten zählen für die Suche nicht mit: Sie stehen nicht
    // mehr in der Bibliothek.
    const varianten = uebung.variants.filter((variante) => !variante.archived);

    if (ausruestung) {
      const passt = varianten.some((variante) =>
        ausruestung === normal(OHNE_AUSRUESTUNG)
          ? variante.equipment.length === 0
          : variante.equipment.some((wort) => normal(wort) === ausruestung),
      );
      if (!passt) continue;
    }

    if (!text) {
      treffer.push({ uebung, variantenTreffer: [] });
      continue;
    }
    if (normal(uebung.name).includes(text) || normal(uebung.lay_name).includes(text)) {
      treffer.push({ uebung, variantenTreffer: [] });
      continue;
    }
    const variantenTreffer = varianten
      .filter(
        (variante) =>
          normal(variante.name).includes(text) || normal(variante.lay_name).includes(text),
      )
      .map((variante) => variante.name);
    if (variantenTreffer.length > 0) treffer.push({ uebung, variantenTreffer });
  }
  return treffer;
}

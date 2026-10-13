import type { Bibliothek } from './api';
import type { Katalogeintrag } from './katalog/typen';

/**
 * Der mitgelieferte Katalog als eigener Teil des Builds (ANN-382): geladen
 * nur, wenn owner ihn übernehmen will oder eine Vorlage Namen braucht. Für
 * Lesende bleibt er draußen - 150 Einträge mit Bildbeschreibung.
 */
export const KATALOG_SCHLUESSEL = ['uebungskatalog'] as const;

export function ladeKatalog(): Promise<readonly Katalogeintrag[]> {
  return import('./katalog').then((modul) => modul.KATALOG);
}

/** Hat die Praxis schon etwas aus dem Katalog übernommen? */
export function katalogUebernommen(bibliothek: Bibliothek): boolean {
  return bibliothek.exercises.some((u) => u.variants.some((v) => v.catalog_key !== null));
}

/** Wie viele Katalogeinträge der Bibliothek der Praxis fehlen. */
export function neueKatalogeintraege(
  bibliothek: Bibliothek,
  katalog: readonly Katalogeintrag[],
): number {
  const vorhanden = new Set(
    bibliothek.exercises.flatMap((u) => u.variants.map((v) => v.catalog_key)),
  );
  return katalog.filter((e) => !vorhanden.has(e.schluessel)).length;
}

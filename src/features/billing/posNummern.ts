import { fetchKatalogPositionen, fetchKatalogVersionen } from './api';

/**
 * Die Pos.-Nr. je Heilmittel aus der am Tag gültigen Preisliste, nur zur Anzeige beim Abtippen
 * einer Verordnung: Der Preis kommt aus der Preisliste, nie vom Rezept. Ohne Preisliste leer.
 */
export async function ladePosNummern(heute: string): Promise<ReadonlyMap<string, string>> {
  const gueltig = (await fetchKatalogVersionen())
    .filter((v) => v.published_at !== null && v.valid_from <= heute)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
  const nummern = new Map<string, string>();
  if (!gueltig) return nummern;
  for (const position of await fetchKatalogPositionen(gueltig.id)) {
    if (position.remedy && position.item_kind === 'treatment') {
      nummern.set(position.remedy, position.code);
    }
  }
  return nummern;
}

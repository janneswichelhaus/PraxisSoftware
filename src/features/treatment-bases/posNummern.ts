import { useQuery } from '@tanstack/react-query';
import { fetchKatalogPositionen, fetchKatalogVersionen } from '@/features/billing/api';

/**
 * Die Pos.-Nr. je Heilmittel aus der gültigen Preisliste (Akte entschlacken,
 * 2026-10-03).
 *
 * Die Position einer Grundlage ist nur über den Namen des Heilmittels mit der
 * Preisliste verbunden (`service_catalog_items.remedy`, ABR-001); der Preis
 * kommt aus der Preisliste, nie vom Rezept. Hier steht nur die Nummer zur
 * Anzeige im Fenster „Daten übertragen". Ohne veröffentlichte Preisliste oder
 * bei einem Ladefehler bleibt die Karte leer - erfasst wird trotzdem.
 */
export function usePosNummern(heute: string): Map<string, string> {
  const versionen = useQuery({
    queryKey: ['katalog-versionen'],
    queryFn: fetchKatalogVersionen,
    retry: false,
  });
  const gueltig = (versionen.data ?? [])
    .filter((v) => v.published_at !== null && v.valid_from <= heute)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
  const positionen = useQuery({
    queryKey: ['katalog-positionen', gueltig?.id],
    queryFn: () => fetchKatalogPositionen(gueltig!.id),
    enabled: Boolean(gueltig),
    retry: false,
  });
  const nummern = new Map<string, string>();
  for (const position of positionen.data ?? []) {
    if (position.remedy && position.item_kind === 'treatment') {
      nummern.set(position.remedy, position.code);
    }
  }
  return nummern;
}

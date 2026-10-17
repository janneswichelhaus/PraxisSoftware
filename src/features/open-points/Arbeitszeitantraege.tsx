import { useQuery } from '@tanstack/react-query';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { changeTitle, minutesChange } from '@/features/working-time/format';
import { mitRueckweg } from '@/lib/rueckweg';
import { abfragen } from './eingang';

/**
 * „Arbeitszeitänderungen“ in Offene Punkte (AZ-001): was owner zu entscheiden
 * hat, je Antrag eine Zeile zum geführten Entscheiden (G8b). Ohne offenen
 * Antrag steht hier nichts.
 */
export function Arbeitszeitantraege() {
  const { data } = useQuery(abfragen.arbeitszeit());
  if (!data || data.length === 0) return null;
  return (
    <Listenabschnitt titel="Arbeitszeitänderungen" anzahl={data.length}>
      {data.map((antrag) => (
        <ListRow
          key={antrag.id}
          titel={antrag.name ?? 'Unbekannte Person'}
          meta={`${changeTitle(antrag.kind, antrag.on_date)} · ${minutesChange(
            antrag.previous_minutes,
            antrag.new_minutes,
          )}`}
          to={mitRueckweg(`/betrieb/arbeitszeit/entscheiden/${antrag.id}`, '/offen')}
        />
      ))}
    </Listenabschnitt>
  );
}

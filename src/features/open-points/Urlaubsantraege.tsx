import { useQuery } from '@tanstack/react-query';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { mitRueckweg } from '@/lib/rueckweg';
import { urlaubstage, zeitraumText } from '@/features/vacation/zeitraum';
import { abfragen } from './eingang';

/**
 * „Urlaubsanträge“ in Offene Punkte (URL-001): was owner zu entscheiden hat,
 * je Antrag eine Zeile zum geführten Entscheiden (G7b).
 * Ohne Notiz - die sieht nur die Person (BEF-066, ANN-580). Ohne offenen
 * Antrag steht hier nichts.
 */
export function Urlaubsantraege({ heute }: { heute: string }) {
  const { data } = useQuery(abfragen.urlaub(heute));
  if (!data || data.length === 0) return null;
  const jahr = Number(heute.slice(0, 4));
  return (
    <Listenabschnitt titel="Urlaubsanträge" anzahl={data.length}>
      {data.map((antrag) => (
        <ListRow
          key={antrag.id}
          titel={antrag.name ?? 'Unbekannte Person'}
          meta={`${antrag.kind === 'cancellation' ? 'Storno · ' : ''}${zeitraumText(
            antrag.starts_on,
            antrag.ends_on,
            jahr,
          )} · ${urlaubstage(antrag.days)}`}
          to={mitRueckweg(`/betrieb/urlaub/entscheiden/${antrag.id}`, '/offen')}
        />
      ))}
    </Listenabschnitt>
  );
}

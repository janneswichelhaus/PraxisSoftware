import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { mitRueckweg } from '@/lib/rueckweg';
import { zeitraumText } from '@/lib/datum';
import { urlaubstage } from '@/features/workforce/vacation/zeitraum';
import { abfragen } from './eingang';

/**
 * „Urlaubsanträge“ in Offene Punkte (URL-001): was owner zu entscheiden hat,
 * je Antrag eine Zeile zum geführten Entscheiden (G7b).
 * Ohne Notiz - die sieht nur die Person (BEF-066, ANN-580). Ohne offenen
 * Antrag steht hier nichts; geht das Laden schief, sagt es die Gruppe wie
 * ihre Nachbarn, statt still zu fehlen (Design-Review).
 */
export function Urlaubsantraege({
  heute,
  rueckweg = '/offen',
}: {
  heute: string;
  /** Wohin „Zurück“ aus dem Entscheiden führt - Offene Punkte oder Eingang (ORG-004). */
  rueckweg?: string;
}) {
  const { data, isError, refetch } = useQuery(abfragen.urlaub(heute));
  if (isError && !data) {
    return (
      <Section titel="Urlaubsanträge">
        <ErrorState
          title="Die Urlaubsanträge konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
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
          to={mitRueckweg(`/betrieb/urlaub/entscheiden/${antrag.id}`, rueckweg)}
        />
      ))}
    </Listenabschnitt>
  );
}

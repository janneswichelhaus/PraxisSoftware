import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { changeTitle, minutesChange } from '@/features/workforce';
import { mitRueckweg } from '@/lib/rueckweg';
import { abfragen } from './eingang';

/**
 * „Arbeitszeitänderungen“ in Offene Punkte (AZ-001): was owner zu entscheiden
 * hat, je Antrag eine Zeile zum geführten Entscheiden (G8b). Ohne offenen
 * Antrag steht hier nichts; geht das Laden schief, sagt es die Gruppe wie
 * ihre Nachbarn (Design-Review Überholung 7).
 */
export function Arbeitszeitantraege({ rueckweg = '/offen' }: { rueckweg?: string }) {
  const { data, isError, refetch } = useQuery(abfragen.arbeitszeit());
  if (isError && !data) {
    return (
      <Section titel="Arbeitszeitänderungen">
        <ErrorState
          title="Die Arbeitszeitänderungen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
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
          to={mitRueckweg(`/betrieb/arbeitszeit/entscheiden/${antrag.id}`, rueckweg)}
        />
      ))}
    </Listenabschnitt>
  );
}

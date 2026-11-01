import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { monateText } from '@/features/billing';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { abfragen } from './eingang';

const TITEL = 'Trainingspaket endet';

/**
 * Trainingspakete, die in vier Wochen ohne Folgepaket enden (ANN-834), das nächste Ende zuerst.
 * Die Zeile führt zu den Verträgen der Person, wo das Folgepaket entsteht; Kontakt steht erst dort.
 */
export function EndingTrainingPackages() {
  const { data, isError, refetch } = useQuery(abfragen.paketEndet());
  if (isError && !data) {
    return (
      <Section titel={TITEL}>
        <ErrorState
          title="Die endenden Trainingspakete konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  if (!data || data.length === 0) return null;
  return (
    <Listenabschnitt titel={TITEL} anzahl={data.length}>
      {data.map((paket) => (
        <ListRow
          key={paket.training_relationship_id}
          titel={
            [paket.family_name, paket.given_name].filter(Boolean).join(', ') || 'Unbekannte Person'
          }
          meta={`Paket über ${monateText(paket.package_months)} · endet am ${formatDate(paket.ends_on)}`}
          to={mitRueckweg(
            `/training/${paket.training_relationship_id}?bereich=vertraege`,
            '/offen',
          )}
        />
      ))}
    </Listenabschnitt>
  );
}

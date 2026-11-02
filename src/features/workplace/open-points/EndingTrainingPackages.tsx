import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { StatusMark } from '@/components/ui/StatusMark';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { TRAININGSPAKET_ANKER, monateText } from '@/features/billing';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { abfragen } from './eingang';

const TITEL = 'Trainingspaket endet';

/** Sprungziel der Gruppe: Die Kennzahl der Statistik und der Rückweg vom Paket landen hier. */
export const PAKET_ENDET_ANKER = 'trainingspaket-endet';

/**
 * Trainingspakete, die in vier Wochen ohne Folgepaket enden (ANN-834), das nächste Ende zuerst.
 * Die Zeile führt zum Paket der Person, wo das Folgepaket entsteht; Kontakt steht erst dort.
 */
export function EndingTrainingPackages() {
  const { data, isError, refetch } = useQuery(abfragen.paketEndet());
  if (isError && !data) {
    return (
      <Sprungziel>
        <Section titel={TITEL}>
          <ErrorState
            title="Die endenden Trainingspakete konnten nicht geladen werden."
            description={VERBINDUNG_PRUEFEN}
            onErneut={() => refetch()}
          />
        </Section>
      </Sprungziel>
    );
  }
  if (!data || data.length === 0) return null;
  return (
    <Sprungziel>
      <Listenabschnitt titel={TITEL} anzahl={data.length}>
        {data.map((paket) => (
          <ListRow
            key={paket.training_relationship_id}
            titel={
              [paket.family_name, paket.given_name].filter(Boolean).join(', ') ||
              'Unbekannte Person'
            }
            meta={`Paket über ${monateText(paket.package_months)} · endet am ${formatDate(paket.ends_on)}`}
            status={
              paket.care_open ? (
                <StatusMark ton="warnung">Noch in Behandlung</StatusMark>
              ) : undefined
            }
            to={mitRueckweg(
              `/training/${paket.training_relationship_id}?bereich=vertraege#${TRAININGSPAKET_ANKER}`,
              `/offen#${PAKET_ENDET_ANKER}`,
            )}
          />
        ))}
      </Listenabschnitt>
    </Sprungziel>
  );
}

/** Der Abstand wie bei `Section`, dazu Luft unter der klebenden Kopfzeile beim Sprung. */
function Sprungziel({ children }: { children: ReactNode }) {
  return (
    <div id={PAKET_ENDET_ANKER} className="mt-8 scroll-mt-20 first:mt-0">
      {children}
    </div>
  );
}

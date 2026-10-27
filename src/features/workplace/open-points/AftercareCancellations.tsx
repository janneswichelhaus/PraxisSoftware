import { useQuery } from '@tanstack/react-query';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import type { AboKuendigung } from './aftercare-cancellations-api';
import { abfragen } from './eingang';

/**
 * „Abo gekündigt über die Plattform" in Offene Punkte (ANG-003, DSN-001
 * Abschnitt 6): ein Hinweis für 14 Tage, damit die Praxis weiß, wann die
 * Nachsorge endet. Ohne Kündigung steht hier nichts.
 */
export function AftercareCancellations() {
  const { data } = useQuery(abfragen.kuendigungen());
  if (!data || data.length === 0) return null;
  return (
    <Listenabschnitt
      titel="Nachsorge-Abo gekündigt"
      anzahl={data.length}
      mehr={
        <Kleingedrucktes>
          Über die Plattform gekündigt. Die Liste zeigt die letzten 14 Tage.
        </Kleingedrucktes>
      }
    >
      {data.map((k) => (
        <Zeile key={k.subscription_id} kuendigung={k} />
      ))}
    </Listenabschnitt>
  );
}

function Zeile({ kuendigung: k }: { kuendigung: AboKuendigung }) {
  const name = [k.family_name, k.given_name].filter(Boolean).join(', ') || 'Unbekannte Person';
  const von =
    k.cancelled_access_kind === 'legal_representative' && k.cancelled_representative_name
      ? `von ${k.cancelled_representative_name} (rechtliche Vertretung)`
      : 'von der Person selbst';
  return (
    <ListRow
      titel={name}
      meta={`Gekündigt am ${formatDate(k.cancelled_on)}, ${von} – endet am ${formatDate(k.ends_on)}`}
      to={mitRueckweg(`/patienten/${k.patient_id}/stammdaten`, '/offen')}
    />
  );
}

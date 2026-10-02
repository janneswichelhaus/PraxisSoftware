import { useQuery } from '@tanstack/react-query';
import { Section } from '@/components/ui/Section';
import { todayInTimeZone } from '@/features/appointments/api';
import { formatDate } from '@/lib/datum';
import { fetchZusammenfuehrungen, wandertMit } from './zusammenfuehren';

/**
 * „Zusammengeführt" in der Verwaltung der Akte (ABN-018, BEF-108): Der
 * Nachweis bleibt an der bleibenden Akte, so lange wie sie. Ohne Vermerk
 * steht nichts da - ein Regelfall braucht keine Zeile.
 */
export function Zusammenfuehrungsvermerke({
  patientId,
  zeitzone,
}: {
  patientId: string;
  zeitzone: string | null;
}) {
  const { data } = useQuery({
    queryKey: ['patient-merge-records', patientId],
    queryFn: () => fetchZusammenfuehrungen(patientId),
    retry: false,
  });
  if (!data || data.length === 0) return null;
  return (
    <Section titel="Zusammengeführt" ebene={3}>
      <ul className="text-ink flex flex-col gap-1 text-sm">
        {data.map((v) => {
          const tag = formatDate(
            zeitzone ? todayInTimeZone(zeitzone, new Date(v.merged_at)) : v.merged_at.slice(0, 10),
          );
          const mit = wandertMit(v.counts);
          return (
            <li key={v.id}>
              Am {tag} eine zweite Akte übernommen
              {v.merged_by_name ? ` (${v.merged_by_name})` : ''}
              {mit.length > 0 ? `: ${mit.join(', ')}` : ''}.
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

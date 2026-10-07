import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Section } from '@/components/ui/Section';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  ABO_KUENDIGUNGEN_KEY,
  fetchAboKuendigungen,
  type AboKuendigung,
} from './aftercare-cancellations-api';

/**
 * „Abo gekündigt über die Plattform" in Offene Punkte (ANG-003, DSN-001
 * Abschnitt 6): ein Hinweis für 14 Tage, damit die Praxis weiß, wann die
 * Nachsorge endet. Ohne Kündigung steht hier nichts.
 */
export function AftercareCancellations() {
  const { data } = useQuery({
    queryKey: ABO_KUENDIGUNGEN_KEY,
    queryFn: fetchAboKuendigungen,
    retry: false,
  });
  if (!data || data.length === 0) return null;
  return (
    <Section
      titel={`Nachsorge-Abo gekündigt (${data.length})`}
      hinweis="Über die Plattform gekündigt. Die Liste zeigt die letzten 14 Tage."
    >
      <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
        {data.map((k) => (
          <Zeile key={k.subscription_id} kuendigung={k} />
        ))}
      </ul>
    </Section>
  );
}

function Zeile({ kuendigung: k }: { kuendigung: AboKuendigung }) {
  const name = [k.family_name, k.given_name].filter(Boolean).join(', ') || 'Unbekannte Person';
  const von =
    k.cancelled_access_kind === 'legal_representative' && k.cancelled_representative_name
      ? `von ${k.cancelled_representative_name} (rechtliche Vertretung)`
      : 'von der Person selbst';
  return (
    <li className="py-3">
      <p className="text-ink text-liste font-medium">
        <Link
          to={mitRueckweg(`/patienten/${k.patient_id}/stammdaten`, '/offen')}
          className="hover:text-accent underline-offset-2 hover:underline"
        >
          {name}
        </Link>
      </p>
      <p className="text-ink-muted text-sm">
        Gekündigt am {formatDate(k.cancelled_on)}, {von} – endet am {formatDate(k.ends_on)}
      </p>
    </li>
  );
}

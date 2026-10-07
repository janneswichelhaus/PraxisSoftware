import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Section } from '@/components/ui/Section';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  fetchTrainingswiderrufe,
  TRAININGSWIDERRUFE_KEY,
  type Trainingswiderruf,
} from './training-withdrawals-api';

/**
 * „Trainingsvertrag widerrufen" in Offene Punkte (KND-004): ein Hinweis für
 * 14 Tage. Die Praxis wickelt ab – Paket entfernen oder stornieren,
 * zurückzahlen, Vertrag beenden (ANN-290). Ohne Widerruf steht hier nichts.
 */
export function TrainingWithdrawals() {
  const { data } = useQuery({
    queryKey: TRAININGSWIDERRUFE_KEY,
    queryFn: fetchTrainingswiderrufe,
    retry: false,
  });
  if (!data || data.length === 0) return null;
  return (
    <Section
      titel={`Trainingsvertrag widerrufen (${data.length})`}
      hinweis="Über die Plattform widerrufen. Bitte Paket und Zahlung abwickeln. Die Liste zeigt die letzten 14 Tage."
    >
      <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
        {data.map((w) => (
          <Zeile key={w.contract_id} widerruf={w} />
        ))}
      </ul>
    </Section>
  );
}

function Zeile({ widerruf: w }: { widerruf: Trainingswiderruf }) {
  const name = [w.family_name, w.given_name].filter(Boolean).join(', ') || 'Unbekannte Person';
  const von =
    w.withdrawn_access_kind === 'legal_representative' && w.withdrawn_representative_name
      ? `von ${w.withdrawn_representative_name} (rechtliche Vertretung)`
      : 'von der Person selbst';
  return (
    <li className="py-3">
      <p className="text-ink text-liste font-medium">
        <Link
          to={mitRueckweg(`/training/${w.training_relationship_id}`, '/offen')}
          className="hover:text-accent underline-offset-2 hover:underline"
        >
          {name}
        </Link>
      </p>
      <p className="text-ink-muted text-sm">
        {w.package_label}: widerrufen am {formatDate(w.withdrawn_on)}, {von}
      </p>
    </li>
  );
}

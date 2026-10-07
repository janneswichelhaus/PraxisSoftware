import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Section } from '@/components/ui/Section';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  CONSENT_WITHDRAWALS_KEY,
  fetchConsentWithdrawals,
  purposeLabel,
  type ConsentWithdrawal,
} from './consent-withdrawals-api';

/**
 * „Widerrufen über die Plattform" in Offene Punkte (POR-016, ANN-263): ein
 * Hinweis für 14 Tage, damit kein Bericht und keine Mail mehr auf einer
 * widerrufenen Einwilligung beruht. Ohne Widerruf steht hier nichts - die
 * Liste ist keine Aufgabe, die man abhaken müsste.
 */
export function ConsentWithdrawals() {
  const { data } = useQuery({
    queryKey: CONSENT_WITHDRAWALS_KEY,
    queryFn: fetchConsentWithdrawals,
    retry: false,
  });
  if (!data || data.length === 0) return null;
  return (
    <Section
      titel={`Widerrufen über die Plattform (${data.length})`}
      hinweis="Ab dem Widerruf gilt die Einwilligung nicht mehr. Die Liste zeigt die letzten 14 Tage."
    >
      <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
        {data.map((w) => (
          <Zeile key={w.id} widerruf={w} />
        ))}
      </ul>
    </Section>
  );
}

function personPfad(w: ConsentWithdrawal): string | null {
  if (w.relationship_kind === 'treatment' && w.patient_id) return `/patienten/${w.patient_id}`;
  if (w.relationship_kind === 'training' && w.training_relationship_id)
    return `/training/${w.training_relationship_id}`;
  return null;
}

function Zeile({ widerruf: w }: { widerruf: ConsentWithdrawal }) {
  const name = [w.family_name, w.given_name].filter(Boolean).join(', ') || 'Unbekannte Person';
  const pfad = personPfad(w);
  const von =
    w.platform_access_kind === 'legal_representative' && w.representative_name
      ? `von ${w.representative_name} (rechtliche Vertretung)`
      : 'von der Person selbst';
  return (
    <li className="py-3">
      <p className="text-ink text-liste font-medium">
        {pfad ? (
          <Link
            to={mitRueckweg(pfad, '/offen')}
            className="hover:text-accent underline-offset-2 hover:underline"
          >
            {name}
          </Link>
        ) : (
          name
        )}
      </p>
      <p className="text-ink-muted text-sm">
        {purposeLabel(w.purpose)} widerrufen am {formatDate(w.occurred_on)}, {von}
      </p>
    </li>
  );
}

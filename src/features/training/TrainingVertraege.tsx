import { useQuery } from '@tanstack/react-query';
import { Section } from '@/components/ui/Section';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { fetchVertraege, vertraegeSchluessel, type Kontovertrag } from './vertraege-api';

/**
 * „Im Konto geschlossen" (KND-003, KND-004): Verträge, die die Person selbst
 * nach der Behandlung gebucht hat, mit Widerrufsfrist und – falls es ihn gibt –
 * dem Widerruf. Den Widerruf wickelt die Praxis mit Paket und Rechnung ab
 * (ANN-290). Ohne solchen Vertrag steht hier nichts.
 */
export function TrainingVertraege({ relationshipId }: { relationshipId: string }) {
  const { data } = useQuery({
    queryKey: vertraegeSchluessel(relationshipId),
    queryFn: () => fetchVertraege(relationshipId),
    retry: false,
  });
  if (!data || data.length === 0) return null;
  return (
    <Section titel="Im Konto geschlossen" rahmen>
      <ul className="divide-line divide-y">
        {data.map((v) => (
          <Zeile key={v.id} vertrag={v} />
        ))}
      </ul>
    </Section>
  );
}

function Zeile({ vertrag: v }: { vertrag: Kontovertrag }) {
  const von =
    v.withdrawn_access_kind === 'legal_representative' && v.withdrawn_representative_name
      ? ` von ${v.withdrawn_representative_name} (rechtliche Vertretung)`
      : '';
  return (
    <li className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
      <p className="text-ink text-sm">
        {v.package_label}, {formatDate(v.starts_on)} bis {formatDate(v.ends_on)},{' '}
        {formatEuro(v.price_cents, v.currency)}
      </p>
      <p className="text-ink-muted text-sm">
        Gebucht am {formatDate(v.concluded_on)} · Belehrung Fassung {v.wording_version}
        {v.early_start_requested ? ' · früher Beginn verlangt' : ''}
      </p>
      {v.withdrawn_on ? (
        <p className="text-warnung text-sm font-medium">
          Widerrufen am {formatDate(v.withdrawn_on)}
          {von}. Bitte Paket und Zahlung abwickeln.
        </p>
      ) : (
        <p className="text-ink-muted text-sm">
          Widerruf möglich bis {formatDate(v.withdrawal_ends_on)}
        </p>
      )}
    </li>
  );
}

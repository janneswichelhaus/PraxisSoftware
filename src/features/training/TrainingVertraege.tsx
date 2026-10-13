import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ListRow, ListRows } from '@/components/ui/ListRow';
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
    <Section titel="Im Konto geschlossen">
      <ListRows>
        {data.map((v) => (
          <Zeile key={v.id} vertrag={v} />
        ))}
      </ListRows>
    </Section>
  );
}

function Zeile({ vertrag: v }: { vertrag: Kontovertrag }) {
  const von =
    v.withdrawn_access_kind === 'legal_representative' && v.withdrawn_representative_name
      ? ` von ${v.withdrawn_representative_name} (rechtliche Vertretung)`
      : '';
  return (
    // Eine Zeile der Liste (`ListRow`): das Paket als Titel, darunter Buchung
    // und Frist. Ein Widerruf steht als Zeichen und Wort (DESIGN.md Regel 5).
    <ListRow
      titel={v.package_label}
      meta={
        <>
          {formatDate(v.starts_on)} bis {formatDate(v.ends_on)},{' '}
          {formatEuro(v.price_cents, v.currency)}
          <span className="block">
            Gebucht am {formatDate(v.concluded_on)} · Belehrung Fassung {v.wording_version}
            {v.early_start_requested ? ' · früher Beginn verlangt' : ''}
          </span>
          {v.withdrawn_on ? (
            <span className="text-warnung block font-medium">
              Widerrufen am {formatDate(v.withdrawn_on)}
              {von}. Bitte Paket und Zahlung abwickeln.
            </span>
          ) : (
            <span className="block">Widerruf möglich bis {formatDate(v.withdrawal_ends_on)}</span>
          )}
        </>
      }
      status={v.withdrawn_on ? <Badge ton="warnung">Widerrufen</Badge> : undefined}
    />
  );
}

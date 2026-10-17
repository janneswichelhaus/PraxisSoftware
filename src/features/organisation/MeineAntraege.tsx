import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { fetchReimbursements, reimbursementsKey } from '@/features/reimbursements/api';
import { REIMBURSEMENTS_HOME } from '@/features/reimbursements/paths';
import { reimbursementTitle } from '@/features/reimbursements/rules';
import { fetchUrlaub, urlaubSchluessel } from '@/features/vacation/api';
import { urlaubsfenster } from '@/features/vacation/fenster';
import { urlaubstage, zeitraumText } from '@/features/vacation/zeitraum';
import { WORKING_TIME_KEY, fetchWorkingTime } from '@/features/working-time/api';
import { changeTitle } from '@/features/working-time/format';
import { formatEuro } from '@/lib/geld';

interface Zeile {
  key: string;
  titel: string;
  meta: string;
  status: 'Beantragt' | 'Genehmigt';
  betrag?: string;
  to: string;
}

/**
 * Die eigenen Anträge, die noch laufen (ORG-004): beantragter Urlaub, eine
 * beantragte Arbeitszeitänderung, eine Erstattung, die noch nicht ausgezahlt
 * ist. Dieselben Abfragen wie die Seiten Urlaub, Arbeitszeit und
 * Erstattungen - die Zeile führt dorthin. Erledigtes steht auf diesen Seiten,
 * nicht hier.
 */
export function MeineAntraege({ heute }: { heute: string }) {
  const fenster = urlaubsfenster(heute);
  const urlaub = useQuery({
    queryKey: urlaubSchluessel(fenster.von, fenster.bis),
    queryFn: () => fetchUrlaub(fenster.von, fenster.bis),
    retry: false,
  });
  const arbeitszeit = useQuery({
    queryKey: WORKING_TIME_KEY,
    queryFn: fetchWorkingTime,
    retry: false,
  });
  const erstattungen = useQuery({
    queryKey: reimbursementsKey(null),
    queryFn: () => fetchReimbursements(null),
    retry: false,
  });

  const jahr = Number(heute.slice(0, 4));
  const zeilen: Zeile[] = [
    ...(urlaub.data?.own ?? [])
      .filter((antrag) => antrag.status === 'requested')
      .map((antrag) => ({
        key: `urlaub-${antrag.id}`,
        titel: antrag.kind === 'cancellation' ? 'Storno des Urlaubs' : 'Urlaub',
        meta: `${zeitraumText(antrag.starts_on, antrag.ends_on, jahr)} · ${urlaubstage(antrag.days)}`,
        status: 'Beantragt' as const,
        to: '/betrieb/urlaub',
      })),
    ...(arbeitszeit.data?.own ?? [])
      .filter((antrag) => antrag.status === 'requested')
      .map((antrag) => ({
        key: `arbeitszeit-${antrag.id}`,
        titel: 'Arbeitszeit',
        meta: changeTitle(antrag.kind, antrag.on_date),
        status: 'Beantragt' as const,
        to: '/betrieb/arbeitszeit',
      })),
    ...(erstattungen.data?.person?.reimbursements ?? [])
      .filter((antrag) => antrag.status === 'requested' || antrag.status === 'approved')
      .map((antrag) => ({
        key: `erstattung-${antrag.id}`,
        titel: 'Erstattung',
        meta: reimbursementTitle(antrag),
        status: antrag.status === 'approved' ? ('Genehmigt' as const) : ('Beantragt' as const),
        betrag: formatEuro(antrag.amount_cents),
        to: REIMBURSEMENTS_HOME,
      })),
  ];

  return (
    <Listenabschnitt
      titel="Meine Anträge"
      anzahl={zeilen.length}
      leer={{ titel: 'Keine offenen Anträge' }}
    >
      {zeilen.map((zeile) => (
        <ListRow
          key={zeile.key}
          titel={zeile.titel}
          meta={zeile.meta}
          betrag={zeile.betrag}
          status={
            <Badge ton={zeile.status === 'Genehmigt' ? 'positiv' : 'neutral'}>{zeile.status}</Badge>
          }
          to={zeile.to}
        />
      ))}
    </Listenabschnitt>
  );
}

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
import { fetchTimeAccount, timeAccountKey } from '@/features/timeaccount/api';
import { TIME_ACCOUNT_HOME } from '@/features/timeaccount/paths';
import { dateLong } from '@/features/working-time/format';
import { formatEuro } from '@/lib/geld';

const TON = { Beantragt: 'neutral', Genehmigt: 'positiv', Zurückgewiesen: 'warnung' } as const;

interface Zeile {
  key: string;
  titel: string;
  meta: string;
  status: 'Beantragt' | 'Genehmigt' | 'Zurückgewiesen';
  betrag?: string;
  to: string;
}

/**
 * Die eigenen Anträge, die noch laufen (ORG-004): beantragter Urlaub, eine
 * beantragte Arbeitszeitänderung, eine Erstattung, die noch nicht ausgezahlt
 * ist. Dieselben Abfragen wie die Seiten Urlaub, Arbeitszeit und
 * Erstattungen - die Zeile führt dorthin. Erledigtes steht auf diesen Seiten,
 * nicht hier. Dazu ein zurückgewiesener Eintrag im Zeitkonto, solange sein Tag
 * noch kommt (BEF-179) - ohne Benachrichtigung.
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

  const zeitkonto = useQuery({
    queryKey: timeAccountKey(null),
    queryFn: () => fetchTimeAccount(null),
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
    // BEF-179: Ein zurückgewiesener Zeitkonto-Eintrag, dessen Tag noch kommt,
    // steht hier, bis der Tag vorbei ist - die Zeit ist wieder Arbeitszeit.
    ...(zeitkonto.data?.account?.entries ?? [])
      .filter((eintrag) => eintrag.status === 'rejected' && eintrag.on_date >= heute)
      .map((eintrag) => ({
        key: `zeitkonto-${eintrag.id}`,
        titel: eintrag.kind === 'time_off' ? 'Freizeitausgleich' : 'Zeitkonto',
        meta: [
          dateLong(eintrag.on_date),
          eintrag.rejection_note ? `Grund: ${eintrag.rejection_note}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        status: 'Zurückgewiesen' as const,
        to: TIME_ACCOUNT_HOME,
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
          status={<Badge ton={TON[zeile.status]}>{zeile.status}</Badge>}
          to={zeile.to}
        />
      ))}
    </Listenabschnitt>
  );
}

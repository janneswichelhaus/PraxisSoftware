import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { todayInTimeZone } from '@/features/appointments/api';
import { fetchFleet, flotteSchluessel } from '@/features/fleet/api';
import { CheckupErinnerung } from '@/features/fleet/CheckupHinweise';
import { Arbeitszeitantraege } from '@/features/open-points/Arbeitszeitantraege';
import { Erstattungen } from '@/features/open-points/Erstattungen';
import { Urlaubsantraege } from '@/features/open-points/Urlaubsantraege';
import { eingangsrechte } from '@/features/open-points/eingang';
import { isTherapyStaff, type CurrentUser } from '@/features/session/types';
import { MeineAntraege } from './MeineAntraege';
import { EINGANG, NEUER_ANTRAG } from './pfade';

/**
 * Eingang von Organisation (ORG-004, ANN-604): was im Team, an den Rädern und
 * in den eigenen Anträgen offen ist.
 *
 * Dieselben Gruppen und Abfragen wie „Offene Punkte" (ANN-450) - die
 * Übersicht bleibt der Ort, an dem man alles sieht, was zu tun ist (ADR-024
 * Punkt 10); hier steht der organisatorische Ausschnitt daraus, dazu die
 * eigenen Anträge und der eine Einstieg in jeden neuen Antrag.
 *
 * Nichts hier bewertet eine Person (§20): Die Listen zeigen offene Vorgänge,
 * keine Zählung je Person.
 */
export function EingangPage({ user }: { user: CurrentUser }) {
  const zone = user.organizationTimeZone ?? 'Europe/Berlin';
  const heute = todayInTimeZone(zone);
  const darf = eingangsrechte(user);
  const flotte = isTherapyStaff(user.roles);

  return (
    <>
      <PageHeader
        title="Eingang"
        actions={<ButtonLink to={NEUER_ANTRAG}>Neuer Antrag</ButtonLink>}
      />
      {darf.urlaubsantraege ? <Urlaubsantraege heute={heute} rueckweg={EINGANG} /> : null}
      {darf.arbeitszeitantraege ? <Arbeitszeitantraege rueckweg={EINGANG} /> : null}
      {darf.erstattungen ? <Erstattungen rueckweg={EINGANG} /> : null}
      {flotte ? <CheckupErinnerung heute={heute} zone={zone} /> : null}
      {flotte ? <RaederMitProblem /> : null}
      <MeineAntraege heute={heute} />
    </>
  );
}

/**
 * Räder, die gesperrt sind oder ein offenes Problem haben - für die, die sie
 * freigeben dürfen (owner, Teamleitung; `can_release`). Dieselbe Abfrage wie
 * die Radflotte; ohne solches Rad steht hier nichts.
 */
function RaederMitProblem() {
  const { data } = useQuery({
    queryKey: flotteSchluessel(null),
    queryFn: () => fetchFleet(null),
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (!data?.can_release) return null;
  const raeder = data.bikes.filter((rad) => rad.block !== null || rad.open_problems > 0);
  if (raeder.length === 0) return null;
  return (
    <Listenabschnitt titel="Räder mit Problem" anzahl={raeder.length}>
      {raeder.map((rad) => (
        <ListRow
          key={rad.id}
          titel={rad.name}
          meta={
            rad.block
              ? `Gesperrt${rad.block.reason ? ` · ${rad.block.reason}` : ''}`
              : `${rad.open_problems} ${rad.open_problems === 1 ? 'offenes Problem' : 'offene Probleme'}`
          }
          to={`/betrieb/flotte/rad/${rad.id}`}
        />
      ))}
    </Listenabschnitt>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import type { CurrentUser } from '@/features/core/session/types';
import { fetchFleet, flotteSchluessel } from './api';
import { BikeForm } from './BikeForm';
import { todayInTimeZone, wochenBeginn } from '@/lib/datum';

const ZUR_FLOTTE = '/betrieb/flotte';

/**
 * Ein Rad anlegen (FLT-EPIC-001, DESIGN.md „Formular“). Nur die
 * Praxisinhaber:in (BEF-066); für jede andere Rolle sagt die Seite es, statt
 * ein Formular anzubieten, das der Server abweist.
 */
export function BikeNewPage({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const montag = wochenBeginn(todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin'));
  const abfrage = useQuery({
    queryKey: flotteSchluessel(montag),
    queryFn: () => fetchFleet(montag),
    retry: false,
  });

  return (
    <>
      <Rueckweg standard={ZUR_FLOTTE} beschriftung="Zurück zur Radflotte" />
      <PageHeader title="Rad hinzufügen" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Radflotte wird geladen …"
        fehler="Die Radflotte konnte nicht geladen werden."
        inKarte
      >
        {(flotte) =>
          !flotte.can_manage ? (
            <EmptyState
              inKarte
              title="Räder legt die Praxisinhaber:in an."
              aktion={
                <ButtonLink to={ZUR_FLOTTE} variant="secondary">
                  Zur Radflotte
                </ButtonLink>
              }
            />
          ) : flotte.depots.length === 0 ? (
            <EmptyState
              inKarte
              title="Erst ein Depot anlegen"
              description="Jedes Rad gehört zu einem Depot."
              aktion={
                <ButtonLink to="/betrieb/flotte/depots" variant="secondary">
                  Depots verwalten
                </ButtonLink>
              }
            />
          ) : (
            <BikeForm
              rad={null}
              flotte={flotte}
              abbrechenZiel={ZUR_FLOTTE}
              onGespeichert={(id, freigeben) => {
                freigeben();
                void navigate(`/betrieb/flotte/rad/${id}?bereich=angaben`, {
                  replace: true,
                  state: { meldung: 'Rad angelegt.' },
                });
              }}
            />
          )
        }
      </Abfragezustand>
    </>
  );
}

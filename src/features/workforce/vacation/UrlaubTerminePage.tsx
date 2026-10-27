import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { DaysToReschedule, fetchTerminTage } from '@/features/calendar';
import type { CurrentUser } from '@/features/core';
import { leseRueckweg } from '@/lib/rueckweg';
import { URLAUB_SCHLUESSEL } from './api';
import { todayInTimeZone, istIsoDatum, zeitraumText } from '@/lib/datum';
import { fetchAssignableTherapists } from '@/features/workforce/staff/api';

/**
 * Termine im Urlaub (URL-001, Praxis-Review Überholung 7): die Tage eines
 * geltenden Urlaubs, an denen noch Termine der Person liegen - ab heute, neu
 * gezählt bei jedem Öffnen. „Tag umplanen“ (G2) kommt hierher zurück, bis
 * nichts mehr übrig ist; „Fertig“ führt dorthin, woher das Entscheiden kam.
 *
 * Person und Zeitraum stehen in der Adresse (Kennung und Tage, keine Namen,
 * ADR-011); was zu sehen ist, entscheidet der Server mit dem Kalender.
 */
export function UrlaubTerminePage({ user }: { user: CurrentUser }) {
  const [suche] = useSearchParams();
  const ort = useLocation();
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const heute = todayInTimeZone(zeitzone);
  const rueckweg = leseRueckweg(suche, '/betrieb/urlaub');
  const person = suche.get('person');
  const von = suche.get('von');
  const bis = suche.get('bis');
  const gueltig = !!person && istIsoDatum(von) && istIsoDatum(bis) && von <= bis;
  // Was vor heute lag, ist vorbei - umzuplanen bleibt der Rest.
  const ab = gueltig && von < heute ? heute : (von ?? '');
  const offen = gueltig && ab <= bis;

  const tage = useQuery({
    queryKey: [...URLAUB_SCHLUESSEL, 'appointments', person, ab, bis],
    queryFn: () => fetchTerminTage(person!, ab, bis!, zeitzone),
    enabled: offen,
    retry: false,
  });
  const personen = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    enabled: gueltig,
    retry: false,
  });
  const name = personen.data?.find((p) => p.staff_member_id === person)?.display_name;
  const hier = `${ort.pathname}${ort.search}`;
  const fertig = <ButtonLink to={rueckweg}>Fertig</ButtonLink>;

  return (
    <>
      <Rueckweg standard="/betrieb/urlaub" beschriftung="Zurück zum Urlaub" />
      <PageHeader
        title="Termine im Urlaub"
        description={
          gueltig
            ? [name, zeitraumText(von, bis, Number(heute.slice(0, 4)))].filter(Boolean).join(' · ')
            : undefined
        }
      />
      {offen ? (
        <Abfragezustand
          abfrage={tage}
          laden="Termine werden gezählt …"
          fehler="Die Termine konnten nicht geladen werden."
          inKarte
          leer={{
            wenn: (liste) => liste.length === 0,
            titel: 'Keine Termine mehr im Urlaub',
            aktion: fertig,
          }}
        >
          {(liste) => (
            <DaysToReschedule
              staffMemberId={person}
              days={liste}
              user={user}
              returnTo={hier}
              aufSeite
            />
          )}
        </Abfragezustand>
      ) : (
        <EmptyState inKarte title="Keine Termine mehr im Urlaub" aktion={fertig} />
      )}
    </>
  );
}

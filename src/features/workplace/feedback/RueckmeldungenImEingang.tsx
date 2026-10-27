import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { EINGANG } from '@/features/workplace/organisation/pfade';
import { mitRueckweg } from '@/lib/rueckweg';
import { FEEDBACK_STATUS_KEY, fetchFeedbackStatus } from './api';
import { monatsname } from './fragen';
import { NamentlicheRueckmeldungen } from './NamentlicheRueckmeldungen';
import { BAROMETER_PFAD, RUECKMELDUNG_PFAD } from './inhalt';

/**
 * Rückmeldungen im Eingang (ORG-006): für Beschäftigte das Barometer des
 * Monats, solange es nicht abgegeben ist, und der Weg zur Rückmeldung an die
 * Praxisleitung; für owner die namentlichen Rückmeldungen. Wer nichts davon
 * hat, sieht hier nichts.
 */
export function RueckmeldungenImEingang() {
  const status = useQuery({
    queryKey: FEEDBACK_STATUS_KEY,
    queryFn: fetchFeedbackStatus,
    retry: false,
  });
  const stand = status.data;
  if (!stand) return null;
  if (stand.can_read) return <NamentlicheRueckmeldungen />;
  if (!stand.can_take_part) return null;
  const monat = monatsname(stand.month);
  return (
    <Listenabschnitt titel="An die Praxisleitung">
      {stand.barometer_submitted ? null : (
        <ListRow
          titel={`Barometer ${monat}`}
          meta="Fünf kurze Fragen, mit deinem Namen"
          aktion={
            <ButtonLink
              to={mitRueckweg(BAROMETER_PFAD, EINGANG)}
              variant="secondary"
              groesse="kompakt"
              aria-label={`Barometer ${monat} ausfüllen`}
            >
              Ausfüllen
            </ButtonLink>
          }
        />
      )}
      <ListRow
        titel="Rückmeldung an die Praxisleitung"
        meta="Jederzeit, mit oder ohne Namen"
        to={mitRueckweg(RUECKMELDUNG_PFAD, EINGANG)}
      />
    </Listenabschnitt>
  );
}

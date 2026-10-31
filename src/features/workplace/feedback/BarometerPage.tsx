import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { KeinZugang } from '@/app/KeinZugang';
import { EINGANG } from '@/lib/eingang';
import type { CurrentUser } from '@/features/core';
import { leseRueckweg } from '@/lib/rueckweg';
import { FEEDBACK_STATUS_KEY, fetchFeedbackStatus, type FeedbackStatus } from './api';
import { BarometerAblauf } from './BarometerAblauf';
import { monatsname } from './fragen';
import { NamentlicheRueckmeldungen } from './NamentlicheRueckmeldungen';

/**
 * Das Barometer (§20.2): für Beschäftigte der geführte Ablauf des laufenden Monats, für owner die
 * Antworten einzeln mit Namen (ANN-607). Wer was bekommt, sagt `get_my_staff_feedback_status`.
 */
export function BarometerPage({ user }: { user: CurrentUser }) {
  const status = useQuery({
    queryKey: FEEDBACK_STATUS_KEY,
    queryFn: fetchFeedbackStatus,
    retry: false,
  });
  return (
    <Abfragezustand
      abfrage={status}
      laden="Barometer wird geladen …"
      fehler="Das Barometer konnte nicht geladen werden."
      rahmen={(zustand) => (
        <>
          <PageHeader title="Barometer" />
          {zustand}
        </>
      )}
    >
      {(stand) =>
        stand.can_read ? (
          <Antworten />
        ) : stand.can_take_part ? (
          <Abgeben stand={stand} />
        ) : (
          <KeinZugang user={user} />
        )
      }
    </Abfragezustand>
  );
}

function Abgeben({ stand }: { stand: FeedbackStatus }) {
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const rueckweg = leseRueckweg(suche, EINGANG);
  // Gesendet in diesem Aufruf: der Dank - auch wenn der Stand inzwischen
  // „abgegeben“ sagt.
  const [gesendet, setGesendet] = useState(false);
  const name = monatsname(stand.month);

  if (gesendet) {
    return (
      <GefuehrterAblauf
        titel="Danke!"
        objekt={`Barometer ${name}`}
        schliessen="Schließen"
        onSchliessen={() => void navigate(rueckweg)}
        seite="danke"
        abschluss
        fuss={
          <Button className="w-full" data-autofocus onClick={() => void navigate(rueckweg)}>
            Fertig
          </Button>
        }
      >
        <Statusmeldung ton="erfolg">Mit deinem Namen an die Praxisleitung gesendet.</Statusmeldung>
      </GefuehrterAblauf>
    );
  }

  if (stand.barometer_submitted) {
    return (
      <>
        <Rueckweg standard={EINGANG} />
        <PageHeader title={`Barometer ${name}`} />
        <EmptyState
          inKarte
          title={`Für ${name} schon abgegeben`}
          description="Das nächste Barometer gibt es im nächsten Monat."
          aktion={
            <ButtonLink to={rueckweg} variant="secondary">
              Zurück
            </ButtonLink>
          }
        />
      </>
    );
  }

  return (
    <BarometerAblauf monat={stand.month} rueckweg={rueckweg} onGesendet={() => setGesendet(true)} />
  );
}

/** owner: jede Antwort als einzelne Nachricht, ohne Summe und ohne Kurve (§20.2 Nr. 3). */
function Antworten() {
  return (
    <>
      <Rueckweg standard={EINGANG} />
      <PageHeader title="Barometer" description="Mit Namen, die neueste zuerst" />
      <NamentlicheRueckmeldungen art="barometer" titel="Antworten" />
    </>
  );
}

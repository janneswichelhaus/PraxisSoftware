import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { leseRueckweg } from '@/lib/rueckweg';
import type { CurrentUser } from '@/features/core';
import { fetchBike, fetchFleet, flotteSchluessel, radSchluessel, type Fleet } from './api';
import { frage } from './pannenablauf';
import { Pannenfenster } from './Pannenfenster';
import { istMeinRad } from './rad';
import { Radwahl } from './Radwahl';
import { aktiveStandortvorlage } from './standortvorlage';
import { todayInTimeZone, wochenBeginn } from '@/lib/datum';

/**
 * Panne melden: erst das Rad auf einer gewöhnlichen Seite - das eigene vorbelegt, nie übersprungen,
 * sonst meldete man stillschweigend ein beliebiges -, dann das Fenster an `?rad=` (`Pannenfenster`).
 */
export function BreakdownPage({ user }: { user: CurrentUser }) {
  const [parameter, setParameter] = useSearchParams();
  const radId = parameter.get('rad');
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const montag = wochenBeginn(todayInTimeZone(zeitzone));
  const flotte = useQuery({
    queryKey: flotteSchluessel(montag),
    queryFn: () => fetchFleet(montag),
    retry: false,
  });
  const ziel = leseRueckweg(parameter, '/betrieb/flotte');

  return (
    <>
      <Rueckweg standard="/betrieb/flotte" beschriftung="Zurück zur Radflotte" />
      {radId ? (
        <>
          {/* Auch hinter dem Fenster und ohne Daten trägt die Seite einen
              Titel (UIK-16). */}
          <PageHeader title="Panne melden" />
          <Abfragezustand
            abfrage={flotte}
            laden="Radflotte wird geladen …"
            fehler="Die Radflotte konnte nicht geladen werden."
            inKarte
          >
            {(daten) => (
              <MitRad key={radId} flotte={daten} radId={radId} zurueck={ziel} zeitzone={zeitzone} />
            )}
          </Abfragezustand>
        </>
      ) : (
        <>
          <PageHeader kicker="Panne melden" title={frage('radwahl', aktiveStandortvorlage)} />
          <Abfragezustand
            abfrage={flotte}
            laden="Radflotte wird geladen …"
            fehler="Die Radflotte konnte nicht geladen werden."
            inKarte
          >
            {(daten) => (
              <Auswahl
                flotte={daten}
                zurueck={ziel}
                onWeiter={(id) => {
                  const neu = new URLSearchParams(parameter);
                  neu.set('rad', id);
                  setParameter(neu);
                }}
              />
            )}
          </Abfragezustand>
        </>
      )}
    </>
  );
}

/** Das gewählte Rad: erst geladen, dann das Fenster. */
function MitRad({
  flotte,
  radId,
  zurueck,
  zeitzone,
}: {
  flotte: Fleet;
  radId: string;
  zurueck: string;
  zeitzone: string;
}) {
  const bekannt = flotte.bikes.some((rad) => rad.id === radId);
  const detail = useQuery({
    queryKey: radSchluessel(radId),
    queryFn: () => fetchBike(radId),
    enabled: bekannt,
    retry: false,
  });

  if (!bekannt) {
    return (
      <ErrorState
        title="Dieses Rad gibt es nicht mehr."
        description="Bitte das Rad in der Radflotte neu wählen."
      />
    );
  }

  return (
    <Abfragezustand
      abfrage={detail}
      laden="Rad wird geladen …"
      fehler="Das Rad konnte nicht geladen werden."
      inKarte
    >
      {(daten) => (
        <Pannenfenster flotte={flotte} detail={daten} zurueck={zurueck} zeitzone={zeitzone} />
      )}
    </Abfragezustand>
  );
}

/**
 * Welches Rad betrifft es? Vorgewählt ist das eigene, bestätigt erst mit
 * „Weiter“ - sonst würde stillschweigend ein beliebiges Rad gemeldet.
 */
function Auswahl({
  flotte,
  zurueck,
  onWeiter,
}: {
  flotte: Fleet;
  zurueck: string;
  onWeiter: (id: string) => void;
}) {
  const [wahl, setWahl] = useState(
    () =>
      flotte.bikes.find((rad) => istMeinRad(rad, flotte.my_staff_member_id) && !rad.block)?.id ??
      '',
  );
  return (
    <div className="max-w-formular">
      <Radwahl flotte={flotte} wert={wahl} onWahl={setWahl} />
      <Formularfuss>
        <Button onClick={() => onWeiter(wahl)} disabled={!wahl}>
          Weiter
        </Button>
        <ButtonLink to={zurueck} variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>
    </div>
  );
}

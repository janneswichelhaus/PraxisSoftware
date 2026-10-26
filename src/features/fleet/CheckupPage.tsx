import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { leseRueckweg } from '@/lib/rueckweg';
import type { CurrentUser } from '@/features/session/types';
import { fetchBike, fetchFleet, flotteSchluessel, radSchluessel, type Fleet } from './api';
import { bikeTypeLabels } from './bike3d/zones';
import { CheckupFenster } from './CheckupFenster';
import { istMeinRad } from './rad';
import { Radwahl } from './Radwahl';
import { todayInTimeZone, wochenBeginn } from '@/lib/datum';

/**
 * Fahrrad-Check-Up: erst das Rad, dann der geführte Check-Up im Fenster (`CheckupFenster`,
 * ANN-563). Er sperrt das Rad nicht, auch nicht mit „Problem“ - dafür ist die Pannenmeldung da,
 * und die Teamleitung kann es von Hand sperren.
 */
export function CheckupPage({ user }: { user: CurrentUser }) {
  const [parameter, setParameter] = useSearchParams();
  const radId = parameter.get('rad');
  const montag = wochenBeginn(todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin'));
  const flotte = useQuery({
    queryKey: flotteSchluessel(montag),
    queryFn: () => fetchFleet(montag),
    retry: false,
  });
  const rad = useQuery({
    queryKey: radSchluessel(radId ?? ''),
    queryFn: () => fetchBike(radId ?? ''),
    enabled: Boolean(radId),
    retry: false,
  });
  const zurueck = leseRueckweg(parameter, '/betrieb/flotte');

  return (
    <>
      <Rueckweg standard="/betrieb/flotte" beschriftung="Zurück zur Radflotte" />
      {/* Unter dem Titel das Rad, sobald es gewählt ist (Regel 6). */}
      <PageHeader
        title="Fahrrad-Check-Up"
        description={
          radId && rad.data
            ? `${rad.data.bike.name} · ${bikeTypeLabels[rad.data.bike.bike_type].kurz}`
            : undefined
        }
      />
      {radId ? (
        <Abfragezustand
          abfrage={rad}
          laden="Rad wird geladen …"
          fehler="Das Rad konnte nicht geladen werden."
          inKarte
        >
          {(detail) => (
            // Ein anderes Rad, ein neuer Check-Up (VOR-03).
            <CheckupFenster key={detail.bike.id} detail={detail} user={user} zurueck={zurueck} />
          )}
        </Abfragezustand>
      ) : (
        <Abfragezustand
          abfrage={flotte}
          laden="Radflotte wird geladen …"
          fehler="Die Radflotte konnte nicht geladen werden."
          inKarte
        >
          {(daten) => (
            <Auswahl
              vorauswahl={
                daten.bikes.find((eintrag) => istMeinRad(eintrag, daten.my_staff_member_id))?.id ??
                ''
              }
              flotte={daten}
              onWeiter={(id) => {
                const neu = new URLSearchParams(parameter);
                neu.set('rad', id);
                setParameter(neu);
              }}
            />
          )}
        </Abfragezustand>
      )}
    </>
  );
}

function Auswahl({
  flotte,
  vorauswahl,
  onWeiter,
}: {
  flotte: Fleet;
  vorauswahl: string;
  onWeiter: (id: string) => void;
}) {
  const [wahl, setWahl] = useState(vorauswahl);
  return (
    <div className="max-w-formular">
      <Radwahl
        flotte={flotte}
        wert={wahl}
        onWahl={setWahl}
        hinweis="Die Nummer eines Rads steht am Sattelrohr, direkt unter dem Sattel."
      />
      <Formularfuss>
        <Button onClick={() => onWeiter(wahl)} disabled={!wahl}>
          Weiter
        </Button>
        <ButtonLink to="/betrieb/flotte" variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>
    </div>
  );
}

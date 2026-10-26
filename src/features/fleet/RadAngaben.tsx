import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Inhaltsflaeche } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { FLOTTE_SCHLUESSEL, blockBike, removeBike, type Bike, type Fleet } from './api';
import { bikeTypeLabels } from './zones';
import { BikeForm } from './BikeForm';
import { wochentageKurz } from './format';
import { depotName, standort } from './rad';

/**
 * Die Angaben eines Rads (DESIGN.md „Objekt“, Reiter Stammdaten zuletzt): für
 * die Praxisinhaber:in das Formular, sonst zum Lesen. Leise am Ende, mit
 * Rückfrage: von Hand sperren (Teamleitung und Inhaber:in, ANN-550) und das
 * Rad entfernen (Inhaber:in) - ohne Verlauf gelöscht, mit Verlauf
 * ausgemustert, der Verlauf bleibt bis zum Ende seiner Frist (ANN-557).
 */
export function RadAngaben({
  rad,
  flotte,
  onMeldung,
}: {
  rad: Bike;
  flotte: Fleet;
  onMeldung: (text: string) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [grund, setGrund] = useState('');

  const sperren = useMutation({
    mutationFn: async () => {
      if (!grund.trim()) throw new Error('Bitte einen Grund angeben.');
      await blockBike(rad.id, grund.trim());
    },
    onSuccess: async () => {
      setGrund('');
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      onMeldung(`${rad.name} ist gesperrt und steht nicht mehr in der Planung.`);
    },
  });

  const entfernen = useMutation({
    mutationFn: () => removeBike(rad.id),
    onSuccess: async (ergebnis) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      void navigate('/betrieb/flotte', {
        replace: true,
        state: {
          meldung:
            ergebnis === 'deleted'
              ? `${rad.name} entfernt.`
              : `${rad.name} ausgemustert. Der Verlauf bleibt bis zum Ende seiner Frist.`,
        },
      });
    },
  });

  return (
    <>
      {flotte.can_manage ? (
        <BikeForm
          // Nach dem Speichern steht der neue Stand im Formular.
          key={rad.updated_at}
          rad={rad}
          flotte={flotte}
          abbrechenZiel="/betrieb/flotte"
          onGespeichert={(_id, freigeben) => {
            freigeben();
            onMeldung('Angaben gespeichert.');
          }}
        />
      ) : (
        <Inhaltsflaeche className="lg:max-w-spalte">
          <DetailList>
            <DetailRow label="Bauart">{bikeTypeLabels[rad.bike_type].lang}</DetailRow>
            <DetailRow label="Stammdepot">{depotName(flotte.depots, rad.home_depot_id)}</DetailRow>
            <DetailRow label="Steht gerade">{standort(rad, flotte.depots)}</DetailRow>
            <DetailRow label="Stammnutzer:in">
              {rad.is_spare ? 'Ersatzrad' : (rad.regular_rider?.name ?? 'Keine')}
            </DetailRow>
            {!rad.is_spare && rad.planned_weekdays.length > 0 ? (
              <DetailRow label="Fährt das Rad am">{wochentageKurz(rad.planned_weekdays)}</DetailRow>
            ) : null}
            {rad.battery ? <DetailRow label="Akku">{rad.battery}</DetailRow> : null}
            {rad.note ? <DetailRow label="Notiz">{rad.note}</DetailRow> : null}
          </DetailList>
        </Inhaltsflaeche>
      )}

      {flotte.can_release && !rad.block ? (
        <div className="border-line max-w-formular mt-8 border-t pt-6">
          <Rueckfrage
            ausloeser="Rad sperren"
            ausloeserVariante="quiet"
            bestaetigen="Ja, Rad sperren"
            bestaetigenLaeuft="Wird gesperrt …"
            fehler={sperren.isError ? sperren.error.message : undefined}
            onBestaetigen={() => sperren.mutateAsync()}
            onAbbrechen={() => {
              sperren.reset();
              setGrund('');
            }}
          >
            <div className="flex flex-col gap-3">
              <p>{rad.name} steht dann nicht mehr in der Planung, bis jemand es freigibt.</p>
              <Field
                label="Grund"
                placeholder="z. B. Jahresinspektion"
                maxLength={200}
                value={grund}
                onChange={(event) => setGrund(event.target.value)}
              />
            </div>
          </Rueckfrage>
        </div>
      ) : null}

      {flotte.can_manage ? (
        <div className="border-line max-w-formular mt-8 border-t pt-6">
          <Rueckfrage
            ausloeser="Rad entfernen"
            ausloeserVariante="quiet"
            bestaetigen="Ja, Rad entfernen"
            bestaetigenLaeuft="Wird entfernt …"
            fehler={entfernen.isError ? entfernen.error.message : undefined}
            onBestaetigen={() => entfernen.mutateAsync()}
            onAbbrechen={() => entfernen.reset()}
          >
            <p>
              {rad.name} verschwindet aus der Radflotte. Hat es einen Verlauf, wird es ausgemustert:
              Check-Ups und Pannen bleiben bis zum Ende ihrer Frist, offene Stellen gelten als
              erledigt.
            </p>
          </Rueckfrage>
        </div>
      ) : null}
    </>
  );
}

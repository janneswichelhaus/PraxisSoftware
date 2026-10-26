import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { mitRueckweg } from '@/lib/rueckweg';
import { FLOTTE_SCHLUESSEL, releaseBike, type BikeDetail, type FleetPhoto, type Spot } from './api';
import { checkItemLabels, zoneCheckItem, zoneLabel } from './zones';
import { Einstufung } from './Einstufung';
import { formatZeitpunkt } from './format';
import { Fotoreihe } from './Fotoreihe';

/**
 * „Stellen am Rad“: die offenen Stellen je Ereignis, nummeriert wie in der Unterlage für die
 * Werkstatt; erledigte (mit der Freigabe, ANN-555) stehen eingeklappt darunter.
 */
export function RadStellen({
  detail,
  fotos,
  zone,
  darfFreigeben,
  onMeldung,
}: {
  detail: BikeDetail;
  fotos: readonly FleetPhoto[];
  zone: string | null;
  darfFreigeben: boolean;
  onMeldung: (text: string) => void;
}) {
  const queryClient = useQueryClient();
  const { bike } = detail;
  const offen = detail.spots.filter((spot) => spot.resolved_at === null);
  const erledigt = detail.spots.filter((spot) => spot.resolved_at !== null);

  const erledigen = useMutation({
    mutationFn: () => releaseBike(bike.id),
    onSuccess: async ({ resolvedSpots }) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      onMeldung(
        resolvedSpots === 1
          ? 'Eine Stelle als erledigt markiert.'
          : `${resolvedSpots} Stellen als erledigt markiert.`,
      );
    },
  });

  // Die Stellen je Ereignis, in der Reihenfolge ihrer Nummern.
  const ereignisse = new Map<string, { titel: string; stellen: Spot[] }>();
  for (const spot of offen) {
    const eintrag = ereignisse.get(spot.source_id);
    if (eintrag) {
      eintrag.stellen.push(spot);
    } else {
      ereignisse.set(spot.source_id, { titel: ereignistitel(detail, spot, zone), stellen: [spot] });
    }
  }

  const werkstatt = mitRueckweg(
    `/betrieb/flotte/rad/${bike.id}/werkstatt`,
    `/betrieb/flotte/rad/${bike.id}?bereich=stellen`,
  );

  return (
    <>
      {offen.length === 0 ? (
        <EmptyState
          inKarte
          title="Keine offenen Stellen"
          aktion={
            <ButtonLink
              to={mitRueckweg(
                `/betrieb/flotte/checkup?rad=${bike.id}`,
                `/betrieb/flotte/rad/${bike.id}`,
              )}
              variant="secondary"
            >
              Check-Up
            </ButtonLink>
          }
        />
      ) : (
        <>
          {/* Gesperrt steht der Weg schon im Kopf des Rads. */}
          {bike.block ? null : (
            <ButtonLink to={werkstatt} variant="secondary" groesse="kompakt">
              Unterlage für die Werkstatt
            </ButtonLink>
          )}
          {[...ereignisse.entries()].map(([quelle, ereignis]) => (
            <Listenabschnitt key={quelle} titel={ereignis.titel}>
              {ereignis.stellen.map((spot) => (
                <Stellenzeile
                  key={spot.id}
                  spot={spot}
                  fotos={fotos.filter((foto) => foto.spot_id === spot.id)}
                />
              ))}
            </Listenabschnitt>
          ))}
          {darfFreigeben && !bike.block ? (
            // Ohne Sperre erledigt „Freigeben“ nur die Stellen (ANN-555) - leise
            // am Ende, mit Rückfrage.
            <div className="mt-6">
              <Rueckfrage
                ausloeser="Stellen als erledigt markieren"
                ausloeserVariante="quiet"
                bestaetigen="Ja, als erledigt markieren"
                bestaetigenLaeuft="Wird markiert …"
                fehler={erledigen.isError ? erledigen.error.message : undefined}
                onBestaetigen={() => erledigen.mutateAsync()}
                onAbbrechen={() => erledigen.reset()}
              >
                <p>
                  {offen.length === 1
                    ? 'Die offene Stelle gilt'
                    : `Alle ${offen.length} offenen Stellen gelten`}{' '}
                  dann als erledigt und bleiben im Verlauf.
                </p>
              </Rueckfrage>
            </div>
          ) : null}
        </>
      )}

      {erledigt.length > 0 ? (
        <div className="mt-8">
          <Disclosure summary="Erledigte Stellen" anzahl={erledigt.length}>
            <ListRows rahmen={false} beschriftung="Erledigte Stellen">
              {erledigt.map((spot) => (
                <ListRow
                  key={spot.id}
                  gedaempft
                  titel={zoneLabel(spot.zone)}
                  meta={
                    <>
                      <span className="block">
                        <Einstufung einstufung={spot.severity} /> · erledigt am{' '}
                        {formatZeitpunkt(spot.resolved_at ?? '', zone)}
                      </span>
                      {spot.note ? <span className="block">{spot.note}</span> : null}
                    </>
                  }
                />
              ))}
            </ListRows>
          </Disclosure>
        </div>
      ) : null}
    </>
  );
}

function ereignistitel(detail: BikeDetail, spot: Spot, zone: string | null): string {
  if (spot.source === 'checkup') {
    const checkup = detail.checkups.find((eintrag) => eintrag.id === spot.source_id);
    return `Check-Up · ${formatZeitpunkt(checkup?.checked_at ?? spot.created_at, zone)}`;
  }
  const panne = detail.breakdowns.find((eintrag) => eintrag.id === spot.source_id);
  return `Panne · ${formatZeitpunkt(panne?.reported_at ?? spot.created_at, zone)}`;
}

function Stellenzeile({ spot, fotos }: { spot: Spot; fotos: readonly FleetPhoto[] }) {
  const pruefpunkt = zoneCheckItem(spot.zone);
  const nummer = spot.number ?? 0;
  return (
    <ListRow
      zeit={
        <>
          <span className="sr-only">Stelle </span>
          {nummer}
        </>
      }
      titel={zoneLabel(spot.zone)}
      meta={
        <>
          <span className="block">
            <Einstufung einstufung={spot.severity} />
            {pruefpunkt ? ` · Prüfpunkt ${checkItemLabels[pruefpunkt]}` : ' · weitere Stelle'}
          </span>
          <span className="block">{spot.note ?? 'Ohne Notiz'}</span>
        </>
      }
      darunter={
        fotos.length > 0 ? <Fotoreihe fotos={fotos} bezug={`zu Stelle ${nummer}`} /> : undefined
      }
    />
  );
}

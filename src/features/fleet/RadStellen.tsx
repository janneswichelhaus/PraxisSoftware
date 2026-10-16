import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Zweispalter } from '@/components/ui/Zweispalter';
import { mitRueckweg } from '@/lib/rueckweg';
import { FLOTTE_SCHLUESSEL, releaseBike, type BikeDetail, type FleetPhoto, type Spot } from './api';
import { BikeModel3D, type BikeFocus } from './bike3d/BikeModel3D';
import {
  checkItemLabels,
  zoneCheckItem,
  zoneLabel,
  type BikeMarker,
  type BikePick,
} from './bike3d/zones';
import { formatZeitpunkt } from './format';
import { Fotoreihe } from './Fotoreihe';
import { Einstufung, Nadel, Nadelform } from './Nadel';
import { punktAmModell } from './stellen';

/**
 * „Stellen am Rad“ (Handoff Lastenrad 3D, Abschnitt 4): das 3D-Rad mit allen
 * offenen Stellen und daneben die Stellen je Ereignis - Panne oder Check-Up
 * mit Tag und Uhrzeit -, je mit Nummer, Bauteil, Einstufung, Prüfpunkt,
 * Notiz, Fotos und „Am Rad zeigen“. Antippen einer Nadel wählt ihre Zeile;
 * „Am Rad zeigen“ dreht das Rad dorthin (AC 5). Zwei Spalten ab 900 px
 * Inhaltsbreite (`Zweispalter`), sonst untereinander.
 *
 * Eine Nummerierung über alle offenen Stellen; erledigte Stellen (mit der
 * Freigabe, ANN-555) stehen eingeklappt darunter und behalten ihren Text.
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
  const [aktiv, setAktiv] = useState<string | null>(null);
  const [fokus, setFokus] = useState<BikeFocus | null>(null);
  const zaehler = useRef(0);
  const [breit] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 1024px)').matches,
  );

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

  const markers: BikeMarker[] = offen.map((spot) => ({
    id: spot.id,
    zone: spot.zone,
    point: punktAmModell(spot, bike.bike_type),
    severity: spot.severity,
    number: spot.number ?? 0,
  }));

  function zeige(spot: Spot) {
    zaehler.current += 1;
    setAktiv(spot.id);
    setFokus({ zones: [spot.zone], token: zaehler.current });
  }

  function getroffen(treffer: BikePick | null) {
    if (!treffer?.markerId) return;
    setAktiv(treffer.markerId);
    // Die Zeile ins Bild, ohne den Fokus zu nehmen.
    document.getElementById(`stelle-${treffer.markerId}`)?.scrollIntoView?.({ block: 'nearest' });
  }

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

  const liste =
    offen.length === 0 ? (
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
        {[...ereignisse.entries()].map(([quelle, ereignis]) => (
          <Listenabschnitt key={quelle} titel={ereignis.titel} ebene={3}>
            {ereignis.stellen.map((spot) => (
              <Stellenzeile
                key={spot.id}
                spot={spot}
                aktiv={aktiv === spot.id}
                fotos={fotos.filter((foto) => foto.spot_id === spot.id)}
                onZeigen={() => zeige(spot)}
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
    );

  return (
    <>
      <Zweispalter kontext={liste}>
        <BikeModel3D
          hoehe={breit ? 520 : 320}
          markers={markers}
          activeMarkerId={aktiv}
          focus={fokus}
          hinweis="Nadel antippen wählt die Stelle"
          onPick={getroffen}
        />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <Nadelform einstufung="problem" />
            <span className="text-ink">Problem</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <Nadelform einstufung="beobachten" />
            <span className="text-ink">Beobachten</span>
          </span>
          {/* Gesperrt steht der Weg schon im Kopf des Rads. */}
          {offen.length > 0 && !bike.block ? (
            <ButtonLink to={werkstatt} variant="secondary" groesse="kompakt">
              Unterlage für die Werkstatt
            </ButtonLink>
          ) : null}
        </div>
      </Zweispalter>

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

function Stellenzeile({
  spot,
  aktiv,
  fotos,
  onZeigen,
}: {
  spot: Spot;
  aktiv: boolean;
  fotos: readonly FleetPhoto[];
  onZeigen: () => void;
}) {
  const pruefpunkt = zoneCheckItem(spot.zone);
  const nummer = spot.number ?? 0;
  return (
    <ListRow
      zeit={
        <span id={`stelle-${spot.id}`} className="scroll-mt-24">
          <Nadel nummer={nummer} einstufung={spot.severity} aktiv={aktiv} />
        </span>
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
      aktion={
        <Button
          type="button"
          variant="secondary"
          aria-label={`Stelle ${nummer} am Rad zeigen: ${zoneLabel(spot.zone)}`}
          onClick={onZeigen}
        >
          Am Rad zeigen
        </Button>
      }
      darunter={
        fotos.length > 0 ? <Fotoreihe fotos={fotos} bezug={`zu Stelle ${nummer}`} /> : undefined
      }
    />
  );
}

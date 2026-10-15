import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Objektkopf, Warnzeile } from '@/components/ui/Objektkopf';
import { PageHeader } from '@/components/ui/PageHeader';
import { Suchreiterleiste } from '@/components/ui/Reiterleiste';
import { useOffenerReiter, type Suchreiter } from '@/components/ui/offenerReiter';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { todayInTimeZone } from '@/features/appointments/api';
import { leseMeldung } from '@/features/appointments/terminformular';
import { leseRueckweg, mitRueckweg, rueckwegBeschriftung } from '@/lib/rueckweg';
import type { CurrentUser } from '@/features/session/types';
import {
  FLOTTE_SCHLUESSEL,
  fetchBike,
  fetchFleet,
  fetchFleetPhotos,
  flotteSchluessel,
  fotosSchluessel,
  radSchluessel,
  releaseBike,
  type BikeDetail,
  type Fleet,
} from './api';
import { bikeTypeLabels } from './bike3d/zones';
import { formatZeitpunkt, montagDerWoche } from './format';
import { ausserhalbDesStammdepots, depotName, radzustandLabels, standort } from './rad';
import { RadAngaben } from './RadAngaben';
import { RadStellen } from './RadStellen';
import { RadVerlauf } from './RadVerlauf';

const ZUR_FLOTTE = '/betrieb/flotte';

type Bereich = 'stellen' | 'verlauf' | 'angaben';

const BEREICHE: Suchreiter<Bereich>[] = [
  { wert: 'stellen', label: 'Stellen' },
  { wert: 'verlauf', label: 'Verlauf' },
  { wert: 'angaben', label: 'Angaben' },
];

/**
 * Ein Rad (FLT-EPIC-001, DESIGN.md „Objekt“): Objektkopf mit Bauart, Standort
 * und Stammnutzer:in, „In Reparatur“ als Ausnahme und die zwei Wege des
 * Tages - Check-Up und Panne, im gesperrten Zustand die Unterlage für die
 * Werkstatt. Die Freigabe steht an der Warnzeile, mit Rückfrage, weil sie
 * die offenen Stellen erledigt (ANN-550).
 *
 * Reiter nach DESIGN.md: die Arbeit (Stellen am Rad) zuerst, dann der
 * Verlauf, die Angaben zuletzt. Der offene Reiter steht in der Adresse
 * (`?bereich=`, ANN-460).
 */
export function BikePage({ user }: { user: CurrentUser }) {
  const { radId = '' } = useParams<{ radId: string }>();
  const zone = user.organizationTimeZone;
  const montag = montagDerWoche(todayInTimeZone(zone ?? 'Europe/Berlin'));
  const detail = useQuery({
    queryKey: radSchluessel(radId),
    queryFn: () => fetchBike(radId),
    enabled: Boolean(radId),
    retry: false,
  });
  const flotte = useQuery({
    queryKey: flotteSchluessel(montag),
    queryFn: () => fetchFleet(montag),
    retry: false,
  });
  const [parameter] = useSearchParams();
  const zurueck = leseRueckweg(parameter, ZUR_FLOTTE);

  return (
    <>
      {/* Ab 640 px als Zeile über dem Kopf, darunter als Pfeil vor dem Namen
          (Objektkopf, RAH-007). Ohne Rad bleibt die Zeile auch am Telefon. */}
      <Rueckweg
        standard={ZUR_FLOTTE}
        beschriftung="Zurück zur Radflotte"
        className={detail.data ? 'mb-3 max-sm:hidden' : ''}
      />
      <Abfragezustand
        abfrage={detail}
        laden="Rad wird geladen …"
        fehler="Das Rad konnte nicht geladen werden."
        endgueltig={{
          wenn: (fehler) => fehler instanceof Error && fehler.message.includes('gibt es nicht'),
          titel: 'Dieses Rad gibt es nicht mehr.',
        }}
        inKarte
        rahmen={(zustand) => (
          <>
            <PageHeader title="Rad" />
            {zustand}
          </>
        )}
      >
        {(daten) => (
          // Rechte, Depots und Personen kommen aus der Liste der Flotte - meist
          // schon geladen, weil die Radflotte davor offen war.
          <Abfragezustand
            abfrage={flotte}
            laden="Radflotte wird geladen …"
            fehler="Die Radflotte konnte nicht geladen werden."
            inKarte
          >
            {(geladen) => <Rad detail={daten} flotte={geladen} zone={zone} zurueck={zurueck} />}
          </Abfragezustand>
        )}
      </Abfragezustand>
    </>
  );
}

function Rad({
  detail,
  flotte,
  zone,
  zurueck,
}: {
  detail: BikeDetail;
  flotte: Fleet;
  zone: string | null;
  zurueck: string;
}) {
  const queryClient = useQueryClient();
  const { bike } = detail;
  const offen = useOffenerReiter(
    'bereich',
    BEREICHE.map((bereich) => bereich.wert),
  );
  const fotos = useQuery({
    queryKey: fotosSchluessel(bike.id),
    queryFn: () => fetchFleetPhotos(bike.id),
    retry: false,
  });

  // Eine Aktion auf einer anderen Seite (Check-Up gespeichert, Panne
  // gemeldet, Rad angelegt) kommt mit ihrem Satz hierher.
  const verlaufszustand: unknown = useLocation().state;
  const [meldung, setMeldung] = useState<{ text: string; nr: number } | null>(() => {
    const text = leseMeldung(verlaufszustand);
    return text ? { text, nr: 1 } : null;
  });
  const melde = (text: string) => setMeldung((vorher) => ({ text, nr: (vorher?.nr ?? 0) + 1 }));

  const freigeben = useMutation({
    mutationFn: () => releaseBike(bike.id),
    onSuccess: async ({ resolvedSpots }) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      melde(
        resolvedSpots > 0
          ? `${bike.name} freigegeben. ${resolvedSpots === 1 ? 'Die Stelle gilt' : `Die ${resolvedSpots} Stellen gelten`} als erledigt.`
          : `${bike.name} freigegeben.`,
      );
    },
  });

  const hier = `/betrieb/flotte/rad/${bike.id}`;
  const offeneStellen = detail.spots.filter((spot) => spot.resolved_at === null).length;
  const sperre = detail.blocks.find((eintrag) => eintrag.released_at === null) ?? null;
  const panne = sperre?.breakdown_id
    ? detail.breakdowns.find((eintrag) => eintrag.id === sperre.breakdown_id)
    : undefined;
  // Kurz in der Warnzeile; der ganze Abschluss der Panne steht im Verlauf.
  const grund = sperre?.reason ?? (panne ? 'nach einer Panne' : null);
  const meta = [
    bikeTypeLabels[bike.bike_type].kurz,
    standort(bike, flotte.depots),
    bike.is_spare ? 'Ersatzrad' : bike.regular_rider?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Objektkopf
        titel={bike.name}
        rueckweg={{
          to: zurueck,
          beschriftung:
            zurueck === ZUR_FLOTTE ? 'Zurück zur Radflotte' : rueckwegBeschriftung(zurueck),
        }}
        meta={meta}
        status={bike.block ? <Badge ton="kritisch">{radzustandLabels.reparatur}</Badge> : null}
        aktionen={
          bike.block ? (
            <>
              {offeneStellen > 0 ? (
                <ButtonLink
                  to={mitRueckweg(`${hier}/werkstatt`, `${hier}?bereich=stellen`)}
                  variant="secondary"
                >
                  Unterlage für die Werkstatt
                </ButtonLink>
              ) : null}
              <ButtonLink
                to={mitRueckweg(`/betrieb/flotte/checkup?rad=${bike.id}`, hier)}
                variant="secondary"
              >
                Check-Up
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink
                to={mitRueckweg(`/betrieb/flotte/checkup?rad=${bike.id}`, hier)}
                variant="secondary"
              >
                Check-Up
              </ButtonLink>
              <ButtonLink
                to={mitRueckweg(`/betrieb/flotte/panne?rad=${bike.id}`, hier)}
                variant="secondary"
              >
                Panne melden
              </ButtonLink>
            </>
          )
        }
        hinweise={
          <>
            {bike.block ? (
              <Warnzeile
                aktion={
                  flotte.can_release ? (
                    <Rueckfrage
                      ausloeser="Freigeben"
                      ausloeserGroesse="kompakt"
                      bezeichnung={`${bike.name} freigeben – Rückfrage`}
                      bestaetigen="Ja, freigeben"
                      bestaetigenLaeuft="Wird freigegeben …"
                      fehler={freigeben.isError ? freigeben.error.message : undefined}
                      onBestaetigen={() => freigeben.mutateAsync()}
                      onAbbrechen={() => freigeben.reset()}
                    >
                      <p>
                        {bike.name} steht danach wieder in der Planung.
                        {offeneStellen > 0
                          ? ` ${offeneStellen === 1 ? 'Die offene Stelle gilt' : `Die ${offeneStellen} offenen Stellen gelten`} als erledigt und ${offeneStellen === 1 ? 'bleibt' : 'bleiben'} im Verlauf.`
                          : ''}
                      </p>
                    </Rueckfrage>
                  ) : null
                }
              >
                In Reparatur seit {formatZeitpunkt(bike.block.blocked_at, zone)}
                {grund ? ` · ${grund}` : ''}
              </Warnzeile>
            ) : null}
            {ausserhalbDesStammdepots(bike) ? (
              <Warnzeile>Gehört zu {depotName(flotte.depots, bike.home_depot_id)}.</Warnzeile>
            ) : null}
          </>
        }
        reiter={<Suchreiterleiste reiter={BEREICHE} param="bereich" label="Bereiche des Rads" />}
      />

      {meldung ? (
        <Rueckmeldung key={meldung.nr} className="mt-6">
          {meldung.text}
        </Rueckmeldung>
      ) : null}

      <div className="mt-6 min-w-0">
        {offen === 'stellen' ? (
          <RadStellen
            detail={detail}
            fotos={fotos.data ?? []}
            zone={zone}
            darfFreigeben={flotte.can_release}
            onMeldung={melde}
          />
        ) : null}
        {offen === 'verlauf' ? (
          <RadVerlauf detail={detail} fotos={fotos.data ?? []} zone={zone} />
        ) : null}
        {offen === 'angaben' ? <RadAngaben rad={bike} flotte={flotte} onMeldung={melde} /> : null}
      </div>
    </>
  );
}

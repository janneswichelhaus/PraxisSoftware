import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { LebensmittelFormular } from '@/features/nutrition/LebensmittelFormular';
import {
  LebensmittelSuche,
  Quellenangabe,
  Trefferzeile,
} from '@/features/nutrition/LebensmittelSuche';
import {
  leereLebensmittelWerte,
  lebensmittelWerteAus,
  type Lebensmittel as Eintrag,
  type LebensmittelAngaben,
} from '@/features/nutrition/lebensmittel';
import {
  ernaehrungSchluessel,
  eigenesLebensmittelLoeschen,
  eigenesLebensmittelSpeichern,
  ladeErnaehrung,
  lebensmittelQuellen,
  lebensmittelSuchen,
  type EigeneErnaehrung,
  type Plattformzugang,
} from './api';
import { PLATTFORM_PFAD } from './pfade';

/**
 * Lebensmittel auf der Plattform (ERN-EPIC-002, ADR-027 Punkte 8 und 9):
 * nachschlagen im Katalog der Praxis und eigene Lebensmittel mit den Werten
 * von der Verpackung anlegen. Nur mit laufender Beratung; die Begleitung
 * sieht nichts (der Server gibt ihr nichts). Gesucht wird am eigenen Server,
 * nie bei einem fremden Dienst.
 */
const PFAD = `${PLATTFORM_PFAD}/ernaehrung/lebensmittel`;

function useErnaehrung(zugang: Plattformzugang) {
  return useQuery({
    queryKey: ernaehrungSchluessel(zugang.access_id),
    queryFn: () => ladeErnaehrung(zugang.access_id),
  });
}

export function Lebensmittel({ zugang }: { zugang: Plattformzugang }) {
  const { search } = useLocation();
  const abfrage = useErnaehrung(zugang);
  const darfAnlegen = Boolean(abfrage.data?.can_write);
  return (
    <>
      <Rueckweg standard={`${PLATTFORM_PFAD}/ernaehrung${search}`} beschriftung="Zur Ernährung" />
      <PageHeader title="Lebensmittel" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Wird geladen …"
        fehler="Ihre Ernährung konnte nicht geladen werden."
        inKarte
        leer={{ wenn: (daten) => !daten, titel: 'Zurzeit keine Ernährungsberatung.' }}
      >
        {(daten) => (
          <LebensmittelSuche
            suchen={(begriff) => lebensmittelSuchen(zugang.access_id, begriff)}
            schluessel={['platform-foods', zugang.access_id]}
            eigene={daten!.profile.own_foods}
            ohneBegriff={<EigeneListe daten={daten!} search={search} />}
            detailAktion={(f) =>
              f.kind === 'person' ? (
                <ButtonLink to={`${PFAD}/${f.id}${search}`} variant="secondary">
                  Bearbeiten
                </ButtonLink>
              ) : null
            }
          />
        )}
      </Abfragezustand>
      {/* Unter der Liste in voller Größe, nicht klein oben im Kopf (DESIGN.md,
          Seitentyp „Plattform“, wie „Termin wünschen“). */}
      {darfAnlegen ? (
        <div className="mt-6">
          <ButtonLink to={`${PFAD}/neu${search}`} groesse="normal" className="w-full sm:w-auto">
            Eigenes anlegen
          </ButtonLink>
        </div>
      ) : null}
      <Quellenangabe laden={lebensmittelQuellen} />
    </>
  );
}

function EigeneListe({ daten, search }: { daten: EigeneErnaehrung; search: string }) {
  return (
    <Listenabschnitt
      titel="Eigene Lebensmittel"
      anzahl={daten.profile.own_foods.length}
      leer={{ titel: 'Noch keine eigenen Lebensmittel.' }}
    >
      {daten.profile.own_foods.map((f) => (
        <Trefferzeile key={f.id} f={f} to={`${PFAD}/${f.id}${search}`} />
      ))}
    </Listenabschnitt>
  );
}

function useSpeichern(zugang: Plattformzugang, id: string | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { search } = useLocation();
  return useMutation({
    mutationFn: ({ angaben }: { angaben: LebensmittelAngaben; freigeben: () => void }) =>
      eigenesLebensmittelSpeichern(zugang.access_id, id, angaben),
    onSuccess: async (_leer, { freigeben }) => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: ernaehrungSchluessel(zugang.access_id) });
      void navigate(`${PFAD}${search}`, { replace: true });
    },
  });
}

/** `/p/ernaehrung/lebensmittel/neu` */
export function EigenesLebensmittelNeu({ zugang }: { zugang: Plattformzugang }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const speichern = useSpeichern(zugang, null);
  return (
    <>
      <Rueckweg standard={`${PFAD}${search}`} beschriftung="Zu den Lebensmitteln" />
      <PageHeader title="Eigenes Lebensmittel" />
      <LebensmittelFormular
        beschriftung="Eigenes Lebensmittel anlegen"
        anfang={leereLebensmittelWerte()}
        speichernText="Anlegen"
        laeuft={speichern.isPending}
        fehlermeldung={speichern.error?.message}
        onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
        onAbbrechen={() => void navigate(`${PFAD}${search}`)}
      />
    </>
  );
}

/** `/p/ernaehrung/lebensmittel/:foodId` */
export function EigenesLebensmittelAendern({ zugang }: { zugang: Plattformzugang }) {
  const { foodId } = useParams<{ foodId: string }>();
  const { search } = useLocation();
  const abfrage = useErnaehrung(zugang);
  return (
    <>
      <Rueckweg standard={`${PFAD}${search}`} beschriftung="Zu den Lebensmitteln" />
      <PageHeader title="Eigenes Lebensmittel" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Wird geladen …"
        fehler="Das Lebensmittel konnte nicht geladen werden."
        inKarte
        leer={{
          wenn: (daten) => !daten?.profile.own_foods.some((f) => f.id === foodId),
          titel: 'Dieses Lebensmittel gibt es nicht mehr.',
        }}
      >
        {(daten) => (
          <Aendern
            zugang={zugang}
            daten={daten!}
            f={daten!.profile.own_foods.find((f) => f.id === foodId)!}
          />
        )}
      </Abfragezustand>
    </>
  );
}

function Aendern({
  zugang,
  daten,
  f,
}: {
  zugang: Plattformzugang;
  daten: EigeneErnaehrung;
  f: Eintrag;
}) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const queryClient = useQueryClient();
  const speichern = useSpeichern(zugang, f.id);
  const loeschen = useMutation({
    mutationFn: () => eigenesLebensmittelLoeschen(zugang.access_id, f.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ernaehrungSchluessel(zugang.access_id) });
      void navigate(`${PFAD}${search}`, { replace: true });
    },
  });
  // Löschen geht auch nach einem Widerruf; ändern nur mit Einwilligung.
  const loeschenKnopf = (
    <Rueckfrage
      ausloeser="Löschen"
      ausloeserVariante="quiet"
      bestaetigen="Löschen"
      bestaetigenLaeuft="Wird gelöscht …"
      fehler={loeschen.error?.message}
      onBestaetigen={() => loeschen.mutateAsync()}
    >
      <p>„{f.name}“ wird gelöscht.</p>
    </Rueckfrage>
  );
  if (!daten.can_write) return <div className="max-w-formular">{loeschenKnopf}</div>;
  return (
    <LebensmittelFormular
      beschriftung="Eigenes Lebensmittel ändern"
      anfang={lebensmittelWerteAus(f)}
      speichernText="Speichern"
      laeuft={speichern.isPending}
      fehlermeldung={speichern.error?.message}
      onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
      onAbbrechen={() => void navigate(`${PFAD}${search}`)}
      unten={loeschenKnopf}
    />
  );
}

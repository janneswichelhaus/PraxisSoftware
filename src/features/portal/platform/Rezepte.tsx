import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { RezeptFormular } from '@/features/nutrition/RezeptFormular';
import {
  leereRezeptWerte,
  rezeptMeta,
  rezeptWerteAus,
  type Rezept,
  type RezeptAngaben,
} from '@/features/nutrition/rezepte';
import {
  eigenesRezeptLoeschen,
  eigenesRezeptSpeichern,
  ernaehrungSchluessel,
  ladeErnaehrung,
  lebensmittelSuchen,
  type EigeneErnaehrung,
  type Plattformzugang,
} from './api';
import { Unterseitenzustand } from './Ernaehrungsteile';
import { PLATTFORM_PFAD } from './pfade';

/**
 * Rezepte auf der Plattform (ADR-027 Punkt 9): eigene aus Zutaten des Katalogs, der Praxis und den
 * eigenen Lebensmitteln; die Werte rechnet der Server. Die Begleitung sieht nichts.
 */
export const REZEPTE_PFAD = `${PLATTFORM_PFAD}/ernaehrung/rezepte`;

function useErnaehrung(zugang: Plattformzugang) {
  return useQuery({
    queryKey: ernaehrungSchluessel(zugang.access_id),
    queryFn: () => ladeErnaehrung(zugang.access_id),
  });
}

const OHNE_BERATUNG = {
  titel: 'Zurzeit keine Ernährungsberatung',
  beschreibung: 'Vereinbaren Sie eine Ernährungsberatung mit Ihrer Praxis, finden Sie sie hier.',
} as const;

export function Rezepte({ zugang }: { zugang: Plattformzugang }) {
  const { search } = useLocation();
  const abfrage = useErnaehrung(zugang);
  const darfAnlegen = Boolean(abfrage.data?.can_write);
  return (
    <>
      <Rueckweg standard={`${PLATTFORM_PFAD}/ernaehrung${search}`} beschriftung="Zur Ernährung" />
      <PageHeader title="Rezepte" />
      <Unterseitenzustand
        abfrage={abfrage}
        beschriftung="Ihre Rezepte werden geladen"
        fehler="Ihre Rezepte konnten nicht geladen werden."
        leer={{ wenn: (daten) => !daten, ...OHNE_BERATUNG }}
      >
        {(daten) => (
          <Listenabschnitt
            titel="Eigene Rezepte"
            anzahl={daten!.profile.own_recipes.length}
            leer={{ titel: 'Noch keine eigenen Rezepte.' }}
          >
            {daten!.profile.own_recipes.map((r) => (
              <ListRow
                key={r.id}
                titel={r.name}
                meta={rezeptMeta(r)}
                to={`${REZEPTE_PFAD}/${r.id}${search}`}
              />
            ))}
          </Listenabschnitt>
        )}
      </Unterseitenzustand>
      {/* Unter der Liste in voller Größe wie „Eigenes anlegen“ bei den Lebensmitteln. */}
      {darfAnlegen ? (
        <div className="mt-6">
          <ButtonLink
            to={`${REZEPTE_PFAD}/neu${search}`}
            groesse="normal"
            className="w-full sm:w-auto"
          >
            Rezept anlegen
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}

function useSpeichern(zugang: Plattformzugang, id: string | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { search } = useLocation();
  return useMutation({
    mutationFn: ({ angaben }: { angaben: RezeptAngaben; freigeben: () => void }) =>
      eigenesRezeptSpeichern(zugang.access_id, id, angaben),
    onSuccess: async (_leer, { freigeben }) => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: ernaehrungSchluessel(zugang.access_id) });
      void navigate(`${REZEPTE_PFAD}${search}`, { replace: true });
    },
  });
}

function formularWege(zugang: Plattformzugang, daten: EigeneErnaehrung) {
  return {
    suchen: (begriff: string) => lebensmittelSuchen(zugang.access_id, begriff),
    schluessel: ['platform-foods', zugang.access_id, 'rezept'] as const,
    eigene: daten.profile.own_foods,
  };
}

/** `/p/ernaehrung/rezepte/neu` */
export function EigenesRezeptNeu({ zugang }: { zugang: Plattformzugang }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const abfrage = useErnaehrung(zugang);
  const speichern = useSpeichern(zugang, null);
  return (
    <>
      <Rueckweg standard={`${REZEPTE_PFAD}${search}`} beschriftung="Zu den Rezepten" />
      <PageHeader title="Eigenes Rezept" />
      <Unterseitenzustand
        abfrage={abfrage}
        beschriftung="Das Rezept wird vorbereitet"
        fehler="Ihre Ernährung konnte nicht geladen werden."
        leer={{ wenn: (daten) => !daten, ...OHNE_BERATUNG }}
      >
        {(daten) => (
          <RezeptFormular
            beschriftung="Eigenes Rezept anlegen"
            anfang={leereRezeptWerte()}
            speichernText="Anlegen"
            laeuft={speichern.isPending}
            fehlermeldung={speichern.error?.message}
            onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
            onAbbrechen={() => void navigate(`${REZEPTE_PFAD}${search}`)}
            plattform
            {...formularWege(zugang, daten!)}
          />
        )}
      </Unterseitenzustand>
    </>
  );
}

/** `/p/ernaehrung/rezepte/:recipeId` */
export function EigenesRezeptAendern({ zugang }: { zugang: Plattformzugang }) {
  const { recipeId } = useParams<{ recipeId: string }>();
  const { search } = useLocation();
  const abfrage = useErnaehrung(zugang);
  return (
    <>
      <Rueckweg standard={`${REZEPTE_PFAD}${search}`} beschriftung="Zu den Rezepten" />
      <PageHeader title="Eigenes Rezept" />
      <Unterseitenzustand
        abfrage={abfrage}
        beschriftung="Das Rezept wird geladen"
        fehler="Das Rezept konnte nicht geladen werden."
        leer={{
          wenn: (daten) => !daten?.profile.own_recipes.some((r) => r.id === recipeId),
          titel: 'Dieses Rezept gibt es nicht mehr.',
        }}
      >
        {(daten) => (
          <Aendern
            zugang={zugang}
            daten={daten!}
            r={daten!.profile.own_recipes.find((r) => r.id === recipeId)!}
          />
        )}
      </Unterseitenzustand>
    </>
  );
}

function Aendern({
  zugang,
  daten,
  r,
}: {
  zugang: Plattformzugang;
  daten: EigeneErnaehrung;
  r: Rezept;
}) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const queryClient = useQueryClient();
  const speichern = useSpeichern(zugang, r.id);
  const loeschen = useMutation({
    mutationFn: () => eigenesRezeptLoeschen(zugang.access_id, r.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ernaehrungSchluessel(zugang.access_id) });
      void navigate(`${REZEPTE_PFAD}${search}`, { replace: true });
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
      <p>Einträge im Tagebuch bleiben stehen.</p>
    </Rueckfrage>
  );
  if (!daten.can_write) return <div className="max-w-formular mt-6">{loeschenKnopf}</div>;
  return (
    <RezeptFormular
      beschriftung="Eigenes Rezept ändern"
      anfang={rezeptWerteAus(r)}
      speichernText="Speichern"
      laeuft={speichern.isPending}
      fehlermeldung={speichern.error?.message}
      onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
      onAbbrechen={() => void navigate(`${REZEPTE_PFAD}${search}`)}
      unten={loeschenKnopf}
      plattform
      {...formularWege(zugang, daten)}
    />
  );
}

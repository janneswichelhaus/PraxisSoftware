import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { lebensmittelSuchen } from './lebensmittelApi';
import { RezeptFormular } from './RezeptFormular';
import {
  leereRezeptWerte,
  rezeptMeta,
  rezeptWerteAus,
  type Rezept,
  type RezeptAngaben,
} from './rezepte';
import {
  praxisRezeptAblegen,
  praxisRezepte,
  praxisRezeptSpeichern,
  REZEPTE_SCHLUESSEL,
} from './rezepteApi';

/**
 * Rezepte der Praxis in der Bibliothek, allein mit der Fähigkeit „Ernährungsberatung“ (ADR-027
 * Punkte 4 und 14); verbindlich prüft der Server. Personen sehen eines erst in einem Plan.
 */
export const REZEPTE_PFAD = '/praxis/rezepte';

export function RezeptePage() {
  const abfrage = useQuery({ queryKey: REZEPTE_SCHLUESSEL, queryFn: praxisRezepte });
  return (
    <>
      <PageHeader
        title="Rezepte"
        actions={<ButtonLink to={`${REZEPTE_PFAD}/neu`}>Anlegen</ButtonLink>}
      />
      <Abfragezustand
        abfrage={abfrage}
        laden="Die Rezepte werden geladen …"
        fehler="Die Rezepte konnten nicht geladen werden."
        inKarte
      >
        {(liste) => (
          <Listenabschnitt
            titel="Rezepte der Praxis"
            anzahl={liste.length}
            leer={{
              titel: 'Noch keine Rezepte.',
              aktion: (
                <ButtonLink to={`${REZEPTE_PFAD}/neu`} variant="secondary">
                  Anlegen
                </ButtonLink>
              ),
            }}
          >
            {liste.map((r) => (
              <ListRow
                key={r.id}
                titel={r.name}
                meta={rezeptMeta(r)}
                to={`${REZEPTE_PFAD}/${r.id}`}
              />
            ))}
          </Listenabschnitt>
        )}
      </Abfragezustand>
    </>
  );
}

function useSpeichern(id: string | null, stand: string | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ angaben }: { angaben: RezeptAngaben; freigeben: () => void }) =>
      praxisRezeptSpeichern(id, angaben, stand),
    onSuccess: async (_id, { freigeben }) => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: REZEPTE_SCHLUESSEL });
      void navigate(REZEPTE_PFAD, { replace: true });
    },
  });
}

/** `/praxis/rezepte/neu` */
export function PraxisRezeptNeu() {
  const navigate = useNavigate();
  const speichern = useSpeichern(null, null);
  return (
    <>
      <Rueckweg standard={REZEPTE_PFAD} beschriftung="Zu den Rezepten" className="mb-3" />
      <PageHeader title="Rezept anlegen" />
      <RezeptFormular
        beschriftung="Rezept anlegen"
        anfang={leereRezeptWerte()}
        speichernText="Anlegen"
        laeuft={speichern.isPending}
        fehlermeldung={speichern.error?.message}
        onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
        onAbbrechen={() => void navigate(REZEPTE_PFAD)}
        suchen={lebensmittelSuchen}
        schluessel={['lebensmittel', 'rezept']}
      />
    </>
  );
}

/** `/praxis/rezepte/:recipeId` */
export function PraxisRezeptBearbeiten() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const abfrage = useQuery({ queryKey: REZEPTE_SCHLUESSEL, queryFn: praxisRezepte });
  return (
    <>
      <Rueckweg standard={REZEPTE_PFAD} beschriftung="Zu den Rezepten" className="mb-3" />
      <PageHeader title="Rezept ändern" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Das Rezept wird geladen …"
        fehler="Das Rezept konnte nicht geladen werden."
        inKarte
        leer={{
          wenn: (liste) => !liste.some((r) => r.id === recipeId),
          titel: 'Dieses Rezept gibt es nicht mehr.',
        }}
      >
        {(liste) => <Bearbeiten r={liste.find((r) => r.id === recipeId)!} />}
      </Abfragezustand>
    </>
  );
}

function Bearbeiten({ r }: { r: Rezept }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const speichern = useSpeichern(r.id, r.updated_at);
  const ablegen = useMutation({
    mutationFn: () => praxisRezeptAblegen(r.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: REZEPTE_SCHLUESSEL });
      void navigate(REZEPTE_PFAD, { replace: true });
    },
  });
  return (
    <RezeptFormular
      beschriftung="Rezept ändern"
      anfang={rezeptWerteAus(r)}
      speichernText="Speichern"
      laeuft={speichern.isPending}
      fehlermeldung={speichern.error?.message}
      onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
      onAbbrechen={() => void navigate(REZEPTE_PFAD)}
      suchen={lebensmittelSuchen}
      schluessel={['lebensmittel', 'rezept']}
      unten={
        <Rueckfrage
          ausloeser="Ablegen"
          ausloeserVariante="quiet"
          bestaetigen="Ablegen"
          bestaetigenLaeuft="Wird abgelegt …"
          fehler={ablegen.error?.message}
          onBestaetigen={() => ablegen.mutateAsync()}
        >
          <p>Es verschwindet aus Liste und Auswahl; bestehende Pläne behalten es.</p>
        </Rueckfrage>
      }
    />
  );
}

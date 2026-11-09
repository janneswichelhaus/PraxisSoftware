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
import { PlanFormular } from './PlanFormular';
import { entwurfAus, leererPlan, tageText, type Plan, type PlanAngaben } from './plaene';
import {
  planvorlageAblegen,
  planvorlagen,
  planvorlageSpeichern,
  PLANVORLAGEN_SCHLUESSEL,
} from './plaeneApi';
import { praxisRezepte, REZEPTE_SCHLUESSEL, useMitgeliefert } from './rezepteApi';

/**
 * Planvorlagen der Praxis in der Bibliothek (ADR-027 Punkt 14), allein mit der Fähigkeit
 * „Ernährungsberatung“; nach Titel, nie nach einer Person oder Diagnose.
 */
export const PLANVORLAGEN_PFAD = '/praxis/ernaehrungsplaene';

export function PlanvorlagenPage() {
  const abfrage = useQuery({ queryKey: PLANVORLAGEN_SCHLUESSEL, queryFn: planvorlagen });
  return (
    <>
      <PageHeader
        title="Ernährungspläne"
        actions={<ButtonLink to={`${PLANVORLAGEN_PFAD}/neu`}>Anlegen</ButtonLink>}
      />
      <Abfragezustand
        abfrage={abfrage}
        laden="Vorlagen werden geladen …"
        fehler="Vorlagen nicht geladen."
        inKarte
      >
        {(liste) => (
          <Listenabschnitt
            titel="Vorlagen der Praxis"
            anzahl={liste.length}
            leer={{
              titel: 'Noch keine Vorlagen.',
              aktion: (
                <ButtonLink to={`${PLANVORLAGEN_PFAD}/neu`} variant="secondary">
                  Anlegen
                </ButtonLink>
              ),
            }}
          >
            {liste.map((p) => (
              <ListRow
                key={p.id}
                titel={p.title}
                meta={tageText(p.day_count)}
                to={`${PLANVORLAGEN_PFAD}/${p.id}`}
              />
            ))}
          </Listenabschnitt>
        )}
      </Abfragezustand>
    </>
  );
}

/** Die Rezepte der Praxis zur Wahl im Plan. */
function useRezepteZurWahl() {
  return useQuery({ queryKey: REZEPTE_SCHLUESSEL, queryFn: praxisRezepte });
}

function useSpeichern(id: string | null, stand: string | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ angaben }: { angaben: PlanAngaben; freigeben: () => void }) =>
      planvorlageSpeichern(id, angaben, stand),
    onSuccess: async (_id, { freigeben }) => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: PLANVORLAGEN_SCHLUESSEL });
      void navigate(PLANVORLAGEN_PFAD, { replace: true });
    },
  });
}

/** `/praxis/ernaehrungsplaene/neu` */
export function PlanvorlageNeu() {
  const navigate = useNavigate();
  const speichern = useSpeichern(null, null);
  const rezepte = useRezepteZurWahl();
  const mitgeliefert = useMitgeliefert();
  return (
    <>
      <Rueckweg standard={PLANVORLAGEN_PFAD} beschriftung="Zu den Plänen" className="mb-3" />
      <PageHeader title="Vorlage anlegen" />
      <Abfragezustand
        abfrage={rezepte}
        laden="Rezepte werden geladen …"
        fehler="Rezepte nicht geladen."
        inKarte
      >
        {(liste) => (
          <PlanFormular
            mitgeliefert={mitgeliefert}
            beschriftung="Vorlage anlegen"
            anfang={leererPlan()}
            speichernText="Anlegen"
            laeuft={speichern.isPending}
            fehlermeldung={speichern.error?.message}
            onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
            onAbbrechen={() => void navigate(PLANVORLAGEN_PFAD)}
            rezepte={liste}
            suchen={lebensmittelSuchen}
            schluessel={['lebensmittel', 'plan']}
          />
        )}
      </Abfragezustand>
    </>
  );
}

/** `/praxis/ernaehrungsplaene/:planId` */
export function PlanvorlageBearbeiten() {
  const { planId } = useParams<{ planId: string }>();
  const vorlagen = useQuery({ queryKey: PLANVORLAGEN_SCHLUESSEL, queryFn: planvorlagen });
  const rezepte = useRezepteZurWahl();
  return (
    <>
      <Rueckweg standard={PLANVORLAGEN_PFAD} beschriftung="Zu den Plänen" className="mb-3" />
      <PageHeader title="Vorlage ändern" />
      <Abfragezustand
        abfrage={vorlagen}
        laden="Vorlage wird geladen …"
        fehler="Vorlage nicht geladen."
        inKarte
        leer={{
          wenn: (liste) => !liste.some((p) => p.id === planId),
          titel: 'Vorlage nicht gefunden.',
        }}
      >
        {(liste) => (
          <Abfragezustand
            abfrage={rezepte}
            laden="Rezepte werden geladen …"
            fehler="Rezepte nicht geladen."
            inKarte
          >
            {(zurWahl) => (
              <Bearbeiten vorlage={liste.find((p) => p.id === planId)!} rezepte={zurWahl} />
            )}
          </Abfragezustand>
        )}
      </Abfragezustand>
    </>
  );
}

function Bearbeiten({
  vorlage,
  rezepte,
}: {
  vorlage: Plan;
  rezepte: Awaited<ReturnType<typeof praxisRezepte>>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const speichern = useSpeichern(vorlage.id, vorlage.updated_at);
  const mitgeliefert = useMitgeliefert();
  const ablegen = useMutation({
    mutationFn: () => planvorlageAblegen(vorlage.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLANVORLAGEN_SCHLUESSEL });
      void navigate(PLANVORLAGEN_PFAD, { replace: true });
    },
  });
  return (
    <PlanFormular
      mitgeliefert={mitgeliefert}
      beschriftung="Vorlage ändern"
      anfang={entwurfAus(vorlage)}
      speichernText="Speichern"
      laeuft={speichern.isPending}
      fehlermeldung={speichern.error?.message}
      onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
      onAbbrechen={() => void navigate(PLANVORLAGEN_PFAD)}
      rezepte={rezepte}
      suchen={lebensmittelSuchen}
      schluessel={['lebensmittel', 'plan']}
      unten={
        <Rueckfrage
          ausloeser="Ablegen"
          ausloeserVariante="quiet"
          bestaetigen="Ablegen"
          bestaetigenLaeuft="Wird abgelegt …"
          fehler={ablegen.error?.message}
          onBestaetigen={() => ablegen.mutateAsync()}
        >
          <p>Verschwindet aus der Auswahl.</p>
        </Rueckfrage>
      }
    />
  );
}

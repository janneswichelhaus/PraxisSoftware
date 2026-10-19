import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { LebensmittelFormular } from './LebensmittelFormular';
import { LebensmittelSuche, Quellenangabe, Trefferzeile } from './LebensmittelSuche';
import {
  leereLebensmittelWerte,
  lebensmittelWerteAus,
  type Lebensmittel,
  type LebensmittelAngaben,
} from './lebensmittel';
import {
  LEBENSMITTEL_SCHLUESSEL,
  lebensmittelQuellen,
  lebensmittelSuchen,
  praxisLebensmittel,
  praxisLebensmittelAblegen,
  praxisLebensmittelSpeichern,
} from './lebensmittelApi';

/**
 * Lebensmittel in der Bibliothek (ERN-EPIC-002): nachschlagen im eigenen
 * Katalog (BLS 4.0, Open Food Facts) und die Lebensmittel der Praxis pflegen.
 * Allein die Fähigkeit „Ernährungsberatung“ (owner) - die Navigation zeigt
 * die Seite niemandem sonst, verbindlich prüft der Server.
 */
const PFAD = '/praxis/lebensmittel';
const PRAXIS_SCHLUESSEL = [...LEBENSMITTEL_SCHLUESSEL, 'praxis'] as const;

export function LebensmittelPage() {
  return (
    <>
      <PageHeader
        title="Lebensmittel"
        actions={<ButtonLink to={`${PFAD}/neu`}>Anlegen</ButtonLink>}
      />
      <LebensmittelSuche
        suchen={lebensmittelSuchen}
        schluessel={LEBENSMITTEL_SCHLUESSEL}
        ohneBegriff={<PraxisListe />}
        detailAktion={(f) =>
          f.kind === 'practice' ? (
            <ButtonLink to={`${PFAD}/${f.id}`} variant="secondary">
              Bearbeiten
            </ButtonLink>
          ) : null
        }
      />
      <Quellenangabe laden={lebensmittelQuellen} />
    </>
  );
}

function usePraxisLebensmittel() {
  return useQuery({ queryKey: PRAXIS_SCHLUESSEL, queryFn: praxisLebensmittel });
}

function PraxisListe() {
  const abfrage = usePraxisLebensmittel();
  return (
    <Abfragezustand
      abfrage={abfrage}
      laden="Die Lebensmittel werden geladen …"
      fehler="Die Lebensmittel konnten nicht geladen werden."
      inKarte
    >
      {(liste) => (
        <Listenabschnitt
          titel="Lebensmittel der Praxis"
          anzahl={liste.length}
          leer={{
            titel: 'Noch keine eigenen Lebensmittel.',
            aktion: (
              <ButtonLink to={`${PFAD}/neu`} variant="secondary">
                Anlegen
              </ButtonLink>
            ),
          }}
        >
          {liste.map((f) => (
            <Trefferzeile key={f.id} f={f} to={`${PFAD}/${f.id}`} />
          ))}
        </Listenabschnitt>
      )}
    </Abfragezustand>
  );
}

function useSpeichern(id: string | null, stand: string | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ angaben }: { angaben: LebensmittelAngaben; freigeben: () => void }) =>
      praxisLebensmittelSpeichern(id, angaben, stand),
    onSuccess: async (_id, { freigeben }) => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: LEBENSMITTEL_SCHLUESSEL });
      void navigate(PFAD, { replace: true });
    },
  });
}

/** `/praxis/lebensmittel/neu` */
export function PraxisLebensmittelNeu() {
  const navigate = useNavigate();
  const speichern = useSpeichern(null, null);
  return (
    <>
      <Rueckweg standard={PFAD} beschriftung="Zu den Lebensmitteln" className="mb-3" />
      <PageHeader title="Lebensmittel anlegen" />
      <LebensmittelFormular
        beschriftung="Lebensmittel anlegen"
        anfang={leereLebensmittelWerte()}
        speichernText="Anlegen"
        laeuft={speichern.isPending}
        fehlermeldung={speichern.error?.message}
        onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
        onAbbrechen={() => void navigate(PFAD)}
      />
    </>
  );
}

/** `/praxis/lebensmittel/:foodId` */
export function PraxisLebensmittelBearbeiten() {
  const { foodId } = useParams<{ foodId: string }>();
  const abfrage = usePraxisLebensmittel();
  return (
    <>
      <Rueckweg standard={PFAD} beschriftung="Zu den Lebensmitteln" className="mb-3" />
      <PageHeader title="Lebensmittel ändern" />
      <div className="max-w-formular">
        <Abfragezustand
          abfrage={abfrage}
          laden="Das Lebensmittel wird geladen …"
          fehler="Das Lebensmittel konnte nicht geladen werden."
          inKarte
          leer={{
            wenn: (liste) => !liste.some((f) => f.id === foodId),
            titel: 'Dieses Lebensmittel gibt es nicht mehr.',
          }}
        >
          {(liste) => <Bearbeiten f={liste.find((f) => f.id === foodId)!} />}
        </Abfragezustand>
      </div>
    </>
  );
}

function Bearbeiten({ f }: { f: Lebensmittel }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const speichern = useSpeichern(f.id, f.updated_at ?? null);
  const ablegen = useMutation({
    mutationFn: () => praxisLebensmittelAblegen(f.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: LEBENSMITTEL_SCHLUESSEL });
      void navigate(PFAD, { replace: true });
    },
  });
  return (
    <LebensmittelFormular
      beschriftung="Lebensmittel ändern"
      anfang={lebensmittelWerteAus(f)}
      speichernText="Speichern"
      laeuft={speichern.isPending}
      fehlermeldung={speichern.error?.message}
      onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
      onAbbrechen={() => void navigate(PFAD)}
      unten={
        <Rueckfrage
          ausloeser="Ablegen"
          ausloeserVariante="quiet"
          bestaetigen="Ablegen"
          bestaetigenLaeuft="Wird abgelegt …"
          fehler={ablegen.error?.message}
          onBestaetigen={() => ablegen.mutateAsync()}
        >
          <p>Es verschwindet aus Suche und Liste.</p>
        </Rueckfrage>
      }
    />
  );
}

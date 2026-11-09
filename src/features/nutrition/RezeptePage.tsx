import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { lebensmittelSuchen } from './lebensmittelApi';
import { RezeptFormular } from './RezeptFormular';
import {
  leereRezeptWerte,
  portionenText,
  rezeptMeta,
  rezeptWerteAus,
  startrezeptAufloesen,
  type Rezept,
  type RezeptAngaben,
} from './rezepte';
import {
  praxisRezeptAblegen,
  praxisRezepte,
  praxisRezeptSpeichern,
  REZEPTE_SCHLUESSEL,
} from './rezepteApi';
import { STARTREZEPTE, type Startrezept } from './startrezepte';

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
        laden="Rezepte werden geladen …"
        fehler="Rezepte nicht geladen."
        inKarte
      >
        {(liste) => (
          <>
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
            <Mitgeliefert uebernommen={new Set(liste.map((r) => r.starter_key))} />
          </>
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
        laden="Rezept wird geladen …"
        fehler="Rezept nicht geladen."
        inKarte
        leer={{
          wenn: (liste) => !liste.some((r) => r.id === recipeId),
          titel: 'Rezept nicht gefunden.',
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
          <p>Verschwindet aus der Auswahl.</p>
        </Rueckfrage>
      }
    />
  );
}

/** Die mitgelieferten Rezepte, die die Praxis noch nicht übernommen hat. */
function Mitgeliefert({ uebernommen }: { uebernommen: ReadonlySet<string | null> }) {
  const offen = STARTREZEPTE.filter((r) => !uebernommen.has(r.schluessel));
  if (offen.length === 0) return null;
  return (
    <div className="mt-8">
      <Disclosure summary="Mitgelieferte Rezepte" anzahl={offen.length} kopf="label">
        <ListRows beschriftung="Mitgelieferte Rezepte">
          {offen.map((r) => (
            <ListRow
              key={r.schluessel}
              titel={r.name}
              meta={`${portionenText(r.portionen)} · ${zutatenText(r.zutaten.length)}`}
              to={`${REZEPTE_PFAD}/mitgeliefert/${r.schluessel}`}
            />
          ))}
        </ListRows>
      </Disclosure>
    </div>
  );
}

function zutatenText(n: number): string {
  return n === 1 ? '1 Zutat' : `${n} Zutaten`;
}

/** `/praxis/rezepte/mitgeliefert/:starterKey`: prüfen und übernehmen, die Werte aus dem Katalog. */
export function MitgeliefertesRezept() {
  const { starterKey } = useParams<{ starterKey: string }>();
  const start = STARTREZEPTE.find((r) => r.schluessel === starterKey);
  return (
    <>
      <Rueckweg standard={REZEPTE_PFAD} beschriftung="Zu den Rezepten" className="mb-3" />
      <PageHeader title="Rezept übernehmen" />
      {start ? (
        <Uebernehmen start={start} />
      ) : (
        <EmptyState inKarte title="Nicht mehr mitgeliefert." />
      )}
    </>
  );
}

function Uebernehmen({ start }: { start: Startrezept }) {
  const navigate = useNavigate();
  const speichern = useSpeichern(null, null);
  const aufgeloest = useQuery({
    queryKey: [...REZEPTE_SCHLUESSEL, 'mitgeliefert', start.schluessel],
    queryFn: () => startrezeptAufloesen(start, lebensmittelSuchen),
    staleTime: Infinity,
  });
  return (
    <Abfragezustand
      abfrage={aufgeloest}
      laden="Zutaten werden gesucht …"
      fehler="Zutatensuche fehlgeschlagen."
      inKarte
    >
      {({ werte, fehlt }) => (
        <>
          {fehlt.length > 0 ? (
            <Statusmeldung ton="warnung" className="max-w-formular mb-6">
              Nicht im Katalog gefunden: {fehlt.join(', ')}.
            </Statusmeldung>
          ) : null}
          <RezeptFormular
            beschriftung="Rezept übernehmen"
            anfang={werte}
            speichernText="Übernehmen"
            laeuft={speichern.isPending}
            fehlermeldung={speichern.error?.message}
            onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
            onAbbrechen={() => void navigate(REZEPTE_PFAD)}
            suchen={lebensmittelSuchen}
            schluessel={['lebensmittel', 'rezept']}
            zusatz={{ starter_key: start.schluessel }}
          />
        </>
      )}
    </Abfragezustand>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { isOwner, type CurrentUser } from '@/features/session/types';
import {
  KANAELE_KEY,
  NACHSEHEN_MS,
  TEAMCHAT_KEY,
  archiviereKanal,
  fetchKanaele,
  fetchNachrichten,
  kanalTitel,
  nachrichtenKey,
  type Kanal,
  type Nachricht,
} from './api';
import { Eingabe } from './Eingabe';
import { gesperrtSatz, useGelesen } from './gespraech';
import { Nachrichtenliste } from './Nachrichtenliste';
import { threadPfad } from './pfade';

/** Ohne Ältere so viele Ausgangsnachrichten - die Grenze des Servers. */
const SEITE = 50;

/**
 * Ein Gespräch im Teamchat (TEAM-001): die Ausgangsnachrichten, darunter je
 * „Antworten“, unten die Eingabe in der klebenden Leiste (Seitentyp
 * Arbeitsseite). Öffnen markiert als gelesen - nur für die Person selbst
 * (ANN-609). Archivieren steht leise am Ende, nur für owner und Teamleitung.
 */
export function GespraechPage({ user }: { user: CurrentUser }) {
  const { kanalId = '' } = useParams();
  const kanaele = useQuery({ queryKey: KANAELE_KEY, queryFn: fetchKanaele });
  const kanal = kanaele.data?.find((k) => k.id === kanalId);

  return (
    <>
      <Rueckweg standard="/team" beschriftung="Zurück zum Teamchat" />
      <Abfragezustand
        abfrage={kanaele}
        laden="Gespräch wird geladen …"
        fehler="Das Gespräch konnte nicht geladen werden."
      >
        {() =>
          kanal ? (
            <Gespraech user={user} kanal={kanal} />
          ) : (
            <EmptyState
              title="Dieses Gespräch gibt es nicht"
              description="Vielleicht ist es gelöscht, oder du gehörst nicht dazu."
            />
          )
        }
      </Abfragezustand>
    </>
  );
}

function Gespraech({ user, kanal }: { user: CurrentUser; kanal: Kanal }) {
  const [suche] = useSearchParams();
  const [aeltere, setAeltere] = useState<Nachricht[]>([]);
  const [keineAelteren, setKeineAelteren] = useState(false);
  const nachrichten = useQuery({
    queryKey: nachrichtenKey(kanal.id),
    queryFn: () => fetchNachrichten(kanal.id),
    refetchInterval: NACHSEHEN_MS,
  });
  useGelesen(kanal, nachrichten.data);

  // Beim ersten Laden ans Ende: Die neueste Nachricht steht über der Eingabe.
  const ende = useRef<HTMLDivElement>(null);
  const gerollt = useRef(false);
  useEffect(() => {
    if (nachrichten.data && !gerollt.current) {
      gerollt.current = true;
      ende.current?.scrollIntoView?.({ block: 'end' });
    }
  }, [nachrichten.data]);

  const nachladen = useMutation({
    mutationFn: () => {
      const aelteste = aeltere[0] ?? nachrichten.data?.[0];
      return fetchNachrichten(kanal.id, null, aelteste?.created_at ?? null);
    },
    onSuccess: (neu) => {
      setAeltere([...neu, ...aeltere]);
      if (neu.length < SEITE) setKeineAelteren(true);
    },
  });

  const darfVerwalten =
    kanal.kind === 'channel' && user.roles.some((r) => r === 'owner' || r === 'team_lead');
  const gesperrt = gesperrtSatz(kanal);

  return (
    <>
      <div className="max-w-spalte">
        <PageHeader title={kanalTitel(kanal)} description={kanal.description ?? undefined} />
        <Abfragezustand
          abfrage={nachrichten}
          laden="Nachrichten werden geladen …"
          fehler="Die Nachrichten konnten nicht geladen werden."
          leer={{
            wenn: (daten) => daten.length === 0,
            titel: 'Noch keine Nachricht',
          }}
        >
          {(daten) => (
            <>
              {daten.length + aeltere.length >= SEITE && !keineAelteren ? (
                <Button
                  variant="quiet"
                  groesse="kompakt"
                  disabled={nachladen.isPending}
                  onClick={() => nachladen.mutate()}
                >
                  {nachladen.isPending ? 'Ältere werden geladen …' : 'Ältere Nachrichten'}
                </Button>
              ) : null}
              <Nachrichtenliste
                nachrichten={[...aeltere, ...daten]}
                zeitzone={user.organizationTimeZone ?? 'Europe/Berlin'}
                eigeneId={user.staffMemberId ?? null}
                threadPfad={(n) => threadPfad(kanal.id, n.id)}
                darfEntfernen={kanal.kind === 'channel' && isOwner(user.roles)}
                hervorheben={suche.get('nachricht')}
                gesperrt={gesperrt !== null}
              />
            </>
          )}
        </Abfragezustand>
        <div ref={ende} />
        {darfVerwalten ? <Archivieren kanal={kanal} /> : null}
      </div>
      <Eingabe
        kanalId={kanal.id}
        beschriftung={`Nachricht an ${kanalTitel(kanal)}`}
        gesperrt={gesperrt}
      />
    </>
  );
}

function Archivieren({ kanal }: { kanal: Kanal }) {
  const queryClient = useQueryClient();
  const umschalten = useMutation({
    mutationFn: () => archiviereKanal(kanal.id, !kanal.archived),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY }),
  });
  if (kanal.name === 'Allgemein') return null;
  // Wieder öffnen ist harmlos und braucht keine Rückfrage (Praxis-Review).
  if (kanal.archived) {
    return (
      <div className="mt-8 mb-4">
        <Button
          variant="quiet"
          groesse="kompakt"
          disabled={umschalten.isPending}
          onClick={() => umschalten.mutate()}
        >
          Wieder öffnen
        </Button>
        {umschalten.isError ? (
          <p role="alert" className="text-danger text-sm">
            {umschalten.error.message}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-8 mb-4">
      <Rueckfrage
        ausloeser="Kanal archivieren"
        ausloeserVariante="quiet"
        ausloeserGroesse="kompakt"
        bezeichnung="Kanal archivieren"
        bestaetigen="Ja, archivieren"
        bestaetigenLaeuft="Wird gespeichert …"
        fehler={umschalten.isError ? umschalten.error.message : undefined}
        onBestaetigen={() => umschalten.mutateAsync()}
      >
        Der Kanal bleibt lesbar, nimmt aber keine Nachrichten mehr an. Die Löschfrist läuft weiter.
      </Rueckfrage>
    </div>
  );
}

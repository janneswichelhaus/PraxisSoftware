import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { EmptyState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { isOwner, type CurrentUser } from '@/features/session/types';
import {
  KANAELE_KEY,
  NACHSEHEN_MS,
  fetchKanaele,
  fetchNachrichten,
  kanalTitel,
  nachrichtenKey,
  type Kanal,
} from './api';
import { Eingabe } from './Eingabe';
import { gesperrtSatz, useGelesen } from './gespraech';
import { Nachrichtenliste } from './Nachrichtenliste';
import { gespraechPfad } from './pfade';

/**
 * Ein Thread im Teamchat (TEAM-001): die Ausgangsnachricht oben, darunter die
 * Antworten, unten die Eingabe - zwei Tipps vom Kanal bis zur gesendeten
 * Antwort („Antworten“, „Senden“). Auch der Weg aus der Suche führt hierher;
 * `?nachricht=` hebt die gefundene Stelle hervor.
 */
export function ThreadPage({ user }: { user: CurrentUser }) {
  const { kanalId = '', threadId = '' } = useParams();
  const kanaele = useQuery({ queryKey: KANAELE_KEY, queryFn: fetchKanaele });
  const kanal = kanaele.data?.find((k) => k.id === kanalId);

  return (
    <>
      <Rueckweg
        standard={gespraechPfad(kanalId)}
        beschriftung={kanal ? `Zurück zu ${kanalTitel(kanal)}` : 'Zurück zum Gespräch'}
      />
      <Abfragezustand
        abfrage={kanaele}
        laden="Antworten werden geladen …"
        fehler="Die Antworten konnten nicht geladen werden."
      >
        {() =>
          kanal ? (
            <Thread user={user} kanal={kanal} threadId={threadId} />
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

function Thread({ user, kanal, threadId }: { user: CurrentUser; kanal: Kanal; threadId: string }) {
  const [suche] = useSearchParams();
  const hervorheben = suche.get('nachricht');
  const nachrichten = useQuery({
    queryKey: nachrichtenKey(kanal.id, threadId),
    queryFn: () => fetchNachrichten(kanal.id, threadId),
    refetchInterval: NACHSEHEN_MS,
  });
  useGelesen(kanal, nachrichten.data);

  useEffect(() => {
    if (hervorheben && nachrichten.data) {
      document.getElementById(`nachricht-${hervorheben}`)?.scrollIntoView?.({ block: 'center' });
    }
  }, [hervorheben, nachrichten.data]);

  const gesperrt = gesperrtSatz(kanal);
  return (
    <>
      <div className="max-w-spalte">
        <PageHeader title="Antworten" description={kanalTitel(kanal)} />
        <Abfragezustand
          abfrage={nachrichten}
          laden="Antworten werden geladen …"
          fehler="Die Antworten konnten nicht geladen werden."
        >
          {(daten) => (
            <Nachrichtenliste
              nachrichten={daten}
              zeitzone={user.organizationTimeZone ?? 'Europe/Berlin'}
              eigeneId={user.staffMemberId ?? null}
              darfEntfernen={kanal.kind === 'channel' && isOwner(user.roles)}
              hervorheben={hervorheben}
              gesperrt={gesperrt !== null}
            />
          )}
        </Abfragezustand>
      </div>
      <Eingabe kanalId={kanal.id} threadId={threadId} beschriftung="Antwort" gesperrt={gesperrt} />
    </>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { EmptyState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import type { CurrentUser } from '@/features/session/types';
import { KANAELE_KEY, fetchKanaele } from './api';
import { Gespraech } from './GespraechPage';
import { gespraechPfad } from './pfade';
import { Thread } from './ThreadPage';

/**
 * Radflotte → Nachrichten (ANN-613): das eine Gespräch der Flotte über Räder,
 * Schlüssel, Pannen und Wartung - mit derselben Mechanik wie der Teamchat
 * (TEAM-001), aber in der Radflotte statt als Kanal im Teamchat (Jannes
 * 2026-10-17). Lesen und schreiben, die die Flotte lesen; das prüft der
 * Server.
 */
export function FlottenNachrichtenPage({ user }: { user: CurrentUser }) {
  const { threadId } = useParams();
  const kanaele = useQuery({ queryKey: KANAELE_KEY, queryFn: fetchKanaele });
  const kanal = kanaele.data?.find((k) => k.kind === 'fleet');

  return (
    <>
      {threadId && kanal ? (
        <Rueckweg standard={gespraechPfad(kanal)} beschriftung="Zurück zu den Nachrichten" />
      ) : null}
      <Abfragezustand
        abfrage={kanaele}
        laden="Nachrichten werden geladen …"
        fehler="Die Nachrichten konnten nicht geladen werden."
      >
        {() =>
          kanal ? (
            threadId ? (
              <Thread user={user} kanal={kanal} threadId={threadId} />
            ) : (
              <Gespraech user={user} kanal={kanal} />
            )
          ) : (
            <EmptyState title="Für die Radflotte gibt es hier noch kein Gespräch" />
          )
        }
      </Abfragezustand>
    </>
  );
}

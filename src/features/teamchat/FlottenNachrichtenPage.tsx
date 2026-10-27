import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { EmptyState } from '@/components/ui/Feedback';
import type { CurrentUser } from '@/features/core';
import { GESPRAECHE_HALTEN_MS, KANAELE_KEY, NACHSEHEN_MS, fetchKanaele } from './api';
import { useChatflaeche, useSpalten } from './flaeche';
import { Gespraechsflaeche } from './Gespraechsflaeche';
import { Rand } from './Rand';

/**
 * Radflotte → Nachrichten (ANN-613): das eine Gespräch der Flotte über Räder,
 * Schlüssel, Pannen und Wartung - dieselbe Fläche wie im Teamchat (TEAM-002),
 * ohne die Liste der Gespräche. Lesen und schreiben, die die Flotte lesen; das
 * prüft der Server. Eine Route mit und ohne Thread, damit das Gespräch beim
 * Öffnen eines Threads stehen bleibt.
 */
export function FlottenNachrichtenPage({ user }: { user: CurrentUser }) {
  const flaeche = useRef<HTMLDivElement>(null);
  useChatflaeche(flaeche);
  const spalten = useSpalten(flaeche);
  const { threadId = null } = useParams();
  const [suche] = useSearchParams();
  const kanaele = useQuery({
    queryKey: KANAELE_KEY,
    queryFn: fetchKanaele,
    refetchInterval: NACHSEHEN_MS,
    gcTime: GESPRAECHE_HALTEN_MS,
  });
  const kanal = kanaele.data?.find((k) => k.kind === 'fleet');

  return (
    <div ref={flaeche} className="flex min-h-0 flex-col overflow-hidden">
      <Abfragezustand
        abfrage={kanaele}
        laden="Nachrichten werden geladen …"
        fehler="Die Nachrichten konnten nicht geladen werden."
        rahmen={(zustand) => <Rand>{zustand}</Rand>}
      >
        {() =>
          kanal ? (
            <Gespraechsflaeche
              user={user}
              kanal={kanal}
              threadId={threadId}
              sprungZu={suche.get('nachricht')}
              spalten={spalten}
              zurueck="/betrieb/flotte"
            />
          ) : (
            <Rand>
              <EmptyState title="Für die Radflotte gibt es hier noch kein Gespräch" />
            </Rand>
          )
        }
      </Abfragezustand>
    </div>
  );
}

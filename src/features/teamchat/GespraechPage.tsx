import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { GESPRAECHE_HALTEN_MS, KANAELE_KEY, NACHSEHEN_MS, fetchKanaele } from './api';
import { Gespraechsflaeche } from './Gespraechsflaeche';
import { TEAMCHAT } from './pfade';
import { useTeamchat } from './rahmen';
import { Rand } from './Rand';

/**
 * Teamchat → ein Gespräch, mit Thread (`/team/:kanalId/:threadId?`, TEAM-002).
 * Eine Route für beides: Öffnen und Schließen eines Threads lässt das
 * Gespräch stehen - mit Scrollstand, Entwurf und Lesestand. `?nachricht=`
 * springt an eine Stelle (Suche, „Für dich“, „Für später“); die Adresse
 * trägt nur Kennungen (ADR-011).
 */
export function GespraechPage() {
  const { user, spalten } = useTeamchat();
  const { kanalId = '', threadId = null } = useParams();
  const [suche] = useSearchParams();
  const kanaele = useQuery({
    queryKey: KANAELE_KEY,
    queryFn: fetchKanaele,
    refetchInterval: NACHSEHEN_MS,
    gcTime: GESPRAECHE_HALTEN_MS,
  });
  const kanal = kanaele.data?.find((k) => k.id === kanalId && k.kind !== 'fleet');

  return (
    <Abfragezustand
      abfrage={kanaele}
      laden="Gespräch wird geladen …"
      fehler="Das Gespräch konnte nicht geladen werden."
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
            zurueck={TEAMCHAT}
          />
        ) : (
          <Rand>
            <EmptyState
              title="Dieses Gespräch gibt es nicht"
              description="Vielleicht ist es gelöscht, oder du gehörst nicht dazu."
              aktion={
                <ButtonLink to={TEAMCHAT} variant="secondary">
                  Zu den Gesprächen
                </ButtonLink>
              }
            />
          </Rand>
        )
      }
    </Abfragezustand>
  );
}

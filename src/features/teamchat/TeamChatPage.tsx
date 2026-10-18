import { useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { KANAELE_KEY, NACHSEHEN_MS, fetchKanaele } from './api';
import { Gespraechsflaeche } from './Gespraechsflaeche';
import { NEU, TEAMCHAT } from './pfade';
import { useTeamchat } from './rahmen';
import { Rand } from './Rand';
import { standardGespraech } from './speicher';

/**
 * Teamchat (`/team`, TEAM-002): Am Telefon steht hier nur die Liste der
 * Gespräche (der Rahmen zeigt sie). Ab 900 px Breite steht sie links, und
 * rechts steht gleich ein Gespräch - das zuletzt offene, sonst das erste der
 * Liste, wie Slack beim Start den letzten Kanal zeigt. Ohne Umleitung: Die
 * Adresse bleibt `/team`, bis man ein Gespräch wählt.
 */
export function TeamChatPage() {
  const { user, spalten } = useTeamchat();
  const kanaele = useQuery({
    queryKey: KANAELE_KEY,
    queryFn: fetchKanaele,
    refetchInterval: NACHSEHEN_MS,
  });

  return (
    <Abfragezustand
      abfrage={kanaele}
      laden="Gespräche werden geladen …"
      fehler="Die Gespräche konnten nicht geladen werden."
      rahmen={(zustand) => <Rand>{zustand}</Rand>}
    >
      {(daten) => {
        const ziel = standardGespraech(daten, user.profile.id);
        if (ziel) {
          return (
            <Gespraechsflaeche
              user={user}
              kanal={ziel}
              threadId={null}
              sprungZu={null}
              spalten={spalten}
              zurueck={TEAMCHAT}
            />
          );
        }
        return (
          <Rand>
            <EmptyState
              title="Noch kein Gespräch"
              description="Unter „Neu“ schreibst du jemandem direkt oder legst einen Kanal an."
              aktion={<ButtonLink to={NEU}>Neu</ButtonLink>}
            />
          </Rand>
        );
      }}
    </Abfragezustand>
  );
}

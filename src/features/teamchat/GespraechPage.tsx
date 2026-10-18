import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { GESPRAECHE_HALTEN_MS, KANAELE_KEY, NACHSEHEN_MS, fetchKanaele } from './api';
import { Gespraechsflaeche } from './Gespraechsflaeche';
import { NEU, TEAMCHAT } from './pfade';
import { useTeamchat } from './rahmen';
import { Rand } from './Rand';
import { standardGespraech } from './speicher';

/**
 * Teamchat → ein Gespräch, mit Thread (`/team/:kanalId/:threadId?`, TEAM-002).
 * Eine Route für beides: Öffnen und Schließen eines Threads lässt das
 * Gespräch stehen - mit Scrollstand, Entwurf und Lesestand. `?nachricht=`
 * springt an eine Stelle (Suche, „Für dich“, „Für später“); die Adresse
 * trägt nur Kennungen (ADR-011).
 *
 * Ohne Kennung (`/team`) zeigt der Rahmen am Telefon die Liste der
 * Gespräche. Ab 900 px steht sie links, und hier steht gleich ein Gespräch -
 * das zuletzt offene, sonst das erste der Liste, wie Slack beim Start den
 * letzten Kanal zeigt. Die Adresse bleibt `/team`, bis man eines wählt. Auch
 * dafür dieselbe Seite: Wer das offene Gespräch in der Liste antippt,
 * wechselt nur die Adresse - eine laufende Aufnahme, ein offenes Fenster und
 * die Eingabe bleiben stehen. Zwei Seiten bauten dort alles neu auf.
 */
export function GespraechPage() {
  const { user, spalten } = useTeamchat();
  const { kanalId = null, threadId = null } = useParams();
  const [suche] = useSearchParams();
  const kanaele = useQuery({
    queryKey: KANAELE_KEY,
    queryFn: fetchKanaele,
    refetchInterval: NACHSEHEN_MS,
    gcTime: GESPRAECHE_HALTEN_MS,
  });
  const start = kanalId === null;

  return (
    <Abfragezustand
      abfrage={kanaele}
      laden={start ? 'Gespräche werden geladen …' : 'Gespräch wird geladen …'}
      fehler={
        start
          ? 'Die Gespräche konnten nicht geladen werden.'
          : 'Das Gespräch konnte nicht geladen werden.'
      }
      rahmen={(zustand) => <Rand>{zustand}</Rand>}
    >
      {(daten) => {
        const kanal = start
          ? standardGespraech(daten, user.profile.id)
          : daten.find((k) => k.id === kanalId && k.kind !== 'fleet');
        if (kanal) {
          return (
            <Gespraechsflaeche
              user={user}
              kanal={kanal}
              threadId={threadId}
              sprungZu={suche.get('nachricht')}
              spalten={spalten}
              zurueck={TEAMCHAT}
            />
          );
        }
        return start ? (
          <Rand>
            <EmptyState
              title="Noch kein Gespräch"
              description="Unter „Neu“ schreibst du jemandem direkt oder legst einen Kanal an."
              aktion={<ButtonLink to={NEU}>Neu</ButtonLink>}
            />
          </Rand>
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
        );
      }}
    </Abfragezustand>
  );
}

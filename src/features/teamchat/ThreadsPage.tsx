import { useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  KANAELE_KEY,
  NACHSEHEN_MS,
  THREADS_KEY,
  fetchKanaele,
  fetchThreads,
  kanalTitel,
  ohneInhalt,
} from './api';
import { vorschau } from './formatierung';
import { TEAMCHAT, THREADS, threadPfad } from './pfade';
import { useTeamchat } from './rahmen';
import { Rand } from './Rand';
import { nachrichtenzeit } from './zeit';

/**
 * Teamchat → Threads (ANN-640, wie bei Slack): alle Threads, denen die Person
 * folgt - begonnen, beantwortet, darin erwähnt oder ausdrücklich gefolgt -,
 * die mit neuen Antworten zuerst. Ein Tipp öffnet den Thread neben seinem
 * Gespräch.
 */
export function ThreadsPage() {
  const { user, spalten } = useTeamchat();
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const threads = useQuery({
    queryKey: THREADS_KEY,
    queryFn: fetchThreads,
    refetchInterval: NACHSEHEN_MS,
  });
  const kanaele = useQuery({ queryKey: KANAELE_KEY, queryFn: fetchKanaele });
  const titel = (kanalId: string) => {
    const kanal = kanaele.data?.find((k) => k.id === kanalId);
    return kanal ? kanalTitel(kanal) : 'Gespräch';
  };

  return (
    <Rand>
      {spalten === 1 ? (
        <Rueckweg standard={TEAMCHAT} beschriftung="Zurück zu den Gesprächen" />
      ) : null}
      <PageHeader title="Threads" />
      <Abfragezustand
        abfrage={threads}
        laden="Threads werden geladen …"
        fehler="Die Threads konnten nicht geladen werden."
        leer={{
          wenn: (daten) => daten.length === 0,
          titel: 'Noch kein Thread',
          beschreibung:
            'Hier stehen Threads, die du begonnen, beantwortet oder in denen du erwähnt bist.',
        }}
      >
        {(daten) => (
          <Listenabschnitt titel="Threads, denen du folgst">
            {daten.map((t) => (
              <ListRow
                key={t.id}
                to={mitRueckweg(
                  threadPfad({ id: t.channel_id, kind: t.channel_kind }, t.id),
                  THREADS,
                )}
                gedaempft={t.new_replies === 0}
                titel={
                  <span className="line-clamp-2">
                    {t.body === null ? ohneInhalt(t) : vorschau(t.body)}
                  </span>
                }
                meta={`${titel(t.channel_id)} · ${t.reply_count === 1 ? '1 Antwort' : `${t.reply_count} Antworten`}${
                  t.last_reply_at ? ` · zuletzt ${nachrichtenzeit(t.last_reply_at, zeitzone)}` : ''
                }`}
                status={
                  t.new_replies > 0 ? (
                    <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.neu}>
                      {t.new_replies} neu
                    </Badge>
                  ) : undefined
                }
              />
            ))}
          </Listenabschnitt>
        )}
      </Abfragezustand>
    </Rand>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import type { CurrentUser } from '@/features/session/types';
import {
  KANAELE_KEY,
  NACHSEHEN_MS,
  THREADS_KEY,
  fetchKanaele,
  fetchThreads,
  kanalTitel,
  ohneInhalt,
} from './api';
import { threadPfad } from './pfade';
import { nachrichtenzeit } from './zeit';

/**
 * Teamchat → Threads (ANN-614, wie bei Slack): alle Threads, denen die Person
 * folgt - selbst begonnen, geantwortet oder darin erwähnt -, die mit neuen
 * Antworten zuerst. Ein Tipp öffnet den Thread.
 */
export function ThreadsPage({ user }: { user: CurrentUser }) {
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
    <>
      <Rueckweg standard="/team" beschriftung="Zurück zum Teamchat" />
      <PageHeader title="Threads" />
      <Abfragezustand
        abfrage={threads}
        laden="Threads werden geladen …"
        fehler="Die Threads konnten nicht geladen werden."
        leer={{
          wenn: (daten) => daten.length === 0,
          titel: 'Noch kein Thread',
          beschreibung: 'Hier stehen Threads, die du begonnen oder beantwortet hast.',
        }}
      >
        {(daten) => (
          <Listenabschnitt titel="Threads, denen du folgst">
            {daten.map((t) => (
              <ListRow
                key={t.id}
                to={threadPfad({ id: t.channel_id, kind: t.channel_kind }, t.id)}
                titel={
                  t.body === null ? (
                    ohneInhalt(t)
                  ) : t.new_replies > 0 ? (
                    <strong>{t.body}</strong>
                  ) : (
                    t.body
                  )
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
    </>
  );
}

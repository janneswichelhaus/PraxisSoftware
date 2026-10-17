import { useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import type { CurrentUser } from '@/features/session/types';
import {
  AKTIVITAET_KEY,
  KANAELE_KEY,
  NACHSEHEN_MS,
  fetchAktivitaet,
  fetchKanaele,
  kanalTitel,
} from './api';
import { threadPfad } from './pfade';
import { nachrichtenzeit } from './zeit';

/**
 * Nachrichten → Für dich (ANN-614, wie die Aktivität bei Slack): wo die
 * Person erwähnt ist und wer in ihren Threads geantwortet hat - die neuesten
 * zuerst, Neues markiert. Ersetzt die Benachrichtigung, die es ohne Push
 * nicht gibt (ANN-612). Nur die eigene Sicht; über andere steht hier nichts.
 */
export function FuerDichPage({ user }: { user: CurrentUser }) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const aktivitaet = useQuery({
    queryKey: AKTIVITAET_KEY,
    queryFn: fetchAktivitaet,
    refetchInterval: NACHSEHEN_MS,
  });
  const kanaele = useQuery({ queryKey: KANAELE_KEY, queryFn: fetchKanaele });
  const titel = (kanalId: string) => {
    const kanal = kanaele.data?.find((k) => k.id === kanalId);
    return kanal ? kanalTitel(kanal) : 'Gespräch';
  };

  return (
    <>
      <PageHeader title="Für dich" />
      <Abfragezustand
        abfrage={aktivitaet}
        laden="„Für dich“ wird geladen …"
        fehler="„Für dich“ konnte nicht geladen werden."
        leer={{
          wenn: (daten) => daten.length === 0,
          titel: 'Nichts für dich',
          beschreibung: 'Hier stehen Erwähnungen und Antworten in deinen Threads.',
        }}
      >
        {(daten) => (
          <Listenabschnitt titel="Erwähnungen und Antworten">
            {daten.map((eintrag) => (
              <ListRow
                key={eintrag.id}
                to={threadPfad(
                  { id: eintrag.channel_id, kind: eintrag.channel_kind },
                  eintrag.parent_id ?? eintrag.id,
                  eintrag.id,
                )}
                titel={eintrag.unread ? <strong>{eintrag.body}</strong> : eintrag.body}
                meta={`${eintrag.reason === 'mention' ? 'Erwähnung' : 'Antwort'} · ${titel(
                  eintrag.channel_id,
                )} · ${eintrag.author_name ?? 'Ehemaliges Teammitglied'} · ${nachrichtenzeit(
                  eintrag.created_at,
                  zeitzone,
                )}`}
                status={
                  eintrag.unread ? (
                    <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.neu}>
                      Neu
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

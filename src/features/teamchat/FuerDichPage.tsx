import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import type { CurrentUser } from '@/features/session/types';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  AKTIVITAET_KEY,
  GEMERKT_KEY,
  KANAELE_KEY,
  NACHSEHEN_MS,
  TEAMCHAT_KEY,
  aendereGemerkt,
  fetchAktivitaet,
  fetchGemerkt,
  fetchKanaele,
  kanalTitel,
} from './api';
import { ohneFormatierung } from './formatierung';
import { FUER_DICH, stellePfad } from './pfade';
import { nachrichtenzeit } from './zeit';

/**
 * Nachrichten → Für dich (ANN-614, wie die Aktivität bei Slack): fällige
 * Erinnerungen aus „Für später“ (ANN-646), dann wo die Person erwähnt ist und
 * wer in ihren Threads geantwortet hat - die neuesten zuerst, Neues fett.
 * Ersetzt die Benachrichtigung, die es ohne Push nicht gibt (ADR-024 Punkt
 * 12). Ein Tipp springt an die Stelle; nur die eigene Sicht.
 */
export function FuerDichPage({ user }: { user: CurrentUser }) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const queryClient = useQueryClient();
  const aktivitaet = useQuery({
    queryKey: AKTIVITAET_KEY,
    queryFn: fetchAktivitaet,
    refetchInterval: NACHSEHEN_MS,
  });
  const gemerkt = useQuery({
    queryKey: [...GEMERKT_KEY, 'offen'],
    queryFn: () => fetchGemerkt(false),
    refetchInterval: NACHSEHEN_MS,
  });
  const kanaele = useQuery({ queryKey: KANAELE_KEY, queryFn: fetchKanaele });
  const titel = (kanalId: string) => {
    const kanal = kanaele.data?.find((k) => k.id === kanalId);
    return kanal ? kanalTitel(kanal) : 'Gespräch';
  };
  const abhaken = useMutation({
    mutationFn: (id: string) => aendereGemerkt(id, { erledigt: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY }),
  });
  const faellig = (gemerkt.data ?? []).filter((g) => g.due);

  return (
    <>
      <PageHeader title="Für dich" />
      {/* Hier ist jede Erinnerung fällig - der Regelfall trägt kein Abzeichen
          (Regel 5), und der Text behält bei 375 px seinen Platz. */}
      <Abfragezustand
        abfrage={gemerkt}
        laden="Erinnerungen werden geladen …"
        fehler="Die Erinnerungen konnten nicht geladen werden."
      >
        {() =>
          faellig.length > 0 ? (
            <Listenabschnitt titel="Erinnerungen" anzahl={faellig.length}>
              {faellig.map((g) => (
                <ListRow
                  key={g.id}
                  to={mitRueckweg(
                    stellePfad({ id: g.channel_id, kind: g.channel_kind }, g),
                    FUER_DICH,
                  )}
                  titel={<span className="line-clamp-2">{ohneFormatierung(g.body)}</span>}
                  meta={`${titel(g.channel_id)} · ${g.author_name ?? 'Ehemaliges Teammitglied'}`}
                  aktion={
                    <Button
                      variant="quiet"
                      disabled={abhaken.isPending}
                      onClick={() => abhaken.mutate(g.id)}
                    >
                      Erledigt
                    </Button>
                  }
                />
              ))}
            </Listenabschnitt>
          ) : null
        }
      </Abfragezustand>
      <Abfragezustand
        abfrage={aktivitaet}
        laden="„Für dich“ wird geladen …"
        fehler="„Für dich“ konnte nicht geladen werden."
        leer={{
          wenn: (daten) => daten.length === 0 && gemerkt.isSuccess && faellig.length === 0,
          titel: 'Nichts für dich',
          beschreibung:
            'Hier stehen Erwähnungen, Antworten in deinen Threads und fällige Erinnerungen.',
        }}
      >
        {(daten) =>
          daten.length > 0 ? (
            <Listenabschnitt titel="Erwähnungen und Antworten">
              {daten.map((eintrag) => (
                <ListRow
                  key={eintrag.id}
                  to={mitRueckweg(
                    stellePfad({ id: eintrag.channel_id, kind: eintrag.channel_kind }, eintrag),
                    FUER_DICH,
                  )}
                  gedaempft={!eintrag.unread}
                  titel={<span className="line-clamp-2">{ohneFormatierung(eintrag.body)}</span>}
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
          ) : null
        }
      </Abfragezustand>
    </>
  );
}

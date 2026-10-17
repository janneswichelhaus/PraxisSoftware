import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchField } from '@/components/ui/SearchField';
import type { CurrentUser } from '@/features/session/types';
import {
  KANAELE_KEY,
  NACHSEHEN_MS,
  TEAMCHAT_KEY,
  fetchKanaele,
  kanalTitel,
  markiereAllesGelesen,
  ordneKanaele,
  sucheKey,
  sucheNachrichten,
  type Kanal,
} from './api';
import { gespraechPfad, threadPfad } from './pfade';
import { nachrichtenzeit } from './zeit';

/**
 * Nachrichten → Teamchat (TEAM-001, §10 „Intern“): alle Gespräche als eine
 * Liste - Ungelesenes oben, dann die Kanäle, dann Direktnachrichten. Ein Tipp
 * öffnet; „Neu“ beginnt eine Direktnachricht (Referenzabgleich: drei Tipps
 * bis zum Senden). Die Suche ersetzt die Liste, solange etwas im Feld steht.
 *
 * Seitentyp Liste (DESIGN.md): Kopf mit „Neu“, Filterleiste mit der Suche,
 * `Listenabschnitt` mit `ListRow`; Archiviertes eingeklappt am Ende. Es gibt
 * keine Push-Zustellung: Die offene Seite sieht alle 20 Sekunden nach
 * (ANN-612).
 */
export function TeamChatPage({ user }: { user: CurrentUser }) {
  const [suche, setSuche] = useState('');
  const nadel = suche.trim();
  const kanaele = useQuery({
    queryKey: KANAELE_KEY,
    queryFn: fetchKanaele,
    refetchInterval: NACHSEHEN_MS,
  });

  return (
    <>
      <PageHeader
        title="Teamchat"
        actions={
          <>
            <ButtonLink to="/team/threads" variant="secondary" groesse="kompakt">
              Threads
            </ButtonLink>
            <ButtonLink to="/team/neu" groesse="kompakt">
              Neu
            </ButtonLink>
          </>
        }
      />
      <Filterleiste
        beschriftung="Nachrichten durchsuchen"
        suche={
          <SearchField
            label="In Nachrichten suchen"
            placeholder="In Nachrichten suchen"
            maxLength={100}
            value={suche}
            onChange={setSuche}
          />
        }
      />
      {nadel.length >= 2 ? (
        <Suchtreffer
          suche={nadel}
          zeitzone={user.organizationTimeZone ?? 'Europe/Berlin'}
          kanaele={kanaele.data}
        />
      ) : (
        <Abfragezustand
          abfrage={kanaele}
          laden="Gespräche werden geladen …"
          fehler="Die Gespräche konnten nicht geladen werden."
        >
          {(daten) => (
            <Gespraeche
              kanaele={daten}
              zeitzone={user.organizationTimeZone ?? 'Europe/Berlin'}
              darfKanal={user.roles.some((r) => r === 'owner' || r === 'team_lead')}
            />
          )}
        </Abfragezustand>
      )}
    </>
  );
}

function Gespraeche({
  kanaele,
  zeitzone,
  darfKanal,
}: {
  kanaele: Kanal[];
  zeitzone: string;
  /** owner und Teamleitung legen Kanäle an (ANN-611). */
  darfKanal: boolean;
}) {
  const queryClient = useQueryClient();
  // Das Gespräch der Radflotte steht in der Radflotte (ANN-613).
  const { aktiv, archiviert } = ordneKanaele(kanaele.filter((k) => k.kind !== 'fleet'));
  const ungelesen = aktiv.some((kanal) => kanal.unread > 0);
  const allesGelesen = useMutation({
    mutationFn: markiereAllesGelesen,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY }),
  });

  const kanaeleAktiv = aktiv.filter((kanal) => kanal.kind === 'channel');
  const direkt = aktiv.filter((kanal) => kanal.kind === 'direct');
  const allesGelesenKnopf = ungelesen ? (
    <Button
      variant="quiet"
      groesse="kompakt"
      disabled={allesGelesen.isPending}
      onClick={() => allesGelesen.mutate()}
    >
      Alle gelesen
    </Button>
  ) : undefined;

  // Wie die Seitenleiste bei Slack (ANN-614): Kanäle, dann Direktnachrichten,
  // in beiden Ungelesenes fett und zuerst.
  return (
    <>
      {aktiv.length === 0 ? (
        <Listenabschnitt
          titel="Gespräche"
          leer={{
            titel: 'Noch kein Gespräch',
            beschreibung: darfKanal
              ? 'Unter „Neu“ legst du einen Kanal an oder schreibst jemandem direkt.'
              : 'Unter „Neu“ schreibst du jemandem direkt.',
          }}
        />
      ) : null}
      {kanaeleAktiv.length > 0 ? (
        <Listenabschnitt titel="Kanäle" aktion={allesGelesenKnopf}>
          {kanaeleAktiv.map((kanal) => (
            <Gespraechszeile key={kanal.id} kanal={kanal} zeitzone={zeitzone} />
          ))}
        </Listenabschnitt>
      ) : null}
      {direkt.length > 0 ? (
        <Listenabschnitt
          titel="Direktnachrichten"
          aktion={kanaeleAktiv.length === 0 ? allesGelesenKnopf : undefined}
        >
          {direkt.map((kanal) => (
            <Gespraechszeile key={kanal.id} kanal={kanal} zeitzone={zeitzone} />
          ))}
        </Listenabschnitt>
      ) : null}
      {archiviert.length > 0 ? (
        <Disclosure summary="Archiv" anzahl={archiviert.length}>
          <ListRows beschriftung="Archivierte Kanäle">
            {archiviert.map((kanal) => (
              <Gespraechszeile key={kanal.id} kanal={kanal} zeitzone={zeitzone} />
            ))}
          </ListRows>
        </Disclosure>
      ) : null}
    </>
  );
}

function Gespraechszeile({ kanal, zeitzone }: { kanal: Kanal; zeitzone: string }) {
  const meta =
    kanal.kind === 'direct'
      ? kanal.partner_active === false
        ? 'Nicht mehr im Team'
        : undefined
      : (kanal.description ?? undefined);
  return (
    <ListRow
      to={gespraechPfad(kanal)}
      titel={kanal.unread > 0 ? <strong>{kanalTitel(kanal)}</strong> : kanalTitel(kanal)}
      meta={meta}
      zeit={kanal.last_message_at ? nachrichtenzeit(kanal.last_message_at, zeitzone) : undefined}
      status={
        kanal.mentions > 0 ? (
          <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.erwaehnt}>
            {kanal.mentions} für dich
          </Badge>
        ) : kanal.unread > 0 ? (
          <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.neu}>
            {kanal.unread} neu
          </Badge>
        ) : undefined
      }
    />
  );
}

function Suchtreffer({
  suche,
  zeitzone,
  kanaele,
}: {
  suche: string;
  zeitzone: string;
  kanaele: Kanal[] | undefined;
}) {
  const treffer = useQuery({
    queryKey: sucheKey(suche),
    queryFn: () => sucheNachrichten(suche),
  });
  const titel = (kanalId: string) => {
    const kanal = kanaele?.find((k) => k.id === kanalId);
    return kanal ? kanalTitel(kanal) : 'Gespräch';
  };
  const art = (kanalId: string) => kanaele?.find((k) => k.id === kanalId)?.kind ?? 'channel';
  return (
    <Abfragezustand
      abfrage={treffer}
      laden="Es wird gesucht …"
      fehler="Die Suche hat nicht geklappt."
      leer={{
        wenn: (daten) => daten.length === 0,
        titel: 'Nichts gefunden',
        beschreibung: 'Gesucht wird in allen Gesprächen, die du lesen kannst.',
      }}
    >
      {(daten) => (
        <Listenabschnitt titel="Treffer" anzahl={daten.length}>
          {daten.map((t) => (
            <ListRow
              key={t.id}
              to={threadPfad(
                { id: t.channel_id, kind: art(t.channel_id) },
                t.parent_id ?? t.id,
                t.id,
              )}
              titel={t.body}
              meta={`${titel(t.channel_id)} · ${t.author_name ?? 'Ehemaliges Teammitglied'} · ${nachrichtenzeit(t.created_at, zeitzone)}`}
            />
          ))}
        </Listenabschnitt>
      )}
    </Abfragezustand>
  );
}

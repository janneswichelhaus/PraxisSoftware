import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Verlauf } from '@/components/ui/Verlauf';
import type { CurrentUser } from '@/features/session/types';
import { fetchMitglieder, mitgliederKey, type Kanal, type Nachricht } from './api';
import { ausgangEntfernen, erneutSenden, useAusgang, type Ausgangseintrag } from './ausgang';
import { entwurfLesen, entwurfSetzen } from './entwuerfe';
import { useLesestand } from './lesestand';
import { NachrichtZeile } from './Nachricht';
import { Nachrichtenaktionen } from './Nachrichtenaktionen';
import { useScrollstand } from './scrollstand';
import { flach, useVerlauf } from './verlauf';
import { nachrichtentag, tagestrenner } from './zeit';

/** Was die Eingabe am Verlauf auslöst. */
export interface Verlaufssteuerung {
  ansEnde: () => void;
  /** ↑ im leeren Feld: die letzte eigene Nachricht bearbeiten. */
  bearbeiteLetzte: () => void;
}

/** Nachrichten derselben Person binnen fünf Minuten hängen aneinander. */
const ANHAENGEN_MS = 5 * 60_000;

/** Eine Nachricht im Ausgang, so gezeigt wie eine vom Server. */
function alsNachricht(e: Ausgangseintrag, eigeneId: string | null, name: string | null): Nachricht {
  return {
    id: e.id,
    parent_id: e.threadId,
    author_staff_member_id: eigeneId,
    author_name: name,
    body: e.text,
    created_at: e.erstellt,
    edited: false,
    removed_kind: null,
    also_in_channel: e.auchImKanal,
    reply_count: 0,
    last_reply_at: null,
    mentions: [...e.erwaehnt],
    own: true,
    new_replies: 0,
    mentioned_in_new_replies: false,
    unread: false,
    following: true,
    reactions: [],
    pinned: false,
    saved: false,
    root_author_name: null,
    root_body: null,
  };
}

/**
 * Der rollende Verlauf eines Gesprächs oder Threads (TEAM-002) - im Gespräch
 * die Ausgangsnachrichten mit „Antworten“, im Thread oben die
 * Ausgangsnachricht und darunter die Antworten.
 *
 * Geladen wird in Seiten (`verlauf.ts`), gelesen gilt nur Gesehenes
 * (`lesestand.ts`), der Platz bleibt beim Nachladen und Zurückkommen
 * (`scrollstand.ts`), und was im Ausgang liegt, steht unten mit seinem
 * Zustand (`ausgang.ts`). Die Linie „Neu“ steht vor der ersten Nachricht,
 * die beim Öffnen neu war, und wandert danach nicht mehr.
 */
export function Verlaufsansicht({
  user,
  kanal,
  threadId = null,
  sprungZu = null,
  gesperrt,
  zeitzone,
  threadPfadFuer,
  steuerung,
}: {
  user: CurrentUser;
  kanal: Kanal;
  threadId?: string | null;
  sprungZu?: string | null;
  gesperrt: boolean;
  zeitzone: string;
  /** Im Gespräch: der Weg in den Thread einer Ausgangsnachricht. */
  threadPfadFuer?: ((wurzelId: string) => string) | undefined;
  steuerung?: Ref<Verlaufssteuerung>;
}) {
  const kontoId = user.profile.id;
  const eigeneId = user.staffMemberId ?? null;
  const verlauf = useVerlauf(kanal.id, threadId, sprungZu);
  const ausgang = useAusgang(kontoId, kanal.id, threadId);
  const mitglieder = useQuery({
    queryKey: mitgliederKey(kanal.id),
    queryFn: () => fetchMitglieder(kanal.id),
    staleTime: 300_000,
  });
  const personen = useMemo(() => mitglieder.data ?? [], [mitglieder.data]);
  const namen = useMemo(() => personen.map((p) => p.name), [personen]);
  const eigenerName = personen.find((p) => p.staff_member_id === eigeneId)?.name ?? null;

  const behaelter = useRef<HTMLDivElement>(null);
  const inhalt = useRef<HTMLDivElement>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const lesestand = useLesestand({ kanalId: kanal.id, threadId, behaelter });

  const server = useMemo(() => flach(verlauf.data?.pages ?? []), [verlauf.data]);
  const nachrichten = useMemo(() => {
    const vorhanden = new Set(server.map((n) => n.id));
    // Geplantes steht nicht im Gespräch, nur unter „Geplant“ (ANN-643). Was
    // der Server schon hat, steht nur einmal da - auch wenn seine Antwort
    // noch fehlt (`kennung.ts`).
    const wartend = ausgang
      .filter((e) => e.um === null && !(e.serverId !== null && vorhanden.has(e.serverId)))
      .map((e) => alsNachricht(e, eigeneId, eigenerName));
    return [...server, ...wartend];
  }, [server, ausgang, eigeneId, eigenerName]);
  const ausgangNach = useMemo(() => new Map(ausgang.map((e) => [e.id, e])), [ausgang]);

  // Die Linie „Neu“: vor der ersten Nachricht, die beim ersten Laden neu war.
  const neuAb = useRef<string | null | undefined>(undefined);
  if (neuAb.current === undefined && verlauf.data) {
    neuAb.current = server.find((n) => n.unread && n.id !== threadId)?.id ?? null;
  }

  const ids = useMemo(() => nachrichten.map((n) => n.id), [nachrichten]);
  const scroll = useScrollstand({
    schluessel: `${kontoId}|${kanal.id}|${threadId ?? ''}`,
    behaelter,
    inhalt,
    ids,
    neuAb: neuAb.current ?? null,
    sprungZu,
  });

  useImperativeHandle(
    steuerung,
    () => ({
      ansEnde: () => requestAnimationFrame(() => scroll.ansEnde(true)),
      bearbeiteLetzte: () => {
        const letzte = [...server]
          .reverse()
          .find((n) => n.own && n.body !== null && (threadId ? n.id !== threadId : true));
        if (letzte && !gesperrt) setBearbeitet(letzte.id);
      },
    }),
    [scroll, server, threadId, gesperrt],
  );

  // Am oberen Rand: Ältere laden; nach einem Sprung am unteren: Neuere.
  const oben = useRef<HTMLDivElement>(null);
  const unten = useRef<HTMLDivElement>(null);
  const { hasNextPage, fetchNextPage, isFetchingNextPage } = verlauf;
  const { hasPreviousPage, fetchPreviousPage, isFetchingPreviousPage } = verlauf;
  useEffect(() => {
    const wurzel = behaelter.current;
    if (typeof IntersectionObserver === 'undefined' || !wurzel) return;
    const io = new IntersectionObserver(
      (eintraege) => {
        for (const e of eintraege) {
          if (!e.isIntersecting) continue;
          if (e.target === oben.current && hasNextPage && !isFetchingNextPage) void fetchNextPage();
          if (e.target === unten.current && hasPreviousPage && !isFetchingPreviousPage) {
            void fetchPreviousPage();
          }
        }
      },
      { root: wurzel, rootMargin: '200px 0px' },
    );
    if (oben.current) io.observe(oben.current);
    if (unten.current) io.observe(unten.current);
    return () => io.disconnect();
  }, [
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    hasPreviousPage,
    isFetchingPreviousPage,
    fetchPreviousPage,
  ]);

  const offenNachricht = offen ? nachrichten.find((n) => n.id === offen) : undefined;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={behaelter} className="h-full overflow-y-auto overscroll-contain px-4 sm:px-6">
        <div ref={inhalt} className="pb-2">
          <Abfragezustand
            abfrage={verlauf}
            laden="Nachrichten werden geladen …"
            fehler="Die Nachrichten konnten nicht geladen werden."
          >
            {() => (
              <>
                <div ref={oben} aria-hidden="true" />
                {hasNextPage ? (
                  <div className="py-2">
                    <Button
                      variant="quiet"
                      groesse="kompakt"
                      disabled={isFetchingNextPage}
                      onClick={() => void fetchNextPage()}
                    >
                      {isFetchingNextPage ? 'Ältere werden geladen …' : 'Ältere Nachrichten'}
                    </Button>
                  </div>
                ) : null}
                {nachrichten.length === 0 ? (
                  <EmptyState title="Noch keine Nachricht" />
                ) : (
                  <Verlauf beschriftung={threadId ? 'Antworten' : 'Nachrichten'}>
                    {nachrichten.map((n, index) => {
                      const vorige = nachrichten[index - 1];
                      const neuerTag =
                        !vorige ||
                        nachrichtentag(n.created_at, zeitzone) !==
                          nachrichtentag(vorige.created_at, zeitzone);
                      const fortsetzung =
                        !!vorige &&
                        !neuerTag &&
                        vorige.author_staff_member_id !== null &&
                        vorige.author_staff_member_id === n.author_staff_member_id &&
                        !n.also_in_channel &&
                        vorige.body !== null &&
                        n.body !== null &&
                        vorige.id !== threadId &&
                        Date.parse(n.created_at) - Date.parse(vorige.created_at) < ANHAENGEN_MS;
                      const imAusgang = ausgangNach.get(n.id);
                      return (
                        <NachrichtZeile
                          key={n.id}
                          nachricht={n}
                          ausgang={imAusgang}
                          art={kanal.kind}
                          zeitzone={zeitzone}
                          eigeneId={eigeneId}
                          eigenerName={eigenerName}
                          namen={namen}
                          personen={personen}
                          fortsetzung={fortsetzung}
                          tag={neuerTag ? tagestrenner(n.created_at, zeitzone) : null}
                          neu={neuAb.current === n.id}
                          hervorgehoben={sprungZu === n.id}
                          gesperrt={gesperrt}
                          bearbeiten={bearbeitet === n.id}
                          threadLink={
                            threadPfadFuer && n.parent_id === null && !imAusgang
                              ? threadPfadFuer(n.id)
                              : undefined
                          }
                          zumThread={
                            threadPfadFuer && n.also_in_channel && n.parent_id
                              ? threadPfadFuer(n.parent_id)
                              : undefined
                          }
                          beobachte={imAusgang ? undefined : lesestand.beobachte(n.created_at)}
                          onAktionen={() => setOffen(n.id)}
                          onBearbeitenEnde={() => setBearbeitet(null)}
                          onErneut={() => erneutSenden(n.id)}
                          onVerwerfen={() => ausgangEntfernen(n.id)}
                          onZurueckInsFeld={() => {
                            const eintrag = ausgangEntfernen(n.id);
                            if (!eintrag) return;
                            const davor = entwurfLesen(kontoId, kanal.id, threadId);
                            entwurfSetzen(
                              kontoId,
                              kanal.id,
                              threadId,
                              davor ? `${davor}\n${eintrag.text}` : eintrag.text,
                            );
                          }}
                        />
                      );
                    })}
                  </Verlauf>
                )}
                {hasPreviousPage ? (
                  <div className="py-2">
                    <Button
                      variant="quiet"
                      groesse="kompakt"
                      disabled={isFetchingPreviousPage}
                      onClick={() => void fetchPreviousPage()}
                    >
                      {isFetchingPreviousPage ? 'Neuere werden geladen …' : 'Neuere Nachrichten'}
                    </Button>
                  </div>
                ) : null}
                <div ref={unten} aria-hidden="true" />
              </>
            )}
          </Abfragezustand>
        </div>
      </div>
      {scroll.neuUnten > 0 && !scroll.amEnde ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            groesse="kompakt"
            className="pointer-events-auto"
            onClick={() => scroll.ansEnde(true)}
          >
            {scroll.neuUnten === 1 ? '1 neue Nachricht' : `${scroll.neuUnten} neue Nachrichten`} ↓
          </Button>
        </div>
      ) : null}
      {offenNachricht ? (
        <Nachrichtenaktionen
          user={user}
          kanal={kanal}
          nachricht={offenNachricht}
          zeitzone={zeitzone}
          threadPfad={
            threadPfadFuer && offenNachricht.parent_id === null && offenNachricht.id !== threadId
              ? threadPfadFuer(offenNachricht.id)
              : undefined
          }
          gesperrt={gesperrt}
          onBearbeiten={() => setBearbeitet(offenNachricht.id)}
          onUngelesen={lesestand.aussetzen}
          onSchliessen={() => setOffen(null)}
        />
      ) : null}
    </div>
  );
}

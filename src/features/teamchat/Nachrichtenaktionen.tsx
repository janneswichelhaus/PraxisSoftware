import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { canManageTasks, isOwner, type CurrentUser } from '@/features/session/types';
import {
  REAKTIONEN,
  TEAMCHAT_KEY,
  folgeThread,
  hefteAn,
  kanalTitel,
  loescheNachricht,
  markiereUngelesen,
  merke,
  reagiere,
  vergiss,
  type Kanal,
  type Nachricht,
} from './api';
import { AlsAufgabe } from './AlsAufgabe';
import { Zeitwahl } from './Zeitwahl';
import { erinnerungsvorschlaege, nachrichtenzeit } from './zeit';

/**
 * Was man mit einer Nachricht tun kann (TEAM-002) - ein Fenster unten im
 * Daumenbereich, geöffnet über „⋯“ an der Nachricht. Kein Gedrückthalten und
 * kein Wischen: Beides trägt in der Halterung nicht (Referenzabgleich
 * TEAM-001).
 *
 * Oben die Handlungen: antworten, folgen, für später, erinnern, anheften, ab
 * hier ungelesen, als Aufgabe, bearbeiten, löschen. Darunter, wer reagiert
 * hat, und ganz unten im Daumenbereich die Reaktionen in einem Tipp - das
 * Häufigste (DESIGN.md, Grundsatz 1; Praxis-Sichtung TEAM-002). Zerstörendes
 * fragt nach.
 */
export function Nachrichtenaktionen({
  user,
  kanal,
  nachricht,
  zeitzone,
  threadPfad,
  gesperrt,
  onBearbeiten,
  onUngelesen,
  onSchliessen,
}: {
  user: CurrentUser;
  kanal: Kanal;
  nachricht: Nachricht;
  zeitzone: string;
  /** Im Gespräch: der Weg in den Thread dieser Ausgangsnachricht. */
  threadPfad?: string | undefined;
  /** Archiviert - nur noch lesen. */
  gesperrt: boolean;
  onBearbeiten: () => void;
  onUngelesen: () => void;
  onSchliessen: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [ansicht, setAnsicht] = useState<'liste' | 'loeschen' | 'erinnern' | 'aufgabe'>('liste');
  const aktualisieren = () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
  const tun = useMutation({
    mutationFn: (vorgang: () => Promise<unknown>) => vorgang(),
    onSuccess: async () => {
      await aktualisieren();
      onSchliessen();
    },
  });

  const leer = nachricht.body === null;
  const wurzel = nachricht.parent_id === null;
  const eigen = nachricht.own && !leer;
  const entfernbar =
    !eigen && !leer && isOwner(user.roles) && (kanal.kind === 'channel' || kanal.kind === 'fleet');
  const name = nachricht.author_name ?? 'Ehemaliges Teammitglied';
  const titel = leer ? 'Nachricht' : `Nachricht von ${name}`;

  if (ansicht === 'aufgabe' && nachricht.body) {
    const tag = nachrichtenzeit(nachricht.created_at, zeitzone);
    return (
      <AlsAufgabe
        text={nachricht.body}
        herkunft={`Aus dem Teamchat, ${kanalTitel(kanal)}, ${tag}`}
        eigeneId={user.staffMemberId ?? null}
        onSchliessen={onSchliessen}
      />
    );
  }

  if (ansicht === 'erinnern') {
    return (
      <Zeitwahl
        titel="Erinnern"
        vorschlaege={erinnerungsvorschlaege(zeitzone)}
        zeitzone={zeitzone}
        bestaetigen="Erinnern"
        laeuft={tun.isPending}
        fehler={tun.isError ? tun.error.message : undefined}
        onSchliessen={onSchliessen}
        onWaehlen={(um) => tun.mutate(() => merke(nachricht.id, um))}
      />
    );
  }

  return (
    <Dialogfenster titel={titel} onSchliessen={onSchliessen}>
      {ansicht === 'loeschen' ? (
        <div className="flex flex-col gap-4">
          <p className="text-ink text-liste">
            {entfernbar
              ? 'Der Text verschwindet für alle; stehen bleibt „Von der Praxisleitung entfernt“.'
              : nachricht.reply_count > 0
                ? 'Der Text verschwindet; die Antworten bleiben.'
                : 'Die Nachricht verschwindet für alle.'}
          </p>
          {tun.isError ? <Statusmeldung ton="fehler">{tun.error.message}</Statusmeldung> : null}
          <Formularfuss>
            <Button
              disabled={tun.isPending}
              onClick={() => tun.mutate(() => loescheNachricht(nachricht.id))}
            >
              {tun.isPending ? 'Wird gelöscht …' : entfernbar ? 'Ja, entfernen' : 'Ja, löschen'}
            </Button>
            <Button variant="quiet" onClick={() => setAnsicht('liste')}>
              Abbrechen
            </Button>
          </Formularfuss>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ListRows beschriftung="Handlungen" rahmen={false}>
            {threadPfad && wurzel ? (
              <ListRow
                dicht
                titel="Im Thread antworten"
                onClick={() => {
                  onSchliessen();
                  void navigate(threadPfad);
                }}
              />
            ) : null}
            {wurzel && !leer ? (
              <ListRow
                dicht
                titel={nachricht.following ? 'Thread nicht mehr folgen' : 'Thread folgen'}
                onClick={() => tun.mutate(() => folgeThread(nachricht.id, !nachricht.following))}
              />
            ) : null}
            {!leer ? (
              <ListRow
                dicht
                titel={nachricht.saved ? 'Nicht mehr für später' : 'Für später merken'}
                onClick={() =>
                  tun.mutate(() =>
                    nachricht.saved ? vergiss(nachricht.id) : merke(nachricht.id, null),
                  )
                }
              />
            ) : null}
            {!leer ? (
              <ListRow dicht titel="Erinnern …" onClick={() => setAnsicht('erinnern')} />
            ) : null}
            {!leer && !gesperrt ? (
              <ListRow
                dicht
                titel={nachricht.pinned ? 'Nicht mehr anheften' : 'Anheften'}
                onClick={() => tun.mutate(() => hefteAn(nachricht.id, !nachricht.pinned))}
              />
            ) : null}
            <ListRow
              dicht
              titel="Ab hier ungelesen"
              onClick={() =>
                tun.mutate(async () => {
                  await markiereUngelesen(nachricht.id);
                  onUngelesen();
                })
              }
            />
            {!leer && canManageTasks(user.roles) ? (
              <ListRow dicht titel="Als Aufgabe übernehmen" onClick={() => setAnsicht('aufgabe')} />
            ) : null}
            {eigen && !gesperrt ? (
              <ListRow
                dicht
                titel="Bearbeiten"
                onClick={() => {
                  onSchliessen();
                  onBearbeiten();
                }}
              />
            ) : null}
            {(eigen || entfernbar) && !gesperrt ? (
              <ListRow
                dicht
                titel={entfernbar ? 'Entfernen' : 'Löschen'}
                onClick={() => setAnsicht('loeschen')}
              />
            ) : null}
          </ListRows>
          {nachricht.reactions.length > 0 ? (
            <ul
              aria-label="Wer reagiert hat"
              className="text-ink-muted flex flex-col gap-1 text-sm"
            >
              {nachricht.reactions.map((r) => {
                const art = REAKTIONEN.find((x) => x.schluessel === r.reaction);
                return (
                  <li key={r.reaction}>
                    <span aria-hidden="true">{art?.zeichen}</span>{' '}
                    <span className="sr-only">{art?.name}: </span>
                    {r.names.join(', ')}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {tun.isError ? <Statusmeldung ton="fehler">{tun.error.message}</Statusmeldung> : null}
          {!leer && !gesperrt ? (
            <div
              role="group"
              aria-label="Reagieren"
              className="grid grid-cols-4 gap-1 sm:grid-cols-8"
            >
              {REAKTIONEN.map((r) => {
                const eigene = nachricht.reactions.some(
                  (x) => x.reaction === r.schluessel && x.own,
                );
                return (
                  <Symbolknopf
                    key={r.schluessel}
                    beschriftung={r.name}
                    variant={eigene ? 'primary' : 'quiet'}
                    aria-pressed={eigene}
                    disabled={tun.isPending}
                    onClick={() => tun.mutate(() => reagiere(nachricht.id, r.schluessel))}
                  >
                    <span className="text-xl leading-none">{r.zeichen}</span>
                  </Symbolknopf>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </Dialogfenster>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { TextArea } from '@/components/ui/TextArea';
import {
  PERSONEN_KEY,
  TEAMCHAT_KEY,
  bearbeiteNachricht,
  fetchPersonen,
  loescheNachricht,
  ohneInhalt,
  type Nachricht,
} from './api';
import { NACHRICHT_MAX, erwaehnte } from './erwaehnung';
import { nachrichtenzeit } from './zeit';

/**
 * Die Nachrichten eines Gesprächs oder Threads, die älteste oben, eine Linie
 * zwischen ihnen statt einer Karte je Nachricht (DESIGN.md Regel 2, wie der
 * Verlauf einer Rückfrage). Kein „gelesen von“, kein Status (ANN-609).
 *
 * Unter einer Ausgangsnachricht im Kanal steht „Antworten“ - sichtbar, ohne
 * Gedrückthalten oder Wischen, das in der Halterung nicht trägt
 * (Referenzabgleich TEAM-001). Eigenes bearbeiten und löschen, owner entfernt
 * in offenen Kanälen: hinter „⋯“, damit die Zeile ruhig bleibt.
 */
export function Nachrichtenliste({
  nachrichten,
  zeitzone,
  eigeneId,
  threadPfad,
  darfEntfernen,
  hervorheben,
  gesperrt,
}: {
  nachrichten: readonly Nachricht[];
  zeitzone: string;
  /** Der eigene Mitarbeiterdatensatz - für „Für dich“. */
  eigeneId: string | null;
  /** Ohne Angabe (im Thread) kein „Antworten“ unter der Nachricht. */
  threadPfad?: (nachricht: Nachricht) => string;
  /** owner in einem offenen Kanal. */
  darfEntfernen: boolean;
  /** Eine Nachricht aus der Suche. */
  hervorheben?: string | null;
  /** Archiviert: nichts mehr ändern. */
  gesperrt: boolean;
}) {
  return (
    <ol aria-label="Nachrichten" className="flex flex-col">
      {nachrichten.map((nachricht) => (
        <Zeile
          key={nachricht.id}
          nachricht={nachricht}
          zeitzone={zeitzone}
          fuerMich={eigeneId !== null && nachricht.mentions.includes(eigeneId)}
          threadPfad={threadPfad}
          darfEntfernen={darfEntfernen && !nachricht.own}
          hervorgehoben={hervorheben === nachricht.id}
          gesperrt={gesperrt}
        />
      ))}
    </ol>
  );
}

function Zeile({
  nachricht,
  zeitzone,
  fuerMich,
  threadPfad,
  darfEntfernen,
  hervorgehoben,
  gesperrt,
}: {
  nachricht: Nachricht;
  zeitzone: string;
  fuerMich: boolean;
  threadPfad: ((nachricht: Nachricht) => string) | undefined;
  darfEntfernen: boolean;
  hervorgehoben: boolean;
  gesperrt: boolean;
}) {
  const [werkzeug, setWerkzeug] = useState(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const leer = nachricht.body === null;
  const eigen = nachricht.own && !leer && !gesperrt;
  const entfernbar = darfEntfernen && !leer && !gesperrt;

  return (
    <li
      id={`nachricht-${nachricht.id}`}
      className={`border-line border-t py-3 first:border-t-0 ${
        hervorgehoben ? 'bg-accent-soft -mx-4 px-4' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-ink-muted text-sm">
            <span className="text-ink font-semibold">
              {nachricht.author_name ?? 'Ehemaliges Teammitglied'}
            </span>{' '}
            · {nachrichtenzeit(nachricht.created_at, zeitzone)}
            {nachricht.edited ? ' · bearbeitet' : ''}
          </p>
          {fuerMich && !leer ? (
            <p className="mt-1">
              <Badge ton="akzent" eigenesZeichen="@">
                Für dich
              </Badge>
            </p>
          ) : null}
          {bearbeiten ? (
            <Bearbeiten nachricht={nachricht} onFertig={() => setBearbeiten(false)} />
          ) : (
            <p
              className={`text-liste mt-1 break-words whitespace-pre-wrap ${
                leer ? 'text-ink-muted italic' : 'text-ink'
              }`}
            >
              {leer ? ohneInhalt(nachricht) : nachricht.body}
            </p>
          )}
        </div>
        {(eigen || entfernbar) && !bearbeiten ? (
          <Symbolknopf
            beschriftung="Weitere Aktionen zur Nachricht"
            aria-expanded={werkzeug}
            variant={werkzeug ? 'primary' : 'quiet'}
            onClick={() => setWerkzeug(!werkzeug)}
          >
            ⋯
          </Symbolknopf>
        ) : null}
      </div>
      {werkzeug && !bearbeiten ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {eigen ? (
            <Button
              variant="secondary"
              groesse="kompakt"
              onClick={() => {
                setBearbeiten(true);
                setWerkzeug(false);
              }}
            >
              Bearbeiten
            </Button>
          ) : null}
          <Loeschen nachricht={nachricht} entfernen={!eigen} />
        </div>
      ) : null}
      {threadPfad && (nachricht.reply_count > 0 || !gesperrt) ? (
        <div className="mt-1">
          <ButtonLink to={threadPfad(nachricht)} variant="quiet" groesse="kompakt">
            {nachricht.reply_count === 0
              ? 'Antworten'
              : nachricht.reply_count === 1
                ? `1 Antwort${nachricht.last_reply_at ? ` · ${nachrichtenzeit(nachricht.last_reply_at, zeitzone)}` : ''}`
                : `${nachricht.reply_count} Antworten${nachricht.last_reply_at ? ` · ${nachrichtenzeit(nachricht.last_reply_at, zeitzone)}` : ''}`}
          </ButtonLink>
        </div>
      ) : null}
    </li>
  );
}

function Bearbeiten({ nachricht, onFertig }: { nachricht: Nachricht; onFertig: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(nachricht.body ?? '');
  const personen = useQuery({ queryKey: PERSONEN_KEY, queryFn: fetchPersonen, staleTime: 300_000 });
  const speichern = useMutation({
    mutationFn: () =>
      bearbeiteNachricht({
        id: nachricht.id,
        text,
        erwaehnt: erwaehnte(text, personen.data ?? []),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
      onFertig();
    },
  });
  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) speichern.mutate();
      }}
    >
      <TextArea
        label="Nachricht ändern"
        value={text}
        rows={3}
        maxLength={NACHRICHT_MAX}
        error={speichern.isError ? speichern.error.message : undefined}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" groesse="kompakt" disabled={!text.trim() || speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
        <Button variant="quiet" groesse="kompakt" onClick={onFertig}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function Loeschen({ nachricht, entfernen }: { nachricht: Nachricht; entfernen: boolean }) {
  const queryClient = useQueryClient();
  const loeschen = useMutation({
    mutationFn: () => loescheNachricht(nachricht.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY }),
  });
  return (
    <Rueckfrage
      ausloeser={entfernen ? 'Entfernen' : 'Löschen'}
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
      bezeichnung={entfernen ? 'Nachricht entfernen' : 'Nachricht löschen'}
      bestaetigen={entfernen ? 'Ja, entfernen' : 'Ja, löschen'}
      bestaetigenLaeuft="Wird gelöscht …"
      fehler={loeschen.isError ? loeschen.error.message : undefined}
      onBestaetigen={() => loeschen.mutateAsync()}
    >
      {entfernen
        ? 'Der Text verschwindet für alle; stehen bleibt „Von der Praxisleitung entfernt“.'
        : nachricht.reply_count > 0
          ? 'Der Text verschwindet; die Antworten bleiben.'
          : 'Die Nachricht verschwindet für alle.'}
    </Rueckfrage>
  );
}

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { TextArea } from '@/components/ui/TextArea';
import { Verlauf, Verlaufseintrag } from '@/components/ui/Verlauf';
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
  // Neue Antworten und Erwähnungen in Threads bleiben markiert, solange das
  // Gespräch offen ist - auch wenn der Kanal inzwischen als gelesen gilt
  // (Praxis-Review TEAM-001).
  const marken = useRef(new Map<string, { neu: number; fuerMich: boolean }>());
  for (const n of nachrichten) {
    if (n.new_replies > 0 || n.mentioned_in_new_replies) {
      const bisher = marken.current.get(n.id);
      marken.current.set(n.id, {
        neu: Math.max(bisher?.neu ?? 0, n.new_replies),
        fuerMich: (bisher?.fuerMich ?? false) || n.mentioned_in_new_replies,
      });
    }
  }
  return (
    <Verlauf beschriftung="Nachrichten">
      {nachrichten.map((nachricht) => (
        <Zeile
          key={nachricht.id}
          marke={marken.current.get(nachricht.id)}
          nachricht={nachricht}
          zeitzone={zeitzone}
          fuerMich={eigeneId !== null && nachricht.mentions.includes(eigeneId)}
          threadPfad={threadPfad}
          darfEntfernen={darfEntfernen && !nachricht.own}
          hervorgehoben={hervorheben === nachricht.id}
          gesperrt={gesperrt}
        />
      ))}
    </Verlauf>
  );
}

function Zeile({
  marke,
  nachricht,
  zeitzone,
  fuerMich,
  threadPfad,
  darfEntfernen,
  hervorgehoben,
  gesperrt,
}: {
  marke: { neu: number; fuerMich: boolean } | undefined;
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
    <Verlaufseintrag id={`nachricht-${nachricht.id}`} hervorgehoben={hervorgehoben}>
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
              <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.erwaehnt}>
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
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ButtonLink to={threadPfad(nachricht)} variant="quiet" groesse="kompakt">
            {nachricht.reply_count === 0
              ? 'Antworten'
              : nachricht.reply_count === 1
                ? `1 Antwort${nachricht.last_reply_at ? ` · ${nachrichtenzeit(nachricht.last_reply_at, zeitzone)}` : ''}`
                : `${nachricht.reply_count} Antworten${nachricht.last_reply_at ? ` · ${nachrichtenzeit(nachricht.last_reply_at, zeitzone)}` : ''}`}
          </ButtonLink>
          {marke?.fuerMich ? (
            <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.erwaehnt}>
              Für dich
            </Badge>
          ) : marke && marke.neu > 0 ? (
            <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.neu}>
              {marke.neu} neu
            </Badge>
          ) : null}
        </div>
      ) : null}
    </Verlaufseintrag>
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

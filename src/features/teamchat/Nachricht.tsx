import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Chip } from '@/components/ui/Chip';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { TextArea } from '@/components/ui/TextArea';
import { Textlink } from '@/components/ui/Textlink';
import { Verlaufseintrag } from '@/components/ui/Verlauf';
import {
  REAKTIONEN,
  TEAMCHAT_KEY,
  bearbeiteNachricht,
  ohneInhalt,
  reagiere,
  type Gespraechsart,
  type Nachricht,
  type Person,
} from './api';
import { AnhangZeilen } from './Anhaenge';
import type { Ausgangseintrag } from './ausgang';
import { NACHRICHT_MAX, alleErwaehnt, erwaehnte } from './erwaehnung';
import { FormatierterText } from './format';
import { anriss, ohneFormatierung } from './formatierung';
import { Lesezeichen, Nadel } from './Zeichen';
import { nachrichtenzeit } from './zeit';

/**
 * Eine Nachricht im Verlauf (TEAM-002): Wer und wann, der formatierte Text,
 * Reaktionen zum Antippen und - im Gespräch - der Weg in den Thread. Kein
 * „gelesen von“, kein Status (ANN-609). Folgt sie derselben Person binnen
 * fünf Minuten, hängt sie ohne Kopf an der vorigen (wie Slack).
 *
 * Was noch im Ausgang liegt, steht mit seinem Zustand da - „wird gesendet“,
 * „kein Netz“ oder abgelehnt mit Grund - und ist bis dahin ohne Handlungen.
 */
export function NachrichtZeile({
  nachricht,
  ausgang,
  art,
  zeitzone,
  eigeneId,
  eigenerName,
  namen,
  personen,
  fortsetzung,
  tag,
  neu,
  hervorgehoben,
  gesperrt,
  bearbeiten,
  threadLink,
  zumThread,
  beobachte,
  onAktionen,
  onBearbeitenEnde,
  onErneut,
  onVerwerfen,
  onZurueckInsFeld,
}: {
  nachricht: Nachricht;
  /** Noch nicht beim Server: der Zustand im Ausgang. */
  ausgang?: Ausgangseintrag | undefined;
  art: Gespraechsart;
  zeitzone: string;
  eigeneId: string | null;
  eigenerName: string | null;
  /** Namen für die Hervorhebung von Erwähnungen. */
  namen: readonly string[];
  /** Wen man beim Bearbeiten erwähnen kann. */
  personen: readonly Person[];
  fortsetzung: boolean;
  /** Tagestrenner über der Nachricht. */
  tag: string | null;
  /** Die Linie „Neu“ darüber. */
  neu: boolean;
  hervorgehoben: boolean;
  gesperrt: boolean;
  bearbeiten: boolean;
  /** Im Gespräch an einer Ausgangsnachricht: der Weg in ihren Thread. */
  threadLink?: string | undefined;
  /** Im Gespräch an einer Antwort „auch im Gespräch“: der Weg zu ihrem Thread. */
  zumThread?: string | undefined;
  /** Meldet die Nachricht dem Lesestand. */
  beobachte?: ((element: HTMLElement | null) => void) | undefined;
  onAktionen: () => void;
  onBearbeitenEnde: () => void;
  onErneut?: () => void;
  onVerwerfen?: () => void;
  onZurueckInsFeld?: () => void;
}) {
  const queryClient = useQueryClient();
  const reagieren = useMutation({
    mutationFn: (schluessel: (typeof REAKTIONEN)[number]['schluessel']) =>
      reagiere(nachricht.id, schluessel),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY }),
  });
  const leer = nachricht.body === null;
  const fuerMich = eigeneId !== null && nachricht.mentions.includes(eigeneId);
  const name = nachricht.author_name ?? 'Ehemaliges Teammitglied';

  let kopf: ReactNode = null;
  if (!fortsetzung || neu || tag) {
    kopf = (
      <p className="text-ink-muted text-sm">
        <span className="text-ink font-semibold">{name}</span> ·{' '}
        <time dateTime={nachricht.created_at}>
          {nachrichtenzeit(nachricht.created_at, zeitzone)}
        </time>
        {nachricht.edited ? ' · bearbeitet' : ''}
      </p>
    );
  }

  return (
    <Verlaufseintrag
      id={`nachricht-${nachricht.id}`}
      kennung={nachricht.id}
      {...(beobachte ? { ref: beobachte } : {})}
      hervorgehoben={hervorgehoben}
      fortsetzung={fortsetzung && !neu && !tag}
    >
      {tag ? <p className="text-ink-muted mb-2 text-sm font-semibold">{tag}</p> : null}
      {neu ? (
        <p className="border-accent text-accent mb-2 border-t-2 pt-1 text-sm font-semibold">Neu</p>
      ) : null}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {kopf}
          {nachricht.also_in_channel && zumThread ? (
            <p className="text-ink-muted mt-1 text-sm">
              <Textlink to={zumThread}>
                Antwort an {nachricht.root_author_name ?? 'ein ehemaliges Teammitglied'}
              </Textlink>
              {nachricht.root_body ? (
                <span className="italic">
                  {' '}
                  „{anriss(ohneFormatierung(nachricht.root_body), 80)}“
                </span>
              ) : null}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-1.5 empty:hidden">
            {fuerMich && !leer ? (
              <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.erwaehnt}>
                Für dich
              </Badge>
            ) : null}
            {nachricht.pinned ? <Badge eigenesZeichen={<Nadel />}>Angeheftet</Badge> : null}
            {nachricht.saved ? <Badge eigenesZeichen={<Lesezeichen />}>Für später</Badge> : null}
          </div>
          {bearbeiten && nachricht.body !== null ? (
            <Bearbeiten
              nachricht={nachricht}
              art={art}
              personen={personen}
              onFertig={onBearbeitenEnde}
            />
          ) : leer ? (
            <p className="text-liste text-ink-muted mt-1 italic">{ohneInhalt(nachricht)}</p>
          ) : nachricht.body === '' ? null : (
            <div className="mt-1">
              <FormatierterText
                text={nachricht.body ?? ''}
                namen={namen}
                eigenerName={eigenerName}
              />
            </div>
          )}
          {/* TEAM-003: Anhänge ohne Vorschau; im Ausgang noch nicht zu öffnen. */}
          <AnhangZeilen anhaenge={nachricht.attachments} aktiv={!ausgang} />
        </div>
        {!ausgang && !bearbeiten ? (
          <Symbolknopf beschriftung={`Handlungen zur Nachricht von ${name}`} onClick={onAktionen}>
            ⋯
          </Symbolknopf>
        ) : null}
      </div>

      {reagieren.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {reagieren.error.message}
        </Statusmeldung>
      ) : null}
      {nachricht.reactions.length > 0 ? (
        <div role="group" aria-label="Reaktionen" className="mt-2 flex flex-wrap gap-1.5">
          {nachricht.reactions.map((r) => {
            const zeichen = REAKTIONEN.find((x) => x.schluessel === r.reaction);
            return (
              <Chip
                key={r.reaction}
                gewaehlt={r.own}
                disabled={gesperrt || reagieren.isPending}
                onClick={() => reagieren.mutate(r.reaction)}
              >
                <span aria-hidden="true">{zeichen?.zeichen}</span>
                <span className="sr-only">
                  {zeichen?.name}: {r.names.join(', ')},
                </span>{' '}
                {r.count}
              </Chip>
            );
          })}
        </div>
      ) : null}

      {threadLink && (nachricht.reply_count > 0 || !gesperrt) && !ausgang ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ButtonLink to={threadLink} variant="quiet" groesse="kompakt">
            {nachricht.reply_count === 0
              ? 'Antworten'
              : `${nachricht.reply_count === 1 ? '1 Antwort' : `${nachricht.reply_count} Antworten`}${
                  nachricht.last_reply_at
                    ? ` · ${nachrichtenzeit(nachricht.last_reply_at, zeitzone)}`
                    : ''
                }`}
          </ButtonLink>
          {nachricht.mentioned_in_new_replies ? (
            <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.erwaehnt}>
              Für dich
            </Badge>
          ) : nachricht.new_replies > 0 ? (
            <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.neu}>
              {nachricht.new_replies} neu
            </Badge>
          ) : null}
        </div>
      ) : null}

      {ausgang ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {ausgang.zustand === 'sendet' ? (
            <Statusmeldung>Wird gesendet …</Statusmeldung>
          ) : ausgang.zustand === 'laedt' ? (
            <>
              {ausgang.anhaengeOhneNetz ? (
                <>
                  {/* Kein Versprechen: Von selbst versucht es ein Anhang nur eine
                      Weile und mit dem Netz (Zweitreview TEAM-005). */}
                  <Statusmeldung ton="warnung">Anhang nicht hochgeladen – kein Netz?</Statusmeldung>
                  <Button type="button" variant="quiet" groesse="kompakt" onClick={onErneut}>
                    Jetzt versuchen
                  </Button>
                </>
              ) : (
                // Die Anhänge laden noch; danach geht sie von selbst (ANN-654).
                <Statusmeldung>Lädt Anhänge hoch …</Statusmeldung>
              )}
              {/* Noch nicht beim Server: Zurück ins Feld geht ohne Doppel. */}
              <Button type="button" variant="quiet" groesse="kompakt" onClick={onZurueckInsFeld}>
                Bearbeiten
              </Button>
            </>
          ) : ausgang.zustand === 'wartet' ? (
            <>
              {/* Der Ausgang liegt im Arbeitsspeicher (ANN-641): Er sendet, solange
                  die App läuft; das Abmelden fragt vorher (`AusgangAbmeldewache`). */}
              <Statusmeldung ton="warnung">
                Kein Netz – wird gesendet, sobald Empfang da ist und die App läuft.
              </Statusmeldung>
              <Button variant="quiet" groesse="kompakt" onClick={onErneut}>
                Jetzt versuchen
              </Button>
            </>
          ) : (
            <>
              <Statusmeldung ton="fehler">
                Nicht gesendet: {ausgang.fehler ?? 'Der Server hat abgelehnt.'}
              </Statusmeldung>
              <Button variant="quiet" groesse="kompakt" onClick={onZurueckInsFeld}>
                Bearbeiten
              </Button>
              {/* Ungesendeter Text ist danach fort - nur mit Rückfrage (DESIGN.md 9.16). */}
              <Rueckfrage
                ausloeser="Verwerfen"
                ausloeserVariante="quiet"
                ausloeserGroesse="kompakt"
                bestaetigen="Ja, verwerfen"
                onBestaetigen={() => onVerwerfen?.()}
              >
                {ausgang.anhaenge.length > 0
                  ? 'Text und Anhänge sind danach fort.'
                  : 'Der Text ist danach fort.'}
              </Rueckfrage>
            </>
          )}
        </div>
      ) : null}
    </Verlaufseintrag>
  );
}

function Bearbeiten({
  nachricht,
  art,
  personen,
  onFertig,
}: {
  nachricht: Nachricht;
  art: Gespraechsart;
  personen: readonly Person[];
  onFertig: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(nachricht.body ?? '');
  // Mit Anhängen darf der Text leer werden (ANN-653).
  const mitAnhang = nachricht.attachments.length > 0;
  const speichern = useMutation({
    mutationFn: () =>
      bearbeiteNachricht({
        id: nachricht.id,
        text,
        erwaehnt: erwaehnte(text, personen),
        alle: alleErwaehnt(text, art),
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
        if (text.trim() || mitAnhang) speichern.mutate();
      }}
    >
      <TextArea
        label="Nachricht ändern"
        value={text}
        rows={3}
        maxLength={NACHRICHT_MAX}
        autoFocus
        error={speichern.isError ? speichern.error.message : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onFertig();
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          groesse="kompakt"
          disabled={(!text.trim() && !mitAnhang) || speichern.isPending}
        >
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
        {/* Im Formular: ohne `type` speicherte „Abbrechen“ die Änderung. */}
        <Button type="button" variant="quiet" groesse="kompakt" onClick={onFertig}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

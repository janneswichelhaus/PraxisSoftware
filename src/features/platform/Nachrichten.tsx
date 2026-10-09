import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, type Ton } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import {
  ladeNachrichten,
  ladePlaene,
  nachrichtErledigen,
  nachrichtNachtragen,
  nachrichtStellen,
  nachrichtenSchluessel,
  plaeneSchluessel,
  type Nachricht,
  type NachrichtEintrag,
  type Plattformzugang,
} from './api';
import {
  NICHT_AKUT,
  NOTFALL,
  OHNE_EINWILLIGUNG,
  THEMA_NAME,
  THEMEN,
  zusage,
  type Thema,
} from './nachrichtentexte';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { datum, tagKurz, uhrzeit } from './zeit';

/** Höchstlänge eines Eintrags - zugleich die Grenze des Servers. */
export const NACHRICHT_MAX = 2000;

/**
 * Reiter „Nachrichten" (KOM-001, DSN-001 4.1): „Wie frage ich die Praxis?"
 *
 * Kein offener Chat, sondern ein Vorgang mit Thema, Bezug und Zustand
 * (IDEA-KOM-001). Über jedem Eingabefeld stehen Zusage und Notfallhinweis,
 * dauerhaft und für alle gleich (IDEA-KOM-002) - nie abhängig vom Inhalt
 * (ADR-006 Punkt 4). Was die Person sieht, liefert der Server über den Zugang.
 */
export function Nachrichten({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${PLATTFORM_PFAD}${pfad}${bereich ? `?${bereich}` : ''}`;
  const daten = useQuery({
    queryKey: nachrichtenSchluessel(zugang.access_id),
    queryFn: () => ladeNachrichten(zugang.access_id),
  });

  if (daten.isPending) return <LoadingState label="Ihre Nachrichten werden geladen …" />;
  if (daten.data === undefined) {
    return (
      <ErrorState
        title="Ihre Nachrichten konnten nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => daten.refetch()}
      />
    );
  }
  const { messages, can_write, response_workdays } = daten.data;
  const laufend = messages.filter((m) => m.status !== 'closed');
  const erledigt = messages.filter((m) => m.status === 'closed');

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-accent text-h3 font-bold">Nachrichten</h1>
        {can_write ? <ButtonLink to={mit('/nachrichten/neu')}>Neue Nachricht</ButtonLink> : null}
      </div>
      {suche.get('gesendet') === '1' ? (
        <Statusmeldung ton="erfolg" className="mt-4">
          Ihre Nachricht ist bei der Praxis angekommen.
        </Statusmeldung>
      ) : null}
      <Notfallhinweis werktage={response_workdays} className="mt-4" />
      {!can_write ? (
        <p className="text-ink mt-4 max-w-prose text-base leading-relaxed">
          Sie können Ihre Nachrichten hier noch lesen. Neue Fragen stellen Sie bitte direkt bei der
          Praxis.
        </p>
      ) : null}

      <Section titel="Ihre Nachrichten">
        {laufend.length === 0 ? (
          <p className="text-ink max-w-prose text-base leading-relaxed">
            {can_write
              ? 'Zurzeit ist keine Frage offen. Über „Neue Nachricht“ schreiben Sie der Praxis.'
              : 'Zurzeit ist keine Frage offen.'}
          </p>
        ) : (
          <ListRows>
            {laufend.map((m) => (
              <Nachrichtzeile key={m.id} nachricht={m} to={mit(`/nachrichten/${m.id}`)} />
            ))}
          </ListRows>
        )}
      </Section>
      {erledigt.length > 0 ? (
        <Section titel="Erledigt">
          <ListRows>
            {erledigt.map((m) => (
              <Nachrichtzeile key={m.id} nachricht={m} to={mit(`/nachrichten/${m.id}`)} gedaempft />
            ))}
          </ListRows>
        </Section>
      ) : null}
    </>
  );
}

/**
 * Zusage und Notfallhinweis (IDEA-KOM-002, DSN-001 4.1): an jedem
 * Eingabefeld, dauerhaft, ohne Schließen-Knopf.
 */
export function Notfallhinweis({
  werktage,
  className = '',
}: {
  werktage: number;
  className?: string;
}) {
  return (
    <div
      role="note"
      aria-label="Hinweis zu Antwortzeit und Notfällen"
      className={`border-line bg-surface rounded-card border p-4 text-base leading-relaxed ${className}`.trim()}
    >
      <p className="text-ink">{zusage(werktage)}</p>
      <p className="text-ink mt-1">
        <strong>{NICHT_AKUT}</strong> {NOTFALL}
      </p>
    </div>
  );
}

const ZUSTAND: Record<Nachricht['status'], { wort: string; ton: Ton }> = {
  open: { wort: 'bei der Praxis', ton: 'neutral' },
  answered: { wort: 'beantwortet', ton: 'akzent' },
  closed: { wort: 'erledigt', ton: 'positiv' },
};

function Nachrichtzeile({
  nachricht,
  to,
  gedaempft = false,
}: {
  nachricht: Nachricht;
  to: string;
  gedaempft?: boolean;
}) {
  const erste = nachricht.entries[0];
  const zustand = ZUSTAND[nachricht.status];
  return (
    <ListRow
      zeit={tagKurz(nachricht.last_entry_at)}
      titel={
        THEMA_NAME[nachricht.topic] +
        (nachricht.reference_label ? ` · ${nachricht.reference_label}` : '')
      }
      meta={erste ? kuerzen(erste.body, 80) : undefined}
      status={
        <Badge ton={zustand.ton}>
          {zustand.wort}
          {nachricht.status === 'open' && nachricht.due_on
            ? ` · Antwort bis ${datum(nachricht.due_on)}`
            : ''}
        </Badge>
      }
      to={to}
      gedaempft={gedaempft}
    />
  );
}

function kuerzen(text: string, laenge: number): string {
  return text.length > laenge ? `${text.slice(0, laenge - 1)}…` : text;
}

/**
 * „Neue Nachricht" in zwei Schritten (DSN-001 4.1): **Worum geht es?** und
 * **Text**. Bei „Übung" optional der Bezug auf einen zugewiesenen Plan und
 * eine Übung daraus (IDEA-KOM-001). Ein Hauptknopf, Abbrechen immer sichtbar.
 */
export function NeueNachricht({ zugang }: { zugang: Plattformzugang }) {
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const queryClient = useQueryClient();
  const zurueck = `${PLATTFORM_PFAD}/nachrichten${bereich ? `?${bereich}` : ''}`;

  const daten = useQuery({
    queryKey: nachrichtenSchluessel(zugang.access_id),
    queryFn: () => ladeNachrichten(zugang.access_id),
  });
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => ladePlaene(zugang.access_id),
  });

  // Aus der Übung heraus kommt der Bezug über die Adresse mit (Uebungen).
  const [thema, setThema] = useState<Thema | null>(suche.get('plan') ? 'exercise' : null);
  const [planId, setPlanId] = useState(suche.get('plan') ?? '');
  const [positionId, setPositionId] = useState(suche.get('uebung') ?? '');
  const [text, setText] = useState('');
  const [pruefung, setPruefung] = useState<string | null>(null);

  const senden = useMutation({
    mutationFn: () =>
      nachrichtStellen({
        zugangId: zugang.access_id,
        thema: thema!,
        text: text.trim(),
        planId: thema === 'exercise' && planId ? planId : null,
        positionId: thema === 'exercise' && planId && positionId ? positionId : null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: nachrichtenSchluessel(zugang.access_id) });
      void navigate(`${zurueck}${zurueck.includes('?') ? '&' : '?'}gesendet=1`, { replace: true });
    },
  });

  if (daten.isPending) return <LoadingState label="Wird geladen …" />;
  if (daten.data === undefined) {
    return (
      <ErrorState
        title="Das Formular konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => daten.refetch()}
      />
    );
  }
  const { health_topics, response_workdays, can_write } = daten.data;
  const themen = THEMEN.filter((t) => health_topics || t === 'organisational' || t === 'other');
  // Ein Thema aus der Adresse gilt nur, wenn es angeboten wird (ANN-311).
  const gewaehlt = thema && themen.includes(thema) ? thema : null;
  const plaeneMitUebung = (plaene.data?.plans ?? []).filter((p) => p.items.length > 0);
  const plan = plaeneMitUebung.find((p) => p.id === planId);

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    if (!gewaehlt) {
      setPruefung('Bitte wählen Sie, worum es geht.');
      return;
    }
    if (text.trim() === '') {
      setPruefung('Bitte schreiben Sie Ihre Frage.');
      return;
    }
    if (text.trim().length > NACHRICHT_MAX) {
      setPruefung(`Ihre Nachricht darf höchstens ${NACHRICHT_MAX} Zeichen lang sein.`);
      return;
    }
    setPruefung(null);
    senden.mutate();
  }

  const fehler = pruefung ?? (senden.isError ? senden.error.message : null);

  return (
    <>
      <Link
        to={zurueck}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zu den Nachrichten
      </Link>
      <h1 className="text-accent text-h3 font-bold">Neue Nachricht</h1>
      {!can_write ? (
        <Statusmeldung ton="warnung" className="mt-4">
          Neue Fragen stellen Sie bitte direkt bei der Praxis.
        </Statusmeldung>
      ) : (
        <form onSubmit={absenden} noValidate className="mt-6 flex flex-col gap-8">
          <fieldset>
            <legend className="text-ink mb-2 text-base font-semibold">1. Worum geht es?</legend>
            <div className="flex flex-col gap-2">
              {themen.map((t) => (
                <label
                  key={t}
                  className="border-line has-[:checked]:border-accent has-[:checked]:bg-accent-soft rounded-button flex min-h-12 cursor-pointer items-center gap-3 border px-4 py-2"
                >
                  <input
                    type="radio"
                    name="thema"
                    value={t}
                    checked={gewaehlt === t}
                    onChange={() => setThema(t)}
                    className="size-5 shrink-0"
                  />
                  <span className="text-ink text-base">{THEMA_NAME[t]}</span>
                </label>
              ))}
            </div>
            {!health_topics ? (
              <p className="text-ink-muted mt-2 text-sm">{OHNE_EINWILLIGUNG}</p>
            ) : null}
          </fieldset>

          {gewaehlt === 'exercise' && plaeneMitUebung.length > 0 ? (
            <div className="flex flex-col gap-4">
              <Select
                label="Zu welchem Plan? (freiwillig)"
                value={planId}
                onChange={(e) => {
                  setPlanId(e.target.value);
                  setPositionId('');
                }}
              >
                <option value="">Ohne Bezug</option>
                {plaeneMitUebung.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
              {plan ? (
                <Select
                  label="Zu welcher Übung? (freiwillig)"
                  value={positionId}
                  onChange={(e) => setPositionId(e.target.value)}
                >
                  <option value="">Zum ganzen Plan</option>
                  {plan.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.variant_lay_name}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <p className="text-ink text-base font-semibold">2. Ihre Frage</p>
            <Notfallhinweis werktage={response_workdays} />
            <TextArea
              label="Text"
              hint={`${text.trim().length} von ${NACHRICHT_MAX} Zeichen`}
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={senden.isPending}>
              {senden.isPending ? 'Wird gesendet …' : 'Nachricht senden'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

/**
 * Ein Vorgang mit seinen Einträgen. Nachtragen, solange er nicht erledigt
 * ist; „Erledigt" schließt ihn. Die Antwort steht als „Praxis", ohne Namen
 * (ADR-023 Punkt 22).
 */
export function NachrichtDetail({ zugang }: { zugang: Plattformzugang }) {
  const { nachrichtId } = useParams();
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const zurueck = `${PLATTFORM_PFAD}/nachrichten${bereich ? `?${bereich}` : ''}`;
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [pruefung, setPruefung] = useState<string | null>(null);
  const daten = useQuery({
    queryKey: nachrichtenSchluessel(zugang.access_id),
    queryFn: () => ladeNachrichten(zugang.access_id),
  });
  const neuLaden = () =>
    queryClient.invalidateQueries({ queryKey: nachrichtenSchluessel(zugang.access_id) });

  const nachtragen = useMutation({
    mutationFn: () => nachrichtNachtragen(zugang.access_id, nachrichtId!, text.trim()),
    onSuccess: async () => {
      setText('');
      await neuLaden();
    },
  });
  const erledigen = useMutation({
    mutationFn: () => nachrichtErledigen(zugang.access_id, nachrichtId!),
    onSuccess: neuLaden,
  });

  const zurueckLink = (
    <Link
      to={zurueck}
      className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
    >
      ← Zu den Nachrichten
    </Link>
  );

  if (daten.isPending) return <LoadingState label="Ihre Nachricht wird geladen …" />;
  if (daten.data === undefined) {
    return (
      <ErrorState
        title="Ihre Nachricht konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => daten.refetch()}
      />
    );
  }
  const nachricht = daten.data.messages.find((m) => m.id === nachrichtId);
  if (!nachricht) {
    return (
      <>
        {zurueckLink}
        <p className="text-ink text-base">Diese Nachricht gibt es hier nicht.</p>
      </>
    );
  }
  const offen = nachricht.status !== 'closed' && daten.data.can_write;

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim() === '') {
      setPruefung('Bitte schreiben Sie Ihre Nachricht.');
      return;
    }
    if (text.trim().length > NACHRICHT_MAX) {
      setPruefung(`Ihre Nachricht darf höchstens ${NACHRICHT_MAX} Zeichen lang sein.`);
      return;
    }
    setPruefung(null);
    nachtragen.mutate();
  }
  const fehler =
    pruefung ??
    (nachtragen.isError
      ? nachtragen.error.message
      : erledigen.isError
        ? erledigen.error.message
        : null);
  const zustand = ZUSTAND[nachricht.status];

  return (
    <>
      {zurueckLink}
      <h1 className="text-accent text-h3 font-bold">{THEMA_NAME[nachricht.topic]}</h1>
      {nachricht.reference_label ? (
        <p className="text-ink mt-1 text-base">Zu: {nachricht.reference_label}</p>
      ) : null}
      <p className="mt-2">
        <Badge ton={zustand.ton}>
          {zustand.wort}
          {nachricht.status === 'open' && nachricht.due_on
            ? ` · Antwort bis ${datum(nachricht.due_on)}`
            : ''}
        </Badge>
      </p>

      <ol aria-label="Verlauf" className="mt-6 flex flex-col gap-3">
        {nachricht.entries.map((e) => (
          <li
            key={e.id}
            className={`rounded-card border p-4 ${
              e.side === 'practice' ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
            }`}
          >
            <p className="text-ink-muted text-sm">
              <span className="text-ink font-semibold">{verfasser(e, zugang)}</span> ·{' '}
              {datum(e.created_at)}, {uhrzeit(e.created_at)}
            </p>
            <p className="text-ink mt-1 text-base leading-relaxed whitespace-pre-line">{e.body}</p>
          </li>
        ))}
      </ol>

      {nachricht.status === 'closed' ? (
        <p className="text-ink mt-6 max-w-prose text-base leading-relaxed">
          {nachricht.closed_by_side === 'practice'
            ? 'Die Praxis hat diese Nachricht als erledigt markiert.'
            : 'Diese Nachricht ist erledigt.'}{' '}
          Eine neue Frage stellen Sie über „Neue Nachricht“.
        </p>
      ) : null}

      {offen ? (
        <form onSubmit={absenden} noValidate className="mt-8 flex flex-col gap-4">
          <Notfallhinweis werktage={daten.data.response_workdays} />
          <TextArea
            label="Noch etwas ergänzen"
            hint={`${text.trim().length} von ${NACHRICHT_MAX} Zeichen`}
            rows={4}
            value={text}
            onChange={(ev) => setText(ev.target.value)}
          />
          {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={nachtragen.isPending}>
              {nachtragen.isPending ? 'Wird gesendet …' : 'Senden'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={erledigen.isPending}
              onClick={() => erledigen.mutate()}
            >
              Hat sich erledigt
            </Button>
          </div>
        </form>
      ) : null}
    </>
  );
}

function verfasser(eintrag: NachrichtEintrag, zugang: Plattformzugang): string {
  switch (eintrag.author) {
    case 'practice':
      return 'Praxis';
    case 'you':
      return 'Sie';
    case 'person':
      return zugang.represented_name ?? 'Die Person selbst';
    case 'representative':
      return eintrag.author_label
        ? zugang.access_kind === 'self'
          ? `${eintrag.author_label} für Sie`
          : eintrag.author_label
        : 'Vertretung';
  }
}

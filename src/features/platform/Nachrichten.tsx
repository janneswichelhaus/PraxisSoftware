import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, STATUSZEICHEN, type Ton } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import {
  nachrichtenSchluessel,
  plaeneSchluessel,
  type Nachricht,
  type NachrichtEintrag,
  type Plattformzugang,
} from './api';
import { useNurLesen, usePlattformApi } from './einsicht';
import { OHNE_EINWILLIGUNG, THEMA_NAME, THEMEN, type Thema } from './nachrichtentexte';
import { AnhaengeAbschnitt } from './Anhaenge';
import { Notfallkarte } from './Notfallkarte';
import { zeitmarke, type Ansicht } from './anhangtexte';
import { useEinmaligeRueckmeldung } from './einmaligeRueckmeldung';
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
  const api = usePlattformApi();
  // E-001: In der Einsicht wird keine Nachricht geschrieben.
  const nurLesen = useNurLesen();
  const [suche] = useSearchParams();
  const gesendet = useEinmaligeRueckmeldung('gesendet');
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${PLATTFORM_PFAD}${pfad}${bereich ? `?${bereich}` : ''}`;
  const daten = useQuery({
    queryKey: nachrichtenSchluessel(zugang.access_id),
    queryFn: () => api.ladeNachrichten(zugang.access_id),
  });

  const kopf = <PageHeader title="Nachrichten" />;
  if (daten.data === undefined) {
    return (
      <>
        {kopf}
        <Abfragezustand
          abfrage={daten}
          laden="Ihre Nachrichten werden geladen …"
          fehler="Ihre Nachrichten konnten nicht geladen werden."
          inKarte
        >
          {() => null}
        </Abfragezustand>
      </>
    );
  }
  const { messages, can_write, response_workdays } = daten.data;
  const laufend = messages.filter((m) => m.status !== 'closed');
  const erledigt = messages.filter((m) => m.status === 'closed');

  return (
    <>
      {kopf}
      {gesendet === '1' ? (
        <Rueckmeldung className="mb-4">Ihre Nachricht ist bei der Praxis angekommen.</Rueckmeldung>
      ) : null}
      <Notfallkarte werktage={response_workdays} />
      {!can_write ? (
        <p className="text-ink mt-4 max-w-prose text-base leading-relaxed">
          Sie können Ihre Nachrichten hier noch lesen. Neue Fragen stellen Sie bitte direkt bei der
          Praxis.
        </p>
      ) : null}

      <div className="mt-8">
        <Listenabschnitt
          titel="Ihre Nachrichten"
          leer={{
            titel: 'Zurzeit ist keine Frage offen.',
            ...(can_write
              ? { beschreibung: 'Über „Neue Nachricht“ schreiben Sie der Praxis.' }
              : {}),
          }}
        >
          {laufend.map((m) => (
            <Nachrichtzeile key={m.id} nachricht={m} to={mit(`/nachrichten/${m.id}`)} />
          ))}
        </Listenabschnitt>
      </div>
      {/* Die eine Aufgabe der Seite als Hauptknopf unter der Liste, am Telefon
          in voller Breite (DESIGN.md, Seitentyp „Plattform“) - nicht klein
          oben rechts im Kopf. */}
      {can_write && !nurLesen ? (
        <div className="mt-6">
          <ButtonLink to={mit('/nachrichten/neu')} groesse="normal" className="w-full sm:w-auto">
            Neue Nachricht
          </ButtonLink>
        </div>
      ) : null}
      {/* Erledigtes auf Abruf: Es wird mit jeder Frage länger (DESIGN.md, Regel 6). */}
      {erledigt.length > 0 ? (
        <div className="mt-8">
          <Disclosure summary="Erledigt" anzahl={erledigt.length} kopf="betont">
            <ListRows>
              {erledigt.map((m) => (
                <Nachrichtzeile
                  key={m.id}
                  nachricht={m}
                  to={mit(`/nachrichten/${m.id}`)}
                  gedaempft
                />
              ))}
            </ListRows>
          </Disclosure>
        </div>
      ) : null}
    </>
  );
}

// Jeder Zustand mit Zeichen und Wort (Regel 5; Sichtung 13.10.2026, A6):
// „neutral“ und „akzent“ tragen kein eigenes, deshalb `zeichen` (ANN-485).
// „erledigt“ nennt das Zeichen seines Tons noch einmal - für die Zeile im
// Kopf einer Nachricht, die ohne `Badge` auskommt (L9). „wartet auf Antwort“
// statt „bei der Praxis“ (DR-138): Das sagt, was die Person wissen will.
const ZUSTAND: Record<Nachricht['status'], { wort: string; ton: Ton; zeichen: string }> = {
  open: { wort: 'wartet auf Antwort', ton: 'neutral', zeichen: STATUSZEICHEN.wartet },
  answered: { wort: 'beantwortet', ton: 'akzent', zeichen: STATUSZEICHEN.antwort },
  closed: { wort: 'erledigt', ton: 'positiv', zeichen: '✓' },
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
  // Die Frist steht in der Nebenzeile, die Marke bleibt ein Wort (375 px).
  const frist =
    nachricht.status === 'open' && nachricht.due_on
      ? `Antwort bis ${datum(nachricht.due_on)}. `
      : '';
  return (
    <ListRow
      zeit={tagKurz(nachricht.last_entry_at)}
      titel={
        THEMA_NAME[nachricht.topic] +
        (nachricht.reference_label ? ` · ${nachricht.reference_label}` : '')
      }
      meta={`${frist}${erste ? kuerzen(erste.body, 80) : ''}`}
      status={
        <Badge ton={zustand.ton} eigenesZeichen={zustand.zeichen}>
          {zustand.wort}
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
  const api = usePlattformApi();
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const queryClient = useQueryClient();
  const zurueck = `${PLATTFORM_PFAD}/nachrichten${bereich ? `?${bereich}` : ''}`;

  const daten = useQuery({
    queryKey: nachrichtenSchluessel(zugang.access_id),
    queryFn: () => api.ladeNachrichten(zugang.access_id),
  });
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => api.ladePlaene(zugang.access_id),
  });

  // Aus der Übung heraus kommt der Bezug über die Adresse mit (Uebungen).
  const [thema, setThema] = useState<Thema | null>(suche.get('plan') ? 'exercise' : null);
  const [planId, setPlanId] = useState(suche.get('plan') ?? '');
  const [positionId, setPositionId] = useState(suche.get('uebung') ?? '');
  const [text, setText] = useState('');
  const [pruefung, setPruefung] = useState<string | null>(null);

  const senden = useMutation({
    mutationFn: () =>
      api.nachrichtStellen({
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

  if (daten.data === undefined) {
    return (
      <Abfragezustand
        abfrage={daten}
        laden="Wird geladen …"
        fehler="Das Formular konnte nicht geladen werden."
        inKarte
      >
        {() => null}
      </Abfragezustand>
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
      <Rueckweg standard={zurueck} beschriftung="Zu den Nachrichten" />
      <PageHeader title="Neue Nachricht" />
      {!can_write ? (
        <Statusmeldung ton="warnung">
          Neue Fragen stellen Sie bitte direkt bei der Praxis.
        </Statusmeldung>
      ) : (
        <form onSubmit={absenden} noValidate className="flex flex-col gap-8">
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
            <Notfallkarte werktage={response_workdays} />
            <TextArea
              label="Text"
              hint={`${text.trim().length} von ${NACHRICHT_MAX} Zeichen`}
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}

          <Formularfuss>
            {/* DR-140: ein Wort für dieselbe Handlung, wie beim Ergänzen. */}
            <Button type="submit" disabled={senden.isPending}>
              {senden.isPending ? 'Wird gesendet …' : 'Senden'}
            </Button>
            <Button type="button" variant="quiet" onClick={() => void navigate(zurueck)}>
              Abbrechen
            </Button>
          </Formularfuss>
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
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const { nachrichtId } = useParams();
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const zurueck = `${PLATTFORM_PFAD}/nachrichten${bereich ? `?${bereich}` : ''}`;
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [pruefung, setPruefung] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht | null>(null);
  const daten = useQuery({
    queryKey: nachrichtenSchluessel(zugang.access_id),
    queryFn: () => api.ladeNachrichten(zugang.access_id),
  });
  const neuLaden = () =>
    queryClient.invalidateQueries({ queryKey: nachrichtenSchluessel(zugang.access_id) });

  const nachtragen = useMutation({
    mutationFn: () => api.nachrichtNachtragen(zugang.access_id, nachrichtId!, text.trim()),
    onSuccess: async () => {
      setText('');
      await neuLaden();
    },
  });
  const erledigen = useMutation({
    mutationFn: () => api.nachrichtErledigen(zugang.access_id, nachrichtId!),
    onSuccess: neuLaden,
  });

  const zurueckLink = <Rueckweg standard={zurueck} beschriftung="Zu den Nachrichten" />;

  if (daten.data === undefined) {
    return (
      <>
        {zurueckLink}
        <Abfragezustand
          abfrage={daten}
          laden="Ihre Nachricht wird geladen …"
          fehler="Ihre Nachricht konnte nicht geladen werden."
          inKarte
        >
          {() => null}
        </Abfragezustand>
      </>
    );
  }
  const nachricht = daten.data.messages.find((m) => m.id === nachrichtId);
  if (!nachricht) {
    return (
      <>
        {zurueckLink}
        <EmptyState inKarte title="Diese Nachricht gibt es hier nicht." />
      </>
    );
  }
  // E-001: In der Einsicht ist kein Vorgang offen - nichts ergänzen, nichts erledigen.
  const offen = nachricht.status !== 'closed' && daten.data.can_write && !nurLesen;

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
      <PageHeader
        title={THEMA_NAME[nachricht.topic]}
        description={
          <>
            {nachricht.reference_label ? (
              <span className="text-ink block">Zu: {nachricht.reference_label}</span>
            ) : null}
            {/* Der Zustand als Zeile mit Zeichen und Wort, nicht als
                Abzeichen: Mit der Frist bräche die Pille bei 18 px auf zwei
                Zeilen (Sichtung 13.10.2026, L9). */}
            <span className="text-ink mt-1 block">
              <span aria-hidden="true">{zustand.zeichen} </span>
              <span className="font-semibold">{zustand.wort}</span>
              {nachricht.status === 'open' && nachricht.due_on
                ? ` · Antwort bis ${datum(nachricht.due_on)}`
                : ''}
            </span>
          </>
        }
      />

      <ol aria-label="Verlauf" className="flex flex-col gap-3">
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
            {e.attachment_mark_seconds != null ? (
              e.attachment_id &&
              (nachricht.attachments ?? []).some((a) => a.id === e.attachment_id) ? (
                nurLesen ? (
                  <p className="text-ink-muted mt-2 text-sm">
                    Bezieht sich auf das Video bei {zeitmarke(e.attachment_mark_seconds)}.
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-2"
                    onClick={() =>
                      setAnsicht({ anhangId: e.attachment_id!, ab: e.attachment_mark_seconds! })
                    }
                  >
                    Im Video bei {zeitmarke(e.attachment_mark_seconds)} ansehen
                  </Button>
                )
              ) : (
                <p className="text-ink-muted mt-2 text-sm">
                  Bezieht sich auf Ihr Video bei {zeitmarke(e.attachment_mark_seconds)}. Das Video
                  ist inzwischen gelöscht.
                </p>
              )
            ) : null}
          </li>
        ))}
      </ol>

      <AnhaengeAbschnitt
        zugang={zugang}
        nachricht={nachricht}
        daten={daten.data}
        offen={offen}
        ansicht={ansicht}
        setAnsicht={setAnsicht}
      />

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
          <Notfallkarte werktage={daten.data.response_workdays} />
          <TextArea
            label="Noch etwas ergänzen"
            hint={`${text.trim().length} von ${NACHRICHT_MAX} Zeichen`}
            rows={4}
            value={text}
            onChange={(ev) => setText(ev.target.value)}
          />
          {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
          <Formularfuss>
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
          </Formularfuss>
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

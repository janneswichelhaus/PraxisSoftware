import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, type Ton } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Personenbild } from '@/components/ui/Personenbild';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Wahlflaechen } from '@/components/ui/Wahlflaechen';
import {
  nachrichtenSchluessel,
  plaeneSchluessel,
  ladeNachrichten,
  ladePlaene,
  nachrichtErledigen,
  nachrichtNachtragen,
  nachrichtStellen,
  type Nachricht,
  type NachrichtEintrag,
  type Nachrichten as Nachrichtenstand,
  type Plattformzugang,
} from './api';
import {
  FRIST_VORBEI,
  OHNE_EINWILLIGUNG,
  THEMA_NAME,
  THEMEN,
  zaehlerAb,
  zusage,
  type Thema,
} from './nachrichtentexte';
import { AnhaengeAbschnitt } from './Anhaenge';
import { Notfallkarte } from './Notfallkarte';
import { zeitmarke, type Ansicht } from './anhangtexte';
import { useEinmaligeRueckmeldung } from './einmaligeRueckmeldung';
import { useRechner } from './geruestbreite';
import { Themenzeichen } from './Themenzeichen';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { datum, kalendertag, tagKurz, uhrzeit } from './zeit';

/** Höchstlänge eines Eintrags - zugleich die Grenze des Servers. */
export const NACHRICHT_MAX = 2000;

/**
 * Reiter „Nachrichten“: strukturierte Fragen an die Praxis, kein Chat. Der Notfallhinweis steht
 * nur über einem Eingabefeld, hier die Antwortfrist als ruhige Zeile (Design-Review Lauf 1).
 */
export function Nachrichten({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const gesendet = useEinmaligeRueckmeldung('gesendet');
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${PLATTFORM_PFAD}${pfad}${bereich ? `?${bereich}` : ''}`;
  const daten = useQuery({
    queryKey: nachrichtenSchluessel(zugang.access_id),
    queryFn: () => ladeNachrichten(zugang.access_id),
  });

  const kopf = <PageHeader title="Nachrichten" />;
  if (daten.data === undefined) {
    return (
      <>
        {kopf}
        <Abfragezustand
          abfrage={daten}
          laden="Ihre Nachrichten werden geladen …"
          fehler="Nachrichten nicht geladen."
          inKarte
        >
          {() => null}
        </Abfragezustand>
      </>
    );
  }
  const { can_write, response_workdays } = daten.data;

  return (
    <>
      {kopf}
      {gesendet === '1' ? (
        <Rueckmeldung className="mb-4">Ihre Nachricht ist bei der Praxis angekommen.</Rueckmeldung>
      ) : null}
      <p className="text-ink-muted max-w-prose text-base leading-relaxed">
        {can_write
          ? zusage(response_workdays)
          : 'Sie können Ihre Nachrichten hier noch lesen. Neue Fragen stellen Sie bitte direkt bei der Praxis.'}
      </p>
      <Nachrichtenliste daten={daten.data} mit={mit} />
      {/* Die eine Aufgabe der Seite unter der Liste, am Telefon in voller Breite. */}
      {can_write ? (
        <div className="mt-6">
          <ButtonLink to={mit('/nachrichten/neu')} groesse="normal" className="w-full sm:w-auto">
            Nachricht schreiben
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}

/** Laufende Gespräche, Erledigtes auf Abruf; am Rechner auch neben dem offenen Gespräch. */
function Nachrichtenliste({
  daten,
  mit,
  offenId,
}: {
  daten: Nachrichtenstand;
  mit: (pfad: string) => string;
  offenId?: string | undefined;
}) {
  const heute = kalendertag(new Date());
  const laufend = daten.messages.filter((m) => m.status !== 'closed');
  const erledigt = daten.messages.filter((m) => m.status === 'closed');
  const zeile = (m: Nachricht, gedaempft = false) => (
    <Nachrichtzeile
      key={m.id}
      nachricht={m}
      heute={heute}
      to={mit(`/nachrichten/${m.id}`)}
      aktiv={m.id === offenId}
      gedaempft={gedaempft}
      schmal={offenId !== undefined}
    />
  );
  return (
    <>
      <div className="mt-8">
        <Listenabschnitt titel="Ihre Nachrichten" leer={{ titel: 'Zurzeit keine Frage offen.' }}>
          {laufend.map((m) => zeile(m))}
        </Listenabschnitt>
      </div>
      {erledigt.length > 0 ? (
        <div className="mt-8">
          <Disclosure
            summary="Erledigt"
            anzahl={erledigt.length}
            kopf="betont"
            offen={erledigt.some((m) => m.id === offenId)}
          >
            <ListRows>{erledigt.map((m) => zeile(m, true))}</ListRows>
          </Disclosure>
        </div>
      ) : null}
    </>
  );
}

const WARTET = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    className="inline size-[1em] align-[-0.125em]"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const ANTWORT = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="inline size-[1em] align-[-0.125em]"
  >
    <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" />
  </svg>
);

interface Zustand {
  wort: string;
  ton: Ton;
  zeichen?: ReactNode;
}

// Zeichen und Wort, nie Farbe allein: Uhr für „wartet“, Sprechblase für eine Antwort. Ist die
// Frist verstrichen, sagt es ein eigener Zustand statt einer Zeile, die man überliest.
function zustandVon(nachricht: Nachricht, heute: string): Zustand {
  if (nachricht.status === 'closed') return { wort: 'Erledigt', ton: 'positiv' };
  if (nachricht.status === 'answered')
    return { wort: 'Beantwortet', ton: 'akzent', zeichen: ANTWORT };
  if (nachricht.due_on && nachricht.due_on < heute) return { wort: FRIST_VORBEI, ton: 'warnung' };
  return { wort: 'Wartet auf Antwort', ton: 'neutral', zeichen: WARTET };
}

function fristText(nachricht: Nachricht, heute: string): string | null {
  if (nachricht.status !== 'open' || !nachricht.due_on) return null;
  return nachricht.due_on < heute
    ? `Zugesagt bis ${datum(nachricht.due_on)}`
    : `Antwort bis ${datum(nachricht.due_on)}`;
}

function Nachrichtzeile({
  nachricht,
  heute,
  to,
  aktiv,
  gedaempft,
  schmal,
}: {
  nachricht: Nachricht;
  heute: string;
  to: string;
  aktiv: boolean;
  gedaempft: boolean;
  schmal: boolean;
}) {
  const erste = nachricht.entries[0];
  const zustand = zustandVon(nachricht, heute);
  const frist = fristText(nachricht, heute);
  const zeichen = (
    <Badge ton={zustand.ton} eigenesZeichen={zustand.zeichen}>
      {zustand.wort}
    </Badge>
  );
  // Neben dem Gespräch fehlt die Breite für drei Spalten: Datum, Thema und Zustand untereinander.
  if (schmal) {
    return (
      <ListRow
        bezeichnung={tagKurz(nachricht.last_entry_at)}
        titel={THEMA_NAME[nachricht.topic]}
        meta={<span className="mt-1 block">{zeichen}</span>}
        to={to}
        aktiv={aktiv}
        gedaempft={gedaempft}
      />
    );
  }
  return (
    <ListRow
      zeit={tagKurz(nachricht.last_entry_at)}
      titel={
        THEMA_NAME[nachricht.topic] +
        (nachricht.reference_label ? ` · ${nachricht.reference_label}` : '')
      }
      meta={`${frist ? `${frist}. ` : ''}${erste ? kuerzen(erste.body, 80) : ''}`}
      status={zeichen}
      to={to}
      aktiv={aktiv}
      gedaempft={gedaempft}
    />
  );
}

function kuerzen(text: string, laenge: number): string {
  return text.length > laenge ? `${text.slice(0, laenge - 1)}…` : text;
}

/** Der Zähler erst nahe der Grenze; vorher sagt er nichts. */
function zaehler(text: string): string | undefined {
  const laenge = text.trim().length;
  return laenge >= zaehlerAb(NACHRICHT_MAX) ? `${laenge} von ${NACHRICHT_MAX} Zeichen` : undefined;
}

function pruefe(text: string, leer: string): string | null {
  if (text.trim() === '') return leer;
  if (text.trim().length > NACHRICHT_MAX)
    return `Ihre Nachricht darf höchstens ${NACHRICHT_MAX} Zeichen lang sein.`;
  return null;
}

/**
 * „Nachricht schreiben“ auf einer Seite: Thema als große Wahl, die Notfallkarte genau einmal über
 * dem Textfeld, ein Hauptknopf. Vier Themen und ein Feld brauchen keinen geführten Ablauf (ANN-851).
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

  const kopf = (
    <>
      <Rueckweg standard={zurueck} beschriftung="Zu den Nachrichten" />
      <PageHeader title="Nachricht schreiben" />
    </>
  );
  if (daten.data === undefined) {
    return (
      <>
        {kopf}
        <Abfragezustand
          abfrage={daten}
          laden="Wird geladen …"
          fehler="Formular nicht geladen."
          inKarte
        >
          {() => null}
        </Abfragezustand>
      </>
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
    const fehlt = gewaehlt
      ? pruefe(text, 'Bitte schreiben Sie Ihre Frage.')
      : 'Bitte wählen Sie, worum es geht.';
    setPruefung(fehlt);
    if (!fehlt) senden.mutate();
  }

  const fehler = pruefung ?? (senden.isError ? senden.error.message : null);

  return (
    <>
      {kopf}
      {!can_write ? (
        <Statusmeldung ton="warnung">
          Neue Fragen stellen Sie bitte direkt bei der Praxis.
        </Statusmeldung>
      ) : (
        <form onSubmit={absenden} noValidate className="flex flex-col gap-8">
          <div>
            <Wahlflaechen
              titel="Worum geht es?"
              form="zeilen"
              wahlen={themen.map((t) => ({
                schluessel: t,
                text: THEMA_NAME[t],
                zeichen: <Themenzeichen thema={t} />,
              }))}
              gewaehlt={gewaehlt ? [gewaehlt] : []}
              onUmschalten={(t) => setThema(t as Thema)}
            />
            {!health_topics ? (
              <p className="text-ink-muted mt-2 text-sm">{OHNE_EINWILLIGUNG}</p>
            ) : null}
          </div>

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
            <Notfallkarte werktage={response_workdays} />
            <TextArea
              label="Ihre Frage"
              hint={zaehler(text)}
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}

          <Formularfuss>
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
 * Ein Gespräch: Kopf mit Thema und Praxis, der Verlauf links (Praxis) und rechts (eigene
 * Einträge). Am Rechner steht die Liste daneben, damit man zwischen Gesprächen wechselt, ohne
 * zurückzugehen.
 */
export function NachrichtDetail({ zugang }: { zugang: Plattformzugang }) {
  const { nachrichtId } = useParams();
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${PLATTFORM_PFAD}${pfad}${bereich ? `?${bereich}` : ''}`;
  const zurueck = mit('/nachrichten');
  const rechner = useRechner();
  const daten = useQuery({
    queryKey: nachrichtenSchluessel(zugang.access_id),
    queryFn: () => ladeNachrichten(zugang.access_id),
  });

  const zurueckLink = <Rueckweg standard={zurueck} beschriftung="Zu den Nachrichten" />;

  if (daten.data === undefined) {
    return (
      <>
        {zurueckLink}
        <Abfragezustand
          abfrage={daten}
          laden="Ihre Nachricht wird geladen …"
          fehler="Nachricht nicht geladen."
          inKarte
        >
          {() => null}
        </Abfragezustand>
      </>
    );
  }
  const nachricht = daten.data.messages.find((m) => m.id === nachrichtId);
  const gespraech = nachricht ? (
    <Gespraech key={nachricht.id} zugang={zugang} nachricht={nachricht} daten={daten.data} />
  ) : (
    <EmptyState markenform title="Diese Nachricht gibt es hier nicht." />
  );
  if (!rechner) {
    return (
      <>
        {zurueckLink}
        {gespraech}
      </>
    );
  }
  return (
    // Im Baum zuerst das Gespräch mit seiner h1, die Liste steht nur sichtbar links.
    <div className="grid grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-12">
      <div className="max-w-spalte col-start-2 row-start-1 min-w-0">{gespraech}</div>
      <nav aria-label="Ihre Nachrichten" className="col-start-1 row-start-1 -mt-8">
        <Nachrichtenliste daten={daten.data} mit={mit} offenId={nachrichtId} />
        {daten.data.can_write ? (
          <div className="mt-6">
            <ButtonLink to={mit('/nachrichten/neu')} variant="secondary">
              Nachricht schreiben
            </ButtonLink>
          </div>
        ) : null}
      </nav>
    </div>
  );
}

function Gespraech({
  zugang,
  nachricht,
  daten,
}: {
  zugang: Plattformzugang;
  nachricht: Nachricht;
  daten: Nachrichtenstand;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [pruefung, setPruefung] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht | null>(null);
  const neuLaden = () =>
    queryClient.invalidateQueries({ queryKey: nachrichtenSchluessel(zugang.access_id) });
  const nachtragen = useMutation({
    mutationFn: () => nachrichtNachtragen(zugang.access_id, nachricht.id, text.trim()),
    onSuccess: async () => {
      setText('');
      await neuLaden();
    },
  });
  const erledigen = useMutation({
    mutationFn: () => nachrichtErledigen(zugang.access_id, nachricht.id),
    onSuccess: neuLaden,
  });

  const offen = nachricht.status !== 'closed' && daten.can_write;
  const heute = kalendertag(new Date());
  const zustand = zustandVon(nachricht, heute);
  const frist = fristText(nachricht, heute);
  const praxis = zugang.organization_name || 'Ihre Praxis';

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    const fehlt = pruefe(text, 'Bitte schreiben Sie Ihre Nachricht.');
    setPruefung(fehlt);
    if (!fehlt) nachtragen.mutate();
  }
  const fehler =
    pruefung ??
    (nachtragen.isError
      ? nachtragen.error.message
      : erledigen.isError
        ? erledigen.error.message
        : null);

  return (
    <>
      <PageHeader
        title={THEMA_NAME[nachricht.topic]}
        description={
          <>
            {nachricht.reference_label ? (
              <span className="text-ink block">Zu: {nachricht.reference_label}</span>
            ) : null}
            {/* Eine Zeile statt Abzeichen: Mit der Frist bräche die Pille bei 18 px um. */}
            <span className="text-ink mt-1 block">
              {zustand.zeichen ? (
                <span aria-hidden="true">{zustand.zeichen} </span>
              ) : zustand.ton === 'warnung' ? (
                <span aria-hidden="true">! </span>
              ) : zustand.ton === 'positiv' ? (
                <span aria-hidden="true">✓ </span>
              ) : null}
              <span className="font-semibold">{zustand.wort}</span>
              {frist ? ` · ${frist}` : ''}
            </span>
          </>
        }
      />

      <div className="mb-6 flex items-center gap-3">
        <Personenbild name={praxis} farbe="tanne" groesse="karte" />
        <p className="min-w-0">
          <span className="text-ink-muted block">Ihre Frage an</span>{' '}
          <span className="text-ink block font-semibold">{praxis}</span>
        </p>
      </div>

      <ol aria-label="Verlauf" className="flex flex-col gap-3">
        {nachricht.entries.map((e) => (
          <Eintrag
            key={e.id}
            eintrag={e}
            zugang={zugang}
            nachricht={nachricht}
            onVideo={(a) => setAnsicht(a)}
          />
        ))}
      </ol>

      <AnhaengeAbschnitt
        zugang={zugang}
        nachricht={nachricht}
        daten={daten}
        offen={offen}
        ansicht={ansicht}
        setAnsicht={setAnsicht}
      />

      {nachricht.status === 'closed' ? (
        <p className="text-ink mt-6 max-w-prose text-base leading-relaxed">
          {nachricht.closed_by_side === 'practice'
            ? 'Von der Praxis als erledigt markiert.'
            : 'Diese Nachricht ist erledigt.'}
        </p>
      ) : null}

      {offen ? (
        <form onSubmit={absenden} noValidate className="mt-8 flex flex-col gap-4">
          <Notfallkarte werktage={daten.response_workdays} />
          <TextArea
            label="Noch etwas ergänzen"
            hint={zaehler(text)}
            rows={4}
            value={text}
            onChange={(ev) => setText(ev.target.value)}
          />
          {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
          <Formularfuss>
            <Button type="submit" disabled={nachtragen.isPending}>
              {nachtragen.isPending ? 'Wird gesendet …' : 'Senden'}
            </Button>
            {/* Leise: Die Person schließt selbst, aber es ist nicht die Hauptsache der Seite. */}
            <Button
              type="button"
              variant="quiet"
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

function Eintrag({
  eintrag: e,
  zugang,
  nachricht,
  onVideo,
}: {
  eintrag: NachrichtEintrag;
  zugang: Plattformzugang;
  nachricht: Nachricht;
  onVideo: (ansicht: Ansicht) => void;
}) {
  const praxis = e.side === 'practice';
  return (
    <li
      className={`rounded-card max-w-[85%] border p-4 max-[23rem]:max-w-full ${
        praxis ? 'border-accent bg-accent-soft self-start' : 'border-line bg-surface self-end'
      }`}
    >
      <p className="text-ink-muted text-sm">
        <span className="text-ink font-semibold">{verfasser(e, zugang)}</span> ·{' '}
        {datum(e.created_at)}, {uhrzeit(e.created_at)}
      </p>
      <p className="text-ink mt-1 text-base leading-relaxed whitespace-pre-line">{e.body}</p>
      {e.attachment_mark_seconds != null ? (
        e.attachment_id && (nachricht.attachments ?? []).some((a) => a.id === e.attachment_id) ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            onClick={() => onVideo({ anhangId: e.attachment_id!, ab: e.attachment_mark_seconds! })}
          >
            Im Video bei {zeitmarke(e.attachment_mark_seconds)} ansehen
          </Button>
        ) : (
          <p className="text-ink-muted mt-2 text-sm">
            Bezieht sich auf Ihr Video bei {zeitmarke(e.attachment_mark_seconds)}. Das Video ist
            inzwischen gelöscht.
          </p>
        )
      ) : null}
    </li>
  );
}

// Die Praxis antwortet ohne Namen der Person, die schreibt (ADR-023): „Ihre Praxis“ statt „Praxis“.
function verfasser(eintrag: NachrichtEintrag, zugang: Plattformzugang): string {
  switch (eintrag.author) {
    case 'practice':
      return 'Ihre Praxis';
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

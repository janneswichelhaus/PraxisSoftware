import { useState, type FormEvent } from 'react';
import { Field } from '@/components/ui/Field';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Disclosure, Inhaltsflaeche } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Verlauf, Verlaufseintrag } from '@/components/ui/Verlauf';
import { formatDate, formatLocalTime } from '@/lib/datum';
import { isOwner, type CurrentUser } from '@/features/core';
import {
  ANTWORTFRIST_KEY,
  RUECKFRAGEN_KEY,
  THEMA_LABEL,
  answerRueckfrage,
  closeRueckfrage,
  fetchAntwortfrist,
  fetchRueckfrage,
  personPfad,
  rueckfrageKey,
  saveAntwortfrist,
  kurzesDatum,
  verfasser,
  type Rueckfrage,
} from './api';
import { RueckfragenListe, Zustand } from './RueckfragenListe';
import { RueckfrageAnhaenge, type Ansicht } from './RueckfrageAnhaenge';
import { zeitmarke } from './zeitmarke';
import { InDieAkte } from './InDieAkte';

/** Höchstlänge einer Antwort - zugleich die Grenze des Servers. */
const ANTWORT_MAX = 2000;

/**
 * Kommunikation → Rückfragen (KOM-002, DSN-001 Abschnitt 6): Fragen aus der
 * Behandlung über die Plattform, bis sie erledigt sind. Offene stehen mit
 * „Antwort fällig bis …" oben, überfällige mit Wort (ANN-309). Die Liste
 * zeigt keinen Text - erst das Öffnen liest ihn (ADR-010).
 *
 * Seitentyp Liste (DESIGN.md): Kopf mit der Zusage als Zeile darunter, die
 * Liste in voller Breite, der Leerzustand in der Karte; das Ändern der Frist
 * (selten, nur owner) leise am Ende. Fragen aus dem Training kommen im
 * Bereich Training an (DSN-001 D1).
 */
export function RueckfragenPage({ user }: { user: CurrentUser }) {
  const [mitErledigten, setMitErledigten] = useState(false);
  const { data: frist } = useQuery({ queryKey: ANTWORTFRIST_KEY, queryFn: fetchAntwortfrist });
  const fristBekannt = frist !== undefined && frist !== null;

  return (
    <>
      <PageHeader
        title="Rückfragen"
        description={
          fristBekannt
            ? // Eine Zeile (DESIGN.md Regel 6, R2-neu2); Werktage sind Montag
              // bis Freitag (ANN-309).
              `Zusage: Antwort in ${frist} ${frist === 1 ? 'Werktag' : 'Werktagen'} (Mo–Fr).`
            : undefined
        }
      />
      <div className="mb-3">
        <Checkbox
          label="Erledigte anzeigen"
          checked={mitErledigten}
          onChange={() => setMitErledigten((x) => !x)}
        />
      </div>
      <RueckfragenListe
        art="treatment"
        mitErledigten={mitErledigten}
        leerInKarte
        leer={mitErledigten ? 'Noch keine Rückfrage.' : 'Keine offene Rückfrage.'}
      />
      {isOwner(user.roles) && fristBekannt ? (
        <div className="mt-8">
          <Disclosure summary="Antwortfrist ändern">
            <Antwortfrist bisher={frist} />
          </Disclosure>
        </div>
      ) : null}
    </>
  );
}

/**
 * Die Zusage an die Patient:innen ändern (ANN-309). Ändern darf nur owner,
 * wie die übrigen Praxisstammdaten; verbindlich prüft der Server.
 */
function Antwortfrist({ bisher }: { bisher: number }) {
  const queryClient = useQueryClient();
  const [wert, setWert] = useState(String(bisher));
  const speichern = useMutation({
    mutationFn: () => saveAntwortfrist(Number(wert)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ANTWORTFRIST_KEY }),
  });
  return (
    <form
      aria-label="Antwortfrist ändern"
      className="max-w-formular"
      onSubmit={(e) => {
        e.preventDefault();
        speichern.mutate();
      }}
    >
      <Select label="Antwortfrist" value={wert} onChange={(e) => setWert(e.target.value)}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? 'Werktag' : 'Werktage'}
          </option>
        ))}
      </Select>
      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {speichern.error.message}
        </Statusmeldung>
      ) : speichern.isSuccess ? (
        <Statusmeldung ton="erfolg" className="mt-3">
          Antwortfrist gespeichert.
        </Statusmeldung>
      ) : null}
      <div className="mt-4">
        <Button type="submit" groesse="kompakt" disabled={speichern.isPending}>
          Speichern
        </Button>
      </div>
    </form>
  );
}

/**
 * Eine Rückfrage (KOM-002): der Verlauf, die Antwort, „Als erledigt
 * markieren" - und seit KOM-004 „In die Akte übernehmen". Das Laden ist das
 * Lesen und steht als „Akte geöffnet" bzw. „Trainingsverhältnis geöffnet" im
 * Protokoll.
 *
 * Eine Arbeitsspalte (`max-w-spalte`): Rückweg, Kopf mit Person, Thema und
 * Zustand, der Verlauf als eine Karte mit Linien statt einer Karte je
 * Nachricht, darunter Anhänge, Antwort und - leise am Ende - „In die Akte".
 */
export function RueckfragePage({ user }: { user: CurrentUser }) {
  const { messageId } = useParams();
  const abfrage = useQuery({
    queryKey: rueckfrageKey(messageId ?? ''),
    queryFn: () => fetchRueckfrage(messageId ?? ''),
    enabled: Boolean(messageId),
    retry: false,
  });
  const zone = user.organizationTimeZone ?? 'Europe/Berlin';
  const [ansicht, setAnsicht] = useState<Ansicht | null>(null);

  return (
    <Abfragezustand
      abfrage={abfrage}
      laden="Die Rückfrage wird geladen …"
      fehler="Die Rückfrage konnte nicht geladen werden."
    >
      {(data) =>
        data ? (
          <Vorgang vorgang={data} zone={zone} ansicht={ansicht} setAnsicht={setAnsicht} />
        ) : (
          <>
            <PageHeader title="Rückfrage" />
            <p className="text-ink">Diese Rückfrage gibt es nicht oder sie ist nicht für dich.</p>
          </>
        )
      }
    </Abfragezustand>
  );
}

function Vorgang({
  vorgang: data,
  zone,
  ansicht,
  setAnsicht,
}: {
  vorgang: Rueckfrage;
  zone: string;
  ansicht: Ansicht | null;
  setAnsicht: (a: Ansicht | null) => void;
}) {
  const name = [data.given_name, data.family_name].filter(Boolean).join(' ') || 'Ohne Namen';
  const pfad = personPfad(data);
  // Im Training steht die Liste bei den Trainingskund:innen (DSN-001 D1).
  const zurueck = data.relationship_kind === 'training' ? '/training' : '/rueckfragen';

  return (
    <div className="max-w-spalte">
      <Rueckweg standard={zurueck} beschriftung="Zu den Rückfragen" />
      <PageHeader
        title={pfad ? <Link to={pfad}>{name}</Link> : name}
        kicker={data.relationship_kind === 'training' ? 'Rückfrage · Training' : 'Rückfrage'}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {THEMA_LABEL[data.topic] +
                (data.reference_label ? ` · zu ${data.reference_label}` : '')}
            </span>
            <Zustand zeile={data} />
          </span>
        }
      />
      <Section titel="Verlauf">
        <Inhaltsflaeche>
          <Verlauf beschriftung="Verlauf">
            {data.entries.map((e) => (
              <Verlaufseintrag key={e.id}>
                {/* Die Praxis antwortet eingerückt mit Linie in der
                    Hauptfarbe - wer spricht, sagt der Name davor. */}
                <div
                  className={e.side === 'practice' ? 'border-accent border-l-2 pl-3' : undefined}
                >
                  <p className="text-ink-muted text-sm">
                    <span className="text-ink font-semibold">{verfasser(e, name)}</span> ·{' '}
                    {kurzesDatum(e.created_at, zone)}, {formatLocalTime(e.created_at, zone)}
                  </p>
                  <p className="text-ink mt-1 leading-relaxed wrap-anywhere whitespace-pre-line">
                    {e.body}
                  </p>
                  {e.attachment_mark_seconds != null ? (
                    e.attachment_id &&
                    (data.attachments ?? []).some((a) => a.id === e.attachment_id) ? (
                      <Button
                        type="button"
                        variant="secondary"
                        groesse="kompakt"
                        className="mt-2"
                        onClick={() =>
                          setAnsicht({
                            anhangId: e.attachment_id!,
                            ab: e.attachment_mark_seconds!,
                          })
                        }
                      >
                        Im Video bei {zeitmarke(e.attachment_mark_seconds)} ansehen
                      </Button>
                    ) : (
                      <p className="text-ink-muted mt-2 text-sm">
                        Zeitmarke bei {zeitmarke(e.attachment_mark_seconds)} – das Video ist
                        gelöscht.
                      </p>
                    )
                  ) : null}
                </div>
              </Verlaufseintrag>
            ))}
          </Verlauf>
        </Inhaltsflaeche>
        {data.status === 'closed' && data.closed_at ? (
          <p className="text-ink-muted mt-3 text-sm">
            Erledigt am {formatDate(data.closed_at.slice(0, 10))}
            {data.closed_by_side === 'person' ? ' von der Person selbst' : ' durch die Praxis'}.
          </p>
        ) : null}
      </Section>
      <RueckfrageAnhaenge
        vorgang={data}
        name={name}
        zeitzone={zone}
        ansicht={ansicht}
        setAnsicht={setAnsicht}
      />
      {data.status !== 'closed' ? <Antworten vorgang={data} /> : null}
      {/* Endgültig und selten - leise am Ende, mit Rückfrage (ANN-312). */}
      {data.record_assigned_at || data.can_assign ? (
        <div className="border-line mt-8 border-t pt-6">
          <InDieAkte vorgang={data} zeitzone={zone} />
        </div>
      ) : null}
    </div>
  );
}

function Antworten({ vorgang }: { vorgang: Rueckfrage }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [pruefung, setPruefung] = useState<string | null>(null);
  // ADR-017 Punkt 68 (ANN-338): optional eine Stelle in einem Video.
  const videos = (vorgang.attachments ?? []).filter((a) => a.media_kind === 'video');
  const [videoId, setVideoId] = useState('');
  const [sekunde, setSekunde] = useState('');
  const video = videos.find((v) => v.id === videoId);
  const neuLaden = () => queryClient.invalidateQueries({ queryKey: RUECKFRAGEN_KEY });
  const antworten = useMutation({
    mutationFn: () =>
      answerRueckfrage(
        vorgang.id,
        text.trim(),
        video ? { anhangId: video.id, sekunde: Number(sekunde) } : null,
      ),
    onSuccess: async () => {
      setText('');
      setVideoId('');
      setSekunde('');
      await neuLaden();
    },
  });
  const erledigen = useMutation({
    mutationFn: () => closeRueckfrage(vorgang.id),
    onSuccess: neuLaden,
  });

  if (!vorgang.can_answer) {
    return (
      <Section titel="Antworten">
        <Statusmeldung ton="neutral">
          {vorgang.relationship_kind === 'training'
            ? 'Auf diese Rückfrage antworten Inhaber:in und Trainingsbetreuung. Bitte gib sie weiter.'
            : 'Auf Fragen zu Übungen und Beschwerden antworten Therapeut:innen. Bitte gib die Rückfrage weiter.'}
        </Statusmeldung>
      </Section>
    );
  }

  function absenden(e: FormEvent) {
    e.preventDefault();
    if (text.trim() === '') {
      setPruefung('Bitte eine Antwort schreiben.');
      return;
    }
    if (text.trim().length > ANTWORT_MAX) {
      setPruefung(`Die Antwort darf höchstens ${ANTWORT_MAX} Zeichen lang sein.`);
      return;
    }
    if (
      video &&
      (!/^\d+$/.test(sekunde.trim()) || Number(sekunde) > (video.duration_seconds ?? 0))
    ) {
      setPruefung(`Bitte die Sekunde im Video angeben, von 0 bis ${video.duration_seconds ?? 0}.`);
      return;
    }
    setPruefung(null);
    antworten.mutate();
  }
  const fehler =
    pruefung ??
    (antworten.isError
      ? antworten.error.message
      : erledigen.isError
        ? erledigen.error.message
        : null);

  return (
    <Section titel="Antworten">
      <form onSubmit={absenden} noValidate>
        <div className="flex flex-col gap-4">
          <TextArea
            label="Antwort an die Person"
            hint={`Die Person sieht die Antwort als „Praxis“, ohne deinen Namen. ${text.trim().length} von ${ANTWORT_MAX} Zeichen`}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {videos.length > 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select
                label="Auf eine Stelle im Video zeigen (freiwillig)"
                value={videoId}
                onChange={(e) => setVideoId(e.target.value)}
              >
                <option value="">Ohne Zeitmarke</option>
                {videos.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    Video {i + 1} ({zeitmarke(v.duration_seconds ?? 0)})
                  </option>
                ))}
              </Select>
              {video ? (
                <Field
                  label="Sekunde"
                  inputMode="numeric"
                  hint={`0 bis ${video.duration_seconds ?? 0}`}
                  value={sekunde}
                  onChange={(e) => setSekunde(e.target.value)}
                />
              ) : null}
            </div>
          ) : null}
          {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
        </div>
        {/* Hauptknopf zuerst, am Telefon untereinander in voller Breite. */}
        <Formularfuss>
          <Button type="submit" disabled={antworten.isPending}>
            {antworten.isPending ? 'Wird gesendet …' : 'Antwort senden'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={erledigen.isPending}
            onClick={() => erledigen.mutate()}
          >
            Als erledigt markieren
          </Button>
        </Formularfuss>
      </form>
    </Section>
  );
}

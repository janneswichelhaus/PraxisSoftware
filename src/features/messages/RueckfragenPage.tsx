import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { formatDate } from '@/lib/datum';
import { formatLocalTime } from '@/features/appointments/api';
import { isOwner, type CurrentUser } from '@/features/session/types';
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
import { InDieAkte } from './InDieAkte';

/** Höchstlänge einer Antwort - zugleich die Grenze des Servers. */
const ANTWORT_MAX = 2000;

/**
 * Kommunikation → Rückfragen (KOM-002, DSN-001 Abschnitt 6): Fragen aus der
 * Behandlung über die Plattform, bis sie erledigt sind. Offene stehen mit
 * „Antwort fällig bis …" oben, überfällige mit Wort (ANN-309). Die Liste
 * zeigt keinen Text - erst das Öffnen liest ihn (ADR-010).
 *
 * Fragen aus dem Training kommen im Bereich Training an (DSN-001 D1).
 */
export function RueckfragenPage({ user }: { user: CurrentUser }) {
  const [mitErledigten, setMitErledigten] = useState(false);
  return (
    <>
      <PageHeader
        title="Rückfragen"
        description="Fragen von Patient:innen über die Plattform – bis sie erledigt sind."
      />
      <div className="flex flex-col gap-6 lg:max-w-3xl">
        <Antwortfrist darfAendern={isOwner(user.roles)} />
        <Checkbox
          label="Erledigte anzeigen"
          checked={mitErledigten}
          onChange={() => setMitErledigten((x) => !x)}
        />
        <RueckfragenListe
          art="treatment"
          mitErledigten={mitErledigten}
          leer="Keine offene Rückfrage. Neue Fragen von Patient:innen erscheinen hier."
        />
      </div>
    </>
  );
}

/**
 * Die Zusage an die Patient:innen (ANN-309). Ändern darf nur owner, wie die
 * übrigen Praxisstammdaten; verbindlich prüft der Server.
 */
function Antwortfrist({ darfAendern }: { darfAendern: boolean }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ANTWORTFRIST_KEY, queryFn: fetchAntwortfrist });
  const [bearbeiten, setBearbeiten] = useState(false);
  const [wert, setWert] = useState('2');
  const speichern = useMutation({
    mutationFn: () => saveAntwortfrist(Number(wert)),
    onSuccess: async () => {
      setBearbeiten(false);
      await queryClient.invalidateQueries({ queryKey: ANTWORTFRIST_KEY });
    },
  });
  if (data === undefined || data === null) return null;
  const satz = `Zusage an die Patient:innen: Antwort in der Regel innerhalb von ${data} ${
    data === 1 ? 'Werktag' : 'Werktagen'
  } (Montag bis Freitag).`;
  if (!bearbeiten) {
    return (
      <p className="text-ink-muted text-sm">
        {satz}{' '}
        {darfAendern ? (
          <button
            type="button"
            className="text-accent min-h-11 underline"
            onClick={() => {
              setWert(String(data));
              setBearbeiten(true);
            }}
          >
            Ändern
          </button>
        ) : null}
      </p>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-3"
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
      <Button type="submit" disabled={speichern.isPending}>
        Speichern
      </Button>
      <Button type="button" variant="secondary" onClick={() => setBearbeiten(false)}>
        Abbrechen
      </Button>
      {speichern.isError ? (
        <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
      ) : null}
    </form>
  );
}

/**
 * Eine Rückfrage (KOM-002): der Verlauf, die Antwort, „Als erledigt
 * markieren" - und seit KOM-004 „In die Akte übernehmen". Das Laden ist das
 * Lesen und steht als „Akte geöffnet" bzw. „Trainingsverhältnis geöffnet" im
 * Protokoll.
 */
export function RueckfragePage({ user }: { user: CurrentUser }) {
  const { messageId } = useParams();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: rueckfrageKey(messageId ?? ''),
    queryFn: () => fetchRueckfrage(messageId ?? ''),
    enabled: Boolean(messageId),
    retry: false,
  });
  const zone = user.organizationTimeZone ?? 'Europe/Berlin';

  if (isPending) return <LoadingState label="Die Rückfrage wird geladen …" />;
  if (isError) {
    return (
      <ErrorState
        title="Die Rückfrage konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => refetch()}
      />
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Rückfrage" />
        <p className="text-ink">Diese Rückfrage gibt es nicht oder sie ist nicht für dich.</p>
      </>
    );
  }
  const name = [data.given_name, data.family_name].filter(Boolean).join(' ') || 'Ohne Namen';
  const pfad = personPfad(data);
  // Im Training steht die Liste bei den Trainingskund:innen (DSN-001 D1).
  const zurueck = data.relationship_kind === 'training' ? '/training' : '/rueckfragen';

  return (
    <>
      <Link
        to={zurueck}
        className="text-ink-muted hover:text-ink mb-2 inline-flex min-h-11 items-center text-sm"
      >
        ← Zu den Rückfragen
      </Link>
      <PageHeader
        title={pfad ? <Link to={pfad}>{name}</Link> : name}
        kicker={data.relationship_kind === 'training' ? 'Rückfrage · Training' : 'Rückfrage'}
        description={
          THEMA_LABEL[data.topic] + (data.reference_label ? ` · zu ${data.reference_label}` : '')
        }
      />
      <div className="flex flex-col gap-6 lg:max-w-3xl">
        <p>
          <Zustand zeile={data} />
        </p>
        <ol aria-label="Verlauf" className="flex flex-col gap-3">
          {data.entries.map((e) => (
            <li
              key={e.id}
              className={`rounded-card border p-4 ${
                e.side === 'practice' ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
              }`}
            >
              <p className="text-ink-muted text-sm">
                <span className="text-ink font-semibold">{verfasser(e, name)}</span> ·{' '}
                {kurzesDatum(e.created_at, zone)}, {formatLocalTime(e.created_at, zone)}
              </p>
              <p className="text-ink mt-1 leading-relaxed whitespace-pre-line">{e.body}</p>
            </li>
          ))}
        </ol>
        {data.status === 'closed' && data.closed_at ? (
          <p className="text-ink-muted text-sm">
            Erledigt am {formatDate(data.closed_at.slice(0, 10))}
            {data.closed_by_side === 'person' ? ' von der Person selbst' : ' durch die Praxis'}.
          </p>
        ) : null}
        <InDieAkte vorgang={data} zeitzone={zone} />
        {data.status !== 'closed' ? <Antworten vorgang={data} /> : null}
      </div>
    </>
  );
}

function Antworten({ vorgang }: { vorgang: Rueckfrage }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [pruefung, setPruefung] = useState<string | null>(null);
  const neuLaden = () => queryClient.invalidateQueries({ queryKey: RUECKFRAGEN_KEY });
  const antworten = useMutation({
    mutationFn: () => answerRueckfrage(vorgang.id, text.trim()),
    onSuccess: async () => {
      setText('');
      await neuLaden();
    },
  });
  const erledigen = useMutation({
    mutationFn: () => closeRueckfrage(vorgang.id),
    onSuccess: neuLaden,
  });

  if (!vorgang.can_answer) {
    return (
      <Statusmeldung ton="neutral">
        {vorgang.relationship_kind === 'training'
          ? 'Auf diese Rückfrage antworten Inhaber:in und Trainingsbetreuung. Bitte gib sie weiter.'
          : 'Auf Fragen zu Übungen und Beschwerden antworten Therapeut:innen. Bitte gib die Rückfrage weiter.'}
      </Statusmeldung>
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
      <form onSubmit={absenden} noValidate className="flex flex-col gap-4">
        <TextArea
          label="Antwort an die Person"
          hint={`Die Person sieht die Antwort als „Praxis“, ohne deinen Namen. ${text.trim().length} von ${ANTWORT_MAX} Zeichen`}
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
        <div className="flex flex-col gap-3 sm:flex-row">
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
        </div>
      </form>
    </Section>
  );
}

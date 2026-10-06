import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { TextArea } from '@/components/ui/TextArea';
import { formatLocalDate, formatLocalTimeRange } from '@/features/appointments/api';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  PLATFORM_REQUESTS_KEY,
  WUNSCHART_LABEL,
  cancelFromRequest,
  fetchPlatformRequests,
  resolvePlatformRequest,
  wunschText,
  type PlatformRequest,
} from './platform-requests-api';
import { formatDay } from './format';

const ANTWORT_MAX = 300;

/**
 * „Terminwünsche" in Offene Punkte (POR-011, DSN-001 Abschnitt 6): was von
 * der Plattform kommt, bis es erledigt ist. Je Wunsch die Person, was sie
 * wünscht, seit wann, und die passende Handlung: einen Termin anlegen, die
 * Absage eintragen (mit dem Zeitpunkt des Wunsches als Eingang, D4) oder
 * antworten. Welche Wünsche eine Rolle sieht, entscheidet der Server je
 * Kontext.
 */
export function Terminwuensche({ timeZone }: { timeZone: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: PLATFORM_REQUESTS_KEY,
    queryFn: () => fetchPlatformRequests('open'),
    retry: false,
  });

  return (
    <Section titel={data && data.length > 0 ? `Terminwünsche (${data.length})` : 'Terminwünsche'}>
      {isPending ? <LoadingState label="Terminwünsche werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Terminwünsche konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : null}
      {data && data.length === 0 ? (
        <p className="text-ink-muted text-sm">Kein offener Wunsch von der Plattform.</p>
      ) : null}
      {data && data.length > 0 ? (
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
          {data.map((wunsch) => (
            <Zeile key={wunsch.id} wunsch={wunsch} timeZone={timeZone} />
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

/** Wohin die Person führt: Akte oder Trainingsverhältnis. */
function personPfad(w: PlatformRequest): string | null {
  if (w.relationship_kind === 'treatment' && w.patient_id) return `/patienten/${w.patient_id}`;
  if (w.relationship_kind === 'training' && w.training_relationship_id)
    return `/training/${w.training_relationship_id}`;
  return null;
}

/** Der Weg, einen Termin für die Person anzulegen - am ersten Wunschtag. */
function neuerTerminPfad(w: PlatformRequest): string | null {
  const tag = w.preferred_days[0];
  const datum = tag ? `datum=${tag}` : '';
  if (w.relationship_kind === 'treatment' && w.patient_id) {
    return `/patienten/${w.patient_id}/termine/neu${datum ? `?${datum}` : ''}`;
  }
  if (w.relationship_kind === 'training' && w.training_relationship_id) {
    return `/training/termine/neu?kunde=${w.training_relationship_id}${datum ? `&${datum}` : ''}`;
  }
  return null;
}

/** Die Seite des Termins, um den es geht. */
function terminPfad(w: PlatformRequest): string | null {
  if (!w.appointment_id) return null;
  return w.relationship_kind === 'training'
    ? `/training/termine/${w.appointment_id}`
    : `/termine/${w.appointment_id}`;
}

function Zeile({ wunsch: w, timeZone }: { wunsch: PlatformRequest; timeZone: string }) {
  const queryClient = useQueryClient();
  const [antwort, setAntwort] = useState('');
  const neuLaden = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: PLATFORM_REQUESTS_KEY }),
      queryClient.invalidateQueries({ queryKey: ['appointments'] }),
    ]);
  const beantworten = useMutation({
    mutationFn: (outcome: 'done' | 'declined') =>
      resolvePlatformRequest({ id: w.id, outcome, answer: antwort }),
    onSuccess: neuLaden,
  });
  const absagen = useMutation({
    mutationFn: () => cancelFromRequest(w.id, w.appointment_updated_at ?? ''),
    onSuccess: neuLaden,
  });

  const name = [w.family_name, w.given_name].filter(Boolean).join(', ') || 'Unbekannte Person';
  const person = personPfad(w);
  const hier = '/offen';
  const text = wunschText(w);
  const termin = terminPfad(w);
  const terminAbgesagt = w.appointment_status === 'cancelled';
  const antwortfeld = (
    <TextArea
      label="Antwort an die Person (freiwillig)"
      hint={`${antwort.trim().length} von ${ANTWORT_MAX} Zeichen`}
      rows={2}
      value={antwort}
      onChange={(e) => setAntwort(e.target.value)}
    />
  );

  return (
    <li className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 wrap-anywhere">
          <p className="text-ink text-liste font-medium">
            {person ? (
              <Link to={mitRueckweg(person, hier)} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
            {w.relationship_kind === 'training' ? (
              <span className="text-ink-muted font-normal"> · Training</span>
            ) : null}
          </p>
          <p className="text-ink-muted text-sm">
            {WUNSCHART_LABEL[w.kind]} vom {formatDay(w.created_at, timeZone)}
            {w.representative_name ? ` · durch ${w.representative_name} (Vertretung)` : ''}
          </p>
        </div>
        <Badge ton="akzent">angefragt</Badge>
      </div>
      {w.appointment_starts_at && w.appointment_ends_at ? (
        <p className="text-ink text-sm">
          <span className="font-medium">Termin: </span>
          {termin ? (
            <Link to={mitRueckweg(termin, hier)} className="hover:underline">
              {formatLocalDate(w.appointment_starts_at, timeZone)},{' '}
              {formatLocalTimeRange(w.appointment_starts_at, w.appointment_ends_at, timeZone)}
            </Link>
          ) : (
            formatLocalDate(w.appointment_starts_at, timeZone)
          )}
          {terminAbgesagt ? ' · schon abgesagt' : ''}
        </p>
      ) : w.kind !== 'new' ? (
        <p className="text-ink-muted text-sm">Der Termin dazu besteht nicht mehr.</p>
      ) : null}
      {text ? (
        <p className="text-ink text-sm">
          <span className="font-medium">Wunsch: </span>
          {text}
        </p>
      ) : null}
      {w.note ? <p className="text-ink text-sm italic">„{w.note}“</p> : null}
      <div className="flex flex-wrap gap-2">
        {w.kind === 'new' && neuerTerminPfad(w) ? (
          <ButtonLink to={mitRueckweg(neuerTerminPfad(w)!, hier)} variant="secondary">
            Termin anlegen
          </ButtonLink>
        ) : null}
        {w.kind === 'cancel' && w.appointment_id && !terminAbgesagt ? (
          <Rueckfrage
            ausloeser="Absage eintragen"
            ausloeserVariante="primary"
            bestaetigen="Absage eintragen"
            bestaetigenLaeuft="Wird eingetragen …"
            fehler={absagen.error?.message}
            onBestaetigen={() => absagen.mutateAsync()}
          >
            <p>
              Der Termin wird mit dem Grund „Patient:in hat abgesagt“ abgesagt. Als Eingang der
              Absage gilt der Zeitpunkt des Wunsches, {formatDay(w.created_at, timeZone)}; ob ein
              Ausfallhonorar entsteht, rechnet die Anwendung daraus.
            </p>
          </Rueckfrage>
        ) : null}
        <Rueckfrage
          ausloeser="Erledigt"
          bestaetigen="Als erledigt beantworten"
          bestaetigenLaeuft="Wird beantwortet …"
          fehler={beantworten.error?.message}
          onBestaetigen={() => beantworten.mutateAsync('done')}
        >
          <p>Die Person sieht „erledigt“ und Ihre Antwort auf der Plattform.</p>
          {antwortfeld}
        </Rueckfrage>
        <Rueckfrage
          ausloeser="Nicht möglich"
          ausloeserVariante="quiet"
          bestaetigen="Als nicht möglich beantworten"
          bestaetigenLaeuft="Wird beantwortet …"
          fehler={beantworten.error?.message}
          onBestaetigen={() => beantworten.mutateAsync('declined')}
        >
          <p>
            Die Person sieht „nicht möglich“ und Ihre Antwort. Bitte sagen Sie, wie es weitergeht.
          </p>
          {antwortfeld}
        </Rueckfrage>
      </div>
    </li>
  );
}

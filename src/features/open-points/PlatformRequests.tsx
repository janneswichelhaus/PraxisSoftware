import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { TextArea } from '@/components/ui/TextArea';
import { Textlink } from '@/components/ui/Textlink';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { mitRueckweg } from '@/lib/rueckweg';
import { Arbeitszeile } from './Arbeitszeile';
import { abfragen } from './eingang';
import {
  PLATFORM_REQUESTS_KEY,
  REQUEST_KIND_LABEL,
  cancelFromRequest,
  resolvePlatformRequest,
  requestText,
  type PlatformRequest,
} from './platform-requests-api';
import { formatDay } from './format';
import { formatLocalDate, formatLocalTimeRange } from '@/lib/datum';

const ANTWORT_MAX = 300;

/**
 * „Terminwünsche" in Offene Punkte (POR-011, DSN-001 Abschnitt 6): was von
 * der Plattform kommt, bis es erledigt ist. Je Wunsch eine Zeile - die Person
 * (der Weg in Akte oder Trainingsverhältnis), was sie wünscht, seit wann -
 * und darunter die passende Handlung: einen Termin anlegen, die Absage
 * eintragen (mit dem Zeitpunkt des Wunsches als Eingang, D4) oder antworten.
 * Welche Wünsche eine Rolle sieht, entscheidet der Server je Kontext. Ohne
 * offenen Wunsch keine Gruppe.
 */
export function PlatformRequests({ timeZone }: { timeZone: string }) {
  const { data, isError, refetch } = useQuery(abfragen.terminwuensche());

  if (isError && !data) {
    return (
      <Section titel="Terminwünsche">
        <ErrorState
          title="Die Terminwünsche konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <Listenabschnitt titel="Terminwünsche" anzahl={data.length}>
      {data.map((wunsch) => (
        <Zeile key={wunsch.id} wunsch={wunsch} timeZone={timeZone} />
      ))}
    </Listenabschnitt>
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
  const text = requestText(w);
  const termin = terminPfad(w);
  const neuerTermin = w.kind === 'new' ? neuerTerminPfad(w) : null;
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
    <Arbeitszeile
      titel={<span className="wrap-anywhere">{name}</span>}
      meta={`${REQUEST_KIND_LABEL[w.kind]} vom ${formatDay(w.created_at, timeZone)}${
        w.relationship_kind === 'training' ? ' · Training' : ''
      }${w.representative_name ? ` · durch ${w.representative_name} (Vertretung)` : ''}`}
      {...(person ? { to: mitRueckweg(person, hier) } : {})}
      unten={
        <>
          {w.appointment_starts_at && w.appointment_ends_at ? (
            <p className="text-ink text-sm">
              <span className="font-medium">Termin: </span>
              {termin ? (
                <Textlink to={mitRueckweg(termin, hier)}>
                  {formatLocalDate(w.appointment_starts_at, timeZone)},{' '}
                  {formatLocalTimeRange(w.appointment_starts_at, w.appointment_ends_at, timeZone)}
                </Textlink>
              ) : (
                formatLocalDate(w.appointment_starts_at, timeZone)
              )}
              {terminAbgesagt ? ' · schon abgesagt' : ''}
            </p>
          ) : w.kind !== 'new' ? (
            <p className="text-ink-muted text-sm">Der Termin dazu besteht nicht mehr.</p>
          ) : null}
          {text || w.note ? (
            <div className="text-ink text-sm">
              {text ? (
                <p>
                  <span className="font-medium">Wunsch: </span>
                  {text}
                </p>
              ) : null}
              {w.note ? <p className="wrap-anywhere italic">„{w.note}“</p> : null}
            </div>
          ) : null}
          {/* Die Arbeit an der Zeile (L3), alle kompakt und keiner als
              Hauptknopf: Die Liste trägt viele Wünsche, die Seite einen
              Hauptknopf nur, wo es einen gibt. */}
          <div className="flex flex-wrap gap-2">
            {neuerTermin ? (
              <ButtonLink to={mitRueckweg(neuerTermin, hier)} variant="secondary" groesse="kompakt">
                Termin anlegen
              </ButtonLink>
            ) : null}
            {w.kind === 'cancel' && w.appointment_id && !terminAbgesagt ? (
              <Rueckfrage
                ausloeser="Absage eintragen"
                ausloeserGroesse="kompakt"
                bestaetigen="Absage eintragen"
                bestaetigenLaeuft="Wird eingetragen …"
                fehler={absagen.error?.message}
                onBestaetigen={() => absagen.mutateAsync()}
              >
                <p>
                  Der Termin wird mit dem Grund „Patient:in hat abgesagt“ abgesagt. Als Eingang der
                  Absage gilt der Zeitpunkt des Wunsches, {formatDay(w.created_at, timeZone)}; ob
                  ein Ausfallhonorar entsteht, rechnet die Anwendung daraus.
                </p>
              </Rueckfrage>
            ) : null}
            <Rueckfrage
              ausloeser="Erledigt"
              ausloeserGroesse="kompakt"
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
              ausloeserGroesse="kompakt"
              bestaetigen="Als nicht möglich beantworten"
              bestaetigenLaeuft="Wird beantwortet …"
              fehler={beantworten.error?.message}
              onBestaetigen={() => beantworten.mutateAsync('declined')}
            >
              <p>
                Die Person sieht „nicht möglich“ und Ihre Antwort. Bitte sagen Sie, wie es
                weitergeht.
              </p>
              {antwortfeld}
            </Rueckfrage>
          </div>
        </>
      }
    />
  );
}

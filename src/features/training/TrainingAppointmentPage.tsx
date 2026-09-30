import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import {
  canWriteTrainingClients,
  canWriteTrainingProtocols,
  type CurrentUser,
} from '@/features/session/types';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeLabels,
  cancelAppointment,
  cancellationReasonSchema,
  formatLocalDate,
  formatLocalTimeRange,
  type CancellationReason,
} from '@/features/appointments/api';
import { leseAngelegtenTermin } from '@/features/appointments/terminformular';
import {
  getTrainingAppointment,
  istProtokollierbar,
  listTrainingBases,
  trainingAbsageLabels,
  vereinbarungText,
  type TrainingAppointment,
} from './api';
import { TerminAbschluss, TrainingProtokoll } from './TrainingProtocol';

/**
 * Ein Trainingstermin (TRN-004, TRN-006).
 *
 * Gelesen über `get_training_appointment`: Ein Behandlungstermin ist dort
 * „nicht gefunden" - auch für owner, der ihn im Kalender sieht; er öffnet an
 * seiner eigenen Stelle (`/termine/:id`). Verschieben und Absagen laufen über
 * die vorhandenen Wege (ADR-022 Punkt 1). Seit TRN-EPIC-004 steht hier das
 * Trainingsprotokoll (owner und Trainingsbetreuung, ANN-184), und der Termin
 * lässt sich als durchgeführt vermerken und wieder öffnen (ANN-186).
 */
export function TrainingAppointmentPage({ user }: { user: CurrentUser }) {
  const { appointmentId = '' } = useParams();
  const termin = useQuery({
    queryKey: ['training-appointment', appointmentId],
    queryFn: () => getTrainingAppointment(appointmentId),
    retry: false,
  });

  if (termin.isPending) return <LoadingState />;
  if (termin.isError) {
    return (
      <>
        <Rueckweg standard="/kalender" />
        <ErrorState
          title="Der Trainingstermin konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => termin.refetch()}
        />
      </>
    );
  }
  if (!termin.data) {
    return (
      <>
        <Rueckweg standard="/kalender" />
        <EmptyState title="Trainingstermin nicht gefunden" />
      </>
    );
  }
  return <Ansicht termin={termin.data} user={user} />;
}

function Ansicht({ termin, user }: { termin: TrainingAppointment; user: CurrentUser }) {
  const [suche] = useSearchParams();
  const [meldung, setMeldung] = useState<string | null>(null);
  const zone = termin.organization_time_zone;
  const name = `${termin.client_given_name} ${termin.client_family_name}`;
  const darfSchreiben = canWriteTrainingClients(user.roles);
  const darfAendern = darfSchreiben && termin.status === 'confirmed';
  const darfAbschliessen =
    darfSchreiben && (termin.status === 'confirmed' || termin.status === 'completed');
  const darfProtokoll = canWriteTrainingProtocols(user.roles) && istProtokollierbar(termin.status);
  const angelegt = leseAngelegtenTermin(suche) === termin.id;
  const hier = `/training/termine/${termin.id}`;

  const vereinbarungen = useQuery({
    queryKey: ['training-bases', termin.training_relationship_id],
    queryFn: () => listTrainingBases(termin.training_relationship_id),
    enabled: termin.training_basis_id !== null,
    retry: false,
  });
  const vereinbarung = vereinbarungen.data?.find((v) => v.id === termin.training_basis_id);

  const ort =
    termin.appointment_type === 'practice'
      ? (termin.location_name ?? '—')
      : termin.appointment_type === 'video'
        ? 'Videotermin'
        : [
            [termin.visit_street, termin.visit_house_number].filter(Boolean).join(' '),
            [termin.visit_postal_code, termin.visit_city].filter(Boolean).join(' '),
          ]
            .filter(Boolean)
            .join(', ');

  return (
    <>
      <Rueckweg standard={leseRueckweg(suche, '/kalender')} />
      <PageHeader
        title="Trainingstermin"
        description={`${formatLocalDate(termin.starts_at, zone)}, ${formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)}`}
        actions={
          <Badge ton={appointmentStatusTon[termin.status]}>
            {appointmentStatusLabels[termin.status]}
          </Badge>
        }
      />

      {angelegt ? <Statusmeldung ton="erfolg">Trainingstermin angelegt.</Statusmeldung> : null}
      {meldung ? <Statusmeldung ton="erfolg">{meldung}</Statusmeldung> : null}

      <Section titel="Termin" rahmen>
        <DetailList>
          <DetailRow label={BEGRIFFE.trainingskundIn}>
            <Link
              className="text-accent hover:underline"
              to={mitRueckweg(`/training/${termin.training_relationship_id}`, hier)}
            >
              {name}
            </Link>
          </DetailRow>
          <DetailRow label="Betreuende Person">
            {`${termin.staff_given_name} ${termin.staff_family_name}`}
          </DetailRow>
          <DetailRow label="Art">{appointmentTypeLabels[termin.appointment_type]}</DetailRow>
          <DetailRow label="Ort">{ort || '—'}</DetailRow>
          <DetailRow label="Vereinbarung">
            {termin.training_basis_id === null
              ? 'Einzelstunde ohne Vereinbarung'
              : vereinbarung
                ? `Seit ${formatDate(vereinbarung.started_on)} · ${vereinbarungText(vereinbarung)}`
                : 'Vereinbarung'}
          </DetailRow>
          {termin.status === 'cancelled' && termin.cancellation_reason ? (
            <DetailRow label="Absagegrund">
              {trainingAbsageLabels[termin.cancellation_reason as CancellationReason] ?? '—'}
            </DetailRow>
          ) : null}
        </DetailList>
      </Section>

      {darfAendern || darfAbschliessen ? (
        <div className="mt-6 flex flex-wrap items-start gap-3">
          {darfAbschliessen ? <TerminAbschluss termin={termin} onGeaendert={setMeldung} /> : null}
          {darfAendern ? (
            <>
              <ButtonLink to={mitRueckweg(`${hier}/bearbeiten`, hier)} variant="secondary">
                Verschieben
              </ButtonLink>
              <Absagen
                termin={termin}
                name={name}
                onAbgesagt={() => setMeldung('Termin abgesagt.')}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {darfProtokoll ? (
        <div className="mt-6">
          <TrainingProtokoll termin={termin} />
        </div>
      ) : null}
    </>
  );
}

/**
 * Absagen über `cancel_appointment` (ADR-018 Punkt 2: endgültig).
 *
 * Ohne Frage nach dem Eingang und ohne Hinweis auf ein Ausfallhonorar: Am
 * Trainingstermin setzt der Server keinen Anlass (ANN-178) - die Frage wäre
 * hier eine Behauptung.
 */
function Absagen({
  termin,
  name,
  onAbgesagt,
}: {
  termin: TrainingAppointment;
  name: string;
  onAbgesagt: () => void;
}) {
  const queryClient = useQueryClient();
  const [grund, setGrund] = useState('');
  const [grundFehler, setGrundFehler] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (g: CancellationReason) => cancelAppointment(termin.id, termin.updated_at, g),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['training-appointment', termin.id] });
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['day-plan'] });
      void queryClient.invalidateQueries({ queryKey: ['training-bases'] });
      void queryClient.invalidateQueries({ queryKey: ['training-client-appointments'] });
      onAbgesagt();
    },
  });

  async function absagen() {
    const gewaehlt = cancellationReasonSchema.safeParse(grund);
    if (!gewaehlt.success) {
      setGrundFehler('Bitte einen Absagegrund auswählen.');
      throw new Error('Absagegrund fehlt');
    }
    setGrundFehler(undefined);
    await mutation.mutateAsync(gewaehlt.data);
  }

  return (
    <Rueckfrage
      ausloeser="Termin absagen"
      bestaetigen="Ja, Termin absagen"
      bestaetigenLaeuft="Wird abgesagt …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onAbbrechen={() => setGrundFehler(undefined)}
      onBestaetigen={absagen}
    >
      <p>
        Der Trainingstermin mit {name} wird als abgesagt geführt und gibt seinen Zeitraum frei. Eine
        Absage lässt sich nicht zurücknehmen – für einen neuen Termin bitte neu anlegen.
      </p>
      <div className="mt-3 max-w-xs">
        <Select
          label="Absagegrund"
          value={grund}
          error={grundFehler}
          onChange={(e) => {
            setGrund(e.target.value);
            setGrundFehler(undefined);
          }}
        >
          <option value="">Bitte wählen …</option>
          {Object.entries(trainingAbsageLabels).map(([wert, beschriftung]) => (
            <option key={wert} value={wert}>
              {beschriftung}
            </option>
          ))}
        </Select>
      </div>
    </Rueckfrage>
  );
}

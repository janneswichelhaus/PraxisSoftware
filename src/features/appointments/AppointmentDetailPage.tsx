import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canManageAppointments,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import { TreatmentNoteSection } from '@/features/documentation/TreatmentNoteSection';
import { NavigationZumTermin } from './NavigationStarten';
import {
  appointmentStatusLabels,
  cancelAppointment,
  appointmentTypeLabels,
  completeAppointment,
  fetchAppointment,
  folgeterminVorbelegung,
  formatLocalDate,
  formatLocalTime,
  formatLocalTimeRange,
  locationSummary,
  patientName,
  reopenAppointment,
  schreibeTerminVorbelegung,
  staffName,
  type Appointment,
} from './api';

/** Bezeichnung des Ortsfeldes - je nach Terminart eine andere Frage. */
function ortsBeschriftung(art: Appointment['appointment_type']): string {
  if (art === 'practice') return 'Standort';
  if (art === 'home_visit') return 'Anschrift';
  return 'Ort';
}

/**
 * Absage mit Rückfrage.
 *
 * Bewusst zweistufig: eine Absage betrifft eine reale Verabredung, und ein
 * versehentlicher Einzelklick soll sie nicht auslösen
 * (PROJECT_PRINCIPLES.md 13). Die Rückfrage ist Bedienkomfort - verbindlich
 * prüft `cancel_appointment` Berechtigung und Zustand erneut.
 *
 * Es ist ausdrücklich keine Löschung: der Termin bleibt erhalten. Die
 * Beschriftung vermeidet deshalb jede Löschsprache.
 */
function AbsageAktion({ appointment }: { appointment: Appointment }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => cancelAppointment(appointment.id, appointment.updated_at),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      // Der Kalender zeigt sonst weiter einen geplanten Termin.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  return (
    <Rueckfrage
      ausloeser="Termin absagen"
      bezeichnung="Termin absagen"
      bestaetigen="Ja, Termin absagen"
      bestaetigenLaeuft="Wird abgesagt …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onBestaetigen={() => mutation.mutateAsync()}
    >
      Der Termin am {formatLocalDate(appointment.starts_at, appointment.organization_time_zone)} um{' '}
      {formatLocalTime(appointment.starts_at, appointment.organization_time_zone)} Uhr für{' '}
      {patientName(appointment)} wird als abgesagt geführt. Er bleibt vollständig erhalten und gibt
      seinen Zeitraum wieder frei.
    </Rueckfrage>
  );
}

/**
 * Abschließen und Wiederöffnen - beide ohne Rückfrage.
 *
 * Anders als die Absage ist keiner der beiden Schritte endgültig: ein
 * versehentlicher Abschluss wird direkt wieder geöffnet und umgekehrt. Eine
 * Rückfrage wäre hier reine Reibung an einem Schritt, der am Ende jeder
 * Behandlung ansteht.
 *
 * Ausdrücklich ohne Prüfung auf eine Behandlungsdokumentation: der Abschluss
 * ist eine organisatorische Feststellung, kein Nachweis über Inhalte.
 */
function StatusAktion({
  appointment,
  aktion,
  beschriftung,
  laufend,
  variant,
}: {
  appointment: Appointment;
  aktion: (id: string, expectedUpdatedAt: string) => Promise<void>;
  beschriftung: string;
  laufend: string;
  variant: 'primary' | 'secondary';
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => aktion(appointment.id, appointment.updated_at),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      // Der Kalender führt den Termin sonst weiter im alten Status.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  return (
    <div>
      <Button
        type="button"
        variant={variant}
        disabled={mutation.isPending}
        onClick={() => {
          if (mutation.isPending) return;
          mutation.mutate();
        }}
      >
        {mutation.isPending ? laufend : beschriftung}
      </Button>
      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {mutation.error.message}
        </Statusmeldung>
      ) : null}
    </div>
  );
}

function AppointmentDetail({ appointment, user }: { appointment: Appointment; user: CurrentUser }) {
  const zone = appointment.organization_time_zone;
  const darfVerwalten = canManageAppointments(user.roles);
  // Abgesagte Termine sind terminal. Abgeschlossene sind es nicht, aber sie
  // werden erst wieder geoeffnet und dann bearbeitet - nicht ueber den
  // Abschluss hinweg. Verbindlich pruefen das die Serverfunktionen.
  const darfAendern = darfVerwalten && appointment.status === 'scheduled';
  const darfWiederOeffnen = darfVerwalten && appointment.status === 'completed';
  const darfDokumentieren = canWriteTreatmentNote(user.roles);

  return (
    <>
      <PageHeader
        title={`Termin – ${patientName(appointment)}`}
        description={
          appointment.status === 'cancelled'
            ? 'Dieser Termin ist abgesagt.'
            : appointment.status === 'completed'
              ? 'Dieser Termin ist abgeschlossen. Zum Ändern erst wieder öffnen.'
              : appointmentTypeLabels[appointment.appointment_type]
        }
        actions={
          darfAendern ? (
            <Link
              to={`/termine/${appointment.id}/bearbeiten`}
              className="border-line-strong bg-surface text-ink hover:bg-surface-sunken rounded-button inline-flex min-h-11 items-center justify-center border px-4 text-[0.9375rem] font-medium transition-colors"
            >
              Bearbeiten
            </Link>
          ) : null
        }
      />

      <Section titel="Termin">
        <DetailList>
          <DetailRow label="Patient:in">
            <Link
              to={`/patienten/${appointment.patient_id}`}
              className="text-accent inline-flex min-h-11 items-center hover:underline"
            >
              {patientName(appointment)}
            </Link>
          </DetailRow>
          <DetailRow label="Behandelnde Person">{staffName(appointment)}</DetailRow>
          <DetailRow label="Art">{appointmentTypeLabels[appointment.appointment_type]}</DetailRow>
          <DetailRow label="Status">{appointmentStatusLabels[appointment.status]}</DetailRow>
          <DetailRow label="Datum">{formatLocalDate(appointment.starts_at, zone)}</DetailRow>
          <DetailRow label="Zeit">
            {formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}
          </DetailRow>
          <DetailRow label={ortsBeschriftung(appointment.appointment_type)}>
            {locationSummary(appointment)}
          </DetailRow>
          {/* Der Handoff steht bei der Anschrift, nicht bei den
              Statusaktionen: Er gehört zur Anfahrt, nicht zum Vorgang
              (ADR-019 Punkt 20). */}
          {appointment.appointment_type === 'home_visit' ? (
            <DetailRow label="Anfahrt">
              <NavigationZumTermin termin={appointment} />
            </DetailRow>
          ) : null}
          {appointment.completed_at ? (
            <DetailRow label="Abgeschlossen am">
              {`${formatLocalDate(appointment.completed_at, zone)}, ${formatLocalTime(
                appointment.completed_at,
                zone,
              )} Uhr`}
            </DetailRow>
          ) : null}
        </DetailList>
      </Section>

      {darfAendern ? (
        <div className="mt-5 flex flex-wrap items-start gap-3">
          {/* Der Regelfall am Ende eines Besuchs: Dokumentation und Abschluss
              in einem Schritt (UX-007). „Termin abschließen" bleibt daneben -
              der Abschluss ohne Dokumentation ist ausdrücklich weiter möglich
              (ANN-005). */}
          {darfDokumentieren ? (
            <ButtonLink to={`/termine/${appointment.id}/abschluss`}>
              Behandlung abschließen
            </ButtonLink>
          ) : null}
          <StatusAktion
            appointment={appointment}
            aktion={completeAppointment}
            beschriftung="Termin abschließen"
            laufend="Wird abgeschlossen …"
            variant={darfDokumentieren ? 'secondary' : 'primary'}
          />
          <AbsageAktion appointment={appointment} />
        </div>
      ) : null}

      {/* Der Folgetermin ist der häufigste Einzelvorgang am Ende eines
          Besuchs. Er steht auch am abgeschlossenen Termin: dort wird er
          tatsächlich gebraucht (UX-003, IDEA-PRX-007). */}
      {darfVerwalten && appointment.status !== 'cancelled' ? (
        <div className="mt-5 flex">
          <ButtonLink
            to={`/patienten/${appointment.patient_id}/termine/neu${schreibeTerminVorbelegung(
              folgeterminVorbelegung(appointment),
            )}`}
            variant="secondary"
          >
            Folgetermin anlegen
          </ButtonLink>
        </div>
      ) : null}

      {darfWiederOeffnen ? (
        <div className="mt-5 flex">
          <StatusAktion
            appointment={appointment}
            aktion={reopenAppointment}
            beschriftung="Termin wieder öffnen"
            laufend="Wird geöffnet …"
            variant="secondary"
          />
        </div>
      ) : null}

      {appointment.appointment_type === 'video' ? (
        <p className="text-ink-subtle mt-6 max-w-prose text-sm leading-relaxed">
          Für Videotermine wird in diesem Stand noch kein Videolink erzeugt.
        </p>
      ) : null}

      {/* Klinische Inhalte stehen bewusst in einem eigenen Datensatz und werden
          über einen eigenen, protokollierten Lesepfad geholt (DOK-001). */}
      <TreatmentNoteSection appointment={appointment} user={user} />

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Zeiten gelten in der Zeitzone der Praxis ({zone}). Der Termin selbst enthält ausschließlich
        organisatorische Angaben.
        {appointment.appointment_type === 'home_visit'
          ? ' „Navigation starten" öffnet Google Maps im Fahrradmodus und übergibt dabei nur die Anschrift ohne Namen – erst beim Tippen.'
          : ''}
      </p>
    </>
  );
}

export function AppointmentDetailPage({ user }: { user: CurrentUser }) {
  const { appointmentId } = useParams<{ appointmentId: string }>();

  const { data, isPending, isError } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => fetchAppointment(appointmentId!),
    enabled: Boolean(appointmentId),
    retry: false,
  });

  return (
    <>
      <Link
        to="/patienten"
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zur Patientenliste
      </Link>

      {isPending ? <LoadingState label="Termin wird geladen …" /> : null}
      {isError ? <ErrorState title="Der Termin konnte nicht geladen werden." /> : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Termin existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}
      {data ? <AppointmentDetail appointment={data} user={user} /> : null}
    </>
  );
}

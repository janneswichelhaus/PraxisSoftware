import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  appointmentStatusLabels,
  appointmentTypeLabels,
  fetchAppointment,
  formatLocalDate,
  formatLocalTimeRange,
  locationSummary,
  patientName,
  staffName,
  type Appointment,
} from './api';

function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-6 sm:py-2.5">
      <dt className="text-ink-muted text-sm sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="text-ink text-[0.9375rem]">{value}</dd>
    </div>
  );
}

/** Bezeichnung des Ortsfeldes - je nach Terminart eine andere Frage. */
function ortsBeschriftung(art: Appointment['appointment_type']): string {
  if (art === 'practice') return 'Standort';
  if (art === 'home_visit') return 'Anschrift';
  return 'Ort';
}

function AppointmentDetail({ appointment }: { appointment: Appointment }) {
  const zone = appointment.organization_time_zone;

  return (
    <>
      <PageHeader
        title={`Termin – ${patientName(appointment)}`}
        description={
          appointment.status === 'cancelled'
            ? 'Dieser Termin ist abgesagt.'
            : appointmentTypeLabels[appointment.appointment_type]
        }
      />

      <section>
        <h2 className="text-ink-muted text-sm font-semibold tracking-wide uppercase">Termin</h2>
        <dl className="divide-line border-line mt-2 divide-y border-t">
          <DataRow
            label="Patient:in"
            value={
              <Link
                to={`/patienten/${appointment.patient_id}`}
                className="text-accent inline-flex min-h-11 items-center hover:underline"
              >
                {patientName(appointment)}
              </Link>
            }
          />
          <DataRow label="Behandelnde Person" value={staffName(appointment)} />
          <DataRow label="Art" value={appointmentTypeLabels[appointment.appointment_type]} />
          <DataRow label="Status" value={appointmentStatusLabels[appointment.status]} />
          <DataRow label="Datum" value={formatLocalDate(appointment.starts_at, zone)} />
          <DataRow
            label="Zeit"
            value={formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}
          />
          <DataRow
            label={ortsBeschriftung(appointment.appointment_type)}
            value={locationSummary(appointment)}
          />
        </dl>
      </section>

      {appointment.appointment_type === 'video' ? (
        <p className="text-ink-subtle mt-6 max-w-prose text-sm leading-relaxed">
          Für Videotermine wird in diesem Stand noch kein Videolink erzeugt.
        </p>
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Zeiten gelten in der Zeitzone der Praxis ({zone}). Der Termin enthält ausschließlich
        organisatorische Angaben.
      </p>
    </>
  );
}

export function AppointmentDetailPage() {
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
      {data ? <AppointmentDetail appointment={data} /> : null}
    </>
  );
}

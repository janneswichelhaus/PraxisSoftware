import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import {
  appointmentStatusLabels,
  cancelAppointment,
  appointmentTypeLabels,
  completeAppointment,
  fetchAppointment,
  formatLocalDate,
  formatLocalTime,
  formatLocalTimeRange,
  locationSummary,
  patientName,
  reopenAppointment,
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
  const [rueckfrage, setRueckfrage] = useState(false);
  const [fokusZurueck, setFokusZurueck] = useState(false);
  const queryClient = useQueryClient();
  const bestaetigen = useRef<HTMLButtonElement>(null);
  const ausloeser = useRef<HTMLButtonElement>(null);

  const mutation = useMutation({
    mutationFn: () => cancelAppointment(appointment.id, appointment.updated_at),
    onSuccess: async () => {
      setRueckfrage(false);
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      // Der Kalender zeigt sonst weiter einen geplanten Termin.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  // Der Fokus folgt der Rückfrage und kehrt danach zur auslösenden Schaltfläche
  // zurück - sonst landet er bei Tastaturbedienung am Seitenanfang.
  //
  // Die Rückkehr braucht einen eigenen Durchlauf: während der Rückfrage ist die
  // auslösende Schaltfläche nicht im Dokument, ihre Referenz zeigt also auf ein
  // bereits entferntes Element.
  useEffect(() => {
    if (rueckfrage) bestaetigen.current?.focus();
  }, [rueckfrage]);

  useEffect(() => {
    if (!rueckfrage && fokusZurueck) {
      ausloeser.current?.focus();
      setFokusZurueck(false);
    }
  }, [rueckfrage, fokusZurueck]);

  if (!rueckfrage) {
    return (
      <Button ref={ausloeser} type="button" variant="secondary" onClick={() => setRueckfrage(true)}>
        Termin absagen
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Termin absagen"
      className="border-line-strong bg-surface-sunken w-full rounded-lg border p-4"
    >
      <p className="text-ink text-sm">
        Der Termin am {formatLocalDate(appointment.starts_at, appointment.organization_time_zone)}{' '}
        um {formatLocalTime(appointment.starts_at, appointment.organization_time_zone)} Uhr für{' '}
        {patientName(appointment)} wird als abgesagt geführt. Er bleibt vollständig erhalten und
        gibt seinen Zeitraum wieder frei.
      </p>
      {mutation.isError ? (
        <p className="text-danger mt-2 text-sm">{mutation.error.message}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          ref={bestaetigen}
          type="button"
          disabled={mutation.isPending}
          onClick={() => {
            if (mutation.isPending) return;
            mutation.mutate();
          }}
        >
          {mutation.isPending ? 'Wird abgesagt …' : 'Ja, Termin absagen'}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => {
            setRueckfrage(false);
            setFokusZurueck(true);
          }}
        >
          Abbrechen
        </Button>
      </div>
    </div>
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
        <p className="text-danger mt-2 text-sm">{mutation.error.message}</p>
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
              className="border-line-strong bg-surface text-ink hover:bg-surface-sunken inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors"
            >
              Bearbeiten
            </Link>
          ) : null
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
          {appointment.completed_at ? (
            <DataRow
              label="Abgeschlossen am"
              value={`${formatLocalDate(appointment.completed_at, zone)}, ${formatLocalTime(
                appointment.completed_at,
                zone,
              )} Uhr`}
            />
          ) : null}
        </dl>
      </section>

      {darfAendern ? (
        <div className="mt-5 flex flex-wrap items-start gap-3">
          <StatusAktion
            appointment={appointment}
            aktion={completeAppointment}
            beschriftung="Termin abschließen"
            laufend="Wird abgeschlossen …"
            variant="primary"
          />
          <AbsageAktion appointment={appointment} />
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

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Zeiten gelten in der Zeitzone der Praxis ({zone}). Der Termin enthält ausschließlich
        organisatorische Angaben.
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

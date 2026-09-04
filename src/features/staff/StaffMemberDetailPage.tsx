import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  appointmentTypeLabels,
  formatLocalDate,
  formatLocalTimeRange,
} from '@/features/appointments/api';
import { canManageStaff, type CurrentUser } from '@/features/session/types';
import {
  fetchStaffFutureAppointments,
  fetchStaffMember,
  formatDate,
  setStaffEmploymentStatus,
  sindTermineOffen,
  staffFullName,
  type StaffMember,
} from './api';

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-6 sm:py-2.5">
      <dt className="text-ink-muted text-sm sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="text-ink text-[0.9375rem]">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-ink-muted text-sm font-semibold tracking-wide uppercase">{title}</h2>
      <dl className="divide-line border-line mt-2 divide-y border-t">{children}</dl>
    </section>
  );
}

/**
 * Liste der Termine, die eine Deaktivierung offen ließe.
 *
 * Sie ist der Kern der Rückfrage: die Termine verschwinden nicht, sie werden
 * nicht abgesagt und nicht umgebucht - sie bleiben stehen und müssen von der
 * Praxis geregelt werden. Genau das muss vor der Bestätigung sichtbar sein.
 */
function OffeneTermine({ staffMemberId, timeZone }: { staffMemberId: string; timeZone: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['staff-future-appointments', staffMemberId],
    queryFn: () => fetchStaffFutureAppointments(staffMemberId),
    retry: false,
  });

  if (isPending) return <LoadingState label="Zukünftige Termine werden geladen …" />;
  if (isError) {
    return (
      <p className="text-danger mt-2 text-sm">
        Die zukünftigen Termine konnten nicht geladen werden. Bitte vor der Deaktivierung im
        Kalender prüfen.
      </p>
    );
  }
  if (data.length === 0) return null;

  return (
    <ul className="divide-line border-line mt-3 divide-y border-y text-sm">
      {data.map((termin) => (
        <li key={termin.id} className="py-2">
          <span className="text-ink block">
            {formatLocalDate(termin.starts_at, timeZone)} ·{' '}
            {formatLocalTimeRange(termin.starts_at, termin.ends_at, timeZone)}
          </span>
          <span className="text-ink-muted block">
            {termin.patient_given_name} {termin.patient_family_name} ·{' '}
            {appointmentTypeLabels[termin.appointment_type]}
            {termin.location_name ? ` · ${termin.location_name}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Wechsel des Beschäftigungsstatus.
 *
 * Zweistufig, wie der Server es verlangt: Der erste Versuch läuft ohne
 * Bestätigung. Sind noch zukünftige Termine geplant, weist der Server ihn ab,
 * ohne irgendetwas zu schreiben. Erst danach zeigt die Oberfläche die
 * betroffenen Termine und bietet die ausdrückliche Bestätigung an.
 *
 * Die Rückfrage ist damit keine reine Bildschirmhöflichkeit - ohne sie kommt
 * der Vorgang serverseitig nicht durch (STAFF-001).
 */
function StatusAktion({ staff, timeZone }: { staff: StaffMember; timeZone: string | null }) {
  const [rueckfrage, setRueckfrage] = useState(false);
  const queryClient = useQueryClient();
  const zielStatus: StaffMember['employment_status'] =
    staff.employment_status === 'active' ? 'inactive' : 'active';

  const mutation = useMutation({
    mutationFn: (bestaetigt: boolean) => setStaffEmploymentStatus(staff.id, zielStatus, bestaetigt),
    onSuccess: async () => {
      setRueckfrage(false);
      await queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-member', staff.id] });
      await queryClient.invalidateQueries({ queryKey: ['assignable-therapists'] });
    },
  });

  const beschriftung = zielStatus === 'inactive' ? 'Als inaktiv führen' : 'Wieder als aktiv führen';
  const termineOffen = sindTermineOffen(mutation.error);

  if (!rueckfrage) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          mutation.reset();
          setRueckfrage(true);
        }}
      >
        {beschriftung}
      </Button>
    );
  }

  return (
    <div className="border-line-strong bg-surface-sunken w-full rounded-lg border p-4">
      <p className="text-ink text-sm">
        {zielStatus === 'inactive'
          ? 'Diese Person wird nicht mehr für neue Terminzuweisungen angeboten. Bestehende Termine, Arbeitszeiten und alle bisherigen Zuordnungen bleiben vollständig erhalten. Der Zugang zur Anwendung wird dadurch nicht gesperrt.'
          : 'Diese Person wird wieder für Terminzuweisungen angeboten.'}
      </p>

      {termineOffen ? (
        <div role="alert" className="mt-3">
          <p className="text-danger text-sm font-medium">
            Für diese Person sind noch Termine in der Zukunft geplant.
          </p>
          <p className="text-ink-muted mt-1 text-sm">
            Sie werden weder abgesagt noch umgebucht. Nach der Deaktivierung müssen sie im Kalender
            einer aktiven Person zugeordnet oder abgesagt werden.
          </p>
          {timeZone ? <OffeneTermine staffMemberId={staff.id} timeZone={timeZone} /> : null}
        </div>
      ) : null}

      {mutation.isError && !termineOffen ? (
        <p className="text-danger mt-2 text-sm">
          Der Beschäftigungsstatus konnte nicht geändert werden.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={mutation.isPending}
          onClick={() => {
            // Doppelklick darf keinen zweiten Schreibvorgang auslösen.
            if (mutation.isPending) return;
            mutation.mutate(termineOffen);
          }}
        >
          {mutation.isPending
            ? 'Wird geändert …'
            : termineOffen
              ? 'Trotz offener Termine deaktivieren'
              : beschriftung}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setRueckfrage(false)}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

function StaffDetail({ staff, user }: { staff: StaffMember; user: CurrentUser }) {
  const darfVerwalten = canManageStaff(user.roles);
  const aktiv = staff.employment_status === 'active';
  const adresse = [staff.street, [staff.postal_code, staff.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  // Privatangaben kommen für Rollen ohne Zugriff gar nicht erst an.
  const privatSichtbar =
    staff.date_of_birth !== null ||
    staff.private_email !== null ||
    staff.private_phone !== null ||
    adresse !== '';

  return (
    <>
      <PageHeader
        title={staffFullName(staff)}
        description={aktiv ? undefined : 'Nicht mehr im laufenden Einsatz'}
        actions={
          darfVerwalten ? (
            <Link
              to={`/praxis/team/${staff.id}/bearbeiten`}
              className="border-line-strong bg-surface text-ink hover:bg-surface-sunken inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors"
            >
              Stammdaten bearbeiten
            </Link>
          ) : null
        }
      />

      <Section title="Dienstlich">
        <DataRow label="Diensttelefon" value={staff.work_phone ?? '—'} />
        <DataRow label="Dienstliche E-Mail" value={staff.work_email ?? '—'} />
        <DataRow label="Hauptstandort" value={staff.primary_location_name ?? '—'} />
        <DataRow label="Beschäftigung" value={aktiv ? 'Aktiv' : 'Inaktiv'} />
      </Section>

      {privatSichtbar ? (
        <Section title="Privat">
          <DataRow label="Geburtsdatum" value={formatDate(staff.date_of_birth)} />
          <DataRow label="Privattelefon" value={staff.private_phone ?? '—'} />
          <DataRow label="Private E-Mail" value={staff.private_email ?? '—'} />
          <DataRow label="Adresse" value={adresse || '—'} />
        </Section>
      ) : null}

      {darfVerwalten ? (
        <div className="mt-5 flex">
          <StatusAktion staff={staff} timeZone={user.organizationTimeZone} />
        </div>
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Mitarbeiterdatensatz und Zugang zur Anwendung sind getrennt. Ein Statuswechsel hier sperrt
        kein Benutzerkonto und vergibt keine Rollen. Mitarbeiterdatensätze werden nicht gelöscht,
        damit vergangene Termine und Zuordnungen nachvollziehbar bleiben.
      </p>
    </>
  );
}

export function StaffMemberDetailPage({ user }: { user: CurrentUser }) {
  const { staffMemberId } = useParams<{ staffMemberId: string }>();

  const { data, isPending, isError } = useQuery({
    queryKey: ['staff-member', staffMemberId],
    queryFn: () => fetchStaffMember(staffMemberId!),
    enabled: Boolean(staffMemberId),
    retry: false,
  });

  return (
    <>
      <Link
        to="/praxis/team"
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zum Team
      </Link>

      {isPending ? <LoadingState label="Mitarbeiterdaten werden geladen …" /> : null}
      {isError ? <ErrorState title="Die Mitarbeiterdaten konnten nicht geladen werden." /> : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}
      {data ? <StaffDetail staff={data} user={user} /> : null}
    </>
  );
}

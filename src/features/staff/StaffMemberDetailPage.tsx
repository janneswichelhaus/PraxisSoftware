import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { PageHeader } from '@/components/ui/PageHeader';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  appointmentTypeLabels,
  fetchAssignableTherapists,
  formatLocalDate,
  formatLocalTimeRange,
  todayInTimeZone,
} from '@/features/appointments/api';
import { formatDate } from '@/lib/datum';
import { telHref } from '@/lib/telefon';
import { fullName } from '@/features/patients/api';
import {
  canManageStaffAccounts,
  canManageStaffEmployment,
  canManageStaffMasterData,
  type CurrentUser,
} from '@/features/session/types';
import { StaffAccountSection } from './StaffAccountSection';
import {
  fetchStaffFutureAppointments,
  fetchStaffMember,
  setStaffEmploymentStatus,
  sindTermineOffen,
  type StaffMember,
} from './api';

/**
 * Eine Kontaktangabe als Weg, nicht als Text (UX-012).
 *
 * Dieselbe Entscheidung wie in der Patientenakte (Oberflächen-Checkliste
 * Punkt 8): Wer im Mitarbeiterdatensatz nachsieht, will in aller Regel gleich
 * anrufen oder schreiben - und tippt die Nummer sonst am Handy ab.
 */
function KontaktZeile({
  label,
  wert,
  schema,
}: {
  label: string;
  wert: string | null;
  schema: 'tel' | 'mailto';
}) {
  if (!wert) return <DetailRow label={label}>—</DetailRow>;
  const ziel = schema === 'tel' ? telHref(wert) : `mailto:${wert}`;
  return (
    <DetailRow label={label}>
      <a className="text-accent hover:underline" href={ziel}>
        {wert}
      </a>
    </DetailRow>
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
      <Statusmeldung ton="fehler" className="mt-2">
        Die zukünftigen Termine konnten nicht geladen werden. Bitte vor der Deaktivierung im
        Kalender prüfen.
      </Statusmeldung>
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
            {/* Ein Ereignis des Praxisbetriebs steht mit seinem Titel da
                (CAL-015b) - es hängt an dieser Person genauso. */}
            {termin.kind === 'event'
              ? (termin.title ?? 'Ereignis')
              : `${termin.patient_given_name ?? ''} ${termin.patient_family_name ?? ''}`.trim()}{' '}
            · {appointmentTypeLabels[termin.appointment_type]}
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
  const queryClient = useQueryClient();
  const zielStatus: StaffMember['employment_status'] =
    staff.employment_status === 'active' ? 'inactive' : 'active';

  const mutation = useMutation({
    mutationFn: (bestaetigt: boolean) => setStaffEmploymentStatus(staff.id, zielStatus, bestaetigt),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-member', staff.id] });
      await queryClient.invalidateQueries({ queryKey: ['assignable-therapists'] });
    },
  });

  const beschriftung = zielStatus === 'inactive' ? 'Als inaktiv führen' : 'Wieder als aktiv führen';
  const termineOffen = sindTermineOffen(mutation.error);

  return (
    <Rueckfrage
      ausloeser={beschriftung}
      bezeichnung={`${beschriftung} - Rückfrage`}
      bestaetigen={termineOffen ? 'Trotz offener Termine deaktivieren' : beschriftung}
      bestaetigenLaeuft="Wird geändert …"
      fehler={
        mutation.isError && !termineOffen
          ? 'Der Beschäftigungsstatus konnte nicht geändert werden.'
          : undefined
      }
      laeuft={mutation.isPending}
      onBestaetigen={() => mutation.mutateAsync(termineOffen)}
      onAbbrechen={() => mutation.reset()}
    >
      <p>
        {zielStatus === 'inactive'
          ? 'Diese Person wird nicht mehr für neue Terminzuweisungen angeboten. Bestehende Termine, Arbeitszeiten und alle bisherigen Zuordnungen bleiben vollständig erhalten. Der Zugang zur Anwendung wird dadurch nicht gesperrt.'
          : 'Diese Person wird wieder für Terminzuweisungen angeboten.'}
      </p>

      {/* Der zweite Anlauf ist kein Fehler, sondern eine bewusste Bestaetigung:
          die Termine bleiben stehen und muessen von der Praxis geregelt werden.
          Deshalb stehen sie hier, bevor bestaetigt wird. */}
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
    </Rueckfrage>
  );
}

function StaffDetail({ staff, user }: { staff: StaffMember; user: CurrentUser }) {
  /**
   * Kalender und Arbeitszeiten stehen nur zur Verfügung, wenn diese Person
   * überhaupt behandelt (UX-012).
   *
   * Beide Ziele arbeiten über `staff_member_id` und kennen nur zuordenbare
   * Personen. Für das Office führten sie auf eine leere Spalte und eine
   * Auswahl ohne passenden Eintrag - ein Angebot, das keins ist.
   */
  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });
  const behandelt = (therapeuten.data ?? []).some((t) => t.staff_member_id === staff.id);
  const zone = user.organizationTimeZone;
  // Zwei getrennte Rechte seit E10: Stammdaten pflegt auch das Office, den
  // Beschaeftigungsstatus wechselt nur die Praxisinhaberin.
  const darfStammdaten = canManageStaffMasterData(user.roles);
  const darfBeschaeftigung = canManageStaffEmployment(user.roles);
  const darfZugang = canManageStaffAccounts(user.roles);
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
        title={fullName(staff)}
        description={aktiv ? undefined : 'Nicht mehr im laufenden Einsatz'}
        actions={
          darfStammdaten ? (
            <Link
              to={`/praxis/team/${staff.id}/bearbeiten`}
              className="border-line-strong bg-surface text-ink hover:bg-surface-sunken rounded-button inline-flex min-h-11 items-center justify-center border px-4 text-[0.9375rem] font-medium transition-colors"
            >
              Stammdaten bearbeiten
            </Link>
          ) : null
        }
      />

      <Section titel="Dienstlich" rahmen>
        <DetailList>
          <KontaktZeile label="Diensttelefon" wert={staff.work_phone} schema="tel" />
          <KontaktZeile label="Dienstliche E-Mail" wert={staff.work_email} schema="mailto" />
          <DetailRow label="Hauptstandort">{staff.primary_location_name ?? '—'}</DetailRow>
          <DetailRow label="Beschäftigung">{aktiv ? 'Aktiv' : 'Inaktiv'}</DetailRow>
          {/* Die beiden Fragen, die am Mitarbeiterdatensatz tatsächlich
              anschließen: „wann arbeitet die Person" und „was hat sie vor".
              Beide waren vorher nur über die Hauptnavigation und eine erneute
              Auswahl erreichbar (UX-012). */}
          {behandelt ? (
            <DetailRow label="Planung">
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Link
                  to={`/kalender?ansicht=woche${zone ? `&datum=${todayInTimeZone(zone)}` : ''}&person=${staff.id}`}
                  className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
                >
                  Woche im Kalender
                </Link>
                <Link
                  to={`/praxis/planung?person=${staff.id}`}
                  className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
                >
                  Arbeitszeiten
                </Link>
              </span>
            </DetailRow>
          ) : null}
        </DetailList>
      </Section>

      {privatSichtbar ? (
        <Section titel="Privat" rahmen>
          <DetailList>
            <DetailRow label="Geburtsdatum">{formatDate(staff.date_of_birth)}</DetailRow>
            <KontaktZeile label="Privattelefon" wert={staff.private_phone} schema="tel" />
            <KontaktZeile label="Private E-Mail" wert={staff.private_email} schema="mailto" />
            <DetailRow label="Adresse">{adresse || '—'}</DetailRow>
          </DetailList>
        </Section>
      ) : null}

      {darfZugang ? <StaffAccountSection staff={staff} /> : null}

      {darfBeschaeftigung ? (
        <div className="mt-5 flex">
          <StatusAktion staff={staff} timeZone={user.organizationTimeZone} />
        </div>
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Mitarbeiterdatensatz und Zugang zur Anwendung sind getrennt. Ein Wechsel des
        Beschäftigungsstatus sperrt kein Benutzerkonto; dafür gibt es den eigenen Vorgang im
        Abschnitt „Zugang". Mitarbeiterdatensätze werden nicht gelöscht, damit vergangene Termine
        und Zuordnungen nachvollziehbar bleiben.
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
      <Rueckweg standard="/praxis/team" beschriftung="Zurück zu den Mitarbeitenden" />

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

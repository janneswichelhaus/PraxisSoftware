import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canChangePatientStatus,
  canManageAppointments,
  type CurrentUser,
} from '@/features/session/types';
import {
  ageInYears,
  fetchPatient,
  formatDate,
  fullName,
  logPatientRecordView,
  setPatientStatus,
  type Patient,
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
 * Wechsel des Versorgungsstatus.
 *
 * Bewusst mit Rückfrage: der Wechsel nimmt einen Patienten aus dem laufenden
 * Betrieb, und ein versehentlicher Klick soll das nicht auslösen
 * (PROJECT_PRINCIPLES.md 13). Die Rückfrage ist Bedienkomfort - verbindlich
 * prüft `set_patient_status` die Berechtigung erneut.
 */
function StatusAktion({ patient }: { patient: Patient }) {
  const [rueckfrage, setRueckfrage] = useState(false);
  const queryClient = useQueryClient();
  const zielStatus: Patient['status'] = patient.status === 'active' ? 'inactive' : 'active';

  const mutation = useMutation({
    mutationFn: () => setPatientStatus(patient.id, zielStatus),
    onSuccess: async () => {
      setRueckfrage(false);
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
    },
  });

  const beschriftung =
    zielStatus === 'inactive' ? 'Als inaktiv markieren' : 'Wieder als aktiv führen';

  if (!rueckfrage) {
    return (
      <Button type="button" variant="secondary" onClick={() => setRueckfrage(true)}>
        {beschriftung}
      </Button>
    );
  }

  return (
    <div className="border-line-strong bg-surface-sunken w-full rounded-lg border p-4">
      <p className="text-ink text-sm">
        {zielStatus === 'inactive'
          ? 'Diese Person wird als nicht in laufender Versorgung geführt. Die Akte bleibt vollständig erhalten.'
          : 'Diese Person wird wieder als in laufender Versorgung geführt.'}
      </p>
      {mutation.isError ? (
        <p className="text-danger mt-2 text-sm">
          Der Versorgungsstatus konnte nicht geändert werden.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={mutation.isPending}
          onClick={() => {
            // Doppelklick darf keinen zweiten Schreibvorgang auslösen.
            if (mutation.isPending) return;
            mutation.mutate();
          }}
        >
          {mutation.isPending ? 'Wird geändert …' : beschriftung}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setRueckfrage(false)}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

function PatientDetail({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const age = ageInYears(patient.date_of_birth);
  const street = [patient.street, patient.house_number].filter(Boolean).join(' ');
  const address = [street, [patient.postal_code, patient.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const darfStatusWechseln = canChangePatientStatus(user.roles);
  const darfTerminePlanen = canManageAppointments(user.roles);

  return (
    <>
      <PageHeader
        title={fullName(patient)}
        description={patient.status === 'inactive' ? 'Nicht in laufender Versorgung' : undefined}
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/patienten/${patient.id}/bearbeiten`}
              className="border-line-strong bg-surface text-ink hover:bg-surface-sunken inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors"
            >
              Stammdaten bearbeiten
            </Link>
            {darfTerminePlanen && patient.status === 'active' ? (
              <Link
                to={`/patienten/${patient.id}/termine/neu`}
                className="bg-accent hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[0.9375rem] font-medium text-white transition-colors"
              >
                Termin anlegen
              </Link>
            ) : null}
          </div>
        }
      />

      <Section title="Person">
        <DataRow
          label="Geburtsdatum"
          value={
            patient.date_of_birth
              ? `${formatDate(patient.date_of_birth)}${age !== null ? ` (${age} Jahre)` : ''}`
              : '—'
          }
        />
        <DataRow label="Adresse" value={address || '—'} />
      </Section>

      <Section title="Kontakt">
        <DataRow label="Telefon" value={patient.phone ?? '—'} />
        <DataRow label="E-Mail" value={patient.email ?? '—'} />
      </Section>

      <Section title="Versorgung">
        <DataRow label="Beginn" value={formatDate(patient.care_started_on)} />
        <DataRow label="Status" value={patient.status === 'active' ? 'Aktiv' : 'Inaktiv'} />
      </Section>

      {darfStatusWechseln ? (
        <div className="mt-5 flex">
          <StatusAktion patient={patient} />
        </div>
      ) : null}

      <p className="text-ink-subtle mt-10 text-xs leading-relaxed">
        Zugriffe auf Patientenakten werden protokolliert.
      </p>
    </>
  );
}

export function PatientDetailPage({ user }: { user: CurrentUser }) {
  const { patientId } = useParams<{ patientId: string }>();

  const { data, isPending, isError } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  // ADR-010: Das Öffnen einer Patientenakte in der Detailansicht ist
  // auditpflichtig. Protokolliert wird erst, wenn der Datensatz tatsächlich
  // sichtbar war - nicht schon beim Aufruf einer beliebigen ID.
  useEffect(() => {
    if (data?.id) void logPatientRecordView(data.id);
  }, [data?.id]);

  return (
    <>
      <Link
        to="/patienten"
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zur Liste
      </Link>

      {isPending ? <LoadingState label="Patientendaten werden geladen …" /> : null}
      {isError ? <ErrorState title="Die Patientendaten konnten nicht geladen werden." /> : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}
      {data ? <PatientDetail patient={data} user={user} /> : null}
    </>
  );
}

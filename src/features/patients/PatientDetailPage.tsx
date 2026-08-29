import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  ageInYears,
  fetchPatient,
  formatDate,
  fullName,
  logPatientRecordView,
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

function PatientDetail({ patient }: { patient: Patient }) {
  const age = ageInYears(patient.date_of_birth);
  const street = [patient.street, patient.house_number].filter(Boolean).join(' ');
  const address = [street, [patient.postal_code, patient.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <PageHeader
        title={fullName(patient)}
        description={patient.status === 'inactive' ? 'Nicht in laufender Versorgung' : undefined}
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

      <p className="text-ink-subtle mt-10 text-xs leading-relaxed">
        Zugriffe auf Patientenakten werden protokolliert.
      </p>
    </>
  );
}

export function PatientDetailPage() {
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
      {data ? <PatientDetail patient={data} /> : null}
    </>
  );
}

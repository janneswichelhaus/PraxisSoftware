import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { ageInYears, fetchPatients, fullName, type Patient } from './api';

type StatusFilter = 'all' | 'active' | 'inactive';

const selectClass =
  'min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink';

function matches(patient: Patient, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    fullName(patient),
    patient.city,
    patient.postal_code,
    patient.phone,
    patient.email,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

function matchesStatus(patient: Patient, status: StatusFilter): boolean {
  if (status === 'all') return true;
  return patient.status === status;
}

export function PatientsListPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const { data, isPending, isError } = useQuery({
    queryKey: ['patients'],
    queryFn: fetchPatients,
    retry: false,
  });

  const visible = useMemo(
    () => (data ?? []).filter((p) => matchesStatus(p, status) && matches(p, query)),
    [data, query, status],
  );

  return (
    <>
      <PageHeader
        title="Patient:innen"
        description="Organisatorische Stammdaten der Praxis."
        actions={
          <Link
            to="/patienten/neu"
            className="bg-accent hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[0.9375rem] font-medium text-white transition-colors"
          >
            Patient anlegen
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="max-w-sm flex-1 basis-56">
          <Field
            label="Suche"
            type="search"
            placeholder="Name, Ort, Telefon, E-Mail"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="patients-status" className="text-ink text-sm font-medium">
            Status
          </label>
          <select
            id="patients-status"
            className={selectClass}
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            <option value="all">Alle</option>
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
          </select>
        </div>
      </div>

      {isPending ? <LoadingState label="Patientenliste wird geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Patientenliste konnte nicht geladen werden."
          description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
        />
      ) : null}

      {data && visible.length === 0 ? (
        <EmptyState
          title={data.length === 0 ? 'Noch keine Patient:innen' : 'Keine Treffer'}
          description={data.length === 0 ? undefined : 'Suche oder Filter anpassen.'}
        />
      ) : null}

      {visible.length > 0 ? (
        <ul className="divide-line border-line divide-y border-y">
          {visible.map((patient) => {
            const age = ageInYears(patient.date_of_birth);
            return (
              <li key={patient.id}>
                <Link
                  to={`/patienten/${patient.id}`}
                  className="hover:bg-surface-sunken flex min-h-16 items-center justify-between gap-4 py-3 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="text-ink block truncate text-[0.9375rem] font-medium">
                      {fullName(patient)}
                    </span>
                    <span className="text-ink-muted mt-0.5 block text-sm">
                      {age !== null ? `${age} Jahre` : 'Geburtsdatum unbekannt'}
                      {patient.city ? ` · ${patient.city}` : ''}
                    </span>
                  </span>
                  {patient.status === 'inactive' ? (
                    <span className="bg-surface-sunken text-ink-muted shrink-0 rounded-full px-2.5 py-0.5 text-xs">
                      inaktiv
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

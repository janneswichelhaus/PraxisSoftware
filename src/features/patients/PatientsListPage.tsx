import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { SearchField } from '@/components/ui/SearchField';
import { Patientensuche } from './Patientensuche';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ageInYears, fetchPatients, fullName, type Patient } from './api';

type StatusFilter = 'all' | 'active' | 'inactive';

const selectClass =
  'min-h-11 rounded-field border border-line-strong bg-surface px-3 text-base text-ink';

function parseStatusFilter(value: string | null): StatusFilter {
  return value === 'active' || value === 'inactive' ? value : 'all';
}

/**
 * Baut den Query-String für Suche und Statusfilter neu auf, statt die
 * bestehenden Parameter zu ergänzen: die Seite kennt keine weiteren
 * Parameter, ein additiver Merge würde nur veraltete Werte mitschleppen.
 */
function toSearchParams(query: string, status: StatusFilter): URLSearchParams {
  const next = new URLSearchParams();
  if (query.trim()) next.set('q', query);
  if (status !== 'all') next.set('status', status);
  return next;
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [status, setStatus] = useState<StatusFilter>(() =>
    parseStatusFilter(searchParams.get('status')),
  );
  const { data, isPending, isError } = useQuery({
    queryKey: ['patients'],
    queryFn: fetchPatients,
    retry: false,
  });

  const visible = useMemo(
    () => (data ?? []).filter((p) => matchesStatus(p, status) && matches(p, query)),
    [data, query, status],
  );

  function updateQuery(value: string) {
    setQuery(value);
    setSearchParams(toSearchParams(value, status), { replace: true });
  }

  function updateStatus(value: StatusFilter) {
    setStatus(value);
    setSearchParams(toSearchParams(query, value), { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Patient:innen"
        description="Organisatorische Stammdaten der Praxis."
        actions={<ButtonLink to="/patienten/neu">Patient anlegen</ButtonLink>}
      />

      {/* Die serverseitige Namenssuche wohnt seit UX-013 hier im Bereich
          (E17): Sie springt aus dem gesamten Bestand in eine Akte, ohne die
          Liste zu laden — der Weg, den die Kopfleiste ab drei Zeichen
          ebenfalls anbietet. Das Feld darunter ist etwas anderes und heißt
          deshalb anders: Es filtert die Liste, die hier schon steht, und kann
          dafür auch Ort, Telefon und E-Mail. */}
      <div className="mb-5 max-w-sm">
        <Patientensuche labelSichtbar />
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="max-w-sm flex-1 basis-56">
          <SearchField
            label="Liste filtern"
            placeholder="Name, Ort, Telefon, E-Mail"
            value={query}
            onChange={updateQuery}
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
            onChange={(event) => updateStatus(event.target.value as StatusFilter)}
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
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
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
                    <span className="bg-surface-sunken text-ink-muted rounded-pill shrink-0 px-2.5 py-0.5 text-xs">
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

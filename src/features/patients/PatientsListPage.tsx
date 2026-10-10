import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { BEGRIFFE } from '@/lib/begriffe';
import { mitRueckweg } from '@/lib/rueckweg';
import { Patientensuche } from './Patientensuche';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ageInYears, fetchPatients, fullName, type PatientListenzeile } from './api';

type StatusFilter = 'all' | 'active' | 'inactive';

/** Der Vorgang heißt hier wie in der Kopfsuche (PAT-21, ANN-111). */
const ANLEGEN = `${BEGRIFFE.patientIn} anlegen`;

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

function matches(patient: PatientListenzeile, query: string): boolean {
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

function matchesStatus(patient: PatientListenzeile, status: StatusFilter): boolean {
  if (status === 'all') return true;
  return patient.status === status;
}

export function PatientsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [status, setStatus] = useState<StatusFilter>(() =>
    parseStatusFilter(searchParams.get('status')),
  );
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['patients'],
    queryFn: fetchPatients,
    retry: false,
  });

  const visible = useMemo(
    () => (data ?? []).filter((p) => matchesStatus(p, status) && matches(p, query)),
    [data, query, status],
  );

  // Die Akte führt zurück in genau diese Ansicht - mit Suchbegriff und
  // Statusfilter (PAT-08, UX-012). Vorher stand die Liste nach jeder
  // geöffneten Akte wieder ungefiltert da; die Namenssuche darüber nahm den
  // Rückweg schon mit. Ohne Filter braucht es keinen: Die Akte führt dann
  // ohnehin hierher.
  const filter = searchParams.toString();
  const rueckweg = filter ? `/patienten?${filter}` : null;

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
        description="Alle Akten der Praxis – Termine, Behandlung, Stammdaten."
        actions={<ButtonLink to="/patienten/neu">{ANLEGEN}</ButtonLink>}
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

      {/* Der Statusfilter ist der Baustein `Select` (PAT-14, UIK-19, TOK-13):
          48 px hoch wie das Filterfeld daneben, mit derselben Beschriftung -
          vorher stand ein nachgebautes Feld 4 px niedriger daneben. */}
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="max-w-sm flex-1 basis-56">
          <SearchField
            label="Liste filtern"
            placeholder="Name, Ort, Telefon, E-Mail"
            value={query}
            onChange={updateQuery}
          />
        </div>
        {/* BEF-067: „in Versorgung“ / „nicht in Versorgung“ wie in Suche,
            Kopf der Akte und Stammdaten; „abgeschlossen“ bleibt dem Abschluss. */}
        <div className="w-56">
          <Select
            label="Versorgung"
            value={status}
            onChange={(event) => updateStatus(event.target.value as StatusFilter)}
          >
            <option value="all">Alle</option>
            <option value="active">In Versorgung</option>
            <option value="inactive">Nicht in Versorgung</option>
          </Select>
        </div>
      </div>

      {isPending ? <LoadingState label="Patientenliste wird geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Patientenliste konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und später erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : null}

      {data && visible.length === 0 ? (
        <EmptyState
          title={data.length === 0 ? 'Noch keine Patient:innen' : 'Keine Treffer'}
          description={
            data.length === 0
              ? `Die erste Akte entsteht über „${ANLEGEN}“.`
              : 'Suche oder Filter anpassen.'
          }
        />
      ) : null}

      {visible.length > 0 ? (
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
          {visible.map((patient) => {
            const age = ageInYears(patient.date_of_birth);
            return (
              <li key={patient.id}>
                <Link
                  to={mitRueckweg(`/patienten/${patient.id}`, rueckweg)}
                  className="hover:bg-surface-sunken flex min-h-16 items-center justify-between gap-4 py-3 transition-colors"
                >
                  <span className="min-w-0">
                    {/* BEF-067: „Nachname, Vorname“ wie sortiert, der Nachname
                        hervorgehoben; am Telefon bricht der Name um, statt
                        zuerst den Nachnamen abzuschneiden. */}
                    <span className="text-ink text-liste block wrap-anywhere">
                      <span className="font-semibold">{patient.family_name}</span>
                      {patient.given_name ? `, ${patient.given_name}` : ''}
                    </span>
                    <span className="text-ink-muted mt-0.5 block text-sm">
                      {age !== null ? `${age} Jahre` : 'Geburtsdatum unbekannt'}
                      {patient.city ? ` · ${patient.city}` : ''}
                    </span>
                  </span>
                  {/* Das Etikett des Systems statt eines Nachbaus (PAT-14,
                      UIK-18), groß geschrieben wie der Filter (WRT-16). */}
                  {patient.status === 'inactive' ? <Badge>Nicht in Versorgung</Badge> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

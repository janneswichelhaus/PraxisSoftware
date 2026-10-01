import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { mitRueckweg } from '@/lib/rueckweg';
import { fetchAssignableTherapists } from '@/features/appointments/api';
import { Listenfehler, NachladeHinweis } from '@/features/appointments/Rueckmeldungen';
import { fullName } from '@/features/patients/api';
import {
  canManageAppointments,
  canManageStaffAccounts,
  canManageStaffMasterData,
  type CurrentUser,
} from '@/features/session/types';
import { fetchStaffMembers, type StaffMember } from './api';

type StatusFilter = 'all' | 'active' | 'inactive';

function parseStatusFilter(value: string | null): StatusFilter {
  return value === 'active' || value === 'inactive' ? value : 'all';
}

function toSearchParams(query: string, status: StatusFilter): URLSearchParams {
  const next = new URLSearchParams();
  if (query.trim()) next.set('q', query);
  if (status !== 'all') next.set('status', status);
  return next;
}

function matches(staff: StaffMember, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [fullName(staff), staff.work_email, staff.work_phone, staff.primary_location_name]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

/**
 * Mitarbeiterliste.
 *
 * Lesbar für alle Praxisrollen; angelegt und geändert wird nur durch
 * Praxisinhaber:in und Praxismanagement. Die ausgeblendete Schaltfläche ist
 * dabei keine Zugriffskontrolle - verbindlich prüft der Server (ADR-004).
 *
 * Neben dem Beschäftigungsstatus wird ausgewiesen, ob eine Person aktuell als
 * behandelnde Person zuordenbar ist. Das ist eine andere Frage: dafür braucht
 * es zusätzlich einen eigenen Zugang mit der Rolle Therapeut:in oder
 * Teamleitung (CAL-001).
 */
export function StaffListPage({ user }: { user: CurrentUser }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [status, setStatus] = useState<StatusFilter>(() =>
    parseStatusFilter(searchParams.get('status')),
  );
  const fragtZuordenbarkeit = canManageAppointments(user.roles);

  const [liste, zuordenbar] = useQueries({
    queries: [
      { queryKey: ['staff-members'], queryFn: fetchStaffMembers, retry: false },
      // Nur fuer die Rollen der Terminverwaltung: fuer trainer weist die
      // Datenbank den Aufruf ab, und jeder Seitenaufruf stuende als `denied`
      // im Auditlog (BEF-034). Ohne Abfrage bleibt der Hinweis „nicht
      // zuordenbar" weg - die Frage stellt sich fuer diese Rolle nicht.
      {
        queryKey: ['assignable-therapists'],
        queryFn: fetchAssignableTherapists,
        retry: false,
        enabled: fragtZuordenbarkeit,
      },
    ],
  });

  const zuordenbareIds = useMemo(
    () => new Set((zuordenbar.data ?? []).map((t) => t.staff_member_id)),
    [zuordenbar.data],
  );

  const sichtbar = useMemo(
    () =>
      (liste.data ?? []).filter(
        (s) => (status === 'all' || s.employment_status === status) && matches(s, query),
      ),
    [liste.data, query, status],
  );

  // Der gefilterte Stand reist als Rückweg mit (ORG-24): „← Zurück zu den
  // Mitarbeitenden" führt dann in genau diese Liste, nicht in die ungefilterte.
  const filter = toSearchParams(query, status).toString();
  const rueckweg = filter ? `/praxis/team?${filter}` : null;

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
      {/* „Mitarbeitende" statt „Team": das Verzeichnis der Beschaeftigten
          steht unter Organisatorisches, der gleichnamige Arbeitsbereich heisst
          seit dem 2026-09-12 Kommunikation und meint den Chat. Zwei Seiten mit
          derselben Ueberschrift waeren nicht auseinanderzuhalten.

          Was hier nicht entsteht, steht nicht im Kopf (UX-005i). */}
      <PageHeader
        title="Mitarbeitende"
        description="Mitarbeitende der Praxis."
        actions={
          canManageStaffMasterData(user.roles) ? (
            <ButtonLink to="/praxis/team/neu">Mitarbeiter:in anlegen</ButtonLink>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="max-w-sm flex-1 basis-56">
          <SearchField
            placeholder="Name, dienstliche Erreichbarkeit, Standort"
            value={query}
            onChange={updateQuery}
          />
        </div>
        {/* Der Baustein statt einer Klassenkopie (ORG-16, TOK-13, UIK-19):
            48 px wie das Suchfeld daneben, die Beschriftungen auf einer Höhe. */}
        <div className="w-full sm:w-48">
          <Select
            label="Beschäftigung"
            feldId="staff-status"
            value={status}
            onChange={(event) => updateStatus(event.target.value as StatusFilter)}
          >
            <option value="all">Alle</option>
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
          </Select>
        </div>
      </div>

      {liste.isPending ? <LoadingState label="Mitarbeiterliste wird geladen …" /> : null}
      {liste.isError && !liste.data ? (
        <ErrorState
          title="Die Mitarbeiterliste konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und später erneut versuchen."
          onErneut={() => void liste.refetch()}
        />
      ) : null}
      {liste.isError && liste.data ? (
        <NachladeHinweis
          className="mb-4"
          laeuft={liste.isFetching}
          onErneut={() => void liste.refetch()}
        />
      ) : null}
      {/* Ohne Antwort keine Aussage (ORG-14): Bis UXR-011 trug nach einem
          Ladefehler jede aktive Person „nicht für Termine zuordenbar". */}
      {fragtZuordenbarkeit && zuordenbar.isError && liste.data ? (
        <div className="mb-4">
          <Listenfehler
            text="Ob jemand für Termine zuordenbar ist, konnte nicht geladen werden."
            onErneut={() => void zuordenbar.refetch()}
          />
        </div>
      ) : null}

      {liste.data && sichtbar.length === 0 ? (
        <EmptyState
          title={liste.data.length === 0 ? 'Noch keine Mitarbeitenden' : 'Keine Treffer'}
          description={liste.data.length === 0 ? undefined : 'Suche oder Filter anpassen.'}
        />
      ) : null}

      {sichtbar.length > 0 ? (
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
          {sichtbar.map((staff) => {
            const aktiv = staff.employment_status === 'active';
            const nichtZuordenbar = aktiv && zuordenbar.isSuccess && !zuordenbareIds.has(staff.id);
            return (
              <li key={staff.id}>
                {/* Am Telefon steht das Etikett unter der Standortzeile
                    (ORG-11): Neben dem Namen ließ es ihm bei 390 px rund
                    115 px, und ausgerechnet der Name wurde gekürzt. */}
                <Link
                  to={mitRueckweg(`/praxis/team/${staff.id}`, rueckweg)}
                  className="hover:bg-surface-sunken flex min-h-16 flex-col gap-1.5 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <span className="min-w-0">
                    <span className="text-ink text-liste block truncate font-medium">
                      {fullName(staff)}
                    </span>
                    <span className="text-ink-muted mt-0.5 block text-sm">
                      {staff.primary_location_name ?? 'Ohne festen Standort'}
                      {staff.work_phone ? (
                        <>
                          {' · '}
                          <span className="whitespace-nowrap">{staff.work_phone}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  {!aktiv || nichtZuordenbar ? (
                    <span className="flex shrink-0 flex-wrap gap-1 sm:flex-col sm:items-end">
                      {!aktiv ? <Badge>Inaktiv</Badge> : null}
                      {nichtZuordenbar ? <Badge>Nicht für Termine zuordenbar</Badge> : null}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Die Regel erklärt nur, was diese Rolle auf der Seite sieht, und
          sagt der Praxisinhaber:in, wo Zugänge entstehen (ORG-25). Zugeklappt,
          weil sie das System erklärt, nicht die Liste (UX-005i). */}
      {fragtZuordenbarkeit ? (
        <div className="mt-8 max-w-prose">
          <Disclosure summary="Wer ist zuordenbar?">
            <p className="text-ink-muted text-sm leading-relaxed">
              Als behandelnde Person zuordenbar ist, wer aktiv beschäftigt ist und zusätzlich einen
              eigenen Zugang mit der Rolle Therapeut:in oder Teamleitung hat.
              {canManageStaffAccounts(user.roles)
                ? ' Zugang und Rollen vergeben Sie bei der Person unter „Zugang“.'
                : ''}
            </p>
          </Disclosure>
        </div>
      ) : null}
    </>
  );
}

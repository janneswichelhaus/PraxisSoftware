import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { SearchField } from '@/components/ui/SearchField';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { fetchAssignableTherapists } from '@/features/appointments/api';
import { canManageStaffMasterData, type CurrentUser } from '@/features/session/types';
import { fetchStaffMembers, staffFullName, type StaffMember } from './api';

type StatusFilter = 'all' | 'active' | 'inactive';

const selectClass =
  'min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink';

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
  return [staffFullName(staff), staff.work_email, staff.work_phone, staff.primary_location_name]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

/**
 * Mitarbeiterliste.
 *
 * Lesbar für alle Praxisrollen; angelegt und geändert wird nur durch die
 * administrative Praxisrolle. Die ausgeblendete Schaltfläche ist dabei keine
 * Zugriffskontrolle - verbindlich prüft der Server (ADR-004).
 *
 * Neben dem Beschäftigungsstatus wird ausgewiesen, ob eine Person aktuell als
 * behandelnde Person zuordenbar ist. Das ist eine andere Frage: dafür braucht
 * es zusätzlich einen eigenen Zugang mit therapeutischer Rolle (CAL-001).
 */
export function StaffListPage({ user }: { user: CurrentUser }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [status, setStatus] = useState<StatusFilter>(() =>
    parseStatusFilter(searchParams.get('status')),
  );

  const [liste, zuordenbar] = useQueries({
    queries: [
      { queryKey: ['staff-members'], queryFn: fetchStaffMembers, retry: false },
      { queryKey: ['assignable-therapists'], queryFn: fetchAssignableTherapists, retry: false },
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
      {/* „Mitarbeitende" statt „Team": der Arbeitsbereich „Team" ist seit dem
          Umbau die Teamkommunikation. Zwei Seiten mit derselben Ueberschrift in
          derselben Anwendung waeren nicht auseinanderzuhalten. */}
      <PageHeader
        title="Mitarbeitende"
        description="Mitarbeitende der Praxis. Ein Zugang zur Anwendung entsteht hier nicht."
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="staff-status" className="text-ink text-sm font-medium">
            Beschäftigung
          </label>
          <select
            id="staff-status"
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

      {liste.isPending ? <LoadingState label="Mitarbeiterliste wird geladen …" /> : null}
      {liste.isError ? (
        <ErrorState
          title="Die Mitarbeiterliste konnte nicht geladen werden."
          description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
        />
      ) : null}

      {liste.data && sichtbar.length === 0 ? (
        <EmptyState
          title={liste.data.length === 0 ? 'Noch keine Mitarbeitenden' : 'Keine Treffer'}
          description={liste.data.length === 0 ? undefined : 'Suche oder Filter anpassen.'}
        />
      ) : null}

      {sichtbar.length > 0 ? (
        <ul className="divide-line border-line divide-y border-y">
          {sichtbar.map((staff) => {
            const aktiv = staff.employment_status === 'active';
            const kannBehandeln = zuordenbareIds.has(staff.id);
            return (
              <li key={staff.id}>
                <Link
                  to={`/praxis/team/${staff.id}`}
                  className="hover:bg-surface-sunken flex min-h-16 items-center justify-between gap-4 py-3 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="text-ink block truncate text-[0.9375rem] font-medium">
                      {staffFullName(staff)}
                    </span>
                    <span className="text-ink-muted mt-0.5 block text-sm">
                      {staff.primary_location_name ?? 'Ohne festen Standort'}
                      {staff.work_phone ? ` · ${staff.work_phone}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {!aktiv ? (
                      <span className="bg-surface-sunken text-ink-muted rounded-full px-2.5 py-0.5 text-xs">
                        inaktiv
                      </span>
                    ) : null}
                    {aktiv && !kannBehandeln && !zuordenbar.isPending ? (
                      <span className="bg-surface-sunken text-ink-muted rounded-full px-2.5 py-0.5 text-xs">
                        nicht für Termine zuordenbar
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Als behandelnde Person zuordenbar ist, wer aktiv beschäftigt ist und zusätzlich einen
        eigenen Zugang mit therapeutischer Rolle hat. Zugänge und Rollen werden nicht hier vergeben.
      </p>
    </>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  AUDIT_ACTIONS,
  auditActionLabels,
  auditOutcomeLabels,
  auditSubjectLabels,
  type AuditAction,
} from './actions';
import {
  fetchAuditEvents,
  fetchOrganizationMembers,
  formatTimestamp,
  shortReference,
  type AuditEvent,
} from './api';

const PAGE_SIZE = 25;

const selectClass =
  'min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink';

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

function EventRow({ event }: { event: AuditEvent }) {
  return (
    <li className="py-3 sm:grid sm:grid-cols-[11rem_10rem_1fr_9rem] sm:items-baseline sm:gap-4 sm:py-2.5">
      <span className="text-ink-muted block text-sm tabular-nums">
        {formatTimestamp(event.occurred_at)}
      </span>
      <span className="text-ink mt-0.5 block truncate text-[0.9375rem] sm:mt-0">
        {event.actor_display_name ?? 'Unbekannt'}
      </span>
      <span className="text-ink mt-0.5 block text-[0.9375rem] sm:mt-0">
        {label(auditActionLabels, event.action)}
        <span className="text-ink-subtle">
          {' · '}
          {label(auditSubjectLabels, event.subject_type)}{' '}
          <span title={event.subject_id ?? undefined} className="tabular-nums">
            {shortReference(event.subject_id)}
          </span>
        </span>
      </span>
      <span className="text-ink-muted mt-0.5 block text-sm sm:mt-0 sm:text-right">
        {label(auditOutcomeLabels, event.outcome)}
      </span>
    </li>
  );
}

export function AuditLogPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(0);

  const filter = {
    from: from || undefined,
    to: to || undefined,
    actorUserId: actorUserId || undefined,
    action: action || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isPending, isError } = useQuery({
    queryKey: ['audit-events', filter],
    queryFn: () => fetchAuditEvents(filter),
    retry: false,
  });

  const { data: members } = useQuery({
    queryKey: ['organization-members'],
    queryFn: fetchOrganizationMembers,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const total = data?.totalCount ?? 0;
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min((page + 1) * PAGE_SIZE, total);
  const hasNext = last < total;

  function reset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(0);
    };
  }

  return (
    <>
      <PageHeader
        title="Audit"
        description="Protokollierte Zugriffe und sicherheitsrelevante Vorgänge dieser Praxis."
      />

      <form
        className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-from" className="text-ink text-sm font-medium">
            Von
          </label>
          <input
            id="audit-from"
            type="date"
            className={selectClass}
            value={from}
            onChange={(event) => reset(setFrom)(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-to" className="text-ink text-sm font-medium">
            Bis
          </label>
          <input
            id="audit-to"
            type="date"
            className={selectClass}
            value={to}
            onChange={(event) => reset(setTo)(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-user" className="text-ink text-sm font-medium">
            Benutzer
          </label>
          <select
            id="audit-user"
            className={selectClass}
            value={actorUserId}
            onChange={(event) => reset(setActorUserId)(event.target.value)}
          >
            <option value="">Alle</option>
            {(members ?? []).map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-action" className="text-ink text-sm font-medium">
            Aktion
          </label>
          <select
            id="audit-action"
            className={selectClass}
            value={action}
            onChange={(event) => reset(setAction)(event.target.value)}
          >
            <option value="">Alle</option>
            {AUDIT_ACTIONS.map((key: AuditAction) => (
              <option key={key} value={key}>
                {auditActionLabels[key]}
              </option>
            ))}
          </select>
        </div>
      </form>

      {isPending ? <LoadingState label="Auditeinträge werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Auditeinträge konnten nicht geladen werden."
          description="Diese Ansicht ist ausschließlich für die Praxisleitung freigegeben."
        />
      ) : null}

      {data && data.events.length === 0 ? (
        <EmptyState
          title="Keine Einträge im gewählten Zeitraum"
          description="Filter anpassen oder Zeitraum erweitern."
        />
      ) : null}

      {data && data.events.length > 0 ? (
        <>
          <ul className="divide-line border-line divide-y border-y">
            {data.events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink-muted text-sm tabular-nums" role="status">
              {first}–{last} von {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Zurück
              </Button>
              <Button
                variant="secondary"
                disabled={!hasNext}
                onClick={() => setPage((current) => current + 1)}
              >
                Weiter
              </Button>
            </div>
          </div>
        </>
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Der Aufruf dieser Seite wird selbst protokolliert. Angezeigt werden ausschließlich
        Metadaten; Inhalte der Patientenakte sind nicht Bestandteil des Auditlogs.
      </p>
    </>
  );
}

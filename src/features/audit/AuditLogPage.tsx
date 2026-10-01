import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Aufklappzeichen, Inhaltsflaeche } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Listenfehler, NachladeHinweis } from '@/features/appointments/Rueckmeldungen';
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

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

/**
 * Anzeigename des Akteurs. Systemereignisse haben keinen Account (ANN-009).
 * Ein Plattformkonto hat kein Profil und damit keinen Namen in der Praxis;
 * es steht unterscheidbar als solches da (ADR-023 Punkt 14, POR-002).
 */
function akteur(event: AuditEvent): string {
  if (event.actor_kind === 'system') return 'System';
  if (event.actor_kind === 'platform') return 'Plattformkonto';
  return event.actor_display_name ?? 'Unbekannt';
}

/**
 * Eine Zeile des Auditlogs.
 *
 * **Spalten erst ab 1024 px (ORG-12).** Ab 640 px galten bis UXR-011 vier
 * feste Spalten mit 528 px samt Lücken; bei 700 bis 820 px blieben der
 * eigentlichen Aussage - was geschah - rund 150 px, „Behandlungsdokumentation"
 * passte nicht hinein, und die Seite scrollte quer. Darunter stehen die
 * Angaben jetzt untereinander wie am Telefon, und die Vorgangsspalte darf
 * schmaler werden als ihr längstes Wort.
 *
 * **Spaltenköpfe für Vorlesesoftware (UIK-24).** Die Zeile ist eine Liste,
 * keine Tabelle; welche Angabe was ist, erschloss sich bisher nur aus dem
 * Inhalt. Jede Angabe trägt deshalb ihre Bezeichnung, sichtbar nur für
 * Vorlesesoftware.
 *
 * Nur Darstellung: Gelesen wird unverändert über `list_audit_events`
 * (ADR-010), und was eine Zeile zeigt, bleibt Metadatum.
 */
function EventRow({ event }: { event: AuditEvent }) {
  return (
    <li className="py-3 lg:grid lg:grid-cols-[10rem_12rem_minmax(0,1fr)_7rem] lg:items-baseline lg:gap-4 lg:py-2.5">
      <span className="text-ink-muted block text-sm tabular-nums">
        <span className="sr-only">Zeitpunkt: </span>
        {formatTimestamp(event.occurred_at)}
      </span>
      <span className="text-ink text-liste mt-0.5 block truncate lg:mt-0">
        <span className="sr-only">Person: </span>
        {akteur(event)}
      </span>
      <span className="text-ink text-liste mt-0.5 block min-w-0 wrap-anywhere lg:mt-0">
        <span className="sr-only">Vorgang: </span>
        {label(auditActionLabels, event.action)}
        <span className="text-ink-muted">
          {' · '}
          {label(auditSubjectLabels, event.subject_type)}{' '}
          <span title={event.subject_id ?? undefined} className="tabular-nums">
            {shortReference(event.subject_id)}
          </span>
        </span>
      </span>
      <span className="text-ink-muted mt-0.5 block text-sm lg:mt-0 lg:text-right">
        <span className="sr-only">Ergebnis: </span>
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

  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ['audit-events', filter],
    queryFn: () => fetchAuditEvents(filter),
    retry: false,
  });

  const members = useQuery({
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
      {/* Der Titel ist das Wort des Menüpunkts (ORG-07): bis UXR-011 öffnete
          „Sicherheit" eine Seite namens „Audit". */}
      <PageHeader
        title="Protokoll"
        description="Protokollierte Zugriffe und sicherheitsrelevante Vorgänge dieser Praxis."
      />

      {/* Die Filter sind die Bausteine `Field` und `Select` (RSP-01, UIK-19,
          TOK-13): 48 px hoch wie jedes Feld und immer so breit wie ihre
          Spalte. Bis UXR-011 waren es rohe Felder ohne volle Breite - das
          längste Wort der Aktionsliste setzte die Breite der Spalte, und die
          Seite lief bei 390 px 36 px über den Rand. Unter 640 px steht eine
          Spalte ausdrücklich da. Nur die Darstellung ist neu; welche Werte an
          den Server gehen, bleibt gleich. */}
      <form
        className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field
          label="Von"
          feldId="audit-from"
          type="date"
          value={from}
          onChange={(event) => reset(setFrom)(event.target.value)}
        />
        <Field
          label="Bis"
          feldId="audit-to"
          type="date"
          value={to}
          onChange={(event) => reset(setTo)(event.target.value)}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <Select
            label="Person"
            feldId="audit-user"
            value={actorUserId}
            onChange={(event) => reset(setActorUserId)(event.target.value)}
          >
            <option value="">Alle</option>
            {(members.data ?? []).map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name}
              </option>
            ))}
          </Select>
          {/* Ohne Liste steht nur „Alle" zur Wahl - das sagt die Seite, statt
              es als vollständige Auswahl auszugeben (ORG-14). */}
          {members.isError ? (
            <Listenfehler
              text="Die Liste der Personen konnte nicht geladen werden."
              onErneut={() => void members.refetch()}
            />
          ) : null}
        </div>
        <Select
          label="Aktion"
          feldId="audit-action"
          value={action}
          onChange={(event) => reset(setAction)(event.target.value)}
        >
          <option value="">Alle</option>
          {AUDIT_ACTIONS.map((key: AuditAction) => (
            <option key={key} value={key}>
              {auditActionLabels[key]}
            </option>
          ))}
        </Select>
      </form>

      {isPending ? <LoadingState label="Auditeinträge werden geladen …" /> : null}
      {/* Wer diese Seite sieht, ist berechtigt: Die Route steht nur der
          Praxisinhaber:in offen. Ein Ladefehler ist deshalb ein Verbindungs-
          und kein Rechteproblem - bis UXR-011 las die Praxisinhaber:in hier,
          die Ansicht sei „ausschließlich für die Praxisleitung freigegeben"
          (ORG-15, WRT-01, ZST-12). */}
      {isError && !data ? (
        <ErrorState
          title="Die Auditeinträge konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : null}
      {isError && data ? (
        <NachladeHinweis className="mb-4" laeuft={isFetching} onErneut={() => void refetch()} />
      ) : null}

      {data && data.events.length === 0 ? (
        <EmptyState
          title="Keine Einträge im gewählten Zeitraum"
          description="Filter anpassen oder Zeitraum erweitern."
        />
      ) : null}

      {data && data.events.length > 0 ? (
        <>
          {/* Die Liste ist Auskunft und steht deshalb auf Papier wie jede
              andere Liste der Anwendung (ORG-16). */}
          <Inhaltsflaeche>
            <ul className="divide-line divide-y">
              {data.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </ul>
          </Inhaltsflaeche>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Statusmeldung className="tabular-nums">
              {first}–{last} von {total}
            </Statusmeldung>
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

      {/* Die Fußnote erklärt das System, nicht die Einträge - zugeklappt (UX-005i). */}
      <details className="group border-line mt-10 max-w-prose border-t pt-2">
        <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink text-sm`}>
          <Aufklappzeichen />
          Was wird protokolliert?
        </summary>
        <p className="text-ink-muted mt-2 text-xs leading-relaxed">
          Der Aufruf dieser Seite wird selbst protokolliert. Angezeigt werden ausschließlich
          Metadaten; Inhalte der Patientenakte sind nicht Bestandteil des Protokolls.
        </p>
      </details>
    </>
  );
}

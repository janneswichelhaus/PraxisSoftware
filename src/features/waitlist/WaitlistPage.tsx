import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import { basisText, wishText } from './format';
import {
  fetchWaitlist,
  reasonLabels,
  waitingText,
  withdrawWaitlistEntry,
  type ListFilter,
  type WaitlistEntry,
} from './api';

const FILTER_LABELS: Record<ListFilter, string> = {
  open: 'Offen',
  closed: 'Geschlossen',
};

function PhoneLinks({ entry }: { entry: WaitlistEntry }) {
  const numbers = [entry.phone, entry.phone_mobile].filter((n): n is string => Boolean(n));
  if (numbers.length === 0) {
    return <span className="text-ink-muted text-sm">Keine Telefonnummer hinterlegt</span>;
  }
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {numbers.map((number) => (
        <a
          key={number}
          href={telHref(number)}
          className="text-accent inline-flex min-h-11 items-center underline underline-offset-2"
        >
          Anrufen: {number}
        </a>
      ))}
    </span>
  );
}

function EntryItem({ entry, today }: { entry: WaitlistEntry; today: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | undefined>();
  const isOpen = entry.status === 'open';
  const here = '/warteliste';

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link
          to={`/patienten/${entry.patient_id}/termine`}
          className="text-ink text-liste font-medium break-words underline-offset-2 hover:underline"
        >
          {entry.patient_family_name}, {entry.patient_given_name}
        </Link>
        <span className="flex flex-wrap gap-2">
          {isOpen ? <Badge>{reasonLabels[entry.priority_reason]}</Badge> : null}
          {entry.status === 'placed' ? <Badge ton="positiv">Eingeplant</Badge> : null}
          {entry.status === 'withdrawn' ? <Badge>Zurückgezogen</Badge> : null}
        </span>
      </div>

      <p className="text-ink mt-1 text-sm">{wishText(entry)}</p>
      <p className="text-ink-muted mt-0.5 text-sm">
        {[
          basisText(entry),
          isOpen ? `wartet ${waitingText(entry.created_at, today)}` : null,
          entry.earliest_on ? `frühestens ab ${formatDate(entry.earliest_on)}` : null,
          entry.needed_by ? `bis spätestens ${formatDate(entry.needed_by)}` : null,
          !isOpen && entry.closed_at
            ? `geschlossen am ${formatDate(entry.closed_at.slice(0, 10))}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {entry.note ? <p className="text-ink mt-1 text-sm break-words">„{entry.note}"</p> : null}

      {isOpen ? (
        <>
          <div className="mt-2">
            <PhoneLinks entry={entry} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <ButtonLink
              to={mitRueckweg(
                `/patienten/${entry.patient_id}/plaetze?warteliste=${entry.id}`,
                here,
              )}
              groesse="kompakt"
            >
              Freie Termine suchen
            </ButtonLink>
            <ButtonLink
              to={mitRueckweg(`/warteliste/${entry.id}/bearbeiten`, here)}
              variant="secondary"
              groesse="kompakt"
            >
              Bearbeiten
            </ButtonLink>
            <Rueckfrage
              ausloeser="Von der Liste nehmen"
              ausloeserVariante="quiet"
              bestaetigen="Von der Liste nehmen"
              bestaetigenLaeuft="Wird genommen …"
              fehler={error}
              onAbbrechen={() => setError(undefined)}
              onBestaetigen={async () => {
                try {
                  await withdrawWaitlistEntry(entry);
                  await queryClient.invalidateQueries({ queryKey: ['waitlist'] });
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : undefined);
                  throw caught;
                }
              }}
            >
              {entry.patient_given_name} {entry.patient_family_name} von der Warteliste nehmen? Der
              Eintrag bleibt unter „Geschlossen" sichtbar.
            </Rueckfrage>
          </div>
        </>
      ) : entry.placed_appointment_id ? (
        <p className="mt-2 text-sm">
          <Link
            to={`/termine/${entry.placed_appointment_id}`}
            className="text-accent underline underline-offset-2"
          >
            Zum Termin
          </Link>
        </p>
      ) : null}
    </li>
  );
}

/**
 * Warteliste (PRX-001).
 *
 * Wer auf einen Termin wartet, mit Wunschzeiten, Dauer und organisatorischem
 * Grund (ANN-132). Geordnet nach „bis spätestens", dann nach Wartezeit — die
 * Reihenfolge kommt vom Server, die Seite sortiert nicht nach. Wird ein Platz
 * frei, ruft die Praxis an; die Nummer steht deshalb am Eintrag. Nichts wird
 * versendet (B15).
 */
export function WaitlistPage({ user }: { user: CurrentUser }) {
  const [filter, setFilter] = useState<ListFilter>('open');
  const today = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');

  const { data, isPending, isError, refetch, isRefetchError } = useQuery({
    queryKey: ['waitlist', filter],
    queryFn: () => fetchWaitlist(filter),
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Warteliste"
        description="Wer auf einen Termin wartet. Wird ein Platz frei, zeigt die Absage die passenden Einträge; angerufen wird von hier – versendet wird nichts."
        actions={<ButtonLink to="/warteliste/neu">Auf die Warteliste setzen</ButtonLink>}
      />

      <div role="group" aria-label="Einträge anzeigen" className="mb-4 flex gap-2">
        {(Object.keys(FILTER_LABELS) as ListFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-pill min-h-11 border px-4 text-sm font-medium ${
              filter === value
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line-strong text-ink'
            }`}
          >
            {FILTER_LABELS[value]}
          </button>
        ))}
      </div>

      {isPending ? <LoadingState label="Warteliste wird geladen …" /> : null}
      {isError && !data ? (
        <ErrorState
          title="Die Warteliste konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : null}
      {isRefetchError && data ? (
        <Statusmeldung ton="warnung" className="mb-3">
          Die Liste konnte nicht aktualisiert werden; der angezeigte Stand kann veraltet sein.
        </Statusmeldung>
      ) : null}

      {data && data.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? 'Niemand wartet' : 'Noch nichts geschlossen'}
          description={
            filter === 'open'
              ? 'Wer keinen zeitnahen Termin bekommt, lässt sich hier oder aus der Akte eintragen.'
              : 'Eingeplante und zurückgezogene Einträge erscheinen hier.'
          }
        />
      ) : null}

      {data && data.length > 0 ? (
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
          {data.map((entry) => (
            <EntryItem key={entry.id} entry={entry} today={today} />
          ))}
        </ul>
      ) : null}
    </>
  );
}

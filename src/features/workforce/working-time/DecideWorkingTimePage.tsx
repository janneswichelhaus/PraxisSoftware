import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { beginne, kannZurueck, weiter, zurueck, type Abfolge } from '@/components/ui/abfolge';
import { DaysToReschedule } from '@/features/calendar';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import type { CurrentUser } from '@/features/core';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  WORKING_TIME_KEY,
  decideRequest,
  fetchWorkingTime,
  type Decision,
  type OpenRequest,
} from './api';
import {
  WEEKDAY_NAME,
  changeTitle,
  changedWeekdays,
  dayText,
  isoWeekday,
  minutesChange,
} from './format';
import { formatLocalDate } from '@/lib/datum';

/**
 * Über eine Arbeitszeitänderung entscheiden (G8b, AZ-001): je Antrag eine
 * Seite mit allem, was die Entscheidung braucht - was sich ab wann ändert,
 * bisher und neu, die Arbeitszeit, der Grund der Person, wie viele Termine
 * außerhalb der neuen Zeiten liegen. Genehmigen sind zwei Tipps (öffnen,
 * Genehmigen), Ablehnen drei und der Grund, der Pflicht ist (ANN-590).
 *
 * Der Server prüft beim Genehmigen erneut gegen den jetzigen Plan (ANN-588):
 * Ist er inzwischen länger, wäre die Änderung eine Kürzung - dann bleibt nur
 * Ablehnen. Termine verschiebt niemand still: Danach stehen die Tage mit
 * Terminen außerhalb da, jeder mit dem Weg zu „Tag umplanen“ (G2).
 */

type Page = 'details' | 'reject' | 'done';

const REJECT_TEXTS = {
  ...EINGABETEXTE,
  bezeichnung: 'Noch nicht abgelehnt',
  zeile: {
    weitergehen: 'Der Antrag ist noch nicht abgelehnt.',
    abmelden: 'Der Antrag ist noch nicht abgelehnt – abmelden?',
    bleiben: 'Weiter',
  },
};

export function DecideWorkingTimePage({ user }: { user: CurrentUser }) {
  const { requestId } = useParams();
  const [search] = useSearchParams();
  const returnTo = leseRueckweg(search, '/betrieb/arbeitszeit');
  const query = useQuery({ queryKey: WORKING_TIME_KEY, queryFn: fetchWorkingTime, retry: false });
  // Die Entscheidung bleibt stehen, auch wenn der Antrag nach dem Neuladen
  // nicht mehr unter den offenen ist.
  const [decided, setDecided] = useState<{ request: OpenRequest; result: Decision } | null>(null);

  if (decided) {
    return (
      <Flow
        request={decided.request}
        result={decided.result}
        user={user}
        returnTo={returnTo}
        onDecided={() => undefined}
      />
    );
  }

  return (
    <Abfragezustand
      abfrage={query}
      laden="Antrag wird geladen …"
      fehler="Der Antrag konnte nicht geladen werden."
      rahmen={(zustand) => (
        <>
          <PageHeader title="Arbeitszeitänderung" />
          {zustand}
        </>
      )}
    >
      {(state) => {
        const request = state.to_decide.find((r) => r.id === requestId);
        if (!request) {
          return (
            <>
              <PageHeader title="Arbeitszeitänderung" />
              {/* Entschieden, zurückgezogen, unbekannt oder nicht zu
                  entscheiden - die Seite unterscheidet das nicht. */}
              <EmptyState
                inKarte
                title="Kein offener Antrag"
                aktion={
                  <ButtonLink to={returnTo} variant="secondary">
                    Zurück
                  </ButtonLink>
                }
              />
            </>
          );
        }
        return (
          <Flow
            request={request}
            result={null}
            user={user}
            returnTo={returnTo}
            onDecided={(result) => setDecided({ request, result })}
          />
        );
      }}
    </Abfragezustand>
  );
}

function Flow({
  request,
  result,
  user,
  returnTo,
  onDecided,
}: {
  request: OpenRequest;
  result: Decision | null;
  user: CurrentUser;
  returnTo: string;
  onDecided: (result: Decision) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const name = request.name ?? 'Unbekannte Person';
  const [flow, setFlow] = useState<Abfolge<Page>>(() => beginne<Page>(result ? 'done' : 'details'));
  const [reason, setReason] = useState('');
  const page = result ? 'done' : flow.seite;

  const goBack = () => {
    const before = zurueck(flow);
    if (before) setFlow(before);
  };

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: page === 'reject' && reason.trim() !== '',
    kompakt: true,
    texte: REJECT_TEXTS,
    schrittZurueck: page !== 'done' && kannZurueck(flow) ? goBack : undefined,
  });

  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      decideRequest({ requestId: request.id, approve, note: approve ? null : reason.trim() }),
    onSuccess: async (answer) => {
      freigeben();
      onDecided(answer);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKING_TIME_KEY }),
        // Genehmigt ändert sich der Wochenplan bzw. der Tag im Kalender.
        queryClient.invalidateQueries({ queryKey: ['working-hours'] }),
        queryClient.invalidateQueries({ queryKey: ['working-hour-exceptions'] }),
      ]);
    },
  });

  const what = changeTitle(request.kind, request.on_date);
  const object = `Arbeitszeit von ${name}`;
  const error = decide.isError ? (
    <Statusmeldung ton="fehler">
      {decide.error instanceof Error
        ? decide.error.message
        : 'Die Entscheidung konnte nicht gespeichert werden.'}
    </Statusmeldung>
  ) : null;

  if (page === 'done' && result) {
    const approved = result.status === 'approved';
    return (
      <GefuehrterAblauf
        titel={approved ? 'Genehmigt' : 'Abgelehnt'}
        objekt={object}
        schliessen="Schließen"
        onSchliessen={() => void navigate(returnTo)}
        seite="done"
        abschluss
        fuss={
          <Button className="w-full" onClick={() => void navigate(returnTo)} data-autofocus>
            Fertig
          </Button>
        }
      >
        <div className="flex flex-col gap-6">
          <Statusmeldung ton="erfolg">
            {approved
              ? `Arbeitszeit von ${name} ist geändert: ${what}.`
              : `${name} sieht die Ablehnung mit Ihrem Grund.`}
          </Statusmeldung>
          {approved ? (
            <DaysToReschedule
              staffMemberId={request.staff_member_id}
              // Je Tag die neue Arbeitszeit: „Tag umplanen“ wählt nur die
              // Termine außerhalb vor, nicht den ganzen Tag.
              days={result.appointment_days.map((day) => ({
                ...day,
                zeiten:
                  request.kind === 'once'
                    ? request.blocks
                    : (request.blocks[isoWeekday(day.on_date)] ?? []),
              }))}
              user={user}
              returnTo={returnTo}
            />
          ) : null}
        </div>
      </GefuehrterAblauf>
    );
  }

  if (page === 'reject') {
    return (
      <GefuehrterAblauf
        titel="Warum nicht?"
        objekt={object}
        schliessen="Schließen"
        onSchliessen={() => void navigate(returnTo)}
        seite="reject"
        onZurueck={goBack}
        schutz={schutz}
        fuss={
          <div className="flex flex-col gap-2">
            {error}
            <Button
              className="w-full"
              disabled={reason.trim() === '' || decide.isPending}
              onClick={() => decide.mutate(false)}
            >
              {decide.isPending ? 'Wird gespeichert …' : 'Ablehnen'}
            </Button>
          </div>
        }
      >
        <TextArea
          label={`Grund – ${name} sieht ihn`}
          value={reason}
          maxLength={500}
          rows={4}
          required
          data-autofocus
          onChange={(e) => setReason(e.target.value)}
        />
      </GefuehrterAblauf>
    );
  }

  const appointments = request.appointment_days.reduce((sum, d) => sum + d.appointments, 0);
  return (
    <GefuehrterAblauf
      titel="Änderung genehmigen?"
      objekt={object}
      schliessen="Schließen"
      onSchliessen={() => void navigate(returnTo)}
      seite="details"
      schutz={schutz}
      abschluss
      fuss={
        <div className="flex flex-col gap-2">
          {error}
          <Button
            className="w-full"
            disabled={decide.isPending}
            onClick={() => decide.mutate(true)}
          >
            {decide.isPending ? 'Wird gespeichert …' : 'Genehmigen'}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={decide.isPending}
            onClick={() => {
              decide.reset();
              setFlow(weiter(flow, 'reject'));
            }}
          >
            Ablehnen
          </Button>
        </div>
      }
    >
      <ListRows rahmen={false} beschriftung="Antrag">
        <ListRow titel={what} />
        {request.kind === 'once' ? (
          <ListRow
            titel={dayText(request.blocks)}
            meta={`bisher ${dayText(request.previous_blocks)}`}
          />
        ) : (
          changedWeekdays(request.previous_blocks, request.blocks).map((day) => (
            <ListRow
              key={day}
              titel={`${WEEKDAY_NAME[day]}: ${dayText(request.blocks[day] ?? [])}`}
              meta={`bisher ${dayText(request.previous_blocks[day] ?? [])}`}
            />
          ))
        )}
        <ListRow
          titel={request.kind === 'once' ? 'Arbeitszeit am Tag' : 'Arbeitszeit in der Woche'}
          meta={minutesChange(request.previous_minutes, request.new_minutes)}
        />
        {request.message ? <ListRow titel="Grund" meta={request.message} /> : null}
        <ListRow
          titel={
            appointments === 0
              ? 'Keine Termine außerhalb der neuen Zeiten'
              : `${appointments} ${appointments === 1 ? 'Termin' : 'Termine'} außerhalb der neuen Zeiten`
          }
          meta={appointments === 0 ? undefined : 'Nach dem Genehmigen umplanen'}
        />
        <ListRow
          titel="Beantragt"
          meta={formatLocalDate(request.requested_at, user.organizationTimeZone ?? 'Europe/Berlin')}
        />
      </ListRows>
    </GefuehrterAblauf>
  );
}

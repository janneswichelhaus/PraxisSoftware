import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { isOwner, type CurrentUser } from '@/features/session/types';
import {
  WORKING_TIME_KEY,
  fetchWorkingTime,
  withdrawRequest,
  type OwnRequest,
  type WorkingTime,
} from './api';
import { WeekRows } from './WeekRows';
import { changeTitle, dateLong, minutesChange, statusDisplay } from './format';

/**
 * Arbeitszeit (AZ-001, Überholung 8).
 *
 * Eine Seite für alle Rollen; was jemand sieht, entscheidet der Server
 * (ANN-590): der eigene Wochenplan, wie er heute gilt, und - schon
 * genehmigt - ab wann ein neuer gilt; die eigenen Anträge mit Grund und
 * Entscheidung; für owner die offenen Anträge der anderen. Keine Übersicht
 * über die Arbeitszeiten aller (§20).
 *
 * Reihenfolge wie beim Urlaub: was jemand warten lässt, dann der eigene Plan,
 * dann die eigenen Anträge. Beantragen und Entscheiden sind geführte Abläufe
 * auf eigenen Seiten (G8, G8b).
 */
export function WorkingTimePage({ user }: { user: CurrentUser }) {
  const notice = (useLocation().state as { meldung?: unknown } | null)?.meldung;
  const query = useQuery({ queryKey: WORKING_TIME_KEY, queryFn: fetchWorkingTime, retry: false });
  const action = isOwner(user.roles) ? 'Änderung eintragen' : 'Änderung beantragen';

  return (
    <>
      <PageHeader
        title="Arbeitszeit"
        actions={
          query.data?.plan?.has_plan ? (
            <ButtonLink to="/betrieb/arbeitszeit/beantragen">{action}</ButtonLink>
          ) : null
        }
      />
      {typeof notice === 'string' ? <Rueckmeldung className="mb-6">{notice}</Rueckmeldung> : null}
      <Abfragezustand
        abfrage={query}
        laden="Arbeitszeit wird geladen …"
        fehler="Die Arbeitszeit konnte nicht geladen werden."
        inKarte
      >
        {(state) => <Content state={state} />}
      </Abfragezustand>
    </>
  );
}

function Content({ state }: { state: WorkingTime }) {
  const own = state.own.filter((request) => request.status !== 'withdrawn');
  const plan = state.plan;

  return (
    // Abschnitt zu Abschnitt 32 px: der Abstand der Spalte, nicht dazu der
    // eigene Rand jedes Abschnitts (Design-Review Überholung 7).
    <div className="flex flex-col gap-8 [&>*]:mt-0">
      {state.can_decide && state.to_decide.length > 0 ? (
        <Listenabschnitt titel="Zu entscheiden" anzahl={state.to_decide.length}>
          {state.to_decide.map((request) => (
            <ListRow
              key={request.id}
              titel={request.name ?? 'Unbekannte Person'}
              meta={`${changeTitle(request.kind, request.on_date)} · ${minutesChange(
                request.previous_minutes,
                request.new_minutes,
              )}`}
              to={`/betrieb/arbeitszeit/entscheiden/${request.id}`}
            />
          ))}
        </Listenabschnitt>
      ) : null}

      {plan === null ? (
        // Ein Konto ohne Mitarbeiterdatensatz: kein Plan, keine Anträge - die
        // Seite sagt es, statt leer zu bleiben (Design-Review Überholung 8).
        <EmptyState
          inKarte
          title="Keine eigene Arbeitszeit"
          description="Zu Ihrem Konto gibt es keinen Mitarbeiterdatensatz."
        />
      ) : plan.has_plan ? (
        <>
          <Listenabschnitt titel="Mein Wochenplan">
            <WeekRows week={plan.current} />
          </Listenabschnitt>
          {plan.next && plan.next_from ? (
            <Listenabschnitt titel={`Ab ${dateLong(plan.next_from)}`}>
              <WeekRows week={plan.next} />
            </Listenabschnitt>
          ) : null}
        </>
      ) : (
        <EmptyState
          inKarte
          title="Noch kein Wochenplan"
          description="Den Wochenplan legt die Praxisleitung in der Planung an."
        />
      )}

      {plan?.has_plan || own.length > 0 ? (
        <Listenabschnitt
          titel="Meine Anträge"
          anzahl={own.length}
          leer={{ titel: 'Noch keine Änderung beantragt' }}
        >
          {own.map((request) => (
            <OwnRow key={request.id} request={request} />
          ))}
        </Listenabschnitt>
      ) : null}
    </div>
  );
}

function OwnRow({ request }: { request: OwnRequest }) {
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () => withdrawRequest(request.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKING_TIME_KEY }),
  });
  const display = statusDisplay(request.status);
  const meta = [
    minutesChange(request.previous_minutes, request.new_minutes),
    request.status === 'rejected' && request.decision_note
      ? `Grund der Ablehnung: ${request.decision_note}`
      : null,
    request.message ? `Ihr Grund: ${request.message}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListRow
      titel={changeTitle(request.kind, request.on_date)}
      meta={meta}
      status={<Badge ton={display.ton}>{display.text}</Badge>}
      darunter={
        request.status === 'requested' ? (
          // Unter der Zeile in voller Breite: in der Zeile bräche die
          // Rückfrage bei 375 px (Design-Review Überholung 7).
          <BelowRow>
            <Rueckfrage
              ausloeser="Zurückziehen"
              ausloeserVariante="quiet"
              ausloeserGroesse="kompakt"
              bezeichnung="Antrag zurückziehen"
              bestaetigen="Ja, zurückziehen"
              bestaetigenLaeuft="Wird zurückgezogen …"
              fehler={withdraw.isError ? withdraw.error.message : undefined}
              onBestaetigen={() => withdraw.mutateAsync()}
            >
              Die bisherige Arbeitszeit bleibt.
            </Rueckfrage>
          </BelowRow>
        ) : undefined
      }
    />
  );
}

function BelowRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-x-3 pb-2">{children}</div>;
}

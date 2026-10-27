import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { useSearchParams } from 'react-router-dom';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { EmptyState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { ArbeitszeitJePerson } from '@/features/calendar';
import { canManageWorkingHours, isOwner, isTherapyStaff, type CurrentUser } from '@/features/core';
import { RUECKWEG_PARAM } from '@/lib/rueckweg';
import {
  WORKING_TIME_KEY,
  fetchWorkingTime,
  withdrawRequest,
  type OwnRequest,
  type WorkingTime,
} from './api';
import { useMeldungAusVerlauf } from '@/lib/meldung';
import { WeekRows } from './WeekRows';
import { changeTitle, minutesChange, statusDisplay } from './format';
import { dateLong } from '@/lib/datum';
import { fetchAssignableTherapists } from '@/features/workforce/staff/api';

/**
 * Arbeitszeit (AZ-001, Überholung 8; seit ORG-003 die eine Seite dafür).
 *
 * Eine Seite für alle Rollen; was jemand sieht, entscheidet der Server
 * (ANN-590): der eigene Wochenplan, wie er heute gilt, und - schon
 * genehmigt - ab wann ein neuer gilt; die eigenen Anträge mit Grund und
 * Entscheidung; für owner die offenen Anträge der anderen. Keine Übersicht
 * über die Arbeitszeiten aller (§20).
 *
 * **Seit ORG-003 auch die Planung je Person** (bis dahin „Arbeitszeiten"
 * unter `/praxis/planung`, acht Reiter weiter): Wer zur Behandlungsseite
 * gehört, wählt oben die Person - vorgewählt die eigene. owner, Teamleitung
 * und Büro bearbeiten dort Wochenplan und Abweichungen jeder Person, auch die
 * eigenen; die übrigen lesen sie (ANN-604). Unter der eigenen Person stehen
 * künftige Fassung und eigene Anträge.
 *
 * Reihenfolge wie beim Urlaub: was jemand warten lässt, dann der Plan, dann
 * die eigenen Anträge. Beantragen und Entscheiden sind geführte Abläufe auf
 * eigenen Seiten (G8, G8b).
 */
export function WorkingTimePage({ user }: { user: CurrentUser }) {
  // Die Bestätigung einmal - nach Neuladen oder „Zurück“ nicht wieder.
  const { meldung: notice } = useMeldungAusVerlauf();
  const query = useQuery({ queryKey: WORKING_TIME_KEY, queryFn: fetchWorkingTime, retry: false });
  const action = isOwner(user.roles) ? 'Änderung eintragen' : 'Änderung beantragen';
  const [suche] = useSearchParams();

  return (
    <>
      {/* Wer aus einem Antrag kommt (URL-001: abweichende Arbeitszeiten vor
          dem Genehmigen), hat den Weg zurück. */}
      {suche.has(RUECKWEG_PARAM) ? <Rueckweg standard="/betrieb/arbeitszeit" /> : null}
      <PageHeader
        title="Arbeitszeit"
        actions={
          query.data?.plan?.has_plan ? (
            <ButtonLink to="/betrieb/arbeitszeit/beantragen">{action}</ButtonLink>
          ) : null
        }
      />
      {notice ? (
        <Rueckmeldung key={notice.schluessel} className="mb-6">
          {notice.text}
        </Rueckmeldung>
      ) : null}
      <Abfragezustand
        abfrage={query}
        laden="Arbeitszeit wird geladen …"
        fehler="Die Arbeitszeit konnte nicht geladen werden."
        inKarte
      >
        {(state) => <Inhalt user={user} state={state} />}
      </Abfragezustand>
    </>
  );
}

/**
 * Wer welche Teile sieht: Gehört die Person zur Behandlungsseite und steht
 * selbst in der Personenwahl, steht alles bei ihr (`JePerson`). Sonst - die
 * Trainingsbetreuung, das Büro ohne eigene Behandlung - zuerst das Eigene,
 * und wer pflegen darf, darunter die Arbeitszeiten im Team.
 */
function Inhalt({ user, state }: { user: CurrentUser; state: WorkingTime }) {
  const behandlungsseite = isTherapyStaff(user.roles);
  const personen = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    enabled: behandlungsseite,
    retry: false,
  });
  if (behandlungsseite && personen.isPending) {
    return <LoadingState inKarte label="Personen werden geladen …" />;
  }
  const selbstInDerWahl = (personen.data ?? []).some(
    (person) => person.staff_member_id === user.staffMemberId,
  );
  if (behandlungsseite && selbstInDerWahl && state.my_staff_member_id !== null) {
    return <JePerson user={user} state={state} />;
  }
  return (
    <div className="flex flex-col gap-8 [&>*]:mt-0">
      <Content state={state} />
      {canManageWorkingHours(user.roles) ? (
        <Section titel="Arbeitszeiten im Team">
          <ArbeitszeitJePerson user={user} />
        </Section>
      ) : null}
    </div>
  );
}

/**
 * Die Behandlungsseite: Personenwahl mit Wochenplan und Abweichungen; der
 * eigene Plan, die künftige Fassung und die eigenen Anträge stehen bei der
 * eigenen Person.
 */
function JePerson({ user, state }: { user: CurrentUser; state: WorkingTime }) {
  const own = state.own.filter((request) => request.status !== 'withdrawn');
  const plan = state.plan;
  return (
    <div className="flex flex-col gap-8 [&>*]:mt-0">
      <ToDecide state={state} />
      <div>
        <ArbeitszeitJePerson
          user={user}
          eigenerPlan={
            plan?.has_plan ? (
              <Listenabschnitt titel="Mein Wochenplan">
                <WeekRows week={plan.current} />
              </Listenabschnitt>
            ) : (
              <EmptyState
                inKarte
                title="Noch kein Wochenplan"
                description="Den Wochenplan legt die Praxisleitung an."
              />
            )
          }
          eigenesDanach={
            <div className="mt-8 flex flex-col gap-8 [&>*]:mt-0">
              {plan?.next && plan.next_from ? (
                <Listenabschnitt titel={`Ab ${dateLong(plan.next_from)}`}>
                  <WeekRows week={plan.next} />
                </Listenabschnitt>
              ) : null}
              <OwnRequests own={own} hasPlan={plan?.has_plan ?? false} />
            </div>
          }
        />
      </div>
    </div>
  );
}

function ToDecide({ state }: { state: WorkingTime }) {
  if (!state.can_decide || state.to_decide.length === 0) return null;
  return (
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
  );
}

function OwnRequests({ own, hasPlan }: { own: OwnRequest[]; hasPlan: boolean }) {
  if (!hasPlan && own.length === 0) return null;
  return (
    <Listenabschnitt
      titel="Meine Anträge"
      anzahl={own.length}
      leer={{ titel: 'Noch keine Änderung beantragt' }}
    >
      {own.map((request) => (
        <OwnRow key={request.id} request={request} />
      ))}
    </Listenabschnitt>
  );
}

function Content({ state }: { state: WorkingTime }) {
  const own = state.own.filter((request) => request.status !== 'withdrawn');
  const plan = state.plan;

  return (
    // Abschnitt zu Abschnitt 32 px: der Abstand der Spalte, nicht dazu der
    // eigene Rand jedes Abschnitts (Design-Review Überholung 7).
    <div className="flex flex-col gap-8 [&>*]:mt-0">
      <ToDecide state={state} />

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
          description="Den Wochenplan legt die Praxisleitung an."
        />
      )}

      <OwnRequests own={own} hasPlan={plan?.has_plan ?? false} />
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
      status={
        <Badge ton={display.ton} eigenesZeichen={display.zeichen}>
          {display.text}
        </Badge>
      }
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

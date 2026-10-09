import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Planblatt } from '@/features/exercise-plans/Planblatt';
import { dosierungAlltag, haeufigkeit } from '@/features/exercise-plans/dosierung';
import { formatDate } from '@/lib/datum';
import {
  ladePlaene,
  plaeneSchluessel,
  uebungstageSetzen,
  type EigenerPlan,
  type PlanPosition,
  type Plattformzugang,
} from './api';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { WOCHENTAGE, tageText } from './uebungstage';

/**
 * Reiter „Übungen" bzw. „Training" (UEB-009, DSN-001 4.1 und 5): „Was mache
 * ich heute?"
 *
 * Der Heimübungsplan gehört zur Behandlung und kostet nichts extra (§4.6);
 * im Training gehört der Plan zum Paket (§4.10). Gezeigt wird, was der Server
 * über den Zugang liefert: die zugewiesenen Pläne, sonst der zuletzt beendete
 * nur zum Lesen und Mitnehmen (ANN-304). Je Übung Name, Dosierung in Worten,
 * Anleitung und Hinweis - keine Punktzahl, keine Serie, kein Lob aus der
 * Software (DSN-001 4.1).
 */
export function Uebungen({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => ladePlaene(zugang.access_id),
  });
  const training = zugang.relationship_kind === 'training';
  const bereich = bereichParameter(suche);

  return (
    <>
      <h1 className="text-accent text-h3 font-bold">{training ? 'Training' : 'Übungen'}</h1>
      {suche.get('gespeichert') === '1' ? (
        // Eine Bestätigung, kein Lob (DSN-001 4.1).
        <Statusmeldung ton="erfolg" className="mt-4">
          Ihre Einheit ist gespeichert.
        </Statusmeldung>
      ) : null}
      {plaene.isPending ? (
        <LoadingState label="Ihre Übungen werden geladen …" />
      ) : plaene.data === undefined ? (
        <ErrorState
          title="Ihre Übungen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => plaene.refetch()}
        />
      ) : plaene.data.plans.length === 0 ? (
        <EmptyState
          title="Noch kein Plan"
          description={
            training
              ? 'Ihre Trainingsbetreuung stellt Ihnen hier Ihren Plan zusammen.'
              : 'Ihre Therapeut:in stellt Ihnen hier Übungen zusammen.'
          }
        />
      ) : (
        plaene.data.plans.map((plan) => (
          <PlanKarte
            key={plan.id}
            zugang={zugang}
            plan={plan}
            heute={plaene.data.today}
            bereich={bereich}
          />
        ))
      )}
    </>
  );
}

function PlanKarte({
  zugang,
  plan,
  heute,
  bereich,
}: {
  zugang: Plattformzugang;
  plan: EigenerPlan;
  heute: string;
  bereich: string;
}) {
  const ueberschrift = `plan-${plan.id}`;
  const zuletzt = plan.recent_sessions[0]?.performed_on;
  return (
    <section aria-labelledby={ueberschrift} className="mt-6">
      <h2 id={ueberschrift} className="text-h4 font-semibold">
        {plan.title}
      </h2>
      <p className="text-ink-muted mt-1">
        {laufzeitText(plan, heute)}
        {plan.sessions_per_week ? ` · ${haeufigkeit(plan.sessions_per_week)}` : ''}
      </p>
      {zuletzt ? (
        <p className="text-ink-muted mt-1">
          Zuletzt geübt: {zuletzt === heute ? 'heute' : formatDate(zuletzt)}
        </p>
      ) : null}
      {plan.can_choose_days ? (
        <Uebungstage zugang={zugang} plan={plan} />
      ) : plan.weekdays.length > 0 ? (
        <p className="text-ink-muted mt-1">Meine Übungstage: {tageText(plan.weekdays)}</p>
      ) : null}
      {plan.can_exercise && plan.items.length > 0 ? (
        // UEB-010: die Durchführungsansicht (IDEA-ORG-003).
        <div className="mt-4">
          <ButtonLink
            className="w-full"
            to={`${PLATTFORM_PFAD}/uebungen/einheit/${plan.id}${bereich ? `?${bereich}` : ''}`}
          >
            {plan.open_session ? 'Weiter üben' : 'Jetzt üben'}
          </ButtonLink>
        </div>
      ) : null}
      {plan.status === 'ended' ? (
        <Statusmeldung ton="neutral" className="mt-3">
          Dieser Plan ist beendet. Sie können ihn hier noch lesen und als PDF mitnehmen.
        </Statusmeldung>
      ) : null}
      <ol className="mt-4 flex flex-col gap-3">
        {plan.items.map((p) => (
          <li key={p.id}>
            <Uebungskarte position={p} />
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-col items-start gap-3">
        <ButtonLink
          variant="secondary"
          to={`${PLATTFORM_PFAD}/uebungen/blatt/${plan.id}${bereich ? `?${bereich}` : ''}`}
        >
          Plan als PDF
        </ButtonLink>
        {plan.status === 'assigned' ? (
          // KOM-001: eine Frage mit dem Plan als Bezug (IDEA-KOM-001).
          <Textlink
            alleinstehend
            to={`${PLATTFORM_PFAD}/nachrichten/neu?${new URLSearchParams([
              ...new URLSearchParams(bereich).entries(),
              ['plan', plan.id],
            ]).toString()}`}
          >
            Frage zu diesem Plan stellen →
          </Textlink>
        ) : null}
      </div>
    </section>
  );
}

function laufzeitText(plan: EigenerPlan, heute: string): string {
  if (plan.status === 'ended') return `Beendet am ${formatDate(plan.ended_on)}`;
  if (plan.runs_from && plan.runs_from > heute) return `Ab ${formatDate(plan.runs_from)}`;
  return `Bis ${formatDate(plan.runs_until)}`;
}

export function Uebungskarte({ position }: { position: PlanPosition }) {
  return (
    <article className="rounded-card border-line bg-surface border p-4">
      <h3 className="font-semibold">
        {position.position}. {position.variant_lay_name}
      </h3>
      <p className="mt-2">{dosierungAlltag(position)}</p>
      {position.instruction ? <p className="mt-2">{position.instruction}</p> : null}
      {position.equipment.length > 0 ? (
        <p className="text-ink-muted mt-2">Sie brauchen: {position.equipment.join(', ')}</p>
      ) : null}
      {position.note ? (
        <p className="mt-2">
          <span className="font-semibold">Hinweis: </span>
          {position.note}
        </p>
      ) : null}
    </article>
  );
}

/**
 * Der Plan als Blatt auf der Plattform (UEB-009, ANN-303): derselbe Baustein
 * wie in der Praxis, ohne Namen - die Person weiß, wer sie ist. Auch in der
 * Lesefrist (DSN-001 D2): „Plan als PDF" ist das, was nach dem Ende bleibt.
 */
export function PlanblattPlattform({
  zugang,
  praxis,
}: {
  zugang: Plattformzugang;
  praxis: string;
}) {
  // Die Kennung aus dem Pfad `/p/uebungen/blatt/<id>` wie bei den Terminen.
  const { pathname } = useLocation();
  const planId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const zurueck = `${PLATTFORM_PFAD}/uebungen${bereich ? `?${bereich}` : ''}`;
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => ladePlaene(zugang.access_id),
  });
  const plan = plaene.data?.plans.find((p) => p.id === planId);

  return (
    <>
      <div className="nicht-drucken mb-4 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink variant="quiet" to={zurueck}>
          Zurück
        </ButtonLink>
        {plan ? (
          <Button type="button" onClick={() => window.print()}>
            Drucken oder als PDF sichern
          </Button>
        ) : null}
      </div>
      {plaene.isPending ? (
        <LoadingState label="Ihr Plan wird geladen …" />
      ) : plaene.data === undefined ? (
        <ErrorState
          title="Ihr Plan konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => plaene.refetch()}
        />
      ) : !plan ? (
        <EmptyState title="Diesen Plan gibt es hier nicht." />
      ) : (
        <>
          <Planblatt plan={plan} praxis={praxis} />
          <div className="nicht-drucken mt-8">
            <Kleingedrucktes>
              Im Druckfenster können Sie „Als PDF sichern“ wählen. Die Datei bleibt auf Ihrem Gerät.
            </Kleingedrucktes>
          </div>
        </>
      )}
    </>
  );
}

/**
 * „Meine Übungstage" (UEB-011, ANN-307): Die Person legt selbst fest, an
 * welchen Tagen sie übt; die Tage erscheinen unter „Termine" neben den
 * Terminen. Jeder Tipp wird sofort gespeichert und ohne Verbindung
 * zurückgenommen (ANN-305). Die Praxis sieht die Tage nicht.
 */
function Uebungstage({ zugang, plan }: { zugang: Plattformzugang; plan: EigenerPlan }) {
  const queryClient = useQueryClient();
  const [tage, setTage] = useState<number[]>(plan.weekdays);
  const speichern = useMutation({
    // Der Reihe nach, damit der letzte Tipp auch der letzte Stand am Server ist.
    scope: { id: `tage-${plan.id}` },
    mutationFn: (neu: number[]) => uebungstageSetzen(zugang.access_id, plan.id, neu),
    onMutate: (neu) => {
      const vorher = tage;
      setTage(neu);
      return { vorher };
    },
    onError: (_e, _neu, kontext) => {
      if (kontext) setTage(kontext.vorher);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: plaeneSchluessel(zugang.access_id) }),
  });
  const gruppe = `tage-${plan.id}`;
  return (
    <div className="mt-4">
      <p id={gruppe} className="font-medium">
        Meine Übungstage
        {plan.sessions_per_week ? (
          <span className="text-ink-muted font-normal">
            {' '}
            – empfohlen: {plan.sessions_per_week === 1
              ? 'einmal'
              : `${plan.sessions_per_week}-mal`}{' '}
            pro Woche
          </span>
        ) : null}
      </p>
      <div role="group" aria-labelledby={gruppe} className="mt-2 flex flex-wrap gap-2">
        {WOCHENTAGE.map((w) => {
          const an = tage.includes(w.nummer);
          return (
            <button
              key={w.nummer}
              type="button"
              aria-pressed={an}
              aria-label={w.lang}
              onClick={() =>
                speichern.mutate(
                  an
                    ? tage.filter((t) => t !== w.nummer)
                    : [...tage, w.nummer].sort((a, b) => a - b),
                )
              }
              className="rounded-button border-line bg-surface aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-surface min-h-12 min-w-12 border-2 px-2 text-base font-semibold"
            >
              {w.kurz}
            </button>
          );
        })}
      </div>
      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}
    </div>
  );
}

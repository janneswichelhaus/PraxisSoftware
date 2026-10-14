import { useContext, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Chip } from '@/components/ui/Chip';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Medienbild } from '@/components/ui/Medienbild';
import { Uebungsbild } from '@/features/exercises/bild/Uebungsbild';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Planblatt } from '@/features/exercise-plans/Planblatt';
import { haeufigkeit } from '@/features/exercise-plans/dosierung';
import { formatDate } from '@/lib/datum';
import { plaeneSchluessel, type EigenerPlan, type PlanPosition, type Plattformzugang } from './api';
import { useNurLesen, usePlattformApi } from './einsicht';
import {
  DurchfuehrungKontext,
  abgelegteZugaenge,
  abweisungGelesen,
  useWarteschlange,
} from './ablage';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { WOCHENTAGE, tageText } from './uebungstage';
import { Uebungsinhalt, type DosisZumAblesen } from './Uebungsinhalt';

/**
 * Reiter „Übungen" bzw. „Training" (UEB-009, DSN-001 4.1 und 5): „Was mache
 * ich heute?"
 *
 * Der Heimübungsplan gehört zur Behandlung und kostet nichts extra (§4.6);
 * im Training gehört der Plan zum Paket (§4.10). Gezeigt wird, was der Server
 * über den Zugang liefert: die zugewiesenen Pläne, sonst der zuletzt beendete
 * nur zum Lesen und Mitnehmen (ANN-304). Je Übung Bildplatz, Name und Dosierung,
 * auf Tipp Bild, Dosierung als Kacheln, Anleitung und Hinweis (ANN-466) -
 * keine Punktzahl, keine Serie, kein Lob aus der
 * Software (DSN-001 4.1).
 */
export function Uebungen({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const [suche] = useSearchParams();
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => api.ladePlaene(zugang.access_id),
  });
  const training = zugang.relationship_kind === 'training';
  const bereich = bereichParameter(suche);

  return (
    <>
      <PageHeader title={training ? 'Training' : 'Übungen'} />
      {suche.get('gespeichert') === '1' ? (
        // Eine Bestätigung, kein Lob (DSN-001 4.1).
        <Rueckmeldung className="mb-4">Ihre Einheit ist gespeichert.</Rueckmeldung>
      ) : suche.get('gespeichert') === 'geraet' ? (
        // TRK-008: ehrlich, wo sie liegt (ADR-024 Punkt 8).
        <Statusmeldung ton="warnung" className="mb-4">
          Ihre Einheit liegt auf diesem Gerät und ist noch nicht bei der Praxis. Sie wird
          übertragen, sobald Verbindung besteht.
        </Statusmeldung>
      ) : null}
      <Wartehinweis zugangId={zugang.access_id} />
      {plaene.isPending ? (
        <LoadingState label="Ihre Übungen werden geladen …" inKarte />
      ) : plaene.data === undefined ? (
        <OhneVerbindung
          zugangId={zugang.access_id}
          bereich={bereich}
          onErneut={() => void plaene.refetch()}
        />
      ) : plaene.data.plans.length === 0 ? (
        <EmptyState
          inKarte
          title="Noch kein Plan"
          description={
            training
              ? 'Ihre Trainingsbetreuung stellt Ihnen hier Ihren Plan zusammen.'
              : 'Ihre Therapeut:in stellt Ihnen hier Übungen zusammen.'
          }
        />
      ) : (
        plaene.data.plans.map((plan) => (
          <PlanAbschnitt
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

/**
 * TRK-008 (ADR-024 Punkt 8): Was noch auf dem Gerät wartet und was der Server
 * abgewiesen hat - bis nichts mehr wartet. Ohne Ablage (Tests des Gerüsts)
 * steht hier nichts.
 */
function Wartehinweis({ zugangId }: { zugangId: string }) {
  const traeger = useContext(DurchfuehrungKontext);
  if (!traeger) return null;
  return <Wartestand besitzer={traeger.besitzer} zugangId={zugangId} />;
}

function Wartestand({ besitzer, zugangId }: { besitzer: string; zugangId: string }) {
  const stand = useWarteschlange(besitzer);
  const wartend = stand.einheiten.filter((e) => e.zugangId === zugangId).length;
  return (
    <>
      {wartend > 0 ? (
        <p className="text-ink-muted mb-4" data-testid="wartehinweis">
          {wartend === 1
            ? 'Eine Einheit liegt noch auf diesem Gerät und ist noch nicht übertragen.'
            : `${wartend} Einheiten liegen noch auf diesem Gerät und sind noch nicht übertragen.`}
        </p>
      ) : null}
      {stand.abgewiesen.map((a) => (
        <div key={a.einheitId} className="mb-4 flex flex-wrap items-center gap-x-3">
          <Statusmeldung ton="fehler">{`Eine Einheit wurde nicht übertragen: ${a.satz}`}</Statusmeldung>
          <Button
            type="button"
            variant="quiet"
            groesse="kompakt"
            onClick={() => abweisungGelesen(a.einheitId)}
          >
            Ausblenden
          </Button>
        </div>
      ))}
    </>
  );
}

/**
 * TRK-008: Ohne Verbindung die Pläne vom letzten Laden zum Üben (ADR-024
 * Punkt 5) - nur die Durchführung, sonst nichts.
 */
function OhneVerbindung({
  zugangId,
  bereich,
  onErneut,
}: {
  zugangId: string;
  bereich: string;
  onErneut: () => void;
}) {
  const traeger = useContext(DurchfuehrungKontext);
  const abgelegt = useQuery({
    queryKey: ['abgelegte-plaene', traeger?.besitzer, zugangId],
    queryFn: async () =>
      traeger
        ? ((await abgelegteZugaenge(traeger.besitzer)).find((z) => z.zugangId === zugangId)
            ?.plaene ?? [])
        : [],
    gcTime: 0,
  });
  const fehler = (
    <ErrorState
      title="Ihre Übungen konnten nicht geladen werden."
      description={VERBINDUNG_PRUEFEN}
      onErneut={onErneut}
    />
  );
  if (!abgelegt.data || abgelegt.data.length === 0) return fehler;
  return (
    <>
      <Statusmeldung ton="neutral">
        Ohne Verbindung. Üben können Sie trotzdem – mit Ihrem Plan vom letzten Laden. Die Haken
        bleiben auf dem Gerät, bis Verbindung besteht.
      </Statusmeldung>
      {abgelegt.data.map((plan) => (
        <Section key={plan.id} titel={plan.title}>
          <ButtonLink
            className="w-full"
            to={`${PLATTFORM_PFAD}/uebungen/einheit/${plan.id}${bereich ? `?${bereich}` : ''}`}
          >
            Jetzt üben
          </ButtonLink>
        </Section>
      ))}
      <Button variant="secondary" className="mt-8 w-full" onClick={onErneut}>
        Erneut laden
      </Button>
    </>
  );
}

/**
 * Ein Plan: Laufzeit, Übungstage, „Jetzt üben“ als der eine Hauptknopf, dann
 * die Übungen als Zeilen mit festem Bildplatz (`Medienbild vorschau`, ANN-466).
 * Eine Zeile öffnet die Übung mit Bild, Dosierung und Anleitung.
 */
function PlanAbschnitt({
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
  const [offen, setOffen] = useState<PlanPosition | null>(null);
  // E-001: In der Einsicht werden keine Tage gewählt, nicht geübt, nicht gefragt.
  const nurLesen = useNurLesen();
  const zuletzt = plan.recent_sessions[0]?.performed_on;
  return (
    <Section titel={plan.title}>
      <p className="text-ink-muted">
        {laufzeitText(plan, heute)}
        {plan.sessions_per_week ? ` · ${haeufigkeit(plan.sessions_per_week)}` : ''}
      </p>
      {zuletzt ? (
        <p className="text-ink-muted">
          Zuletzt geübt: {zuletzt === heute ? 'heute' : formatDate(zuletzt)}
        </p>
      ) : null}
      {plan.can_choose_days && !nurLesen ? (
        <Uebungstage zugang={zugang} plan={plan} />
      ) : plan.weekdays.length > 0 ? (
        <p className="text-ink-muted">Meine Übungstage: {tageText(plan.weekdays)}</p>
      ) : null}
      {plan.can_exercise && !nurLesen && plan.items.length > 0 ? (
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
      <ListRows className="mt-4">
        {plan.items.map((p) => (
          <ListRow
            key={p.id}
            onClick={() => setOffen(p)}
            // Das Bild steht neben dem Namen; für Vorlesesoftware sagt der
            // Name, welche Übung es ist.
            bild={
              <span aria-hidden="true">
                <Medienbild vorschau alt="">
                  {p.illustration ? (
                    <Uebungsbild
                      bild={p.illustration}
                      name={p.variant_lay_name}
                      darstellung="vorschau"
                      dekorativ
                      className="size-full"
                    />
                  ) : null}
                </Medienbild>
              </span>
            }
            titel={`${p.position}. ${p.variant_lay_name}`}
            meta={dosierungKurz(p)}
          />
        ))}
      </ListRows>
      {offen ? <Uebungsfenster position={offen} onSchliessen={() => setOffen(null)} /> : null}
      <div className="mt-4 flex flex-col items-start gap-2">
        <ButtonLink
          variant="secondary"
          to={`${PLATTFORM_PFAD}/uebungen/blatt/${plan.id}${bereich ? `?${bereich}` : ''}`}
        >
          Plan als PDF
        </ButtonLink>
        {plan.status === 'assigned' && !nurLesen ? (
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
    </Section>
  );
}

function laufzeitText(plan: EigenerPlan, heute: string): string {
  if (plan.status === 'ended') return `Beendet am ${formatDate(plan.ended_on)}`;
  if (plan.runs_from && plan.runs_from > heute) return `Ab ${formatDate(plan.runs_from)}`;
  return `Bis ${formatDate(plan.runs_until)}`;
}

/**
 * „3 Durchgänge · je 10 bis 12 Wiederholungen" - die Zeile unter dem Namen;
 * mit „je Seite“, sobald die Fachperson es einträgt (UEB-012, `DosisZumAblesen`).
 */
function dosierungKurz(p: PlanPosition & Pick<DosisZumAblesen, 'per_side'>): string {
  const durchgaenge = `${p.sets} ${p.sets === 1 ? 'Durchgang' : 'Durchgänge'}`;
  const seite = p.per_side ? ' · je Seite' : '';
  if (p.reps_min !== null && p.reps_max !== null) {
    const wdh = p.reps_min === p.reps_max ? `${p.reps_min}` : `${p.reps_min} bis ${p.reps_max}`;
    return `${durchgaenge} · je ${wdh} Wiederholungen${seite}`;
  }
  const s = p.duration_seconds ?? 0;
  return `${durchgaenge} · je ${s} ${s === 1 ? 'Sekunde' : 'Sekunden'}${seite}`;
}

/**
 * Eine Übung zum Nachlesen (DESIGN.md Lücke 9.10): Bild oben, die Dosierung
 * als Kacheln, dann Anleitung, Hilfsmittel und Hinweis. Das Bild hat seinen
 * festen Platz, auch solange es noch keins gibt (ANN-466). Die Schrift der
 * Plattform gilt auch im Fenster, das außerhalb des Gerüsts gezeichnet wird.
 */
function Uebungsfenster({
  position,
  onSchliessen,
}: {
  position: PlanPosition;
  onSchliessen: () => void;
}) {
  return (
    <Dialogfenster titel={position.variant_lay_name} onSchliessen={onSchliessen}>
      {/* Der Fokus steht am Anfang der Übung, nicht auf „Schließen“ am Ende:
          Sonst öffnete das Fenster am Telefon unten, und Name und Bild lägen
          außerhalb des Blicks. */}
      <div className="plattform-schrift">
        <span data-autofocus tabIndex={-1} className="block outline-none" />
        <Uebungsinhalt position={position} />
        <div className="mt-6">
          <Button type="button" variant="secondary" className="w-full" onClick={onSchliessen}>
            Schließen
          </Button>
        </div>
      </div>
    </Dialogfenster>
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
  const api = usePlattformApi();
  // Die Kennung aus dem Pfad `/p/uebungen/blatt/<id>` wie bei den Terminen.
  const { pathname } = useLocation();
  const planId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const zurueck = `${PLATTFORM_PFAD}/uebungen${bereich ? `?${bereich}` : ''}`;
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => api.ladePlaene(zugang.access_id),
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
  const api = usePlattformApi();
  const queryClient = useQueryClient();
  const [tage, setTage] = useState<number[]>(plan.weekdays);
  const speichern = useMutation({
    // Der Reihe nach, damit der letzte Tipp auch der letzte Stand am Server ist.
    scope: { id: `tage-${plan.id}` },
    mutationFn: (neu: number[]) => api.uebungstageSetzen(zugang.access_id, plan.id, neu),
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
            // Ein Schalter je Tag (`Chip` mit `gewaehlt`, DESIGN.md „Umschalter“):
            // gewählt mit Haken auf der Akzentfläche, der volle Name für
            // Vorlesesoftware.
            <Chip
              key={w.nummer}
              gewaehlt={an}
              onClick={() =>
                speichern.mutate(
                  an
                    ? tage.filter((t) => t !== w.nummer)
                    : [...tage, w.nummer].sort((a, b) => a - b),
                )
              }
            >
              <span aria-hidden="true">{w.kurz}</span>
              <span className="sr-only">{w.lang}</span>
            </Chip>
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

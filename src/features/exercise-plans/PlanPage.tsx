import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BIBLIOTHEK_SCHLUESSEL, fetchBibliothek } from '@/features/exercises/api';
import {
  PLAENE_SCHLUESSEL,
  assignPlan,
  createVersion,
  deletePosition,
  endPlan,
  extendPlan,
  discardPlan,
  fetchPlan,
  movePosition,
  planPfad,
  planSchluessel,
  savePlan,
  type Einheit,
  type Plan,
  type Position,
} from './api';
import { dosierungAlltag, dosierungFachlich, unterschiede } from './dosierung';
import { ACHSE_LABEL } from '@/features/exercises/types';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { LAUFZEIT_HOECHSTENS_TAGE, LAUFZEIT_VORSCHLAG_TAGE, tagPlus } from './laufzeit';
import { formatDate } from '@/lib/datum';
import { verhaeltnisPfad } from './api';
import { PositionFormular } from './PositionFormular';

/**
 * Ein Übungsplan (UEB-EPIC-002) - an der Akte unter
 * `/patienten/:patientId/plaene/:planId`, an der Trainingskund:in unter
 * `/training/:relationshipId/plaene/:planId`.
 *
 * Das Laden ist ein Blick in die Akte bzw. das Trainingsverhältnis; der
 * Server protokolliert es einmal am Tag (ADR-010 Fassung 3). Ob die Person
 * schreiben darf, sagt `can_write` (ANN-298) - verbindlich prüft der Server.
 */
export function PlanPage() {
  const { planId = '' } = useParams();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: planSchluessel(planId),
    queryFn: () => fetchPlan(planId),
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (isError) {
    return (
      <>
        <Rueckweg standard="/" />
        <ErrorState
          title="Der Plan konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <Rueckweg standard="/" />
        <EmptyState title="Plan nicht gefunden" />
      </>
    );
  }
  return <Ansicht plan={data} />;
}

const STATUS_TEXT: Readonly<Record<Plan['status'], string>> = {
  draft: 'Entwurf',
  assigned: 'zugewiesen',
  ended: 'beendet',
  superseded: 'abgelöst',
};

function Ansicht({ plan }: { plan: Plan }) {
  const entwurf = plan.status === 'draft';
  const bearbeitbar = entwurf && plan.can_write && plan.relationship_open;
  const name = `${plan.given_name} ${plan.family_name}`;

  return (
    <>
      <Rueckweg standard={verhaeltnisPfad(plan)} beschriftung={name} />
      <PageHeader
        kicker={plan.service_area === 'therapy' ? 'Übungsplan' : 'Trainingsplan'}
        title={plan.title}
        description={name}
        actions={<Badge ton={entwurf ? 'neutral' : 'akzent'}>{STATUS_TEXT[plan.status]}</Badge>}
      />
      {bearbeitbar ? (
        <Entwurf plan={plan} />
      ) : (
        <>
          {entwurf ? null : <Laufzeit plan={plan} />}
          <Positionsliste plan={plan} />
          {entwurf ? null : <Durchgefuehrt plan={plan} />}
        </>
      )}
      <Fassungen plan={plan} />
    </>
  );
}

// -----------------------------------------------------------------------------
// Entwurf
// -----------------------------------------------------------------------------

function Entwurf({ plan }: { plan: Plan }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState<string | null>(plan.items.length === 0 ? 'neu' : null);
  const bibliothek = useQuery({
    queryKey: BIBLIOTHEK_SCHLUESSEL,
    queryFn: fetchBibliothek,
    retry: false,
  });

  const verwerfen = useMutation({
    mutationFn: () => discardPlan(plan.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
      void navigate(verhaeltnisPfad(plan), { replace: true });
    },
  });

  return (
    <>
      <Kopfdaten plan={plan} />

      <Section titel="Übungen" hinweis="Ausgewählt aus der Übungsbibliothek der Praxis.">
        {bibliothek.isError ? (
          <Statusmeldung ton="fehler">
            Die Übungsbibliothek konnte nicht geladen werden.
          </Statusmeldung>
        ) : null}
        <ol className="flex flex-col gap-3">
          {plan.items.map((position, index) => (
            <li key={position.id}>
              {offen === position.id && bibliothek.data ? (
                <div className="rounded-card border-line bg-surface border p-4">
                  <PositionFormular
                    planId={plan.id}
                    position={position}
                    vorige={vorigePosition(plan, position)}
                    bibliothek={bibliothek.data}
                    idPraefix={`position-${position.id}`}
                    onFertig={() => setOffen(null)}
                    onAbbrechen={() => setOffen(null)}
                  />
                </div>
              ) : (
                <Positionskarte
                  position={position}
                  zusatz={<Schritt position={position} vorige={vorigePosition(plan, position)} />}
                  aktionen={
                    <PositionAktionen
                      position={position}
                      erste={index === 0}
                      letzte={index === plan.items.length - 1}
                      onAendern={() => setOffen(position.id)}
                      gesperrt={offen !== null}
                    />
                  }
                />
              )}
            </li>
          ))}
        </ol>
        {offen === 'neu' && bibliothek.data ? (
          <div className="rounded-card border-line bg-surface mt-3 border p-4">
            <PositionFormular
              planId={plan.id}
              bibliothek={bibliothek.data}
              idPraefix="position-neu"
              onFertig={() => setOffen(null)}
              onAbbrechen={() => setOffen(null)}
            />
          </div>
        ) : null}
        {offen === null ? (
          <Button variant="secondary" className="mt-3" onClick={() => setOffen('neu')}>
            Übung hinzufügen
          </Button>
        ) : null}
      </Section>

      <Zuweisung plan={plan} />

      <Section titel="Entwurf">
        <Rueckfrage
          ausloeser="Entwurf verwerfen"
          ausloeserVariante="quiet"
          bestaetigen="Verwerfen"
          bestaetigenLaeuft="Wird verworfen …"
          fehler={verwerfen.error?.message}
          onBestaetigen={() => verwerfen.mutateAsync()}
        >
          <p>Den Entwurf mit allen Übungen verwerfen? Das lässt sich nicht zurücknehmen.</p>
        </Rueckfrage>
      </Section>
    </>
  );
}

function Kopfdaten({ plan }: { plan: Plan }) {
  const queryClient = useQueryClient();
  const [titel, setTitel] = useState(plan.title);
  const [einheiten, setEinheiten] = useState(
    plan.sessions_per_week === null ? '' : String(plan.sessions_per_week),
  );
  const [fehler, setFehler] = useState<{ titel?: string; einheiten?: string }>({});
  const geaendert =
    titel !== plan.title ||
    einheiten !== (plan.sessions_per_week === null ? '' : String(plan.sessions_per_week));

  const speichern = useMutation({
    mutationFn: (wert: number | null) => savePlan(plan.id, titel, wert),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL }),
  });

  return (
    <Section titel="Plan">
      <form
        noValidate
        className="flex max-w-xl flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const gefunden: typeof fehler = {};
          if (!titel.trim()) gefunden.titel = 'Bitte einen Titel angeben.';
          const zahl = einheiten.trim() ? Number(einheiten.trim()) : null;
          if (zahl !== null && (!Number.isInteger(zahl) || zahl < 1 || zahl > 14)) {
            gefunden.einheiten = 'Bitte 1 bis 14.';
          }
          setFehler(gefunden);
          if (Object.keys(gefunden).length === 0 && !speichern.isPending) speichern.mutate(zahl);
        }}
      >
        <Field
          label="Titel *"
          maxLength={80}
          value={titel}
          error={fehler.titel}
          onChange={(event) => setTitel(event.target.value)}
        />
        <Field
          label="Einheiten je Woche"
          inputMode="numeric"
          className="max-w-32"
          value={einheiten}
          error={fehler.einheiten}
          onChange={(event) => setEinheiten(event.target.value)}
        />
        {speichern.isError ? (
          <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
        ) : null}
        {speichern.isSuccess && !geaendert ? (
          <Statusmeldung ton="erfolg">Gespeichert.</Statusmeldung>
        ) : null}
        <div>
          <Button type="submit" variant="secondary" disabled={!geaendert || speichern.isPending}>
            {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function PositionAktionen({
  position,
  erste,
  letzte,
  onAendern,
  gesperrt,
}: {
  position: Position;
  erste: boolean;
  letzte: boolean;
  onAendern: () => void;
  gesperrt: boolean;
}) {
  const queryClient = useQueryClient();
  const fertig = () => queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
  const verschieben = useMutation({
    mutationFn: (richtung: 'up' | 'down') => movePosition(position.id, richtung),
    onSuccess: fertig,
  });
  const entfernen = useMutation({
    mutationFn: () => deletePosition(position.id),
    onSuccess: fertig,
  });
  const laeuft = verschieben.isPending || entfernen.isPending;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant="secondary" groesse="kompakt" disabled={gesperrt} onClick={onAendern}>
        Ändern
      </Button>
      <Button
        variant="quiet"
        groesse="kompakt"
        disabled={erste || laeuft || gesperrt}
        aria-label={`${position.variant_name} nach oben`}
        onClick={() => verschieben.mutate('up')}
      >
        ↑ Nach oben
      </Button>
      <Button
        variant="quiet"
        groesse="kompakt"
        disabled={letzte || laeuft || gesperrt}
        aria-label={`${position.variant_name} nach unten`}
        onClick={() => verschieben.mutate('down')}
      >
        ↓ Nach unten
      </Button>
      <Button
        variant="quiet"
        groesse="kompakt"
        disabled={laeuft || gesperrt}
        aria-label={`${position.variant_name} entfernen`}
        onClick={() => entfernen.mutate()}
      >
        Entfernen
      </Button>
      {verschieben.isError || entfernen.isError ? (
        <Statusmeldung ton="fehler" className="basis-full">
          {(verschieben.error ?? entfernen.error)?.message}
        </Statusmeldung>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Anzeige
// -----------------------------------------------------------------------------

export function Positionskarte({
  position,
  aktionen,
  zusatz,
}: {
  position: Position;
  aktionen?: ReactNode;
  zusatz?: ReactNode;
}) {
  return (
    <article className="rounded-card border-line bg-surface border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-semibold">
          {position.position}. {position.variant_name}
        </h3>
        {position.variant_archived ? <Badge ton="warnung">archiviert</Badge> : null}
      </div>
      <p className="text-ink-muted text-sm">{position.exercise_name}</p>
      <p className="mt-2 text-sm">{dosierungFachlich(position)}</p>
      {position.note ? (
        <p className="text-ink-muted mt-1 text-sm">Hinweis: {position.note}</p>
      ) : null}
      {zusatz}
      {aktionen}
    </article>
  );
}

type Sprache = 'fachlich' | 'alltag';

function Positionsliste({ plan }: { plan: Plan }) {
  // Der zugewiesene Plan in beiden Sprachebenen (IDEA-QSN-002): fachlich für
  // die Praxis, in Alltagssprache so, wie die Person ihn liest.
  const [sprache, setSprache] = useState<Sprache>('fachlich');
  return (
    <Section
      titel="Übungen"
      aktion={
        plan.items.length > 0 ? (
          <div role="group" aria-label="Ansicht" className="flex gap-1">
            {(['fachlich', 'alltag'] as const).map((wert) => (
              <Button
                key={wert}
                variant={sprache === wert ? 'secondary' : 'quiet'}
                groesse="kompakt"
                aria-pressed={sprache === wert}
                onClick={() => setSprache(wert)}
              >
                {wert === 'fachlich' ? 'Fachlich' : 'In Alltagssprache'}
              </Button>
            ))}
          </div>
        ) : null
      }
    >
      {plan.items.length === 0 ? (
        <p className="text-ink-muted text-sm">Noch keine Übung.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {plan.items.map((position) => (
            <li key={position.id}>
              {sprache === 'fachlich' ? (
                <Positionskarte
                  position={position}
                  zusatz={<Schritt position={position} vorige={vorigePosition(plan, position)} />}
                />
              ) : (
                <AlltagsKarte position={position} />
              )}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function AlltagsKarte({ position }: { position: Position }) {
  return (
    <article className="rounded-card border-line bg-surface border p-4">
      <h3 className="font-semibold">
        {position.position}. {position.variant_lay_name}
      </h3>
      <p className="mt-2 text-sm">{dosierungAlltag(position)}</p>
      {position.instruction ? <p className="mt-2 text-sm">{position.instruction}</p> : null}
      {position.equipment.length > 0 ? (
        <p className="text-ink-muted mt-2 text-sm">Sie brauchen: {position.equipment.join(', ')}</p>
      ) : null}
      {position.note ? <p className="mt-2 text-sm">{position.note}</p> : null}
    </article>
  );
}

// -----------------------------------------------------------------------------
// Zuweisen und Laufzeit (UEB-005, ANN-300, ANN-302)
// -----------------------------------------------------------------------------

function Zuweisung({ plan }: { plan: Plan }) {
  const queryClient = useQueryClient();
  const [bis, setBis] = useState(() => tagPlus(plan.today, LAUFZEIT_VORSCHLAG_TAGE));
  const [fehler, setFehler] = useState<string | undefined>();
  const spaetestens = tagPlus(plan.today, LAUFZEIT_HOECHSTENS_TAGE);

  const zuweisen = useMutation({
    mutationFn: () => assignPlan(plan.id, bis),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL }),
  });

  return (
    <Section
      titel="Zuweisen"
      hinweis="Mit dem Zuweisen wird der Plan festgehalten, wie er ist. Ändern lässt er sich danach nur als neue Fassung."
    >
      <div className="flex max-w-xl flex-col gap-4">
        <Field
          label="Läuft bis *"
          type="date"
          min={plan.today}
          max={spaetestens}
          className="max-w-48"
          hint={`Höchstens 26 Wochen, also bis ${formatDate(spaetestens)}. Vor dem Ende fragt die Praxis nach: verlängern, ändern oder beenden.`}
          value={bis}
          error={fehler}
          onChange={(event) => setBis(event.target.value)}
        />
        <div>
          <Rueckfrage
            ausloeser="Zuweisen"
            ausloeserVariante="primary"
            bestaetigen="Zuweisen"
            bestaetigenLaeuft="Wird zugewiesen …"
            fehler={zuweisen.error?.message}
            onBestaetigen={() => {
              if (!bis || bis < plan.today || bis > spaetestens) {
                setFehler('Bitte ein Ende zwischen heute und 26 Wochen ab heute wählen.');
                return;
              }
              if (plan.items.length === 0) {
                setFehler('Bitte zuerst mindestens eine Übung hinzufügen.');
                return;
              }
              setFehler(undefined);
              return zuweisen.mutateAsync();
            }}
          >
            <p>
              Den Plan mit{' '}
              {plan.items.length === 1 ? 'einer Übung' : `${plan.items.length} Übungen`} bis{' '}
              {formatDate(bis)} zuweisen? Danach lässt er sich nicht mehr ändern.
            </p>
          </Rueckfrage>
        </div>
      </div>
    </Section>
  );
}

function Laufzeit({ plan }: { plan: Plan }) {
  const abgelaufen =
    plan.status === 'assigned' && plan.runs_until !== null && plan.runs_until < plan.today;
  const entscheiden = plan.can_write && plan.status === 'assigned';
  return (
    <Section
      titel="Laufzeit"
      aktion={
        // UEB-008 (ANN-303): der Plan als Blatt - auch ohne Plattform.
        <ButtonLink
          variant="secondary"
          groesse="kompakt"
          to={`${planPfad(plan.service_area, plan.relationship_id, plan.id)}/blatt`}
        >
          Als PDF oder drucken
        </ButtonLink>
      }
    >
      {plan.review_due && entscheiden ? (
        <Statusmeldung ton="warnung" className="mb-3">
          {abgelaufen
            ? `Die Laufzeit ist am ${formatDate(plan.runs_until)} abgelaufen.`
            : `Die Laufzeit endet am ${formatDate(plan.runs_until)}.`}{' '}
          Bitte entscheiden: verlängern, als neue Fassung ändern oder beenden.
        </Statusmeldung>
      ) : null}
      <dl className="rounded-card border-line bg-surface grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border p-4 text-sm">
        <dt className="text-ink-muted">Zugewiesen</dt>
        <dd>
          {formatDate(plan.runs_from)}
          {plan.assigned_by_name ? ` von ${plan.assigned_by_name}` : ''}
        </dd>
        <dt className="text-ink-muted">Läuft bis</dt>
        <dd>
          {formatDate(plan.runs_until)}
          {plan.extended_at && plan.original_runs_until
            ? ` (verlängert, zuerst bis ${formatDate(plan.original_runs_until)})`
            : ''}
          {abgelaufen ? ' – abgelaufen' : ''}
        </dd>
        {plan.sessions_per_week ? (
          <>
            <dt className="text-ink-muted">Einheiten je Woche</dt>
            <dd>{plan.sessions_per_week}</dd>
          </>
        ) : null}
        {plan.ended_at ? (
          <>
            <dt className="text-ink-muted">
              {plan.status === 'superseded' ? 'Abgelöst' : 'Beendet'}
            </dt>
            <dd>
              {formatDate(plan.ended_on)}
              {plan.ended_by_name ? ` von ${plan.ended_by_name}` : ''}
            </dd>
          </>
        ) : null}
      </dl>
      {entscheiden ? <Entscheiden plan={plan} /> : null}
    </Section>
  );
}

/** Verlängern oder beenden (UEB-007, ANN-302) - ändern geht über „Neue Fassung". */
function Entscheiden({ plan }: { plan: Plan }) {
  const queryClient = useQueryClient();
  const spaetestens = tagPlus(plan.today, LAUFZEIT_HOECHSTENS_TAGE);
  const ab = plan.runs_until && plan.runs_until > plan.today ? plan.runs_until : plan.today;
  const vorschlag = tagPlus(ab, LAUFZEIT_VORSCHLAG_TAGE);
  const [bis, setBis] = useState(vorschlag > spaetestens ? spaetestens : vorschlag);
  const [fehler, setFehler] = useState<string | undefined>();
  const fertig = () => queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
  const verlaengern = useMutation({
    mutationFn: () => extendPlan(plan.id, bis),
    onSuccess: fertig,
  });
  const beenden = useMutation({ mutationFn: () => endPlan(plan.id), onSuccess: fertig });

  return (
    <div className="mt-4 flex max-w-xl flex-col gap-4">
      {plan.relationship_open ? (
        <form
          noValidate
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!bis || (plan.runs_until !== null && bis <= plan.runs_until) || bis > spaetestens) {
              setFehler('Bitte ein Ende nach dem bisherigen wählen, höchstens 26 Wochen ab heute.');
              return;
            }
            setFehler(undefined);
            if (!verlaengern.isPending) verlaengern.mutate();
          }}
        >
          <Field
            label="Verlängern bis"
            type="date"
            min={plan.runs_until ?? plan.today}
            max={spaetestens}
            className="max-w-48"
            value={bis}
            error={fehler}
            onChange={(event) => setBis(event.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={verlaengern.isPending}>
            {verlaengern.isPending ? 'Wird verlängert …' : 'Verlängern'}
          </Button>
        </form>
      ) : null}
      {verlaengern.isError ? (
        <Statusmeldung ton="fehler">{verlaengern.error.message}</Statusmeldung>
      ) : null}
      <div>
        <Rueckfrage
          ausloeser="Plan beenden"
          ausloeserVariante="quiet"
          bestaetigen="Beenden"
          bestaetigenLaeuft="Wird beendet …"
          fehler={beenden.error?.message}
          onBestaetigen={() => beenden.mutateAsync()}
        >
          <p>Den Plan beenden? Er bleibt lesbar, läuft aber nicht weiter.</p>
        </Rueckfrage>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Fassungen (UEB-006, ANN-301)
// -----------------------------------------------------------------------------

function vorigePosition(plan: Plan, position: Position): Position | undefined {
  if (!position.previous_item_id || !plan.previous) return undefined;
  return plan.previous.items.find((p) => p.id === position.previous_item_id);
}

/** Der Schritt einer Position und was sich gegenüber der vorigen Fassung geändert hat. */
function Schritt({ position, vorige }: { position: Position; vorige: Position | undefined }) {
  if (!vorige) return null;
  const zeilen = unterschiede(vorige, position);
  return (
    <div className="text-ink-muted mt-2 text-sm">
      {position.step_axis && position.step_direction ? (
        <p className="text-ink font-medium">
          {position.step_direction === 'harder' ? 'Schwerer' : 'Leichter'}:{' '}
          {ACHSE_LABEL[position.step_axis]}
        </p>
      ) : (
        <p>Wie in der vorigen Fassung.</p>
      )}
      {zeilen.map((zeile) => (
        <p key={zeile}>{zeile}</p>
      ))}
    </div>
  );
}

function Fassungen({ plan }: { plan: Plan }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const neu = useMutation({
    mutationFn: () => createVersion(plan.id),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
      void navigate(planPfad(plan.service_area, plan.relationship_id, id));
    },
  });
  const darfNeu =
    plan.can_write && plan.relationship_open && plan.status === 'assigned' && !plan.follow_up;
  if (!darfNeu && !plan.follow_up && !plan.previous_plan_id) return null;

  return (
    <Section
      titel="Fassungen"
      hinweis={
        darfNeu
          ? 'Steigern oder zurücknehmen: Die neue Fassung übernimmt alle Übungen; je Übung ein Schritt in genau einer Achse. Mit dem Zuweisen löst sie diesen Plan ab.'
          : undefined
      }
    >
      <div className="flex flex-wrap gap-3">
        {darfNeu ? (
          <Button variant="secondary" disabled={neu.isPending} onClick={() => neu.mutate()}>
            {neu.isPending ? 'Wird angelegt …' : 'Neue Fassung'}
          </Button>
        ) : null}
        {plan.follow_up ? (
          <ButtonLink
            variant="secondary"
            to={planPfad(plan.service_area, plan.relationship_id, plan.follow_up.id)}
          >
            {plan.follow_up.status === 'draft' ? 'Neue Fassung (Entwurf)' : 'Neue Fassung'}
          </ButtonLink>
        ) : null}
        {plan.previous_plan_id ? (
          <ButtonLink
            variant="quiet"
            to={planPfad(plan.service_area, plan.relationship_id, plan.previous_plan_id)}
          >
            Vorige Fassung
          </ButtonLink>
        ) : null}
      </div>
      {neu.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {neu.error.message}
        </Statusmeldung>
      ) : null}
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Durchgeführt (UEB-010)
// -----------------------------------------------------------------------------

/**
 * Was die Person auf der Plattform an diesem Plan gemacht hat - Tag,
 * Durchgänge, „schwierig, weil …". Darstellung dessen, was sie erfasst hat;
 * keine Quote, keine Bewertung, kein Vorschlag (ADR-006 Punkt 10, §17).
 */
function Durchgefuehrt({ plan }: { plan: Plan }) {
  return (
    <Section titel="Durchgeführt" hinweis="Was die Person auf der Plattform abgehakt hat.">
      {plan.sessions.length === 0 ? (
        <p className="text-ink-muted text-sm">Noch keine Einheit erfasst.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {plan.sessions.map((einheit) => (
            <li key={einheit.id} className="rounded-card border-line bg-surface border p-3 text-sm">
              <EinheitZeile einheit={einheit} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function EinheitZeile({ einheit }: { einheit: Einheit }) {
  return (
    <>
      <p>
        <span className="font-semibold">{formatDate(einheit.performed_on)}</span>
        {' · '}
        {einheit.sets_done} von {einheit.sets_total} Durchgängen
        {einheit.finished_at ? '' : ' · nicht beendet'}
        {einheit.recorded_by_kind === 'legal_representative' ? ' · erfasst von der Vertretung' : ''}
      </p>
      {einheit.difficulty_note ? (
        <p className="mt-1">Schwierig, weil: {einheit.difficulty_note}</p>
      ) : null}
    </>
  );
}

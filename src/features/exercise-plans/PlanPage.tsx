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
  deletePosition,
  discardPlan,
  fetchPlan,
  movePosition,
  planSchluessel,
  savePlan,
  type Plan,
  type Position,
} from './api';
import { dosierungFachlich } from './dosierung';
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
      {bearbeitbar ? <Entwurf plan={plan} /> : <Positionsliste plan={plan} />}
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
                    bibliothek={bibliothek.data}
                    idPraefix={`position-${position.id}`}
                    onFertig={() => setOffen(null)}
                    onAbbrechen={() => setOffen(null)}
                  />
                </div>
              ) : (
                <Positionskarte
                  position={position}
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

function Positionsliste({ plan }: { plan: Plan }) {
  return (
    <Section titel="Übungen">
      {plan.items.length === 0 ? (
        <p className="text-ink-muted text-sm">Noch keine Übung.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {plan.items.map((position) => (
            <li key={position.id}>
              <Positionskarte position={position} />
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

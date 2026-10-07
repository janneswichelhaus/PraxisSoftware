import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  PLAENE_SCHLUESSEL,
  createPlan,
  fetchPlanliste,
  planPfad,
  planlisteSchluessel,
  type Bereich,
  type PlanZeile,
} from './api';
import { laufzeitStand } from './laufzeit';

/**
 * Die Pläne einer Person in einem Bereich (UEB-004): in der Akte
 * „Übungspläne", an der Trainingskund:in „Trainingspläne" (ANN-297).
 *
 * Entwürfe stehen oben, dann zugewiesene, dann beendete. Ein neuer Plan
 * entsteht sofort als Entwurf und öffnet sich zum Zusammenstellen; der Titel
 * ist dort änderbar. Ob die Person schreiben darf, sagt der Server
 * (`can_write`, ANN-298).
 */
export function PlanAbschnitt({
  bereich,
  verhaeltnisId,
  rueckweg,
}: {
  bereich: Bereich;
  verhaeltnisId: string;
  /** Die Adresse der Seite, auf die „zurück" vom Plan führt. */
  rueckweg: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const titel = bereich === 'therapy' ? 'Übungspläne' : 'Trainingspläne';
  const { data, isPending, isError } = useQuery({
    queryKey: planlisteSchluessel(bereich, verhaeltnisId),
    queryFn: () => fetchPlanliste(bereich, verhaeltnisId),
    retry: false,
  });

  const anlegen = useMutation({
    mutationFn: () =>
      createPlan(bereich, verhaeltnisId, bereich === 'therapy' ? 'Übungsplan' : 'Trainingsplan'),
    onSuccess: async (planId) => {
      await queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
      void navigate(mitRueckweg(planPfad(bereich, verhaeltnisId, planId), rueckweg));
    },
  });

  if (isPending) {
    return (
      <Section titel={titel}>
        <p className="text-ink-muted text-sm">Pläne werden geladen …</p>
      </Section>
    );
  }
  if (isError || !data) {
    return (
      <Section titel={titel}>
        <Statusmeldung ton="fehler">Die Pläne konnten nicht geladen werden.</Statusmeldung>
      </Section>
    );
  }

  return (
    <Section
      titel={titel}
      aktion={
        data.can_write ? (
          <Button
            variant="secondary"
            groesse="kompakt"
            disabled={anlegen.isPending}
            onClick={() => anlegen.mutate()}
          >
            {anlegen.isPending ? 'Wird angelegt …' : 'Neuer Plan'}
          </Button>
        ) : null
      }
    >
      {anlegen.isError ? (
        <Statusmeldung ton="fehler" className="mb-3">
          {anlegen.error.message}
        </Statusmeldung>
      ) : null}
      {data.plans.length === 0 ? (
        <p className="text-ink-muted text-sm">Noch kein Plan.</p>
      ) : (
        <ListRows>
          {data.plans.map((plan) => (
            <ListRow
              key={plan.id}
              titel={plan.title}
              meta={planMeta(plan)}
              status={planMarke(plan, data.today)}
              gedaempft={plan.status === 'ended' || plan.status === 'superseded'}
              to={mitRueckweg(planPfad(bereich, verhaeltnisId, plan.id), rueckweg)}
            />
          ))}
        </ListRows>
      )}
    </Section>
  );
}

function anzahl(n: number): string {
  return n === 1 ? '1 Übung' : `${n} Übungen`;
}

function planMeta(plan: PlanZeile): string {
  switch (plan.status) {
    case 'draft':
      return `Entwurf · ${anzahl(plan.item_count)}`;
    case 'assigned':
      return `${anzahl(plan.item_count)} · bis ${formatDate(plan.runs_until)}`;
    case 'ended':
      return `beendet · lief ab ${formatDate(plan.runs_from)}`;
    case 'superseded':
      return `abgelöst durch eine neue Fassung · lief ab ${formatDate(plan.runs_from)}`;
  }
}

function planMarke(plan: PlanZeile, heute: string) {
  if (plan.status === 'draft') return <Badge>Entwurf</Badge>;
  if (plan.status !== 'assigned' || !plan.runs_until) return null;
  const stand = laufzeitStand(plan.runs_until, heute, plan.review_due);
  if (stand === 'abgelaufen') return <Badge ton="warnung">abgelaufen</Badge>;
  if (stand === 'laeuft_aus') return <Badge ton="warnung">läuft aus</Badge>;
  return <Badge ton="positiv">zugewiesen</Badge>;
}

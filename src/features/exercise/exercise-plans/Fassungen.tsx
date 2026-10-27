import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { formatDate } from '@/lib/datum';
import { planPfad, type Plan } from './api';

/**
 * Die Wege zur neuen und zur vorigen Fassung (UEB-006, ANN-301) - als Zeilen
 * am Ende von Planeditor und Planseite, mit Nummer und Stand (Befund B9):
 * „Fassung 1 · Stand 01.09.2026“, „Fassung 3 · Entwurf“. Ohne Fassung kein
 * Abschnitt.
 */
export function Fassungen({ plan }: { plan: Plan }) {
  if (!plan.follow_up && !plan.previous_plan_id) return null;
  const nummer = plan.version_number;
  return (
    <Listenabschnitt titel="Fassungen">
      {plan.follow_up ? (
        <ListRow
          titel={`Fassung ${nummer + 1}`}
          meta={
            plan.follow_up.status === 'draft' || !plan.follow_up.runs_from
              ? 'Neue Fassung · Entwurf'
              : `Neue Fassung · Stand ${formatDate(plan.follow_up.runs_from)}`
          }
          to={planPfad(plan.service_area, plan.relationship_id, plan.follow_up.id)}
        />
      ) : null}
      {plan.previous_plan_id ? (
        <ListRow
          titel={`Fassung ${Math.max(nummer - 1, 1)}`}
          meta={
            plan.previous?.runs_from
              ? `Vorige Fassung · Stand ${formatDate(plan.previous.runs_from)}`
              : 'Vorige Fassung'
          }
          to={planPfad(plan.service_area, plan.relationship_id, plan.previous_plan_id)}
        />
      ) : null}
    </Listenabschnitt>
  );
}

import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { planPfad, type Plan } from './api';

/**
 * Die Wege zur neuen und zur vorigen Fassung (UEB-006, ANN-301) - als Zeilen
 * am Ende von Planeditor und Planseite. Ohne Fassung kein Abschnitt.
 */
export function Fassungen({ plan }: { plan: Plan }) {
  if (!plan.follow_up && !plan.previous_plan_id) return null;
  return (
    <Listenabschnitt titel="Fassungen">
      {plan.follow_up ? (
        <ListRow
          titel={plan.follow_up.status === 'draft' ? 'Neue Fassung (Entwurf)' : 'Neue Fassung'}
          to={planPfad(plan.service_area, plan.relationship_id, plan.follow_up.id)}
        />
      ) : null}
      {plan.previous_plan_id ? (
        <ListRow
          titel="Vorige Fassung"
          to={planPfad(plan.service_area, plan.relationship_id, plan.previous_plan_id)}
        />
      ) : null}
    </Listenabschnitt>
  );
}

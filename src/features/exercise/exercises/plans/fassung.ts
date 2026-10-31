import { ACHSE_LABEL } from '../types';
import { formatDate } from '@/lib/datum';
import type { Plan, Position } from './api';
import { unterschiede } from './dosierung';

/**
 * Fassungen eines Plans (UEB-006, ANN-301): die Position der vorigen Fassung
 * und der Schritt dorthin - als Zeilen für Planeditor und Planseite.
 */

export function vorigePosition(plan: Plan, position: Position): Position | undefined {
  if (!position.previous_item_id || !plan.previous) return undefined;
  return plan.previous.items.find((p) => p.id === position.previous_item_id);
}

/** „Schwerer: Last" und „Last: 5 kg → 7 kg" - oder „Wie in der vorigen Fassung." */
export function schrittZeilen(position: Position, vorige: Position | undefined): string[] {
  if (!vorige) return [];
  const kopf =
    position.step_axis && position.step_direction
      ? `${position.step_direction === 'harder' ? 'Schwerer' : 'Leichter'}: ${ACHSE_LABEL[position.step_axis]}`
      : 'Wie in der vorigen Fassung.';
  return [kopf, ...unterschiede(vorige, position)];
}

/** Steht der Titel noch so da, wie ein neuer Plan ihn bekommt? */
export function standardTitel(plan: Pick<Plan, 'service_area' | 'title'>): boolean {
  return plan.title === (plan.service_area === 'therapy' ? 'Übungsplan' : 'Trainingsplan');
}

/**
 * ANN-538: Der Stand eines Plans in einer Zeile - damit bei einem Wechsel der
 * Therapeut:in zu sehen ist, welche Fassung gilt und von wem sie stammt.
 * Zugewiesen „Fassung 2 · Stand 14.10.2026 · Anna Beispiel“ (Stand ist der
 * Tag der Zuweisung, wie auf der Plattform und dem Planblatt), im Entwurf
 * „Fassung 3 · Entwurf · zuletzt geändert 14.10.2026 von Anna Beispiel“ -
 * die Nummer erst ab der zweiten Fassung. Gezählt wird am Server über die
 * Kette der Fassungen (`version_number`).
 */
export function standZeile(
  plan: Pick<
    Plan,
    | 'status'
    | 'version_number'
    | 'runs_from'
    | 'assigned_by_name'
    | 'updated_on'
    | 'updated_by_name'
  >,
): string {
  if (plan.status === 'draft') {
    const geaendert = plan.updated_on
      ? `zuletzt geändert ${formatDate(plan.updated_on)}${
          plan.updated_by_name ? ` von ${plan.updated_by_name}` : ''
        }`
      : null;
    return [plan.version_number > 1 ? `Fassung ${plan.version_number}` : null, 'Entwurf', geaendert]
      .filter(Boolean)
      .join(' · ');
  }
  return [
    `Fassung ${plan.version_number}`,
    `Stand ${formatDate(plan.runs_from)}`,
    plan.assigned_by_name,
  ]
    .filter(Boolean)
    .join(' · ');
}

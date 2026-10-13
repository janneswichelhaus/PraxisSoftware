import { ACHSE_LABEL } from '@/features/exercises/types';
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

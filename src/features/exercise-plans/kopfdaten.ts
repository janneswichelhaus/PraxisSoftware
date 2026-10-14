import type { QueryClient } from '@tanstack/react-query';
import { planSchluessel, savePlan, type Plan } from './api';

/**
 * Titel und Häufigkeit pro Woche eines Entwurfs speichert ein Aufruf
 * (`save_exercise_plan`) - immer beide. Seit die Häufigkeit direkt im Entwurf
 * steht (Befund B9), schreiben drei Stellen: jeder Tipp auf die Häufigkeit,
 * „Titel ändern“ und der Titel aus einer Vorlage.
 *
 * Damit keine die andere überschreibt, laufen sie je Plan der Reihe nach
 * (dieselbe `scope` für alle) und nehmen den Wert, den sie nicht ändern, vom
 * zuletzt gespeicherten Stand - nicht aus dem, was beim Tippen angezeigt war.
 * „Zuweisen“ reiht sich ebenso ein: Der Plan geht erst nach dem letzten Tipp
 * zur Person.
 */
export function kopfdatenScope(planId: string): { id: string } {
  return { id: `uebungsplan-kopfdaten-${planId}` };
}

/** Die laufenden Tipps auf die Häufigkeit eines Plans (`useMutationState`). */
export function haeufigkeitSchluessel(planId: string) {
  return ['uebungsplan-haeufigkeit', planId] as const;
}

export type Kopfaenderung = { titel: string } | { einheitenJeWoche: number | null };

/**
 * Speichert Titel oder Häufigkeit und nimmt das andere vom Plan im Cache -
 * dort steht nach jedem Aufruf in der Reihe, was gespeichert ist, auch wenn
 * das Nachladen danach scheitert.
 */
export async function speichereKopfdaten(
  queryClient: QueryClient,
  plan: Plan,
  aenderung: Kopfaenderung,
): Promise<void> {
  const schluessel = planSchluessel(plan.id);
  const stand = queryClient.getQueryData<Plan | null>(schluessel) ?? plan;
  const titel = 'titel' in aenderung ? aenderung.titel : stand.title;
  const einheiten =
    'einheitenJeWoche' in aenderung ? aenderung.einheitenJeWoche : stand.sessions_per_week;
  await savePlan(plan.id, titel, einheiten);
  queryClient.setQueryData<Plan | null>(schluessel, (alt) =>
    alt ? { ...alt, title: titel, sessions_per_week: einheiten } : alt,
  );
}

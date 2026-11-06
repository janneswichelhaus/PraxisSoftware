import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { planfehler, planSchema, type Plan, type PlanAngaben } from './plaene';

// Praxis: Planvorlagen und Pläne an einer Beratung (ADR-027 Punkt 14), allein mit der Fähigkeit
// „Ernährungsberatung“; die Auswahl trifft die Beratung, nie eine Diagnose.

export const PLANVORLAGEN_SCHLUESSEL = ['planvorlagen'] as const;

async function rpc(funktion: string, parameter?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = (await getSupabase().rpc(funktion, parameter)) as {
    data: unknown;
    error: { message?: string } | null;
  };
  if (error) throw new Error(planfehler(error.message));
  return data;
}

export async function planvorlagen(): Promise<Plan[]> {
  const daten = await rpc('list_nutrition_plan_templates');
  return antwort(z.array(planSchema), daten, 'Die Vorlagen konnten nicht geladen werden.');
}

export async function planvorlageSpeichern(
  id: string | null,
  angaben: PlanAngaben,
  stand: string | null,
): Promise<string> {
  const daten = await rpc('save_nutrition_plan_template', {
    p_id: id,
    p_plan: angaben,
    p_expected: stand,
  });
  return String(daten);
}

export async function planvorlageAblegen(id: string): Promise<void> {
  await rpc('archive_nutrition_plan_template', { p_id: id });
}

/** Einen Plan an einer laufenden Beratung zuweisen; der offene endet am Tag vor `beginn`. */
export async function planZuweisen(
  profilId: string,
  angaben: PlanAngaben,
  beginn: string,
): Promise<string> {
  const daten = await rpc('assign_nutrition_plan', {
    p_profile_id: profilId,
    p_plan: angaben,
    p_starts_on: beginn,
  });
  return String(daten);
}

export async function planAendern(
  planId: string,
  angaben: PlanAngaben,
  stand: string | null,
): Promise<void> {
  await rpc('update_nutrition_plan', { p_plan_id: planId, p_plan: angaben, p_expected: stand });
}

export async function planBeenden(planId: string): Promise<void> {
  await rpc('end_nutrition_plan', { p_plan_id: planId });
}

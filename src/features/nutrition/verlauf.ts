import { z } from 'zod';
import type { Bildmarkierung } from '@/components/ui/Punktbild';
import { formatDate } from '@/lib/datum';
import { grammVon, kcal, wasserText } from './tagebuch';
import { zahl } from './texte';

/**
 * Der Verlauf einer Ernährungsberatung (ANN-846): Mittel je Tag über die
 * Tage mit Eintrag, neben den Zielwerten von heute. Was nicht entsteht (ADR-027 Punkte 11, 13):
 * keine Wertung, kein Trend, keine Farbe nach Höhe, kein Vergleich mit anderen Personen.
 */

const spanneSchema = z.object({
  from: z.string(),
  to: z.string(),
  days: z.number(),
  food_days: z.number(),
  water_days: z.number(),
  energy_kcal: z.number().nullable(),
  protein_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  carbohydrate_g: z.number().nullable(),
  water_ml: z.number().nullable(),
});

export type Spanne = z.infer<typeof spanneSchema>;

const zieleSchema = z
  .object({
    energy_kcal: z.number(),
    protein_g: z.number(),
    fat_g: z.number(),
    carbohydrate_g: z.number(),
    water_ml: z.number(),
  })
  .nullable();

export type Verlaufsziele = z.infer<typeof zieleSchema>;

export const verlaufSchema = z.object({
  today: z.string(),
  started_on: z.string(),
  ended_on: z.string().nullable(),
  last_session_on: z.string().nullable(),
  next_session_on: z.string().nullable(),
  target_weight_kg: z.number().nullable(),
  targets: zieleSchema,
  period: spanneSchema,
  weeks: z.array(spanneSchema.extend({ week_start: z.string() })),
  weights: z.array(z.object({ measured_on: z.string(), weight_kg: z.number() })),
  sessions: z.array(z.string()),
  plan_events: z.array(
    z.object({
      occurred_on: z.string(),
      kind: z.enum(['plan_assigned', 'plan_ended']),
      title: z.string(),
    }),
  ),
});

export type Ernaehrungsverlauf = z.infer<typeof verlaufSchema>;

/** „an 5 von 7 Tagen“ - ein Tag ohne Eintrag zählt nicht als null (ANN-846). */
export function tageText(s: Pick<Spanne, 'food_days' | 'days'>): string {
  return `an ${zahl(s.food_days)} von ${zahl(s.days)} ${s.days === 1 ? 'Tag' : 'Tagen'}`;
}

/** „1.650 von 1.900 kcal“; ohne Zielwert nur das Mittel, ohne Eintrag `null`. */
export function energieText(s: Spanne, ziele: Verlaufsziele): string | null {
  if (s.energy_kcal === null) return null;
  return ziele ? `${zahl(s.energy_kcal)} von ${kcal(ziele.energy_kcal)}` : kcal(s.energy_kcal);
}

/** Die Nebenzeile einer Woche: Tage, Nährstoffe neben ihren Zielen, Wasser. */
export function wochenzeile(s: Spanne, ziele: Verlaufsziele): string {
  const teile: string[] = [];
  if (s.food_days === 0) teile.push('Nichts eingetragen');
  else {
    teile.push(tageText(s));
    const g = (name: string, wert: number | null, ziel: number | undefined) =>
      wert === null
        ? null
        : `${name} ${ziel === undefined ? `${zahl(wert)} g` : grammVon(wert, ziel)}`;
    for (const teil of [
      g('Eiweiß', s.protein_g, ziele?.protein_g),
      g('Kohlenhydrate', s.carbohydrate_g, ziele?.carbohydrate_g),
      g('Fett', s.fat_g, ziele?.fat_g),
    ])
      if (teil) teile.push(teil);
  }
  if (s.water_ml !== null) teile.push(`Wasser ${wasserText(s.water_ml)}`);
  return teile.join(' · ');
}

/** Markierungen am Gewichtsbild: Planwechsel; die Beratungen stehen als Striche (Punktbild). */
export function planmarkierungen(v: Ernaehrungsverlauf): Bildmarkierung[] {
  return v.plan_events.map((p) => ({
    datum: p.occurred_on,
    text: `${p.kind === 'plan_assigned' ? 'Plan begonnen' : 'Plan beendet'} · ${p.title}`,
  }));
}

/** Eine Skala, die Gewicht und Zielgewicht fasst, auf ganze kg mit etwas Rand. */
export function gewichtsskala(v: Ernaehrungsverlauf): { min: number; max: number } | null {
  const werte = v.weights.map((g) => g.weight_kg);
  if (werte.length === 0) return null;
  if (v.target_weight_kg !== null) werte.push(v.target_weight_kg);
  return { min: Math.floor(Math.min(...werte) - 1), max: Math.ceil(Math.max(...werte) + 1) };
}

/** „Seit der Beratung am 30.10.“ oder „Seit Beginn am 17.10.“ - der Zeitraum der Vorbereitung. */
export function zeitraumText(v: Ernaehrungsverlauf): string {
  return v.last_session_on
    ? `Seit der Beratung am ${formatDate(v.last_session_on)}`
    : `Seit Beginn am ${formatDate(v.started_on)}`;
}

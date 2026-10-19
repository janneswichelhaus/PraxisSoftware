import { z } from 'zod';
import { leseZahl } from './eingabe';
import type { Lebensmittel } from './lebensmittel';
import { zahl } from './texte';

/**
 * Das Ernährungstagebuch (ERN-EPIC-003, ADR-027 Punkte 10 und 11) - Form der
 * Antworten und Texte für Plattform und Beratung, ohne Datenzugriff.
 *
 * Gerechnet hat der Server: die Werte eines Eintrags aus dem Stand des
 * Lebensmittels und der Menge, die Summen, die Zielwerte. Hier steht nur,
 * wie es dasteht - Zahlen, „noch übrig“ und eine Überschreitung als solche,
 * keine Bewertung eines Lebensmittels (ADR-006 Punkt 14).
 */

export const MAHLZEITEN = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Mahlzeit = (typeof MAHLZEITEN)[number];

export const MAHLZEIT_NAMEN: Record<Mahlzeit, string> = {
  breakfast: 'Frühstück',
  lunch: 'Mittagessen',
  dinner: 'Abendessen',
  snack: 'Snacks',
};

export function istMahlzeit(wert: unknown): wert is Mahlzeit {
  return typeof wert === 'string' && (MAHLZEITEN as readonly string[]).includes(wert);
}

const summenSchema = z.object({
  energy_kcal: z.number(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbohydrate_g: z.number(),
});

export type Summen = z.infer<typeof summenSchema>;

export const eintragSchema = z.object({
  id: z.string(),
  eaten_on: z.string(),
  meal: z.enum(MAHLZEITEN),
  food_kind: z.enum(['catalog', 'practice', 'person']),
  food_id: z.string().nullable(),
  name: z.string(),
  brand: z.string().nullable(),
  base_unit: z.enum(['g', 'ml']),
  amount: z.number(),
  portion_label: z.string().nullable(),
  portion_amount: z.number().nullable(),
  portion_count: z.number().nullable(),
  energy_kcal: z.number(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbohydrate_g: z.number(),
  // Wer eingetragen hat - nur für die Beratung.
  recorded_by_kind: z.enum(['self', 'legal_representative']).optional(),
});

export type Eintrag = z.infer<typeof eintragSchema>;

export const tagSchema = z.object({
  day: z.string(),
  meals: z.array(
    z.object({ meal: z.enum(MAHLZEITEN), entries: z.array(eintragSchema), totals: summenSchema }),
  ),
  totals: summenSchema,
  water_ml: z.number(),
});

export type Tagebuchtag = z.infer<typeof tagSchema>;

export const zieleSchema = z
  .object({
    energy_kcal: z.number(),
    protein_g: z.number(),
    fat_g: z.number(),
    carbohydrate_g: z.number(),
    water_ml: z.number(),
  })
  .nullable();

export type Tagesziele = z.infer<typeof zieleSchema>;

/** „1 234 kcal“. */
export function kcal(wert: number): string {
  return `${zahl(wert)} kcal`;
}

/**
 * Was vom Energieziel übrig ist - oder wie weit darüber (ADR-027 Punkt 11:
 * Überschreitung als solche benannt, ohne Urteil).
 */
export function nochUebrig(ziel: number, gegessen: number): { wert: string; ueber: boolean } {
  const rest = Math.round(ziel - gegessen);
  if (rest >= 0) return { wert: kcal(rest), ueber: false };
  return { wert: `${kcal(-rest)} über dem Ziel`, ueber: true };
}

/** „12,5 von 80 g“. */
export function grammVon(wert: number, ziel: number): string {
  return `${zahl(wert, wert % 1 === 0 ? 0 : 1)} von ${zahl(ziel)} g`;
}

/** „1 Portion · 50 g“, „2 × 1 Scheibe · 90 g“, „120 g“. */
export function mengeText(
  e: Pick<Eintrag, 'amount' | 'base_unit' | 'portion_label' | 'portion_count'>,
): string {
  const menge = `${zahl(e.amount, e.amount % 1 === 0 ? 0 : 1)} ${e.base_unit}`;
  if (e.portion_label === null || e.portion_count === null) return menge;
  const anzahl =
    e.portion_count === 1 ? '' : `${zahl(e.portion_count, e.portion_count % 1 === 0 ? 0 : 2)} × `;
  return `${anzahl}${e.portion_label} · ${menge}`;
}

/** „0,5 l“ bzw. „250 ml“. */
export function wasserText(ml: number): string {
  return ml >= 1000
    ? `${zahl(ml / 1000, ml % 1000 === 0 ? 0 : 2).replace(/0$/, '')} l`
    : `${zahl(ml)} ml`;
}

// -----------------------------------------------------------------------------
// Menge wählen
// -----------------------------------------------------------------------------

/** Was der Server unter Menge erwartet: eine Portion mit Anzahl oder g/ml. */
export type Mengenangabe =
  { art: 'portion'; label: string; anzahl: number } | { art: 'menge'; menge: number };

/** Die Wahl der Einheit: jede Portion des Lebensmittels, dazu g bzw. ml. */
export const FREIE_MENGE = '__menge__';

/** Vorbelegung: die erste Portion mal eins, sonst 100 g bzw. ml. */
export function vorbelegung(f: Pick<Lebensmittel, 'portions'>): { einheit: string; wert: string } {
  const erste = f.portions[0];
  return erste ? { einheit: erste.label, wert: '1' } : { einheit: FREIE_MENGE, wert: '100' };
}

/** Prüft die Eingabe wie der Server; liefert die Angabe oder einen Satz. */
export function mengePruefen(
  f: Pick<Lebensmittel, 'portions' | 'base_unit'>,
  einheit: string,
  wert: string,
): { angabe: Mengenangabe; menge: number } | { fehler: string } {
  const n = leseZahl(wert);
  if (einheit === FREIE_MENGE) {
    if (n === null || n <= 0 || n > 5000)
      return { fehler: `Bitte die Menge in ${f.base_unit} angeben, bis 5000.` };
    return { angabe: { art: 'menge', menge: Math.round(n * 10) / 10 }, menge: n };
  }
  const portion = f.portions.find((p) => p.label === einheit);
  if (!portion) return { fehler: 'Bitte eine Portion wählen.' };
  if (n === null || n <= 0 || n > 20) return { fehler: 'Bitte die Anzahl angeben, bis 20.' };
  const anzahl = Math.round(n * 100) / 100;
  return {
    angabe: { art: 'portion', label: portion.label, anzahl },
    menge: Math.round(portion.amount * anzahl * 10) / 10,
  };
}

/** Energie einer Menge aus den Werten je 100 - wie der Server gerundet. */
export function energieDerMenge(f: Pick<Lebensmittel, 'per_100'>, menge: number): number {
  return Math.round((f.per_100.energy_kcal * menge) / 100);
}

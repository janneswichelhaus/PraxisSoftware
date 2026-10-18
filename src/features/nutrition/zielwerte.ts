import { z } from 'zod';

/**
 * Die Zielwerte, wie sie der Server rechnet (ERN-001, ADR-027 Abschnitt E).
 *
 * Gerechnet wird ausschließlich in `app.nutrition_calculation`; hier steht
 * nur die Form der Antwort. Praxis und Plattform lesen dieselbe Form, deshalb
 * liegt sie ohne Datenzugriff in einer eigenen Datei (ADR-023 Punkt 26).
 */

const termSchema = z.object({
  factor: z.number(),
  input: z.enum(['weight_kg', 'height_cm', 'age_years', 'lean_mass_kg']),
});

const varianteSchema = z.object({
  sex: z.enum(['female', 'male']).nullable(),
  constant: z.number(),
  kcal: z.number(),
  terms: z.array(termSchema),
});

export const GESCHLECHTER = ['female', 'male', 'unspecified'] as const;
export const ZIELE = ['lose', 'maintain', 'build_muscle', 'gain'] as const;
export const PAL_STUFEN = [1.4, 1.6, 1.8, 2.0] as const;
export const FORMELN = ['standard', 'katch_mcardle', 'harris_benedict_revised'] as const;

export type Geschlecht = (typeof GESCHLECHTER)[number];
export type Ziel = (typeof ZIELE)[number];
export type Formel = (typeof FORMELN)[number];

const berechnetSchema = z.object({
  status: z.literal('ok'),
  inputs: z.object({
    weight_kg: z.number(),
    height_cm: z.number(),
    age_years: z.number(),
    sex: z.enum(GESCHLECHTER),
    body_fat_percent: z.number().nullable(),
    pal: z.number(),
    goal: z.enum(ZIELE),
    formula: z.enum(FORMELN),
    in_training: z.boolean(),
  }),
  bmr: z.object({
    formula: z.enum(['mifflin_st_jeor', 'cunningham', 'katch_mcardle', 'harris_benedict_revised']),
    lean_mass_kg: z.number().nullable(),
    averaged: z.boolean(),
    variants: z.array(varianteSchema),
    kcal: z.number(),
  }),
  tee: z.object({ pal: z.number(), kcal: z.number() }),
  energy: z.object({
    rule: z.enum(['maintain', 'deficit', 'deficit_capped', 'surplus']),
    change_kcal: z.number(),
    deficit_max_kcal: z.number(),
    deficit_max_share: z.number(),
    floor_applied: z.boolean(),
    computed_kcal: z.number(),
    kcal: z.number(),
    overridden: z.boolean(),
    below_bmr: z.boolean(),
  }),
  protein: z.object({
    g_per_kg: z.number(),
    basis: z.enum(['standard', 'from_65', 'muscle_or_training']),
    computed_g: z.number(),
    g: z.number(),
    kcal_per_g: z.number(),
    overridden: z.boolean(),
  }),
  fat: z.object({
    share: z.number(),
    computed_g: z.number(),
    g: z.number(),
    kcal_per_g: z.number(),
    overridden: z.boolean(),
  }),
  carbohydrate: z.object({
    computed_g: z.number(),
    g: z.number(),
    kcal_per_g: z.number(),
    overridden: z.boolean(),
  }),
  water: z.object({
    ml_per_kg: z.number(),
    minimum_ml: z.number(),
    floor_applied: z.boolean(),
    computed_ml: z.number(),
    ml: z.number(),
    overridden: z.boolean(),
  }),
  target_weight: z.object({
    kg: z.number().nullable(),
    floor_kg: z.number(),
    bmi_floor: z.number(),
    below_floor: z.boolean(),
    weeks: z.number().nullable(),
    kcal_per_kg: z.number(),
  }),
});

const fehltSchema = z.object({
  status: z.literal('missing'),
  missing: z.array(z.enum(['weight', 'height', 'birth_date', 'body_fat'])),
});

export const zielwerteSchema = z.discriminatedUnion('status', [berechnetSchema, fehltSchema]);

export type Zielwerte = z.infer<typeof zielwerteSchema>;
export type BerechneteZielwerte = z.infer<typeof berechnetSchema>;

export const gewichtSchema = z.object({
  measured_on: z.string(),
  weight_kg: z.number(),
  source: z.enum(['practice', 'platform']),
  recorded_by_kind: z.enum(['self', 'legal_representative']).nullable(),
});

export type Gewichtseintrag = z.infer<typeof gewichtSchema>;

export const einwilligungSchema = z.object({
  state: z.enum(['granted', 'withdrawn']),
  occurred_on: z.string(),
  source: z.enum(['practice', 'platform']),
  platform_access_kind: z.enum(['self', 'legal_representative']).nullable(),
  representative_name: z.string().nullable(),
});

export type Einwilligungsstand = z.infer<typeof einwilligungSchema>;

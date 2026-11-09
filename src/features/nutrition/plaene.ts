import { z } from 'zod';
import { lebensmittelSchema } from './lebensmittel';
import { rezeptSchema, type ZutatLebensmittel } from './rezepte';
import {
  energieDerMenge,
  kcal,
  MAHLZEITEN,
  type Mahlzeit,
  type Mengenangabe,
  type Schnellwahl,
} from './tagebuch';
import { zahl } from './texte';

/**
 * Pläne und Tagesvorschläge (ADR-027 Punkt 14) für Praxis und Plattform, ohne Datenzugriff. Ein
 * Plan hat ein bis sieben Tage und wiederholt sich ab seinem Beginn (ANN-845).
 */

export const MAX_TAGE = 7;
export const MAX_JE_MAHLZEIT = 12;
const MAX_TITEL = 80;

const positionSchema = z.object({
  kind: z.enum(['recipe', 'catalog', 'practice']),
  id: z.string(),
  name: z.string(),
  amount: z.number().nullable(),
  portion_label: z.string().nullable(),
  portion_count: z.number().nullable(),
  energy_kcal: z.number().nullable(),
  food: lebensmittelSchema,
});

const mahlzeitenSchema = z.array(
  z.object({ meal: z.enum(MAHLZEITEN), items: z.array(positionSchema) }),
);

export const planSchema = z.object({
  id: z.string(),
  title: z.string(),
  day_count: z.number(),
  starts_on: z.string().nullable(),
  ended_on: z.string().nullable(),
  updated_at: z.string(),
  days: z.array(z.object({ day: z.number(), meals: mahlzeitenSchema })),
  recipes: z.array(rezeptSchema),
});

/** Der Vorschlag eines Tags im Tagebuch. */
export const vorschlagSchema = z.object({
  plan_id: z.string(),
  title: z.string(),
  day_count: z.number(),
  day: z.number(),
  meals: mahlzeitenSchema,
});

export type Plan = z.infer<typeof planSchema>;
export type Planposition = z.infer<typeof positionSchema>;
export type Vorschlag = z.infer<typeof vorschlagSchema>;

/** Eine Position im Formular: das Lebensmittel oder Rezept mit seiner Menge. */
export interface Entwurfsposition {
  lebensmittel: ZutatLebensmittel;
  angabe: Mengenangabe;
  menge: number;
}

export type Entwurfstag = Record<Mahlzeit, Entwurfsposition[]>;

export interface Planentwurf {
  titel: string;
  tage: Entwurfstag[];
}

type Positionsangabe =
  | { kind: 'recipe'; id: string; portion_count: number }
  | { kind: 'catalog' | 'practice'; id: string; amount: number }
  | { kind: 'catalog' | 'practice'; id: string; portion_label: string; portion_count: number };

/** Was an den Server geht: je Tag die Mahlzeiten mit Lebensmittel und Menge, keine Werte. */
export interface PlanAngaben {
  title: string;
  days: Partial<Record<Mahlzeit, Positionsangabe[]>>[];
}

export function leererTag(): Entwurfstag {
  return { breakfast: [], lunch: [], dinner: [], snack: [] };
}

export function leererPlan(titel = ''): Planentwurf {
  return { titel, tage: [leererTag()] };
}

export function positionAus(p: Planposition): Entwurfsposition {
  const angabe: Mengenangabe =
    p.portion_label !== null && p.portion_count !== null
      ? { art: 'portion', label: p.portion_label, anzahl: p.portion_count }
      : { art: 'menge', menge: p.amount ?? 0 };
  return { lebensmittel: p.food, angabe, menge: p.amount ?? 0 };
}

/** Ein gespeicherter Plan oder eine Vorlage als Formular. */
export function entwurfAus(plan: Pick<Plan, 'title' | 'days'>): Planentwurf {
  return {
    titel: plan.title,
    tage: plan.days.map((tag) => {
      const neu = leererTag();
      for (const m of tag.meals) neu[m.meal] = m.items.map(positionAus);
      return neu;
    }),
  };
}

export const PLAN_FELDER = ['titel', 'tage'] as const;
export type PlanFeld = (typeof PLAN_FELDER)[number];
export const PLAN_BESCHRIFTUNG: Record<PlanFeld, string> = { titel: 'Titel', tage: 'Tage' };

/** Prüft wie der Server; liefert die Angaben oder je Feld einen Satz. */
export function planPruefen(
  e: Planentwurf,
): { angaben: PlanAngaben } | { fehler: Partial<Record<PlanFeld, string>> } {
  const fehler: Partial<Record<PlanFeld, string>> = {};
  const titel = e.titel.trim();
  if (titel === '') fehler.titel = 'Bitte einen Titel angeben.';
  else if (titel.length > MAX_TITEL) fehler.titel = `Bitte höchstens ${MAX_TITEL} Zeichen.`;
  if (e.tage.length === 0 || e.tage.length > MAX_TAGE)
    fehler.tage = `Bitte ein bis ${MAX_TAGE} Tage.`;
  else if (e.tage.every((t) => MAHLZEITEN.every((m) => t[m].length === 0)))
    fehler.tage = 'Bitte mindestens ein Rezept oder Lebensmittel hinzufügen.';
  else if (e.tage.some((t) => MAHLZEITEN.some((m) => t[m].length > MAX_JE_MAHLZEIT)))
    fehler.tage = `Bitte höchstens ${MAX_JE_MAHLZEIT} je Mahlzeit.`;
  if (Object.keys(fehler).length > 0) return { fehler };
  return {
    angaben: {
      title: titel,
      days: e.tage.map((t) => {
        const tag: Partial<Record<Mahlzeit, Positionsangabe[]>> = {};
        for (const m of MAHLZEITEN) if (t[m].length > 0) tag[m] = t[m].map(positionsangabe);
        return tag;
      }),
    },
  };
}

function positionsangabe({ lebensmittel: f, angabe }: Entwurfsposition): Positionsangabe {
  if (f.kind === 'recipe')
    return {
      kind: 'recipe',
      id: f.id,
      portion_count: angabe.art === 'portion' ? angabe.anzahl : 1,
    };
  const kind = f.kind === 'practice' ? 'practice' : 'catalog';
  return angabe.art === 'portion'
    ? { kind, id: f.id, portion_label: angabe.label, portion_count: angabe.anzahl }
    : { kind, id: f.id, amount: angabe.menge };
}

export function positionsEnergie(p: Entwurfsposition): number {
  return energieDerMenge(p.lebensmittel, p.menge);
}

export function tagesEnergie(tag: Entwurfstag): number {
  return MAHLZEITEN.reduce((s, m) => s + tag[m].reduce((t, p) => t + positionsEnergie(p), 0), 0);
}

export function tageText(n: number): string {
  return n === 1 ? '1 Tag' : `${zahl(n)} Tage`;
}

/** Der Tag im Wechsel ab dem Beginn, wie am Server (ANN-845); vor dem Beginn `null`. */
export function planTag(plan: Pick<Plan, 'starts_on' | 'day_count'>, heute: string): number | null {
  if (!plan.starts_on || heute < plan.starts_on) return null;
  const tage = Math.round((Date.parse(heute) - Date.parse(plan.starts_on)) / 86_400_000);
  return (tage % plan.day_count) + 1;
}

/** Der Plan, der heute oder später gilt (höchstens einer ist offen). */
export function offenerPlan(plaene: readonly Plan[]): Plan | undefined {
  return plaene.find((p) => p.starts_on !== null && p.ended_on === null);
}

/**
 * Der Plan, der heute gilt; sonst der nächste. Beginnt ein neuer erst später, läuft der alte bis
 * zum Tag davor (ANN-845).
 */
export function geltenderPlan(plaene: readonly Plan[], heute: string): Plan | undefined {
  const heuteGueltig = plaene
    .filter((p) => p.starts_on !== null && p.starts_on <= heute)
    .filter((p) => p.ended_on === null || p.ended_on >= heute)
    .sort((a, b) => (a.starts_on! < b.starts_on! ? 1 : -1));
  return heuteGueltig[0] ?? offenerPlan(plaene);
}

/** „1 Portion · 222 kcal“, „1 Stück (mittel) · 81 kcal“, „250 g“; ohne Zahlen ohne Energie. */
export function positionMeta(
  p: Pick<Planposition, 'kind' | 'amount' | 'portion_label' | 'portion_count' | 'energy_kcal'> & {
    food: Pick<Planposition['food'], 'base_unit'>;
  },
  ohneZahlen = false,
): string {
  const anzahl =
    p.portion_count !== null && p.portion_count !== 1
      ? `${zahl(p.portion_count, p.portion_count % 1 === 0 ? 0 : 2)} × `
      : '';
  const menge =
    p.portion_label !== null
      ? `${anzahl}${p.portion_label}`
      : `${zahl(p.amount ?? 0, (p.amount ?? 0) % 1 === 0 ? 0 : 1)} ${p.food.base_unit}`;
  return [menge, ohneZahlen || p.energy_kcal === null ? null : kcal(p.energy_kcal)]
    .filter(Boolean)
    .join(' · ');
}

/** Ein Satz statt der Meldung des Servers (§13). */
export function planfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('changed meanwhile'))
    return 'Der Plan wurde inzwischen geändert. Bitte die Seite neu laden.';
  if (m.includes('plan has ended')) return 'Dieser Plan ist beendet.';
  if (m.includes('plan not found')) return 'Diesen Plan gibt es nicht mehr.';
  if (m.includes('recipe not found') || m.includes('food not found'))
    return 'Ein Rezept oder Lebensmittel gibt es nicht mehr. Bitte den Plan prüfen.';
  if (m.includes('start outside')) return 'Bitte einen Beginn ab heute in den nächsten 90 Tagen.';
  if (m.includes('portion or amount') || m.includes('unknown portion'))
    return 'Bitte die Mengen prüfen.';
  if (m.includes('consent')) return 'Ohne Einwilligung wird nichts zugewiesen.';
  if (m.includes('has ended')) return 'Die Beratung ist beendet.';
  if (m.includes('not allowed')) return 'Dafür fehlt gerade das Recht. Bitte die Seite neu laden.';
  return 'Nicht gespeichert.';
}

/** Eine Position aus dem Plan als Zeile mit „+“: die Menge, wie die Beratung sie vorschlägt. */
export function vorschlagsWahl(p: Planposition): Schnellwahl {
  return {
    food: p.food,
    amount: p.amount,
    portion_label: p.portion_label,
    portion_count: p.portion_count,
  };
}

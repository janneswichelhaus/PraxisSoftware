import { z } from 'zod';
import { leseZahl } from './eingabe';
import { je100Schema, portionSchema, suchschluessel, type Lebensmittel } from './lebensmittel';
import type { Startrezept } from './startrezepte';
import { FREIE_MENGE, kcal, type Mengenangabe } from './tagebuch';
import { zahl } from './texte';

/**
 * Rezepte aus Zutaten (ADR-027 Punkt 9) für Praxis und Plattform, ohne Datenzugriff. Gespeichert
 * werden Lebensmittel und Menge, die Werte rechnet der Server; die Vorschau rechnet nur mit (ANN-843).
 */

export const MAX_PORTIONEN = 20;
export const MAX_ZUTATEN = 40;
const MAX_ZUBEREITUNG = 4000;
const MAX_NAME = 120;
/** Eine Portion passt in einen Tagebucheintrag. */
const MAX_PORTION = 5000;

const zutatSchema = z.object({
  food_kind: z.enum(['catalog', 'practice', 'person']),
  food_id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  base_unit: z.enum(['g', 'ml']),
  amount: z.number(),
  portion_label: z.string().nullable(),
  portion_count: z.number().nullable(),
  per_100: je100Schema,
  energy_kcal: z.number(),
});

export const rezeptSchema = z.object({
  kind: z.literal('recipe'),
  id: z.string(),
  owner: z.enum(['practice', 'person']),
  name: z.string(),
  servings: z.number(),
  instructions: z.string().nullable(),
  base_unit: z.literal('g'),
  ingredients: z.array(zutatSchema),
  total_amount: z.number(),
  per_portion: z.object({
    energy_kcal: z.number(),
    protein_g: z.number(),
    fat_g: z.number(),
    carbohydrate_g: z.number(),
  }),
  per_100: je100Schema,
  portions: z.array(portionSchema),
  starter_key: z.string().nullable(),
  updated_at: z.string(),
});

export type Rezept = z.infer<typeof rezeptSchema>;
export type RezeptZutat = z.infer<typeof zutatSchema>;
export type JePortion = Rezept['per_portion'];

/** Was das Formular von einem Lebensmittel braucht - auch aus dem Stand einer Zutat. */
export type ZutatLebensmittel = Pick<
  Lebensmittel,
  'kind' | 'id' | 'name' | 'brand' | 'base_unit' | 'per_100' | 'portions'
>;

/** Eine Zutat im Formular: das Lebensmittel und seine Menge, wie `mengePruefen` sie liefert. */
export interface Zutat {
  lebensmittel: ZutatLebensmittel;
  angabe: Mengenangabe;
  /** In g bzw. ml, wie der Server sie aus der Angabe rechnet. */
  menge: number;
}

export interface RezeptWerte {
  name: string;
  portionen: string;
  zubereitung: string;
  zutaten: Zutat[];
}

export const REZEPT_FELDER = ['name', 'portionen', 'zutaten', 'zubereitung'] as const;
export type RezeptFeld = (typeof REZEPT_FELDER)[number];

export const REZEPT_BESCHRIFTUNG: Record<RezeptFeld, string> = {
  name: 'Name',
  portionen: 'Portionen',
  zutaten: 'Zutaten',
  zubereitung: 'Zubereitung',
};

type ZutatAngabe =
  | { food_kind: Lebensmittel['kind']; food_id: string; amount: number }
  | {
      food_kind: Lebensmittel['kind'];
      food_id: string;
      portion_label: string;
      portion_count: number;
    };

/** Was an den Server geht: Lebensmittel und Menge, keine Werte. */
export interface RezeptAngaben {
  name: string;
  servings: number;
  instructions: string | null;
  ingredients: ZutatAngabe[];
  /** Nur beim Übernehmen eines mitgelieferten Rezepts (ANN-844). */
  starter_key?: string;
}

export function leereRezeptWerte(): RezeptWerte {
  return { name: '', portionen: '2', zubereitung: '', zutaten: [] };
}

/**
 * Eine gespeicherte Zutat zurück ins Formular. Die Portion kennt nur ihren Stand: Ihre Größe ist
 * die Menge durch die Anzahl; gibt es sie beim Speichern nicht mehr, sagt es der Server.
 */
export function zutatAus(z: RezeptZutat): Zutat {
  const portion =
    z.portion_label !== null && z.portion_count !== null
      ? { label: z.portion_label, amount: Math.round((z.amount / z.portion_count) * 10) / 10 }
      : null;
  return {
    lebensmittel: {
      kind: z.food_kind,
      id: z.food_id,
      name: z.name,
      brand: z.brand,
      base_unit: z.base_unit,
      per_100: z.per_100,
      portions: portion ? [portion] : [],
    },
    angabe:
      portion && z.portion_count !== null
        ? { art: 'portion', label: portion.label, anzahl: z.portion_count }
        : { art: 'menge', menge: z.amount },
    menge: z.amount,
  };
}

export function rezeptWerteAus(r: Rezept): RezeptWerte {
  return {
    name: r.name,
    portionen: String(r.servings),
    zubereitung: r.instructions ?? '',
    zutaten: r.ingredients.map(zutatAus),
  };
}

/** Die Menge der Zutat, wie sie im Formular wieder vorbelegt wird. */
export function zutatAnfang(z: Zutat): { einheit: string; wert: string } {
  return z.angabe.art === 'portion'
    ? { einheit: z.angabe.label, wert: zahl(z.angabe.anzahl, z.angabe.anzahl % 1 === 0 ? 0 : 2) }
    : { einheit: FREIE_MENGE, wert: zahl(z.angabe.menge, z.angabe.menge % 1 === 0 ? 0 : 1) };
}

function leseGanzzahl(text: string): number | null {
  const sauber = text.trim();
  return /^\d+$/.test(sauber) ? Number(sauber) : null;
}

/** Prüft wie der Server; liefert die Angaben oder je Feld einen Satz. */
export function rezeptPruefen(
  w: RezeptWerte,
): { angaben: RezeptAngaben } | { fehler: Partial<Record<RezeptFeld, string>> } {
  const fehler: Partial<Record<RezeptFeld, string>> = {};
  const name = w.name.trim();
  if (name === '') fehler.name = 'Bitte einen Namen angeben.';
  else if (name.length > MAX_NAME) fehler.name = `Bitte höchstens ${MAX_NAME} Zeichen.`;
  const portionen = leseGanzzahl(w.portionen);
  if (portionen === null || portionen < 1 || portionen > MAX_PORTIONEN)
    fehler.portionen = `Bitte eine ganze Zahl von 1 bis ${MAX_PORTIONEN}.`;
  if (w.zutaten.length === 0) fehler.zutaten = 'Bitte mindestens eine Zutat hinzufügen.';
  else if (w.zutaten.length > MAX_ZUTATEN)
    fehler.zutaten = `Bitte höchstens ${MAX_ZUTATEN} Zutaten.`;
  else if (portionen !== null && gesamtmenge(w.zutaten) > MAX_PORTION * portionen)
    fehler.zutaten = 'Eine Portion wäre schwerer als 5 kg. Bitte die Mengen prüfen.';
  const zubereitung = w.zubereitung.trim();
  if (zubereitung.length > MAX_ZUBEREITUNG)
    fehler.zubereitung = `Bitte höchstens ${zahl(MAX_ZUBEREITUNG)} Zeichen.`;
  if (Object.keys(fehler).length > 0 || portionen === null) return { fehler };
  return {
    angaben: {
      name,
      servings: portionen,
      instructions: zubereitung === '' ? null : zubereitung,
      ingredients: w.zutaten.map(({ lebensmittel: f, angabe }) =>
        angabe.art === 'portion'
          ? {
              food_kind: f.kind,
              food_id: f.id,
              portion_label: angabe.label,
              portion_count: angabe.anzahl,
            }
          : { food_kind: f.kind, food_id: f.id, amount: angabe.menge },
      ),
    },
  };
}

export function gesamtmenge(zutaten: readonly Zutat[]): number {
  return zutaten.reduce((summe, z) => summe + z.menge, 0);
}

/** Die Vorschau je Portion, gerundet wie der Server; ohne gültige Portionen `null`. */
export function vorschauJePortion(zutaten: readonly Zutat[], portionen: string): JePortion | null {
  const n = leseZahl(portionen);
  if (zutaten.length === 0 || n === null || !Number.isInteger(n) || n < 1 || n > MAX_PORTIONEN)
    return null;
  const summe = (wert: (f: ZutatLebensmittel) => number) =>
    zutaten.reduce((s, z) => s + (wert(z.lebensmittel) * z.menge) / 100, 0);
  const eine = (x: number) => Math.round((x / n) * 10) / 10;
  return {
    energy_kcal: Math.round(summe((f) => f.per_100.energy_kcal) / n),
    protein_g: eine(summe((f) => f.per_100.protein_g)),
    fat_g: eine(summe((f) => f.per_100.fat_g)),
    carbohydrate_g: eine(summe((f) => f.per_100.carbohydrate_g)),
  };
}

export function portionenText(n: number): string {
  return n === 1 ? '1 Portion' : `${zahl(n)} Portionen`;
}

/** „2 Portionen · 311 kcal je Portion“; ohne Zahlen nur die Portionen. */
export function rezeptMeta(
  r: Pick<Rezept, 'servings' | 'per_portion'>,
  ohneZahlen = false,
): string {
  return [
    portionenText(r.servings),
    ohneZahlen ? null : `${kcal(r.per_portion.energy_kcal)} je Portion`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** „100 g“, „1 Stück (mittel) · 120 g“, „2 × 1 Esslöffel · 20 g“. */
export function zutatMenge(z: Zutat): string {
  const menge = `${zahl(z.menge, z.menge % 1 === 0 ? 0 : 1)} ${z.lebensmittel.base_unit}`;
  if (z.angabe.art === 'menge') return menge;
  const anzahl =
    z.angabe.anzahl === 1 ? '' : `${zahl(z.angabe.anzahl, z.angabe.anzahl % 1 === 0 ? 0 : 2)} × `;
  return `${anzahl}${z.angabe.label} · ${menge}`;
}

/** Ein Satz statt der Meldung des Servers (§13). */
export function rezeptfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('changed meanwhile'))
    return 'Das Rezept wurde inzwischen geändert. Bitte die Seite neu laden.';
  if (m.includes('already adopted')) return 'Dieses Rezept hat die Praxis schon übernommen.';
  if (m.includes('recipe not found')) return 'Dieses Rezept gibt es nicht mehr.';
  if (m.includes('food not found'))
    return 'Eine Zutat gibt es nicht mehr. Bitte die Zutaten prüfen und ersetzen.';
  if (m.includes('unknown portion') || m.includes('portion or amount'))
    return 'Bitte die Mengen der Zutaten prüfen.';
  if (m.includes('portion too large') || m.includes('recipe too large'))
    return 'Eine Portion wäre schwerer als 5 kg. Bitte die Mengen prüfen.';
  if (m.includes('too many')) return 'Es sind schon 200 eigene Rezepte gespeichert.';
  if (m.includes('consent') || m.includes('not allowed'))
    return 'Dafür fehlt gerade das Recht. Bitte die Seite neu laden.';
  return 'Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.';
}

/**
 * Ein mitgeliefertes Rezept als Formular (ANN-844): je Zutat der gleichnamige Treffer der Suche,
 * sonst der erste aus dem BLS, sonst der erste. Kennt er die Portion nicht, gilt die Menge.
 */
export async function startrezeptAufloesen(
  start: Startrezept,
  suchen: (begriff: string) => Promise<Lebensmittel[]>,
): Promise<{ werte: RezeptWerte; fehlt: string[] }> {
  const treffer = await Promise.all(start.zutaten.map((z) => suchen(z.suche)));
  const fehlt: string[] = [];
  const zutaten: Zutat[] = [];
  start.zutaten.forEach((z, i) => {
    const liste = treffer[i] ?? [];
    const f =
      liste.find((t) => suchschluessel(t.name) === suchschluessel(z.suche)) ??
      liste.find((t) => t.source === 'bls') ??
      liste[0];
    if (!f) {
      fehlt.push(z.suche);
      return;
    }
    const portion = z.portion ? f.portions.find((x) => x.label === z.portion!.label) : undefined;
    zutaten.push(
      portion && z.portion
        ? {
            lebensmittel: f,
            angabe: { art: 'portion', label: portion.label, anzahl: z.portion.anzahl },
            menge: Math.round(portion.amount * z.portion.anzahl * 10) / 10,
          }
        : { lebensmittel: f, angabe: { art: 'menge', menge: z.menge }, menge: z.menge },
    );
  });
  return {
    werte: {
      name: start.name,
      portionen: String(start.portionen),
      zubereitung: start.zubereitung,
      zutaten,
    },
    fehlt,
  };
}

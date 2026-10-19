import { z } from 'zod';
import { leseZahl } from './eingabe';
import { zahl } from './texte';

/**
 * Lebensmitteldaten (ERN-EPIC-002, ADR-027 Punkte 7 bis 9) - für Praxis und
 * Plattform.
 *
 * Gesucht wird am Server im eigenen Katalog (`app.food_search`); die
 * Anwendung fragt nie einen fremden Dienst. Eigene Lebensmittel der Person
 * kommen mit ihrem Profil und werden hier nur gefiltert. Ohne Datenzugriff:
 * die Wege der Praxis stehen in `lebensmittelApi.ts`, die der Plattform in
 * `features/platform/api.ts` (ADR-023 Punkt 26).
 */

const je100Schema = z.object({
  energy_kcal: z.number(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbohydrate_g: z.number(),
  sugar_g: z.number().nullable(),
  fibre_g: z.number().nullable(),
  saturated_fat_g: z.number().nullable(),
  salt_g: z.number().nullable(),
});

export const portionSchema = z.object({ label: z.string(), amount: z.number() });

export const lebensmittelSchema = z.object({
  kind: z.enum(['catalog', 'practice', 'person']).default('person'),
  id: z.string(),
  source: z.enum(['bls', 'off', 'practice', 'person']).default('person'),
  name: z.string(),
  brand: z.string().nullable(),
  base_unit: z.enum(['g', 'ml']),
  per_100: je100Schema,
  portions: z.array(portionSchema),
  updated_at: z.string().optional(),
});

export type Lebensmittel = z.infer<typeof lebensmittelSchema>;
export type Portion = z.infer<typeof portionSchema>;
export type Je100 = z.infer<typeof je100Schema>;

export const quelleSchema = z.object({
  source: z.enum(['bls', 'off']),
  title: z.string(),
  license: z.string(),
  license_url: z.string(),
  attribution: z.string(),
  source_url: z.string(),
  version: z.string().nullable(),
});

export type Quelle = z.infer<typeof quelleSchema>;

/** Wie die Zeile die Herkunft nennt. */
export const QUELLENNAME: Record<Lebensmittel['source'], string> = {
  bls: 'BLS',
  off: 'Open Food Facts',
  practice: 'Praxis',
  person: 'Eigenes',
};

/** Ab so vielen Zeichen fragt die Suche den Server (wie `app.food_search`). */
export const MINDESTLAENGE = 2;

const UMLAUTE = new Map(
  [...'äöüàáâãåèéêëìíîïòóôõùúûçñ'].map((z, i) => [z, 'aouaaaaaeeeeiiiioooouuucn'.charAt(i)]),
);

/**
 * Wie `app.food_search_key` am Server: Kleinbuchstaben, Umlaute ohne Punkte,
 * ae/oe/ue wie der Umlaut, ß als ss, Satzzeichen als Leerzeichen.
 */
export function suchschluessel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüàáâãåèéêëìíîïòóôõùúûçñ]/g, (z) => UMLAUTE.get(z) ?? z)
    .replace(/ß/g, 'ss')
    .replace(/([aou])e/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Eigene Lebensmittel, deren Name und Marke jedes Wort des Begriffs enthalten. */
export function eigeneFiltern(eigene: readonly Lebensmittel[], begriff: string): Lebensmittel[] {
  const woerter = suchschluessel(begriff).split(' ').filter(Boolean);
  if (woerter.length === 0) return [...eigene];
  return eigene.filter((f) => {
    const schluessel = suchschluessel(`${f.name} ${f.brand ?? ''}`);
    return woerter.every((w) => schluessel.includes(w));
  });
}

/** „100 g“ bzw. „100 ml“. */
export function bezug(einheit: Lebensmittel['base_unit']): string {
  return `100 ${einheit}`;
}

/** „54 kcal je 100 g“. */
export function energieJe100(f: Lebensmittel): string {
  return `${zahl(f.per_100.energy_kcal)} kcal je ${bezug(f.base_unit)}`;
}

/** Nebenzeile einer Trefferzeile: Marke, Energie, Herkunft. */
export function trefferMeta(f: Lebensmittel): string {
  return [f.brand, energieJe100(f), QUELLENNAME[f.source]].filter(Boolean).join(' · ');
}

/** Gramm mit einer Stelle, Salz mit zwei; leer heißt unbekannt. */
export function gramm(wert: number | null, stellen = 1): string {
  return wert === null ? 'keine Angabe' : `${zahl(wert, stellen)} g`;
}

/** Energie einer Menge in der Grundeinheit, gerundet auf ganze kcal. */
export function energieFuer(f: Lebensmittel, menge: number): number {
  return Math.round((f.per_100.energy_kcal * menge) / 100);
}

/** „1 Stück (mittel) · 150 g“. */
export function portionText(p: Portion, einheit: Lebensmittel['base_unit']): string {
  return `${p.label} · ${zahl(p.amount, Number.isInteger(p.amount) ? 0 : 1)} ${einheit}`;
}

// -----------------------------------------------------------------------------
// Eingabe eines eigenen Lebensmittels (Praxis und Plattform)
// -----------------------------------------------------------------------------

export const LEBENSMITTEL_FELDER = [
  'name',
  'brand',
  'energy_kcal',
  'protein_g',
  'fat_g',
  'carbohydrate_g',
  'sugar_g',
  'fibre_g',
  'saturated_fat_g',
  'salt_g',
  'portion_label',
  'portion_amount',
] as const;

export type LebensmittelFeld = (typeof LEBENSMITTEL_FELDER)[number];

export type LebensmittelWerte = Record<LebensmittelFeld, string> & {
  base_unit: Lebensmittel['base_unit'];
};

export const LEBENSMITTEL_BESCHRIFTUNG: Record<LebensmittelFeld, string> = {
  name: 'Name',
  brand: 'Marke (freiwillig)',
  energy_kcal: 'Energie (kcal)',
  protein_g: 'Eiweiß (g)',
  fat_g: 'Fett (g)',
  carbohydrate_g: 'Kohlenhydrate (g)',
  sugar_g: 'davon Zucker (g)',
  fibre_g: 'Ballaststoffe (g)',
  saturated_fat_g: 'davon gesättigte Fettsäuren (g)',
  salt_g: 'Salz (g)',
  portion_label: 'Portion',
  portion_amount: 'Menge der Portion',
};

/** Was der Server unter `p_food` erwartet. */
export interface LebensmittelAngaben {
  name: string;
  brand: string | null;
  base_unit: Lebensmittel['base_unit'];
  energy_kcal: number;
  protein_g: number;
  fat_g: number;
  carbohydrate_g: number;
  sugar_g: number | null;
  fibre_g: number | null;
  saturated_fat_g: number | null;
  salt_g: number | null;
  portions: Portion[];
}

export function leereLebensmittelWerte(): LebensmittelWerte {
  return {
    name: '',
    brand: '',
    base_unit: 'g',
    energy_kcal: '',
    protein_g: '',
    fat_g: '',
    carbohydrate_g: '',
    sugar_g: '',
    fibre_g: '',
    saturated_fat_g: '',
    salt_g: '',
    portion_label: '',
    portion_amount: '',
  };
}

/** Ein Wert fürs Feld: „54“, „0,3“, „12,25“ - ohne Nullen am Ende. */
export function feldtext(wert: number | null): string {
  if (wert === null) return '';
  if (Number.isInteger(wert)) return zahl(wert);
  return zahl(wert, 2).replace(/0+$/, '').replace(/,$/, '');
}

export function lebensmittelWerteAus(f: Lebensmittel): LebensmittelWerte {
  const portion = f.portions[0];
  return {
    name: f.name,
    brand: f.brand ?? '',
    base_unit: f.base_unit,
    energy_kcal: feldtext(f.per_100.energy_kcal),
    protein_g: feldtext(f.per_100.protein_g),
    fat_g: feldtext(f.per_100.fat_g),
    carbohydrate_g: feldtext(f.per_100.carbohydrate_g),
    sugar_g: feldtext(f.per_100.sugar_g),
    fibre_g: feldtext(f.per_100.fibre_g),
    saturated_fat_g: feldtext(f.per_100.saturated_fat_g),
    salt_g: feldtext(f.per_100.salt_g),
    portion_label: portion?.label ?? '',
    portion_amount: portion ? feldtext(portion.amount) : '',
  };
}

const PFLICHT = ['energy_kcal', 'protein_g', 'fat_g', 'carbohydrate_g'] as const;
const FREI = ['sugar_g', 'fibre_g', 'saturated_fat_g', 'salt_g'] as const;

/**
 * Prüft die Eingaben wie der Server (`custom_foods`): Name, die vier
 * Pflichtwerte, Grenzen je 100 g bzw. ml; eine Portion nur ganz oder gar
 * nicht. Liefert die Angaben oder die Fehler je Feld.
 */
export function lebensmittelPruefen(
  w: LebensmittelWerte,
): { angaben: LebensmittelAngaben } | { fehler: Partial<Record<LebensmittelFeld, string>> } {
  const fehler: Partial<Record<LebensmittelFeld, string>> = {};
  const name = w.name.trim();
  if (name === '') fehler.name = 'Bitte einen Namen angeben.';
  else if (name.length > 120) fehler.name = 'Höchstens 120 Zeichen.';
  if (w.brand.trim().length > 80) fehler.brand = 'Höchstens 80 Zeichen.';

  const werte = new Map<LebensmittelFeld, number | null>();
  for (const feld of [...PFLICHT, ...FREI]) {
    const roh = w[feld];
    const n = leseZahl(roh);
    const pflicht = (PFLICHT as readonly string[]).includes(feld);
    if (roh.trim() === '') {
      if (pflicht) fehler[feld] = 'Bitte von der Verpackung übernehmen.';
      werte.set(feld, null);
      continue;
    }
    const grenze = feld === 'energy_kcal' ? 950 : 100;
    if (n === null || n < 0 || n > grenze) {
      fehler[feld] = `Bitte eine Zahl von 0 bis ${grenze} angeben.`;
      continue;
    }
    werte.set(feld, n);
  }
  const summe =
    (werte.get('protein_g') ?? 0) + (werte.get('fat_g') ?? 0) + (werte.get('carbohydrate_g') ?? 0);
  if (!fehler.carbohydrate_g && summe > 105) {
    fehler.carbohydrate_g = `Eiweiß, Fett und Kohlenhydrate ergeben zusammen mehr als ${bezug(w.base_unit)}.`;
  }

  const portionen: Portion[] = [];
  const label = w.portion_label.trim();
  const menge = leseZahl(w.portion_amount);
  if (label !== '' || w.portion_amount.trim() !== '') {
    if (label === '') fehler.portion_label = 'Bitte die Portion benennen, etwa „1 Riegel“.';
    else if (label.length > 60) fehler.portion_label = 'Höchstens 60 Zeichen.';
    if (menge === null || menge <= 0 || menge > 5000)
      fehler.portion_amount = `Bitte die Menge in ${w.base_unit} angeben.`;
    if (!fehler.portion_label && !fehler.portion_amount) portionen.push({ label, amount: menge! });
  }

  if (Object.keys(fehler).length > 0) return { fehler };
  return {
    angaben: {
      name,
      brand: w.brand.trim() === '' ? null : w.brand.trim(),
      base_unit: w.base_unit,
      energy_kcal: werte.get('energy_kcal')!,
      protein_g: werte.get('protein_g')!,
      fat_g: werte.get('fat_g')!,
      carbohydrate_g: werte.get('carbohydrate_g')!,
      sugar_g: werte.get('sugar_g') ?? null,
      fibre_g: werte.get('fibre_g') ?? null,
      saturated_fat_g: werte.get('saturated_fat_g') ?? null,
      salt_g: werte.get('salt_g') ?? null,
      portions: portionen,
    },
  };
}

/** Verständliche Sätze statt der Meldung des Servers (§13). */
export function lebensmittelfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('changed meanwhile'))
    return 'Das Lebensmittel wurde inzwischen geändert. Bitte neu laden.';
  if (m.includes('not found')) return 'Das Lebensmittel gibt es nicht mehr.';
  if (m.includes('too many')) return 'Es sind schon 500 eigene Lebensmittel angelegt.';
  if (m.includes('consent') || m.includes('not allowed'))
    return 'Dieser Zugang darf das gerade nicht.';
  if (m.includes('check constraint') || m.includes('violates') || m.includes('required'))
    return 'Bitte die Angaben prüfen.';
  return 'Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.';
}

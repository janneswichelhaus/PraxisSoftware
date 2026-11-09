import { describe, expect, it } from 'vitest';
import type { Lebensmittel } from './lebensmittel';
import {
  leereRezeptWerte,
  rezeptfehler,
  rezeptMeta,
  rezeptPruefen,
  vorschauJePortion,
  zutatAus,
  zutatMenge,
  type RezeptWerte,
  type Zutat,
} from './rezepte';

// Synthetische Werte wie im Seed; die Erwartungen rechnet supabase/tests/nutrition-recipes.test.ts
// am Server nach - die Vorschau muss dasselbe zeigen.
function essen(
  name: string,
  per: [number, number, number, number],
  zusatz: Partial<Lebensmittel> = {},
): Lebensmittel {
  return {
    kind: 'catalog',
    id: `id-${name}`,
    source: 'bls',
    name,
    brand: null,
    base_unit: 'g',
    per_100: {
      energy_kcal: per[0],
      protein_g: per[1],
      fat_g: per[2],
      carbohydrate_g: per[3],
      sugar_g: null,
      fibre_g: null,
      saturated_fat_g: null,
      salt_g: null,
    },
    portions: [],
    ...zusatz,
  };
}

const HAFER = essen('Haferflocken', [370, 13.5, 7, 58.7]);
const MILCH = essen('Milch 1,5 % Fett', [47, 3.4, 1.5, 4.8], { base_unit: 'ml' });
const BANANE = essen('Banane roh', [93, 1.1, 0.2, 21], {
  portions: [{ label: '1 Stück (mittel)', amount: 120 }],
});

const ZUTATEN: Zutat[] = [
  { lebensmittel: HAFER, angabe: { art: 'menge', menge: 100 }, menge: 100 },
  { lebensmittel: MILCH, angabe: { art: 'menge', menge: 300 }, menge: 300 },
  {
    lebensmittel: BANANE,
    angabe: { art: 'portion', label: '1 Stück (mittel)', anzahl: 1 },
    menge: 120,
  },
];

function werte(zusatz: Partial<RezeptWerte> = {}): RezeptWerte {
  return { ...leereRezeptWerte(), name: 'Haferbrei mit Banane', zutaten: ZUTATEN, ...zusatz };
}

describe('Rezepte (ERN-016)', () => {
  it('zeigt je Portion, was der Server rechnet', () => {
    expect(vorschauJePortion(ZUTATEN, '2')).toEqual({
      energy_kcal: 311,
      protein_g: 12.5,
      fat_g: 5.9,
      carbohydrate_g: 49.2,
    });
    expect(vorschauJePortion(ZUTATEN, '1')!.energy_kcal).toBe(623);
    expect(vorschauJePortion(ZUTATEN, '0')).toBeNull();
    expect(vorschauJePortion([], '2')).toBeNull();
  });

  it('schickt Lebensmittel und Menge, nie Werte', () => {
    const ergebnis = rezeptPruefen(werte({ zubereitung: '  Aufkochen.  ' }));
    expect(ergebnis).toEqual({
      angaben: {
        name: 'Haferbrei mit Banane',
        servings: 2,
        instructions: 'Aufkochen.',
        ingredients: [
          { food_kind: 'catalog', food_id: 'id-Haferflocken', amount: 100 },
          { food_kind: 'catalog', food_id: 'id-Milch 1,5 % Fett', amount: 300 },
          {
            food_kind: 'catalog',
            food_id: 'id-Banane roh',
            portion_label: '1 Stück (mittel)',
            portion_count: 1,
          },
        ],
      },
    });
    expect(JSON.stringify(ergebnis)).not.toContain('energy');
  });

  it('prüft Name, Portionen, Zutaten und Zubereitung wie der Server', () => {
    const fehler = (w: Partial<RezeptWerte>) => {
      const e = rezeptPruefen(werte(w));
      return 'fehler' in e ? e.fehler : {};
    };
    expect(fehler({ name: ' ' })).toHaveProperty('name');
    expect(fehler({ name: 'x'.repeat(121) })).toHaveProperty('name');
    expect(fehler({ portionen: '0' })).toHaveProperty('portionen');
    expect(fehler({ portionen: '2,5' })).toHaveProperty('portionen');
    expect(fehler({ portionen: '21' })).toHaveProperty('portionen');
    expect(fehler({ zutaten: [] })).toHaveProperty('zutaten');
    expect(fehler({ zubereitung: 'x'.repeat(4001) })).toHaveProperty('zubereitung');
    expect(
      fehler({
        portionen: '1',
        zutaten: [{ lebensmittel: MILCH, angabe: { art: 'menge', menge: 5001 }, menge: 5001 }],
      }),
    ).toHaveProperty('zutaten');
  });

  it('holt eine gespeicherte Zutat zurück, die Portion aus ihrem Stand', () => {
    const z = zutatAus({
      food_kind: 'catalog',
      food_id: 'b',
      name: 'Banane roh',
      brand: null,
      base_unit: 'g',
      amount: 240,
      portion_label: '1 Stück (mittel)',
      portion_count: 2,
      per_100: BANANE.per_100,
      energy_kcal: 223,
    });
    expect(z.lebensmittel.portions).toEqual([{ label: '1 Stück (mittel)', amount: 120 }]);
    expect(z.angabe).toEqual({ art: 'portion', label: '1 Stück (mittel)', anzahl: 2 });
    expect(zutatMenge(z)).toBe('2 × 1 Stück (mittel) · 240 g');
    expect(zutatMenge(ZUTATEN[1]!)).toBe('300 ml');
  });

  it('nennt Portionen und Energie, ohne Zahlen nur die Portionen', () => {
    const r = {
      servings: 2,
      per_portion: { energy_kcal: 311, protein_g: 0, fat_g: 0, carbohydrate_g: 0 },
    };
    expect(rezeptMeta(r)).toBe('2 Portionen · 311 kcal je Portion');
    expect(rezeptMeta({ ...r, servings: 1 }, true)).toBe('1 Portion');
  });

  it('übersetzt die Meldungen des Servers in Sätze', () => {
    expect(rezeptfehler('recipe changed meanwhile')).toMatch(/inzwischen geändert/);
    expect(rezeptfehler('food not found')).toMatch(/Zutat gibt es nicht mehr/);
    expect(rezeptfehler('recipe already adopted')).toMatch(/schon übernommen/);
    expect(rezeptfehler(undefined)).toBe('Nicht gespeichert.');
  });
});

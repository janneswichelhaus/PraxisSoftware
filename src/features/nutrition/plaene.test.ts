import { describe, expect, it } from 'vitest';
import type { Lebensmittel } from './lebensmittel';
import {
  entwurfAus,
  leererPlan,
  leererTag,
  geltenderPlan,
  offenerPlan,
  planfehler,
  planPruefen,
  planTag,
  positionMeta,
  tagesEnergie,
  type Plan,
  type Planentwurf,
} from './plaene';

function essen(
  kind: Lebensmittel['kind'],
  name: string,
  portionen: Lebensmittel['portions'] = [],
): Lebensmittel {
  return {
    kind,
    id: `id-${name}`,
    source: kind === 'recipe' ? 'recipe' : 'bls',
    name,
    brand: null,
    base_unit: 'g',
    per_100: {
      energy_kcal: 200,
      protein_g: 5,
      fat_g: 5,
      carbohydrate_g: 30,
      sugar_g: null,
      fibre_g: null,
      saturated_fat_g: null,
      salt_g: null,
    },
    portions: portionen,
  };
}

const BREI = essen('recipe', 'Haferbrei', [{ label: '1 Portion', amount: 300 }]);
const APFEL = essen('catalog', 'Apfel roh', [{ label: '1 Stück (mittel)', amount: 150 }]);

function entwurf(): Planentwurf {
  const tag = leererTag();
  tag.breakfast = [
    { lebensmittel: BREI, angabe: { art: 'portion', label: '1 Portion', anzahl: 1 }, menge: 300 },
  ];
  tag.snack = [
    {
      lebensmittel: APFEL,
      angabe: { art: 'portion', label: '1 Stück (mittel)', anzahl: 1 },
      menge: 150,
    },
    { lebensmittel: APFEL, angabe: { art: 'menge', menge: 80 }, menge: 80 },
  ];
  return { titel: ' Tagesvorschlag ', tage: [tag, leererTag()] };
}

describe('Pläne (ADR-027 Punkt 14)', () => {
  it('schickt je Tag die Mahlzeiten mit Lebensmittel und Menge, nie Werte', () => {
    expect(planPruefen(entwurf())).toEqual({
      angaben: {
        title: 'Tagesvorschlag',
        days: [
          {
            breakfast: [{ kind: 'recipe', id: 'id-Haferbrei', portion_count: 1 }],
            snack: [
              {
                kind: 'catalog',
                id: 'id-Apfel roh',
                portion_label: '1 Stück (mittel)',
                portion_count: 1,
              },
              { kind: 'catalog', id: 'id-Apfel roh', amount: 80 },
            ],
          },
          {},
        ],
      },
    });
  });

  it('prüft Titel, Tage und dass etwas darin steht', () => {
    const fehler = (e: Planentwurf) => {
      const r = planPruefen(e);
      return 'fehler' in r ? r.fehler : {};
    };
    expect(fehler({ ...entwurf(), titel: '' })).toHaveProperty('titel');
    expect(fehler(leererPlan('Leer'))).toHaveProperty('tage');
    expect(
      fehler({ ...entwurf(), tage: Array.from({ length: 8 }, () => entwurf().tage[0]!) }),
    ).toHaveProperty('tage');
  });

  it('rechnet die Energie des Tags aus den Positionen', () => {
    // 300 g Brei und 230 g Apfel zu je 200 kcal je 100 g.
    expect(tagesEnergie(entwurf().tage[0]!)).toBe(1060);
  });

  it('nimmt einen gespeicherten Plan zurück ins Formular', () => {
    const plan: Pick<Plan, 'title' | 'days'> = {
      title: 'Woche',
      days: [
        {
          day: 1,
          meals: [
            {
              meal: 'lunch',
              items: [
                {
                  kind: 'catalog',
                  id: 'id-Apfel roh',
                  name: 'Apfel roh',
                  amount: 300,
                  portion_label: '1 Stück (mittel)',
                  portion_count: 2,
                  energy_kcal: 600,
                  food: APFEL,
                },
              ],
            },
          ],
        },
      ],
    };
    const e = entwurfAus(plan);
    expect(e.tage).toHaveLength(1);
    expect(e.tage[0]!.lunch[0]).toEqual({
      lebensmittel: APFEL,
      angabe: { art: 'portion', label: '1 Stück (mittel)', anzahl: 2 },
      menge: 300,
    });
    expect(e.tage[0]!.breakfast).toEqual([]);
  });

  it('wechselt die Tage ab dem Beginn wie der Server', () => {
    const plan = { starts_on: '2026-11-02', day_count: 7 };
    expect(planTag(plan, '2026-11-01')).toBeNull();
    expect(planTag(plan, '2026-11-02')).toBe(1);
    expect(planTag(plan, '2026-11-08')).toBe(7);
    expect(planTag(plan, '2026-11-09')).toBe(1);
    expect(planTag({ starts_on: '2026-11-02', day_count: 1 }, '2026-11-20')).toBe(1);
  });

  it('nennt den offenen Plan, Menge und Energie einer Position', () => {
    const offen = { starts_on: '2026-11-01', ended_on: null } as Plan;
    const vorbei = { starts_on: '2026-10-01', ended_on: '2026-10-31' } as Plan;
    expect(offenerPlan([vorbei, offen])).toBe(offen);
    expect(offenerPlan([vorbei])).toBeUndefined();
    // Beginnt ein neuer erst später, gilt bis dahin der alte (ANN-845).
    const alt = { starts_on: '2026-11-01', ended_on: '2026-11-09' } as Plan;
    const neu = { starts_on: '2026-11-10', ended_on: null } as Plan;
    expect(geltenderPlan([neu, alt], '2026-11-06')).toBe(alt);
    expect(geltenderPlan([neu, alt], '2026-11-10')).toBe(neu);
    expect(geltenderPlan([neu], '2026-11-06')).toBe(neu);
    expect(geltenderPlan([vorbei], '2026-11-06')).toBeUndefined();
    const p = {
      kind: 'recipe' as const,
      amount: 600,
      portion_label: '1 Portion',
      portion_count: 2,
      energy_kcal: 1200,
      food: { base_unit: 'g' as const },
    };
    expect(positionMeta(p)).toBe('2 × 1 Portion · 1200 kcal');
    expect(
      positionMeta({ ...p, portion_label: null, portion_count: null, amount: 250 }, true),
    ).toBe('250 g');
    expect(planfehler('plan changed meanwhile')).toMatch(/inzwischen geändert/);
    expect(planfehler('start outside the next 90 days')).toMatch(/90 Tagen/);
  });
});

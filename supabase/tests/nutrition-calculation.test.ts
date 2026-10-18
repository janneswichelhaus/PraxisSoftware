import { beforeAll, describe, expect, it } from 'vitest';
import { asPostgres, resetDatabase } from './helpers/db';

/**
 * Die Rechnung der Zielwerte (ERN-001, ADR-027 Punkte 16 bis 22, ADR-006
 * Punkt 14) - die eine Stelle `app.nutrition_calculation`.
 *
 * Grundumsätze gegen veröffentlichte Rechenbeispiele:
 *   * Mifflin-St Jeor, Mann 80 kg, 180 cm, 35 Jahre: 800 + 1125 − 175 + 5 =
 *     1755 kcal (tdeecalculator.it.com/mifflin-st-jeor).
 *   * Mifflin-St Jeor, Frau 70 kg, 160 cm, 50 Jahre: 700 + 1000 − 250 − 161 =
 *     1289 kcal ("BMR Calculator: Step-by-Step Formula With Worked
 *     Examples", order.spot.ai).
 *   * Harris-Benedict revidiert (Roza und Shizgal 1984), Frau 65 kg, 163 cm,
 *     32 Jahre: rund 1415 kcal (calcfyi.com/formula/harris-benedict-female).
 *   * Cunningham, 75 kg mit 28 % Körperfett: magere Masse 54 kg,
 *     500 + 22 × 54 = 1688 kcal (Nutrium, "Cunningham equation").
 *   * Katch-McArdle, 80 kg mit 20 % Körperfett: magere Masse 64 kg,
 *     370 + 21,6 × 64 ≈ 1752 kcal (tdeecalculator.it.com/katch-mcardle).
 * Die übrigen Regeln (PAL, Energieziel, Makros, Wasser, Zielgewicht) sind
 * die Zahlen aus ADR-027 Abschnitt E.
 */

type Rechnung = {
  status: string;
  missing?: string[];
  bmr: {
    formula: string;
    kcal: number;
    averaged: boolean;
    lean_mass_kg: number | null;
    variants: { sex: string | null; kcal: number; constant: number }[];
  };
  tee: { pal: number; kcal: number };
  energy: {
    rule: string;
    change_kcal: number;
    floor_applied: boolean;
    computed_kcal: number;
    kcal: number;
    overridden: boolean;
    below_bmr: boolean;
  };
  protein: { g_per_kg: number; basis: string; computed_g: number; g: number; overridden: boolean };
  fat: { share: number; computed_g: number; g: number; overridden: boolean };
  carbohydrate: { computed_g: number; g: number; overridden: boolean };
  water: { computed_ml: number; ml: number; floor_applied: boolean; overridden: boolean };
  target_weight: {
    kg: number | null;
    floor_kg: number;
    below_floor: boolean;
    weeks: number | null;
  };
};

interface Eingaben {
  gewicht?: number | null;
  groesse?: number | null;
  alter?: number | null;
  geschlecht?: 'female' | 'male' | 'unspecified';
  koerperfett?: number | null;
  pal?: number;
  ziel?: 'lose' | 'maintain' | 'build_muscle' | 'gain';
  formel?: 'standard' | 'katch_mcardle' | 'harris_benedict_revised';
  training?: boolean;
  ueberschrieben?: Record<string, number>;
  zielgewicht?: number | null;
}

async function rechnen(e: Eingaben): Promise<Rechnung> {
  const { rows } = await asPostgres<{ r: Rechnung }>(
    `select app.nutrition_calculation($1::numeric, $2::numeric, $3::integer, $4, $5::numeric,
              $6::numeric, $7, $8, $9, $10::jsonb, $11::numeric) as r`,
    [
      e.gewicht === undefined ? 80 : e.gewicht,
      e.groesse === undefined ? 180 : e.groesse,
      e.alter === undefined ? 35 : e.alter,
      e.geschlecht ?? 'male',
      e.koerperfett ?? null,
      e.pal ?? 1.4,
      e.ziel ?? 'maintain',
      e.formel ?? 'standard',
      e.training ?? false,
      JSON.stringify(e.ueberschrieben ?? {}),
      e.zielgewicht ?? null,
    ],
  );
  return rows[0]!.r;
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

describe('Zielwerte aus offengelegten Formeln (ERN-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('Grundumsatz nach veröffentlichten Rechenbeispielen', async () => {
    const mifflinMann = await rechnen({ gewicht: 80, groesse: 180, alter: 35, geschlecht: 'male' });
    expect(mifflinMann.bmr).toMatchObject({ formula: 'mifflin_st_jeor', kcal: 1755 });
    const mifflinFrau = await rechnen({
      gewicht: 70,
      groesse: 160,
      alter: 50,
      geschlecht: 'female',
    });
    expect(mifflinFrau.bmr).toMatchObject({ formula: 'mifflin_st_jeor', kcal: 1289 });
    const harrisBenedict = await rechnen({
      gewicht: 65,
      groesse: 163,
      alter: 32,
      geschlecht: 'female',
      formel: 'harris_benedict_revised',
    });
    expect(harrisBenedict.bmr).toMatchObject({ formula: 'harris_benedict_revised', kcal: 1415 });
    // Mit Körperfettanteil rechnet der Standard nach Cunningham (Punkt 16).
    const cunningham = await rechnen({ gewicht: 75, koerperfett: 28 });
    expect(cunningham.bmr).toMatchObject({ formula: 'cunningham', lean_mass_kg: 54, kcal: 1688 });
    const katch = await rechnen({ gewicht: 80, koerperfett: 20, formel: 'katch_mcardle' });
    expect(katch.bmr).toMatchObject({ formula: 'katch_mcardle', lean_mass_kg: 64, kcal: 1752 });
  });

  it('ohne Angabe des Geschlechts das Mittel beider Varianten, sichtbar vermerkt', async () => {
    const r = await rechnen({ gewicht: 80, groesse: 180, alter: 35, geschlecht: 'unspecified' });
    // Mann 1755, Frau 1589: Mittel 1672.
    expect(r.bmr.averaged).toBe(true);
    expect(r.bmr.variants.map((v) => [v.sex, v.kcal])).toEqual([
      ['male', 1755],
      ['female', 1589],
    ]);
    expect(r.bmr.kcal).toBe(1672);
    // Cunningham braucht kein Geschlecht und mittelt nichts.
    expect((await rechnen({ koerperfett: 20, geschlecht: 'unspecified' })).bmr.averaged).toBe(
      false,
    );
  });

  it('Gesamtumsatz = Grundumsatz × PAL in den Stufen der DGE (Punkt 17)', async () => {
    for (const [pal, kcal] of [
      [1.4, 2457],
      [1.6, 2808],
      [1.8, 3159],
      [2.0, 3510],
    ] as const) {
      expect((await rechnen({ pal })).tee).toEqual({ pal, kcal });
    }
    expect(await fehler(rechnen({ pal: 1.5 }))).toBe('22023');
  });

  it('Energieziel: halten, −500 höchstens −20 %, +300, nie unter dem Grundumsatz (Punkt 18)', async () => {
    expect((await rechnen({ pal: 1.6, ziel: 'maintain' })).energy).toMatchObject({
      rule: 'maintain',
      kcal: 2808,
    });
    expect((await rechnen({ pal: 1.6, ziel: 'lose' })).energy).toMatchObject({
      rule: 'deficit',
      change_kcal: -500,
      kcal: 2308,
      floor_applied: false,
    });
    expect((await rechnen({ pal: 1.6, ziel: 'build_muscle' })).energy.kcal).toBe(3108);
    expect((await rechnen({ pal: 1.6, ziel: 'gain' })).energy.kcal).toBe(3108);
    // Kleiner Gesamtumsatz: 20 % sind weniger als 500 kcal.
    const klein = await rechnen({
      gewicht: 45,
      groesse: 150,
      alter: 80,
      geschlecht: 'female',
      ziel: 'lose',
    });
    // Grundumsatz 450 + 937,5 − 400 − 161 = 826,5 → 827; × 1,4 = 1158.
    expect(klein.bmr.kcal).toBe(827);
    expect(klein.tee.kcal).toBe(1158);
    // 20 % von 1158 = 232 - und 1158 − 232 = 926 liegt über dem Grundumsatz.
    expect(klein.energy).toMatchObject({
      rule: 'deficit_capped',
      change_kcal: -232,
      kcal: 926,
      floor_applied: false,
    });
  });

  it('die Untergrenze Grundumsatz greift für die Rechnung, nicht für die Beratung (Punkt 22)', async () => {
    // Die Rechnung selbst kommt mit PAL ≥ 1,4 und höchstens 20 % nie unter
    // den Grundumsatz; die Überschreibung schon - gekennzeichnet.
    const r = await rechnen({ ziel: 'lose', ueberschrieben: { energy_kcal: 1200 } });
    expect(r.bmr.kcal).toBe(1755);
    // PAL 1,4: 2457 kcal, 20 % davon 491 - weniger als 500.
    expect(r.energy).toMatchObject({
      rule: 'deficit_capped',
      computed_kcal: 1966,
      kcal: 1200,
      overridden: true,
      below_bmr: true,
      floor_applied: false,
    });
  });

  it('Eiweiß 0,8 g/kg, ab 65 Jahren 1,0, bei Muskelaufbau oder im Training 1,6 (Punkt 19)', async () => {
    expect((await rechnen({})).protein).toMatchObject({
      g_per_kg: 0.8,
      basis: 'standard',
      g: 64,
    });
    expect((await rechnen({ alter: 65 })).protein).toMatchObject({
      g_per_kg: 1.0,
      basis: 'from_65',
      g: 80,
    });
    expect((await rechnen({ ziel: 'build_muscle' })).protein).toMatchObject({
      g_per_kg: 1.6,
      basis: 'muscle_or_training',
      g: 128,
    });
    expect((await rechnen({ training: true, alter: 70 })).protein).toMatchObject({
      g_per_kg: 1.6,
      basis: 'muscle_or_training',
    });
    // Die Beratung bis 2,0 g: als Überschreibung.
    expect(
      (await rechnen({ ziel: 'build_muscle', ueberschrieben: { protein_g: 160 } })).protein,
    ).toMatchObject({ computed_g: 128, g: 160, overridden: true });
  });

  it('Fett 30 % der Energie, Kohlenhydrate der Rest - auch aus einem überschriebenen Energieziel', async () => {
    const r = await rechnen({ pal: 1.6, ziel: 'lose' });
    // 2308 kcal: Fett 2308 × 0,3 / 9 = 76,9 → 77 g; Eiweiß 64 g;
    // Kohlenhydrate (2308 − 256 − 693) / 4 = 339,75 → 340 g.
    expect(r.fat).toMatchObject({ share: 0.3, g: 77 });
    expect(r.carbohydrate.g).toBe(340);
    const ueber = await rechnen({ pal: 1.6, ziel: 'lose', ueberschrieben: { energy_kcal: 2000 } });
    // 2000 kcal: Fett 66,7 → 67 g; Kohlenhydrate (2000 − 256 − 603) / 4 = 285,25 → 285 g.
    expect(ueber.fat).toMatchObject({ computed_g: 77, g: 67, overridden: false });
    expect(ueber.carbohydrate).toMatchObject({ computed_g: 340, g: 285, overridden: false });
    // Überschriebene Kohlenhydrate bleiben, wie die Beratung sie setzt.
    expect((await rechnen({ ueberschrieben: { carbohydrate_g: 150 } })).carbohydrate).toMatchObject(
      { g: 150, overridden: true },
    );
  });

  it('Wasser 35 ml je kg, mindestens 1,5 l (Punkt 20)', async () => {
    expect((await rechnen({ gewicht: 80 })).water).toMatchObject({
      ml: 2800,
      floor_applied: false,
    });
    expect((await rechnen({ gewicht: 72.3 })).water.ml).toBe(2530);
    expect((await rechnen({ gewicht: 40, groesse: 150 })).water).toMatchObject({
      ml: 1500,
      floor_applied: true,
    });
  });

  it('Zielgewicht nicht unter BMI 18,5; Zeit bis zum Ziel nur aus dem Energieziel (Punkt 21)', async () => {
    // 180 cm: 18,5 × 1,8² = 59,94 → 60,0 kg.
    const r = await rechnen({ pal: 1.6, ziel: 'lose', zielgewicht: 75 });
    expect(r.target_weight).toMatchObject({ floor_kg: 60, below_floor: false, weeks: 10 });
    expect((await rechnen({ zielgewicht: 58 })).target_weight).toMatchObject({
      below_floor: true,
      // Halten bewegt nichts: keine Zeit bis zum Ziel.
      weeks: null,
    });
    // Ein Ziel gegen die Richtung des Energieziels bekommt keine Zeit.
    expect((await rechnen({ ziel: 'gain', zielgewicht: 70 })).target_weight.weeks).toBeNull();
    const { rows } = await asPostgres<{ unten: string }>(
      'select app.nutrition_target_weight_floor(165)::text as unten',
    );
    // 18,5 × 1,65² = 50,37 → 50,4 kg.
    expect(rows[0]!.unten).toBe('50.4');
  });

  it('fehlt eine Eingabe, rechnet sie nichts; unbekannte Werte sind ein Fehler', async () => {
    expect(await rechnen({ gewicht: null, alter: null })).toEqual({
      status: 'missing',
      missing: ['weight', 'birth_date'],
    });
    expect(await rechnen({ formel: 'katch_mcardle' })).toEqual({
      status: 'missing',
      missing: ['body_fat'],
    });
    expect(await fehler(rechnen({ geschlecht: 'divers' as unknown as 'unspecified' }))).toBe(
      '22023',
    );
    expect(await fehler(rechnen({ ziel: 'diaet' as unknown as 'lose' }))).toBe('22023');
  });
});

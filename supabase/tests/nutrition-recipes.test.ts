import { beforeAll, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Rezepte der Praxis (ADR-027 Punkte 9 und 14, ANN-843): Zutaten mit Stand, Werte nur vom Server;
 * Büro, Therapie, Teamleitung, Trainingsbetreuung, Plattform und eine fremde Praxis: nichts.
 */

const { users } = SEED;
const SPEICHERN = 'select public.save_practice_recipe($1::uuid, $2::jsonb, $3::timestamptz) as id';
const LISTE = 'select public.list_practice_recipes() as l';

type Rezept = {
  id: string;
  name: string;
  servings: number;
  updated_at: string;
  total_amount: number;
  per_portion: Record<string, number>;
  per_100: Record<string, number | null>;
  portions: { label: string; amount: number }[];
  ingredients: {
    name: string;
    amount: number;
    energy_kcal: number;
    portion_label: string | null;
  }[];
  starter_key: string | null;
};

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function katalog(name: string): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `select id from public.food_catalog where name = $1 and source = 'bls' and retired_at is null`,
    [name],
  );
  return rows[0]!.id;
}

async function liste(konto: string = users.ownerTherapist): Promise<Rezept[]> {
  const { rows } = await asUser<{ l: Rezept[] }>(konto, LISTE);
  return rows[0]!.l;
}

let HAFER = '';
let MILCH = '';
let BANANE = '';

function haferbrei(zusatz: Record<string, unknown> = {}) {
  return {
    name: 'Haferbrei mit Banane',
    servings: 2,
    instructions: 'Haferflocken in der Milch aufkochen, Banane in Scheiben dazu.',
    ingredients: [
      { food_kind: 'catalog', food_id: HAFER, amount: 100 },
      { food_kind: 'catalog', food_id: MILCH, amount: 300 },
      {
        food_kind: 'catalog',
        food_id: BANANE,
        portion_label: '1 Stück (mittel)',
        portion_count: 1,
      },
    ],
    ...zusatz,
  };
}

describe('Rezepte der Praxis (ERN-016)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
    // Ohne die Rezepte und Pläne des Seeds: die Fälle zählen ihre eigenen.
    await asPostgres('delete from public.nutrition_plans; delete from public.nutrition_recipes;');
    HAFER = await katalog('Haferflocken');
    MILCH = await katalog('Milch 1,5 % Fett');
    BANANE = await katalog('Banane roh');
  }, 120_000);

  it('die Beratung legt an; der Server rechnet je Portion und je 100 g', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, SPEICHERN, [
      null,
      JSON.stringify(haferbrei()),
      null,
    ]);
    const rezept = (await liste()).find((r) => r.id === rows[0]!.id)!;
    // 100 g Haferflocken, 300 ml Milch, eine Banane zu 120 g: 622,6 kcal auf 520 g.
    expect(rezept).toMatchObject({
      name: 'Haferbrei mit Banane',
      servings: 2,
      total_amount: 520,
      per_portion: { energy_kcal: 311, protein_g: 12.5, fat_g: 5.9, carbohydrate_g: 49.2 },
      per_100: {
        energy_kcal: 119.7,
        protein_g: 4.81,
        fat_g: 2.26,
        carbohydrate_g: 18.9,
        sugar_g: 6.92,
        fibre_g: 2.38,
        saturated_fat_g: 0.85,
        salt_g: 0.058,
      },
      portions: [{ label: '1 Portion', amount: 260 }],
      starter_key: null,
    });
    expect(rezept.ingredients.map((z) => [z.name, z.amount, z.energy_kcal])).toEqual([
      ['Haferflocken', 100, 370],
      ['Milch 1,5 % Fett', 300, 141],
      ['Banane roh', 120, 112],
    ]);
    expect(rezept.ingredients[2]!.portion_label).toBe('1 Stück (mittel)');
  });

  it('ändert mit Stand, scheitert am alten Stand verständlich, legt ab', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, SPEICHERN, [
      null,
      JSON.stringify(haferbrei({ name: 'Haferbrei klein' })),
      null,
    ]);
    const id = rows[0]!.id;
    const stand = (await liste()).find((r) => r.id === id)!.updated_at;
    await asUserCommitted(users.ownerTherapist, SPEICHERN, [
      id,
      JSON.stringify(haferbrei({ name: 'Haferbrei klein', servings: 1 })),
      stand,
    ]);
    expect((await liste()).find((r) => r.id === id)!.per_portion.energy_kcal).toBe(623);
    expect(
      await fehler(
        asUser(users.ownerTherapist, SPEICHERN, [id, JSON.stringify(haferbrei()), stand]),
      ),
    ).toBe('40001');

    await asUserCommitted(users.ownerTherapist, 'select public.archive_practice_recipe($1::uuid)', [
      id,
    ]);
    expect((await liste()).map((r) => r.id)).not.toContain(id);
    expect(
      await fehler(
        asUser(users.ownerTherapist, SPEICHERN, [id, JSON.stringify(haferbrei()), null]),
      ),
    ).toBe('P0002');
    expect(
      await fehler(
        asUser(users.ownerTherapist, 'select public.archive_practice_recipe($1::uuid)', [id]),
      ),
    ).toBe('P0002');
  });

  it('eine Zutat behält ihren Stand, auch wenn das Lebensmittel sich ändert oder abgelegt wird', async () => {
    const { rows: essen } = await asUserCommitted<{ id: string }>(
      users.ownerTherapist,
      'select public.save_practice_food(null, $1::jsonb, null) as id',
      [
        JSON.stringify({
          name: 'Praxisgranola',
          energy_kcal: 450,
          protein_g: 10,
          fat_g: 18,
          carbohydrate_g: 60,
          portions: [{ label: '1 Schale', amount: 50 }],
        }),
      ],
    );
    const granola = essen[0]!.id;
    const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, SPEICHERN, [
      null,
      JSON.stringify({
        name: 'Granola mit Milch',
        servings: 1,
        ingredients: [
          { food_kind: 'practice', food_id: granola, portion_label: '1 Schale', portion_count: 1 },
          { food_kind: 'catalog', food_id: MILCH, amount: 150 },
        ],
      }),
      null,
    ]);
    const vorher = (await liste()).find((r) => r.id === rows[0]!.id)!;
    expect(vorher.per_portion.energy_kcal).toBe(296);

    await asUserCommitted(
      users.ownerTherapist,
      'select public.save_practice_food($1::uuid, $2::jsonb, null)',
      [
        granola,
        JSON.stringify({
          name: 'Praxisgranola',
          energy_kcal: 500,
          protein_g: 10,
          fat_g: 20,
          carbohydrate_g: 60,
        }),
      ],
    );
    await asUserCommitted(users.ownerTherapist, 'select public.archive_practice_food($1::uuid)', [
      granola,
    ]);
    const nachher = (await liste()).find((r) => r.id === rows[0]!.id)!;
    expect(nachher.per_portion).toEqual(vorher.per_portion);
    // Neu speichern ginge nur ohne das abgelegte Lebensmittel.
    expect(
      await fehler(
        asUser(users.ownerTherapist, SPEICHERN, [
          rows[0]!.id,
          JSON.stringify({
            name: 'Granola mit Milch',
            servings: 1,
            ingredients: [{ food_kind: 'practice', food_id: granola, amount: 50 }],
          }),
          null,
        ]),
      ),
    ).toBe('P0002');
  });

  it('prüft die Angaben: Name, Portionen, Zutaten, Mengen, unbekannte Felder', async () => {
    const versuch = (r: Record<string, unknown>) =>
      fehler(asUser(users.ownerTherapist, SPEICHERN, [null, JSON.stringify(haferbrei(r)), null]));
    expect(await versuch({ name: ' ' })).toBe('22023');
    expect(await versuch({ name: 'x'.repeat(121) })).toBe('23514');
    expect(await versuch({ servings: 0 })).toBe('22023');
    expect(await versuch({ servings: 21 })).toBe('22023');
    expect(await versuch({ servings: 2.5 })).toBe('22023');
    expect(await versuch({ kcal: 300 })).toBe('22023');
    expect(await versuch({ ingredients: [] })).toBe('22023');
    expect(await versuch({ instructions: 'x'.repeat(4001) })).toBe('23514');
    // Werte schickt die Anwendung nie mit.
    expect(
      await versuch({
        ingredients: [
          { food_kind: 'catalog', food_id: HAFER, amount: 50, per_100: { energy_kcal: 1 } },
        ],
      }),
    ).toBe('22023');
    expect(
      await versuch({
        ingredients: [{ food_kind: 'catalog', food_id: crypto.randomUUID(), amount: 50 }],
      }),
    ).toBe('P0002');
    expect(
      await versuch({
        ingredients: [{ food_kind: 'catalog', food_id: 'kein-schluessel', amount: 50 }],
      }),
    ).toBe('22023');
    expect(
      await versuch({ ingredients: [{ food_kind: 'catalog', food_id: HAFER, amount: 0 }] }),
    ).toBe('22023');
    expect(
      await versuch({
        ingredients: [
          { food_kind: 'catalog', food_id: HAFER, portion_label: '1 Eimer', portion_count: 1 },
        ],
      }),
    ).toBe('22023');
    // Eine Portion über 5000 g passte in keinen Tagebucheintrag.
    expect(
      await versuch({
        servings: 1,
        ingredients: [
          { food_kind: 'catalog', food_id: MILCH, amount: 4000 },
          { food_kind: 'catalog', food_id: HAFER, amount: 1500 },
        ],
      }),
    ).toBe('22023');
  });

  it('nimmt kein Lebensmittel einer Person und keines aus dem zurückgezogenen Katalog', async () => {
    const versuch = (zutat: Record<string, unknown>) =>
      fehler(
        asUser(users.ownerTherapist, SPEICHERN, [
          null,
          JSON.stringify(haferbrei({ ingredients: [zutat] })),
          null,
        ]),
      );
    // Omas Dinkelbrot aus dem Seed gehört Erika.
    expect(
      await versuch({
        food_kind: 'person',
        food_id: 'f1f1f1f1-f1f1-4f1f-8f1f-000000000002',
        amount: 45,
      }),
    ).toBe('P0002');
    expect(
      await versuch({
        food_kind: 'practice',
        food_id: 'f1f1f1f1-f1f1-4f1f-8f1f-000000000002',
        amount: 45,
      }),
    ).toBe('P0002');
    const { rows } = await asPostgres<{ id: string }>(
      `update public.food_catalog set retired_at = now() where name = 'Apfelmus' and source = 'bls'
       returning id`,
    );
    expect(await versuch({ food_kind: 'catalog', food_id: rows[0]!.id, amount: 50 })).toBe('P0002');
  });

  it('übernimmt ein mitgeliefertes Rezept einmal, nach dem Ablegen wieder', async () => {
    const mit = haferbrei({ name: 'Haferbrei (mitgeliefert)', starter_key: 'haferbrei-banane' });
    const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, SPEICHERN, [
      null,
      JSON.stringify(mit),
      null,
    ]);
    expect((await liste()).find((r) => r.id === rows[0]!.id)!.starter_key).toBe('haferbrei-banane');
    expect(
      await fehler(asUser(users.ownerTherapist, SPEICHERN, [null, JSON.stringify(mit), null])),
    ).toBe('23505');
    // Den Schlüssel trägt nur das Anlegen.
    expect(
      await fehler(
        asUser(users.ownerTherapist, SPEICHERN, [rows[0]!.id, JSON.stringify(mit), null]),
      ),
    ).toBe('22023');
    expect(
      await fehler(
        asUser(users.ownerTherapist, SPEICHERN, [
          null,
          JSON.stringify(haferbrei({ starter_key: 'Kein Schlüssel!' })),
          null,
        ]),
      ),
    ).toBe('23514');
    await asUserCommitted(users.ownerTherapist, 'select public.archive_practice_recipe($1::uuid)', [
      rows[0]!.id,
    ]);
    await asUserCommitted(users.ownerTherapist, SPEICHERN, [null, JSON.stringify(mit), null]);
  });

  it('Büro, Therapie, Teamleitung, Trainingsbetreuung und Plattform: weder lesen noch schreiben', async () => {
    const id = (await liste())[0]!.id;
    for (const konto of [
      users.office,
      users.therapist,
      users.teamLead,
      users.trainer,
      users.plattformErika,
      users.patientMax,
    ]) {
      expect(await fehler(asUser(konto, LISTE)), konto).toBe('42501');
      expect(
        await fehler(asUser(konto, SPEICHERN, [null, JSON.stringify(haferbrei()), null])),
        konto,
      ).toBe('42501');
      expect(
        await fehler(asUser(konto, 'select public.archive_practice_recipe($1::uuid)', [id])),
        konto,
      ).toBe('42501');
      // Kein Tabellenrecht, auch nicht zum Lesen.
      expect(
        await fehler(asUser(konto, 'select count(*) from public.nutrition_recipes')),
        konto,
      ).toBe('42501');
    }
    expect(await fehler(asUser(null, LISTE))).toBe('42501');
  });

  it('eine fremde Praxis sieht die Rezepte nicht, ändert und nimmt sie nicht', async () => {
    const id = (await liste())[0]!.id;
    expect(await liste(FREMDE_ORGANISATION.owner)).toEqual([]);
    expect(
      await fehler(
        asUser(FREMDE_ORGANISATION.owner, SPEICHERN, [id, JSON.stringify(haferbrei()), null]),
      ),
    ).toBe('P0002');
    expect(
      await fehler(
        asUser(FREMDE_ORGANISATION.owner, 'select public.archive_practice_recipe($1::uuid)', [id]),
      ),
    ).toBe('P0002');
    // Ein Lebensmittel der Praxis bleibt in ihr.
    const { rows } = await asPostgres<{ id: string }>(
      `select id from public.custom_foods where owner_kind = 'practice' and archived_at is null limit 1`,
    );
    expect(
      await fehler(
        asUser(FREMDE_ORGANISATION.owner, SPEICHERN, [
          null,
          JSON.stringify(
            haferbrei({
              ingredients: [{ food_kind: 'practice', food_id: rows[0]!.id, amount: 50 }],
            }),
          ),
          null,
        ]),
      ),
    ).toBe('P0002');
  });
});

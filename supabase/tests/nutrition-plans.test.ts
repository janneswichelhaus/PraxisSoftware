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
 * Pläne und Tagesvorschläge (ADR-027 Punkt 14, ANN-845): Vorlagen der Praxis, Zuweisung an einer
 * laufenden Beratung mit Einwilligung, Vorschlag im Tagebuch im Wechsel der Tage ab dem Beginn.
 */

const { users, patients, platformAccesses, trainingRelationships } = SEED;
const PROFIL = 'f0f0f0f0-f0f0-4f0f-8f0f-000000000001';
const ZUGANG = platformAccesses.erikaBehandlung;
const FASSUNG = '2026-11';

const VORLAGE_SPEICHERN =
  'select public.save_nutrition_plan_template($1::uuid, $2::jsonb, $3::timestamptz) as id';
const VORLAGEN = 'select public.list_nutrition_plan_templates() as l';
const ZUWEISEN = 'select public.assign_nutrition_plan($1::uuid, $2::jsonb, $3::date) as id';
const AENDERN = 'select public.update_nutrition_plan($1::uuid, $2::jsonb, $3::timestamptz) as id';
const BEENDEN = 'select public.end_nutrition_plan($1::uuid)';
const TAG = 'select public.platform_nutrition_diary($1::uuid, $2::date) as d';
const EINTRAGEN = `select public.add_platform_diary_entry($1::uuid, $2::date, $3, $4, $5::uuid,
  $6::numeric, $7, $8::numeric) as id`;

type Position = { kind: string; id: string; name: string; amount: number; energy_kcal: number };
type Plan = {
  id: string;
  title: string;
  day_count: number;
  starts_on: string | null;
  ended_on: string | null;
  updated_at: string;
  days: { day: number; meals: { meal: string; items: Position[] }[] }[];
  recipes: { id: string; name: string }[];
};

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

let REZEPT = '';
let APFEL = '';
let NUDELN = '';
let HEUTE = '';

function woche(zusatz: Record<string, unknown> = {}) {
  return {
    title: 'Zwei Tage zum Ausprobieren',
    days: [
      {
        breakfast: [{ kind: 'recipe', id: REZEPT, portion_count: 1 }],
        snack: [
          { kind: 'catalog', id: APFEL, portion_label: '1 Stück (mittel)', portion_count: 1 },
        ],
      },
      { lunch: [{ kind: 'catalog', id: NUDELN, amount: 250 }] },
    ],
    ...zusatz,
  };
}

async function vorlagen(konto: string = users.ownerTherapist): Promise<Plan[]> {
  const { rows } = await asUser<{ l: Plan[] }>(konto, VORLAGEN);
  return rows[0]!.l;
}

async function plaene(): Promise<Plan[]> {
  const { rows } = await asUser<{ d: { profile: { plans: Plan[] } } }>(
    users.ownerTherapist,
    `select public.get_nutrition_profile('treatment', $1::uuid) as d`,
    [patients.erika],
  );
  return rows[0]!.d.profile.plans;
}

/** Tinas Training mit laufender Beratung (die Einwilligung nimmt das Anlegen auf) und Tagebuch. */
async function tinaMitBeratung(): Promise<void> {
  await asUserCommitted(
    users.ownerTherapist,
    `select public.create_nutrition_profile('training', $1::uuid, $2::date, 170::smallint,
       65::numeric, 'female', 1.6::numeric, 'maintain', null::numeric, null::numeric, null)`,
    [trainingRelationships.tina, HEUTE],
  );
  await asUserCommitted(
    users.plattformTina,
    'select public.set_platform_nutrition_diary($1::uuid, true)',
    [platformAccesses.tinaTraining],
  );
}

async function tagPlus(tage: number): Promise<string> {
  const { rows } = await asPostgres<{ d: string }>('select ($1::date + $2::int)::text as d', [
    HEUTE,
    tage,
  ]);
  return rows[0]!.d;
}

async function vorschlag(tag: string | null = null) {
  const { rows } = await asUser<{
    d: {
      suggestions: {
        title: string;
        day: number;
        day_count: number;
        meals: { meal: string; items: Position[] }[];
      } | null;
    };
  }>(users.plattformErika, TAG, [ZUGANG, tag]);
  return rows[0]!.d.suggestions;
}

describe('Pläne der Beratung (ERN-019)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
    // Ohne die Rezepte und Pläne des Seeds: die Fälle zählen ihre eigenen.
    await asPostgres('delete from public.nutrition_plans; delete from public.nutrition_recipes;');
    const katalog = async (name: string) =>
      (
        await asPostgres<{ id: string }>(
          `select id from public.food_catalog where name = $1 and source = 'bls'`,
          [name],
        )
      ).rows[0]!.id;
    APFEL = await katalog('Apfel roh');
    NUDELN = await katalog('Vollkornnudeln gekocht');
    const hafer = await katalog('Haferflocken');
    const { rows } = await asUserCommitted<{ id: string }>(
      users.ownerTherapist,
      'select public.save_practice_recipe(null, $1::jsonb, null) as id',
      [
        JSON.stringify({
          name: 'Haferbrei',
          servings: 1,
          ingredients: [{ food_kind: 'catalog', food_id: hafer, amount: 60 }],
        }),
      ],
    );
    REZEPT = rows[0]!.id;
    const { rows: tag } = await asPostgres<{ d: string }>(
      `select app.training_today($1)::text as d`,
      [SEED.organizationId],
    );
    HEUTE = tag[0]!.d;
  }, 120_000);

  it('legt eine Vorlage an: Tage, Positionen mit Menge und Energie, die Rezepte darin', async () => {
    await asUserCommitted(users.ownerTherapist, VORLAGE_SPEICHERN, [
      null,
      JSON.stringify(woche()),
      null,
    ]);
    const [vorlage] = await vorlagen();
    expect(vorlage).toMatchObject({
      title: 'Zwei Tage zum Ausprobieren',
      day_count: 2,
      starts_on: null,
    });
    const tag1 = vorlage!.days[0]!.meals;
    // Haferbrei: 60 g Haferflocken, 222 kcal; Apfel: 1 Stück zu 150 g, 81 kcal.
    expect(tag1.find((m) => m.meal === 'breakfast')!.items).toEqual([
      expect.objectContaining({
        kind: 'recipe',
        id: REZEPT,
        name: 'Haferbrei',
        amount: 60,
        portion_label: '1 Portion',
        portion_count: 1,
        energy_kcal: 222,
      }),
    ]);
    expect(tag1.find((m) => m.meal === 'snack')!.items[0]).toMatchObject({
      name: 'Apfel roh',
      amount: 150,
      energy_kcal: 81,
    });
    expect(vorlage!.days[1]!.meals.find((m) => m.meal === 'lunch')!.items[0]).toMatchObject({
      name: 'Vollkornnudeln gekocht',
      amount: 250,
      portion_label: null,
    });
    expect(vorlage!.recipes.map((r) => r.name)).toEqual(['Haferbrei']);

    // Ändern mit Stand; ein zweites Ändern mit dem alten Stand scheitert verständlich.
    await asUserCommitted(users.ownerTherapist, VORLAGE_SPEICHERN, [
      vorlage!.id,
      JSON.stringify(woche({ title: 'Zwei Tage' })),
      vorlage!.updated_at,
    ]);
    expect(
      await fehler(
        asUser(users.ownerTherapist, VORLAGE_SPEICHERN, [
          vorlage!.id,
          JSON.stringify(woche()),
          vorlage!.updated_at,
        ]),
      ),
    ).toBe('40001');
  });

  it('prüft den Plan: Titel, Tage, Positionen, nur Praxis und Katalog', async () => {
    const versuch = (p: Record<string, unknown>) =>
      fehler(asUser(users.ownerTherapist, VORLAGE_SPEICHERN, [null, JSON.stringify(p), null]));
    expect(await versuch(woche({ title: ' ' }))).toBe('22023');
    expect(await versuch(woche({ days: [] }))).toBe('22023');
    expect(await versuch(woche({ days: Array.from({ length: 8 }, () => ({})) }))).toBe('22023');
    expect(
      await versuch(
        woche({
          days: [
            {
              snack: Array.from({ length: 13 }, () => ({ kind: 'catalog', id: APFEL, amount: 10 })),
            },
          ],
        }),
      ),
    ).toBe('22023');
    expect(await versuch(woche({ days: [{ supper: [] }] }))).toBe('22023');
    expect(
      await versuch(woche({ days: [{ snack: [{ kind: 'person', id: APFEL, amount: 10 }] }] })),
    ).toBe('22023');
    // Omas Dinkelbrot gehört Erika - kein Lebensmittel der Praxis.
    expect(
      await versuch(
        woche({
          days: [
            {
              snack: [{ kind: 'practice', id: 'f1f1f1f1-f1f1-4f1f-8f1f-000000000002', amount: 45 }],
            },
          ],
        }),
      ),
    ).toBe('P0002');
    expect(
      await versuch(woche({ days: [{ lunch: [{ kind: 'recipe', id: REZEPT, amount: 100 }] }] })),
    ).toBe('22023');
    expect(
      await versuch(
        woche({
          days: [
            { snack: [{ kind: 'catalog', id: APFEL, portion_label: '1 Kiste', portion_count: 1 }] },
          ],
        }),
      ),
    ).toBe('22023');
    expect(
      await versuch(
        woche({
          days: [{ snack: [{ kind: 'recipe', id: crypto.randomUUID(), portion_count: 1 }] }],
        }),
      ),
    ).toBe('P0002');
  });

  it('weist zu: ab heute, der offene endet am Tag davor; nicht in der Vergangenheit', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ZUWEISEN, [
      PROFIL,
      JSON.stringify(woche()),
      HEUTE,
    ]);
    const erster = rows[0]!.id;
    expect((await plaene())[0]).toMatchObject({
      id: erster,
      starts_on: HEUTE,
      ended_on: null,
      day_count: 2,
    });

    const { rows: zweite } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ZUWEISEN, [
      PROFIL,
      JSON.stringify(woche({ title: 'Tagesvorschlag', days: [woche().days[0]] })),
      HEUTE,
    ]);
    const liste = await plaene();
    expect(liste.map((p) => [p.title, p.ended_on === null])).toEqual([
      ['Tagesvorschlag', true],
      ['Zwei Tage zum Ausprobieren', false],
    ]);
    // Abgelöst, bevor er galt: Ende einen Tag vor dem Beginn.
    const { rows: alt } = await asPostgres<{ ok: boolean }>(
      'select ended_on = starts_on - 1 as ok from public.nutrition_plans where id = $1',
      [erster],
    );
    expect(alt[0]!.ok).toBe(true);
    expect(zweite[0]!.id).not.toBe(erster);

    expect(
      await fehler(
        asUser(users.ownerTherapist, ZUWEISEN, [PROFIL, JSON.stringify(woche()), '2020-01-01']),
      ),
    ).toBe('22023');
    expect(
      await fehler(
        asUser(users.ownerTherapist, ZUWEISEN, [PROFIL, JSON.stringify(woche()), '2099-01-01']),
      ),
    ).toBe('22023');
  });

  it('zeigt der Person den Vorschlag des Tags im Wechsel ab dem Beginn', async () => {
    await asUserCommitted(users.ownerTherapist, ZUWEISEN, [PROFIL, JSON.stringify(woche()), HEUTE]);
    expect(await vorschlag()).toMatchObject({
      title: 'Zwei Tage zum Ausprobieren',
      day: 1,
      day_count: 2,
    });
    // Begann er gestern, ist heute Tag 2, gestern Tag 1, vorgestern nichts.
    await asPostgres(
      `update public.nutrition_plans set starts_on = starts_on - 1 where profile_id = $1 and ended_on is null`,
      [PROFIL],
    );
    const heute = await vorschlag();
    expect(heute!.day).toBe(2);
    expect(heute!.meals.find((m) => m.meal === 'lunch')!.items[0]!.name).toBe(
      'Vollkornnudeln gekocht',
    );
    const { rows } = await asPostgres<{ gestern: string; vorgestern: string }>(
      `select ($1::date - 1)::text as gestern, ($1::date - 2)::text as vorgestern`,
      [HEUTE],
    );
    expect((await vorschlag(rows[0]!.gestern))!.day).toBe(1);
    expect(await vorschlag(rows[0]!.vorgestern)).toBeNull();
    // Die Plattform trägt die Pläne mit, Rezepte samt Zutaten.
    const { rows: sicht } = await asUser<{ d: { profile: { plans: Plan[] } } }>(
      users.plattformErika,
      'select public.platform_nutrition($1::uuid) as d',
      [ZUGANG],
    );
    expect(sicht[0]!.d.profile.plans[0]!.recipes[0]!.name).toBe('Haferbrei');
  });

  it('das Rezept aus dem Plan trägt die Person mit einem Tipp ein; nach dem Ende nicht mehr', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.plattformErika, EINTRAGEN, [
      ZUGANG,
      HEUTE,
      'breakfast',
      'recipe',
      REZEPT,
      null,
      '1 Portion',
      1,
    ]);
    expect(rows[0]!.id).toBeTruthy();
    const offen = (await plaene()).find((p) => p.ended_on === null)!;
    await asUserCommitted(users.ownerTherapist, BEENDEN, [offen.id]);
    expect(await vorschlag()).toBeNull();
    expect(
      await fehler(
        asUser(users.plattformErika, EINTRAGEN, [
          ZUGANG,
          HEUTE,
          'breakfast',
          'recipe',
          REZEPT,
          null,
          '1 Portion',
          1,
        ]),
      ),
    ).toBe('P0002');
    // Beendet heißt nicht gelöscht: der Plan bleibt mit dem Profil.
    expect((await plaene()).find((p) => p.id === offen.id)!.ended_on).not.toBeNull();
    expect(await fehler(asUser(users.ownerTherapist, BEENDEN, [offen.id]))).toBe('P0002');
    expect(
      await fehler(
        asUser(users.ownerTherapist, AENDERN, [offen.id, JSON.stringify(woche()), null]),
      ),
    ).toBe('22023');
  });

  it('ändert den offenen Plan mit Stand', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ZUWEISEN, [
      PROFIL,
      JSON.stringify(woche()),
      HEUTE,
    ]);
    const plan = (await plaene()).find((p) => p.id === rows[0]!.id)!;
    await asUserCommitted(users.ownerTherapist, AENDERN, [
      plan.id,
      JSON.stringify(woche({ title: 'Angepasst', days: [woche().days[1]] })),
      plan.updated_at,
    ]);
    expect((await plaene()).find((p) => p.id === plan.id)).toMatchObject({
      title: 'Angepasst',
      day_count: 1,
      starts_on: HEUTE,
    });
    expect(
      await fehler(
        asUser(users.ownerTherapist, AENDERN, [plan.id, JSON.stringify(woche()), plan.updated_at]),
      ),
    ).toBe('40001');
  });

  it('ein Rezept aus Erikas Plan erreicht keine andere Person; ein vor dem Beginn abgelöster Plan gibt keines frei', async () => {
    await tinaMitBeratung();
    await asUserCommitted(users.ownerTherapist, ZUWEISEN, [PROFIL, JSON.stringify(woche()), HEUTE]);
    const eintragen = (konto: string, zugang: string, rezept: string) =>
      asUser(konto, EINTRAGEN, [zugang, HEUTE, 'lunch', 'recipe', rezept, null, '1 Portion', 1]);
    await eintragen(users.plattformErika, ZUGANG, REZEPT);
    expect(
      await fehler(eintragen(users.plattformTina, platformAccesses.tinaTraining, REZEPT)),
    ).toBe('P0002');

    // ANN-845: A beginnt in 30 Tagen, B ab morgen löst ihn vor seinem Beginn ab.
    const { rows } = await asUserCommitted<{ id: string }>(
      users.ownerTherapist,
      'select public.save_practice_recipe(null, $1::jsonb, null) as id',
      [
        JSON.stringify({
          name: 'Nur in A',
          servings: 1,
          ingredients: [{ food_kind: 'catalog', food_id: APFEL, amount: 150 }],
        }),
      ],
    );
    const nurInA = rows[0]!.id;
    const a = { title: 'A', days: [{ lunch: [{ kind: 'recipe', id: nurInA, portion_count: 1 }] }] };
    await asUserCommitted(users.ownerTherapist, ZUWEISEN, [
      PROFIL,
      JSON.stringify(a),
      await tagPlus(30),
    ]);
    await eintragen(users.plattformErika, ZUGANG, nurInA);
    const morgen = await tagPlus(1);
    await asUserCommitted(users.ownerTherapist, ZUWEISEN, [
      PROFIL,
      JSON.stringify(woche({ title: 'B' })),
      morgen,
    ]);
    expect(await fehler(eintragen(users.plattformErika, ZUGANG, nurInA))).toBe('P0002');
    // Keine Überschneidung: Ab dem Beginn von B gilt kein anderer Plan mehr, A gilt nie.
    for (const plan of (await plaene()).filter((p) => p.title !== 'B')) {
      const ende = plan.ended_on ?? '9999-12-31';
      expect(ende < morgen || ende < plan.starts_on!, plan.title).toBe(true);
    }
    expect((await plaene()).find((p) => p.title === 'A')!.ended_on).toBe(await tagPlus(29));
  });

  it('ein eigenes Rezept einer Person kommt in keinen Plan, weder ihren noch einen fremden', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(
      users.plattformErika,
      'select public.save_platform_recipe($1::uuid, null, $2::jsonb) as id',
      [
        ZUGANG,
        JSON.stringify({
          name: 'Erikas Brei',
          servings: 1,
          ingredients: [{ food_kind: 'catalog', food_id: APFEL, amount: 100 }],
        }),
      ],
    );
    const mitErikasRezept = JSON.stringify({
      title: 'Mit Erikas Rezept',
      days: [{ breakfast: [{ kind: 'recipe', id: rows[0]!.id, portion_count: 1 }] }],
    });
    const { rows: tina } = await asPostgres<{ id: string }>(
      'select id from public.nutrition_profiles where training_relationship_id = $1',
      [trainingRelationships.tina],
    );
    for (const [sql, werte] of [
      [VORLAGE_SPEICHERN, [null, mitErikasRezept, null]],
      [ZUWEISEN, [tina[0]!.id, mitErikasRezept, HEUTE]],
      [ZUWEISEN, [PROFIL, mitErikasRezept, HEUTE]],
    ] as const) {
      expect(await fehler(asUser(users.ownerTherapist, sql, [...werte]))).toBe('P0002');
    }
  });

  it('ein abgelegtes Lebensmittel bleibt in Vorlage und Plan nutzbar; eintragen nur aus dem Plan', async () => {
    const PORRIDGE = 'f1f1f1f1-f1f1-4f1f-8f1f-000000000001';
    const plan = {
      title: 'Mit Porridge',
      days: [
        {
          breakfast: [
            { kind: 'practice', id: PORRIDGE, portion_label: '1 Schale', portion_count: 1 },
          ],
        },
      ],
    };
    const { rows } = await asUserCommitted<{ id: string }>(
      users.ownerTherapist,
      VORLAGE_SPEICHERN,
      [null, JSON.stringify(plan), null],
    );
    await asUserCommitted(users.ownerTherapist, 'select public.archive_practice_food($1::uuid)', [
      PORRIDGE,
    ]);
    const eintragen = () =>
      asUser(users.plattformErika, EINTRAGEN, [
        ZUGANG,
        HEUTE,
        'breakfast',
        'practice',
        PORRIDGE,
        null,
        '1 Schale',
        1,
      ]);
    expect(await fehler(eintragen())).toBe('P0002');
    await asUserCommitted(users.ownerTherapist, VORLAGE_SPEICHERN, [
      rows[0]!.id,
      JSON.stringify(plan),
      null,
    ]);
    await asUserCommitted(users.ownerTherapist, ZUWEISEN, [PROFIL, JSON.stringify(plan), HEUTE]);
    await eintragen();
    // Auf der Plattform dieselben Schlüssel wie ein Lebensmittel des Katalogs, ohne Barcode.
    const { rows: sicht } = await asUser<{
      d: {
        profile: { plans: { title: string; days: { meals: { items: { food: object }[] }[] }[] }[] };
      };
    }>(users.plattformErika, 'select public.platform_nutrition($1::uuid) as d', [ZUGANG]);
    const porridge = sicht[0]!.d.profile.plans.find((x) => x.title === 'Mit Porridge')!;
    const essen = porridge.days[0]!.meals.flatMap((m) => m.items)[0]!.food;
    expect(Object.keys(essen).sort()).toEqual(
      [
        'base_unit',
        'brand',
        'id',
        'kind',
        'name',
        'per_100',
        'portions',
        'source',
        'source_code',
      ].sort(),
    );
  });

  it('Büro, Therapie, Teamleitung, Trainingsbetreuung, Plattform: nichts', async () => {
    const plan = (await plaene())[0]!;
    const vorlage = (await vorlagen())[0]!;
    for (const konto of [
      users.office,
      users.therapist,
      users.teamLead,
      users.trainer,
      users.plattformErika,
    ]) {
      expect(await fehler(asUser(konto, VORLAGEN)), konto).toBe('42501');
      expect(
        await fehler(asUser(konto, VORLAGE_SPEICHERN, [null, JSON.stringify(woche()), null])),
        konto,
      ).toBe('42501');
      expect(
        await fehler(
          asUser(konto, 'select public.archive_nutrition_plan_template($1::uuid)', [vorlage.id]),
        ),
        konto,
      ).toBe('42501');
      expect(
        await fehler(asUser(konto, ZUWEISEN, [PROFIL, JSON.stringify(woche()), HEUTE])),
        konto,
      ).toBe('42501');
      expect(
        await fehler(asUser(konto, AENDERN, [plan.id, JSON.stringify(woche()), null])),
        konto,
      ).toBe('42501');
      expect(await fehler(asUser(konto, BEENDEN, [plan.id])), konto).toBe('42501');
      expect(
        await fehler(asUser(konto, 'select count(*) from public.nutrition_plans')),
        konto,
      ).toBe('42501');
      expect(
        await fehler(asUser(konto, 'select count(*) from public.nutrition_plan_items')),
        konto,
      ).toBe('42501');
    }
    // Die Begleitung bekommt keinen Tag und damit keinen Vorschlag.
    const { rows } = await asUser<{ d: unknown }>(users.plattformPaula, TAG, [
      platformAccesses.paulaBegleitungMax,
      null,
    ]);
    expect(rows[0]!.d).toBeNull();
  });

  it('eine fremde Praxis: keine Vorlage, kein Zuweisen, kein Ändern', async () => {
    const plan = (await plaene())[0]!;
    const vorlage = (await vorlagen())[0]!;
    expect(await vorlagen(FREMDE_ORGANISATION.owner)).toEqual([]);
    expect(
      await fehler(
        asUser(FREMDE_ORGANISATION.owner, ZUWEISEN, [PROFIL, JSON.stringify(woche()), HEUTE]),
      ),
    ).toBe('P0002');
    expect(
      await fehler(
        asUser(FREMDE_ORGANISATION.owner, AENDERN, [plan.id, JSON.stringify(woche()), null]),
      ),
    ).toBe('P0002');
    expect(await fehler(asUser(FREMDE_ORGANISATION.owner, BEENDEN, [plan.id]))).toBe('P0002');
    expect(
      await fehler(
        asUser(
          FREMDE_ORGANISATION.owner,
          'select public.archive_nutrition_plan_template($1::uuid)',
          [vorlage.id],
        ),
      ),
    ).toBe('P0002');
    expect(
      await fehler(
        asUser(FREMDE_ORGANISATION.owner, VORLAGE_SPEICHERN, [
          vorlage.id,
          JSON.stringify(woche()),
          null,
        ]),
      ),
    ).toBe('P0002');
    // Ein Rezept einer anderen Praxis nimmt kein Plan.
    expect(
      await fehler(
        asUser(FREMDE_ORGANISATION.owner, VORLAGE_SPEICHERN, [
          null,
          JSON.stringify({
            title: 'Fremd',
            days: [{ lunch: [{ kind: 'recipe', id: REZEPT, portion_count: 1 }] }],
          }),
          null,
        ]),
      ),
    ).toBe('P0002');
  });

  it('nach dem Widerruf: kein Zuweisen, aber beenden; Auskunft und Export tragen die Pläne', async () => {
    // Ein Nachfolger in zehn Tagen: Beenden nimmt ab heute auch den laufenden Plan.
    await asUserCommitted(users.ownerTherapist, ZUWEISEN, [
      PROFIL,
      JSON.stringify(woche({ title: 'Danach' })),
      await tagPlus(10),
    ]);
    await asUserCommitted(
      users.plattformErika,
      'select public.record_platform_nutrition_consent($1::uuid, false, $2)',
      [ZUGANG, FASSUNG],
    );
    expect(
      await fehler(
        asUser(users.ownerTherapist, ZUWEISEN, [PROFIL, JSON.stringify(woche()), HEUTE]),
      ),
    ).toBe('42501');
    const offen = (await plaene()).find((p) => p.ended_on === null)!;
    expect(offen.title).toBe('Danach');
    await asUserCommitted(users.ownerTherapist, BEENDEN, [offen.id]);
    for (const plan of await plaene()) {
      const ende = plan.ended_on ?? '9999-12-31';
      expect(ende < HEUTE || ende < plan.starts_on!, plan.title).toBe(true);
    }

    const { rows: auskunft } = await asUser<{
      d: { tabellen: { nutrition_profiles: { plans: Plan[] }[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as d', [
      patients.erika,
    ]);
    expect(auskunft[0]!.d.tabellen.nutrition_profiles[0]!.plans.length).toBeGreaterThanOrEqual(3);
    const { rows: export_ } = await asUser<{ d: { nutrition: { plans: Plan[] }[] } }>(
      users.plattformErika,
      'select public.platform_export($1::uuid) as d',
      [ZUGANG],
    );
    expect(export_[0]!.d.nutrition[0]!.plans.length).toBeGreaterThanOrEqual(3);
  });

  it('fällt mit dem Profil; die Vorlagen der Praxis bleiben', async () => {
    await asPostgres('delete from public.nutrition_profiles where id = $1', [PROFIL]);
    const { rows } = await asPostgres<{ zugewiesen: number; vorlagen: number; positionen: number }>(
      `select count(*) filter (where profile_id is not null)::int as zugewiesen,
              count(*) filter (where profile_id is null)::int as vorlagen,
              (select count(*)::int from public.nutrition_plan_items i
                 join public.nutrition_plans p on p.id = i.plan_id where p.profile_id is not null) as positionen
         from public.nutrition_plans`,
    );
    expect(rows[0]).toEqual({ zugewiesen: 0, vorlagen: 1, positionen: 0 });
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';
import { NACHZIEHEN, journal, sichern, stehen, zurueckspielen } from './helpers/wiederherstellung';

/**
 * Eigene Rezepte der Person und Rezepte im Tagebuch (ADR-027 Punkte 6, 9 und 10, ANN-843): mit
 * Einwilligung an der laufenden Beratung des Zugangs, im Tagebuch nur in Portionen mit Stand.
 */

const { users, patients, platformAccesses } = SEED;
const ZUGANG = platformAccesses.erikaBehandlung;
const PROFIL = 'f0f0f0f0-f0f0-4f0f-8f0f-000000000001';
const EIGENES_BROT = 'f1f1f1f1-f1f1-4f1f-8f1f-000000000002';
const FASSUNG = '2026-11';

const SPEICHERN = 'select public.save_platform_recipe($1::uuid, $2::uuid, $3::jsonb) as id';
const LOESCHEN = 'select public.delete_platform_recipe($1::uuid, $2::uuid)';
const EINTRAGEN = `select public.add_platform_diary_entry($1::uuid, $2::date, $3, $4, $5::uuid,
  $6::numeric, $7, $8::numeric) as id`;
const TAG = 'select public.platform_nutrition_diary($1::uuid, $2::date) as d';

type Rezept = {
  id: string;
  name: string;
  per_portion: { energy_kcal: number };
  recorded_by_kind?: string;
};

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

let HAFER = '';

function stulle(zusatz: Record<string, unknown> = {}) {
  return {
    name: 'Stulle mit Hafer',
    servings: 2,
    ingredients: [
      { food_kind: 'person', food_id: EIGENES_BROT, portion_label: '1 Scheibe', portion_count: 2 },
      { food_kind: 'catalog', food_id: HAFER, amount: 30 },
    ],
    ...zusatz,
  };
}

async function eigene(konto: string = users.plattformErika): Promise<Rezept[]> {
  const { rows } = await asUser<{ d: { profile: { own_recipes: Rezept[] } } }>(
    konto,
    'select public.platform_nutrition($1::uuid) as d',
    [ZUGANG],
  );
  return rows[0]!.d.profile.own_recipes;
}

async function heute(): Promise<string> {
  const { rows } = await asUser<{ d: { today: string } }>(users.plattformErika, TAG, [
    ZUGANG,
    null,
  ]);
  return rows[0]!.d.today;
}

describe('Eigene Rezepte der Person (ERN-018)', () => {
  beforeAll(async () => {
    await resetDatabase();
    const { rows } = await asPostgres<{ id: string }>(
      `select id from public.food_catalog where name = 'Haferflocken' and source = 'bls'`,
    );
    HAFER = rows[0]!.id;
  }, 120_000);

  it('die Person legt an und ändert; Werte vom Server, die Beratung liest mit', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.plattformErika, SPEICHERN, [
      ZUGANG,
      null,
      JSON.stringify(stulle()),
    ]);
    const id = rows[0]!.id;
    // Zwei Scheiben Dinkelbrot (90 g, 216 kcal) und 30 g Haferflocken (111 kcal) auf zwei Portionen.
    expect((await eigene()).find((r) => r.id === id)!.per_portion.energy_kcal).toBe(164);
    // Ohne wer eingetragen hat auf der Plattform.
    expect((await eigene())[0]).not.toHaveProperty('recorded_by_kind');

    await asUserCommitted(users.plattformErika, SPEICHERN, [
      ZUGANG,
      id,
      JSON.stringify(stulle({ servings: 1 })),
    ]);
    const { rows: beratung } = await asUser<{
      d: { profile: { own_recipes: Rezept[] } };
    }>(users.ownerTherapist, `select public.get_nutrition_profile('treatment', $1::uuid) as d`, [
      patients.erika,
    ]);
    const [rezept] = beratung[0]!.d.profile.own_recipes;
    expect(beratung[0]!.d.profile.own_recipes).toHaveLength(1);
    expect(rezept).toMatchObject({ id, recorded_by_kind: 'self' });
    expect(rezept!.per_portion.energy_kcal).toBe(327);
  });

  it('trägt ein Rezept in Portionen ein, mit seinem Stand; Gramm gehen nicht', async () => {
    const id = (await eigene())[0]!.id;
    const tag = await heute();
    const { rows } = await asUserCommitted<{ id: string }>(users.plattformErika, EINTRAGEN, [
      ZUGANG,
      tag,
      'lunch',
      'recipe',
      id,
      null,
      '1 Portion',
      1,
    ]);
    const { rows: tage } = await asUser<{
      d: {
        day: {
          meals: {
            meal: string;
            entries: {
              id: string;
              food_kind: string;
              food_id: string | null;
              energy_kcal: number;
              name: string;
            }[];
          }[];
        };
      };
    }>(users.plattformErika, TAG, [ZUGANG, tag]);
    const eintrag = tage[0]!.d.day.meals
      .find((m) => m.meal === 'lunch')!
      .entries.find((e) => e.id === rows[0]!.id)!;
    expect(eintrag).toMatchObject({ food_kind: 'recipe', food_id: null, name: 'Stulle mit Hafer' });
    expect(eintrag.energy_kcal).toBe(327);

    expect(
      await fehler(
        asUser(users.plattformErika, EINTRAGEN, [
          ZUGANG,
          tag,
          'lunch',
          'recipe',
          id,
          120,
          null,
          null,
        ]),
      ),
    ).toBe('22023');
    expect(
      await fehler(
        asUser(users.plattformErika, EINTRAGEN, [
          ZUGANG,
          tag,
          'lunch',
          'recipe',
          crypto.randomUUID(),
          null,
          '1 Portion',
          1,
        ]),
      ),
    ).toBe('P0002');
    // Kopieren nimmt den Stand mit.
    const { rows: kopiert } = await asUserCommitted<{ n: number }>(
      users.plattformErika,
      `select public.copy_platform_diary($1::uuid, $2::date, 'lunch', $3::date, 'dinner') as n`,
      [ZUGANG, tag, tag],
    );
    expect(kopiert[0]!.n).toBeGreaterThanOrEqual(1);
  });

  it('ein Rezept der Praxis ohne Plan trägt die Person nicht ein (ADR-027 Punkt 14)', async () => {
    const { rows: hafer } = await asUserCommitted<{ id: string }>(
      users.ownerTherapist,
      'select public.save_practice_recipe(null, $1::jsonb, null) as id',
      [
        JSON.stringify({
          name: 'Praxisbrei',
          servings: 1,
          ingredients: [{ food_kind: 'catalog', food_id: HAFER, amount: 60 }],
        }),
      ],
    );
    expect(
      await fehler(
        asUser(users.plattformErika, EINTRAGEN, [
          ZUGANG,
          await heute(),
          'snack',
          'recipe',
          hafer[0]!.id,
          null,
          '1 Portion',
          1,
        ]),
      ),
    ).toBe('P0002');
    expect(await fehler(asUser(users.plattformErika, LOESCHEN, [ZUGANG, hafer[0]!.id]))).toBe(
      'P0002',
    );
  });

  it('Begleitung, anderer Bereich, fremde Person, Praxiskonto: nichts', async () => {
    const id = (await eigene())[0]!.id;
    expect(
      await fehler(
        asUser(users.plattformPaula, SPEICHERN, [
          platformAccesses.paulaBegleitungMax,
          null,
          JSON.stringify(stulle()),
        ]),
      ),
    ).toBe('42501');
    // Erikas Training hat keine Beratung; ihr Rezept der Behandlung erreicht es nicht.
    expect(
      await fehler(
        asUser(users.plattformErika, SPEICHERN, [
          platformAccesses.erikaTraining,
          null,
          JSON.stringify(stulle()),
        ]),
      ),
    ).toBe('P0002');
    expect(
      await fehler(asUser(users.plattformErika, LOESCHEN, [platformAccesses.erikaTraining, id])),
    ).toBe('P0002');
    expect(await fehler(asUser(users.plattformTina, LOESCHEN, [ZUGANG, id]))).toBe('42501');
    expect(await fehler(asUser(users.ownerTherapist, LOESCHEN, [ZUGANG, id]))).toBe('42501');
    expect(
      await fehler(
        asUser(users.ownerTherapist, SPEICHERN, [ZUGANG, null, JSON.stringify(stulle())]),
      ),
    ).toBe('42501');
    // Keine Zutat aus fremder Hand: ein unbekanntes eigenes Lebensmittel gibt es nicht.
    expect(
      await fehler(
        asUser(users.plattformErika, SPEICHERN, [
          ZUGANG,
          null,
          JSON.stringify(
            stulle({
              ingredients: [{ food_kind: 'person', food_id: crypto.randomUUID(), amount: 50 }],
            }),
          ),
        ]),
      ),
    ).toBe('P0002');
  });

  it('steht in Auskunft (Art. 15) und Export (Art. 20)', async () => {
    const { rows: auskunft } = await asUser<{
      d: { tabellen: { nutrition_profiles: { own_recipes: Rezept[] }[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as d', [
      patients.erika,
    ]);
    expect(auskunft[0]!.d.tabellen.nutrition_profiles[0]!.own_recipes).toHaveLength(1);
    const { rows: export_ } = await asUser<{ d: { nutrition: { own_recipes: Rezept[] }[] } }>(
      users.plattformErika,
      'select public.platform_export($1::uuid) as d',
      [ZUGANG],
    );
    const rezepte = export_[0]!.d.nutrition[0]!.own_recipes;
    expect(rezepte).toHaveLength(1);
    expect(rezepte[0]).not.toHaveProperty('recorded_by_kind');
  });

  it('nach dem Widerruf: nichts Neues, löschen geht; Einträge behalten ihren Stand, das Journal hält es fest', async () => {
    await asUserCommitted(
      users.plattformErika,
      'select public.record_platform_nutrition_consent($1::uuid, false, $2)',
      [ZUGANG, FASSUNG],
    );
    expect(
      await fehler(
        asUser(users.plattformErika, SPEICHERN, [ZUGANG, null, JSON.stringify(stulle())]),
      ),
    ).toBe('42501');
    const id = (await eigene())[0]!.id;
    const rezept = await sichern('nutrition_recipes', 'id = $1', [id]);
    await asUserCommitted(users.plattformErika, LOESCHEN, [ZUGANG, id]);
    expect(await eigene()).toEqual([]);
    const { rows } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.nutrition_diary_entries
        where profile_id = $1 and food_kind = 'recipe' and food_name = 'Stulle mit Hafer'`,
      [PROFIL],
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(2);
    expect(await journal('nutrition_recipes', [id])).toEqual([
      { target_id: id, retention_class: 'ernaehrungsberatung', reapplied_at: null },
    ]);
    await zurueckspielen('nutrition_recipes', rezept);
    await asPostgres(NACHZIEHEN);
    expect(await stehen('nutrition_recipes', rezept)).toBe(0);
  });

  it('höchstens 200 eigene je Profil; fällt mit dem Profil, die der Praxis bleiben', async () => {
    await asPostgres(
      `insert into public.nutrition_consent_records (organization_id, profile_id, record_kind,
         occurred_on, recorded_by)
       values ($1, $2, 'consent_granted', current_date, $3)`,
      [SEED.organizationId, PROFIL, users.ownerTherapist],
    );
    await asPostgres(
      `insert into public.nutrition_recipes (organization_id, owner_kind, profile_id, name, servings,
         ingredients, created_by)
       select $1, 'person', $2, 'Rest ' || n, 1,
              (select ingredients from public.nutrition_recipes where owner_kind = 'practice' limit 1), $3
       from generate_series(1, 200) n`,
      [SEED.organizationId, PROFIL, users.plattformErika],
    );
    expect(
      await fehler(
        asUser(users.plattformErika, SPEICHERN, [ZUGANG, null, JSON.stringify(stulle())]),
      ),
    ).toBe('54000');
    await asPostgres('delete from public.nutrition_profiles where id = $1', [PROFIL]);
    const { rows } = await asPostgres<{ person: number; praxis: number }>(
      `select count(*) filter (where owner_kind = 'person')::int as person,
              count(*) filter (where owner_kind = 'practice')::int as praxis
         from public.nutrition_recipes`,
    );
    expect(rows[0]).toEqual({ person: 0, praxis: 1 });
  });
});

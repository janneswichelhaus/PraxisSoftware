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
 * Ernährungstagebuch (ERN-007, ADR-027 Punkte 2, 3, 9 bis 11; ADR-023
 * Punkte 13, 19, 22 bis 24).
 *
 *   * Die Person und ihre rechtliche Vertretung tragen ein - mit
 *     Einwilligung, eingeschaltetem Tagebuch, an der laufenden Beratung ihres
 *     Zugangs, an einem Tag zwischen Beginn und heute; Werte rechnet der
 *     Server aus Lebensmittel und Menge.
 *   * Wasser mit einem Glas je Tipp, nie unter 0.
 *   * Löschen geht nach einem Widerruf; nichts in der Lesefrist.
 *   * Begleitung, fremde Person, anderer Bereich, gesperrt, entzogen,
 *     Praxiskonto: nichts. Büro, Therapie, Teamleitung, Trainingsbetreuung,
 *     fremde Organisation lesen die Tabellen nicht.
 *   * Auskunft (Art. 15) und Export (Art. 20) tragen das Tagebuch; die
 *     Ansichten des Profils nicht.
 */

const { users, patients, platformAccesses } = SEED;
const ZUGANG = platformAccesses.erikaBehandlung;
const PROFIL = 'f0f0f0f0-f0f0-4f0f-8f0f-000000000001';
const EIGENES_BROT = 'f1f1f1f1-f1f1-4f1f-8f1f-000000000002';
const PRAXIS_PORRIDGE = 'f1f1f1f1-f1f1-4f1f-8f1f-000000000001';
const FASSUNG = '2026-10';

const TAG = 'select public.platform_nutrition_diary($1::uuid, $2::date) as d';
const EINTRAGEN = `select public.add_platform_diary_entry($1::uuid, $2::date, $3, $4, $5::uuid,
  $6::numeric, $7, $8::numeric) as id`;
const AENDERN =
  'select public.update_platform_diary_entry($1::uuid, $2::uuid, $3, $4::numeric, $5::numeric)';
const LOESCHEN = 'select public.delete_platform_diary_entry($1::uuid, $2::uuid)';
const WASSER = 'select public.add_platform_water($1::uuid, $2::date, $3) as ml';
const SCHALTEN = 'select public.set_platform_nutrition_diary($1::uuid, $2)';

interface Eintrag {
  id: string;
  meal: string;
  name: string;
  amount: number;
  portion_label: string | null;
  portion_count: number | null;
  energy_kcal: number;
  protein_g: number;
  fat_g: number;
  carbohydrate_g: number;
}

interface Tag {
  today: string;
  enabled: boolean;
  can_write: boolean;
  can_delete: boolean;
  glass_ml: number;
  targets: { energy_kcal: number; water_ml: number } | null;
  day: {
    day: string;
    meals: { meal: string; entries: Eintrag[]; totals: { energy_kcal: number } }[];
    totals: { energy_kcal: number; protein_g: number; fat_g: number; carbohydrate_g: number };
    water_ml: number;
  };
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function heute(): Promise<string> {
  const { rows } = await asPostgres<{ t: string }>(`select app.training_today($1)::text as t`, [
    SEED.organizationId,
  ]);
  return rows[0]!.t;
}

async function katalog(name: string): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `select id from public.food_catalog where name = $1 and retired_at is null`,
    [name],
  );
  return rows[0]!.id;
}

async function tag(
  datum: string | null = null,
  konto: string = users.plattformErika,
  zugang: string = ZUGANG,
) {
  const { rows } = await asUser<{ d: Tag | null }>(konto, TAG, [zugang, datum]);
  return rows[0]!.d;
}

function eintragen(
  datum: string,
  mahlzeit: string,
  art: string,
  id: string,
  menge: number | null,
  portion: string | null = null,
  anzahl: number | null = null,
  konto: string = users.plattformErika,
  zugang: string = ZUGANG,
) {
  return asUserCommitted<{ id: string }>(konto, EINTRAGEN, [
    zugang,
    datum,
    mahlzeit,
    art,
    id,
    menge,
    portion,
    anzahl,
  ]);
}

async function einschalten() {
  await asUserCommitted(users.plattformErika, SCHALTEN, [ZUGANG, true]);
}

describe('Ernährungstagebuch: eintragen, rechnen, Wasser (ERN-007)', () => {
  let apfel: string;
  let haferflocken: string;
  let datum: string;

  beforeAll(async () => {
    await resetDatabase();
    await asPostgres('delete from public.nutrition_diary_entries');
    await asPostgres('delete from public.nutrition_water_days');
    await asPostgres('update public.nutrition_profiles set diary_enabled = false');
    apfel = await katalog('Apfel roh');
    haferflocken = await katalog('Haferflocken');
    datum = await heute();
  }, 120_000);

  it('ohne eingeschaltetes Tagebuch: lesen ja, eintragen nein', async () => {
    const sicht = await tag();
    expect(sicht).toMatchObject({ enabled: false, can_write: false, can_delete: true });
    expect(await fehler(eintragen(datum, 'breakfast', 'catalog', apfel, 150))).toBe('42501');
    expect(await fehler(asUser(users.plattformErika, WASSER, [ZUGANG, datum, 250]))).toBe('42501');
  });

  it('eingeschaltet: Portion und Menge, Werte aus Lebensmittel und Menge, Summen', async () => {
    await einschalten();
    await eintragen(datum, 'breakfast', 'catalog', haferflocken, null, '1 Portion', 1);
    await eintragen(datum, 'breakfast', 'catalog', apfel, null, '1 Stück (mittel)', 2);
    await eintragen(datum, 'lunch', 'practice', PRAXIS_PORRIDGE, 200);
    await eintragen(datum, 'snack', 'person', EIGENES_BROT, null, '1 Scheibe', 1);

    const sicht = (await tag(datum))!;
    expect(sicht.can_write).toBe(true);
    expect(sicht.day.meals.map((m) => m.meal)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    const fruehstueck = sicht.day.meals[0]!;
    // Haferflocken 50 g: 370 × 0,5 = 185 kcal; Apfel 2 × 150 g: 54 × 3 = 162.
    expect(fruehstueck.entries).toMatchObject([
      { name: 'Haferflocken', amount: 50, portion_label: '1 Portion', energy_kcal: 185 },
      { name: 'Apfel roh', amount: 300, portion_count: 2, energy_kcal: 162, protein_g: 0.9 },
    ]);
    expect(fruehstueck.totals.energy_kcal).toBe(347);
    // Praxis 200 g × 145 = 290; Brot 45 g × 240 = 108.
    expect(sicht.day.totals.energy_kcal).toBe(347 + 290 + 108);
    expect(sicht.targets?.energy_kcal).toBeGreaterThan(0);
    // Wer eingetragen hat, steht nicht in der eigenen Ansicht.
    expect(fruehstueck.entries[0]).not.toHaveProperty('recorded_by_kind');
  });

  it('ändert Mahlzeit und Anzahl; löscht', async () => {
    const sicht = (await tag(datum))!;
    const apfelEintrag = sicht.day.meals[0]!.entries[1]!;
    await asUserCommitted(users.plattformErika, AENDERN, [
      ZUGANG,
      apfelEintrag.id,
      'snack',
      null,
      1,
    ]);
    const geaendert = (await tag(datum))!;
    expect(geaendert.day.meals[3]!.entries.find((e) => e.id === apfelEintrag.id)).toMatchObject({
      amount: 150,
      energy_kcal: 81,
    });
    // Eine Portion lässt sich nicht in eine freie Menge verwandeln.
    expect(
      await fehler(
        asUser(users.plattformErika, AENDERN, [ZUGANG, apfelEintrag.id, 'snack', 90, null]),
      ),
    ).toBe('22023');
    await asUserCommitted(users.plattformErika, LOESCHEN, [ZUGANG, apfelEintrag.id]);
    expect(await fehler(asUser(users.plattformErika, LOESCHEN, [ZUGANG, apfelEintrag.id]))).toBe(
      'P0002',
    );
  });

  it('Wasser: ein Glas je Tipp, zurück, nie unter 0', async () => {
    let r = await asUserCommitted<{ ml: number }>(users.plattformErika, WASSER, [
      ZUGANG,
      datum,
      250,
    ]);
    expect(r.rows[0]!.ml).toBe(250);
    r = await asUserCommitted<{ ml: number }>(users.plattformErika, WASSER, [ZUGANG, datum, 250]);
    expect(r.rows[0]!.ml).toBe(500);
    r = await asUserCommitted<{ ml: number }>(users.plattformErika, WASSER, [ZUGANG, datum, -2000]);
    expect(r.rows[0]!.ml).toBe(0);
    expect(await fehler(asUser(users.plattformErika, WASSER, [ZUGANG, datum, 0]))).toBe('22023');
    expect(await fehler(asUser(users.plattformErika, WASSER, [ZUGANG, datum, 2500]))).toBe('22023');
    await asUserCommitted(users.plattformErika, WASSER, [ZUGANG, datum, 250]);
    expect((await tag(datum))!.day.water_ml).toBe(250);
  });

  it('prüft Tag, Mahlzeit, Portion und Lebensmittel', async () => {
    const { rows } = await asPostgres<{ morgen: string; vorher: string }>(
      `select ($1::date + 1)::text as morgen, (started_on - 1)::text as vorher
       from public.nutrition_profiles where id = $2`,
      [datum, PROFIL],
    );
    const { morgen, vorher } = rows[0]!;
    expect(await fehler(eintragen(morgen, 'lunch', 'catalog', apfel, 100))).toBe('22023');
    expect(await fehler(eintragen(vorher, 'lunch', 'catalog', apfel, 100))).toBe('22023');
    expect(await fehler(tag(morgen))).toBe('22023');
    expect(await fehler(eintragen(datum, 'brunch', 'catalog', apfel, 100))).toBe('22023');
    expect(await fehler(eintragen(datum, 'lunch', 'catalog', apfel, null, '1 Eimer', 1))).toBe(
      '22023',
    );
    expect(
      await fehler(eintragen(datum, 'lunch', 'catalog', apfel, 100, '1 Stück (mittel)', 1)),
    ).toBe('22023');
    expect(await fehler(eintragen(datum, 'lunch', 'catalog', apfel, 0))).toBe('22023');
    expect(await fehler(eintragen(datum, 'lunch', 'catalog', apfel, 6000))).toBe('22023');
    // Falsche Art, unbekannt, zurückgezogen, abgelegt: nicht gefunden.
    expect(await fehler(eintragen(datum, 'lunch', 'person', apfel, 100))).toBe('P0002');
    expect(await fehler(eintragen(datum, 'lunch', 'catalog', PRAXIS_PORRIDGE, 100))).toBe('P0002');
    await asPostgres(`update public.food_catalog set retired_at = now() where id = $1`, [apfel]);
    await asPostgres(`update public.custom_foods set archived_at = now() where id = $1`, [
      PRAXIS_PORRIDGE,
    ]);
    try {
      expect(await fehler(eintragen(datum, 'lunch', 'catalog', apfel, 100))).toBe('P0002');
      expect(await fehler(eintragen(datum, 'lunch', 'practice', PRAXIS_PORRIDGE, 100))).toBe(
        'P0002',
      );
    } finally {
      await asPostgres(`update public.food_catalog set retired_at = null where id = $1`, [apfel]);
      await asPostgres(`update public.custom_foods set archived_at = null where id = $1`, [
        PRAXIS_PORRIDGE,
      ]);
    }
  });

  it('ein eigenes Lebensmittel fällt weg: der Eintrag bleibt mit seinem Stand', async () => {
    await asUserCommitted(
      users.plattformErika,
      'select public.delete_platform_food($1::uuid, $2::uuid)',
      [ZUGANG, EIGENES_BROT],
    );
    const sicht = (await tag(datum))!;
    const brot = sicht.day.meals[3]!.entries.find((e) => e.name === 'Omas Dinkelbrot');
    expect(brot).toMatchObject({ energy_kcal: 108, food_id: null });
  });

  it('höchstens 80 Einträge je Tag', async () => {
    const { rows } = await asPostgres<{ gestern: string }>(
      `select ($1::date - 1)::text as gestern`,
      [datum],
    );
    const gestern = rows[0]!.gestern;
    await asPostgres(
      `insert into public.nutrition_diary_entries (organization_id, profile_id, eaten_on, meal,
         food_kind, catalog_food_id, food_name, base_unit, energy_kcal, protein_g, fat_g,
         carbohydrate_g, amount, platform_access_id, platform_access_kind, created_by, updated_by)
       select $1, $2, $3::date, 'snack', 'catalog', $4, 'Apfel roh', 'g', 54, 0.3, 0.1, 12, 100,
              $5, 'self', $6, $6
       from generate_series(1, 80)`,
      [SEED.organizationId, PROFIL, gestern, apfel, ZUGANG, users.plattformErika],
    );
    expect(await fehler(eintragen(gestern, 'snack', 'catalog', apfel, 100))).toBe('54000');
    await asPostgres(`delete from public.nutrition_diary_entries where eaten_on = $1::date`, [
      gestern,
    ]);
  });
});

describe('Ernährungstagebuch: Auskunft, Export, Widerruf, Löschen mit dem Profil', () => {
  let apfel: string;
  let datum: string;

  beforeAll(async () => {
    await resetDatabase();
    await asPostgres('delete from public.nutrition_diary_entries');
    await asPostgres('delete from public.nutrition_water_days');
    apfel = await katalog('Apfel roh');
    datum = await heute();
    await einschalten();
    await eintragen(datum, 'dinner', 'catalog', apfel, 120);
    await asUserCommitted(users.plattformErika, WASSER, [ZUGANG, datum, 250]);
  }, 120_000);

  it('steht in Auskunft und Export, nicht in den Ansichten des Profils', async () => {
    const { rows: auskunft } = await asUser<{
      d: {
        tabellen: { nutrition_profiles: { diary: { entries: unknown[]; water: unknown[] } }[] };
      };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as d', [
      patients.erika,
    ]);
    const tagebuch = auskunft[0]!.d.tabellen.nutrition_profiles[0]!.diary;
    expect(tagebuch.entries).toHaveLength(1);
    expect(tagebuch.entries[0]).toMatchObject({ name: 'Apfel roh', recorded_by_kind: 'self' });
    expect(tagebuch.water).toEqual([{ drunk_on: datum, water_ml: 250, recorded_by_kind: 'self' }]);

    const { rows: export_ } = await asUser<{
      d: { nutrition: { diary: { entries: Record<string, unknown>[] } }[] };
    }>(users.plattformErika, 'select public.platform_export($1::uuid) as d', [ZUGANG]);
    const exportiert = export_[0]!.d.nutrition[0]!.diary;
    expect(exportiert.entries).toHaveLength(1);
    expect(exportiert.entries[0]).not.toHaveProperty('recorded_by_kind');

    const { rows: plattform } = await asUser<{ d: { profile: Record<string, unknown> } }>(
      users.plattformErika,
      'select public.platform_nutrition($1::uuid) as d',
      [ZUGANG],
    );
    expect(plattform[0]!.d.profile).not.toHaveProperty('diary');
    const { rows: beratung } = await asUser<{ d: { profile: Record<string, unknown> } }>(
      users.ownerTherapist,
      'select public.get_nutrition_profile($1, $2::uuid) as d',
      ['treatment', patients.erika],
    );
    expect(beratung[0]!.d.profile).not.toHaveProperty('diary');
    expect(beratung[0]!.d.profile).toHaveProperty('own_foods');
  });

  it('nach dem Widerruf: nichts Neues, löschen geht', async () => {
    await asUserCommitted(
      users.plattformErika,
      'select public.record_platform_nutrition_consent($1::uuid, false, $2)',
      [ZUGANG, FASSUNG],
    );
    expect((await tag(datum))!.can_write).toBe(false);
    expect(await fehler(eintragen(datum, 'dinner', 'catalog', apfel, 120))).toBe('42501');
    expect(await fehler(asUser(users.plattformErika, WASSER, [ZUGANG, datum, 250]))).toBe('42501');
    const eintrag = (await tag(datum))!.day.meals[2]!.entries[0]!;
    expect(
      await fehler(asUser(users.plattformErika, AENDERN, [ZUGANG, eintrag.id, 'dinner', 80, null])),
    ).toBe('42501');
    await asUserCommitted(users.plattformErika, LOESCHEN, [ZUGANG, eintrag.id]);
  });

  it('fällt mit dem Profil (Datenklasse Ernährungsberatung)', async () => {
    await eintragenRoh(apfel, datum);
    await asPostgres('delete from public.nutrition_profiles where id = $1', [PROFIL]);
    const { rows } = await asPostgres<{ e: number; w: number }>(
      `select (select count(*)::int from public.nutrition_diary_entries) as e,
              (select count(*)::int from public.nutrition_water_days) as w`,
    );
    expect(rows[0]).toEqual({ e: 0, w: 0 });
  });
});

async function eintragenRoh(apfel: string, datum: string) {
  await asPostgres(
    `insert into public.nutrition_diary_entries (organization_id, profile_id, eaten_on, meal,
       food_kind, catalog_food_id, food_name, base_unit, energy_kcal, protein_g, fat_g,
       carbohydrate_g, amount, platform_access_id, platform_access_kind, created_by, updated_by)
     values ($1, $2, $3::date, 'snack', 'catalog', $4, 'Apfel roh', 'g', 54, 0.3, 0.1, 12, 100,
             $5, 'self', $6, $6)`,
    [SEED.organizationId, PROFIL, datum, apfel, ZUGANG, users.plattformErika],
  );
}

describe('Ernährungstagebuch: Negativfälle (ADR-023 Punkt 23, ADR-027 Punkt 4)', () => {
  let apfel: string;
  let datum: string;

  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
    // Ohne Erikas Einträge aus dem Seed: die Fälle zählen ihre eigenen.
    await asPostgres('delete from public.nutrition_diary_entries');
    apfel = await katalog('Apfel roh');
    datum = await heute();
    await einschalten();
    await eintragenRoh(apfel, datum);
  }, 120_000);

  it('Begleitung, anderer Bereich, fremde Person, Praxiskonto: nichts', async () => {
    // Die Begleitung sieht nichts, auch nicht lesend.
    expect(await tag(null, users.plattformPaula, platformAccesses.paulaBegleitungMax)).toBeNull();
    expect(
      await fehler(
        eintragen(
          datum,
          'lunch',
          'catalog',
          apfel,
          100,
          null,
          null,
          users.plattformPaula,
          platformAccesses.paulaBegleitungMax,
        ),
      ),
    ).toBe('42501');
    // Erikas Training hat keine Beratung.
    expect(await tag(null, users.plattformErika, platformAccesses.erikaTraining)).toEqual({
      diary: null,
    });
    expect(
      await fehler(
        eintragen(
          datum,
          'lunch',
          'catalog',
          apfel,
          100,
          null,
          null,
          users.plattformErika,
          platformAccesses.erikaTraining,
        ),
      ),
    ).toBe('P0002');
    const { rows } = await asPostgres<{ id: string }>(
      'select id from public.nutrition_diary_entries limit 1',
    );
    const id = rows[0]!.id;
    expect(
      await fehler(asUser(users.plattformErika, LOESCHEN, [platformAccesses.erikaTraining, id])),
    ).toBe('P0002');
    // Fremde Person mit Erikas Zugang, Praxiskonto mit Erikas Zugang.
    for (const konto of [users.plattformTina, users.ownerTherapist]) {
      expect(await tag(null, konto)).toBeNull();
      expect(
        await fehler(eintragen(datum, 'lunch', 'catalog', apfel, 100, null, null, konto)),
        konto,
      ).toBe('42501');
      expect(await fehler(asUser(konto, LOESCHEN, [ZUGANG, id])), konto).toBe('42501');
      expect(await fehler(asUser(konto, WASSER, [ZUGANG, datum, 250])), konto).toBe('42501');
    }
  });

  it('Büro, Therapie, Teamleitung, Trainingsbetreuung, fremde Organisation: keine Zeile', async () => {
    for (const konto of [
      users.office,
      users.therapist,
      users.teamLead,
      users.trainer,
      FREMDE_ORGANISATION.owner,
    ]) {
      const { rows } = await asUser<{ e: number; w: number }>(
        konto,
        `select (select count(*)::int from public.nutrition_diary_entries) as e,
                (select count(*)::int from public.nutrition_water_days) as w`,
      );
      expect(rows[0], konto).toEqual({ e: 0, w: 0 });
      expect(
        await fehler(
          asUser(
            konto,
            `delete from public.nutrition_diary_entries where profile_id = '${PROFIL}'`,
          ),
        ),
        konto,
      ).toBe('42501');
    }
    // Die Beratung liest mit (zweite Linie: die Policy).
    const { rows } = await asUser<{ n: number }>(
      users.ownerTherapist,
      'select count(*)::int as n from public.nutrition_diary_entries',
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('gesperrt und entzogen: weder lesen noch schreiben', async () => {
    for (const zustand of ['locked', 'revoked'] as const) {
      try {
        await asPostgres(
          `update public.platform_accesses
              set status = $2,
                  locked_at = case when $2 = 'locked' then now() end,
                  locked_by = case when $2 = 'locked' then $3::uuid end,
                  revoked_at = case when $2 = 'revoked' then now() end,
                  revoked_by = case when $2 = 'revoked' then $3::uuid end,
                  revoked_reason = case when $2 = 'revoked' then 'practice' end
            where id = $1`,
          [ZUGANG, zustand, users.office],
        );
        expect(await tag(), zustand).toBeNull();
        expect(await fehler(eintragen(datum, 'lunch', 'catalog', apfel, 100)), zustand).toBe(
          '42501',
        );
        expect(
          await fehler(asUser(users.plattformErika, WASSER, [ZUGANG, datum, 250])),
          zustand,
        ).toBe('42501');
      } finally {
        await resetDatabase();
        await einschalten();
      }
    }
  }, 120_000);

  it('in der Lesefrist: lesen ja, eintragen und löschen nein', async () => {
    await eintragenRoh(apfel, datum);
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 2, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      const sicht = (await tag())!;
      expect(sicht).toMatchObject({ can_write: false, can_delete: false });
      const id = sicht.day.meals[3]!.entries[0]!.id;
      expect(await fehler(eintragen(datum, 'lunch', 'catalog', apfel, 100))).toBe('42501');
      expect(await fehler(asUser(users.plattformErika, LOESCHEN, [ZUGANG, id]))).toBe('42501');
      expect(await fehler(asUser(users.plattformErika, WASSER, [ZUGANG, datum, 250]))).toBe(
        '42501',
      );
    } finally {
      await resetDatabase();
    }
  }, 120_000);

  it('die rechtliche Vertretung trägt ein wie die Person; protokolliert, wer', async () => {
    await einschalten();
    const BERND = 'cafecafe-cafe-4afe-8afe-0000000000e4';
    const KONTO = '99999999-9999-4999-8999-0000000000e4';
    await asPostgres(
      `insert into auth.users (id, aud, role, email)
       values ($1, 'authenticated', 'authenticated', 'bernd.tagebuch@patient.invalid')`,
      [KONTO],
    );
    await asPostgres(
      `insert into public.platform_accesses
         (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
          status, activated_at, access_kind, legal_basis, representative_name, proof_documents,
          health_scope, finance_scope, proof_recorded_by, proof_recorded_at, created_by)
       values ($1, $2, 'treatment', $3, $3, $4, 'active', now(), 'legal_representative',
               'guardianship', 'Bernd Betreuer',
               array['identity_document', 'guardianship_certificate'],
               true, false, $5, now(), $5)`,
      [BERND, SEED.organizationId, patients.erika, KONTO, users.office],
    );
    const { rows } = await eintragen(
      datum,
      'lunch',
      'catalog',
      apfel,
      100,
      null,
      null,
      KONTO,
      BERND,
    );
    const { rows: art } = await asPostgres<{ k: string }>(
      'select platform_access_kind as k from public.nutrition_diary_entries where id = $1',
      [rows[0]!.id],
    );
    expect(art[0]!.k).toBe('legal_representative');
    await asUserCommitted(KONTO, TAG, [BERND, null]);
    const { rows: protokoll } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.audit_log
        where action = 'platform_representation.read' and context ->> 'view' = 'nutrition_diary'
          and context ->> 'platform_access_id' = $1`,
      [BERND],
    );
    // Gleiche Lesevorgänge fasst app.log_record_access zusammen (LOG-001a).
    expect(protokoll[0]!.n).toBeGreaterThanOrEqual(1);
    // Das eigene Lesen steht nicht im Protokoll.
    await asUserCommitted(users.plattformErika, TAG, [ZUGANG, null]);
    const { rows: eigen } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.audit_log
        where context ->> 'view' = 'nutrition_diary' and context ->> 'platform_access_id' = $1`,
      [ZUGANG],
    );
    expect(eigen[0]!.n).toBe(0);
  });
});

describe('Tagebuch schnell: zuletzt, Favoriten, kopieren, Zahlen ausblenden (ERN-008)', () => {
  const FAVORIT = 'select public.set_platform_diary_favorite($1::uuid, $2, $3::uuid, $4)';
  const KOPIEREN = 'select public.copy_platform_diary($1::uuid, $2::date, $3, $4::date, $5) as n';
  const AUSBLENDEN = 'select public.set_platform_diary_hide_numbers($1::uuid, $2)';
  let apfel: string;
  let datum: string;
  let gestern: string;

  interface Schnell {
    hide_numbers: boolean;
    recent: { food: { id: string; name: string }; portion_label: string | null; amount: number }[];
    favorites: { food: { id: string; name: string }; amount: number | null }[];
  }

  async function schnell(): Promise<Schnell> {
    return (await tag()) as unknown as Schnell;
  }

  beforeAll(async () => {
    await resetDatabase();
    apfel = await katalog('Apfel roh');
    datum = await heute();
    const { rows } = await asPostgres<{ g: string }>(`select ($1::date - 1)::text as g`, [datum]);
    gestern = rows[0]!.g;
  }, 120_000);

  it('zuletzt: je Lebensmittel einmal, mit der Menge vom letzten Mal, jüngstes zuerst', async () => {
    await eintragen(datum, 'snack', 'catalog', apfel, null, '1 Stück (mittel)', 2);
    const sicht = await schnell();
    expect(sicht.recent[0]).toMatchObject({
      food: { id: apfel, name: 'Apfel roh' },
      portion_label: '1 Stück (mittel)',
      amount: 300,
    });
    const namen = sicht.recent.map((r) => r.food.name);
    expect(new Set(namen).size).toBe(namen.length);
    // Seed: Haferflocken, Banane, Vollkornnudeln, Omas Dinkelbrot.
    expect(namen).toEqual(
      expect.arrayContaining(['Haferflocken', 'Banane roh', 'Omas Dinkelbrot']),
    );
  });

  it('ein gelöschtes eigenes Lebensmittel fällt aus zuletzt und Favoriten', async () => {
    await asUserCommitted(users.plattformErika, FAVORIT, [ZUGANG, 'person', EIGENES_BROT, true]);
    expect((await schnell()).favorites.map((f) => f.food.name)).toEqual(['Omas Dinkelbrot']);
    await asUserCommitted(
      users.plattformErika,
      'select public.delete_platform_food($1::uuid, $2::uuid)',
      [ZUGANG, EIGENES_BROT],
    );
    const sicht = await schnell();
    expect(sicht.favorites).toEqual([]);
    expect(sicht.recent.map((r) => r.food.name)).not.toContain('Omas Dinkelbrot');
  });

  it('Favoriten: markieren, doppelt ohne Wirkung, abnehmen; nur nutzbare Lebensmittel', async () => {
    await asUserCommitted(users.plattformErika, FAVORIT, [ZUGANG, 'catalog', apfel, true]);
    await asUserCommitted(users.plattformErika, FAVORIT, [ZUGANG, 'catalog', apfel, true]);
    const sicht = await schnell();
    expect(sicht.favorites).toHaveLength(1);
    expect(sicht.favorites[0]).toMatchObject({ food: { id: apfel }, amount: 300 });
    expect(
      await fehler(asUser(users.plattformErika, FAVORIT, [ZUGANG, 'person', apfel, true])),
    ).toBe('P0002');
    await asUserCommitted(users.plattformErika, FAVORIT, [ZUGANG, 'catalog', apfel, false]);
    expect((await schnell()).favorites).toEqual([]);
  });

  it('kopiert eine Mahlzeit und einen Tag, mit Stand und Menge', async () => {
    // Gestern im Seed: Frühstück 1, Mittag 2, Abend 1, Snack 1.
    let r = await asUserCommitted<{ n: number }>(users.plattformErika, KOPIEREN, [
      ZUGANG,
      gestern,
      'lunch',
      datum,
      'dinner',
    ]);
    expect(r.rows[0]!.n).toBe(2);
    let sicht = (await tag(datum))!;
    expect(sicht.day.meals[2]!.entries.map((e) => e.name)).toEqual([
      'Vollkornnudeln gekocht',
      'Apfel roh',
    ]);
    r = await asUserCommitted<{ n: number }>(users.plattformErika, KOPIEREN, [
      ZUGANG,
      gestern,
      null,
      datum,
      null,
    ]);
    expect(r.rows[0]!.n).toBe(5);
    sicht = (await tag(datum))!;
    expect(sicht.day.meals[1]!.entries).toHaveLength(2);
    // Auf sich selbst, in die Zukunft, Mahlzeit ohne Quelle: nein.
    expect(
      await fehler(asUser(users.plattformErika, KOPIEREN, [ZUGANG, datum, 'lunch', datum, null])),
    ).toBe('22023');
    const { rows } = await asPostgres<{ m: string }>(`select ($1::date + 1)::text as m`, [datum]);
    expect(
      await fehler(
        asUser(users.plattformErika, KOPIEREN, [ZUGANG, gestern, null, rows[0]!.m, null]),
      ),
    ).toBe('22023');
    expect(
      await fehler(asUser(users.plattformErika, KOPIEREN, [ZUGANG, gestern, null, datum, 'lunch'])),
    ).toBe('22023');
  });

  it('Zahlen ausblenden: die Einstellung der Person, in Auskunft und Export', async () => {
    await asUserCommitted(users.plattformErika, AUSBLENDEN, [ZUGANG, true]);
    expect((await schnell()).hide_numbers).toBe(true);
    const { rows } = await asUser<{ d: { nutrition: { diary: { hide_numbers: boolean } }[] } }>(
      users.plattformErika,
      'select public.platform_export($1::uuid) as d',
      [ZUGANG],
    );
    expect(rows[0]!.d.nutrition[0]!.diary.hide_numbers).toBe(true);
    await asUserCommitted(users.plattformErika, AUSBLENDEN, [ZUGANG, false]);
  });

  it('Begleitung, Praxiskonto, Widerruf, Lesefrist', async () => {
    for (const [konto, zugang] of [
      [users.plattformPaula, platformAccesses.paulaBegleitungMax],
      [users.ownerTherapist, ZUGANG],
    ] as const) {
      expect(await fehler(asUser(konto, FAVORIT, [zugang, 'catalog', apfel, true])), konto).toBe(
        '42501',
      );
      expect(
        await fehler(asUser(konto, KOPIEREN, [zugang, gestern, null, datum, null])),
        konto,
      ).toBe('42501');
      expect(await fehler(asUser(konto, AUSBLENDEN, [zugang, true])), konto).toBe('42501');
    }
    await asUserCommitted(users.plattformErika, FAVORIT, [ZUGANG, 'catalog', apfel, true]);
    await asUserCommitted(
      users.plattformErika,
      'select public.record_platform_nutrition_consent($1::uuid, false, $2)',
      [ZUGANG, FASSUNG],
    );
    expect(
      await fehler(asUser(users.plattformErika, KOPIEREN, [ZUGANG, gestern, null, datum, null])),
    ).toBe('42501');
    // Abnehmen geht nach dem Widerruf.
    await asUserCommitted(users.plattformErika, FAVORIT, [ZUGANG, 'catalog', apfel, false]);
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 2, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      expect(await fehler(asUser(users.plattformErika, AUSBLENDEN, [ZUGANG, true]))).toBe('42501');
      expect(
        await fehler(asUser(users.plattformErika, FAVORIT, [ZUGANG, 'catalog', apfel, false])),
      ).toBe('42501');
    } finally {
      await resetDatabase();
    }
  }, 120_000);

  it('Büro, Therapie, Teamleitung, Trainingsbetreuung, fremde Organisation: keine Favoriten', async () => {
    await fremdeOrganisation();
    await einschalten();
    await asUserCommitted(users.plattformErika, FAVORIT, [ZUGANG, 'catalog', apfel, true]);
    for (const konto of [
      users.office,
      users.therapist,
      users.teamLead,
      users.trainer,
      FREMDE_ORGANISATION.owner,
    ]) {
      const { rows } = await asUser<{ n: number }>(
        konto,
        'select count(*)::int as n from public.nutrition_diary_favorites',
      );
      expect(rows[0]!.n, konto).toBe(0);
    }
    const { rows } = await asUser<{ n: number }>(
      users.ownerTherapist,
      'select count(*)::int as n from public.nutrition_diary_favorites',
    );
    expect(rows[0]!.n).toBe(1);
  });
});

describe('Die Beratung liest mit (ERN-010)', () => {
  const LESEN = 'select public.get_nutrition_diary($1::uuid, $2::date) as d';

  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  it('sieben Tage bis heute, jüngster zuerst, mit Einträgen, wer, Summen und Wasser', async () => {
    const datum = await heute();
    const { rows } = await asUserCommitted<{
      d: {
        from: string;
        to: string;
        targets: { energy_kcal: number } | null;
        days: {
          day: string;
          water_ml: number;
          totals: { energy_kcal: number };
          meals: { meal: string; entries: { name: string; recorded_by_kind: string }[] }[];
        }[];
      };
    }>(users.ownerTherapist, LESEN, [PROFIL, null]);
    const d = rows[0]!.d;
    expect(d.to).toBe(datum);
    expect(d.days).toHaveLength(7);
    expect(d.days[0]!.day).toBe(datum);
    // Seed: heute Haferflocken (185) und Banane (112), 500 ml.
    expect(d.days[0]).toMatchObject({ water_ml: 500, totals: { energy_kcal: 297 } });
    expect(d.days[0]!.meals[0]!.entries[0]).toMatchObject({
      name: 'Haferflocken',
      recorded_by_kind: 'self',
    });
    expect(d.targets?.energy_kcal).toBeGreaterThan(0);

    // Protokolliert wie das Öffnen der Akte (view nutrition_diary).
    const { rows: protokoll } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.audit_log
        where action = 'patient_record.viewed' and subject_id = $1
          and context ->> 'view' = 'nutrition_diary'`,
      [patients.erika],
    );
    expect(protokoll[0]!.n).toBe(1);
  });

  it('nicht vor dem Beginn der Beratung, nicht in die Zukunft', async () => {
    const { rows } = await asUser<{ d: { from: string; to: string; started_on: string } }>(
      users.ownerTherapist,
      LESEN,
      [PROFIL, '2000-01-01'],
    );
    expect(rows[0]!.d.to).toBe(rows[0]!.d.started_on);
    expect(rows[0]!.d.from).toBe(rows[0]!.d.started_on);
    const { rows: zukunft } = await asUser<{ d: { to: string } }>(users.ownerTherapist, LESEN, [
      PROFIL,
      '2999-01-01',
    ]);
    expect(zukunft[0]!.d.to).toBe(await heute());
  });

  it('Büro, Therapie, Teamleitung, Trainingsbetreuung, fremde Organisation, Person: nichts', async () => {
    for (const konto of [users.office, users.therapist, users.teamLead, users.trainer]) {
      const { rows } = await asUser<{ d: unknown }>(konto, LESEN, [PROFIL, null]);
      expect(rows[0]!.d, konto).toBeNull();
    }
    const { rows: fremd } = await asUser<{ d: unknown }>(FREMDE_ORGANISATION.owner, LESEN, [
      PROFIL,
      null,
    ]);
    expect(fremd[0]!.d).toBeNull();
    // Ein Konto ohne Praxis wird abgewiesen, bevor etwas gelesen wird.
    expect(await fehler(asUser(users.plattformErika, LESEN, [PROFIL, null]))).toBe('42501');
    // Die Abweisung steht im Protokoll.
    const { rows: abgewiesen } = await asUserCommitted<{ d: unknown }>(users.office, LESEN, [
      PROFIL,
      null,
    ]);
    expect(abgewiesen[0]!.d).toBeNull();
    const { rows: protokoll } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.audit_log
        where action = 'access.denied' and actor_user_id = $1
          and context ->> 'operation' = 'nutrition.read'`,
      [users.office],
    );
    expect(protokoll[0]!.n).toBeGreaterThanOrEqual(1);
  });
});

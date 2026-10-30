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
import { NACHZIEHEN, journal, sichern, stehen, zurueckspielen } from './helpers/wiederherstellung';

/**
 * Eigene Lebensmittel der Praxis und der Person (ERN-005, ADR-027 Punkte 6
 * und 9).
 *
 *   * Die Beratung pflegt die Lebensmittel der Praxis; sie erscheinen in jeder
 *     Suche der Organisation, nicht in einer fremden.
 *   * Die Person (und ihre rechtliche Vertretung) legt eigene an - mit
 *     Einwilligung, an der laufenden Beratung; die Begleitung nicht.
 *   * Eigene Lebensmittel stehen im Profil der Beratung, in Auskunft und
 *     Export und fallen mit dem Profil.
 *   * Büro, Therapie, Teamleitung, Trainingsbetreuung: nichts.
 */

const { users, platformAccesses, patients } = SEED;
const PROFIL = 'f0f0f0f0-f0f0-4f0f-8f0f-000000000001';
const SPEICHERN = 'select public.save_practice_food($1::uuid, $2::jsonb, $3::timestamptz) as id';
const PLATTFORM_SPEICHERN = 'select public.save_platform_food($1::uuid, $2::uuid, $3::jsonb) as id';
const PLATTFORM_LOESCHEN = 'select public.delete_platform_food($1::uuid, $2::uuid)';
const FASSUNG = '2026-11';

const MUESLI = {
  name: 'Praxismüsli',
  brand: null,
  base_unit: 'g',
  energy_kcal: 380,
  protein_g: 11,
  fat_g: 8,
  carbohydrate_g: 60,
  sugar_g: 6,
  fibre_g: 9,
  portions: [{ label: '1 Schale', amount: 60 }],
};

const BROT = {
  name: 'Omas Dinkelbrot',
  energy_kcal: 240,
  protein_g: 9,
  fat_g: 2,
  carbohydrate_g: 44,
  portions: [{ label: '1 Scheibe', amount: 45 }],
};

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function suchen(begriff: string, konto: string = users.ownerTherapist) {
  const { rows } = await asUser<{ t: { kind: string; name: string; id: string }[] }>(
    konto,
    'select public.search_foods($1, 20) as t',
    [begriff],
  );
  return rows[0]!.t;
}

describe('Lebensmittel der Praxis (ERN-005)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  it('die Beratung legt an, ändert mit Stand, legt ab; die Suche folgt', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, SPEICHERN, [
      null,
      JSON.stringify(MUESLI),
      null,
    ]);
    const id = rows[0]!.id;
    const treffer = await suchen('Praxismüsli');
    expect(treffer[0]).toMatchObject({ kind: 'practice', id, name: 'Praxismüsli' });
    // Die Person sieht sie in ihrer Suche.
    const { rows: plattform } = await asUser<{ t: { name: string }[] }>(
      users.plattformErika,
      'select public.search_platform_foods($1::uuid, $2, 5) as t',
      [platformAccesses.erikaBehandlung, 'Praxismuesli'],
    );
    expect(plattform[0]!.t[0]!.name).toBe('Praxismüsli');

    const { rows: liste } = await asUser<{ l: { id: string; updated_at: string }[] }>(
      users.ownerTherapist,
      'select public.list_practice_foods() as l',
    );
    expect(liste[0]!.l.map((f) => f.id)).toContain(id);
    const stand = liste[0]!.l.find((f) => f.id === id)!.updated_at;
    await asUserCommitted(users.ownerTherapist, SPEICHERN, [
      id,
      JSON.stringify({ ...MUESLI, energy_kcal: 390 }),
      stand,
    ]);
    // Ein zweites Ändern mit dem alten Stand scheitert verständlich.
    expect(
      await fehler(asUser(users.ownerTherapist, SPEICHERN, [id, JSON.stringify(MUESLI), stand])),
    ).toBe('40001');

    await asUserCommitted(users.ownerTherapist, 'select public.archive_practice_food($1::uuid)', [
      id,
    ]);
    expect(await suchen('Praxismüsli')).toEqual([]);
    expect(
      await fehler(asUser(users.ownerTherapist, SPEICHERN, [id, JSON.stringify(MUESLI), null])),
    ).toBe('P0002');
  });

  it('Büro, Therapie, Teamleitung, Trainingsbetreuung: weder lesen noch schreiben', async () => {
    await asUserCommitted(users.ownerTherapist, SPEICHERN, [null, JSON.stringify(BROT), null]);
    for (const konto of [users.office, users.therapist, users.teamLead, users.trainer]) {
      expect(
        await fehler(asUser(konto, SPEICHERN, [null, JSON.stringify(BROT), null])),
        konto,
      ).toBe('42501');
      expect(await fehler(asUser(konto, 'select public.list_practice_foods()')), konto).toBe(
        '42501',
      );
      const { rows } = await asUser<{ n: number }>(
        konto,
        'select count(*)::int as n from public.custom_foods',
      );
      expect(rows[0]!.n, konto).toBe(0);
      expect(
        await fehler(
          asUser(
            konto,
            `insert into public.custom_foods (organization_id,
        owner_kind, name, energy_kcal, protein_g, fat_g, carbohydrate_g, created_by)
        values ('${SEED.organizationId}', 'practice', 'x', 1, 1, 1, 1, '${konto}')`,
          ),
        ),
      ).toBe('42501');
    }
  });

  it('eine fremde Praxis sieht die Lebensmittel nicht und ändert sie nicht', async () => {
    const { rows } = await asUser<{ l: { id: string }[] }>(
      users.ownerTherapist,
      'select public.list_practice_foods() as l',
    );
    const id = rows[0]!.l[0]!.id;
    // Auch direkt an der Tabelle: die Policy bindet an die eigene Organisation.
    const { rows: direkt } = await asUser<{ n: number }>(
      FREMDE_ORGANISATION.owner,
      'select count(*)::int as n from public.custom_foods',
    );
    expect(direkt[0]!.n).toBe(0);
    expect(await suchen('Dinkelbrot', FREMDE_ORGANISATION.owner)).not.toContainEqual(
      expect.objectContaining({ name: 'Omas Dinkelbrot' }),
    );
    expect(
      await fehler(asUser(FREMDE_ORGANISATION.owner, SPEICHERN, [id, JSON.stringify(BROT), null])),
    ).toBe('P0002');
    expect(
      await fehler(
        asUser(FREMDE_ORGANISATION.owner, 'select public.archive_practice_food($1::uuid)', [id]),
      ),
    ).toBe('P0002');
  });

  it('prüft die Angaben: Pflichtwerte, Grenzen, Portionen, unbekannte Felder', async () => {
    const versuch = (f: Record<string, unknown>) =>
      fehler(
        asUser(users.ownerTherapist, SPEICHERN, [null, JSON.stringify({ ...BROT, ...f }), null]),
      );
    expect(await versuch({ name: ' ' })).toBe('22023');
    expect(await versuch({ fat_g: null })).toBe('22023');
    expect(await versuch({ kcal: 1 })).toBe('22023');
    expect(await versuch({ energy_kcal: 1200 })).toBe('23514');
    expect(await versuch({ protein_g: 70, fat_g: 40 })).toBe('23514');
    expect(await versuch({ base_unit: 'Stück' })).toBe('23514');
    expect(await versuch({ portions: [{ label: 'x', amount: 0 }] })).toBe('23514');
    expect(await versuch({ name: 'x'.repeat(121) })).toBe('23514');
  });
});

describe('Eigene Lebensmittel der Person (ERN-005)', () => {
  beforeAll(async () => {
    await resetDatabase();
    // Ohne Erikas Lebensmittel aus dem Seed: die Fälle zählen ihre eigenen.
    await asPostgres(`delete from public.custom_foods where owner_kind = 'person'`);
  }, 120_000);

  it('die Person legt an, ändert, sieht sie im Profil; die Beratung liest mit', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(
      users.plattformErika,
      PLATTFORM_SPEICHERN,
      [platformAccesses.erikaBehandlung, null, JSON.stringify(BROT)],
    );
    const id = rows[0]!.id;
    await asUserCommitted(users.plattformErika, PLATTFORM_SPEICHERN, [
      platformAccesses.erikaBehandlung,
      id,
      JSON.stringify({ ...BROT, energy_kcal: 250 }),
    ]);

    const { rows: sicht } = await asUser<{
      d: { profile: { own_foods: Record<string, unknown>[] } };
    }>(users.plattformErika, 'select public.platform_nutrition($1::uuid) as d', [
      platformAccesses.erikaBehandlung,
    ]);
    expect(sicht[0]!.d.profile.own_foods).toHaveLength(1);
    expect(sicht[0]!.d.profile.own_foods[0]).toMatchObject({
      id,
      name: 'Omas Dinkelbrot',
      per_100: { energy_kcal: 250 },
    });
    expect(sicht[0]!.d.profile.own_foods[0]).not.toHaveProperty('recorded_by_kind');

    // Nicht in der Suche: die kennt die Person aus ihrem Profil.
    expect(await suchen('Dinkelbrot')).toEqual([]);

    const { rows: beratung } = await asUser<{
      d: { profile: { own_foods: Record<string, unknown>[] } };
    }>(users.ownerTherapist, 'select public.get_nutrition_profile($1, $2::uuid) as d', [
      'treatment',
      patients.erika,
    ]);
    expect(beratung[0]!.d.profile.own_foods[0]).toMatchObject({
      id,
      recorded_by_kind: 'self',
    });
  });

  it('steht in Auskunft (Art. 15) und Export (Art. 20)', async () => {
    const { rows: auskunft } = await asUser<{
      d: { tabellen: { nutrition_profiles: { own_foods: unknown[] }[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as d', [
      patients.erika,
    ]);
    expect(auskunft[0]!.d.tabellen.nutrition_profiles[0]!.own_foods).toHaveLength(1);
    const { rows: export_ } = await asUser<{ d: { nutrition: { own_foods: unknown[] }[] } }>(
      users.plattformErika,
      'select public.platform_export($1::uuid) as d',
      [platformAccesses.erikaBehandlung],
    );
    expect(export_[0]!.d.nutrition[0]!.own_foods).toHaveLength(1);
  });

  it('Begleitung, Zugang ohne Beratung, fremde Person, Praxiskonto: nichts', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `select id from public.custom_foods where profile_id = $1`,
      [PROFIL],
    );
    const id = rows[0]!.id;
    expect(
      await fehler(
        asUser(users.plattformPaula, PLATTFORM_SPEICHERN, [
          platformAccesses.paulaBegleitungMax,
          null,
          JSON.stringify(BROT),
        ]),
      ),
    ).toBe('42501');
    expect(
      await fehler(
        asUser(users.plattformErika, PLATTFORM_SPEICHERN, [
          platformAccesses.erikaTraining,
          null,
          JSON.stringify(BROT),
        ]),
      ),
    ).toBe('P0002');
    // Mit Erikas Training lässt sich ihr Lebensmittel der Behandlung nicht ändern.
    expect(
      await fehler(
        asUser(users.plattformErika, PLATTFORM_LOESCHEN, [platformAccesses.erikaTraining, id]),
      ),
    ).toBe('P0002');
    expect(
      await fehler(
        asUser(users.plattformTina, PLATTFORM_LOESCHEN, [platformAccesses.erikaBehandlung, id]),
      ),
    ).toBe('42501');
    expect(
      await fehler(
        asUser(users.ownerTherapist, PLATTFORM_LOESCHEN, [platformAccesses.erikaBehandlung, id]),
      ),
    ).toBe('42501');
    // Ein Lebensmittel der Praxis ist nicht ihres.
    const { rows: praxis } = await asUserCommitted<{ id: string }>(
      users.ownerTherapist,
      SPEICHERN,
      [null, JSON.stringify(MUESLI), null],
    );
    expect(
      await fehler(
        asUser(users.plattformErika, PLATTFORM_LOESCHEN, [
          platformAccesses.erikaBehandlung,
          praxis[0]!.id,
        ]),
      ),
    ).toBe('P0002');
  });

  it('nach dem Widerruf: nichts Neues, aber löschen geht', async () => {
    await asUserCommitted(
      users.plattformErika,
      'select public.record_platform_nutrition_consent($1::uuid, false, $2)',
      [platformAccesses.erikaBehandlung, FASSUNG],
    );
    expect(
      await fehler(
        asUser(users.plattformErika, PLATTFORM_SPEICHERN, [
          platformAccesses.erikaBehandlung,
          null,
          JSON.stringify(BROT),
        ]),
      ),
    ).toBe('42501');
    const { rows } = await asPostgres<{ id: string }>(
      `select id from public.custom_foods where profile_id = $1`,
      [PROFIL],
    );
    const id = rows[0]!.id;
    await asPostgres(
      `insert into public.nutrition_diary_favorites (organization_id, profile_id, food_kind,
         custom_food_id, platform_access_id, platform_access_kind, created_by)
       values ($1, $2, 'person', $3, $4, 'self', $5)`,
      [SEED.organizationId, PROFIL, id, platformAccesses.erikaBehandlung, users.plattformErika],
    );
    const lebensmittel = await sichern('custom_foods', 'id = $1', [id]);
    const favoriten = await sichern('nutrition_diary_favorites', 'custom_food_id = $1', [id]);
    await asUserCommitted(users.plattformErika, PLATTFORM_LOESCHEN, [
      platformAccesses.erikaBehandlung,
      id,
    ]);
    const { rows: rest } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.custom_foods where profile_id = $1`,
      [PROFIL],
    );
    expect(rest[0]!.n).toBe(0);

    // Im Journal; der Favorit fällt beim Nachziehen mit (ANN-752).
    expect(await journal('custom_foods', [id])).toEqual([
      { target_id: id, retention_class: 'ernaehrungsberatung', reapplied_at: null },
    ]);
    await zurueckspielen('custom_foods', lebensmittel);
    await zurueckspielen('nutrition_diary_favorites', favoriten);
    await asPostgres(NACHZIEHEN);
    expect(await stehen('custom_foods', lebensmittel)).toBe(0);
    expect(await stehen('nutrition_diary_favorites', favoriten)).toBe(0);
  });

  it('fällt mit dem Profil (Datenklasse Ernährungsberatung)', async () => {
    await asPostgres(
      `insert into public.custom_foods (organization_id, owner_kind, profile_id, name, energy_kcal,
         protein_g, fat_g, carbohydrate_g, created_by)
       values ($1, 'person', $2, 'Rest', 1, 1, 1, 1, $3)`,
      [SEED.organizationId, PROFIL, users.plattformErika],
    );
    await asPostgres('delete from public.nutrition_profiles where id = $1', [PROFIL]);
    const { rows } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.custom_foods where owner_kind = 'person'`,
    );
    expect(rows[0]!.n).toBe(0);
    // Die der Praxis bleiben.
    const { rows: praxis } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.custom_foods where owner_kind = 'practice'`,
    );
    expect(praxis[0]!.n).toBeGreaterThan(0);
  });

  it('höchstens 500 eigene je Profil', async () => {
    await resetDatabase();
    await asPostgres(
      `insert into public.custom_foods (organization_id, owner_kind, profile_id, name, energy_kcal,
         protein_g, fat_g, carbohydrate_g, created_by)
       select $1, 'person', $2, 'Nr ' || n, 1, 1, 1, 1, $3 from generate_series(1, 500) n`,
      [SEED.organizationId, PROFIL, users.plattformErika],
    );
    expect(
      await fehler(
        asUser(users.plattformErika, PLATTFORM_SPEICHERN, [
          platformAccesses.erikaBehandlung,
          null,
          JSON.stringify(BROT),
        ]),
      ),
    ).toBe('54000');
  }, 120_000);
});

describe('Eigene Lebensmittel: Negativfälle der Plattform (ADR-023 Punkt 23)', () => {
  const ZUGANG = platformAccesses.erikaBehandlung;
  const ESSEN = 'f1f1f1f1-f1f1-4f1f-8f1f-000000000002';
  const SUCHE = 'select public.search_platform_foods($1::uuid, $2, 5) as t';

  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('gesperrter und entzogener Zugang: weder suchen noch schreiben noch löschen', async () => {
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
        expect(await fehler(asUser(users.plattformErika, SUCHE, [ZUGANG, 'Apfel'])), zustand).toBe(
          '42501',
        );
        expect(
          await fehler(
            asUser(users.plattformErika, PLATTFORM_SPEICHERN, [ZUGANG, null, JSON.stringify(BROT)]),
          ),
          zustand,
        ).toBe('42501');
        expect(
          await fehler(asUser(users.plattformErika, PLATTFORM_LOESCHEN, [ZUGANG, ESSEN])),
          zustand,
        ).toBe('42501');
      } finally {
        await resetDatabase();
      }
    }
  }, 120_000);

  it('in der Lesefrist: nachschlagen ja, anlegen und löschen nein (wie Gewicht)', async () => {
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 2, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      const { rows } = await asUser<{ t: unknown[] }>(users.plattformErika, SUCHE, [
        ZUGANG,
        'Apfel',
      ]);
      expect(rows[0]!.t.length).toBeGreaterThan(0);
      expect(
        await fehler(
          asUser(users.plattformErika, PLATTFORM_SPEICHERN, [ZUGANG, null, JSON.stringify(BROT)]),
        ),
      ).toBe('42501');
      expect(await fehler(asUser(users.plattformErika, PLATTFORM_LOESCHEN, [ZUGANG, ESSEN]))).toBe(
        '42501',
      );
    } finally {
      await resetDatabase();
    }
  }, 120_000);

  it('die rechtliche Vertretung legt an wie die Person; wer, steht am Datensatz', async () => {
    const BERND = 'cafecafe-cafe-4afe-8afe-0000000000e3';
    const KONTO = '99999999-9999-4999-8999-0000000000e3';
    await asPostgres(
      `insert into auth.users (id, aud, role, email)
       values ($1, 'authenticated', 'authenticated', 'bernd.lebensmittel@patient.invalid')`,
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
    const { rows } = await asUserCommitted<{ id: string }>(KONTO, PLATTFORM_SPEICHERN, [
      BERND,
      null,
      JSON.stringify(MUESLI),
    ]);
    const { rows: art } = await asPostgres<{ k: string }>(
      'select platform_access_kind as k from public.custom_foods where id = $1',
      [rows[0]!.id],
    );
    expect(art[0]!.k).toBe('legal_representative');
  });
});

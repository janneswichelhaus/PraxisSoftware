import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

// Barcode (ADR-027 Punkte 8 und 10, ANN-841): nachschlagen nur im eigenen Auszug und nur mit
// laufender Beratung; das eigene Lebensmittel behält ihn mit gültiger Prüfziffer, einmal je
// Profil, in Auskunft und Export, und er fällt mit der Zeile.

const { users, platformAccesses, patients } = SEED;
const NACHSCHLAGEN = 'select public.find_platform_food_by_barcode($1::uuid, $2) as t';
const SPEICHERN = 'select public.save_platform_food($1::uuid, $2::uuid, $3::jsonb) as id';
const ZUGANG = platformAccesses.erikaBehandlung;
const PROFIL = 'f0f0f0f0-f0f0-4f0f-8f0f-000000000001';

// Seed: das synthetische Markenprodukt Nr. 8 (Präfix 200, nie ein echtes Produkt).
const SCHOKOKEKS = '2000000000008';

/** Die Prüfziffer nach GS1 zu den Ziffern ohne sie. */
function mitPruefziffer(ziffern: string): string {
  let summe = 0;
  for (let i = 1; i <= ziffern.length; i += 1) {
    summe += Number(ziffern[ziffern.length - i]) * (i % 2 === 1 ? 3 : 1);
  }
  return `${ziffern}${(10 - (summe % 10)) % 10}`;
}

// Synthetisch: 12 Ziffern mit 2 vorn (Gewichtsware, nie im Handel).
const UPC = mitPruefziffer('21234567890');
const EIGENES = mitPruefziffer('200999000001');

const BROT = {
  name: 'Bäckerbrot vom Markt',
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

async function nachschlagen(
  code: string,
  konto: string = users.plattformErika,
  zugang: string = ZUGANG,
) {
  const { rows } = await asUser<{ t: { kind: string; name: string; source_code: string }[] }>(
    konto,
    NACHSCHLAGEN,
    [zugang, code],
  );
  return rows[0]!.t;
}

async function eigene() {
  const { rows } = await asUser<{
    d: { profile: { own_foods: { id: string; name: string; barcode: string | null }[] } };
  }>(users.plattformErika, 'select public.platform_nutrition($1::uuid) as d', [ZUGANG]);
  return rows[0]!.d.profile.own_foods;
}

describe('Barcode nachschlagen (ERN-013)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await asPostgres(
      `insert into public.food_catalog (source, source_code, name, brand, base_unit, energy_kcal,
         protein_g, fat_g, carbohydrate_g, portions, source_version)
       values ('off', $1, 'Erdnussflips', 'Feldlust', 'g', 520, 13, 30, 50, '[]', 'Seed synthetisch')`,
      [UPC],
    );
  }, 120_000);

  it('findet das Produkt des Auszugs mit Nährwerten und Portionen', async () => {
    const treffer = await nachschlagen(SCHOKOKEKS);
    expect(treffer).toHaveLength(1);
    expect(treffer[0]).toMatchObject({
      kind: 'catalog',
      source: 'off',
      source_code: SCHOKOKEKS,
      name: 'Schokokeks klassisch',
      brand: 'Nordkorn',
      per_100: { protein_g: 6 },
      portions: [{ label: '1 Portion', amount: 25 }],
    });
  });

  it('UPC-A, EAN-13 und GTIN-14 desselben Produkts sind eine Nummer', async () => {
    expect((await nachschlagen(`0${UPC}`))[0]?.name).toBe('Erdnussflips');
    expect((await nachschlagen(`00${UPC}`))[0]?.name).toBe('Erdnussflips');
    expect((await nachschlagen(`0${SCHOKOKEKS}`))[0]?.name).toBe('Schokokeks klassisch');
  });

  it('unbekannt und zurückgezogen: nichts; keine Nummer: abgewiesen', async () => {
    expect(await nachschlagen(mitPruefziffer('200999999999'))).toEqual([]);
    await asPostgres(
      `update public.food_catalog set retired_at = now() where source = 'off' and source_code = $1`,
      [UPC],
    );
    expect(await nachschlagen(UPC)).toEqual([]);
    for (const code of ['', 'abcdefgh', '1234567', '123456789012345', '40063 81333931']) {
      expect(await fehler(nachschlagen(code)), code).toBe('22023');
    }
  });

  it('Begleitung, fremde Person, Zugang ohne Beratung, Praxiskonten: nichts', async () => {
    expect(
      await fehler(
        nachschlagen(SCHOKOKEKS, users.plattformPaula, platformAccesses.paulaBegleitungMax),
      ),
    ).toBe('42501');
    expect(await fehler(nachschlagen(SCHOKOKEKS, users.plattformTina))).toBe('42501');
    expect(
      await fehler(nachschlagen(SCHOKOKEKS, users.plattformErika, platformAccesses.erikaTraining)),
    ).toBe('42501');
    for (const konto of [
      users.ownerTherapist,
      users.office,
      users.therapist,
      users.teamLead,
      users.trainer,
      users.patientErika,
    ]) {
      expect(await fehler(nachschlagen(SCHOKOKEKS, konto)), konto).toBe('42501');
    }
  });

  it('gesperrter und entzogener Zugang: nichts', async () => {
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
        expect(await fehler(nachschlagen(SCHOKOKEKS)), zustand).toBe('42501');
      } finally {
        await resetDatabase();
      }
    }
  }, 120_000);

  it('prüft selbst mit leerem search_path; ohne Anmeldung nicht aufrufbar', async () => {
    const { rows } = await asPostgres<{ prosecdef: boolean; proconfig: string[] | null }>(
      `select p.prosecdef, p.proconfig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'find_platform_food_by_barcode'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.prosecdef).toBe(true);
    expect(rows[0]!.proconfig).toContain('search_path=""');
    await expect(asAnon(NACHSCHLAGEN, [ZUGANG, SCHOKOKEKS])).rejects.toThrow(/permission denied/i);
  });

  it('hält nichts fest: kein Auditeintrag, keine neue Zeile', async () => {
    const zaehlen = () =>
      asPostgres<{ audit: number; essen: number }>(
        `select (select count(*)::int from public.audit_log) as audit,
                (select count(*)::int from public.custom_foods) as essen`,
      );
    const vorher = (await zaehlen()).rows[0];
    await nachschlagen(SCHOKOKEKS);
    expect((await zaehlen()).rows[0]).toEqual(vorher);
  });
});

describe('Barcode am eigenen Lebensmittel (ERN-013)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('die Person behält ihn beim Anlegen; er steht im Profil und bei der Beratung', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.plattformErika, SPEICHERN, [
      ZUGANG,
      null,
      JSON.stringify({ ...BROT, barcode: EIGENES }),
    ]);
    const id = rows[0]!.id;
    expect((await eigene()).find((f) => f.id === id)).toMatchObject({ barcode: EIGENES });
    const { rows: beratung } = await asUser<{
      d: { profile: { own_foods: { id: string; barcode: string | null }[] } };
    }>(users.ownerTherapist, 'select public.get_nutrition_profile($1, $2::uuid) as d', [
      'treatment',
      patients.erika,
    ]);
    expect(beratung[0]!.d.profile.own_foods.find((f) => f.id === id)?.barcode).toBe(EIGENES);
  });

  it('ohne den Schlüssel bleibt er, null und leer nehmen ihn weg', async () => {
    const id = (await eigene()).find((f) => f.barcode === EIGENES)!.id;
    await asUserCommitted(users.plattformErika, SPEICHERN, [
      ZUGANG,
      id,
      JSON.stringify({ ...BROT, energy_kcal: 250 }),
    ]);
    expect((await eigene()).find((f) => f.id === id)?.barcode).toBe(EIGENES);
    await asUserCommitted(users.plattformErika, SPEICHERN, [
      ZUGANG,
      id,
      JSON.stringify({ ...BROT, barcode: null }),
    ]);
    expect((await eigene()).find((f) => f.id === id)?.barcode).toBeNull();
    await asUserCommitted(users.plattformErika, SPEICHERN, [
      ZUGANG,
      id,
      JSON.stringify({ ...BROT, barcode: EIGENES }),
    ]);
    await asUserCommitted(users.plattformErika, SPEICHERN, [
      ZUGANG,
      id,
      JSON.stringify({ ...BROT, barcode: '' }),
    ]);
    expect((await eigene()).find((f) => f.id === id)?.barcode).toBeNull();
    await asUserCommitted(users.plattformErika, SPEICHERN, [
      ZUGANG,
      id,
      JSON.stringify({ ...BROT, barcode: EIGENES }),
    ]);
  });

  it('einmal je Profil, auch mit führenden Nullen; ändern am selben geht', async () => {
    const id = (await eigene()).find((f) => f.barcode === EIGENES)!.id;
    for (const code of [EIGENES, `0${EIGENES}`]) {
      expect(
        await fehler(
          asUser(users.plattformErika, SPEICHERN, [
            ZUGANG,
            null,
            JSON.stringify({ ...BROT, name: 'Zweites', barcode: code }),
          ]),
        ),
        code,
      ).toBe('23505');
    }
    expect(
      await fehler(
        asUser(users.plattformErika, SPEICHERN, [
          ZUGANG,
          id,
          JSON.stringify({ ...BROT, barcode: `0${EIGENES}` }),
        ]),
      ),
    ).toBe('kein Fehler');
  });

  it('nur gültige Nummern; nie an Lebensmitteln der Praxis', async () => {
    const falsch = `${EIGENES.slice(0, -1)}${(Number(EIGENES.at(-1)) + 1) % 10}`;
    for (const code of [falsch, '1234567', 'abcdefghijkl', 4006381333931]) {
      expect(
        await fehler(
          asUser(users.plattformErika, SPEICHERN, [
            ZUGANG,
            null,
            JSON.stringify({ ...BROT, barcode: code }),
          ]),
        ),
        String(code),
      ).toBe('22023');
    }
    expect(
      await fehler(
        asPostgres(`update public.custom_foods set barcode = $1 where owner_kind = 'practice'`, [
          mitPruefziffer('200999000002'),
        ]),
      ),
    ).toBe('23514');
  });

  it('die Begleitung setzt keinen', async () => {
    expect(
      await fehler(
        asUser(users.plattformPaula, SPEICHERN, [
          platformAccesses.paulaBegleitungMax,
          null,
          JSON.stringify({ ...BROT, barcode: mitPruefziffer('200999000003') }),
        ]),
      ),
    ).toBe('42501');
  });

  it('steht in Auskunft (Art. 15) und Export (Art. 20)', async () => {
    const { rows: auskunft } = await asUser<{
      d: { tabellen: { nutrition_profiles: { own_foods: { barcode: string | null }[] }[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as d', [
      patients.erika,
    ]);
    expect(
      auskunft[0]!.d.tabellen.nutrition_profiles[0]!.own_foods.map((f) => f.barcode),
    ).toContain(EIGENES);
    const { rows: export_ } = await asUser<{
      d: { nutrition: { own_foods: { barcode: string | null }[] }[] };
    }>(users.plattformErika, 'select public.platform_export($1::uuid) as d', [ZUGANG]);
    expect(export_[0]!.d.nutrition[0]!.own_foods.map((f) => f.barcode)).toContain(EIGENES);
  });

  it('fällt mit dem Profil', async () => {
    await asPostgres('delete from public.nutrition_profiles where id = $1', [PROFIL]);
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.custom_foods where barcode is not null',
    );
    expect(rows[0]!.n).toBe(0);
  });
});

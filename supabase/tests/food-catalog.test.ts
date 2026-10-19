import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, fremdeOrganisation, resetDatabase } from './helpers/db';

/**
 * Lebensmittelkatalog und Suche (ERN-004, ADR-027 Punkte 7 bis 9; ANN-656
 * bis ANN-659).
 *
 *   * Budget von ERN-EPIC-002: dreizehn Stichwörter treffen unter den ersten
 *     drei, die Suche braucht am Seed weniger als 300 ms.
 *   * Tippfehler finden trotzdem.
 *   * Suchen darf die Beratung und die Person mit laufender Beratung; Büro,
 *     Therapie, Teamleitung, Trainingsbetreuung, Begleitung und Konten ohne
 *     Beratung nicht.
 *   * Die Tabellen sind ohne Recht; den Import ruft nur der Betrieb.
 */

const { users, platformAccesses } = SEED;
const SUCHE = 'select public.search_foods($1, $2) as treffer';
const PLATTFORM = 'select public.search_platform_foods($1::uuid, $2, $3) as treffer';

interface Treffer {
  kind: string;
  id: string;
  source: string;
  name: string;
  brand: string | null;
  base_unit: string;
  per_100: Record<string, number | null>;
  portions: { label: string; amount: number }[];
}

async function suchen(begriff: string, konto: string = users.ownerTherapist): Promise<Treffer[]> {
  const { rows } = await asUser<{ treffer: Treffer[] }>(konto, SUCHE, [begriff, 20]);
  return rows[0]!.treffer;
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

/** Stichwort → das allgemeine Lebensmittel, das unter den ersten drei stehen muss. */
const BUDGET: [string, string][] = [
  ['Apfel', 'Apfel roh'],
  ['Haferflocken', 'Haferflocken'],
  ['Vollkornbrot', 'Vollkornbrot'],
  ['Banane', 'Banane roh'],
  ['Milch', 'Milch 1,5 % Fett'],
  ['Joghurt', 'Joghurt natur 1,5 % Fett'],
  ['Magerquark', 'Magerquark'],
  ['Hühnerei', 'Hühnerei gekocht'],
  ['Reis', 'Reis gekocht'],
  ['Kartoffeln', 'Kartoffeln gekocht'],
  ['Hähnchenbrust', 'Hähnchenbrust gebraten'],
  ['Olivenöl', 'Olivenöl'],
  ['Gouda', 'Gouda 45 % Fett i. Tr.'],
];

describe('Lebensmittelsuche: Rangfolge und Laufzeit (ERN-004)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it.each(BUDGET)('„%s“ trifft „%s“ unter den ersten drei', async (begriff, erwartet) => {
    const treffer = await suchen(begriff);
    expect(treffer.slice(0, 3).map((t) => t.name)).toContain(erwartet);
  });

  it('allgemeine Lebensmittel stehen vor Markenprodukten mit demselben Wort', async () => {
    const treffer = await suchen('Apfel');
    expect(treffer[0]!.name).toBe('Apfel roh');
    expect(treffer[0]!.source).toBe('bls');
    // Die Verwechsler kommen danach, Marken zuletzt.
    const ersteMarke = treffer.findIndex((t) => t.source === 'off');
    const letztesAllgemeines = treffer.map((t) => t.source).lastIndexOf('bls');
    if (ersteMarke >= 0) expect(ersteMarke).toBeGreaterThan(letztesAllgemeines);
  });

  it('findet trotz Tippfehlern, Umlauten ohne Punkte und Großschreibung', async () => {
    expect((await suchen('Hafeflocken')).slice(0, 3).map((t) => t.name)).toContain('Haferflocken');
    expect((await suchen('vollkonbrot')).slice(0, 3).map((t) => t.name)).toContain('Vollkornbrot');
    expect((await suchen('Huehnerei')).map((t) => t.name)).toContain('Hühnerei gekocht');
    expect((await suchen('MAGERQUARK'))[0]!.name).toBe('Magerquark');
    expect((await suchen('olivenol'))[0]!.name).toBe('Olivenöl');
  });

  it('normalisiert wie die Umwandler (scripts/lebensmittel/gemeinsam.mjs)', async () => {
    const { rows } = await asPostgres<{ k: string[] }>(
      `select array[app.food_search_key('Käse'), app.food_search_key('Kaese'),
                    app.food_search_key('Hühnerei, gekocht'), app.food_search_key('Weißbrot'),
                    app.food_search_key('  Crème fraîche 30 %  '), app.food_search_key('ÄPFEL')] as k`,
    );
    expect(rows[0]!.k).toEqual([
      'kase',
      'kase',
      'huhnerei gekocht',
      'weissbrot',
      'creme fraiche 30',
      'apfel',
    ]);
  });

  it('mehrere Wörter: jedes muss passen, auch Marke und Name gemischt', async () => {
    const treffer = await suchen('Haferhaus Haferriegel');
    expect(treffer.length).toBeGreaterThan(0);
    for (const t of treffer) {
      expect(t.brand).toBe('Haferhaus');
      expect(t.name.startsWith('Haferriegel')).toBe(true);
    }
  });

  it('liefert Nährwerte je 100, Grundeinheit und Portionen der Quelle', async () => {
    const [apfel] = await suchen('Apfel');
    expect(apfel).toMatchObject({
      kind: 'catalog',
      base_unit: 'g',
      portions: [{ label: '1 Stück (mittel)', amount: 150 }],
    });
    expect(apfel!.per_100).toMatchObject({ energy_kcal: 54, protein_g: 0.3, fat_g: 0.1 });
    const [saft] = await suchen('Apfelsaft');
    expect(saft!.base_unit).toBe('ml');
  });

  it('zu kurze oder leere Begriffe liefern nichts; höchstens 50 Treffer', async () => {
    expect(await suchen('a')).toEqual([]);
    expect(await suchen('  ')).toEqual([]);
    expect(await suchen('%_')).toEqual([]);
    const { rows } = await asUser<{ treffer: Treffer[] }>(users.ownerTherapist, SUCHE, [
      'Haferriegel',
      500,
    ]);
    expect(rows[0]!.treffer).toHaveLength(50);
  });

  it('bleibt am Seed unter 300 ms je Suche (Budget ERN-EPIC-002)', async () => {
    const { rows: anzahl } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.food_catalog',
    );
    expect(anzahl[0]!.n).toBeGreaterThan(20_000);
    for (const [begriff] of [...BUDGET, ['Hafeflocken'], ['Schoko']]) {
      // Gemessen in der Datenbank, ohne Verbindungsaufbau: die Zeit der Suche.
      const { rows } = await asPostgres<{ ms: number }>(
        `select (extract(epoch from clock_timestamp() - t0) * 1000)::float8 as ms
         from (select clock_timestamp() as t0) s,
              lateral (select app.food_search($1::uuid, $2, 20)) x`,
        [SEED.organizationId, begriff],
      );
      expect(rows[0]!.ms, begriff).toBeLessThan(300);
    }
  });
});

describe('Lebensmittelsuche: wer darf (ERN-004)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  it('Büro, Therapie, Teamleitung, Trainingsbetreuung und Konten ohne Rolle: abgewiesen', async () => {
    for (const konto of [
      users.office,
      users.therapist,
      users.teamLead,
      users.trainer,
      users.patientErika,
      users.plattformErika,
    ]) {
      expect(await fehler(suchen('Apfel', konto)), konto).toBe('42501');
    }
  });

  it('ohne Anmeldung: keine Suche, keine Quellen', async () => {
    expect(await fehler(asUser(null, SUCHE, ['Apfel', 20]))).toBe('42501');
    const { rows } = await asUser<{ q: unknown }>(null, 'select public.list_food_sources() as q');
    expect(rows[0]!.q).toEqual([]);
  });

  it('die Person mit laufender Beratung sucht auf der Plattform', async () => {
    const { rows } = await asUser<{ treffer: Treffer[] }>(users.plattformErika, PLATTFORM, [
      platformAccesses.erikaBehandlung,
      'Haferflocken',
      10,
    ]);
    expect(rows[0]!.treffer[0]!.name).toBe('Haferflocken');
  });

  it('Begleitung, Zugang ohne Beratung, fremder Zugang: abgewiesen', async () => {
    // Paula begleitet Max: sieht von der Ernährung nichts (ADR-027 Punkt 3).
    expect(
      await fehler(
        asUser(users.plattformPaula, PLATTFORM, [platformAccesses.paulaBegleitungMax, 'Apfel', 10]),
      ),
    ).toBe('42501');
    // Erikas Training hat keine Beratung.
    expect(
      await fehler(
        asUser(users.plattformErika, PLATTFORM, [platformAccesses.erikaTraining, 'Apfel', 10]),
      ),
    ).toBe('42501');
    // Tina mit Erikas Zugang.
    expect(
      await fehler(
        asUser(users.plattformTina, PLATTFORM, [platformAccesses.erikaBehandlung, 'Apfel', 10]),
      ),
    ).toBe('42501');
    // Ein Praxiskonto über die Plattformfunktion.
    expect(
      await fehler(
        asUser(users.ownerTherapist, PLATTFORM, [platformAccesses.erikaBehandlung, 'Apfel', 10]),
      ),
    ).toBe('42501');
  });

  it('die Quellenangabe nennt BLS und Open Food Facts mit Lizenz und Stand', async () => {
    const { rows } = await asUser<{ q: Record<string, unknown>[] }>(
      users.plattformErika,
      'select public.list_food_sources() as q',
    );
    expect(rows[0]!.q.map((q) => [q.source, q.license])).toEqual([
      ['bls', 'CC BY 4.0'],
      ['off', 'ODbL 1.0'],
    ]);
    expect(String(rows[0]!.q[0]!.attribution)).toContain('Max Rubner-Institut');
    expect(String(rows[0]!.q[0]!.attribution)).toContain('Geändert');
    expect(rows[0]!.q[0]!.version).toBe('Seed synthetisch');
  });

  it('die Tabellen sind ohne Recht; den Import ruft die Anwendung nicht', async () => {
    for (const tabelle of ['food_catalog', 'food_sources']) {
      expect(
        await fehler(asUser(users.ownerTherapist, `select * from public.${tabelle} limit 1`)),
      ).toBe('42501');
    }
    expect(
      await fehler(
        asUser(
          users.ownerTherapist,
          `select app.import_food_catalog_batch('bls', 'x', '[]'::jsonb)`,
        ),
      ),
    ).toBe('42501');
    expect(
      await fehler(
        asUser(users.ownerTherapist, `select app.finish_food_catalog_import('bls', 'x')`),
      ),
    ).toBe('42501');
    expect(
      await fehler(asUser(users.ownerTherapist, `select app.food_search(null, 'apfel', 5)`)),
    ).toBe('42501');
  });
});

describe('Lebensmittelkatalog: Import (ERN-004, ANN-659)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('fügt ein, aktualisiert, zieht Fehlendes zurück und vermerkt den Stand', async () => {
    const zeile = (code: string, name: string, kcal: number) => ({
      source_code: code,
      name,
      energy_kcal: kcal,
      protein_g: 1,
      fat_g: 0.5,
      carbohydrate_g: 10,
      sugar_g: 8,
      fibre_g: 2,
      salt_g: 0.01,
      portions: [{ label: '1 Stück', amount: 100 }],
    });
    const { rows: erst } = await asPostgres<{ n: number }>(
      `select app.import_food_catalog_batch('bls', '4.0', $1::jsonb) as n`,
      [JSON.stringify([zeile('A100000', 'Quitte roh', 40), zeile('A100001', 'Mispel roh', 50)])],
    );
    expect(erst[0]!.n).toBe(2);
    const { rows: zurueck } = await asPostgres<{ n: number }>(
      `select app.finish_food_catalog_import('bls', '4.0') as n`,
    );
    // Alle synthetischen BLS-Zeilen des Seeds fehlen im Stand 4.0.
    expect(zurueck[0]!.n).toBeGreaterThan(100);

    const treffer = await suchen('Quitte');
    expect(treffer[0]).toMatchObject({ name: 'Quitte roh', source: 'bls' });
    expect(await suchen('Apfel roh')).not.toContainEqual(
      expect.objectContaining({ name: 'Apfel roh' }),
    );

    // Ein neuer Stand ändert Werte; was wieder auftaucht, kommt zurück.
    await asPostgres(`select app.import_food_catalog_batch('bls', '4.0.1', $1::jsonb)`, [
      JSON.stringify([zeile('A100000', 'Quitte roh', 41)]),
    ]);
    await asPostgres(`select app.finish_food_catalog_import('bls', '4.0.1')`);
    expect((await suchen('Quitte'))[0]!.per_100.energy_kcal).toBe(41);
    expect(await suchen('Mispel')).toEqual([]);

    const { rows: quelle } = await asPostgres<{ version: string; item_count: number }>(
      `select version, item_count from public.food_sources where source = 'bls'`,
    );
    expect(quelle[0]).toEqual({ version: '4.0.1', item_count: 1 });
  });

  it('weist ungültige Zeilen ab: Schlüssel, Werte, Portionen', async () => {
    const versuch = (zeile: Record<string, unknown>, quelle = 'bls') =>
      fehler(
        asPostgres(`select app.import_food_catalog_batch($1, '9', $2::jsonb)`, [
          quelle,
          JSON.stringify([
            {
              source_code: 'A200000',
              name: 'X',
              energy_kcal: 1,
              protein_g: 1,
              fat_g: 1,
              carbohydrate_g: 1,
              ...zeile,
            },
          ]),
        ]),
      );
    expect(await versuch({ source_code: '12345' })).toBe('23514');
    expect(await versuch({ source_code: 'A200000' }, 'off')).toBe('23514');
    expect(await versuch({ energy_kcal: 2000 })).toBe('23514');
    expect(await versuch({ protein_g: 60, fat_g: 60 })).toBe('23514');
    expect(await versuch({ portions: [{ label: '', amount: 10 }] })).toBe('23514');
    expect(await versuch({ portions: [{ label: 'x', amount: 10, extra: 1 }] })).toBe('23514');
    expect(await versuch({ brand: 'Marke' })).toBe('23514');
    expect(await fehler(asPostgres(`select app.import_food_catalog_batch('xyz', '9', '[]')`))).toBe(
      '22023',
    );
  });
});

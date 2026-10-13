import { createHash } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  planeEntfernen,
  resetDatabase,
} from './helpers/db';
import { praxistag } from './helpers/plaene';
import { KATALOG, katalogeintrag } from '@/features/exercises/katalog';
import { ausruestungVon } from '@/features/exercises/katalog/schema';
import {
  AUSGANGSSTELLUNGEN,
  HILFSMITTEL_LABEL,
  ZIELE,
  type Katalogeintrag,
} from '@/features/exercises/katalog/typen';

/**
 * Der Übungskatalog in der Datenbank (UEB-012, ANN-381 bis ANN-386).
 *
 *   * Übernehmen darf owner, sonst niemand (ANN-293, ANN-385) - weder
 *     therapist, Büro, Trainingsbetreuung, Teamleitung noch ein
 *     Plattformkonto oder anon; die interne Fassung niemand.
 *   * Geprüft wird alles am Server: Werte, Längen, Größen; ein ungültiger
 *     Eintrag übernimmt nichts.
 *   * Ein zweiter Import legt nichts doppelt an und überschreibt nie, was die
 *     Praxis geändert hat; Namenskonflikte werden gemeldet.
 *   * Bild und Dosierung werden beim Zuweisen eingefroren (ANN-300), die
 *     Plattform zeigt das eingefrorene Bild.
 *   * Die andere Organisation bleibt unberührt (ADR-003).
 */

const { users, organizationId, patients, platformAccesses } = SEED;

const IMPORT = 'select public.import_exercise_catalog($1::jsonb) as ergebnis';
const LISTE = 'select public.list_exercise_library() as bibliothek';

interface Ergebnis {
  imported: string[];
  skipped: string[];
  conflicts: { catalog_key: string; name: string }[];
}

interface Variante {
  id: string;
  name: string;
  lay_name: string;
  instruction: string | null;
  equipment: string[];
  common_faults: string | null;
  practice_notes: string | null;
  catalog_key: string | null;
  catalog_version: string | null;
  goal: string | null;
  starting_position: string | null;
  level: number | null;
  default_dosage: Record<string, unknown> | null;
  illustration: unknown;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
}

async function importiere(konto: string, eintraege: unknown): Promise<Ergebnis> {
  const { rows } = await asUserCommitted<{ ergebnis: Ergebnis }>(konto, IMPORT, [
    JSON.stringify(eintraege),
  ]);
  return rows[0]!.ergebnis;
}

async function katalogvarianten(org: string = organizationId): Promise<Variante[]> {
  const { rows } = await asPostgres<{ catalog_key: string }>(
    `select catalog_key from public.exercise_variants
      where organization_id = $1 and catalog_key is not null order by catalog_key`,
    [org],
  );
  if (org !== organizationId) return rows as unknown as Variante[];
  const { rows: b } = await asUser<{
    bibliothek: { exercises: { variants: Variante[] }[] };
  }>(users.ownerTherapist, LISTE);
  return b[0]!.bibliothek.exercises
    .flatMap((u) => u.variants)
    .filter((v) => v.catalog_key !== null)
    .sort((a, c) => a.catalog_key!.localeCompare(c.catalog_key!));
}

/** Entfernt, was der Seed übernommen hat - danach ist die Bibliothek ohne Katalog. */
async function katalogEntfernen(): Promise<void> {
  await planeEntfernen();
  await asPostgres(`
    delete from public.exercise_variant_links;
    delete from public.exercise_variants where catalog_key is not null;
    delete from public.exercises e
     where not exists (select 1 from public.exercise_variants v where v.exercise_id = e.id);
  `);
}

const KN01 = katalogeintrag('KN-01')!;
const KN07 = katalogeintrag('KN-07')!;
const MIT_BILD = KATALOG.filter((e) => e.bild);

function mit(e: Katalogeintrag, aenderung: Record<string, unknown>): Record<string, unknown> {
  return { ...e, ...aenderung };
}

describe('Übungskatalog im Seed (UEB-012)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('hat den ganzen Katalog übernommen, mit festen Kennungen', async () => {
    const varianten = await katalogvarianten();
    expect(varianten.map((v) => v.catalog_key)).toEqual(KATALOG.map((e) => e.schluessel).sort());
    const kn01 = varianten.find((v) => v.catalog_key === 'KN-01')!;
    const md5 = createHash('md5')
      .update(`${organizationId}:variante:KN-01`)
      .digest('hex')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
    expect(kn01.id).toBe(md5);
  });

  it('behält die neun Übungen des Seeds mit ihren Kennungen', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `select e.id from public.exercises e
        where e.organization_id = $1
          and not exists (select 1 from public.exercise_variants v
                           where v.exercise_id = e.id and v.catalog_key is not null)
        order by e.id`,
      [organizationId],
    );
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 9 }, (_, i) => `abababab-abab-4bab-8bab-00000000000${i + 1}`),
    );
  });

  it('hält die festen Listen in Datenbank und Oberfläche gleich (ANN-383)', async () => {
    const { rows } = await asPostgres<{
      ziele: string[];
      stellungen: string[];
      hilfsmittel: object;
    }>(
      `select app.exercise_goals() as ziele, app.exercise_starting_positions() as stellungen,
              app.exercise_equipment_labels() as hilfsmittel`,
    );
    expect(rows[0]!.ziele).toEqual([...ZIELE]);
    expect(rows[0]!.stellungen).toEqual([...AUSGANGSSTELLUNGEN]);
    expect(rows[0]!.hilfsmittel).toEqual(HILFSMITTEL_LABEL);
  });
});

describe('Katalog übernehmen (UEB-012, ANN-385)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await katalogEntfernen();
    await asPostgres('delete from public.exercise_variants where organization_id = $1', [
      FREMDE_ORGANISATION.organizationId,
    ]);
    await asPostgres('delete from public.exercises where organization_id = $1', [
      FREMDE_ORGANISATION.organizationId,
    ]);
  });

  it('übernimmt als owner jeden Eintrag als Übung mit Variante, geprüft und vollständig', async () => {
    const ergebnis = await importiere(users.ownerTherapist, KATALOG);
    expect(ergebnis.imported).toEqual(KATALOG.map((e) => e.schluessel));
    expect(ergebnis.skipped).toEqual([]);
    expect(ergebnis.conflicts).toEqual([]);

    const kn01 = (await katalogvarianten()).find((v) => v.catalog_key === 'KN-01')!;
    expect(kn01).toMatchObject({
      name: KN01.name,
      lay_name: KN01.alltagsname,
      catalog_version: '1.0.0',
      goal: 'kraft',
      starting_position: 'sitz',
      level: 1,
      instruction: KN01.anleitung.join('\n'),
      common_faults: KN01.fehler.join('\n'),
      practice_notes: KN01.hinweise_praxis,
      equipment: ausruestungVon(KN01),
      // Die Standarddosierung in der Form der Planposition (ANN-384).
      default_dosage: {
        sets: 3,
        reps_min: 10,
        reps_max: 10,
        hold_seconds: 3,
        per_side: true,
        times_per_day: 1,
      },
      illustration: KN01.bild,
      reviewed_at: null,
    });
    // Eine Übung ohne Bild bleibt ohne Bild.
    const ohne = KATALOG.find((e) => !e.bild)!;
    expect(
      (await katalogvarianten()).find((v) => v.catalog_key === ohne.schluessel)!.illustration,
    ).toBeNull();
    // Wer übernommen hat, steht an der Zeile (ADR-010 Fassung 3).
    const { rows } = await asPostgres<{ created_by: string }>(
      `select distinct created_by from public.exercise_variants where catalog_key is not null`,
    );
    expect(rows).toEqual([{ created_by: users.ownerTherapist }]);
  });

  it('legt beim zweiten Import nichts doppelt an und überschreibt nie, was die Praxis geändert hat', async () => {
    await importiere(users.ownerTherapist, KATALOG);
    const kn01 = (await katalogvarianten()).find((v) => v.catalog_key === 'KN-01')!;
    await asUserCommitted(
      users.ownerTherapist,
      `select public.save_exercise_variant($1::uuid, null, 'Kniestreckung, eigene Fassung', 'Knie strecken',
         'Eigene Anleitung.', array['Stuhl']::text[], null, null)`,
      [kn01.id],
    );

    const zweites = await importiere(users.ownerTherapist, KATALOG);
    expect(zweites.imported).toEqual([]);
    expect(zweites.skipped).toEqual(KATALOG.map((e) => e.schluessel));

    const nachher = await katalogvarianten();
    expect(nachher).toHaveLength(KATALOG.length);
    expect(nachher.find((v) => v.catalog_key === 'KN-01')).toMatchObject({
      name: 'Kniestreckung, eigene Fassung',
      instruction: 'Eigene Anleitung.',
    });
  });

  it('meldet einen Namenskonflikt, überspringt den Eintrag und übernimmt die übrigen', async () => {
    await asUserCommitted(
      users.ownerTherapist,
      "select public.save_exercise(null, $1, 'Eigene Übung', 'knie')",
      [KN01.name.toUpperCase()],
    );
    const ergebnis = await importiere(users.ownerTherapist, [KN01, KN07]);
    expect(ergebnis.conflicts).toEqual([{ catalog_key: 'KN-01', name: KN01.name }]);
    expect(ergebnis.imported).toEqual(['KN-07']);
    const { rows } = await asPostgres<{ anzahl: number }>(
      'select count(*)::int as anzahl from public.exercises where lower(name) = lower($1)',
      [KN01.name],
    );
    expect(rows[0]!.anzahl).toBe(1);
  });

  it.each([
    ['Therapeut:in', users.therapist],
    ['Büro', users.office],
    ['Trainingsbetreuung', users.trainer],
    ['Teamleitung', users.teamLead],
    ['Profil ohne Praxisrolle', users.patientMax],
    ['Plattformkonto', users.plattformErika],
    ['Begleitung', users.plattformPaula],
  ])('weist %s ab (42501) und übernimmt nichts', async (_wer, konto) => {
    await expect(asUserCommitted(konto, IMPORT, [JSON.stringify([KN01])])).rejects.toMatchObject({
      code: '42501',
    });
    expect(await katalogvarianten()).toEqual([]);
  });

  it('weist anon und eine Sitzung ohne Konto ab', async () => {
    await expect(asAnon(IMPORT, [JSON.stringify([KN01])])).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asUser(null, IMPORT, [JSON.stringify([KN01])])).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('sperrt die interne Fassung für jede Anwendungsrolle', async () => {
    const intern =
      'select app.import_exercise_catalog_for($1::uuid, $2::uuid, $3::jsonb, false) as ergebnis';
    for (const konto of [users.ownerTherapist, users.therapist]) {
      await expect(
        asUser(konto, intern, [organizationId, konto, JSON.stringify([KN01])]),
      ).rejects.toMatchObject({ code: '42501' });
    }
    await expect(
      asAnon(intern, [organizationId, users.ownerTherapist, JSON.stringify([KN01])]),
    ).rejects.toMatchObject({ code: '42501' });
    // Sie prüft keine Rolle selbst und läuft deshalb mit den Rechten des
    // Aufrufers - nie mit eigenen (Zweitreview UEB-012).
    const { rows } = await asPostgres<{ definer: boolean }>(
      `select prosecdef as definer from pg_proc
        where oid = 'app.import_exercise_catalog_for(uuid, uuid, jsonb, boolean)'::regprocedure`,
    );
    expect(rows).toEqual([{ definer: false }]);
  });

  it('lässt die andere Organisation unberührt - in beide Richtungen (ADR-003)', async () => {
    await importiere(users.ownerTherapist, [KN01]);
    expect(await katalogvarianten(FREMDE_ORGANISATION.organizationId)).toEqual([]);

    const fremd = await importiere(FREMDE_ORGANISATION.owner, [KN01, KN07]);
    // Derselbe Schlüssel in der anderen Praxis ist kein "schon vorhanden".
    expect(fremd.imported).toEqual(['KN-01', 'KN-07']);
    expect((await katalogvarianten()).map((v) => v.catalog_key)).toEqual(['KN-01']);
    expect(
      (await katalogvarianten(FREMDE_ORGANISATION.organizationId)).map((v) => v.catalog_key),
    ).toEqual(['KN-01', 'KN-07']);
  });

  describe('prüft am Server und übernimmt bei einem Fehler nichts (22023)', () => {
    const gross = { ...KN01.bild, fuellung: 'a'.repeat(4100) };
    it.each([
      ['ein zu großes Bild', [mit(KN01, { bild: gross })]],
      ['ein Bild als Zeichenkette', [mit(KN01, { bild: '<svg onload="x()"/>' })]],
      ['ein Bild einer späteren Fassung', [mit(KN01, { bild: { ...KN01.bild, v: 2 } })]],
      ['ein Bild ohne Start', [mit(KN01, { bild: { v: 1, basis: 'stand', ende: {} } })]],
      ['ein unbekanntes Hilfsmittel', [mit(KN01, { hilfsmittel: ['hantelbank'] })]],
      ['ein doppeltes Hilfsmittel', [mit(KN01, { hilfsmittel: ['stuhl', 'stuhl'] })]],
      ['eine unbekannte Körperregion', [mit(KN01, { region: 'zeh' })]],
      ['ein unbekanntes Ziel', [mit(KN01, { ziel: 'abnehmen' })]],
      ['eine unbekannte Ausgangsstellung', [mit(KN01, { ausgangsstellung: 'kopfstand' })]],
      ['ein Niveau 4', [mit(KN01, { niveau: 4 })]],
      ['einen zu langen Namen', [mit(KN01, { name: 'K'.repeat(121) })]],
      ['einen zu langen Schritt', [mit(KN01, { anleitung: ['A'.repeat(241)] })]],
      ['eine leere Anleitung', [mit(KN01, { anleitung: [] })]],
      [
        'Wiederholungen und Dauer zugleich',
        [mit(KN01, { dosierung: { wiederholungen: 10, dauer_s: 30 } })],
      ],
      ['Halten ohne Wiederholungen', [mit(KN01, { dosierung: { dauer_s: 30, halten_s: 5 } })]],
      ['Wiederholungen als Text', [mit(KN01, { dosierung: { wiederholungen: '10' } })]],
      ['ein Feld „Krankheitsbild“', [mit(KN01, { krankheitsbild: 'Gonarthrose' })]],
      ['einen falschen Schlüssel', [mit(KN01, { schluessel: 'kn-1' })]],
      ['eine falsche Fassung', [mit(KN01, { version: 'neu' })]],
      ['einen doppelten Schlüssel', [KN01, mit(KN07, { schluessel: 'KN-01' })]],
      ['einen gültigen und einen ungültigen Eintrag', [KN07, mit(KN01, { niveau: 0 })]],
      ['eine leere Liste', []],
      ['ein Objekt statt einer Liste', { eintraege: [KN01] }],
      ['mehr als 500 Einträge', Array.from({ length: 501 }, () => KN01)],
    ])('weist ab: %s', async (_fall, eintraege) => {
      await expect(
        asUserCommitted(users.ownerTherapist, IMPORT, [JSON.stringify(eintraege)]),
      ).rejects.toMatchObject({ code: '22023' });
      expect(await katalogvarianten()).toEqual([]);
    });

    it('hält die Grenzen auch an der Tabelle fest', async () => {
      await importiere(users.ownerTherapist, [KN01]);
      for (const [spalte, wert] of [
        ['illustration', JSON.stringify(gross)],
        ['illustration', '"bild"'],
        // Fehlt ein Teil, ist die Prüfung nicht "unbekannt", sondern falsch.
        ['illustration', '{"v": 1, "basis": "stand", "ende": {}}'],
        ['default_dosage', '{"reps_min": 10, "reps_max": 10}'],
        ['default_dosage', '{"sets": 3, "reps_min": 10, "reps_max": 10, "duration_seconds": 30}'],
        ['default_dosage', '{"sets": 3, "duration_seconds": 30, "hold_seconds": 5}'],
        ['default_dosage', '{"sets": 0, "reps_min": 10, "reps_max": 10}'],
      ] as const) {
        await expect(
          asPostgres(
            `update public.exercise_variants set ${spalte} = $1::jsonb where catalog_key = 'KN-01'`,
            [wert],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
    });
  });

  it('setzt den Prüfvermerk nur als owner, mit Person und Zeit (ANN-386)', async () => {
    await importiere(users.ownerTherapist, [KN01]);
    const kn01 = (await katalogvarianten())[0]!;
    const VERMERK = 'select public.set_exercise_variant_reviewed($1::uuid, $2::boolean)';
    await expect(asUserCommitted(users.therapist, VERMERK, [kn01.id, true])).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      asUserCommitted(FREMDE_ORGANISATION.owner, VERMERK, [kn01.id, true]),
    ).rejects.toMatchObject({ code: 'P0002' });
    await asUserCommitted(users.ownerTherapist, VERMERK, [kn01.id, true]);
    expect((await katalogvarianten())[0]).toMatchObject({ reviewed_by_name: 'Jannes Test' });
    expect((await katalogvarianten())[0]!.reviewed_at).not.toBeNull();
    await asUserCommitted(users.ownerTherapist, VERMERK, [kn01.id, false]);
    expect((await katalogvarianten())[0]).toMatchObject({
      reviewed_at: null,
      reviewed_by_name: null,
    });
  });

  it('nimmt den Prüfvermerk, sobald sich der Inhalt ändert - Speichern ohne Änderung lässt ihn stehen (ANN-386)', async () => {
    await importiere(users.ownerTherapist, [KN01]);
    const VERMERK = 'select public.set_exercise_variant_reviewed($1::uuid, true)';
    const SPEICHERN = `select public.save_exercise_variant($1::uuid, null, $2, $3, $4, $5::text[], $6, $7)`;
    type Inhalt = [string, string, string | null, string[], string | null, string | null];
    const inhalt = (v: Variante): Inhalt => [
      v.name,
      v.lay_name,
      v.instruction,
      v.equipment,
      v.common_faults,
      v.practice_notes,
    ];
    const variante = async () => (await katalogvarianten())[0]!;

    // Speichern ohne Änderung - auch mit Leerraum, den der Server ohnehin abschneidet.
    const vorher = await variante();
    await asUserCommitted(users.ownerTherapist, VERMERK, [vorher.id]);
    const geprueft = await variante();
    expect(geprueft.reviewed_at).not.toBeNull();
    const [name, ...rest] = inhalt(geprueft);
    await asUserCommitted(users.ownerTherapist, SPEICHERN, [geprueft.id, ` ${name} `, ...rest]);
    expect(await variante()).toMatchObject({
      reviewed_at: geprueft.reviewed_at,
      reviewed_by_name: 'Jannes Test',
    });

    // Jedes Inhaltsfeld für sich nimmt den Vermerk.
    const aenderungen: [string, (i: Inhalt) => Inhalt][] = [
      ['Bezeichnung', (i) => ['Kniestreckung, eigene Fassung', i[1], i[2], i[3], i[4], i[5]]],
      ['Alltagsname', (i) => [i[0], 'Knie strecken', i[2], i[3], i[4], i[5]]],
      ['Anleitung', (i) => [i[0], i[1], 'Eigene Anleitung.', i[3], i[4], i[5]]],
      ['Ausrüstung', (i) => [i[0], i[1], i[2], [...i[3], 'Eigenes Hilfsmittel'], i[4], i[5]]],
      ['typische Fehler', (i) => [i[0], i[1], i[2], i[3], null, i[5]]],
      ['Hinweise', (i) => [i[0], i[1], i[2], i[3], i[4], 'Eigener Hinweis.']],
    ];
    for (const [feld, aendere] of aenderungen) {
      const v = await variante();
      await asUserCommitted(users.ownerTherapist, VERMERK, [v.id]);
      expect((await variante()).reviewed_at, feld).not.toBeNull();
      await asUserCommitted(users.ownerTherapist, SPEICHERN, [v.id, ...aendere(inhalt(v))]);
      expect(await variante(), feld).toMatchObject({ reviewed_at: null, reviewed_by_name: null });
    }
    const { rows } = await asPostgres<{ reviewed_by: string | null }>(
      'select reviewed_by from public.exercise_variants where id = $1',
      [vorher.id],
    );
    expect(rows).toEqual([{ reviewed_by: null }]);
  });
});

describe('Bild und Dosierung im Plan (UEB-012, ANN-300, ANN-384)', () => {
  const POSITION = `select public.save_exercise_plan_item(null, $1::uuid, $2::uuid, 3, 10, 10, null,
     null, null, 30, false, null, null, null, $3::integer, $4::boolean, $5::integer) as id`;

  let kn01: Variante;

  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
    await asPostgres('delete from public.audit_log');
    kn01 = (await katalogvarianten()).find((v) => v.catalog_key === 'KN-01')!;
  });

  async function entwurf(): Promise<string> {
    const { rows } = await asUserCommitted<{ id: string }>(
      users.therapist,
      "select public.create_exercise_plan('therapy', $1::uuid, 'Heimprogramm Knie') as id",
      [patients.erika],
    );
    return rows[0]!.id;
  }

  async function plan(id: string) {
    const { rows } = await asUser<{
      plan: { status: string; items: Record<string, unknown>[] };
    }>(users.therapist, 'select public.get_exercise_plan($1::uuid) as plan', [id]);
    return rows[0]!.plan;
  }

  it('speichert Halten, je Seite und Häufigkeit am Tag und prüft sie', async () => {
    const p = await entwurf();
    await asUserCommitted(users.therapist, POSITION, [p, kn01.id, 3, true, 2]);
    expect((await plan(p)).items[0]).toMatchObject({
      hold_seconds: 3,
      per_side: true,
      times_per_day: 2,
      // Im Entwurf das Bild der Bibliothek.
      illustration: KN01.bild,
    });
    for (const [halten, mal] of [
      [0, null],
      [601, null],
      [null, 11],
      [null, 0],
    ]) {
      await expect(
        asUserCommitted(users.therapist, POSITION, [p, kn01.id, halten, false, mal]),
      ).rejects.toMatchObject({ code: '22023' });
    }
    // Halten nur mit Wiederholungen.
    await expect(
      asUserCommitted(
        users.therapist,
        `select public.save_exercise_plan_item(null, $1::uuid, $2::uuid, 3, null, null, 30,
           null, null, null, false, null, null, null, 5, false, null)`,
        [p, kn01.id],
      ),
    ).rejects.toThrow(/hold is invalid/);
    // Wer die neuen Argumente nicht kennt, ruft weiter mit vierzehn.
    await asUserCommitted(
      users.therapist,
      `select public.save_exercise_plan_item(null, $1::uuid, $2::uuid, 2, 8, 12, null,
         null, null, null, false, null, null, null)`,
      [p, kn01.id],
    );
    expect((await plan(p)).items[1]).toMatchObject({
      hold_seconds: null,
      per_side: false,
      times_per_day: null,
    });
  });

  it('friert Bild und Dosierung beim Zuweisen ein - spätere Änderungen der Bibliothek ändern den Plan nicht', async () => {
    const p = await entwurf();
    await asUserCommitted(users.therapist, POSITION, [p, kn01.id, 3, true, 2]);
    await asUserCommitted(
      users.therapist,
      'select public.assign_exercise_plan($1::uuid, $2::date)',
      [p, await praxistag(42)],
    );

    // Die Praxis ändert später Bild, Standarddosierung und Name der Variante.
    const neuesBild = { v: 1, basis: 'stand', start: {}, ende: { knie: [40, 40] } };
    await asPostgres(
      `update public.exercise_variants
          set illustration = $2::jsonb,
              default_dosage = '{"sets": 1, "duration_seconds": 60, "per_side": false}'::jsonb,
              name = 'Umbenannt'
        where id = $1`,
      [kn01.id, JSON.stringify(neuesBild)],
    );

    const nachher = (await plan(p)).items[0]!;
    expect(nachher).toMatchObject({
      variant_name: KN01.name,
      illustration: KN01.bild,
      sets: 3,
      hold_seconds: 3,
      per_side: true,
      times_per_day: 2,
    });
    const { rows } = await asPostgres<{ illustration: unknown }>(
      'select illustration from public.exercise_plan_items where plan_id = $1',
      [p],
    );
    expect(rows[0]!.illustration).toEqual(KN01.bild);

    // Die Plattform zeigt das eingefrorene Bild - ohne Kennung der Bibliothek.
    const { rows: portal } = await asUser<{
      daten: { plans: { items: Record<string, unknown>[] }[] };
    }>(users.plattformErika, 'select public.platform_exercise_plans($1::uuid) as daten', [
      platformAccesses.erikaBehandlung,
    ]);
    const position = portal[0]!.daten.plans[0]!.items[0]!;
    expect(position).toMatchObject({
      illustration: KN01.bild,
      hold_seconds: 3,
      per_side: true,
      times_per_day: 2,
    });
    expect(Object.keys(position)).not.toContain('variant_id');
    expect(Object.keys(position)).not.toContain('catalog_key');
  });

  it('nimmt die neuen Dosierfelder in die neue Fassung mit, das Bild erst bei deren Zuweisung', async () => {
    const p = await entwurf();
    await asUserCommitted(users.therapist, POSITION, [p, kn01.id, 3, true, 2]);
    await asUserCommitted(
      users.therapist,
      'select public.assign_exercise_plan($1::uuid, $2::date)',
      [p, await praxistag(42)],
    );
    const { rows } = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.create_exercise_plan_version($1::uuid) as id',
      [p],
    );
    const { rows: positionen } = await asPostgres<Record<string, unknown>>(
      'select hold_seconds, per_side, times_per_day, illustration from public.exercise_plan_items where plan_id = $1',
      [rows[0]!.id],
    );
    expect(positionen).toEqual([
      { hold_seconds: 3, per_side: true, times_per_day: 2, illustration: null },
    ]);
  });

  it('zählt längeres Halten in einer neuen Fassung als Schritt auf der Achse Wiederholungen (ANN-301)', async () => {
    const p = await entwurf();
    await asUserCommitted(users.therapist, POSITION, [p, kn01.id, 3, false, null]);
    await asUserCommitted(
      users.therapist,
      'select public.assign_exercise_plan($1::uuid, $2::date)',
      [p, await praxistag(42)],
    );
    const { rows } = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.create_exercise_plan_version($1::uuid) as id',
      [p],
    );
    const { rows: neu } = await asPostgres<{ id: string }>(
      'select id from public.exercise_plan_items where plan_id = $1',
      [rows[0]!.id],
    );
    const SCHRITT = `select public.save_exercise_plan_item($1::uuid, null, $2::uuid, 3, 10, 10, null,
       null, null, 30, false, null, $3, $4, 5, false, null)`;
    await expect(
      asUserCommitted(users.therapist, SCHRITT, [neu[0]!.id, kn01.id, null, null]),
    ).rejects.toThrow(/step axis is required/);
    await expect(
      asUserCommitted(users.therapist, SCHRITT, [neu[0]!.id, kn01.id, 'wiederholungen', 'easier']),
    ).rejects.toThrow(/step direction does not match/);
    await asUserCommitted(users.therapist, SCHRITT, [
      neu[0]!.id,
      kn01.id,
      'wiederholungen',
      'harder',
    ]);
    // Je Seite und Häufigkeit am Tag sind keine Achse: Sie ändern sich frei.
    await asUserCommitted(
      users.therapist,
      `select public.save_exercise_plan_item($1::uuid, null, $2::uuid, 3, 10, 10, null,
         null, null, 30, false, null, 'wiederholungen', 'harder', 5, true, 3)`,
      [neu[0]!.id, kn01.id],
    );
  });

  it('hängt jede übernommene Zeile an die Organisation der Testpraxis', async () => {
    const { rows } = await asPostgres<{ anzahl: number }>(
      `select count(*)::int as anzahl from public.exercise_variants
        where catalog_key is not null and organization_id <> $1`,
      [organizationId],
    );
    expect(rows[0]!.anzahl).toBe(0);
    expect(MIT_BILD.length).toBeGreaterThan(0);
  });
});

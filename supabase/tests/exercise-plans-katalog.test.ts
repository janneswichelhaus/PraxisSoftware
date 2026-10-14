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
import type { Katalogeintrag } from '@/features/exercises/katalog/typen';

/**
 * Übungsplan: Katalogübungen beim Hinzufügen übernehmen, Stand und Fassung
 * (O-002, Befund B9; ANN-536, ANN-538).
 *
 *   * owner übernimmt die gewählten Katalogeinträge für den Entwurf -
 *     ungeprüft, nie überschreibend, über denselben Weg wie der Import
 *     (ANN-382, ANN-386).
 *   * Wer sonst einen Plan des Bereichs schreibt (therapist, team_lead,
 *     trainer), bekommt, was die Bibliothek schon hat; Fehlendes kommt als
 *     Konflikt `missing` zurück, und geschrieben wird nichts (ANN-293:
 *     Bibliothek pflegt nur owner; Zweitreview o_002 Punkt 6).
 *   * Abgewiesen: Büro, Plattformkonto, Begleitung, Profil ohne Praxisrolle,
 *     anon, andere Organisation, anderer Leistungsbereich, Plan nicht im
 *     Entwurf, mehr als der Entwurf fasst, ein ungültiger Eintrag - und dann
 *     ist nichts übernommen.
 *   * `get_exercise_plan` nennt die Fassung aus der Kette, den Tag und wer
 *     zuletzt geändert hat - nicht die genaue Zeit.
 */

const { users, patients, trainingRelationships, organizationId } = SEED;

const UEBERNEHMEN = 'select public.add_catalog_exercises_for_plan($1::uuid, $2::jsonb) as ergebnis';
const ANLEGEN = 'select public.create_exercise_plan($1, $2::uuid, $3) as id';
const PLAN = 'select public.get_exercise_plan($1::uuid) as plan';
const POSITION = `select public.save_exercise_plan_item(null, $1::uuid, $2::uuid, 3, 10, 12, null,
  null, null, null, false, null, null, null) as id`;
const ZUWEISEN = 'select public.assign_exercise_plan($1::uuid, $2::date)';
const NEUE_FASSUNG = 'select public.create_exercise_plan_version($1::uuid) as id';

interface Ergebnis {
  variants: Record<string, string>;
  imported: string[];
  conflicts: { catalog_key: string; name: string; reason: 'name' | 'archived' | 'missing' }[];
}

interface Stand {
  status: string;
  version_number: number;
  updated_on: string;
  updated_by_name: string | null;
  follow_up: { id: string; status: string; runs_from: string | null } | null;
}

const KN01 = katalogeintrag('KN-01')!;
const KN07 = katalogeintrag('KN-07')!;
const HU01 = katalogeintrag('HU-01')!;

/**
 * Entfernt Pläne und alles, was nicht zu den neun eigenen Übungen des Seeds
 * gehört - das Übernommene des Seeds und was ein Test angelegt hat.
 */
async function katalogEntfernen(): Promise<void> {
  await planeEntfernen();
  await asPostgres(`
    delete from public.exercise_variant_links;
    delete from public.exercise_variants where id::text not like 'acacacac-%';
    delete from public.exercises where id::text not like 'abababab-%';
  `);
}

async function entwurf(
  bereich: 'therapy' | 'training' = 'therapy',
  konto: string = bereich === 'therapy' ? users.therapist : users.trainer,
): Promise<string> {
  const verhaeltnis = bereich === 'therapy' ? patients.erika : trainingRelationships.tina;
  const { rows } = await asUserCommitted<{ id: string }>(konto, ANLEGEN, [
    bereich,
    verhaeltnis,
    'Heimprogramm',
  ]);
  return rows[0]!.id;
}

async function uebernehmen(konto: string, plan: string, eintraege: unknown): Promise<Ergebnis> {
  const { rows } = await asUserCommitted<{ ergebnis: Ergebnis }>(konto, UEBERNEHMEN, [
    plan,
    JSON.stringify(eintraege),
  ]);
  return rows[0]!.ergebnis;
}

/** Was die Praxis aus dem Katalog hat - Schlüssel, Ersteller:in, Prüfvermerk. */
async function katalogvarianten(org: string = organizationId) {
  const { rows } = await asPostgres<{
    id: string;
    catalog_key: string;
    created_by: string;
    reviewed_at: Date | null;
  }>(
    `select id, catalog_key, created_by, reviewed_at from public.exercise_variants
      where organization_id = $1 and catalog_key is not null order by catalog_key`,
    [org],
  );
  return rows;
}

async function stand(plan: string, konto: string = users.therapist): Promise<Stand> {
  const { rows } = await asUser<{ plan: Stand }>(konto, PLAN, [plan]);
  return rows[0]!.plan;
}

describe('Katalogübungen für einen Planentwurf übernehmen (O-002, ANN-536)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await katalogEntfernen();
  });

  it('lässt owner die gewählten Einträge für den Entwurf übernehmen - ungeprüft', async () => {
    const plan = await entwurf('therapy', users.ownerTherapist);
    const ergebnis = await uebernehmen(users.ownerTherapist, plan, [KN01, KN07]);
    expect(ergebnis.imported).toEqual(['KN-01', 'KN-07']);
    expect(ergebnis.conflicts).toEqual([]);

    const varianten = await katalogvarianten();
    expect(varianten.map((v) => v.catalog_key)).toEqual(['KN-01', 'KN-07']);
    expect(ergebnis.variants).toEqual({ 'KN-01': varianten[0]!.id, 'KN-07': varianten[1]!.id });
    // Wer übernommen hat, steht an der Zeile; geprüft hat noch niemand (ANN-386).
    expect(varianten.every((v) => v.created_by === users.ownerTherapist)).toBe(true);
    expect(varianten.every((v) => v.reviewed_at === null)).toBe(true);
    // Nur das Gewählte: Der Rest des Katalogs bleibt draußen.
    expect(varianten).toHaveLength(2);

    // Danach entstehen die Positionen wie bisher.
    for (const id of Object.values(ergebnis.variants)) {
      await asUserCommitted(users.ownerTherapist, POSITION, [plan, id]);
    }
    const { rows } = await asPostgres<{ anzahl: number }>(
      'select count(*)::int as anzahl from public.exercise_plan_items where plan_id = $1',
      [plan],
    );
    expect(rows[0]!.anzahl).toBe(2);
  });

  it.each([
    ['die Therapeut:in', 'therapy', users.therapist, KN01],
    ['die Teamleitung', 'therapy', users.teamLead, KN01],
    ['die Trainingsbetreuung', 'training', users.trainer, HU01],
  ] as const)(
    'lässt %s nichts übernehmen: Fehlendes kommt als „missing“ zurück (ANN-293)',
    async (_wer, bereich, konto, eintrag) => {
      const plan = await entwurf(bereich);
      const ergebnis = await uebernehmen(konto, plan, [eintrag]);
      expect(ergebnis).toEqual({
        variants: {},
        imported: [],
        conflicts: [{ catalog_key: eintrag.schluessel, name: eintrag.name, reason: 'missing' }],
      });
      expect(await katalogvarianten()).toEqual([]);
    },
  );

  it('gibt der Therapeut:in, was die Bibliothek schon hat, und meldet nur das Fehlende', async () => {
    const plan = await entwurf();
    const owner = await uebernehmen(users.ownerTherapist, plan, [KN01]);
    const ergebnis = await uebernehmen(users.therapist, plan, [KN01, KN07]);
    expect(ergebnis).toEqual({
      variants: { 'KN-01': owner.variants['KN-01'] },
      imported: [],
      conflicts: [{ catalog_key: 'KN-07', name: KN07.name, reason: 'missing' }],
    });
    expect((await katalogvarianten()).map((v) => v.catalog_key)).toEqual(['KN-01']);
  });

  it('nimmt Vorhandenes, ohne es doppelt anzulegen oder zu überschreiben', async () => {
    const plan = await entwurf();
    const erstes = await uebernehmen(users.ownerTherapist, plan, [KN01]);
    const geaendert = { ...KN01, alltagsname: 'Etwas ganz anderes' };
    const zweites = await uebernehmen(users.ownerTherapist, plan, [geaendert, KN07]);
    expect(zweites.imported).toEqual(['KN-07']);
    expect(zweites.variants['KN-01']).toBe(erstes.variants['KN-01']);
    const { rows } = await asPostgres<{ lay_name: string; created_by: string }>(
      `select lay_name, created_by from public.exercise_variants
        where organization_id = $1 and catalog_key = 'KN-01'`,
      [organizationId],
    );
    expect(rows).toEqual([{ lay_name: KN01.alltagsname, created_by: users.ownerTherapist }]);
  });

  it('nimmt eine gleichnamige eigene Übung, wenn sie eindeutig ist, und meldet sonst einen Konflikt', async () => {
    const { rows: uebung } = await asUserCommitted<{ id: string }>(
      users.ownerTherapist,
      "select public.save_exercise(null, $1, 'Eigene Übung', 'knie') as id",
      [KN01.name.toUpperCase()],
    );
    const { rows: variante } = await asUserCommitted<{ id: string }>(
      users.ownerTherapist,
      `select public.save_exercise_variant(null, $1::uuid, 'Im Sitz', 'Im Sitz strecken',
         null, array[]::text[], null, null) as id`,
      [uebung[0]!.id],
    );
    const plan = await entwurf();
    const eindeutig = await uebernehmen(users.ownerTherapist, plan, [KN01, KN07]);
    expect(eindeutig.imported).toEqual(['KN-07']);
    expect(eindeutig.variants['KN-01']).toBe(variante[0]!.id);
    expect(eindeutig.conflicts).toEqual([]);
    // Dieselbe Antwort für die Therapeut:in - ohne dass sie etwas anlegt.
    expect(await uebernehmen(users.therapist, plan, [KN01])).toEqual({
      variants: { 'KN-01': variante[0]!.id },
      imported: [],
      conflicts: [],
    });

    // Zwei Varianten zur Wahl: nicht eindeutig.
    await asUserCommitted(
      users.ownerTherapist,
      `select public.save_exercise_variant(null, $1::uuid, 'Im Stand', 'Im Stand strecken',
         null, array[]::text[], null, null)`,
      [uebung[0]!.id],
    );
    for (const konto of [users.ownerTherapist, users.therapist]) {
      const zweideutig = await uebernehmen(konto, plan, [KN01]);
      expect(zweideutig.variants).toEqual({});
      expect(zweideutig.conflicts).toEqual([
        { catalog_key: 'KN-01', name: KN01.name, reason: 'name' },
      ]);
    }
  });

  it('meldet einen vorhandenen, aber archivierten Eintrag, statt ihn zurückzuholen', async () => {
    const plan = await entwurf();
    const ergebnis = await uebernehmen(users.ownerTherapist, plan, [KN01]);
    await asUserCommitted(
      users.ownerTherapist,
      'select public.set_exercise_variant_archived($1::uuid, true)',
      [ergebnis.variants['KN-01']],
    );
    for (const konto of [users.ownerTherapist, users.therapist]) {
      const nochmal = await uebernehmen(konto, plan, [KN01]);
      expect(nochmal.variants).toEqual({});
      expect(nochmal.conflicts).toEqual([
        { catalog_key: 'KN-01', name: KN01.name, reason: 'archived' },
      ]);
    }
    const { rows } = await asPostgres<{ archiviert: boolean }>(
      `select archived_at is not null as archiviert from public.exercise_variants
        where organization_id = $1 and catalog_key = 'KN-01'`,
      [organizationId],
    );
    expect(rows).toEqual([{ archiviert: true }]);
  });

  it('lässt owner auch im Training übernehmen (eigener Leistungsbereich)', async () => {
    const plan = await entwurf('training');
    const ergebnis = await uebernehmen(users.ownerTherapist, plan, [HU01]);
    expect(ergebnis.imported).toEqual(['HU-01']);
    // Danach bekommt sie auch die Trainingsbetreuung.
    expect((await uebernehmen(users.trainer, plan, [HU01])).variants).toEqual(ergebnis.variants);
  });

  it.each([
    ['Büro', users.office],
    ['Profil ohne Praxisrolle', users.patientMax],
    ['Plattformkonto', users.plattformErika],
    ['Begleitung', users.plattformPaula],
  ])('weist %s ab (42501) und übernimmt nichts', async (_wer, konto) => {
    const plan = await entwurf();
    await expect(
      asUserCommitted(konto, UEBERNEHMEN, [plan, JSON.stringify([KN01])]),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await katalogvarianten()).toEqual([]);
  });

  it('weist anon und eine Sitzung ohne Konto ab', async () => {
    const plan = await entwurf();
    await expect(asAnon(UEBERNEHMEN, [plan, JSON.stringify([KN01])])).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asUser(null, UEBERNEHMEN, [plan, JSON.stringify([KN01])])).rejects.toMatchObject({
      code: '42501',
    });
    expect(await katalogvarianten()).toEqual([]);
  });

  it('kennt den Plan einer anderen Organisation nicht (P0002, ADR-003)', async () => {
    const plan = await entwurf();
    await expect(
      asUserCommitted(FREMDE_ORGANISATION.owner, UEBERNEHMEN, [plan, JSON.stringify([KN01])]),
    ).rejects.toMatchObject({ code: 'P0002' });
    expect(await katalogvarianten()).toEqual([]);
    expect(await katalogvarianten(FREMDE_ORGANISATION.organizationId)).toEqual([]);
  });

  it('kennt den Plan des anderen Leistungsbereichs nicht (P0002, ADR-021 Punkt 6)', async () => {
    const behandlung = await entwurf('therapy');
    const training = await entwurf('training');
    await expect(
      asUserCommitted(users.trainer, UEBERNEHMEN, [behandlung, JSON.stringify([KN01])]),
    ).rejects.toMatchObject({ code: 'P0002' });
    await expect(
      asUserCommitted(users.therapist, UEBERNEHMEN, [training, JSON.stringify([KN01])]),
    ).rejects.toMatchObject({ code: 'P0002' });
    expect(await katalogvarianten()).toEqual([]);
  });

  it('übernimmt nur für einen Entwurf (22023)', async () => {
    const plan = await entwurf();
    const ergebnis = await uebernehmen(users.ownerTherapist, plan, [KN01]);
    await asUserCommitted(users.therapist, POSITION, [plan, ergebnis.variants['KN-01']]);
    await asUserCommitted(users.therapist, ZUWEISEN, [plan, await praxistag(42)]);
    await expect(
      asUserCommitted(users.ownerTherapist, UEBERNEHMEN, [plan, JSON.stringify([KN07])]),
    ).rejects.toMatchObject({ code: '22023' });
    expect((await katalogvarianten()).map((v) => v.catalog_key)).toEqual(['KN-01']);
  });

  it('übernimmt nichts nach dem Ende des Trainingsvertrags', async () => {
    const plan = await entwurf('training');
    await asPostgres(
      `update public.training_relationships set contract_ended_on = current_date, status = 'inactive' where id = $1`,
      [trainingRelationships.tina],
    );
    try {
      await expect(
        asUserCommitted(users.ownerTherapist, UEBERNEHMEN, [plan, JSON.stringify([HU01])]),
      ).rejects.toThrow(/training relationship has ended/);
    } finally {
      await asPostgres(
        `update public.training_relationships set contract_ended_on = null, status = 'active' where id = $1`,
        [trainingRelationships.tina],
      );
    }
    expect(await katalogvarianten()).toEqual([]);
  });

  it('übernimmt höchstens, was der Entwurf noch fasst (30 Positionen)', async () => {
    const plan = await entwurf();
    const einunddreissig = KATALOG.slice(0, 31);
    await expect(
      asUserCommitted(users.ownerTherapist, UEBERNEHMEN, [plan, JSON.stringify(einunddreissig)]),
    ).rejects.toThrow(/too many exercises/);

    // 29 Positionen im Entwurf: Platz für eine.
    const erste = await uebernehmen(users.ownerTherapist, plan, KATALOG.slice(0, 29));
    for (const e of KATALOG.slice(0, 29)) {
      await asUserCommitted(users.therapist, POSITION, [plan, erste.variants[e.schluessel]]);
    }
    for (const konto of [users.ownerTherapist, users.therapist]) {
      await expect(
        asUserCommitted(konto, UEBERNEHMEN, [plan, JSON.stringify(KATALOG.slice(29, 31))]),
      ).rejects.toMatchObject({ code: '22023' });
    }
    expect(await katalogvarianten()).toHaveLength(29);
    expect((await uebernehmen(users.ownerTherapist, plan, [KATALOG[29]!])).imported).toEqual([
      KATALOG[29]!.schluessel,
    ]);
  });

  describe.each([
    ['owner', users.ownerTherapist],
    ['Therapeut:in', users.therapist],
  ])(
    'prüft für %s jeden Eintrag wie der Import und übernimmt bei einem Fehler nichts (22023)',
    (_wer, konto) => {
      const mit = (e: Katalogeintrag, aenderung: Record<string, unknown>) => ({
        ...e,
        ...aenderung,
      });
      it.each([
        ['einen gültigen und einen ungültigen Eintrag', [KN07, mit(KN01, { niveau: 0 })]],
        ['ein Feld „Krankheitsbild“', [mit(KN01, { krankheitsbild: 'Gonarthrose' })]],
        ['ein Bild als Zeichenkette', [mit(KN01, { bild: '<svg onload="x()"/>' })]],
        ['einen falschen Schlüssel', [mit(KN01, { schluessel: 'kn-1' })]],
        ['einen doppelten Schlüssel', [KN01, mit(KN07, { schluessel: 'KN-01' })]],
        ['eine leere Liste', []],
        ['ein Objekt statt einer Liste', { eintraege: [KN01] }],
      ])('weist ab: %s', async (_fall, eintraege) => {
        const plan = await entwurf();
        await expect(
          asUserCommitted(konto, UEBERNEHMEN, [plan, JSON.stringify(eintraege)]),
        ).rejects.toMatchObject({ code: '22023' });
        expect(await katalogvarianten()).toEqual([]);
      });
    },
  );
});

describe('Stand und Fassung am Plan (O-002)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
  });

  async function mitPosition(plan: string, konto: string = users.therapist): Promise<void> {
    const { rows } = await asPostgres<{ id: string }>(
      `select v.id from public.exercise_variants v
        where v.organization_id = $1 and v.catalog_key = 'KN-01'`,
      [organizationId],
    );
    await asUserCommitted(konto, POSITION, [plan, rows[0]!.id]);
  }

  it('zählt die Fassung über die Kette und nennt, wer zuletzt geändert hat', async () => {
    const heute = await praxistag(0);
    const erste = await entwurf();
    expect(await stand(erste)).toMatchObject({
      status: 'draft',
      version_number: 1,
      updated_on: heute,
      updated_by_name: 'Anna Beispiel',
      follow_up: null,
    });
    // Nur der Tag neben dem Namen, nicht die genaue Zeit (Zweitreview o_002 Punkt 4).
    expect(await stand(erste)).not.toHaveProperty('updated_at');

    // Die Teamleitung ändert den Entwurf: Sie steht jetzt als letzte da.
    await mitPosition(erste, users.teamLead);
    const nachAenderung = await stand(erste);
    expect(nachAenderung.updated_by_name).toBe('Tim Teamleitung');
    expect(nachAenderung.version_number).toBe(1);

    await asUserCommitted(users.therapist, ZUWEISEN, [erste, await praxistag(42)]);
    const { rows: z } = await asUserCommitted<{ id: string }>(users.therapist, NEUE_FASSUNG, [
      erste,
    ]);
    const zweite = z[0]!.id;
    expect(await stand(zweite)).toMatchObject({ status: 'draft', version_number: 2 });
    expect((await stand(erste)).follow_up).toEqual({
      id: zweite,
      status: 'draft',
      runs_from: null,
    });

    await asUserCommitted(users.therapist, ZUWEISEN, [zweite, await praxistag(42)]);
    const { rows: d } = await asUserCommitted<{ id: string }>(users.therapist, NEUE_FASSUNG, [
      zweite,
    ]);
    const dritte = d[0]!.id;
    expect(await stand(dritte)).toMatchObject({ version_number: 3 });
    expect(await stand(zweite)).toMatchObject({ status: 'assigned', version_number: 2 });
    expect((await stand(erste)).follow_up).toEqual({
      id: zweite,
      status: 'assigned',
      runs_from: heute,
    });
    // Lesen dürfen auch Büro und owner - mit derselben Nummer.
    expect((await stand(dritte, users.office)).version_number).toBe(3);
    expect((await stand(dritte, users.ownerTherapist)).version_number).toBe(3);
  });

  it('zählt im Training eigenständig und nur in der eigenen Kette', async () => {
    const behandlung = await entwurf('therapy');
    await mitPosition(behandlung);
    await asUserCommitted(users.therapist, ZUWEISEN, [behandlung, await praxistag(42)]);
    await asUserCommitted(users.therapist, NEUE_FASSUNG, [behandlung]);

    const training = await entwurf('training');
    const t = await stand(training, users.trainer);
    expect(t).toMatchObject({ version_number: 1, updated_by_name: 'Tom Trainingsbetreuung' });
    // Der andere Bereich bleibt "nicht gefunden" (ADR-021 Punkt 6).
    expect(await stand(training, users.therapist)).toBeNull();
  });
});

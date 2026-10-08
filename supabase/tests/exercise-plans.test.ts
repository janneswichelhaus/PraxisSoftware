import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  planeEntfernen,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Übungspläne (UEB-EPIC-002, IDEA-TRN-011).
 *
 *   * Ein Plan hängt an genau einem Verhältnis: Akte (`therapy`) oder
 *     Trainingsverhältnis (`training`) - ANN-297, ADR-021 Punkt 3.
 *   * Behandlung: schreiben therapist und team_lead, lesen dazu owner und
 *     Büro; Training: owner und Trainingsbetreuung, das Büro nicht (ANN-298).
 *   * Kein Durchgriff: Ein Plan des anderen Bereichs ist „nicht gefunden"
 *     (ADR-021 Punkt 6).
 *   * Positionen ändern sich nur im Entwurf (ANN-300), Dosierung nach ANN-299.
 *   * Fällt mit dem Verhältnis, zieht beim Zusammenführen mit (ADR-008, PRX-017).
 */

const { users, patients, trainingRelationships, organizationId } = SEED;

const ANLEGEN = 'select public.create_exercise_plan($1, $2::uuid, $3) as id';
const PLAN_SPEICHERN = 'select public.save_exercise_plan($1::uuid, $2, $3::int)';
const POSITION = `select public.save_exercise_plan_item($1::uuid, $2::uuid, $3::uuid, $4::int,
  $5::int, $6::int, $7::int, $8, $9, $10::int, $11::boolean, $12, $13, $14) as id`;
const VERSCHIEBEN = 'select public.move_exercise_plan_item($1::uuid, $2)';
const ENTFERNEN = 'select public.delete_exercise_plan_item($1::uuid)';
const VERWERFEN = 'select public.discard_exercise_plan($1::uuid)';
const LISTE = 'select public.list_exercise_plans($1, $2::uuid) as liste';
const PLAN = 'select public.get_exercise_plan($1::uuid) as plan';

/** Varianten aus dem Seed (UEB-003). */
export const VARIANTE = {
  kniebeugeGelaender: 'acacacac-acac-4cac-8cac-000000000001',
  kniebeugeFrei: 'acacacac-acac-4cac-8cac-000000000002',
  kniebeugeTief: 'acacacac-acac-4cac-8cac-000000000003',
  brueckeBeidbeinig: 'acacacac-acac-4cac-8cac-000000000005',
  rudernGelb: 'acacacac-acac-4cac-8cac-000000000009',
  rudernRot: 'acacacac-acac-4cac-8cac-000000000010',
  beinpresse: 'acacacac-acac-4cac-8cac-000000000016',
} as const;

export interface Position {
  id: string;
  position: number;
  variant_id: string;
  exercise_name: string;
  exercise_lay_name: string;
  variant_name: string;
  variant_lay_name: string;
  instruction: string | null;
  equipment: string[];
  variant_archived: boolean;
  sets: number;
  reps_min: number | null;
  reps_max: number | null;
  duration_seconds: number | null;
  load: string | null;
  tempo: string | null;
  rest_seconds: number | null;
  double_progression: boolean;
  note: string | null;
  previous_item_id: string | null;
  step_axis: string | null;
  step_direction: string | null;
}

export interface Plan {
  id: string;
  service_area: 'therapy' | 'training';
  relationship_id: string;
  given_name: string;
  family_name: string;
  title: string;
  sessions_per_week: number | null;
  status: string;
  previous_plan_id: string | null;
  follow_up: { id: string; status: string } | null;
  runs_from: string | null;
  runs_until: string | null;
  original_runs_until: string | null;
  can_write: boolean;
  previous: { id: string; items: Position[] } | null;
  items: Position[];
}

interface Liste {
  can_write: boolean;
  plans: { id: string; title: string; status: string; item_count: number }[];
}

export async function planAnlegen(
  bereich: 'therapy' | 'training' = 'therapy',
  verhaeltnis: string = bereich === 'therapy' ? patients.erika : trainingRelationships.tina,
  konto: string = bereich === 'therapy' ? users.therapist : users.trainer,
  titel = 'Heimprogramm Knie',
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, ANLEGEN, [
    bereich,
    verhaeltnis,
    titel,
  ]);
  return rows[0]!.id;
}

export interface Dosierung {
  sets?: number;
  repsMin?: number | null;
  repsMax?: number | null;
  dauer?: number | null;
  last?: string | null;
  tempo?: string | null;
  pause?: number | null;
  doppelt?: boolean;
  hinweis?: string | null;
  achse?: string | null;
  richtung?: string | null;
}

export function positionParameter(
  item: string | null,
  plan: string | null,
  variante: string,
  d: Dosierung = {},
): unknown[] {
  return [
    item,
    plan,
    variante,
    d.sets ?? 3,
    d.repsMin === undefined ? 10 : d.repsMin,
    d.repsMax === undefined ? 12 : d.repsMax,
    d.dauer ?? null,
    d.last ?? null,
    d.tempo ?? null,
    d.pause ?? null,
    d.doppelt ?? false,
    d.hinweis ?? null,
    d.achse ?? null,
    d.richtung ?? null,
  ];
}

export async function positionAnlegen(
  plan: string,
  variante: string = VARIANTE.kniebeugeGelaender,
  d: Dosierung = {},
  konto: string = users.therapist,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(
    konto,
    POSITION,
    positionParameter(null, plan, variante, d),
  );
  return rows[0]!.id;
}

export async function planLesen(
  plan: string,
  konto: string = users.therapist,
): Promise<Plan | null> {
  const { rows } = await asUser<{ plan: Plan | null }>(konto, PLAN, [plan]);
  return rows[0]!.plan;
}

async function liste(
  bereich: 'therapy' | 'training',
  verhaeltnis: string,
  konto: string,
): Promise<Liste | null> {
  const { rows } = await asUser<{ liste: Liste | null }>(konto, LISTE, [bereich, verhaeltnis]);
  return rows[0]!.liste;
}

async function liestNichts(versuch: Promise<unknown>): Promise<boolean> {
  try {
    return (await versuch) === null;
  } catch (fehler) {
    return /not allowed/.test(String(fehler));
  }
}

describe('Übungspläne: Entwurf (UEB-004)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
  });

  describe('Zusammenstellen', () => {
    it('legt einen Entwurf an der Akte an und füllt ihn mit Positionen', async () => {
      const plan = await planAnlegen('therapy', patients.erika, users.therapist, '  Knie  ');
      await asUserCommitted(users.therapist, PLAN_SPEICHERN, [plan, 'Heimprogramm Knie', 3]);
      const erste = await positionAnlegen(plan, VARIANTE.kniebeugeGelaender, {
        repsMin: 8,
        repsMax: 12,
        last: '  Rucksack 3 kg ',
        doppelt: true,
        pause: 60,
        hinweis: 'Langsam runter.',
      });
      const zweite = await positionAnlegen(plan, VARIANTE.brueckeBeidbeinig, {
        sets: 2,
        repsMin: null,
        repsMax: null,
        dauer: 30,
      });

      const p = await planLesen(plan);
      expect(p).toMatchObject({
        id: plan,
        service_area: 'therapy',
        relationship_id: patients.erika,
        given_name: 'Erika',
        title: 'Heimprogramm Knie',
        sessions_per_week: 3,
        status: 'draft',
        can_write: true,
        runs_until: null,
      });
      expect(p!.items.map((i) => [i.id, i.position])).toEqual([
        [erste, 1],
        [zweite, 2],
      ]);
      expect(p!.items[0]).toMatchObject({
        variant_name: 'Kniebeuge am Gelaender, halbe Tiefe',
        variant_lay_name: 'Am Gelaender halb in die Hocke',
        exercise_name: 'Kniebeuge',
        equipment: ['Gelaender'],
        sets: 3,
        reps_min: 8,
        reps_max: 12,
        load: 'Rucksack 3 kg',
        double_progression: true,
        rest_seconds: 60,
        note: 'Langsam runter.',
      });
      expect(p!.items[1]).toMatchObject({ sets: 2, reps_min: null, duration_seconds: 30 });

      const l = await liste('therapy', patients.erika, users.therapist);
      expect(l!.can_write).toBe(true);
      expect(l!.plans).toEqual([
        expect.objectContaining({ id: plan, status: 'draft', item_count: 2 }),
      ]);
    });

    it('legt einen Trainingsplan am Trainingsverhältnis an', async () => {
      const plan = await planAnlegen('training');
      await positionAnlegen(plan, VARIANTE.rudernGelb, {}, users.trainer);
      const p = await planLesen(plan, users.trainer);
      expect(p).toMatchObject({
        service_area: 'training',
        relationship_id: trainingRelationships.tina,
        given_name: 'Tina',
      });
      const { rows } = await asPostgres<{
        patient_id: string | null;
        training_relationship_id: string;
      }>('select patient_id, training_relationship_id from public.exercise_plans where id = $1', [
        plan,
      ]);
      expect(rows[0]).toEqual({
        patient_id: null,
        training_relationship_id: trainingRelationships.tina,
      });
    });

    it('verschiebt und entfernt Positionen, die übrigen rücken auf', async () => {
      const plan = await planAnlegen();
      const a = await positionAnlegen(plan, VARIANTE.kniebeugeGelaender);
      const b = await positionAnlegen(plan, VARIANTE.brueckeBeidbeinig);
      const c = await positionAnlegen(plan, VARIANTE.rudernGelb);

      await asUserCommitted(users.therapist, VERSCHIEBEN, [c, 'up']);
      expect((await planLesen(plan))!.items.map((i) => i.id)).toEqual([a, c, b]);
      await asUserCommitted(users.therapist, VERSCHIEBEN, [a, 'up']);
      expect((await planLesen(plan))!.items.map((i) => i.id)).toEqual([a, c, b]);

      await asUserCommitted(users.therapist, ENTFERNEN, [a]);
      const p = await planLesen(plan);
      expect(p!.items.map((i) => [i.id, i.position])).toEqual([
        [c, 1],
        [b, 2],
      ]);
    });

    it('verwirft einen Entwurf samt Positionen', async () => {
      const plan = await planAnlegen();
      await positionAnlegen(plan);
      await asUserCommitted(users.therapist, VERWERFEN, [plan]);
      const { rows } = await asPostgres<{ n: number }>(
        'select (select count(*) from public.exercise_plans)::int + (select count(*) from public.exercise_plan_items)::int as n',
      );
      expect(rows[0]!.n).toBe(0);
    });

    it('stempelt Anlage und Änderung an der Zeile (ADR-010 Fassung 3)', async () => {
      const plan = await planAnlegen();
      await asUserCommitted(users.teamLead, PLAN_SPEICHERN, [plan, 'Neu', null]);
      const { rows } = await asPostgres<{ created_by: string; updated_by: string }>(
        'select created_by, updated_by from public.exercise_plans where id = $1',
        [plan],
      );
      expect(rows[0]).toEqual({ created_by: users.therapist, updated_by: users.teamLead });
    });
  });

  describe('Eingaben (ANN-299)', () => {
    it.each([
      ['keine Sätze', { sets: 0 }, /sets is invalid/],
      ['Wiederholungen verdreht', { repsMin: 12, repsMax: 8 }, /repetitions are invalid/],
      ['nur eine Grenze', { repsMin: 8, repsMax: null }, /repetitions are invalid/],
      ['Wiederholungen und Dauer', { dauer: 30 }, /repetitions or duration/],
      ['weder noch', { repsMin: null, repsMax: null }, /repetitions or duration/],
      ['Pause zu lang', { pause: 601 }, /rest is invalid/],
      ['Last zu lang', { last: 'x'.repeat(41) }, /load is too long/],
      ['Hinweis zu lang', { hinweis: 'x'.repeat(501) }, /note is too long/],
      ['doppelte Progression ohne Last', { doppelt: true }, /double progression/],
      [
        'doppelte Progression ohne Bereich',
        { doppelt: true, repsMin: 10, repsMax: 10, last: '5 kg' },
        /double progression/,
      ],
      ['Schritt ohne vorige Fassung', { achse: 'last', richtung: 'harder' }, /previous version/],
    ])('weist ab: %s', async (_fall, d, fehler) => {
      const plan = await planAnlegen();
      await expect(
        positionAnlegen(plan, VARIANTE.kniebeugeGelaender, d as Dosierung),
      ).rejects.toThrow(fehler);
    });

    it('verlangt einen Titel', async () => {
      await expect(planAnlegen('therapy', patients.erika, users.therapist, ' \n ')).rejects.toThrow(
        /title is required/,
      );
    });

    it('nimmt keine archivierte Variante neu auf, behält aber eine schon gewählte', async () => {
      const plan = await planAnlegen();
      await expect(positionAnlegen(plan, VARIANTE.beinpresse)).rejects.toThrow(
        /exercise variant not found/,
      );
      const item = await positionAnlegen(plan, VARIANTE.rudernGelb);
      await asPostgres(
        'update public.exercise_variants set archived_at = now(), archived_by = $1 where id = $2',
        [users.ownerTherapist, VARIANTE.rudernGelb],
      );
      try {
        await asUserCommitted(
          users.therapist,
          POSITION,
          positionParameter(item, null, VARIANTE.rudernGelb, { sets: 4 }),
        );
        const p = await planLesen(plan);
        expect(p!.items[0]).toMatchObject({ sets: 4, variant_archived: true });
      } finally {
        await asPostgres(
          'update public.exercise_variants set archived_at = null, archived_by = null where id = $1',
          [VARIANTE.rudernGelb],
        );
      }
    });

    it('lässt eine Variante, die in einem Plan steht, nicht löschen (ANN-296)', async () => {
      const plan = await planAnlegen();
      await positionAnlegen(plan, VARIANTE.kniebeugeTief);
      await expect(
        asUserCommitted(users.ownerTherapist, 'select public.delete_exercise_variant($1::uuid)', [
          VARIANTE.kniebeugeTief,
        ]),
      ).rejects.toThrow(/in use|variant links|foreign key/);
    });

    it('nimmt keinen Trainingsplan an einem beendeten Vertrag an', async () => {
      await asPostgres(
        `update public.training_relationships set contract_ended_on = current_date, status = 'inactive' where id = $1`,
        [trainingRelationships.tina],
      );
      try {
        await expect(planAnlegen('training')).rejects.toThrow(/training relationship has ended/);
      } finally {
        await asPostgres(
          `update public.training_relationships set contract_ended_on = null, status = 'active' where id = $1`,
          [trainingRelationships.tina],
        );
      }
    });
  });

  describe('Negativfälle (ADR-013 Punkt 9 Nr. 1)', () => {
    it('lässt das Büro Behandlungspläne lesen, aber nicht schreiben (ANN-298)', async () => {
      const plan = await planAnlegen();
      await positionAnlegen(plan);
      const p = await planLesen(plan, users.office);
      expect(p).toMatchObject({ id: plan, can_write: false });
      expect((await liste('therapy', patients.erika, users.office))!.plans).toHaveLength(1);
      await expect(
        asUserCommitted(users.office, ANLEGEN, ['therapy', patients.erika, 'Büro']),
      ).rejects.toThrow(/not allowed/);
      await expect(
        asUserCommitted(users.office, PLAN_SPEICHERN, [plan, 'Büro', null]),
      ).rejects.toThrow(/not allowed/);
      await expect(asUserCommitted(users.office, VERWERFEN, [plan])).rejects.toThrow(/not allowed/);
    });

    it('lässt owner allein keinen Behandlungsplan schreiben (ANN-298)', async () => {
      // Der Inhaber im Seed ist zugleich Therapeut; hier zählt die Rolle owner allein.
      const fremd = (await fremdeOrganisation()).owner;
      await expect(
        asUserCommitted(fremd, ANLEGEN, ['therapy', (await fremdeOrganisation()).patient, 'X']),
      ).rejects.toThrow(/not allowed/);
    });

    it('kennt keinen Durchgriff zwischen Behandlung und Training (ADR-021 Punkt 6)', async () => {
      const behandlung = await planAnlegen('therapy');
      const training = await planAnlegen('training', trainingRelationships.erika);

      // Die Trainingsbetreuung sieht den Behandlungsplan nicht ...
      expect(await planLesen(behandlung, users.trainer)).toBeNull();
      await expect(
        asUserCommitted(users.trainer, PLAN_SPEICHERN, [behandlung, 'Gekapert', null]),
      ).rejects.toThrow(/exercise plan not found/);
      await expect(
        asUserCommitted(
          users.trainer,
          POSITION,
          positionParameter(null, behandlung, VARIANTE.rudernGelb),
        ),
      ).rejects.toThrow(/exercise plan not found/);
      await expect(
        asUserCommitted(users.trainer, ANLEGEN, ['therapy', patients.erika, 'X']),
      ).rejects.toThrow(/not allowed/);
      // ... und die Therapeutin den Trainingsplan derselben Person nicht.
      expect(await planLesen(training, users.therapist)).toBeNull();
      await expect(asUserCommitted(users.therapist, VERWERFEN, [training])).rejects.toThrow(
        /exercise plan not found/,
      );
      await expect(
        asUserCommitted(users.therapist, ANLEGEN, ['training', trainingRelationships.erika, 'X']),
      ).rejects.toThrow(/not allowed/);
      // Das Büro sieht keine Trainingspläne (ANN-298, ADR-021 Punkt 10).
      expect(await planLesen(training, users.office)).toBeNull();

      // Der Bereich und das Verhältnis passen zusammen - schemaseitig.
      await expect(
        asPostgres(
          `insert into public.exercise_plans (organization_id, service_area, patient_id, title, created_by, updated_by)
           values ($1, 'training', $2, 'X', $3, $3)`,
          [organizationId, patients.erika, users.trainer],
        ),
      ).rejects.toThrow(/exercise_plans_one_relationship/);
    });

    it('protokolliert die Abweisung beim Lesen (access.denied)', async () => {
      await erwarteAbgewiesenenLeseversuch(
        users.trainer,
        `select l from public.list_exercise_plans('therapy', $1::uuid) l where l is not null`,
        [patients.erika],
        'exercise_plans.read',
      );
      await erwarteAbgewiesenenLeseversuch(
        users.office,
        `select l from public.list_exercise_plans('training', $1::uuid) l where l is not null`,
        [trainingRelationships.tina],
        'exercise_plans.read',
      );
    });

    it.each([
      ['Profil ohne Praxisrolle', users.patientMax],
      ['Plattformkonto Kund:in', users.plattformTina],
      ['Plattformkonto Patient:in und Kund:in', users.plattformErika],
      ['Begleitung', users.plattformPaula],
    ])('weist %s ab', async (_wer, konto) => {
      const plan = await planAnlegen();
      // Ohne Praxisrolle: null mit Abweisung; ohne Organisation (Plattformkonto)
      // eine Ausnahme. Beides liefert nichts.
      expect(await liestNichts(planLesen(plan, konto))).toBe(true);
      expect(await liestNichts(liste('therapy', patients.erika, konto))).toBe(true);
      expect(await liestNichts(liste('training', trainingRelationships.erika, konto))).toBe(true);
      await expect(
        asUserCommitted(konto, ANLEGEN, ['therapy', patients.erika, 'X']),
      ).rejects.toThrow(/not allowed/);
      await expect(asUserCommitted(konto, VERWERFEN, [plan])).rejects.toThrow(/not allowed/);
    });

    it('zeigt der fremden Organisation nichts und lässt sie nichts ändern (ADR-003)', async () => {
      const plan = await planAnlegen();
      const item = await positionAnlegen(plan);
      const fremd = await fremdeOrganisation();
      await asPostgres(
        `insert into public.user_roles (user_id, organization_id, role_key) values ($1, $2, 'therapist')
         on conflict do nothing`,
        [fremd.owner, fremd.organizationId],
      );
      try {
        expect(await planLesen(plan, fremd.owner)).toBeNull();
        expect(await liste('therapy', patients.erika, fremd.owner)).toBeNull();
        await expect(
          asUserCommitted(fremd.owner, ANLEGEN, ['therapy', patients.erika, 'X']),
        ).rejects.toThrow(/relationship not found/);
        await expect(
          asUserCommitted(fremd.owner, PLAN_SPEICHERN, [plan, 'Gekapert', null]),
        ).rejects.toThrow(/exercise plan not found/);
        await expect(
          asUserCommitted(
            fremd.owner,
            POSITION,
            positionParameter(item, null, VARIANTE.rudernGelb),
          ),
        ).rejects.toThrow(/exercise plan not found/);
        await expect(asUserCommitted(fremd.owner, ENTFERNEN, [item])).rejects.toThrow(
          /exercise plan not found/,
        );
        await expect(asUserCommitted(fremd.owner, VERWERFEN, [plan])).rejects.toThrow(
          /exercise plan not found/,
        );
        // Eine Variante der eigenen Praxis in den fremden Plan: nicht gefunden.
        const eigener = (
          await asUserCommitted<{ id: string }>(fremd.owner, ANLEGEN, [
            'therapy',
            fremd.patient,
            'X',
          ])
        ).rows[0]!.id;
        await expect(
          asUserCommitted(
            fremd.owner,
            POSITION,
            positionParameter(null, eigener, VARIANTE.rudernGelb),
          ),
        ).rejects.toThrow(/exercise variant not found/);
      } finally {
        await asPostgres(
          `delete from public.user_roles where user_id = $1 and role_key = 'therapist'`,
          [fremd.owner],
        );
      }
      expect((await planLesen(plan))!.title).toBe('Heimprogramm Knie');
    });

    it('gibt keiner Rolle Tabellenrecht - nur die Funktionen (ADR-004)', async () => {
      await planAnlegen();
      for (const tabelle of ['exercise_plans', 'exercise_plan_items']) {
        await expect(asUser(users.therapist, `select * from public.${tabelle}`)).rejects.toThrow(
          /permission denied/,
        );
      }
    });

    it('verlangt eine Anmeldung', async () => {
      await expect(asAnon(PLAN, ['66666666-6666-4666-8666-0000000000ff'])).rejects.toThrow(
        /permission denied|not authenticated/,
      );
    });
  });

  describe('Aufbewahrung und Zusammenführen', () => {
    it('ordnet beide Tabellen beiden Datenklassen zu (ANN-297)', async () => {
      const { rows } = await asPostgres<{ table_name: string; class_key: string }>(
        `select table_name, class_key from public.retention_assignments
         where table_name like 'exercise_plan%' order by table_name, class_key`,
      );
      expect(rows).toEqual([
        { table_name: 'exercise_plan_items', class_key: 'patientenakte' },
        { table_name: 'exercise_plan_items', class_key: 'trainingsverhaeltnis' },
        // UEB-010: Einheiten und Sätze folgen ihrem Plan.
        { table_name: 'exercise_plan_session_sets', class_key: 'patientenakte' },
        { table_name: 'exercise_plan_session_sets', class_key: 'trainingsverhaeltnis' },
        { table_name: 'exercise_plan_sessions', class_key: 'patientenakte' },
        { table_name: 'exercise_plan_sessions', class_key: 'trainingsverhaeltnis' },
        { table_name: 'exercise_plans', class_key: 'patientenakte' },
        { table_name: 'exercise_plans', class_key: 'trainingsverhaeltnis' },
      ]);
    });

    it('fällt mit der Akte (Löschlauf)', async () => {
      const plan = await planAnlegen('therapy', patients.petra);
      await positionAnlegen(plan);
      await asPostgres(
        'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
        [patients.petra],
      );
      const { rows } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.exercise_plan_items',
      );
      expect(rows[0]!.n).toBe(0);
      await resetDatabase();
    });

    it('fällt mit dem Trainingsverhältnis', async () => {
      const neu = 'eeeeeeee-eeee-4eee-8eee-0000000000f1';
      await asPostgres(
        `insert into public.training_relationships (id, organization_id, person_id, status, contract_started_on)
         values ($1, $2, $3, 'active', current_date)`,
        [neu, organizationId, SEED.persons.max],
      );
      const plan = await planAnlegen('training', neu);
      await positionAnlegen(plan, VARIANTE.rudernGelb, {}, users.trainer);
      await asPostgres('delete from public.training_relationships where id = $1', [neu]);
      const { rows } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.exercise_plans',
      );
      expect(rows[0]!.n).toBe(0);
    });

    it('zieht beim Zusammenführen mit der Akte mit (PRX-017)', async () => {
      const plan = await planAnlegen('therapy', patients.petra);
      await positionAnlegen(plan);
      const vorschau = (
        await asPostgres<{ plan: { counts: Record<string, number>; blockers: string[] } }>(
          'select app.patient_merge_plan($1::uuid, $2::uuid, $3::uuid) as plan',
          [organizationId, patients.petra, patients.erika],
        )
      ).rows[0]!.plan;
      expect(vorschau.counts['exercise_plans']).toBe(1);
      await asUserCommitted(
        users.ownerTherapist,
        'select public.merge_patients($1::uuid, $2::uuid)',
        [patients.petra, patients.erika],
      );
      const p = await planLesen(plan);
      expect(p).toMatchObject({ relationship_id: patients.erika });
      expect(p!.items).toHaveLength(1);
      await resetDatabase();
    });
  });
});

const ZUWEISEN = 'select public.assign_exercise_plan($1::uuid, $2::date)';

/** Kalendertag `n` Tage von heute in der Zeitzone der Testpraxis. */
export async function praxistag(n: number): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char(app.training_today($1::uuid) + $2::int, 'YYYY-MM-DD') as tag`,
    [organizationId, n],
  );
  return rows[0]!.tag;
}

export async function zuweisen(
  plan: string,
  tage = 42,
  konto: string = users.therapist,
): Promise<void> {
  await asUserCommitted(konto, ZUWEISEN, [plan, await praxistag(tage)]);
}

describe('Übungspläne: Zuweisen und Schnappschuss (UEB-005)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
  });

  it('weist zu: Laufzeit ab heute, Stempel an der Zeile', async () => {
    const plan = await planAnlegen();
    await positionAnlegen(plan);
    await zuweisen(plan, 42);
    const p = await planLesen(plan);
    expect(p).toMatchObject({
      status: 'assigned',
      runs_from: await praxistag(0),
      runs_until: await praxistag(42),
      original_runs_until: await praxistag(42),
    });
    const { rows } = await asPostgres<{ assigned_by: string }>(
      'select assigned_by from public.exercise_plans where id = $1',
      [plan],
    );
    expect(rows[0]!.assigned_by).toBe(users.therapist);
  });

  it('friert die Bibliothek ein: eine spätere Änderung ändert den Plan nicht (ANN-300)', async () => {
    const plan = await planAnlegen();
    await positionAnlegen(plan, VARIANTE.kniebeugeGelaender);
    await zuweisen(plan);
    const vorher = (await planLesen(plan))!.items[0]!;
    await asPostgres(
      `update public.exercise_variants set name = 'Umbenannt', lay_name = 'Umbenannt',
         instruction = 'Neu', equipment = '{Stuhl}' where id = $1`,
      [VARIANTE.kniebeugeGelaender],
    );
    await asPostgres(
      `update public.exercises set name = 'Umbenannt' where id = (
      select exercise_id from public.exercise_variants where id = $1)`,
      [VARIANTE.kniebeugeGelaender],
    );
    try {
      const nachher = (await planLesen(plan))!.items[0]!;
      expect(nachher).toEqual(vorher);
      expect(nachher).toMatchObject({
        variant_name: 'Kniebeuge am Gelaender, halbe Tiefe',
        exercise_name: 'Kniebeuge',
        equipment: ['Gelaender'],
      });
    } finally {
      await resetDatabase();
    }
  });

  it('ist nach der Zuweisung unveränderlich - für jeden Schreibweg (ANN-300)', async () => {
    const plan = await planAnlegen();
    const item = await positionAnlegen(plan);
    await zuweisen(plan);

    await expect(
      asUserCommitted(users.therapist, PLAN_SPEICHERN, [plan, 'Neu', 2]),
    ).rejects.toThrow(/not a draft/);
    await expect(
      asUserCommitted(
        users.therapist,
        POSITION,
        positionParameter(item, null, VARIANTE.kniebeugeGelaender, { sets: 5 }),
      ),
    ).rejects.toThrow(/not a draft/);
    await expect(positionAnlegen(plan)).rejects.toThrow(/not a draft/);
    await expect(asUserCommitted(users.therapist, ENTFERNEN, [item])).rejects.toThrow(
      /not a draft/,
    );
    await expect(asUserCommitted(users.therapist, VERSCHIEBEN, [item, 'down'])).rejects.toThrow(
      /not a draft/,
    );
    await expect(asUserCommitted(users.therapist, VERWERFEN, [plan])).rejects.toThrow(
      /only a draft/,
    );
    await expect(
      asUserCommitted(users.therapist, ZUWEISEN, [plan, await praxistag(10)]),
    ).rejects.toThrow(/not a draft/);
    // Auch am Riegel vorbei über die Tabelle nicht.
    await expect(
      asPostgres(`update public.exercise_plan_items set sets = 9 where id = $1`, [item]),
    ).rejects.toThrow(/not a draft/);
    await expect(
      asPostgres(`update public.exercise_plans set title = 'Neu' where id = $1`, [plan]),
    ).rejects.toThrow(/cannot be changed/);
    await expect(
      asPostgres(`delete from public.exercise_plans where id = $1`, [plan]),
    ).rejects.toThrow(/only a draft/);
  });

  it.each([
    ['gestern', -1],
    ['länger als 26 Wochen', 183],
  ])('weist eine Laufzeit ab: %s (ANN-302)', async (_fall, tage) => {
    const plan = await planAnlegen();
    await positionAnlegen(plan);
    await expect(zuweisen(plan, tage)).rejects.toThrow(/runs until is invalid/);
  });

  it('lässt 26 Wochen und heute gerade noch zu (ANN-302)', async () => {
    for (const tage of [0, 182]) {
      const plan = await planAnlegen();
      await positionAnlegen(plan);
      await zuweisen(plan, tage);
    }
  });

  it('weist einen leeren Plan nicht zu', async () => {
    const plan = await planAnlegen();
    await expect(zuweisen(plan)).rejects.toThrow(/has no exercises/);
  });

  it('lässt nur die schreibenden Rollen des Bereichs zuweisen (ANN-298)', async () => {
    const behandlung = await planAnlegen();
    await positionAnlegen(behandlung);
    const training = await planAnlegen('training');
    await positionAnlegen(training, VARIANTE.rudernGelb, {}, users.trainer);

    await expect(zuweisen(behandlung, 42, users.office)).rejects.toThrow(/not allowed/);
    await expect(zuweisen(behandlung, 42, users.trainer)).rejects.toThrow(
      /exercise plan not found/,
    );
    await expect(zuweisen(training, 42, users.therapist)).rejects.toThrow(
      /exercise plan not found/,
    );
    await zuweisen(training, 42, users.trainer);
    await zuweisen(behandlung, 42, users.teamLead);
  });

  it('steht in der Auskunft nach Art. 15 - nur der Behandlungsplan', async () => {
    const plan = await planAnlegen('therapy', patients.erika);
    await positionAnlegen(plan, VARIANTE.kniebeugeGelaender, { hinweis: 'Langsam.' });
    await zuweisen(plan);
    await planAnlegen('training', trainingRelationships.erika);
    const { rows } = await asUser<{ daten: { tabellen: Record<string, unknown[]> } }>(
      users.ownerTherapist,
      'select public.export_patient_record($1::uuid) as daten',
      [patients.erika],
    );
    const plaene = rows[0]!.daten.tabellen['exercise_plans'] as Record<string, unknown>[];
    expect(plaene).toHaveLength(1);
    expect(plaene[0]).toMatchObject({ title: 'Heimprogramm Knie', status: 'assigned' });
    expect((plaene[0]!['items'] as Record<string, unknown>[])[0]).toMatchObject({
      variant_name: 'Kniebeuge am Gelaender, halbe Tiefe',
      note: 'Langsam.',
    });
  });
});

const FASSUNG = 'select public.create_exercise_plan_version($1::uuid) as id';

async function neueFassung(plan: string, konto: string = users.therapist): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, FASSUNG, [plan]);
  return rows[0]!.id;
}

describe('Übungspläne: Progression von Hand (UEB-006)', () => {
  let vorige: string;
  let kniebeuge: string;
  let rudern: string;

  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
    vorige = await planAnlegen();
    await asUserCommitted(users.therapist, PLAN_SPEICHERN, [vorige, 'Heimprogramm Knie', 2]);
    kniebeuge = await positionAnlegen(vorige, VARIANTE.kniebeugeGelaender, {
      repsMin: 8,
      repsMax: 12,
      last: '3 kg',
      doppelt: true,
      pause: 60,
    });
    rudern = await positionAnlegen(vorige, VARIANTE.rudernGelb, { sets: 2 });
    await zuweisen(vorige);
  });

  async function schritt(item: string, variante: string, d: Dosierung) {
    return asUserCommitted(users.therapist, POSITION, positionParameter(item, null, variante, d));
  }

  it('übernimmt Titel, Frequenz und Positionen als Entwurf mit Verweis auf die vorige', async () => {
    const neu = await neueFassung(vorige);
    const p = (await planLesen(neu))!;
    expect(p).toMatchObject({
      status: 'draft',
      previous_plan_id: vorige,
      title: 'Heimprogramm Knie',
      sessions_per_week: 2,
    });
    expect(p.items.map((i) => [i.variant_id, i.previous_item_id, i.step_axis])).toEqual([
      [VARIANTE.kniebeugeGelaender, kniebeuge, null],
      [VARIANTE.rudernGelb, rudern, null],
    ]);
    expect(p.previous!.id).toBe(vorige);
    expect((await planLesen(vorige))!.follow_up).toEqual({ id: neu, status: 'draft' });
    await expect(neueFassung(vorige)).rejects.toThrow(/already has a new version/);
  });

  it('doppelte Progression: ein Schritt auf der Achse Last, der Bereich bleibt (IDEA-TRN-007)', async () => {
    const neu = await neueFassung(vorige);
    const item = (await planLesen(neu))!.items[0]!;
    await schritt(item.id, VARIANTE.kniebeugeGelaender, {
      repsMin: 8,
      repsMax: 12,
      last: '5 kg',
      doppelt: true,
      pause: 60,
      achse: 'last',
      richtung: 'harder',
    });
    expect((await planLesen(neu))!.items[0]).toMatchObject({
      load: '5 kg',
      reps_min: 8,
      reps_max: 12,
      step_axis: 'last',
      step_direction: 'harder',
    });
  });

  it('wechselt die Variante nur über eine Verbindung der Bibliothek (UEB-002)', async () => {
    const neu = await neueFassung(vorige);
    const item = (await planLesen(neu))!.items[0]!;
    const basis = { repsMin: 8, repsMax: 12, last: '3 kg', doppelt: true, pause: 60 };
    // Gelaender -> frei: Achse Unterstuetzung, schwerer.
    await expect(
      schritt(item.id, VARIANTE.kniebeugeFrei, { ...basis, achse: 'hebel', richtung: 'harder' }),
    ).rejects.toThrow(/does not match/);
    await expect(
      schritt(item.id, VARIANTE.kniebeugeFrei, {
        ...basis,
        achse: 'unterstuetzung',
        richtung: 'easier',
      }),
    ).rejects.toThrow(/does not match/);
    // Ohne Verbindung (Gelaender -> tief) geht es nicht.
    await expect(
      schritt(item.id, VARIANTE.kniebeugeTief, {
        ...basis,
        achse: 'bewegungsausmass',
        richtung: 'harder',
      }),
    ).rejects.toThrow(/does not match/);
    await schritt(item.id, VARIANTE.kniebeugeFrei, {
      ...basis,
      achse: 'unterstuetzung',
      richtung: 'harder',
    });
    expect((await planLesen(neu))!.items[0]).toMatchObject({
      variant_id: VARIANTE.kniebeugeFrei,
      step_axis: 'unterstuetzung',
    });
  });

  it.each([
    [
      'zwei Achsen',
      {
        repsMin: 10,
        repsMax: 12,
        last: '5 kg',
        doppelt: true,
        pause: 60,
        achse: 'last',
        richtung: 'harder',
      },
      /only one axis/,
    ],
    [
      'ohne Achse',
      { repsMin: 8, repsMax: 12, last: '5 kg', doppelt: true, pause: 60 },
      /step axis is required/,
    ],
    [
      'falsche Achse',
      {
        repsMin: 8,
        repsMax: 12,
        last: '5 kg',
        doppelt: true,
        pause: 60,
        achse: 'tempo',
        richtung: 'harder',
      },
      /does not match/,
    ],
    [
      'Achse ohne Änderung',
      {
        repsMin: 8,
        repsMax: 12,
        last: '3 kg',
        doppelt: true,
        pause: 60,
        achse: 'last',
        richtung: 'harder',
      },
      /does not match/,
    ],
    [
      'Frequenz an der Position',
      {
        repsMin: 8,
        repsMax: 12,
        last: '3 kg',
        doppelt: true,
        pause: 60,
        achse: 'frequenz',
        richtung: 'harder',
      },
      /step is invalid/,
    ],
    [
      'kürzere Pause ist nicht leichter',
      {
        repsMin: 8,
        repsMax: 12,
        last: '3 kg',
        doppelt: true,
        pause: 45,
        achse: 'dichte',
        richtung: 'easier',
      },
      /direction does not match/,
    ],
    [
      'mehr Wiederholungen sind nicht leichter',
      {
        repsMin: 10,
        repsMax: 14,
        last: '3 kg',
        doppelt: true,
        pause: 60,
        achse: 'wiederholungen',
        richtung: 'easier',
      },
      /direction does not match/,
    ],
    [
      'Wechsel zur Dauer',
      {
        repsMin: null,
        repsMax: null,
        dauer: 30,
        last: '3 kg',
        pause: 60,
        achse: 'wiederholungen',
        richtung: 'harder',
      },
      /not a single step/,
    ],
  ])('weist ab: %s (ANN-301)', async (_fall, d, fehler) => {
    const neu = await neueFassung(vorige);
    const item = (await planLesen(neu))!.items[0]!;
    await expect(schritt(item.id, VARIANTE.kniebeugeGelaender, d as Dosierung)).rejects.toThrow(
      fehler,
    );
  });

  it('lässt Hinweis und Sätze-Schritt zu; eine neue Position trägt keinen Schritt', async () => {
    const neu = await neueFassung(vorige);
    const item = (await planLesen(neu))!.items[1]!;
    await schritt(item.id, VARIANTE.rudernGelb, {
      sets: 3,
      hinweis: 'Schultern unten lassen.',
      achse: 'saetze',
      richtung: 'harder',
    });
    await expect(
      positionAnlegen(neu, VARIANTE.brueckeBeidbeinig, { achse: 'saetze', richtung: 'harder' }),
    ).rejects.toThrow(/previous version/);
    await positionAnlegen(neu, VARIANTE.brueckeBeidbeinig);
    expect((await planLesen(neu))!.items.map((i) => i.step_axis)).toEqual([null, 'saetze', null]);
  });

  it('löst mit der Zuweisung die vorige Fassung ab; die vorige bleibt lesbar', async () => {
    const neu = await neueFassung(vorige);
    await zuweisen(neu);
    const alt = (await planLesen(vorige))!;
    expect(alt).toMatchObject({ status: 'superseded', follow_up: { id: neu, status: 'assigned' } });
    expect(alt.items).toHaveLength(2);
    expect((await planLesen(neu))!.status).toBe('assigned');
  });

  it('verwirft eine neue Fassung und legt sie wieder an', async () => {
    const neu = await neueFassung(vorige);
    await asUserCommitted(users.therapist, VERWERFEN, [neu]);
    expect((await planLesen(vorige))!.follow_up).toBeNull();
    await neueFassung(vorige);
  });

  it('gibt nur einem zugewiesenen Plan eine neue Fassung, nur im eigenen Bereich', async () => {
    const entwurf = await planAnlegen();
    await expect(neueFassung(entwurf)).rejects.toThrow(/only an assigned/);
    await expect(neueFassung(vorige, users.trainer)).rejects.toThrow(/exercise plan not found/);
    await expect(neueFassung(vorige, users.office)).rejects.toThrow(/not allowed/);
  });
});

const VERLAENGERN = 'select public.extend_exercise_plan($1::uuid, $2::date)';
const BEENDEN = 'select public.end_exercise_plan($1::uuid)';
const FAELLIG = 'select public.list_due_exercise_plans() as liste';

interface Faellig {
  today: string;
  plans: {
    id: string;
    service_area: string;
    given_name: string;
    title: string;
    runs_until: string;
    follow_up_draft: boolean;
  }[];
}

async function faellig(konto: string): Promise<Faellig | null> {
  const { rows } = await asUser<{ liste: Faellig | null }>(konto, FAELLIG);
  return rows[0]!.liste;
}

/** Verschiebt die Laufzeit eines zugewiesenen Plans in die Vergangenheit - nur für den Test. */
async function laufzeitSetzen(plan: string, von: number, bis: number): Promise<void> {
  await asPostgres(
    `alter table public.exercise_plans disable trigger exercise_plans_guard;
     update public.exercise_plans
        set runs_from = app.training_today(organization_id) + ${von},
            runs_until = app.training_today(organization_id) + ${bis},
            original_runs_until = app.training_today(organization_id) + ${bis}
      where id = '${plan}';
     alter table public.exercise_plans enable trigger exercise_plans_guard;`,
  );
}

describe('Übungspläne: Laufzeit und Wiedervorlage (UEB-007)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
  });

  async function zugewiesen(
    bereich: 'therapy' | 'training' = 'therapy',
    tage = 42,
  ): Promise<string> {
    const konto = bereich === 'therapy' ? users.therapist : users.trainer;
    const plan = await planAnlegen(bereich);
    await positionAnlegen(plan, VARIANTE.rudernGelb, {}, konto);
    await zuweisen(plan, tage, konto);
    return plan;
  }

  it('legt sieben Tage vor dem Ende wieder vor - und nach dem Ende weiter (ANN-302)', async () => {
    const spaeter = await zugewiesen('therapy', 8);
    const bald = await zugewiesen('therapy', 7);
    const vorbei = await zugewiesen('therapy', 30);
    await laufzeitSetzen(vorbei, -40, -1);

    const liste = (await faellig(users.therapist))!;
    expect(liste.plans.map((p) => p.id)).toEqual([vorbei, bald]);
    expect(liste.plans[0]).toMatchObject({ service_area: 'therapy', given_name: 'Erika' });
    expect(liste.plans.map((p) => p.id)).not.toContain(spaeter);

    const l = await asUser<{ liste: { plans: { id: string; review_due: boolean }[] } }>(
      users.therapist,
      LISTE,
      ['therapy', patients.erika],
    );
    const due = Object.fromEntries(l.rows[0]!.liste.plans.map((p) => [p.id, p.review_due]));
    expect(due).toEqual({ [spaeter]: false, [bald]: true, [vorbei]: true });
    expect((await planLesen(bald))!).toMatchObject({ review_due: true });
  });

  it('verlängert: das erste Ende bleibt festgehalten, die Wiedervorlage entfällt', async () => {
    const plan = await zugewiesen('therapy', 5);
    await asUserCommitted(users.therapist, VERLAENGERN, [plan, await praxistag(60)]);
    const p = (await planLesen(plan))!;
    expect(p).toMatchObject({
      status: 'assigned',
      runs_until: await praxistag(60),
      original_runs_until: await praxistag(5),
    });
    expect((await faellig(users.therapist))!.plans).toEqual([]);
    const { rows } = await asPostgres<{ extended_by: string }>(
      'select extended_by from public.exercise_plans where id = $1',
      [plan],
    );
    expect(rows[0]!.extended_by).toBe(users.therapist);
  });

  it.each([
    ['nicht später als bisher', 5],
    ['länger als 26 Wochen ab heute', 183],
  ])('weist eine Verlängerung ab: %s', async (_fall, tage) => {
    const plan = await zugewiesen('therapy', 5);
    await expect(
      asUserCommitted(users.therapist, VERLAENGERN, [plan, await praxistag(tage)]),
    ).rejects.toThrow(/runs until is invalid/);
  });

  it('beendet einen Plan - danach ist nichts mehr zu ändern', async () => {
    const plan = await zugewiesen('therapy', 3);
    await asUserCommitted(users.therapist, BEENDEN, [plan]);
    expect((await planLesen(plan))!.status).toBe('ended');
    expect((await faellig(users.therapist))!.plans).toEqual([]);
    await expect(asUserCommitted(users.therapist, BEENDEN, [plan])).rejects.toThrow(
      /only an assigned/,
    );
    await expect(
      asUserCommitted(users.therapist, VERLAENGERN, [plan, await praxistag(20)]),
    ).rejects.toThrow(/only an assigned/);
    await expect(
      asUserCommitted(users.therapist, 'select public.create_exercise_plan_version($1::uuid)', [
        plan,
      ]),
    ).rejects.toThrow(/only an assigned/);
    await expect(
      asPostgres(`update public.exercise_plans set status = 'assigned' where id = $1`, [plan]),
    ).rejects.toThrow(/cannot be changed/);
  });

  it('beantwortet die Wiedervorlage mit einer zugewiesenen neuen Fassung, nicht mit einem Entwurf', async () => {
    const plan = await zugewiesen('therapy', 3);
    const { rows } = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.create_exercise_plan_version($1::uuid) as id',
      [plan],
    );
    expect((await faellig(users.therapist))!.plans).toEqual([
      expect.objectContaining({ id: plan, follow_up_draft: true }),
    ]);
    await zuweisen(rows[0]!.id, 42);
    expect((await faellig(users.therapist))!.plans).toEqual([]);
  });

  it('zeigt je Bereich nur die eigenen Pläne; das Büro bekommt keine Liste (ANN-302)', async () => {
    const behandlung = await zugewiesen('therapy', 2);
    const training = await zugewiesen('training', 2);
    expect((await faellig(users.therapist))!.plans.map((p) => p.id)).toEqual([behandlung]);
    expect((await faellig(users.trainer))!.plans.map((p) => p.id)).toEqual([training]);
    expect(await faellig(users.office)).toBeNull();

    await expect(asUserCommitted(users.trainer, BEENDEN, [behandlung])).rejects.toThrow(
      /exercise plan not found/,
    );
    await expect(
      asUserCommitted(users.therapist, VERLAENGERN, [training, await praxistag(20)]),
    ).rejects.toThrow(/exercise plan not found/);
    await expect(asUserCommitted(users.office, BEENDEN, [behandlung])).rejects.toThrow(
      /not allowed/,
    );
  });

  it('protokolliert die Abweisung der Liste (access.denied)', async () => {
    await erwarteAbgewiesenenLeseversuch(
      users.office,
      `select l from public.list_due_exercise_plans() l where l is not null`,
      [],
      'exercise_plans.read',
    );
  });

  it('beendet einen Trainingsplan auch nach dem Vertragsende, verlängert ihn aber nicht', async () => {
    const plan = await zugewiesen('training', 20);
    await asPostgres(
      `update public.training_relationships set contract_ended_on = current_date, status = 'inactive' where id = $1`,
      [trainingRelationships.tina],
    );
    try {
      await expect(
        asUserCommitted(users.trainer, VERLAENGERN, [plan, await praxistag(40)]),
      ).rejects.toThrow(/training relationship has ended/);
      await asUserCommitted(users.trainer, BEENDEN, [plan]);
    } finally {
      await asPostgres(
        `update public.training_relationships set contract_ended_on = null, status = 'active' where id = $1`,
        [trainingRelationships.tina],
      );
    }
  });
});

describe('Übungspläne: Kette aus Fassungen und Mandantengrenze (Zweitreview)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
  });

  /** Abgelöst → zugewiesen → Entwurf an einem Verhältnis. */
  async function kette(bereich: 'therapy' | 'training', verhaeltnis: string): Promise<string[]> {
    const konto = bereich === 'therapy' ? users.therapist : users.trainer;
    const erste = await planAnlegen(bereich, verhaeltnis, konto);
    await positionAnlegen(erste, VARIANTE.rudernGelb, {}, konto);
    await zuweisen(erste, 42, konto);
    const zweite = (await asUserCommitted<{ id: string }>(konto, FASSUNG, [erste])).rows[0]!.id;
    await zuweisen(zweite, 42, konto);
    const dritte = (await asUserCommitted<{ id: string }>(konto, FASSUNG, [zweite])).rows[0]!.id;
    return [erste, zweite, dritte];
  }

  async function anzahl(): Promise<number> {
    const { rows } = await asPostgres<{ n: number }>(
      'select (select count(*) from public.exercise_plans)::int + (select count(*) from public.exercise_plan_items)::int as n',
    );
    return rows[0]!.n;
  }

  it('fällt samt zugewiesener und abgelöster Fassungen mit der Akte', async () => {
    const [erste] = await kette('therapy', patients.petra);
    expect((await planLesen(erste!))!.status).toBe('superseded');
    await asPostgres(
      'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
      [patients.petra],
    );
    expect(await anzahl()).toBe(0);
    await resetDatabase();
    await fremdeOrganisation();
  });

  it('fällt samt Kette mit dem Trainingsverhältnis', async () => {
    const neu = 'eeeeeeee-eeee-4eee-8eee-0000000000f2';
    await asPostgres(
      `insert into public.training_relationships (id, organization_id, person_id, status, contract_started_on)
       values ($1, $2, $3, 'active', current_date)`,
      [neu, organizationId, SEED.persons.max],
    );
    await kette('training', neu);
    await asPostgres(
      'select app.delete_training_relationship($1::uuid, extensions.gen_random_uuid(), now())',
      [neu],
    );
    expect(await anzahl()).toBe(0);
  });

  it('zieht die ganze Kette beim Zusammenführen mit, unverändert bis auf die Akte', async () => {
    const plaene = await kette('therapy', patients.petra);
    const vorher = await Promise.all(plaene.map((p) => planLesen(p)));
    await asUserCommitted(
      users.ownerTherapist,
      'select public.merge_patients($1::uuid, $2::uuid)',
      [patients.petra, patients.erika],
    );
    const nachher = await Promise.all(plaene.map((p) => planLesen(p)));
    for (const [i, plan] of nachher.entries()) {
      expect(plan).toEqual({
        ...vorher[i]!,
        relationship_id: patients.erika,
        given_name: 'Erika',
        family_name: plan!.family_name,
      });
    }
    await resetDatabase();
    await fremdeOrganisation();
  });

  it('lässt die fremde Organisation keinen späteren Pfad nutzen (ADR-003)', async () => {
    const [, zugewiesen, entwurf] = await kette('therapy', patients.erika);
    await laufzeitSetzen(zugewiesen!, -40, 2);
    expect((await faellig(users.therapist))!.plans.map((p) => p.id)).toEqual([zugewiesen]);
    const fremd = await fremdeOrganisation();
    await asPostgres(
      `insert into public.user_roles (user_id, organization_id, role_key) values ($1, $2, 'therapist')
       on conflict do nothing`,
      [fremd.owner, fremd.organizationId],
    );
    try {
      const item = (await planLesen(entwurf!))!.items[0]!.id;
      for (const [sql, params] of [
        [ZUWEISEN, [entwurf, await praxistag(20)]],
        [FASSUNG, [zugewiesen]],
        [VERLAENGERN, [zugewiesen, await praxistag(60)]],
        [BEENDEN, [zugewiesen]],
        [VERSCHIEBEN, [item, 'down']],
      ] as const) {
        await expect(asUserCommitted(fremd.owner, sql, [...params])).rejects.toThrow(
          /exercise plan not found/,
        );
      }
      expect((await faellig(fremd.owner))!.plans).toEqual([]);
    } finally {
      await asPostgres(
        `delete from public.user_roles where user_id = $1 and role_key = 'therapist'`,
        [fremd.owner],
      );
    }
    expect((await planLesen(zugewiesen!))!.status).toBe('assigned');
  });
});

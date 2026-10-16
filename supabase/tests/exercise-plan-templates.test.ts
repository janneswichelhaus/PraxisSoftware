import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Vorlagen der Praxis (UEB-014, ANN-560).
 *
 *   * Lesen, wer die Bibliothek liest (owner, therapist, team_lead, trainer,
 *     office); anlegen, wer Pläne schreibt (therapist, team_lead, owner,
 *     trainer); ändern und löschen, wer sie angelegt hat, und owner.
 *   * Abgewiesen: Büro beim Schreiben, Profil ohne Praxisrolle,
 *     Plattformkonto, anon, andere Organisation - auch eine Variante der
 *     anderen Praxis -, archivierte Variante, doppelte Übung, ungültige
 *     Dosierung; dann ist nichts geschrieben.
 *   * Kein Tabellenrecht (ADR-004); Datenklasse und Frist stehen
 *     (ADR-013 Punkt 9 Nr. 4); Löschen nimmt die Übungen mit, eine gelöschte
 *     Variante fällt aus der Vorlage.
 */

const { users, organizationId } = SEED;

const LISTE = 'select public.list_exercise_plan_templates() as liste';
const SPEICHERN = 'select public.save_exercise_plan_template($1::uuid, $2, $3, $4::jsonb) as id';
const LOESCHEN = 'select public.delete_exercise_plan_template($1::uuid)';

const V1 = 'acacacac-acac-4cac-8cac-000000000001';
const V2 = 'acacacac-acac-4cac-8cac-000000000005';
const FREMDE_VARIANTE = 'acacacac-acac-4cac-8cac-0000000000ab';

interface Liste {
  can_create: boolean;
  templates: {
    id: string;
    name: string;
    goal: string | null;
    can_edit: boolean;
    created_by_name: string | null;
    updated_on: string;
    items: Record<string, unknown>[];
  }[];
}

const DREI_MAL_ZEHN = { sets: 3, reps_min: 10, reps_max: 10, per_side: true, times_per_day: 2 };
const DAUER = { sets: 2, duration_seconds: 30 };

function positionen(...varianten: string[]): Record<string, unknown>[] {
  return varianten.map((v, i) => ({ variant_id: v, ...(i % 2 === 0 ? DREI_MAL_ZEHN : DAUER) }));
}

async function liste(konto: string): Promise<Liste> {
  const { rows } = await asUser<{ liste: Liste }>(konto, LISTE);
  return rows[0]!.liste;
}

async function anlegen(
  konto: string = users.therapist,
  name = 'Knie, Hausaufgaben',
  items: Record<string, unknown>[] = positionen(V1, V2),
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, SPEICHERN, [
    null,
    name,
    'Kraft rund ums Knie',
    JSON.stringify(items),
  ]);
  return rows[0]!.id;
}

async function anzahl(): Promise<{ vorlagen: number; uebungen: number }> {
  const { rows } = await asPostgres<{ vorlagen: number; uebungen: number }>(`
    select (select count(*)::int from public.exercise_plan_templates) as vorlagen,
           (select count(*)::int from public.exercise_plan_template_items) as uebungen`);
  return rows[0]!;
}

describe('Vorlagen der Praxis (UEB-014)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
    // Eine Übung der anderen Praxis - nie in einer Vorlage dieser.
    await asPostgres(`
      insert into public.exercises (id, organization_id, name, lay_name, body_region, created_by, updated_by)
      values ('abababab-abab-4bab-8bab-0000000000ab', '${FREMDE_ORGANISATION.organizationId}',
              'Fremde Übung', 'Fremd', 'knie', '${FREMDE_ORGANISATION.owner}', '${FREMDE_ORGANISATION.owner}');
      insert into public.exercise_variants (id, organization_id, exercise_id, name, lay_name, created_by, updated_by)
      values ('${FREMDE_VARIANTE}', '${FREMDE_ORGANISATION.organizationId}',
              'abababab-abab-4bab-8bab-0000000000ab', 'Fremde Variante', 'Fremd',
              '${FREMDE_ORGANISATION.owner}', '${FREMDE_ORGANISATION.owner}');
    `);
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.exercise_plan_templates');
  });

  describe('Anlegen und Lesen', () => {
    it('legt eine Vorlage mit Übungen und Dosierung in ihrer Reihenfolge an', async () => {
      const id = await anlegen(users.therapist, '  Knie, Hausaufgaben  ', positionen(V2, V1));
      const l = await liste(users.therapist);
      expect(l.can_create).toBe(true);
      expect(l.templates).toHaveLength(1);
      const [vorlage] = l.templates;
      expect(vorlage).toMatchObject({
        id,
        name: 'Knie, Hausaufgaben',
        goal: 'Kraft rund ums Knie',
        can_edit: true,
        created_by_name: 'Anna Beispiel',
      });
      expect(vorlage!.items).toEqual([
        {
          variant_id: V2,
          sets: 3,
          reps_min: 10,
          reps_max: 10,
          duration_seconds: null,
          hold_seconds: null,
          per_side: true,
          times_per_day: 2,
          load: null,
          tempo: null,
          rest_seconds: null,
          double_progression: false,
        },
        expect.objectContaining({ variant_id: V1, sets: 2, duration_seconds: 30, reps_min: null }),
      ]);
    });

    it('sortiert nach Name und nach nichts sonst (ADR-006 Punkt 10)', async () => {
      await anlegen(users.therapist, 'Schulter');
      await anlegen(users.trainer, 'atmung');
      await anlegen(users.teamLead, 'Knie');
      const namen = (await liste(users.office)).templates.map((t) => t.name);
      expect(namen).toEqual(['atmung', 'Knie', 'Schulter']);
    });

    it.each([
      ['owner', users.ownerTherapist],
      ['team_lead', users.teamLead],
      ['trainer', users.trainer],
    ])('%s legt an', async (_rolle, konto) => {
      await anlegen(konto, `Vorlage ${_rolle}`);
      expect((await anzahl()).vorlagen).toBe(1);
    });

    it('das Büro liest, legt aber nicht an', async () => {
      await anlegen();
      const l = await liste(users.office);
      expect(l.can_create).toBe(false);
      expect(l.templates[0]!.can_edit).toBe(false);
      await expect(
        asUser(users.office, SPEICHERN, [null, 'Büro', null, JSON.stringify(positionen(V1))]),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it.each([
      ['Profil ohne Praxisrolle', users.patientMax],
      ['Plattformkonto', users.plattformErika],
    ])('%s liest und schreibt nichts', async (_art, konto) => {
      await anlegen();
      await expect(asUser(konto, LISTE)).rejects.toMatchObject({ code: '42501' });
      await expect(
        asUser(konto, SPEICHERN, [null, 'X', null, JSON.stringify(positionen(V1))]),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('anon erreicht keine Funktion', async () => {
      await expect(asAnon(LISTE)).rejects.toMatchObject({ code: '42501' });
      await expect(
        asAnon(SPEICHERN, [null, 'X', null, JSON.stringify(positionen(V1))]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(asAnon(LOESCHEN, [crypto.randomUUID()])).rejects.toMatchObject({
        code: '42501',
      });
    });

    it('die andere Praxis sieht die Vorlage nicht, ändert und löscht sie nicht', async () => {
      const id = await anlegen();
      expect((await liste(FREMDE_ORGANISATION.owner)).templates).toEqual([]);
      await expect(
        asUser(FREMDE_ORGANISATION.owner, SPEICHERN, [id, 'Übernommen', null, null]),
      ).rejects.toMatchObject({ code: 'P0002' });
      await expect(asUser(FREMDE_ORGANISATION.owner, LOESCHEN, [id])).rejects.toMatchObject({
        code: 'P0002',
      });
      expect((await liste(users.therapist)).templates[0]!.name).toBe('Knie, Hausaufgaben');
    });

    it('nimmt keine Variante der anderen Praxis', async () => {
      await expect(
        asUser(users.therapist, SPEICHERN, [
          null,
          'Fremd',
          null,
          JSON.stringify(positionen(V1, FREMDE_VARIANTE)),
        ]),
      ).rejects.toThrow('exercise is not in the library');
      expect(await anzahl()).toEqual({ vorlagen: 0, uebungen: 0 });
    });

    it('die andere Praxis nimmt keine Variante dieser', async () => {
      await expect(
        asUser(FREMDE_ORGANISATION.owner, SPEICHERN, [
          null,
          'Geborgt',
          null,
          JSON.stringify(positionen(V1)),
        ]),
      ).rejects.toThrow('exercise is not in the library');
    });

    it('nimmt keine archivierte Variante und keine Variante einer archivierten Übung', async () => {
      await asPostgres(
        `update public.exercise_variants set archived_at = now(), archived_by = $1 where id = $2`,
        [users.ownerTherapist, V2],
      );
      try {
        await expect(anlegen(users.therapist, 'Archiv', positionen(V2))).rejects.toThrow(
          'exercise is not in the library',
        );
      } finally {
        await asPostgres(
          `update public.exercise_variants set archived_at = null, archived_by = null where id = $1`,
          [V2],
        );
      }
      await asPostgres(
        `update public.exercises set archived_at = now(), archived_by = $1
          where id = (select exercise_id from public.exercise_variants where id = $2)`,
        [users.ownerTherapist, V1],
      );
      try {
        await expect(anlegen(users.therapist, 'Archiv', positionen(V1))).rejects.toThrow(
          'exercise is not in the library',
        );
      } finally {
        await asPostgres(
          `update public.exercises set archived_at = null, archived_by = null
            where id = (select exercise_id from public.exercise_variants where id = $1)`,
          [V1],
        );
      }
    });

    it.each([
      ['ohne Übung', []],
      ['doppelte Übung', positionen(V1, V1)],
      ['weder Wiederholungen noch Dauer', [{ variant_id: V1, sets: 3 }]],
      [
        'Wiederholungen und Dauer',
        [{ variant_id: V1, sets: 3, reps_min: 5, reps_max: 5, duration_seconds: 20 }],
      ],
      ['von größer als bis', [{ variant_id: V1, sets: 3, reps_min: 12, reps_max: 8 }]],
      [
        'Halten ohne Wiederholungen',
        [{ variant_id: V1, sets: 3, duration_seconds: 20, hold_seconds: 5 }],
      ],
      ['zu viele Sätze', [{ variant_id: V1, sets: 21, reps_min: 5, reps_max: 5 }]],
      ['keine Zahl', [{ variant_id: V1, sets: 'drei', reps_min: 5, reps_max: 5 }]],
      ['keine Kennung', [{ variant_id: 'kniebeuge', sets: 3, reps_min: 5, reps_max: 5 }]],
      [
        'mehr als 30',
        Array.from({ length: 31 }, () => ({ variant_id: V1, sets: 1, reps_min: 1, reps_max: 1 })),
      ],
    ])('weist ab: %s - und schreibt nichts', async (_fall, items) => {
      await expect(anlegen(users.therapist, 'Ungültig', items)).rejects.toMatchObject({
        code: '22023',
      });
      expect(await anzahl()).toEqual({ vorlagen: 0, uebungen: 0 });
    });

    it.each([
      ['leerer Name', '  \n '],
      ['zu langer Name', 'x'.repeat(81)],
    ])('weist ab: %s', async (_fall, name) => {
      await expect(anlegen(users.therapist, name)).rejects.toMatchObject({ code: '22023' });
    });

    it('ein Name gilt in der Praxis einmal, ohne Groß- und Kleinschreibung', async () => {
      await anlegen(users.therapist, 'Knie');
      await expect(anlegen(users.teamLead, ' knie ')).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('Ändern und Löschen', () => {
    it('wer angelegt hat, ändert Name und Ziel und lässt die Übungen stehen', async () => {
      const id = await anlegen();
      await asUserCommitted(users.therapist, SPEICHERN, [id, 'Knie, Woche 2', '', null]);
      const [vorlage] = (await liste(users.therapist)).templates;
      expect(vorlage).toMatchObject({ name: 'Knie, Woche 2', goal: null });
      expect(vorlage!.items).toHaveLength(2);
    });

    it('ersetzt die Übungen, wenn sie mitkommen', async () => {
      const id = await anlegen();
      await asUserCommitted(users.therapist, SPEICHERN, [
        id,
        'Knie, Hausaufgaben',
        null,
        JSON.stringify(positionen(V2)),
      ]);
      const [vorlage] = (await liste(users.therapist)).templates;
      expect(vorlage!.items.map((i) => i.variant_id)).toEqual([V2]);
      expect((await anzahl()).uebungen).toBe(1);
    });

    it('owner ändert und löscht jede Vorlage der Praxis', async () => {
      const id = await anlegen(users.therapist);
      expect((await liste(users.ownerTherapist)).templates[0]!.can_edit).toBe(true);
      await asUserCommitted(users.ownerTherapist, SPEICHERN, [id, 'Knie, geprüft', null, null]);
      await asUserCommitted(users.ownerTherapist, LOESCHEN, [id]);
      expect(await anzahl()).toEqual({ vorlagen: 0, uebungen: 0 });
    });

    it('andere Planrollen lesen eine fremde Vorlage, ändern und löschen sie aber nicht', async () => {
      const id = await anlegen(users.therapist);
      for (const konto of [users.teamLead, users.trainer]) {
        expect((await liste(konto)).templates[0]!.can_edit).toBe(false);
        await expect(asUser(konto, SPEICHERN, [id, 'Umbenannt', null, null])).rejects.toMatchObject(
          { code: '42501' },
        );
        await expect(asUser(konto, LOESCHEN, [id])).rejects.toMatchObject({ code: '42501' });
      }
      await expect(asUser(users.office, LOESCHEN, [id])).rejects.toMatchObject({ code: '42501' });
      expect((await anzahl()).vorlagen).toBe(1);
    });

    it('eine unbekannte Vorlage gibt es nicht', async () => {
      await expect(asUser(users.therapist, LOESCHEN, [crypto.randomUUID()])).rejects.toMatchObject({
        code: 'P0002',
      });
    });

    it('Löschen nimmt die Übungen der Vorlage mit (Löschtest, ADR-013 Punkt 9 Nr. 4)', async () => {
      const id = await anlegen();
      expect(await anzahl()).toEqual({ vorlagen: 1, uebungen: 2 });
      await asUserCommitted(users.therapist, LOESCHEN, [id]);
      expect(await anzahl()).toEqual({ vorlagen: 0, uebungen: 0 });
    });

    it('eine gelöschte Variante fällt aus der Vorlage; die Vorlage bleibt', async () => {
      const { rows } = await asPostgres<{ uebung: string }>(`
        insert into public.exercises (organization_id, name, lay_name, body_region, created_by, updated_by)
        values ('${organizationId}', 'Nur für den Test', 'Test', 'knie', '${users.ownerTherapist}', '${users.ownerTherapist}')
        returning id as uebung`);
      const { rows: v } = await asUserCommitted<{ id: string }>(
        users.ownerTherapist,
        'select public.save_exercise_variant(null, $1::uuid, $2, $3, null, $4::text[], null, null) as id',
        [rows[0]!.uebung, 'Testvariante', 'Test', []],
      );
      const variante = v[0]!.id;
      await anlegen(users.therapist, 'Mit Testvariante', positionen(V1, variante));
      await asUserCommitted(
        users.ownerTherapist,
        'select public.delete_exercise_variant($1::uuid)',
        [variante],
      );
      const [vorlage] = (await liste(users.therapist)).templates;
      expect(vorlage!.items.map((i) => i.variant_id)).toEqual([V1]);
    });
  });

  describe('Schema (ADR-004, ADR-008)', () => {
    it.each(['exercise_plan_templates', 'exercise_plan_template_items'])(
      '%s hat kein Tabellenrecht und keine Policy, aber Datenklasse und Frist',
      async (tabelle) => {
        const { rows: grants } = await asPostgres(
          `select privilege_type from information_schema.role_table_grants
            where table_schema = 'public' and table_name = $1
              and grantee in ('anon', 'authenticated')`,
          [tabelle],
        );
        expect(grants).toEqual([]);
        const { rows: policies } = await asPostgres(
          `select policyname from pg_policies where schemaname = 'public' and tablename = $1`,
          [tabelle],
        );
        expect(policies).toEqual([]);
        const { rows: klasse } = await asPostgres<{ class_key: string }>(
          'select class_key from public.retention_assignments where table_name = $1',
          [tabelle],
        );
        expect(klasse).toEqual([{ class_key: 'betriebsdaten' }]);
        await expect(
          asUser(users.ownerTherapist, `select * from public.${tabelle}`),
        ).rejects.toMatchObject({ code: '42501' });
      },
    );
  });
});

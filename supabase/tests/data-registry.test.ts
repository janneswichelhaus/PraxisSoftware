import { beforeAll, describe, expect, it } from 'vitest';
import { AUSKUNFT_KATEGORIEN, TRAINING_KATEGORIEN } from '@/features/datenschutz/kategorien';
import { SEED, asAnon, asPostgres, asUser, resetDatabase } from './helpers/db';

// Das Register der Querschnittsfunktionen (ADR-008 Punkt 13, ANN-751): Jede Tabelle in public trägt
// Personenbezug und die Entscheidungen zu Auskunft, Aufbewahrung, Löschjournal und Zusammenführen.
// Eine neue Tabelle macht diese Datei rot, bis sie dort steht und jede Entscheidung trägt.

/** Fremdschlüssel zwischen Tabellen in public, ohne Organisation, Standort und Selbstbezug. */
const FK = `
  select ch.relname::text collate "C" as child, pa.relname::text collate "C" as parent,
         c.confdeltype::text as art
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class ch on ch.oid = c.conrelid
    join pg_catalog.pg_class pa on pa.oid = c.confrelid
   where c.contype = 'f' and c.conrelid <> c.confrelid
     and ch.relnamespace = 'public'::regnamespace and pa.relnamespace = 'public'::regnamespace
     and pa.relname not in ('organizations', 'locations')`;

/** Die Tabellen, die eine Funktion in public oder app ausdrücklich löscht. */
const GELOESCHT = `
  select m[1] collate "C" as tabelle,
         string_agg(distinct n.nspname || '.' || p.proname, ', ') as funktionen
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace,
         regexp_matches(p.prosrc, 'delete\\s+from\\s+public\\.([a-z_]+)', 'gi') m
   where n.nspname in ('public', 'app')
   group by 1`;

async function liste(sql: string, params: unknown[] = []): Promise<string[]> {
  const { rows } = await asPostgres<{ t: string }>(sql, params);
  return rows.map((r) => r.t);
}

describe('Register der Querschnittsfunktionen (ADR-008 Punkt 13)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('führt jede Tabelle in public genau einmal, und nur Tabellen, die es gibt', async () => {
    expect(
      await liste(`
        select tablename as t from pg_catalog.pg_tables p where schemaname = 'public'
           and not exists (select 1 from public.data_registry r where r.table_name = p.tablename)
        union all
        select table_name from public.data_registry r
         where not exists (select 1 from pg_catalog.pg_tables p
                            where p.schemaname = 'public' and p.tablename = r.table_name)
        order by 1`),
    ).toEqual([]);
  });

  describe('Personenbezug', () => {
    it('nennt jede Tabelle mit Weg zu einer Person personenbezogen', async () => {
      expect(
        await liste(`
          with recursive fk as (${FK}),
          weg(t) as (
            select r collate "C" from unnest(array['patients', 'training_relationships',
              'platform_accesses', 'staff_members', 'persons']::text[]) r
            union select fk.child from fk join weg on fk.parent = weg.t)
          select w.t from weg w join public.data_registry r on r.table_name = w.t
           where r.subject_kind = 'none' order by 1`),
      ).toEqual([]);
    });
  });

  describe('Gegenstand der Kopien', () => {
    it('führt jede Tabelle mit Spalte zu Akte, Verhältnis oder Zugang als deren Daten', async () => {
      expect(
        await liste(`
          select distinct c.table_name as t from information_schema.columns c
            join public.data_registry r on r.table_name = c.table_name
           where c.table_schema = 'public'
             and c.column_name in ('patient_id', 'training_relationship_id', 'access_id',
                                   'platform_access_id')
             and r.subject_kind not in ('patient', 'training', 'patient_training',
                                        'platform_account')
           order by 1`),
      ).toEqual([]);
    });
  });

  describe('Aufbewahrung', () => {
    it('hat für jede Tabelle eine Zuordnung im Aufbewahrungsplan', async () => {
      expect(
        await liste(`
          select r.table_name as t from public.data_registry r
           where not exists (select 1 from public.retention_assignments a
                              where a.table_name = r.table_name)
           order by 1`),
      ).toEqual([]);
    });

    it('schreibt ins Journal nur Klassen, die die Tabelle im Aufbewahrungsplan trägt', async () => {
      expect(
        await liste(`
          select r.table_name || ':' || k.klasse as t
            from public.data_registry r,
                 unnest(array[r.journal_class, r.journal_class_training]) k(klasse)
           where k.klasse is not null
             and not exists (select 1 from public.retention_assignments a
                              where a.table_name = r.table_name and a.class_key = k.klasse)
           order by 1`),
      ).toEqual([]);
    });
  });

  describe('Auskunft', () => {
    for (const [wurzel, funktion, kennung, spalte, beschriftungen] of [
      ['Akte', 'export_patient_record', SEED.patients.max, 'export_patient', AUSKUNFT_KATEGORIEN],
      [
        'Trainingsverhältnis',
        'export_training_record',
        SEED.trainingRelationships.tina,
        'export_training',
        TRAINING_KATEGORIEN,
      ],
    ] as const) {
      it(`die Kopie zum ${wurzel} hat genau die Abschnitte des Registers, jeden beschriftet`, async () => {
        // In JavaScript sortiert: Die Sortierung der Datenbank hängt an ihrer Locale (en_US in der CI).
        const soll = (
          await liste(`select distinct s as t from public.data_registry r, unnest(r.${spalte}) s`)
        ).sort();
        const { rows } = await asUser<{ daten: { tabellen: Record<string, unknown> } }>(
          SEED.users.ownerTherapist,
          `select public.${funktion}($1::uuid) as daten`,
          [kennung],
        );
        expect(Object.keys(rows[0]!.daten.tabellen).sort()).toEqual(soll);
        expect(Object.keys(beschriftungen).sort()).toEqual(soll);
      });
    }

    it('hängt jede verschachtelte Tabelle an einen Elter der Kopie, mit dem sie verbunden ist', async () => {
      expect(
        await liste(`
          with fk as (${FK})
          select r.table_name as t from public.data_registry r
            join public.data_registry e on e.table_name = r.export_parent
           where r.export_mode = 'nested'
             and (e.export_mode not in ('section', 'nested')
                  or not exists (select 1 from fk where fk.child = r.table_name
                                                   and fk.parent = r.export_parent))
           order by 1`),
      ).toEqual([]);
    });
  });

  describe('Löschjournal', () => {
    it('trägt an jeder Tabelle mit eigenem Journal Organisation und Schlüssel', async () => {
      expect(
        await liste(`
          select r.table_name || '.' || s.spalte as t
            from public.data_registry r,
                 unnest(array['organization_id', r.journal_key]) s(spalte)
           where r.journal_mode = 'row'
             and not exists (select 1 from information_schema.columns c
                              where c.table_schema = 'public' and c.table_name = r.table_name
                                and c.column_name = s.spalte)
           order by 1`),
      ).toEqual([]);
    });

    it('hängt den Auslöser genau an die Tabellen mit eigenem Journal (ANN-752)', async () => {
      // Nach jeder gelöschten Zeile (tgtype 9: row, delete, after) und eingeschaltet.
      expect(
        await liste(`
          with ausloeser as (
            select c.relname::text collate "C" as tabelle
              from pg_catalog.pg_trigger t
              join pg_catalog.pg_class c on c.oid = t.tgrelid
             where c.relnamespace = 'public'::regnamespace and t.tgtype = 9
               and t.tgenabled = 'O' and t.tgfoid = 'app.journal_deletion()'::regprocedure)
          select r.table_name || ' ohne Auslöser' as t from public.data_registry r
           where r.journal_mode = 'row'
             and not exists (select 1 from ausloeser a where a.tabelle = r.table_name)
          union all
          select a.tabelle || ' mit Auslöser ohne eigenes Journal' from ausloeser a
           where not exists (select 1 from public.data_registry r
                              where r.table_name = a.tabelle and r.journal_mode = 'row')
          order by 1`),
      ).toEqual([]);
    });

    it('gibt Auslöser und Kern des Zusammenführens keiner Anwendungsrolle zum Aufruf', async () => {
      expect(
        await liste(`
          select r.rolle || ' ' || f.fn as t
            from unnest(array['app.journal_deletion()', 'app.deletion_journal_once()',
                              'app.merge_patients_core(uuid, uuid, uuid, uuid, timestamptz, boolean)'
                             ]) f(fn),
                 unnest(array['anon', 'authenticated']) r(rolle)
           where has_function_privilege(r.rolle, f.fn, 'execute')
           order by 1`),
      ).toEqual([]);
    });

    it('schaltet den Auslöser nur an begründeten Stellen ab (ANN-752)', async () => {
      // Nachziehen und Zusammenführen tragen selbst ein; anonyme Rückmeldungen neu zu schreiben ist
      // keine Löschung (ANN-608).
      expect(
        await liste(`
          select n.nspname || '.' || p.proname as t
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'app') and p.prosrc like '%app.journal_paused%'
             and p.oid <> 'app.journal_deletion()'::regprocedure
           order by 1`),
      ).toEqual([
        'app.delete_due_staff_feedback',
        'app.merge_patients_core',
        'public.reapply_deletion_journal',
      ]);
    });

    it('zieht Kinder vor ihren Eltern nach, auch über Tabellen ohne eigenes Journal', async () => {
      expect(
        await liste(`
          with recursive fk as (${FK}),
          weg(kind, elter) as (
            select fk.child, fk.parent from fk
            union
            select weg.kind, fk.parent from weg join fk on fk.child = weg.elter
             where weg.kind <> fk.parent)
          select k.table_name || ' vor ' || e.table_name as t
            from weg
            join public.data_registry k on k.table_name = weg.kind and k.journal_mode = 'row'
            join public.data_registry e on e.table_name = weg.elter and e.journal_mode = 'row'
           where k.journal_rank >= e.journal_rank
           order by 1`),
      ).toEqual([]);
    });

    it('lässt eine Tabelle nur über einen journalisierten Elter fallen', async () => {
      expect(
        await liste(`
          with recursive fk as (${FK}),
          kette(t) as (
            select table_name collate "C" from public.data_registry where journal_mode = 'row'
            union
            select fk.child from fk
              join public.data_registry r on r.table_name = fk.child and r.journal_mode = 'via_parent'
              join kette on kette.t = fk.parent
             where fk.art = 'c')
          select r.table_name as t from public.data_registry r
           where r.journal_mode = 'via_parent'
             and not exists (select 1 from kette where kette.t = r.table_name)
           order by 1`),
      ).toEqual([]);
    });

    it('begründet jede Löschung von Hand ohne eigenes Journal', async () => {
      const { rows } = await asPostgres<{ tabelle: string; funktionen: string }>(`
        with geloescht as (${GELOESCHT})
        select g.tabelle, g.funktionen from geloescht g
          join public.data_registry r on r.table_name = g.tabelle
         where r.journal_mode <> 'row' and r.subject_kind <> 'none' and r.decision_note is null
         order by 1`);
      expect(rows).toEqual([]);
    });
  });

  describe('Zusammenführen', () => {
    const KERN = `'app.merge_patients_core(uuid, uuid, uuid, uuid, timestamptz, boolean)'::regprocedure`;

    it('zieht genau die Tabellen um, die das Register umziehen oder zusammenlegen lässt', async () => {
      expect(
        await liste(`
          with geaendert as (
            select distinct m[1] collate "C" as tabelle
              from pg_catalog.pg_proc p,
                   regexp_matches(p.prosrc, '(?:update|delete\\s+from)\\s+public\\.([a-z_]+)', 'gi') m
             where p.oid = ${KERN})
          select r.table_name || ' fehlt' as t from public.data_registry r
           where r.merge_mode in ('repoint', 'combine')
             and not exists (select 1 from geaendert g where g.tabelle = r.table_name)
          union all
          select g.tabelle || ' ohne Entscheidung' from geaendert g
           where not exists (select 1 from public.data_registry r
                              where r.table_name = g.tabelle
                                and r.merge_mode in ('repoint', 'combine'))
          order by 1`),
      ).toEqual([]);
    });

    it('führt an polymorphen Tabellen das Verhältnis mit', async () => {
      expect(
        await liste(`
          select r.table_name as t from public.data_registry r
           where r.merge_mode = 'repoint'
             and exists (select 1 from information_schema.columns c
                          where c.table_schema = 'public' and c.table_name = r.table_name
                            and c.column_name = 'relationship_id')
             and (select p.prosrc from pg_catalog.pg_proc p where p.oid = ${KERN})
                 !~* ('update\\s+public\\.' || r.table_name || '\\s+set[^;]*relationship_id')
           order by 1`),
      ).toEqual([]);
    });

    it('prüft jede sperrende Tabelle im Plan', async () => {
      expect(
        await liste(`
          select r.table_name as t from public.data_registry r
           where r.merge_mode = 'blocks'
             and (select p.prosrc from pg_catalog.pg_proc p
                   where p.oid = 'app.patient_merge_plan(uuid, uuid, uuid)'::regprocedure)
                 !~ ('public\\.' || r.table_name || '\\M')
           order by 1`),
      ).toEqual([]);
    });

    it('entscheidet jede Spalte, die auf eine Akte zeigt', async () => {
      expect(
        await liste(`
          with fk as (${FK})
          select distinct fk.child as t from fk
            join public.data_registry r on r.table_name = fk.child
           where fk.parent = 'patients'
             and r.merge_mode not in ('repoint', 'combine', 'blocks')
           order by 1`),
      ).toEqual([]);
    });

    it('lässt keine Tabelle mit Weg zur Akte unentschieden', async () => {
      expect(
        await liste(`
          with recursive fk as (${FK}),
          weg(t) as (select 'patients'::text collate "C"
                     union select fk.child from fk join weg on fk.parent = weg.t)
          select w.t from weg w join public.data_registry r on r.table_name = w.t
           where r.merge_mode = 'not_applicable'
             and r.subject_kind not in ('training', 'staff', 'pseudonymous')
             and r.decision_note is null
           order by 1`),
      ).toEqual([]);
    });
  });
});

describe('Register: Zugriff und Löschlauf (ADR-004, ADR-008)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('ist für keine Anwendungsrolle les- oder schreibbar', async () => {
    const { users } = SEED;
    for (const konto of [users.ownerTherapist, users.office, users.patientMax]) {
      await expect(asUser(konto, 'select table_name from public.data_registry')).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        asUser(konto, "update public.data_registry set decision_note = 'x'"),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(asAnon('select table_name from public.data_registry')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('bleibt im Löschlauf unberührt (Klasse konfiguration, keine Löschung)', async () => {
    const vorher = await liste('select table_name as t from public.data_registry order by 1');
    await asPostgres('select public.apply_retention()');
    expect(await liste('select table_name as t from public.data_registry order by 1')).toEqual(
      vorher,
    );
  });
});

import { Client } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { asPostgres, resetDatabase, testDatabaseUrl } from './helpers/db';

/**
 * Rechte der API-Rollen (ADR-004). Der Shim vergibt in public, was Supabase von selbst
 * vergibt; ein vergessener Entzug fällt deshalb hier auf und nicht erst in der Test-Umgebung.
 */
describe('Rechte der API-Rollen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('anon darf an nichts in public und app', async () => {
    const { rows } = await asPostgres<{ objekt: string }>(`
      select format('%s.%s', n.nspname, c.relname) as objekt
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'app')
         and exists (select 1 from aclexplode(c.relacl) a where a.grantee = 'anon'::regrole)
      union all
      select p.oid::regprocedure::text
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
         and has_function_privilege('anon', p.oid, 'execute')
      order by 1
    `);
    expect(rows).toEqual([]);
    const schema = await asPostgres<{ darf: boolean }>(
      "select has_schema_privilege('anon', 'app', 'usage') as darf",
    );
    expect(schema.rows[0]!.darf).toBe(false);
  });

  it('authenticated: kein TRUNCATE, REFERENCES, TRIGGER, keine Sequenz - das ginge an RLS vorbei', async () => {
    const { rows } = await asPostgres<{ objekt: string }>(`
      select distinct format('%s.%s', n.nspname, c.relname) as objekt
        from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
       where n.nspname in ('public', 'app') and a.grantee = 'authenticated'::regrole
         and (c.relkind = 'S' or a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER'))
       order by 1
    `);
    expect(rows).toEqual([]);
  });

  it('eine neue Funktion führt ohne ausdrückliches Recht keine API-Rolle aus', async () => {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await client.query('begin');
      await client.query(
        "create function public.rechte_probe() returns int language sql as 'select 1'",
      );
      await client.query(
        "create function app.rechte_probe() returns int language sql as 'select 1'",
      );
      const { rows } = await client.query<{ funktion: string; rolle: string }>(`
        select f::text as funktion, r.rolname as rolle
          from unnest(array['public.rechte_probe()', 'app.rechte_probe()']::regprocedure[]) f
          cross join pg_roles r
         where r.rolname in ('anon', 'authenticated', 'service_role')
           and has_function_privilege(r.oid, f, 'execute')
      `);
      expect(rows).toEqual([]);
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
  });
});

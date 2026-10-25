import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { asPostgres, testDatabaseUrl } from './helpers/db';

const BASIS = '20261225000000';
const SKRIPT = path.resolve(import.meta.dirname, '..', 'testumgebung', 'basis-uebernehmen.sql');
const ALT = [...readFileSync(SKRIPT, 'utf8').matchAll(/'(\d{14})'/g)]
  .map((treffer) => treffer[1]!)
  .filter((version) => version < BASIS);

/** Wie der Workflow `test-umgebung.yml`: psql, eine Transaktion, Abbruch beim ersten Fehler. */
function umstellen() {
  return spawnSync(
    'psql',
    [testDatabaseUrl(), '--single-transaction', '-v', 'ON_ERROR_STOP=1', '-f', SKRIPT],
    { encoding: 'utf8' },
  );
}

async function mitHistorie(versionen: string[]) {
  await asPostgres(`
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
  `);
  await asPostgres(
    'insert into supabase_migrations.schema_migrations (version) select unnest($1::text[])',
    [versionen],
  );
}

async function historie() {
  const { rows } = await asPostgres<{ version: string; name: string | null }>(
    'select version, name from supabase_migrations.schema_migrations order by version',
  );
  return rows;
}

describe('Historie der Test-Umgebung auf die Basis umstellen', () => {
  afterEach(async () => {
    await asPostgres('drop schema if exists supabase_migrations cascade');
  });

  it('nennt genau die Migrationen, aus denen die Basis entstand', () => {
    const kopf = readFileSync(
      path.resolve(import.meta.dirname, '..', 'migrations', `${BASIS}_basis.sql`),
      'utf8',
    ).split('\n')[0];
    expect(new Set(ALT).size).toBe(ALT.length);
    expect(kopf).toContain(`Basis aus ${ALT.length} Migrationen bis ${ALT.at(-1)}`);
  });

  it('ersetzt die alten Versionen durch die Basis', async () => {
    await mitHistorie(ALT);
    const lauf = umstellen();
    expect(lauf.status, lauf.stderr).toBe(0);
    expect(await historie()).toEqual([{ version: BASIS, name: 'basis' }]);
  });

  it('stellt nichts um, wenn der Test-Umgebung eine Version fehlt', async () => {
    const fehlt = ALT[100]!;
    await mitHistorie(ALT.filter((version) => version !== fehlt));
    const lauf = umstellen();
    expect(lauf.status).not.toBe(0);
    expect(lauf.stderr).toContain(`Fehlt: ${fehlt}. Unbekannt: -.`);
    expect(await historie()).toHaveLength(ALT.length - 1);
  });

  it('stellt nichts um, wenn sie eine unbekannte Version kennt', async () => {
    await mitHistorie([...ALT, '20261001123456']);
    const lauf = umstellen();
    expect(lauf.status).not.toBe(0);
    expect(lauf.stderr).toContain('Fehlt: -. Unbekannt: 20261001123456.');
    expect(await historie()).toHaveLength(ALT.length + 1);
  });
});

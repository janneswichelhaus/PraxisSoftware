import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'pg';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_DIR = path.resolve(HERE, '..', '..');
const MIGRATIONS_DIR = path.join(SUPABASE_DIR, 'migrations');
const SEED_FILE = path.join(SUPABASE_DIR, 'seed.sql');
const SHIM_FILE = path.join(HERE, 'supabase-shim.sql');

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL ist nicht gesetzt. Lokal: `pnpm db:start` starten, siehe .env.example.',
    );
  }
  return url;
}

async function connect(): Promise<Client> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  return client;
}

/**
 * Setzt die Testdatenbank vollstaendig neu auf: Shim, alle Migrationen in
 * Reihenfolge, dann der synthetische Seed.
 *
 * Der Stand ist damit jederzeit aus Migrationen + Seed reproduzierbar; es gibt
 * keinen manuell gepflegten Zwischenzustand.
 */
export async function resetDatabase(): Promise<void> {
  const client = await connect();
  try {
    await client.query(`
      drop schema if exists public cascade;
      drop schema if exists app cascade;
      drop schema if exists auth cascade;
      drop schema if exists extensions cascade;
      create schema public;
    `);

    await client.query(await readFile(SHIM_FILE, 'utf8'));

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    if (files.length === 0) throw new Error('Keine Migrationen gefunden.');
    for (const file of files) {
      // Pfad stammt aus dem festen Migrationsverzeichnis des Repositories.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query(sql);
      } catch (cause) {
        throw new Error(`Migration ${file} fehlgeschlagen: ${(cause as Error).message}`);
      }
    }

    await client.query(await readFile(SEED_FILE, 'utf8'));
  } finally {
    await client.end();
  }
}

export interface QueryResultRows<T> {
  rows: T[];
}

/**
 * Fuehrt eine Abfrage in der Rolle `authenticated` mit den JWT-Claims des
 * angegebenen Accounts aus - also genau so, wie PostgREST es zur Laufzeit tut.
 * Alles laeuft in einer Transaktion, die anschliessend zurueckgerollt wird.
 */
export async function asUser<T = Record<string, unknown>>(
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResultRows<T>> {
  const client = await connect();
  try {
    await client.query('begin');
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      userId === null ? '{}' : JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    const result = await client.query(sql, params as never[]);
    await client.query('rollback');
    return { rows: result.rows as T[] };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Wie asUser, aber die Transaktion wird bestaetigt statt zurueckgerollt.
 *
 * Noetig fuer Vorgaenge, deren Ergebnis anschliessend geprueft wird - etwa
 * Anlagen und Auditeintraege. Alle Anweisungen laufen auf derselben
 * Verbindung, damit set_local und die Anweisung dieselbe Transaktion teilen.
 */
export async function asUserCommitted<T = Record<string, unknown>>(
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResultRows<T>> {
  const client = await connect();
  try {
    await client.query('begin');
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    const result = await client.query(sql, params as never[]);
    await client.query('commit');
    return { rows: result.rows as T[] };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/** Wie asUser, aber in der Rolle `anon` (nicht angemeldet). */
export async function asAnon<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResultRows<T>> {
  const client = await connect();
  try {
    await client.query('begin');
    await client.query("select set_config('role', 'anon', true)");
    await client.query("select set_config('request.jwt.claims', '{}', true)");
    const result = await client.query(sql, params as never[]);
    await client.query('rollback');
    return { rows: result.rows as T[] };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/** Privilegierter Zugriff - ausschliesslich fuer Testvorbereitung/-nachweis. */
export async function asPostgres<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResultRows<T>> {
  const client = await connect();
  try {
    const result = await client.query(sql, params as never[]);
    return { rows: result.rows as T[] };
  } finally {
    await client.end();
  }
}

/** Feste IDs aus supabase/seed.sql. Ausschliesslich synthetisch. */
export const SEED = {
  organizationId: '22222222-2222-4222-8222-000000000001',
  users: {
    ownerTherapist: '11111111-1111-4111-8111-000000000001', // Jannes Test
    therapist: '11111111-1111-4111-8111-000000000002', // Anna Beispiel
    office: '11111111-1111-4111-8111-000000000003', // Olivia Office
    teamLead: '11111111-1111-4111-8111-000000000004', // Tim Teamleitung
    patientMax: '11111111-1111-4111-8111-000000000005', // Max Mustermann
    patientErika: '11111111-1111-4111-8111-000000000006', // Erika Beispiel
  },
  patients: {
    max: '66666666-6666-4666-8666-000000000001',
    erika: '66666666-6666-4666-8666-000000000002',
    petra: '66666666-6666-4666-8666-000000000003',
  },
  persons: {
    max: '44444444-4444-4444-8444-000000000005',
    erika: '44444444-4444-4444-8444-000000000006',
  },
} as const;

/**
 * Haengt sofort einen Handler an eine bereits laufende Abfrage.
 *
 * In den Nebenlaeufigkeitstests startet die zweite Transaktion, bevor die erste
 * committet; geprueft wird ihr Ergebnis erst danach. In genau diesem Fenster
 * meldet Node eine unbehandelte Ablehnung, sobald die Abfrage schneller
 * scheitert als der Commit zurueckkommt - lokal selten, in CI reproduzierbar.
 * Vitest bricht daran ab, obwohl kein einziger Test fehlschlaegt.
 *
 * Liefert den Fehler, oder null wenn die Abfrage entgegen der Erwartung
 * gelingt. Die Auswertung bleibt damit vollstaendig beim Test.
 */
export function abgefangen(versprechen: Promise<unknown>): Promise<Error | null> {
  return versprechen.then(
    () => null,
    (fehler: Error) => fehler,
  );
}

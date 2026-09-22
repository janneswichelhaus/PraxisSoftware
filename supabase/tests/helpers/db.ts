import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'pg';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_DIR = path.resolve(HERE, '..', '..');
const MIGRATIONS_DIR = path.join(SUPABASE_DIR, 'migrations');
const SEED_FILE = path.join(SUPABASE_DIR, 'seed.sql');
const SHIM_FILE = path.join(HERE, 'supabase-shim.sql');

/**
 * Das Schema entsteht einmal je Lauf, nicht einmal je Test (R3-019).
 *
 * Der Aufbau aus Shim, achtzig Migrationen und Seed dauert rund anderthalb
 * Sekunden; 27 Dateien setzen die Datenbank vor **jedem** Test zurück, das
 * sind rund 540 Aufbauten je Lauf. PostgreSQL kann eine Datenbank aber aus
 * einer Vorlage klonen — dasselbe Ergebnis in einem Bruchteil der Zeit.
 *
 * `praxis_vorlage` trägt den fertigen Stand, `praxis_test` ist die Datenbank,
 * in der die Tests arbeiten; sie wird je Reset verworfen und neu geklont.
 * Fehlt das Recht, Datenbanken anzulegen, fällt der Helfer auf den bisherigen
 * Weg zurück — dann läuft alles wie vorher, nur langsamer.
 */
const VORLAGE = 'praxis_vorlage';
const ARBEIT = 'praxis_test';

/** Signatur des Schemas: Wenn sie sich ändert, entsteht die Vorlage neu. */
let vorlageSignatur: string | null = null;
/** Null heißt: Es wird direkt in der konfigurierten Datenbank gearbeitet. */
let arbeitsUrl: string | null = null;
let klonenMoeglich = true;

function konfigurierteUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL ist nicht gesetzt. Lokal: `pnpm db:start` starten, siehe .env.example.',
    );
  }
  return url;
}

/** Dieselbe Verbindung, aber auf eine andere Datenbank desselben Servers. */
function urlFuer(datenbank: string): string {
  const url = new URL(konfigurierteUrl());
  url.pathname = `/${datenbank}`;
  return url.toString();
}

/**
 * Die Datenbank, in der die Tests arbeiten.
 *
 * Vor dem ersten Reset ist das die konfigurierte; danach der Klon. Tests, die
 * eigene Verbindungen aufmachen (Nebenläufigkeit), kommen über diese Funktion
 * an dieselbe Datenbank wie die Helfer.
 */
export function testDatabaseUrl(): string {
  return arbeitsUrl ?? konfigurierteUrl();
}

async function connect(): Promise<Client> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  return client;
}

/** Eine Verbindung zur konfigurierten Datenbank - für `create database`. */
async function verwaltung(): Promise<Client> {
  const client = new Client({ connectionString: konfigurierteUrl() });
  await client.connect();
  return client;
}

/**
 * Woran sich erkennen lässt, dass die Vorlage veraltet ist: die Namen und
 * Änderungszeiten von Shim, Migrationen und Seed. Im Watch-Betrieb entsteht
 * sie damit nach einer geänderten Migration neu.
 */
async function schemaSignatur(dateien: string[]): Promise<string> {
  const teile: string[] = [];
  for (const datei of [SHIM_FILE, SEED_FILE, ...dateien.map((f) => path.join(MIGRATIONS_DIR, f))]) {
    const info = await stat(datei);
    teile.push(`${path.basename(datei)}:${info.mtimeMs}:${info.size}`);
  }
  return teile.join('|');
}

/**
 * Baut Shim, Migrationen und - sofern `mitSeed` - den Seed in die Datenbank
 * hinter `client`.
 */
async function baueSchema(client: Client, dateien: string[], mitSeed = true): Promise<void> {
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists app cascade;
    drop schema if exists auth cascade;
    drop schema if exists storage cascade;
    drop schema if exists extensions cascade;
    create schema public;
  `);

  await client.query(await readFile(SHIM_FILE, 'utf8'));

  for (const file of dateien) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await client.query(sql);
    } catch (cause) {
      throw new Error(`Migration ${file} fehlgeschlagen: ${(cause as Error).message}`);
    }
  }

  if (mitSeed) await client.query(await readFile(SEED_FILE, 'utf8'));
}

/**
 * Legt die Vorlage an, falls sie fehlt oder veraltet ist.
 *
 * Liefert `false`, wenn der Server das Anlegen von Datenbanken nicht erlaubt -
 * dann bleibt es beim bisherigen Weg.
 */
async function vorlageBereitstellen(dateien: string[]): Promise<boolean> {
  const signatur = await schemaSignatur(dateien);
  if (vorlageSignatur === signatur) return true;

  const leitung = await verwaltung();
  try {
    await leitung.query(`drop database if exists ${ARBEIT} with (force)`);
    await leitung.query(`drop database if exists ${VORLAGE} with (force)`);
    await leitung.query(`create database ${VORLAGE}`);
  } catch {
    klonenMoeglich = false;
    return false;
  } finally {
    await leitung.end();
  }

  const vorlage = new Client({ connectionString: urlFuer(VORLAGE) });
  await vorlage.connect();
  try {
    await baueSchema(vorlage, dateien);
  } finally {
    await vorlage.end();
  }

  vorlageSignatur = signatur;
  return true;
}

/**
 * Setzt die Testdatenbank vollstaendig neu auf: Shim, alle Migrationen in
 * Reihenfolge, dann der synthetische Seed.
 *
 * Der Stand ist damit jederzeit aus Migrationen + Seed reproduzierbar; es gibt
 * keinen manuell gepflegten Zwischenzustand.
 */
export async function resetDatabase(): Promise<void> {
  const dateien = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  if (dateien.length === 0) throw new Error('Keine Migrationen gefunden.');

  if (klonenMoeglich && (await vorlageBereitstellen(dateien))) {
    const leitung = await verwaltung();
    try {
      await leitung.query(`drop database if exists ${ARBEIT} with (force)`);
      await leitung.query(`create database ${ARBEIT} template ${VORLAGE}`);
      arbeitsUrl = urlFuer(ARBEIT);
      return;
    } catch {
      // Klonen ging nicht - ab hier wieder der bisherige Weg.
      klonenMoeglich = false;
      arbeitsUrl = null;
    } finally {
      await leitung.end();
    }
  }

  const client = await connect();
  try {
    await baueSchema(client, dateien);
  } finally {
    await client.end();
  }
}

/** Die Datenbank für den Stand ohne Seed - getrennt von Vorlage und Klon. */
const LEER = 'praxis_leer';

/**
 * Wie resetDatabase, aber ganz ohne Seed: nur Shim und Migrationen.
 *
 * Das ist der Stand, den ein neues Projekt nach den Migrationen der Pipeline
 * hat (OPS-007). Die Probe des Bootstrap-Runbooks braucht genau ihn - mit dem
 * Seed gäbe es schon eine Organisation, und der Bootstrap wiese sich selbst ab.
 * Läuft in einer eigenen Datenbank, damit die Vorlage unberührt bleibt; geht
 * das nicht, wird wie bei resetDatabase in der konfigurierten gebaut.
 */
export async function resetDatabaseOhneSeed(): Promise<void> {
  const dateien = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  if (dateien.length === 0) throw new Error('Keine Migrationen gefunden.');

  if (klonenMoeglich) {
    const leitung = await verwaltung();
    try {
      await leitung.query(`drop database if exists ${LEER} with (force)`);
      await leitung.query(`create database ${LEER}`);
      arbeitsUrl = urlFuer(LEER);
    } catch {
      klonenMoeglich = false;
      arbeitsUrl = null;
    } finally {
      await leitung.end();
    }
  }

  const client = await connect();
  try {
    await baueSchema(client, dateien, false);
  } finally {
    await client.end();
  }
}

/**
 * Wie resetDatabase, aber ohne die Termine des Seeds.
 *
 * Der Seed enthaelt seit UX-001 einen Hausbesuchstag fuer `current_date`,
 * damit die Tagesliste bei der lokalen Abnahme etwas zu zeigen hat. Tests, die
 * ihren Terminbestand selbst aufbauen und ueber das Gesamtergebnis einer
 * Abfrage urteilen, brauchen eine leere Ausgangslage - sonst zaehlen sie die
 * Seed-Termine mit, und ein eigener Termin am selben Tag scheitert an der
 * Ueberschneidungssperre.
 *
 * Bewusst kein geaenderter Standard von resetDatabase: welche Tests vom Seed
 * ausgehen und welche nicht, soll an der Aufrufstelle sichtbar sein.
 */
export async function resetDatabaseOhneTermine(): Promise<void> {
  await resetDatabase();
  await asPostgres('delete from public.treatment_note_versions');
  await asPostgres('delete from public.treatment_notes');
  await asPostgres('delete from public.appointments');
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

/**
 * Wie asUserCommitted, aber so, wie die Storage-API anfragt: mit der Operation
 * in `storage.operation`, transaktionslokal gesetzt (Storage-API v1.72.1,
 * `internal/database/postgres/scope.js`). Die Loeschfreigabe aus FIX-015 gilt
 * nur fuer die Entfernen-Operationen (ANN-052).
 */
export async function asStorageApi<T = Record<string, unknown>>(
  userId: string,
  operation: string,
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
    await client.query("select set_config('storage.operation', $1, true)", [operation]);
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
    trainer: '11111111-1111-4111-8111-000000000007', // Tom Trainingsbetreuung
  },
  patients: {
    max: '66666666-6666-4666-8666-000000000001',
    erika: '66666666-6666-4666-8666-000000000002',
    petra: '66666666-6666-4666-8666-000000000003',
  },
  persons: {
    max: '44444444-4444-4444-8444-000000000005',
    erika: '44444444-4444-4444-8444-000000000006',
    tina: '44444444-4444-4444-8444-000000000009',
  },
  trainingRelationships: {
    /** Nur Training, keine Akte. */
    tina: 'eeeeeeee-eeee-4eee-8eee-000000000001',
    /** Dieselbe Person hat zugleich ein Behandlungsverhaeltnis (ADR-021 Punkt 1). */
    erika: 'eeeeeeee-eeee-4eee-8eee-000000000002',
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

/**
 * Kalendertag `n` Tage von heute aus, als `YYYY-MM-DD`.
 *
 * Die Termintests brauchen Tage in der Zukunft, die kein Feiertag und kein
 * Seed-Termin blockiert; ein fester Tag im Quelltext wäre nach einem Jahr
 * Vergangenheit. Gerechnet wird über UTC — ein Kalendertag, kein Zeitpunkt.
 */
export function tagInTagen(tage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Kennungen der zweiten, rein synthetischen Praxis aus `fremdeOrganisation()`. */
export const FREMDE_ORGANISATION = {
  organizationId: '22222222-2222-4222-8222-0000000000ab',
  owner: '11111111-1111-4111-8111-0000000000ab',
  personOwner: '44444444-4444-4444-8444-0000000000ab',
  personPatient: '44444444-4444-4444-8444-0000000000ac',
  patient: '66666666-6666-4666-8666-0000000000ab',
  staffMember: '55555555-5555-4555-8555-0000000000ab',
} as const;

/**
 * Legt eine zweite Praxis mit eigenem owner, eigenem Patienten und eigener
 * Mitarbeiterin an — die Gegenseite jeder Mandantengrenze (ADR-003).
 *
 * Dreizehn Testdateien bauen diese Fixture bisher selbst; die neun
 * Abrechnungsdateien hatten sie gar nicht (R3-025). Hier steht sie einmal.
 * Mehrfaches Aufrufen ist gutartig: Was schon da ist, bleibt.
 */
export async function fremdeOrganisation(): Promise<typeof FREMDE_ORGANISATION> {
  const f = FREMDE_ORGANISATION;
  await asPostgres(`
    insert into auth.users (id, email, aud, role)
      values ('${f.owner}', 'frida.fremd@praxis.invalid', 'authenticated', 'authenticated')
      on conflict (id) do nothing;
    insert into public.organizations (id, name, time_zone)
      values ('${f.organizationId}', 'Test Praxis Woanders', 'Europe/Berlin')
      on conflict (id) do nothing;
    insert into public.persons (id, organization_id, given_name, family_name) values
      ('${f.personOwner}',   '${f.organizationId}', 'Frida', 'Fremd'),
      ('${f.personPatient}', '${f.organizationId}', 'Peter', 'Fremdpatient')
      on conflict (id) do nothing;
    insert into public.patients (id, organization_id, person_id)
      values ('${f.patient}', '${f.organizationId}', '${f.personPatient}')
      on conflict (id) do nothing;
    insert into public.staff_members (id, organization_id, person_id)
      values ('${f.staffMember}', '${f.organizationId}', '${f.personOwner}')
      on conflict (id) do nothing;
    insert into public.user_profiles (id, organization_id, person_id, display_name)
      values ('${f.owner}', '${f.organizationId}', '${f.personOwner}', 'Frida Fremd')
      on conflict (id) do nothing;
    insert into public.user_roles (user_id, organization_id, role_key)
      values ('${f.owner}', '${f.organizationId}', 'owner')
      on conflict do nothing;
  `);
  return f;
}

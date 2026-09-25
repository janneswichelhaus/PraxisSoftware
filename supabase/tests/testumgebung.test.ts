import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, resetDatabase, testDatabaseUrl } from './helpers/db';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEU_AUFSETZEN = path.resolve(HERE, '..', 'testumgebung', 'neu-aufsetzen.psql');

/** Das Entwicklungskennwort aus supabase/seed.sql - steht im Repository. */
const ENTWICKLUNGSKENNWORT = 'LokalerTestzugang!2026';
const KENNWORT = 'Synthetisch-Testumgebung-7';

/**
 * Ruft das Skript genau so auf wie der Workflow `test-umgebung.yml`: psql,
 * eine Transaktion, Abbruch beim ersten Fehler, Kennwort aus der Umgebung.
 */
function neuAufsetzen(kennwort?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.TESTENV_LOGIN_PASSWORD;
  if (kennwort !== undefined) env.TESTENV_LOGIN_PASSWORD = kennwort;
  return spawnSync(
    'psql',
    [testDatabaseUrl(), '--single-transaction', '-v', 'ON_ERROR_STOP=1', '-f', NEU_AUFSETZEN],
    { env, encoding: 'utf8' },
  );
}

async function konten(kennwort: string) {
  const { rows } = await asPostgres<{ email: string; passt: boolean; hash: string }>(
    `select email, encrypted_password = extensions.crypt($1, encrypted_password) as passt,
            encrypted_password as hash
       from auth.users
      where email like '%@praxis.invalid' or email like '%@patient.invalid'`,
    [kennwort],
  );
  return rows;
}

async function praxiswoche() {
  const { rows } = await asPostgres<{ tag: string; wochentag: number; status: string }>(
    `select ((starts_at at time zone 'Europe/Berlin')::date)::text as tag,
            extract(isodow from starts_at at time zone 'Europe/Berlin')::int as wochentag,
            status
       from public.appointments
      where id::text not like 'aaaaaaaa-%'`,
  );
  return rows;
}

/**
 * OPS-002a: Die Test-Umgebung ist öffentlich erreichbar. Geprüft wird, dass
 * das Kennwort aus dem Repository dort nie gilt, dass ein Fehler nichts halb
 * festschreibt und dass die Praxiswoche eine Woche zeigt.
 */
describe('Test-Umgebung neu aufsetzen (OPS-002a)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('setzt das Kennwort aus dem Secret für alle Seed-Konten, das Entwicklungskennwort gilt nicht mehr', async () => {
    const lauf = neuAufsetzen(KENNWORT);
    expect(lauf.status, lauf.stderr).toBe(0);

    const mitSecret = await konten(KENNWORT);
    expect(mitSecret.length).toBeGreaterThanOrEqual(7);
    expect(mitSecret.every((konto) => konto.passt)).toBe(true);

    const mitEntwicklungskennwort = await konten(ENTWICKLUNGSKENNWORT);
    expect(mitEntwicklungskennwort.some((konto) => konto.passt)).toBe(false);
  });

  it('das Kennwort erscheint nicht in der Ausgabe von psql', () => {
    const lauf = neuAufsetzen(KENNWORT);
    expect(lauf.status, lauf.stderr).toBe(0);
    expect(lauf.stdout + lauf.stderr).not.toContain(KENNWORT);
  });

  it('ohne Secret sind alle Konten gesperrt: kein bekanntes Kennwort, kein gemeinsames', async () => {
    const lauf = neuAufsetzen();
    expect(lauf.status, lauf.stderr).toBe(0);
    expect(lauf.stderr).toContain('gesperrt');

    const rows = await konten(ENTWICKLUNGSKENNWORT);
    expect(rows.some((konto) => konto.passt)).toBe(false);
    expect(new Set(rows.map((konto) => konto.hash)).size).toBe(rows.length);
    expect((await konten('')).some((konto) => konto.passt)).toBe(false);
  });

  it('ein zu kurzes Kennwort bricht ab und schreibt nichts fest - auch den Seed nicht', async () => {
    await asPostgres(`delete from public.treatment_text_snippets`);

    const lauf = neuAufsetzen('zu-kurz');
    expect(lauf.status).not.toBe(0);
    expect(lauf.stderr).toContain('kuerzer als 12 Zeichen');

    // Der Stand vor dem Lauf ist unverändert: Der gelöschte Baustein ist
    // nicht zurück, und es gibt keine Praxiswoche.
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.treatment_text_snippets',
    );
    expect(rows[0]?.n).toBe(0);
    expect(await praxiswoche()).toHaveLength(0);
  });

  it('legt fünf Werktage um heute an, heute selbst ausgespart', async () => {
    const lauf = neuAufsetzen(KENNWORT);
    expect(lauf.status, lauf.stderr).toBe(0);

    const { rows: heuteRows } = await asPostgres<{ heute: string }>(
      'select current_date::text as heute',
    );
    const heute = heuteRows[0]!.heute;
    const termine = await praxiswoche();

    const tage = new Set(termine.map((termin) => termin.tag));
    expect(tage.has(heute)).toBe(false);
    // Sieben Kalendertage enthalten fünf Werktage; ist heute einer, fehlt er.
    expect(tage.size).toBeGreaterThanOrEqual(4);
    expect(tage.size).toBeLessThanOrEqual(5);
    expect([...tage].some((tag) => tag > heute)).toBe(true);
    expect(termine).toHaveLength(tage.size * 4);
    expect(termine.every((termin) => termin.wochentag >= 1 && termin.wochentag <= 5)).toBe(true);

    for (const termin of termine) {
      expect(termin.status).toBe(termin.tag < heute ? 'completed' : 'confirmed');
    }
  });

  it('ein zweiter Lauf erzeugt dieselbe Woche, keine doppelten Termine', async () => {
    expect(neuAufsetzen(KENNWORT).status).toBe(0);
    const erster = await praxiswoche();
    expect(neuAufsetzen(KENNWORT).status).toBe(0);
    expect(await praxiswoche()).toHaveLength(erster.length);
  });

  it('die Woche ist für die Therapeutin sichtbar, für ein Patientenkonto nicht', async () => {
    expect(neuAufsetzen(KENNWORT).status).toBe(0);
    const anzahl = 'select count(*)::int as n from public.appointments';

    const anna = await asUser<{ n: number }>(SEED.users.therapist, anzahl);
    expect(anna.rows[0]!.n).toBeGreaterThan(6);

    const patient = await asUser<{ n: number }>(SEED.users.patientMax, anzahl);
    expect(patient.rows[0]!.n).toBe(0);
  });
});

import { Client } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  fremdeOrganisation,
  resetDatabase,
  testDatabaseUrl,
  jwtClaims,
} from './helpers/db';

/**
 * Die erste Plattformprojektion (POR-004, ADR-023 Punkte 18, 19, 22, 23).
 *
 * Jede Plattformprojektion hat ihre Negativfälle (Punkt 23): fremde Person,
 * anderes Verhältnis derselben Person ohne Zugang, Zugang eingeladen,
 * gesperrt und entzogen, abgelaufene Lesefrist, Praxiskonto, andere
 * Organisation. Die Begleitung (Einwilligung, Widerruf, Export) kommt mit
 * POR-EPIC-001b.
 */

const { users, platformAccesses, patients, trainingRelationships } = SEED;
const KONTEXT = 'select * from public.platform_context()';

/** Wie eine Projektion über `app.platform_readable_access` prüft. */
const LESBAR = `select count(*)::int as n from app.platform_readable_access($1::uuid)`;

async function kontext(konto: string) {
  const { rows } = await asUser<{
    access_id: string;
    organization_name: string;
    relationship_kind: string;
    status: string;
    readable: boolean;
    read_until: string | null;
    access_kind: string;
    represented_name: string | null;
  }>(konto, KONTEXT);
  return rows;
}

/**
 * Die interne Prüfung, aufgerufen im Namen eines Kontos. Sie ist für keine
 * Anwendungsrolle ausführbar; hier läuft sie als Eigentümer mit den Claims
 * des Kontos, so wie eine Projektion sie aufruft.
 */
async function lesbar(konto: string, zugang: string): Promise<boolean> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('request.jwt.claims', $1, true)", [jwtClaims(konto)]);
    const { rows } = await client.query<{ n: number }>(LESBAR, [zugang]);
    await client.query('rollback');
    return Number(rows[0]?.n) > 0;
  } finally {
    await client.end();
  }
}

describe('platform_context', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt einem Plattformkonto seine Zugaenge und sonst nichts', async () => {
    const tina = await kontext(users.plattformTina);
    expect(tina).toEqual([
      {
        access_id: platformAccesses.tinaTraining,
        organization_name: 'Test Praxis Tuebingen',
        relationship_kind: 'training',
        status: 'active',
        readable: true,
        read_until: null,
        access_kind: 'self',
        represented_name: null,
      },
    ]);
    // Keine Kennung des Verhältnisses, keine Anschrift (Punkt 22); ein Name
    // nur bei einer Vertretung (POR-006).
    expect(Object.keys(tina[0]!).sort()).toEqual([
      'access_id',
      'access_kind',
      'organization_name',
      'read_until',
      'readable',
      'relationship_kind',
      'represented_name',
      'status',
    ]);
  });

  it('zeigt beide Bereiche einer Person mit zwei Zugaengen (D6)', async () => {
    const erika = await kontext(users.plattformErika);
    expect(erika.map((z) => z.relationship_kind).sort()).toEqual(['training', 'treatment']);
  });

  it('fremde Person: kein Konto sieht die Zugaenge eines anderen', async () => {
    const tina = await kontext(users.plattformTina);
    expect(tina.map((z) => z.access_id)).not.toContain(platformAccesses.erikaBehandlung);
    expect(await lesbar(users.plattformTina, platformAccesses.erikaBehandlung)).toBe(false);
    expect(await lesbar(users.plattformErika, platformAccesses.erikaBehandlung)).toBe(true);
  });

  it('anderes Verhaeltnis ohne Zugang: entzogenes Training, Behandlung bleibt', async () => {
    await asPostgres(
      `update public.platform_accesses
          set status = 'revoked', revoked_at = now(), revoked_reason = 'practice'
        where id = $1`,
      [platformAccesses.erikaTraining],
    );
    const erika = await kontext(users.plattformErika);
    expect(erika.map((z) => z.relationship_kind)).toEqual(['treatment']);
    expect(await lesbar(users.plattformErika, platformAccesses.erikaTraining)).toBe(false);
  });

  it('gesperrt: sichtbar als gesperrt, aber nicht lesbar (Punkt 18)', async () => {
    await asPostgres(
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      [platformAccesses.tinaTraining],
    );
    expect(await kontext(users.plattformTina)).toEqual([
      expect.objectContaining({ status: 'locked', readable: false }),
    ]);
    expect(await lesbar(users.plattformTina, platformAccesses.tinaTraining)).toBe(false);
  });

  it('eingeladen: ein Zugang ohne Konto zeigt niemandem etwas', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.platform_accesses
         (organization_id, relationship_kind, relationship_id, patient_id, created_by)
       values ($1, 'treatment', $2, $2, $3) returning id`,
      [SEED.organizationId, patients.max, users.office],
    );
    expect(await lesbar(users.plattformTina, rows[0]!.id)).toBe(false);
    expect((await kontext(users.plattformTina)).map((z) => z.access_id)).not.toContain(rows[0]!.id);
  });

  it('abgelaufene Lesefrist: 30 Tage nach Vertragsende ist nichts mehr lesbar (D2)', async () => {
    await asPostgres(
      `update public.training_relationships set contract_ended_on = current_date - 10 where id = $1`,
      [trainingRelationships.tina],
    );
    expect(await kontext(users.plattformTina)).toEqual([
      expect.objectContaining({ readable: true, read_until: expect.any(Date) as unknown }),
    ]);
    await asPostgres(
      `update public.training_relationships set contract_ended_on = current_date - 40 where id = $1`,
      [trainingRelationships.tina],
    );
    expect(await kontext(users.plattformTina)).toEqual([
      expect.objectContaining({ status: 'active', readable: false }),
    ]);
    expect(await lesbar(users.plattformTina, platformAccesses.tinaTraining)).toBe(false);
  });

  it('Praxiskonto: keine Zeile, auch nicht fuer die owner:in', async () => {
    for (const konto of [users.ownerTherapist, users.office, users.trainer, users.patientMax]) {
      expect(await kontext(konto)).toEqual([]);
    }
  });

  it('andere Organisation: ihr Konto sieht nichts von hier', async () => {
    const fremd = await fremdeOrganisation();
    expect(await kontext(fremd.owner)).toEqual([]);
  });

  it('ohne Anmeldung: keine Zeile, fuer anon nicht aufrufbar', async () => {
    expect((await asUser(null, KONTEXT)).rows).toEqual([]);
  });
});

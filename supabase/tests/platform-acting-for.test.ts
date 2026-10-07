import { Client } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabase,
  testDatabaseUrl,
  jwtClaims,
} from './helpers/db';

/**
 * „Sie handeln für …" (POR-006, ADR-023 Punkte 13, 14, 23, 24; W3, W5).
 *
 * Die Rechte je Art stehen an einer Stelle (`app.platform_access_allows`).
 * Jeder Zugriff über eine Vertretung steht im Protokoll, auch der lesende;
 * Akteur ist das Konto der vertretenden Person, Gegenstand das Verhältnis
 * der vertretenen. Das eigene Lesen bleibt unprotokolliert.
 */

const { users, platformAccesses, patients, organizationId } = SEED;
const KONTEXT = 'select * from public.platform_context()';
const PAULA = platformAccesses.paulaBegleitungMax;

/** Die interne Prüfung, im Namen eines Kontos, so wie eine Projektion sie aufruft. */
async function erlaubt(konto: string, zugang: string, recht: string): Promise<boolean> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('request.jwt.claims', $1, true)", [jwtClaims(konto)]);
    const { rows } = await client.query<{ ok: boolean }>(
      'select app.platform_access_allows($1::uuid, $2) as ok',
      [zugang, recht],
    );
    await client.query('rollback');
    return rows[0]?.ok === true;
  } finally {
    await client.end();
  }
}

async function vertretungsEintraege() {
  return (
    await asPostgres<{
      actor_user_id: string;
      actor_kind: string;
      subject_type: string;
      subject_id: string;
      context: Record<string, unknown>;
    }>(
      `select actor_user_id, actor_kind, subject_type, subject_id, context
         from public.audit_log where action = 'platform_representation.read'
        order by occurred_at, id`,
    )
  ).rows;
}

describe('platform_context: Sie handeln für … (Punkt 14)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('nennt der Begleitung die vertretene Person und protokolliert den Zugriff', async () => {
    const { rows } = await asUserCommitted<Record<string, unknown>>(users.plattformPaula, KONTEXT);
    expect(rows).toEqual([
      expect.objectContaining({
        access_id: PAULA,
        relationship_kind: 'treatment',
        access_kind: 'companion',
        represented_name: 'Max Mustermann',
        readable: true,
      }),
    ]);
    expect(await vertretungsEintraege()).toEqual([
      {
        actor_user_id: users.plattformPaula,
        actor_kind: 'representative',
        subject_type: 'patient',
        subject_id: patients.max,
        context: {
          surface: 'platform',
          platform_access_id: PAULA,
          access_kind: 'companion',
          view: 'context',
        },
      },
    ]);
  });

  it('protokolliert das eigene Lesen der Person nicht (W5)', async () => {
    const { rows } = await asUserCommitted<{ represented_name: string | null }>(
      users.plattformErika,
      KONTEXT,
    );
    expect(rows.map((z) => z.represented_name)).toEqual([null, null]);
    expect(await vertretungsEintraege()).toEqual([]);
  });

  it('gesperrt: kein Name, kein Zugriff, kein Eintrag', async () => {
    await asPostgres(
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      [PAULA],
    );
    const { rows } = await asUserCommitted<Record<string, unknown>>(users.plattformPaula, KONTEXT);
    expect(rows).toEqual([
      expect.objectContaining({ status: 'locked', readable: false, represented_name: null }),
    ]);
    expect(await vertretungsEintraege()).toEqual([]);
  });

  it('entzogen: keine Zeile', async () => {
    await asPostgres(
      `update public.platform_accesses
          set status = 'revoked', revoked_at = now(), revoked_reason = 'practice'
        where id = $1`,
      [PAULA],
    );
    expect((await asUser(users.plattformPaula, KONTEXT)).rows).toEqual([]);
  });

  it('abgelaufene Lesefrist: kein Name mehr (D2)', async () => {
    await asPostgres(
      `update public.patients
          set care_concluded_on = current_date - 40, care_concluded_at = now(),
              care_concluded_by = $2::uuid
        where id = $1`,
      [patients.max, users.therapist],
    );
    const { rows } = await asUser<Record<string, unknown>>(users.plattformPaula, KONTEXT);
    expect(rows).toEqual([expect.objectContaining({ readable: false, represented_name: null })]);
  });

  it('der Name im Protokoll steht nie im Kontext', async () => {
    await asUserCommitted(users.plattformPaula, KONTEXT);
    expect(JSON.stringify(await vertretungsEintraege())).not.toContain('Mustermann');
  });
});

describe('Rechte je Art (Punkt 13, W3)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('Begleitung: lesen, Wünsche, Nachrichten - keine Einwilligung, kein Export', async () => {
    for (const recht of ['read', 'request', 'message']) {
      expect(await erlaubt(users.plattformPaula, PAULA, recht)).toBe(true);
    }
    for (const recht of ['consent', 'export', 'manage_companions', 'irgendwas']) {
      expect(await erlaubt(users.plattformPaula, PAULA, recht)).toBe(false);
    }
  });

  it('die Person selbst und die rechtliche Vertretung: alles', async () => {
    for (const recht of ['read', 'consent', 'export', 'manage_companions']) {
      expect(await erlaubt(users.plattformErika, platformAccesses.erikaBehandlung, recht)).toBe(
        true,
      );
    }
    await asPostgres(
      `insert into public.platform_accesses
         (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
          status, activated_at, access_kind, legal_basis, representative_name, proof_documents,
          health_scope, finance_scope, proof_recorded_by, proof_recorded_at, created_by)
       values ('cafecafe-cafe-4afe-8afe-0000000000c1', $1, 'treatment', $2, $2, $3,
               'active', now(), 'legal_representative', 'guardianship', 'Bernd Betreuer',
               array['identity_document', 'guardianship_certificate'], true, false, $4, now(), $4)`,
      [organizationId, patients.erika, users.plattformTina, users.office],
    );
    for (const recht of ['consent', 'export', 'manage_companions']) {
      expect(
        await erlaubt(users.plattformTina, 'cafecafe-cafe-4afe-8afe-0000000000c1', recht),
      ).toBe(true);
    }
  });

  /**
   * ABN-010 (BEF-119, BEF-116): Rechnungen nur für die nachgewiesenen bzw.
   * eingewilligten Bereiche. Gesundheitssorge allein gibt keinen
   * Abrechnungszugriff.
   */
  it('Rechnungen: die Person selbst immer, eine Vertretung nur mit dem Bereich', async () => {
    expect(await erlaubt(users.plattformErika, platformAccesses.erikaBehandlung, 'billing')).toBe(
      true,
    );
    // Paula: Begleitung ohne Einwilligung in Rechnungen (Seed).
    expect(await erlaubt(users.plattformPaula, PAULA, 'billing')).toBe(false);

    await asPostgres(
      `insert into public.platform_accesses
         (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
          status, activated_at, access_kind, legal_basis, representative_name, proof_documents,
          health_scope, finance_scope, proof_recorded_by, proof_recorded_at, created_by)
       values ('cafecafe-cafe-4afe-8afe-0000000000c2', $1, 'treatment', $2, $2, $3,
               'active', now(), 'legal_representative', 'guardianship', 'Bernd Betreuer',
               array['identity_document', 'guardianship_certificate'], true, false, $4, now(), $4),
              ('cafecafe-cafe-4afe-8afe-0000000000c3', $1, 'treatment', $2, $2, $5,
               'active', now(), 'legal_representative', 'power_of_attorney', 'Vera Vollmacht',
               array['identity_document', 'power_of_attorney'], true, true, $4, now(), $4)`,
      [organizationId, patients.erika, users.plattformTina, users.office, users.plattformPaula],
    );
    // Betreuung nur mit Gesundheitssorge: kein Abrechnungszugriff.
    expect(
      await erlaubt(users.plattformTina, 'cafecafe-cafe-4afe-8afe-0000000000c2', 'billing'),
    ).toBe(false);
    expect(await erlaubt(users.plattformTina, 'cafecafe-cafe-4afe-8afe-0000000000c2', 'read')).toBe(
      true,
    );
    // Vollmacht mit Vermögenssorge: Rechnungen ja.
    expect(
      await erlaubt(users.plattformPaula, 'cafecafe-cafe-4afe-8afe-0000000000c3', 'billing'),
    ).toBe(true);
  });

  it('eine Begleitung mit Einwilligung in Rechnungen sieht sie', async () => {
    await asPostgres(
      'alter table public.platform_accesses disable trigger platform_accesses_guard',
    );
    await asPostgres('update public.platform_accesses set finance_scope = true where id = $1', [
      PAULA,
    ]);
    await asPostgres('alter table public.platform_accesses enable trigger platform_accesses_guard');
    expect(await erlaubt(users.plattformPaula, PAULA, 'billing')).toBe(true);
  });

  it.each([
    ['fremde Person', users.plattformTina, null],
    ['Praxiskonto', users.office, null],
    [
      'gesperrt',
      users.plattformPaula,
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
    ],
    [
      'entzogen',
      users.plattformPaula,
      `update public.platform_accesses
          set status = 'revoked', revoked_at = now(), revoked_reason = 'practice' where id = $1`,
    ],
  ] as const)('%s: kein Recht', async (_fall, konto, aendern) => {
    if (aendern !== null) await asPostgres(aendern, [PAULA]);
    expect(await erlaubt(konto, PAULA, 'read')).toBe(false);
  });

  it('anderes Verhältnis derselben Person ohne Zugang: kein Recht', async () => {
    // Paula begleitet Max' Behandlung, nicht Erikas Training.
    expect(await erlaubt(users.plattformPaula, platformAccesses.erikaTraining, 'read')).toBe(false);
  });

  it('ist für keine Anwendungsrolle direkt ausführbar', async () => {
    const { rows } = await asPostgres(`
      select r.rolname from pg_roles r
      where r.rolname in ('anon', 'authenticated', 'service_role')
        and (has_function_privilege(r.oid, 'app.platform_access_allows(uuid, text)', 'execute')
          or has_function_privilege(r.oid, 'app.log_platform_representation(uuid, text, jsonb)', 'execute'))
    `);
    expect(rows).toEqual([]);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * VER-001: Verordner:innen.
 *
 * Die Kartei enthält keine Patientendaten - erst die Verordnung stellt den
 * Bezug her (ANN-013). Sie ist deshalb die einzige Tabelle dieses Epics mit
 * einer gewöhnlichen Lesepolicy. Geschrieben wird trotzdem nur über
 * Funktionen: deny-by-default gilt unverändert (ADR-004).
 */
const { users, organizationId } = SEED;

const LESEN = 'select id, family_name, practice_name from public.prescribers order by family_name';

const ANLEGEN = `
  select public.create_prescriber($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as id`;

const AENDERN = `
  select public.update_prescriber($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) as id`;

const PROBST = '77777777-7777-4777-8777-000000000001';
const FREMDE_ID = '99999999-9999-4999-8999-000000000009';

async function anlegen(userId: string, familyName: string, praxis: string | null = null) {
  return asUserCommitted<{ id: string }>(userId, ANLEGEN, [
    familyName,
    null,
    null,
    praxis,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
}

describe('VER-001: Verordner:innen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt die Kartei allen vier Praxisrollen', async () => {
    for (const konto of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
      const { rows } = await asUser<{ family_name: string }>(konto, LESEN);
      expect(rows.map((r) => r.family_name)).toEqual(['Hausarzt', 'Probst']);
    }
  });

  it('zeigt einem Patientenkonto und anon nichts', async () => {
    const { rows } = await asUser(users.patientMax, LESEN);
    expect(rows).toEqual([]);

    await expect(asAnon(LESEN)).rejects.toThrow(/permission denied/i);
  });

  it('legt eine Verordner:in in der Organisation des Aufrufers an', async () => {
    const { rows } = await anlegen(users.office, 'Neuarzt', 'Praxis Neuarzt');
    const { rows: geprueft } = await asPostgres<{ organization_id: string; created_by: string }>(
      'select organization_id, created_by from public.prescribers where id = $1',
      [rows[0]!.id],
    );
    expect(geprueft[0]?.organization_id).toBe(organizationId);
    expect(geprueft[0]?.created_by).toBe(users.office);
  });

  it('nimmt keine organization_id entgegen - Einschleusung ist strukturell unmoeglich', async () => {
    const { rows } = await asPostgres<{ args: string }>(`
      select pg_get_function_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_prescriber'
    `);
    expect(rows[0]?.args ?? '').not.toMatch(/organization/i);
  });

  it('verlangt einen Nachnamen und normalisiert Leerraum', async () => {
    await expect(anlegen(users.office, '   ')).rejects.toThrow(/family_name is required/i);
  });

  it('verhindert dieselbe Person zweimal in derselben Praxis', async () => {
    await anlegen(users.office, 'Doppelt', 'Praxis Doppelt');
    await expect(anlegen(users.office, '  doppelt ', 'praxis doppelt')).rejects.toThrow(
      /prescribers_identity_idx|duplicate key/i,
    );
  });

  it('aendert eine Verordner:in und schreibt updated_by mit', async () => {
    await asUserCommitted(users.therapist, AENDERN, [
      PROBST,
      'Probst-Neu',
      'Petra',
      'Dr. med.',
      'Orthopaedische Gemeinschaftspraxis Fiktiv',
      'Orthopaedie',
      'Aerztegasse',
      '3',
      '72070',
      'Tuebingen',
      '+49 7071 0000499',
      null,
      null,
    ]);

    const { rows } = await asPostgres<{ family_name: string; phone: string; updated_by: string }>(
      'select family_name, phone, updated_by from public.prescribers where id = $1',
      [PROBST],
    );
    expect(rows[0]?.family_name).toBe('Probst-Neu');
    expect(rows[0]?.phone).toBe('+49 7071 0000499');
    expect(rows[0]?.updated_by).toBe(users.therapist);
  });

  it('unterscheidet eine unbekannte nicht von einer fremden ID', async () => {
    await expect(
      asUser(users.office, AENDERN, [
        FREMDE_ID,
        'Egal',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/prescriber not found/i);
  });

  it('laesst ein Patientenkonto weder anlegen noch aendern', async () => {
    await expect(
      asUser(users.patientMax, ANLEGEN, [
        'Schleichweg',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/not allowed to manage prescribers/i);
  });

  it('gibt der Rolle authenticated auf prescribers ausschliesslich SELECT', async () => {
    const { rows } = await asPostgres<{ privilege_type: string }>(`
      select privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'prescribers'
        and grantee in ('anon', 'authenticated')
    `);
    expect(rows.map((r) => r.privilege_type)).toEqual(['SELECT']);
  });
});

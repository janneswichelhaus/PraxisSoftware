import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * ICD-10 an der Behandlungsgrundlage (Akte entschlacken, 2026-10-03).
 *
 * Der Code ist klinisch wie die Diagnose: gelesen nur über die klinischen
 * Projektionen, geschrieben von den Rollen, die Grundlagen schreiben, und nur
 * an einer Verordnung - beim Selbstzahler gibt es keine Diagnose (ADR-020).
 */
const { users, patients } = SEED;

const ANLEGEN = `
  select public.create_treatment_basis(
    $1::uuid, $2::uuid, $3, $4::date, $5::integer, $6::jsonb, $7, $8, $9
  ) as id`;
const SETZEN = 'select public.set_treatment_basis_icd10($1::uuid, $2)';
const HOLEN = 'select * from public.get_treatment_basis($1::uuid)';
const KLINISCH = 'select * from public.list_patient_treatment_bases_clinical($1::uuid)';
const ORGANISATORISCH = 'select * from public.list_patient_treatment_bases($1::uuid)';

const PROBST = '77777777-7777-4777-8777-000000000001';
const POSITIONEN = JSON.stringify([
  { remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 0 },
]);

async function grundlage(kind: 'first' | 'self_pay' = 'first'): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
    patients.max,
    kind === 'self_pay' ? null : PROBST,
    kind,
    '2026-03-01',
    10,
    POSITIONEN,
    null,
    null,
    null,
  ]);
  return rows[0]!.id;
}

describe('ICD-10 an der Behandlungsgrundlage', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('schreibt den Code normalisiert und liefert ihn nur klinisch', async () => {
    const id = await grundlage();
    await asUserCommitted(users.office, SETZEN, [id, ' g20.00g ']);

    const einzeln = await asUser<{ diagnosis_icd10: string | null }>(users.therapist, HOLEN, [id]);
    expect(einzeln.rows[0]?.diagnosis_icd10).toBe('G20.00G');
    const liste = await asUser<{ id: string; diagnosis_icd10: string | null }>(
      users.office,
      KLINISCH,
      [patients.max],
    );
    expect(liste.rows.find((r) => r.id === id)?.diagnosis_icd10).toBe('G20.00G');

    // Die organisatorische Projektion kennt die Spalte nicht (ANN-011).
    const org = await asUser<Record<string, unknown>>(users.office, ORGANISATORISCH, [
      patients.max,
    ]);
    expect(Object.keys(org.rows[0] ?? {})).not.toContain('diagnosis_icd10');

    const audit = await asPostgres<{ n: string }>(
      `select count(*) as n from public.audit_log
        where subject_id = $1 and action = 'treatment_basis.updated'`,
      [id],
    );
    expect(Number(audit.rows[0]?.n)).toBe(1);
  });

  it('leert den Code mit einer leeren Angabe', async () => {
    const id = await grundlage();
    await asUserCommitted(users.therapist, SETZEN, [id, 'M54.5']);
    await asUserCommitted(users.therapist, SETZEN, [id, '  ']);
    const { rows } = await asUser<{ diagnosis_icd10: string | null }>(users.therapist, HOLEN, [id]);
    expect(rows[0]?.diagnosis_icd10).toBeNull();
  });

  it('weist ein falsches Format ab', async () => {
    const id = await grundlage();
    await expect(asUser(users.therapist, SETZEN, [id, 'Rücken'])).rejects.toThrow(
      /invalid ICD-10 code/,
    );
    await expect(asUser(users.therapist, SETZEN, [id, '20.00'])).rejects.toThrow(
      /invalid ICD-10 code/,
    );
  });

  it('nimmt beim Selbstzahler keinen Code an und leert ihn beim Wechsel dorthin', async () => {
    const selbst = await grundlage('self_pay');
    await expect(asUser(users.therapist, SETZEN, [selbst, 'M54.5'])).rejects.toThrow(
      /self pay treatment bases have no diagnosis/,
    );

    const id = await grundlage();
    await asUserCommitted(users.therapist, SETZEN, [id, 'M54.5']);
    await asPostgres(
      `update public.treatment_bases set treatment_basis_kind = 'self_pay', prescriber_id = null
        where id = $1`,
      [id],
    );
    const { rows } = await asPostgres<{ diagnosis_icd10: string | null }>(
      'select diagnosis_icd10 from public.treatment_bases where id = $1',
      [id],
    );
    expect(rows[0]?.diagnosis_icd10).toBeNull();
  });

  it('lässt Trainingsbetreuung und Patientenkonto nicht schreiben und nicht lesen', async () => {
    const id = await grundlage();
    for (const konto of [users.trainer, users.patientMax]) {
      await expect(asUser(konto, SETZEN, [id, 'M54.5'])).rejects.toThrow(/not allowed/);
      await erwarteAbgewiesenenLeseversuch(konto, HOLEN, [id], 'treatment_basis.viewed');
    }
  });

  it('ist ohne Session und für anon nicht aufrufbar', async () => {
    const id = await grundlage();
    await expect(asUser(null, SETZEN, [id, 'M54.5'])).rejects.toThrow(/not authenticated/);
  });
});

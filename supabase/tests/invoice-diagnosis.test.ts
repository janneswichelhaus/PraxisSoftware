import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabaseOhneTermine } from './helpers/db';

/**
 * Die Diagnose der Verordnung auf der Rechnung (ANN-229, schema_version 4).
 *
 *   * Der Entwurf und der Snapshot nennen ICD-10 und Diagnosetext der
 *     Grundlage, an der die Leistung haengt.
 *   * Ein ausgestellter Snapshot bleibt, wie er ist (ADR-009 Punkt 10): Wer
 *     danach die Grundlage aendert, aendert die Rechnung nicht.
 *   * Therapieziel und Verordnerhinweis stehen weiterhin nicht darauf.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const GRUNDLAGE_FRISCH = '88888888-8888-4888-8888-000000000004';

const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  mt: 'cccccccc-cccc-4ccc-8ccc-000000000003',
} as const;

// ABR-032: eine Rechnung je Behandlungsgrundlage.
const ENTWURF = 'select public.create_invoice_draft_for_basis($1::uuid) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const DOKUMENT = 'select public.get_invoice($1::uuid) as rechnung';

async function behandlungstermin(stundeImMonat: number): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', 'documented',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int)) at time zone 'Europe/Berlin',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int + 1)) at time zone 'Europe/Berlin',
       $6, now(), $7
     ) returning id`,
    [
      organizationId,
      patients.erika,
      STAFF_ANNA,
      LOCATION,
      stundeImMonat,
      GRUNDLAGE_FRISCH,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

async function leistung(position: string, stundeImMonat: number): Promise<void> {
  const id = await behandlungstermin(stundeImMonat);
  await asUserCommitted(
    users.ownerTherapist,
    'select public.record_billable_services($1::uuid, $2::jsonb)',
    [id, JSON.stringify([{ catalog_item_id: position, quantity: 1 }])],
  );
}

interface Grundlage {
  kind: string;
  issued_on: string;
  prescriber: string | null;
  diagnosis_icd10: string | null;
  diagnosis: string | null;
  therapy_goal?: unknown;
  prescriber_note?: unknown;
}
interface Rechnung {
  rechnung: { document: { schema_version: number; treatment_bases: Grundlage[] } };
}

describe('Diagnose auf der Rechnung (ANN-229)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
    await asPostgres('delete from public.invoice_number_series');
    await asPostgres(
      `update public.treatment_bases
          set diagnosis_icd10 = 'M54.2', diagnosis = 'Synthetisch: Zervikalsyndrom.'
        where id = $1`,
      [GRUNDLAGE_FRISCH],
    );
  }, 120_000);

  it('nennt ICD-10 und Diagnose der Verordnung im Entwurf - ohne Therapieziel', async () => {
    await leistung(KATALOG.kg, 30);
    const { rows: entwurf } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
      GRUNDLAGE_FRISCH,
    ]);
    const { rows } = await asUser<Rechnung>(users.office, DOKUMENT, [entwurf[0]!.id]);
    const dokument = rows[0]!.rechnung.document;

    expect(dokument.schema_version).toBe(5);
    expect(dokument.treatment_bases).toHaveLength(1);
    const grundlage = dokument.treatment_bases[0]!;
    expect(grundlage.diagnosis_icd10).toBe('M54.2');
    expect(grundlage.diagnosis).toBe('Synthetisch: Zervikalsyndrom.');
    expect(grundlage.issued_on).toBe('2026-09-08');
    expect(grundlage).not.toHaveProperty('therapy_goal');
    expect(grundlage).not.toHaveProperty('prescriber_note');
  });

  it('haelt den ausgestellten Snapshot fest, auch wenn sich die Grundlage aendert', async () => {
    await leistung(KATALOG.kg, 30);
    const { rows: entwurf } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
      GRUNDLAGE_FRISCH,
    ]);
    const id = entwurf[0]!.id;
    await asUserCommitted(users.office, AUSSTELLEN, [id]);

    await asUserCommitted(
      users.ownerTherapist,
      'select public.set_treatment_basis_icd10($1::uuid, $2::text)',
      [GRUNDLAGE_FRISCH, 'M53.1'],
    );

    const { rows } = await asUser<Rechnung>(users.office, DOKUMENT, [id]);
    expect(rows[0]!.rechnung.document.treatment_bases[0]!.diagnosis_icd10).toBe('M54.2');
  });

  it('fuehrt den Schalter an genau einer Stelle, eingeschaltet', async () => {
    const { rows } = await asPostgres<{ an: boolean }>(
      'select app.invoice_shows_diagnosis() as an',
    );
    expect(rows[0]!.an).toBe(true);
    await expect(asUser(users.office, 'select app.invoice_shows_diagnosis()')).rejects.toThrow(
      /permission denied/,
    );
  });
});

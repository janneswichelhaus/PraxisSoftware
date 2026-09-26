import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

const { users, patients } = SEED;

const SETZEN = 'select public.set_treatment_table_required($1::uuid, $2::boolean)';
const KARTEI = 'select treatment_table_required from public.patient_directory where id = $1::uuid';
const AUSKUNFT = 'select public.export_patient_record($1::uuid) as daten';

async function merkmal(patientId: string): Promise<boolean | null> {
  const { rows } = await asPostgres<{ treatment_table_required: boolean }>(
    'select treatment_table_required from public.patient_care_details where patient_id = $1',
    [patientId],
  );
  return rows[0]?.treatment_table_required ?? null;
}

async function auditZeilen(patientId: string): Promise<{ context: unknown }[]> {
  const { rows } = await asPostgres<{ context: unknown }>(
    `select context from public.audit_log
      where action = 'patient.updated' and subject_id = $1::uuid
      order by occurred_at`,
    [patientId],
  );
  return rows;
}

/**
 * Behandlungsliege als Merkmal der Person (UX-003a, ANN-116).
 *
 * Das Merkmal liegt bei den internen Versorgungsangaben (ANN-010) und erbt
 * deren Rollenschnitt. Geprueft wird hier der eigene, kleine Schreibpfad -
 * seine Berechtigung steht in der Datenbank, nicht in der Oberflaeche
 * (ADR-004) - und dass er protokolliert wie update_patient (ADR-010).
 */
describe('set_treatment_table_required', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('erlaubt %s das Setzen und Zuruecknehmen', async (_rolle, userId) => {
    // Erika braucht im Seed keine Liege.
    await asUserCommitted(userId, SETZEN, [patients.erika, true]);
    expect(await merkmal(patients.erika)).toBe(true);

    await asUserCommitted(userId, SETZEN, [patients.erika, false]);
    expect(await merkmal(patients.erika)).toBe(false);
  });

  it('protokolliert patient.updated mit dem Feldnamen, nie mit dem Wert', async () => {
    await asUserCommitted(users.therapist, SETZEN, [patients.erika, true]);

    const zeilen = await auditZeilen(patients.erika);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.context).toEqual({
      surface: 'web',
      changed_fields: ['treatment_table_required'],
    });
  });

  it('schreibt ohne tatsaechliche Aenderung weder Wert noch Auditeintrag', async () => {
    // Max braucht die Liege bereits (Seed).
    await asUserCommitted(users.therapist, SETZEN, [patients.max, true]);
    expect(await auditZeilen(patients.max)).toHaveLength(0);
  });

  it('weist ein Patientenkonto ab - auch fuer die eigene Akte', async () => {
    await expect(asUser(users.patientMax, SETZEN, [patients.max, false])).rejects.toThrow(
      /not allowed to update patients/,
    );
    expect(await merkmal(patients.max)).toBe(true);
  });

  it('weist die Trainingsrolle ab (ADR-021 Punkt 6)', async () => {
    await expect(asUser(users.trainer, SETZEN, [patients.erika, true])).rejects.toThrow(
      /not allowed to update patients/,
    );
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(SETZEN, [patients.erika, true])).rejects.toThrow(/permission denied/i);
  });

  it('findet den Patienten einer fremden Praxis nicht', async () => {
    const fremd = await fremdeOrganisation();
    await expect(asUser(users.ownerTherapist, SETZEN, [fremd.patient, true])).rejects.toThrow(
      /patient not found/,
    );
  });

  it('verlangt einen Wert', async () => {
    await expect(asUser(users.therapist, SETZEN, [patients.erika, null])).rejects.toThrow(
      /patient and value are required/,
    );
  });

  it('zeigt das Merkmal in der Kartei den Praxisrollen, dem Patientenkonto nicht', async () => {
    for (const konto of [users.therapist, users.office]) {
      const { rows } = await asUser<{ treatment_table_required: boolean | null }>(konto, KARTEI, [
        patients.max,
      ]);
      expect(rows[0]!.treatment_table_required).toBe(true);
    }

    // Das Patientenkonto sieht die eigene Kartei, aber keine internen
    // Versorgungsangaben (ANN-010).
    const { rows } = await asUser<{ treatment_table_required: boolean | null }>(
      users.patientMax,
      KARTEI,
      [patients.max],
    );
    expect(rows.every((zeile) => zeile.treatment_table_required === null)).toBe(true);
  });

  it('nimmt das Merkmal in die Auskunft nach Art. 15 DSGVO auf', async () => {
    const { rows } = await asUser<{
      daten: { tabellen: Record<string, Record<string, unknown>[]> };
    }>(users.ownerTherapist, AUSKUNFT, [patients.max]);
    expect(rows[0]!.daten.tabellen['patient_care_details']![0]!['treatment_table_required']).toBe(
      true,
    );
  });
});

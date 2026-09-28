import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * „Mitnehmen" als Merkmal der Person (PRX-007, ANN-138).
 *
 * Die Liste liegt bei den internen Versorgungsangaben wie die
 * Behandlungsliege und erbt deren Rollenschnitt. Geprüft werden der eigene
 * Schreibpfad samt Normalisierung und Formregel, das Protokoll ohne Inhalt,
 * und dass Kartei, Auskunft, Tagesliste und Kurzblick die Liste tragen.
 */

const { users, patients, organizationId } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

const SETZEN = 'select public.set_take_along_items($1::uuid, $2::text[]) as liste';

async function liste(patientId: string): Promise<string[] | null> {
  const { rows } = await asPostgres<{ take_along_items: string[] }>(
    'select take_along_items from public.patient_care_details where patient_id = $1',
    [patientId],
  );
  return rows[0]?.take_along_items ?? null;
}

async function auditZeilen(patientId: string): Promise<{ context: unknown }[]> {
  const { rows } = await asPostgres<{ context: unknown }>(
    `select context from public.audit_log
      where action = 'patient.updated' and subject_id = $1::uuid order by occurred_at`,
    [patientId],
  );
  return rows;
}

describe('set_take_along_items (PRX-007)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('erlaubt %s das Setzen und Leeren', async (_rolle, userId) => {
    await asUserCommitted(userId, SETZEN, [patients.erika, ['Theraband']]);
    expect(await liste(patients.erika)).toEqual(['Theraband']);
    await asUserCommitted(userId, SETZEN, [patients.erika, []]);
    expect(await liste(patients.erika)).toEqual([]);
  });

  it('normalisiert: Rand und Leeres weg, Doppel ohne Groß/klein weg, Reihenfolge bleibt', async () => {
    const { rows } = await asUserCommitted<{ liste: string[] }>(users.therapist, SETZEN, [
      patients.max,
      ['  Kinesiotape ', '', 'Theraband', 'kinesiotape', '   ', 'Übungsplan (gedruckt)'],
    ]);
    expect(rows[0]!.liste).toEqual(['Kinesiotape', 'Theraband', 'Übungsplan (gedruckt)']);
    expect(await liste(patients.max)).toEqual([
      'Kinesiotape',
      'Theraband',
      'Übungsplan (gedruckt)',
    ]);
  });

  it('protokolliert patient.updated mit dem Feldnamen, nie mit dem Inhalt', async () => {
    await asUserCommitted(users.office, SETZEN, [patients.erika, ['Kinesiotape']]);
    const zeilen = await auditZeilen(patients.erika);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.context).toEqual({ surface: 'web', changed_fields: ['take_along_items'] });
  });

  it('schreibt ohne tatsächliche Änderung keinen Auditeintrag', async () => {
    await asUserCommitted(users.office, SETZEN, [patients.erika, ['Theraband']]);
    await asUserCommitted(users.office, SETZEN, [patients.erika, [' Theraband']]);
    expect(await auditZeilen(patients.erika)).toHaveLength(1);
  });

  it('legt die Versorgungsangaben an, wenn es noch keine gibt', async () => {
    await asPostgres('delete from public.patient_care_details where patient_id = $1', [
      patients.erika,
    ]);
    expect(await liste(patients.erika)).toBeNull();
    await asUserCommitted(users.office, SETZEN, [patients.erika, ['Theraband']]);
    expect(await liste(patients.erika)).toEqual(['Theraband']);
  });

  it('weist mehr als zehn Einträge und zu lange Einträge ab', async () => {
    const elf = Array.from({ length: 11 }, (_, i) => `Material ${i + 1}`);
    await expect(asUser(users.office, SETZEN, [patients.max, elf])).rejects.toThrow(
      /at most 10 entries/,
    );
    await expect(asUser(users.office, SETZEN, [patients.max, ['x'.repeat(61)]])).rejects.toThrow(
      /at most 10 entries/,
    );
  });

  it('hält die Form auch gegen einen Weg an der Funktion vorbei', async () => {
    await expect(
      asPostgres(
        `update public.patient_care_details set take_along_items = array[' Rand'] where patient_id = $1`,
        [patients.max],
      ),
    ).rejects.toThrow(/take_along_items_valid/);
    await expect(
      asPostgres(
        `update public.patient_care_details set take_along_items = array['Band', 'band'] where patient_id = $1`,
        [patients.max],
      ),
    ).rejects.toThrow(/take_along_items_valid/);
  });

  it('weist Patientenkonto und Trainingsbetreuung ab', async () => {
    await expect(asUser(users.patientMax, SETZEN, [patients.max, ['Band']])).rejects.toThrow(
      /not allowed/,
    );
    await expect(asUser(users.trainer, SETZEN, [patients.max, ['Band']])).rejects.toThrow(
      /not allowed/,
    );
  });

  it('findet keine Person einer fremden Organisation', async () => {
    const f = await fremdeOrganisation();
    await expect(asUser(users.office, SETZEN, [f.patient, ['Band']])).rejects.toThrow(
      /patient not found/,
    );
  });
});

describe('Mitnehmen in Kartei, Auskunft, Tagesliste und Kurzblick (PRX-007)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await asUserCommitted(users.office, SETZEN, [patients.max, ['Theraband', 'Kinesiotape']]);
  }, 120_000);

  it('steht in der Patientenkartei', async () => {
    const { rows } = await asUser<{ take_along_items: string[] }>(
      users.therapist,
      'select take_along_items from public.patient_directory where id = $1::uuid',
      [patients.max],
    );
    expect(rows[0]!.take_along_items).toEqual(['Theraband', 'Kinesiotape']);
  });

  it('gehört zur Auskunft nach Art. 15', async () => {
    const { rows } = await asUser<{
      daten: { tabellen: Record<string, Record<string, unknown>[]> };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.max,
    ]);
    expect(rows[0]!.daten.tabellen['patient_care_details']![0]!['take_along_items']).toEqual([
      'Theraband',
      'Kinesiotape',
    ]);
  });

  it('steht in der Tagesliste nur am Behandlungstermin', async () => {
    await asPostgres('delete from public.appointments');
    await asPostgres(
      `insert into public.appointments (organization_id, patient_id, staff_member_id, location_id,
         appointment_type, status, starts_at, ends_at)
       values ($1, $2, $3, $4, 'practice', 'confirmed', '2027-01-04 09:00+01', '2027-01-04 10:00+01')`,
      [organizationId, patients.max, ANNA, LOCATION],
    );
    await asPostgres(
      `insert into public.appointments (organization_id, staff_member_id, location_id,
         appointment_type, status, starts_at, ends_at, kind, title, event_group_id)
       values ($1, $2, $3, 'practice', 'confirmed', '2027-01-04 12:00+01', '2027-01-04 13:00+01',
               'internal', 'Teambesprechung', gen_random_uuid())`,
      [organizationId, ANNA, LOCATION],
    );

    const { rows } = await asUser<{ kind: string; take_along_items: string[] | null }>(
      users.therapist,
      'select kind, take_along_items from public.list_day_plan($1::date, $2::uuid)',
      ['2027-01-04', ANNA],
    );
    expect(rows).toEqual([
      { kind: 'therapy', take_along_items: ['Theraband', 'Kinesiotape'] },
      { kind: 'internal', take_along_items: null },
    ]);
  });

  it('steht im Kurzblick', async () => {
    const { rows: termin } = await asPostgres<{ id: string }>(
      `insert into public.appointments (organization_id, patient_id, staff_member_id, location_id,
         appointment_type, status, starts_at, ends_at)
       values ($1, $2, $3, $4, 'practice', 'confirmed', '2027-02-01 09:00+01', '2027-02-01 10:00+01')
       returning id`,
      [organizationId, patients.max, ANNA, LOCATION],
    );
    const { rows } = await asUser<{ take_along_items: string[] }>(
      users.office,
      'select take_along_items from public.get_appointment_brief($1::uuid)',
      [termin[0]!.id],
    );
    expect(rows[0]!.take_along_items).toEqual(['Theraband', 'Kinesiotape']);
  });
});

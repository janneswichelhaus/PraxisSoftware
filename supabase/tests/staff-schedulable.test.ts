import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
  tagInTagen,
} from './helpers/db';
import { erwarteAbgewiesenenSchreibversuch } from './helpers/abgewiesen';

/**
 * Im Kalender, ohne eigenen Zugang (AKTE-009, ANN-226).
 *
 * Nina Neu aus dem Seed hat einen Mitarbeiterdatensatz, aber keinen Zugang -
 * genau die Lage einer neu angelegten Therapeutin. Bis AKTE-009 stand sie
 * deshalb nicht im Kalender. Jetzt nimmt owner sie selbst auf.
 */
const { users, patients } = SEED;

const NINA = '55555555-5555-4555-8555-000000000005';
const ANNA = '55555555-5555-4555-8555-000000000002';

const SETZEN = 'select public.set_staff_member_schedulable($1::uuid, $2::boolean, $3::boolean)';
const BEHANDELNDE = 'select staff_member_id from public.list_assignable_therapists()';
const TRAINIERENDE = 'select staff_member_id from public.list_assignable_trainers()';
const TERMIN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';

async function liste(sql: string, konto: string = users.office): Promise<string[]> {
  const { rows } = await asUser<{ staff_member_id: string }>(konto, sql);
  return rows.map((r) => r.staff_member_id);
}

async function setzen(
  behandlung: boolean,
  training: boolean,
  konto: string = users.ownerTherapist,
) {
  await asUserCommitted(konto, SETZEN, [NINA, behandlung, training]);
}

/** Erfolgreiche Auditeintraege zu Nina - die Merkmale schreiben keine mehr (LOG-EPIC-001). */
async function protokoll(): Promise<{ action: string }[]> {
  const { rows } = await asPostgres<{ action: string }>(
    `select action from public.audit_log
      where subject_id = $1 and outcome = 'success'
      order by occurred_at`,
    [NINA],
  );
  return rows;
}

describe('set_staff_member_schedulable (AKTE-009)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('steht ohne Zugang zunaechst nicht im Kalender - wie bisher', async () => {
    expect(await liste(BEHANDELNDE)).not.toContain(NINA);
    expect(await liste(TRAINIERENDE)).not.toContain(NINA);
  });

  it('nimmt eine Person ohne Zugang in den Kalender fuer Behandlungen - und nur dorthin', async () => {
    await setzen(true, false);
    expect(await liste(BEHANDELNDE)).toContain(NINA);
    expect(await liste(TRAINIERENDE)).not.toContain(NINA);

    // Es entsteht kein Zugang und keine Rolle.
    const { rows } = await asPostgres<{ anzahl: string }>(
      `select count(*) as anzahl from public.user_profiles up
         join public.staff_members sm on sm.person_id = up.person_id
        where sm.id = $1`,
      [NINA],
    );
    expect(rows[0]?.anzahl).toBe('0');
  });

  it('erlaubt danach einen Termin mit ihr', async () => {
    await setzen(true, false);
    const { rows } = await asUserCommitted<{ id: string }>(users.office, TERMIN, [
      patients.max,
      NINA,
      'video',
      tagInTagen(30),
      '09:00',
      '10:00',
      null,
    ]);
    expect(rows[0]?.id).toBeTruthy();
  });

  it('nimmt eine Person ohne Zugang in den Kalender fuer Training', async () => {
    await setzen(false, true);
    expect(await liste(TRAINIERENDE, users.trainer)).toContain(NINA);
    expect(await liste(BEHANDELNDE)).not.toContain(NINA);
  });

  it('nimmt sie wieder heraus', async () => {
    await setzen(true, true);
    await setzen(false, false);
    expect(await liste(BEHANDELNDE)).not.toContain(NINA);
    expect(await liste(TRAINIERENDE)).not.toContain(NINA);
  });

  it('haelt eine nicht mehr aktive Person draussen, auch mit Merkmal', async () => {
    await setzen(true, true);
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [NINA],
    );
    expect(await liste(BEHANDELNDE)).not.toContain(NINA);
    expect(await liste(TRAINIERENDE)).not.toContain(NINA);
  });

  it('laesst den bisherigen Weg ueber den Zugang unveraendert', async () => {
    // Anna hat einen Zugang als Therapeutin und kein Merkmal.
    const { rows } = await asPostgres<{ schedulable_treatment: boolean }>(
      'select schedulable_treatment from public.staff_members where id = $1',
      [ANNA],
    );
    expect(rows[0]?.schedulable_treatment).toBe(false);
    expect(await liste(BEHANDELNDE)).toContain(ANNA);
  });

  it('setzt die Merkmale und schreibt keinen Auditeintrag (LOG-EPIC-001)', async () => {
    await setzen(true, false);
    await setzen(true, false);
    await setzen(true, true);
    const { rows } = await asPostgres<{
      schedulable_treatment: boolean;
      schedulable_training: boolean;
    }>(
      'select schedulable_treatment, schedulable_training from public.staff_members where id = $1',
      [NINA],
    );
    expect(rows[0]).toEqual({ schedulable_treatment: true, schedulable_training: true });
    expect(await protokoll()).toEqual([]);
  });

  it('zeigt die Merkmale in der Mitarbeiterliste', async () => {
    await setzen(true, false);
    const { rows } = await asUser<{
      schedulable_treatment: boolean;
      schedulable_training: boolean;
    }>(
      users.office,
      'select schedulable_treatment, schedulable_training from public.staff_directory where id = $1',
      [NINA],
    );
    expect(rows[0]).toEqual({ schedulable_treatment: true, schedulable_training: false });
  });

  it.each([
    ['office', users.office],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['trainer', users.trainer],
    ['Patientenkonto', users.patientMax],
  ])('weist %s bestaetigt ab und aendert nichts (G6c)', async (_rolle, konto) => {
    await erwarteAbgewiesenenSchreibversuch(
      konto,
      SETZEN,
      [NINA, true, true],
      'staff_member.updated',
    );
    expect(await liste(BEHANDELNDE)).not.toContain(NINA);
    expect(await protokoll()).toEqual([]);
  });

  it('ist ohne Sitzung nicht aufrufbar', async () => {
    await expect(asUser(null, SETZEN, [NINA, true, true])).rejects.toThrow(/not authenticated/);
  });

  it('endet an der eigenen Praxis', async () => {
    const fremd = await fremdeOrganisation();
    await expect(asUser(fremd.owner, SETZEN, [NINA, true, true])).rejects.toThrow(
      /staff member not found/,
    );
    await expect(
      asUser(users.ownerTherapist, SETZEN, [fremd.staffMember, true, true]),
    ).rejects.toThrow(/staff member not found/);
    const { rows } = await asPostgres<{ schedulable_treatment: boolean }>(
      'select schedulable_treatment from public.staff_members where id = $1',
      [NINA],
    );
    expect(rows[0]?.schedulable_treatment).toBe(false);
  });
});

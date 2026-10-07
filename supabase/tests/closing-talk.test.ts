import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Erinnerung an das Abschlussgespräch (KND-001, PROJECT_PRINCIPLES.md 4.10,
 * ANN-286).
 *
 *   * An den letzten zwei Terminen einer Grundlage mit Terminzahl, solange
 *     die Versorgung offen ist und keine jüngere Grundlage besteht.
 *   * Ein Trainingsangebot seit Beginn der Grundlage beendet die Erinnerung;
 *     ein zurückgezogenes nicht.
 *   * Die Erinnerung fragt nur die Akte, nie das Training (4.8).
 */

const { users, patients } = SEED;

/** Max: Folgeverordnung mit zehn Terminen, sieben verplant (supabase/seed.sql). */
const FOLGE = '88888888-8888-4888-8888-000000000002';
/** Max: die erste Verordnung - es gibt eine jüngere. */
const ERSTE = '88888888-8888-4888-8888-000000000001';
const TERMIN_6 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000116';
const TERMIN_7 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000117';
const TP3 = 'cccccccc-cccc-4ccc-8ccc-000000000014';

const LAGE = 'select closing_talk_due from public.get_appointment_billing_context($1::uuid)';

async function faellig(termin: string, konto: string = users.therapist): Promise<boolean | null> {
  const { rows } = await asUser<{ closing_talk_due: boolean | null }>(konto, LAGE, [termin]);
  return rows[0]?.closing_talk_due ?? null;
}

async function anbieten(): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(
    users.therapist,
    `select public.create_training_offer($1::uuid, $2::uuid,
            (now() at time zone 'Europe/Berlin')::date + 30, '[]'::jsonb, false) as id`,
    [patients.max, TP3],
  );
  return rows[0]!.id;
}

describe('Erinnerung an das Abschlussgespräch (KND-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.training_offers');
    // Sieben verplante Termine, Terminzahl acht: Termin 7 ist der vorletzte.
    await asPostgres('update public.treatment_bases set appointment_count = 8 where id = $1', [
      FOLGE,
    ]);
    await asPostgres(
      `update public.patients set care_concluded_on = null, care_concluded_at = null,
              care_concluded_by = null where id = $1`,
      [patients.max],
    );
  });

  it('erinnert an den letzten zwei Terminen (ANN-286)', async () => {
    expect(await faellig(TERMIN_7)).toBe(true);
    expect(await faellig(TERMIN_6)).toBe(false);
    await asPostgres('update public.treatment_bases set appointment_count = 7 where id = $1', [
      FOLGE,
    ]);
    expect(await faellig(TERMIN_6)).toBe(true);
  });

  it('erinnert alle Rollen, die den Termin lesen', async () => {
    expect(await faellig(TERMIN_7, users.office)).toBe(true);
    expect(await faellig(TERMIN_7, users.ownerTherapist)).toBe(true);
  });

  it('erinnert nicht mehr, sobald ein Angebot in der Akte steht', async () => {
    const id = await anbieten();
    expect(await faellig(TERMIN_7)).toBe(false);
    await asUserCommitted(users.therapist, 'select public.withdraw_training_offer($1::uuid)', [id]);
    expect(await faellig(TERMIN_7)).toBe(true);
  });

  it('zählt ein Angebot vor dem Beginn der Grundlage nicht', async () => {
    await anbieten();
    await asPostgres(
      `update public.training_offers
          set created_at = (select created_at - interval '1 day' from public.treatment_bases where id = $1)`,
      [FOLGE],
    );
    expect(await faellig(TERMIN_7)).toBe(true);
  });

  it('erinnert nicht nach dem Abschluss der Versorgung', async () => {
    await asPostgres(
      `update public.patients set care_concluded_on = current_date, care_concluded_at = now(),
              care_concluded_by = $2 where id = $1`,
      [patients.max, users.ownerTherapist],
    );
    expect(await faellig(TERMIN_7)).toBe(false);
  });

  it('erinnert nicht, wenn eine jüngere Grundlage folgt', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `select a.id from public.appointments a
        where a.treatment_basis_id = $1 and app.appointment_basis_position(a.id) = 10`,
      [ERSTE],
    );
    expect(await faellig(rows[0]!.id)).toBe(false);
  });

  it('erinnert nicht an einem abgesagten Termin', async () => {
    const { rows: vorher } = await asPostgres<{ completed_at: Date; completed_by: string }>(
      'select completed_at, completed_by from public.appointments where id = $1',
      [TERMIN_7],
    );
    await asPostgres(
      `update public.appointments
          set status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
              completed_at = null, completed_by = null
        where id = $1`,
      [TERMIN_7, users.therapist],
    );
    const { rows } = await asPostgres<{ due: boolean }>(
      'select app.closing_talk_due($1::uuid) as due',
      [TERMIN_7],
    );
    expect(rows[0]!.due).toBe(false);
    await asPostgres(
      `update public.appointments
          set status = 'completed', cancelled_at = null, cancelled_by = null,
              completed_at = $2, completed_by = $3
        where id = $1`,
      [TERMIN_7, vorher[0]!.completed_at, vorher[0]!.completed_by],
    );
  });

  it('fragt nie das Training (4.8)', async () => {
    const { rows } = await asPostgres<{ def: string }>(
      `select pg_get_functiondef('app.closing_talk_due(uuid)'::regprocedure) as def`,
    );
    expect(rows[0]!.def).not.toMatch(/training_(relationships|contracts|packages|consent)/);
  });

  it('ist für Browser nicht direkt aufrufbar', async () => {
    await expect(
      asUser(users.therapist, 'select app.closing_talk_due($1::uuid)', [TERMIN_7]),
    ).rejects.toThrow(/permission denied/);
  });
});

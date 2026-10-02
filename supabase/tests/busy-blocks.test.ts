import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, fremdeOrganisation, resetDatabase } from './helpers/db';

/**
 * Anonyme Belegt-Bloecke fuer die Trainingsbetreuung (ABN-021, BEF-112,
 * ANN-180 Fassung 2).
 *
 * Die wichtigste Zusage zuerst: Aus einem Block kommt nichts heraus als
 * Person, Beginn und Ende - kein Kontext, kein Name, keine Adresse, kein
 * Zustand, nicht einmal die Zahl der Termine.
 */

const { users, organizationId } = SEED;
const TOM = '55555555-5555-4555-8555-000000000006';
const ANNA = '55555555-5555-4555-8555-000000000002';
const PRAXIS = '33333333-3333-4333-8333-000000000001';
const BLOECKE = 'select * from public.list_busy_blocks($1::date, $2::date, $3::uuid)';

/** Ein interner Termin (Fehlzeit, Besprechung) - die Trainingsbetreuung liest ihn nicht. */
async function intern(staff: string, von: string, bis: string, abgesagt = false) {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments
       (organization_id, staff_member_id, location_id, appointment_type, status, kind, title,
        starts_at, ends_at, event_group_id)
     values ($1, $2, $3, 'practice', 'confirmed', 'internal', 'Synthetische Besprechung mit Namen',
             $4::timestamptz, $5::timestamptz, extensions.gen_random_uuid())
     returning id`,
    [organizationId, staff, PRAXIS, von, bis],
  );
  if (abgesagt) {
    await asPostgres(
      `update public.appointments
          set status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
              cancellation_reason = 'other'
        where id = $1`,
      [rows[0]!.id, users.office],
    );
  }
}

const TAG = '2027-03-10';
const BIS = '2027-03-11';

describe('list_busy_blocks', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('liefert genau drei Spalten', async () => {
    const { rows } = await asPostgres<{ name: string }>(
      `select unnest(proargnames) as name from pg_proc
        where proname = 'list_busy_blocks' and pronamespace = 'public'::regnamespace`,
    );
    expect(rows.map((r) => r.name).slice(-3)).toEqual(['staff_member_id', 'starts_at', 'ends_at']);
  });

  it('zeigt der Trainingsbetreuung belegte Zeiten verschmolzen, ohne jeden Kontext', async () => {
    // Ueberschneiden kann sich nichts (appointments_no_overlap); angrenzende
    // Zeiten verschmelzen, damit die Zahl der Termine nicht herauskommt.
    await intern(TOM, `${TAG} 08:00+01`, `${TAG} 09:00+01`);
    await intern(TOM, `${TAG} 09:00+01`, `${TAG} 09:30+01`);
    await intern(TOM, `${TAG} 09:30+01`, `${TAG} 10:00+01`);
    await intern(TOM, `${TAG} 14:00+01`, `${TAG} 15:00+01`, true);

    const { rows } = await asUser<Record<string, unknown>>(users.trainer, BLOECKE, [
      TAG,
      BIS,
      null,
    ]);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(['ends_at', 'staff_member_id', 'starts_at']);
    expect(rows[0]!['staff_member_id']).toBe(TOM);
    expect(new Date(rows[0]!['starts_at'] as string).toISOString()).toBe(
      '2027-03-10T07:00:00.000Z',
    );
    expect(new Date(rows[0]!['ends_at'] as string).toISOString()).toBe('2027-03-10T09:00:00.000Z');
    expect(JSON.stringify(rows)).not.toContain('Besprechung');
  });

  it('liefert nur Mitarbeitende, die die Trainingsbetreuung buchen kann', async () => {
    await intern(ANNA, `${TAG} 08:00+01`, `${TAG} 09:00+01`);
    const { rows } = await asUser(users.trainer, BLOECKE, [TAG, BIS, null]);
    expect(rows).toEqual([]);
  });

  it('gibt Praxisrollen nichts - sie sehen die Termine selbst', async () => {
    await intern(TOM, `${TAG} 08:00+01`, `${TAG} 09:00+01`);
    for (const nutzer of [users.ownerTherapist, users.office, users.therapist, users.teamLead]) {
      expect((await asUser(nutzer, BLOECKE, [TAG, BIS, null])).rows, nutzer).toEqual([]);
    }
  });

  it('weist Patientenkonto, fremde Praxis und ein zu grosses Fenster ab', async () => {
    await intern(TOM, `${TAG} 08:00+01`, `${TAG} 09:00+01`);
    await expect(asUser(users.patientMax, BLOECKE, [TAG, BIS, null])).rejects.toMatchObject({
      code: '42501',
    });
    const f = await fremdeOrganisation();
    await expect(asUser(f.owner, BLOECKE, [TAG, BIS, null])).resolves.toMatchObject({ rows: [] });
    await expect(asUser(users.trainer, BLOECKE, [TAG, '2027-04-20', null])).rejects.toMatchObject({
      code: '22023',
    });
  });
});

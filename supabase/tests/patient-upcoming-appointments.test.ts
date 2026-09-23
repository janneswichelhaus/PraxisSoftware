import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, resetDatabaseOhneTermine } from './helpers/db';

const { users, organizationId, patients } = SEED;

const LESEN = 'select * from public.list_patient_upcoming_appointments($1::uuid, $2::integer)';

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

interface Zeile {
  id: string;
  starts_at: Date;
  appointment_type: string;
  status: string;
  staff_family_name: string;
  organization_time_zone: string;
}

function lesen(userId: string | null, patientId = patients.max, limit: number | null = null) {
  return asUser<Zeile>(userId, LESEN, [patientId, limit]);
}

/**
 * Legt einen Termin relativ zu jetzt an - in Stunden, damit "kuenftig" nicht
 * von einem festen Datum abhaengt, das irgendwann Vergangenheit ist.
 */
async function termin(opts: {
  inStunden: number;
  dauerMinuten?: number;
  patient?: string;
  status?: 'confirmed' | 'completed' | 'cancelled';
  typ?: 'home_visit' | 'practice';
}): Promise<string> {
  const typ = opts.typ ?? 'practice';
  const status = opts.status ?? 'confirmed';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at,
       visit_street, visit_house_number, visit_postal_code, visit_city,
       completed_at, completed_by, cancelled_at, cancelled_by
     ) values (
       $1, $2, $3, $4, $5, $6,
       now() + make_interval(mins => $7::int),
       now() + make_interval(mins => $7::int + $8::int),
       $9, $10, $11, $12,
       case when $6 = 'completed' then now() end,
       case when $6 = 'completed' then $13::uuid end,
       case when $6 = 'cancelled' then now() end,
       case when $6 = 'cancelled' then $13::uuid end
     ) returning id`,
    [
      organizationId,
      opts.patient ?? patients.max,
      STAFF_ANNA,
      typ === 'practice' ? LOCATION : null,
      typ,
      status,
      Math.round(opts.inStunden * 60),
      opts.dauerMinuten ?? 60,
      typ === 'home_visit' ? 'Beispielstrasse' : null,
      typ === 'home_visit' ? '12' : null,
      typ === 'home_visit' ? '72070' : null,
      typ === 'home_visit' ? 'Tuebingen' : null,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

/**
 * Der Blick nach vorn in der Akte (UX-006). Er ist eine organisatorische
 * Auskunft und darf deshalb weder klinische Inhalte noch die Anschrift
 * mitliefern - und er darf keinen Termin einer anderen Person zeigen.
 */
describe('list_patient_upcoming_appointments', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(LESEN, [patients.max, null])).rejects.toThrow(/permission denied/);
  });

  it('weist ein Patientenkonto ab', async () => {
    expect((await lesen(users.patientMax)).rows).toEqual([]);
  });

  it('verlangt eine Patientin', async () => {
    await expect(asUser(users.therapist, LESEN, [null, null])).rejects.toThrow(
      /patient is required/,
    );
  });

  it('liefert kuenftige Termine in aufsteigender Reihenfolge', async () => {
    const spaet = await termin({ inStunden: 72 });
    const frueh = await termin({ inStunden: 24 });

    const { rows } = await lesen(users.therapist);
    expect(rows.map((zeile) => zeile.id)).toEqual([frueh, spaet]);
  });

  it('laesst vergangene und laufende Termine weg', async () => {
    await termin({ inStunden: -48 });
    // Begonnen, aber noch nicht beendet: gehoert in die Tagesliste.
    await termin({ inStunden: -0.5 });
    const kuenftig = await termin({ inStunden: 24 });

    const { rows } = await lesen(users.therapist);
    expect(rows.map((zeile) => zeile.id)).toEqual([kuenftig]);
  });

  it('laesst abgesagte Termine weg - ein abgesagter ist kein bevorstehender', async () => {
    await termin({ inStunden: 24, status: 'cancelled' });
    const { rows } = await lesen(users.therapist);
    expect(rows).toEqual([]);
  });

  it('zeigt einen kuenftigen Termin einer anderen Patientin nicht', async () => {
    await termin({ inStunden: 24, patient: patients.erika });
    const { rows } = await lesen(users.therapist, patients.max);
    expect(rows).toEqual([]);
  });

  it('begrenzt die Anzahl hart', async () => {
    for (let i = 1; i <= 25; i += 1) await termin({ inStunden: i * 2 });

    expect((await lesen(users.therapist, patients.max, 1000)).rows.length).toBe(20);
    expect((await lesen(users.therapist, patients.max, 3)).rows.length).toBe(3);
    // Ohne Angabe fuenf - so viele zeigt die Akte.
    expect((await lesen(users.therapist)).rows.length).toBe(5);
  });

  it('liefert keine Anschrift - die Akte braucht sie nicht', async () => {
    await termin({ inStunden: 24, typ: 'home_visit' });
    const { rows } = await lesen(users.therapist);
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'appointment_type',
      'ends_at',
      'id',
      // Die Mitteilungswege kamen mit CAL-012 dazu: nur die Wege, nicht wer
      // wann vermerkt hat.
      'notification_channels',
      'organization_time_zone',
      'staff_family_name',
      'staff_given_name',
      'starts_at',
      'status',
    ]);
  });

  it('laesst office lesen - Terminorganisation ist ihre Aufgabe', async () => {
    await termin({ inStunden: 24 });
    expect((await lesen(users.office)).rows.length).toBe(1);
  });
});

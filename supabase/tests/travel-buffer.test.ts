import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';

/**
 * MAP-006c: Fahrpuffer nach PROJECT_PRINCIPLES.md §8.1 (ANN-097).
 *
 * Die Rundungsregel ist der Kern: Ende plus Fahrzeit, aufgerundet auf den
 * ersten Rasterpunkt, nie abgerundet. Der Testfall aus §8.1 steht wörtlich.
 */

const { users, organizationId, patients } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';
const JANNES = '55555555-5555-4555-8555-000000000001';
const TAG = '2026-09-10';

const RUNDUNG =
  "select app.earliest_follow_up_start(($1::date + $2::time) at time zone 'Europe/Berlin', $3, $4, 'Europe/Berlin') at time zone 'Europe/Berlin' as t";
const PRUEFEN = 'select * from public.check_travel_buffers($1::jsonb)';

async function rundung(ende: string, sekunden: number, raster = 5): Promise<string> {
  const { rows } = await asPostgres<{ t: Date }>(RUNDUNG, [TAG, ende, sekunden, raster]);
  const t = rows[0]!.t;
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
}

async function termin(von: string, bis: string, staff = ANNA): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at,
       visit_street, visit_house_number, visit_postal_code, visit_city
     ) values ($1, $2, $3, 'home_visit', 'confirmed',
       (($4::date + $5::time) at time zone 'Europe/Berlin'),
       (($4::date + $6::time) at time zone 'Europe/Berlin'),
       'Beispielstrasse', '12', '72070', 'Tuebingen') returning id`,
    [organizationId, patients.max, staff, TAG, von, bis],
  );
  return rows[0]!.id;
}

describe('app.earliest_follow_up_start (§8.1)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('rechnet den Testfall aus §8.1: 09:05-10:05 plus 12 Minuten ergibt 10:20', async () => {
    expect(await rundung('10:05', 12 * 60)).toBe('10:20:00');
  });

  it('rundet nie ab - auch nicht um eine Sekunde', async () => {
    expect(await rundung('10:05', 15 * 60 + 1)).toBe('10:25:00');
  });

  it('bleibt auf einem Rasterpunkt, wenn die Ankunft genau darauf faellt', async () => {
    expect(await rundung('10:05', 15 * 60)).toBe('10:20:00');
    expect(await rundung('10:00', 0)).toBe('10:00:00');
  });

  it('folgt dem Raster der Praxis', async () => {
    expect(await rundung('10:05', 12 * 60, 15)).toBe('10:30:00');
    expect(await rundung('10:05', 12 * 60, 10)).toBe('10:20:00');
  });

  it('weist eine negative Fahrzeit ab', async () => {
    await expect(rundung('10:05', -1)).rejects.toMatchObject({ code: '22023' });
  });
});

describe('check_travel_buffers', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('meldet die Unterschreitung in Minuten und den fruehesten Beginn', async () => {
    const a = await termin('09:05', '10:05');
    const b = await termin('10:15', '11:00');
    const c = await termin('11:30', '12:00');
    const { rows } = await asUser<{
      from_appointment_id: string;
      earliest_start: Date;
      shortfall_minutes: number;
    }>(users.therapist, PRUEFEN, [
      JSON.stringify([
        { from: a, to: b, travel_seconds: 720 },
        { from: b, to: c, travel_seconds: 600 },
      ]),
    ]);

    const nach = new Map(rows.map((z) => [z.from_appointment_id, z]));
    expect(nach.get(a)!.shortfall_minutes).toBe(5);
    expect(nach.get(a)!.earliest_start.toISOString()).toBe('2026-09-10T08:20:00.000Z');
    expect(nach.get(b)!.shortfall_minutes).toBe(0);
  });

  it('laesst Paare verschiedener Personen und fremde Kennungen still heraus', async () => {
    const a = await termin('09:00', '10:00');
    const b = await termin('10:30', '11:00', JANNES);
    const { rows } = await asUser(users.therapist, PRUEFEN, [
      JSON.stringify([
        { from: a, to: b, travel_seconds: 60 },
        { from: a, to: '66666666-6666-4666-8666-0000000000ff', travel_seconds: 60 },
      ]),
    ]);
    expect(rows).toEqual([]);
  });

  it.each([
    ['keine Liste', { from: 'x' }],
    ['eine negative Fahrzeit', [{ from: organizationId, to: organizationId, travel_seconds: -1 }]],
    ['eine Kommazahl', [{ from: organizationId, to: organizationId, travel_seconds: 1.5 }]],
    ['mehr als einen Tag', [{ from: organizationId, to: organizationId, travel_seconds: 86401 }]],
    ['eine Kennung, die keine ist', [{ from: 'abc', to: organizationId, travel_seconds: 1 }]],
    ['ein Paar ohne Fahrzeit', [{ from: organizationId, to: organizationId }]],
    ['ein Paar ohne Ziel', [{ from: organizationId, travel_seconds: 1 }]],
    ['eine Fahrzeit als Text', [{ from: organizationId, to: organizationId, travel_seconds: 'x' }]],
    ['36 Bindestriche', [{ from: '-'.repeat(36), to: organizationId, travel_seconds: 1 }]],
    [
      'mehr als 25 Paare',
      Array.from({ length: 26 }, () => ({
        from: organizationId,
        to: organizationId,
        travel_seconds: 1,
      })),
    ],
  ])('weist %s ab', async (_, eingabe) => {
    await expect(asUser(users.therapist, PRUEFEN, [JSON.stringify(eingabe)])).rejects.toMatchObject(
      { code: '22023' },
    );
  });

  it('prueft keine Termine einer fremden Praxis - auch nicht echte', async () => {
    const fremd = await fremdeOrganisation();
    const { rows: fremde } = await asPostgres<{ id: string }>(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at
       ) values
         ($1, $2, $3, 'video', 'confirmed',
          (($4::date + time '09:00') at time zone 'Europe/Berlin'),
          (($4::date + time '10:00') at time zone 'Europe/Berlin')),
         ($1, $2, $3, 'video', 'confirmed',
          (($4::date + time '10:05') at time zone 'Europe/Berlin'),
          (($4::date + time '11:00') at time zone 'Europe/Berlin'))
       returning id`,
      [fremd.organizationId, fremd.patient, fremd.staffMember, TAG],
    );
    const { rows } = await asUser(users.therapist, PRUEFEN, [
      JSON.stringify([{ from: fremde[0]!.id, to: fremde[1]!.id, travel_seconds: 600 }]),
    ]);
    expect(rows).toEqual([]);
  });

  it('schreibt nichts - keine Fahrzeit in einer Tabelle, kein Auditeintrag', async () => {
    const a = await termin('09:00', '10:00');
    const b = await termin('10:30', '11:00');
    const vorher = await asPostgres<{ n: string }>('select count(*) as n from public.audit_log');
    await asUser(users.therapist, PRUEFEN, [
      JSON.stringify([{ from: a, to: b, travel_seconds: 600 }]),
    ]);
    const nachher = await asPostgres<{ n: string }>('select count(*) as n from public.audit_log');
    expect(nachher.rows[0]!.n).toBe(vorher.rows[0]!.n);
  });

  it('weist ohne Anmeldung ab', async () => {
    await expect(asUser(null, PRUEFEN, ['[]'])).rejects.toMatchObject({ code: '42501' });
  });
});

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, resetDatabaseOhneTermine } from './helpers/db';

/**
 * MAP-006b: Stopps der Tagesroute (list_day_route).
 *
 * Geprüft wird die Zweckbindung: Punkte und Zeiten, kein Name, keine Adresse;
 * nur Termine mit Ort; abgesagte fallen weg; Rechte wie die Tagesliste.
 */

const { users, organizationId, patients } = SEED;

const LESEN = 'select * from public.list_day_route($1::date, $2::uuid)';
const ANNA = '55555555-5555-4555-8555-000000000002';
const JANNES = '55555555-5555-4555-8555-000000000001';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const TAG = '2026-09-10';

interface Zeile {
  id: string;
  kind: string;
  appointment_type: string;
  status: string;
  lat: number | null;
  lon: number | null;
  geocode_precision: string | null;
  position_source: string;
}

async function termin(opts: {
  von: string;
  bis: string;
  typ?: 'home_visit' | 'practice' | 'video';
  status?: 'confirmed' | 'cancelled';
  staff?: string;
  patient?: string;
  hausnummer?: string;
}): Promise<string> {
  const typ = opts.typ ?? 'home_visit';
  const status = opts.status ?? 'confirmed';
  const hausbesuch = typ === 'home_visit';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at,
       visit_street, visit_house_number, visit_postal_code, visit_city,
       cancelled_at, cancelled_by
     ) values (
       $1, $2, $3, $4, $5, $6,
       (($7::date + $8::time) at time zone 'Europe/Berlin'),
       (($7::date + $9::time) at time zone 'Europe/Berlin'),
       $10, $11, $12, $13,
       case when $6 = 'cancelled' then now() end,
       case when $6 = 'cancelled' then $14::uuid end
     ) returning id`,
    [
      organizationId,
      opts.patient ?? patients.max,
      opts.staff ?? ANNA,
      typ === 'practice' ? LOCATION : null,
      typ,
      status,
      TAG,
      opts.von,
      opts.bis,
      hausbesuch ? 'Beispielstrasse' : null,
      hausbesuch ? (opts.hausnummer ?? '12') : null,
      hausbesuch ? '72070' : null,
      hausbesuch ? 'Tuebingen' : null,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

describe('list_day_route', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('liefert Punkte und Zeiten - keinen Namen und keine Adresse', async () => {
    await termin({ von: '09:00', bis: '10:00' });
    const { rows } = await asUser<Record<string, unknown>>(users.therapist, LESEN, [TAG, ANNA]);

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(
      [
        'appointment_type',
        'ends_at',
        'geocode_precision',
        'id',
        'kind',
        'lat',
        'lon',
        'position_source',
        'starts_at',
        'status',
      ].sort(),
    );
    expect(rows[0]).toMatchObject({ lat: 48.5305, lon: 9.049, position_source: 'visit' });
    expect(JSON.stringify(rows)).not.toMatch(/Mustermann|Max|Beispielstrasse|72070/);
  });

  it('nimmt Praxistermine mit der Koordinate des Standorts, laesst Video und Absagen weg', async () => {
    await termin({ von: '08:00', bis: '09:00', typ: 'practice' });
    await termin({ von: '09:00', bis: '10:00', typ: 'video' });
    await termin({ von: '10:00', bis: '11:00', status: 'cancelled' });
    await termin({ von: '11:00', bis: '12:00' });

    const { rows } = await asUser<Zeile>(users.therapist, LESEN, [TAG, ANNA]);
    expect(rows.map((z) => [z.appointment_type, z.status, z.position_source])).toEqual([
      ['practice', 'confirmed', 'location'],
      ['home_visit', 'confirmed', 'visit'],
    ]);
    expect(rows[0]).toMatchObject({ lat: 48.5216, lon: 9.0576 });
  });

  it('liefert einen Hausbesuch ohne Koordinate mit leerer Position statt ihn wegzulassen', async () => {
    await termin({ von: '09:00', bis: '10:00', hausnummer: '99' });
    const { rows } = await asUser<Zeile>(users.therapist, LESEN, [TAG, ANNA]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lat: null, lon: null, geocode_precision: null });
  });

  it('zeigt nur die gewaehlte Person', async () => {
    await termin({ von: '09:00', bis: '10:00' });
    await termin({ von: '09:00', bis: '10:00', staff: JANNES });
    const { rows } = await asUser<Zeile>(users.office, LESEN, [TAG, JANNES]);
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['owner', users.ownerTherapist],
    ['office', users.office],
    ['team_lead', users.teamLead],
  ])('ist fuer %s lesbar', async (_, konto) => {
    await termin({ von: '09:00', bis: '10:00' });
    const { rows } = await asUser<Zeile>(konto, LESEN, [TAG, ANNA]);
    expect(rows).toHaveLength(1);
  });

  it('weist ohne Anmeldung ab', async () => {
    await expect(asUser(null, LESEN, [TAG, ANNA])).rejects.toMatchObject({ code: '42501' });
  });

  it('verlangt Tag und Person', async () => {
    await expect(asUser(users.therapist, LESEN, [null, ANNA])).rejects.toMatchObject({
      code: '22023',
    });
  });
});

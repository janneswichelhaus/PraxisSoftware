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
 * UBK-015: Garage (Abstellort der Räder) je Standort (ANN-240).
 *
 * Eigene Spalten neben dem Startort - der Startort bleibt die Koordinate der
 * Praxistermine. Setzen und entfernen darf nur owner, ohne Auditeintrag; die
 * Koordinate verfällt mit der Adresse.
 */

const { users } = SEED;
const LOCATION = '33333333-3333-4333-8333-000000000001';
const SETZEN = 'select public.set_location_garage($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)';
const ENTFERNEN = 'select public.clear_location_garage($1::uuid)';
const GARAGE = ['Radweg', '7', '72072', 'Tuebingen'] as const;

interface Garage {
  garage_street: string | null;
  garage_house_number: string | null;
  garage_lat: number | null;
  garage_geocode_precision: string | null;
  lat: number | null;
}

async function garage(): Promise<Garage> {
  const { rows } = await asPostgres<Garage>(
    `select garage_street, garage_house_number, garage_lat, garage_geocode_precision, lat
       from public.locations where id = $1`,
    [LOCATION],
  );
  return rows[0]!;
}

describe('Garage am Standort', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 60_000);

  it('setzt owner Adresse und Koordinate - der Startort bleibt, wie er ist', async () => {
    const vorher = await garage();
    await asUserCommitted(users.ownerTherapist, SETZEN, [
      LOCATION,
      ...GARAGE,
      48.53,
      9.07,
      'address',
      false,
    ]);
    const nachher = await garage();
    expect(nachher).toMatchObject({
      garage_street: 'Radweg',
      garage_house_number: '7',
      garage_lat: 48.53,
      garage_geocode_precision: 'address',
    });
    expect(nachher.lat).toBe(vorher.lat);

    const audit = await asPostgres('select 1 from public.audit_log where actor_user_id = $1', [
      users.ownerTherapist,
    ]);
    expect(audit.rows).toEqual([]);
  });

  it('entfernt die Garage wieder', async () => {
    await asUserCommitted(users.ownerTherapist, SETZEN, [
      LOCATION,
      ...GARAGE,
      48.53,
      9.07,
      'address',
      false,
    ]);
    await asUserCommitted(users.ownerTherapist, ENTFERNEN, [LOCATION]);
    expect(await garage()).toMatchObject({ garage_street: null, garage_lat: null });
  });

  it('verwirft die Koordinate, sobald sich die Adresse aendert - gleich ueber welchen Weg', async () => {
    await asUserCommitted(users.ownerTherapist, SETZEN, [
      LOCATION,
      ...GARAGE,
      48.53,
      9.07,
      'address',
      false,
    ]);
    await asPostgres("update public.locations set garage_house_number = '9' where id = $1", [
      LOCATION,
    ]);
    expect(await garage()).toMatchObject({ garage_house_number: '9', garage_lat: null });
  });

  it('verlangt eine Bestaetigung unterhalb der Hausnummer und eine vollstaendige Adresse', async () => {
    await expect(
      asUser(users.ownerTherapist, SETZEN, [LOCATION, ...GARAGE, 48.53, 9.07, 'street', false]),
    ).rejects.toMatchObject({ code: '22023' });
    await expect(
      asUser(users.ownerTherapist, SETZEN, [
        LOCATION,
        '',
        '7',
        '72072',
        'Tuebingen',
        48.53,
        9.07,
        'address',
        false,
      ]),
    ).rejects.toMatchObject({ code: '22023' });
  });

  it.each([
    ['therapist', users.therapist],
    ['office', users.office],
    ['team_lead', users.teamLead],
    ['trainer', users.trainer],
    ['das Patientenkonto', users.patientMax],
    ['ein Plattformkonto', users.plattformTina],
  ])('weist %s beim Setzen und Entfernen ab', async (_, konto) => {
    await expect(
      asUser(konto, SETZEN, [LOCATION, ...GARAGE, 48.53, 9.07, 'address', false]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(konto, ENTFERNEN, [LOCATION])).rejects.toMatchObject({ code: '42501' });
    expect((await garage()).garage_street).toBeNull();
  });

  it('findet den Standort einer fremden Praxis nicht', async () => {
    const fremd = await fremdeOrganisation();
    await expect(
      asUser(fremd.owner, SETZEN, [LOCATION, ...GARAGE, 48.53, 9.07, 'address', false]),
    ).rejects.toMatchObject({ code: 'P0002' });
    await expect(asUser(fremd.owner, ENTFERNEN, [LOCATION])).rejects.toMatchObject({
      code: 'P0002',
    });
  });

  it('zeigt die Garage allen Praxisrollen der Praxis, keinem Patienten- oder Plattformkonto', async () => {
    await asUserCommitted(users.ownerTherapist, SETZEN, [
      LOCATION,
      ...GARAGE,
      48.53,
      9.07,
      'address',
      false,
    ]);
    const LESEN = 'select garage_street, garage_lat from public.locations where id = $1';
    for (const konto of [users.therapist, users.office, users.teamLead, users.trainer]) {
      const { rows } = await asUser(konto, LESEN, [LOCATION]);
      expect(rows).toEqual([{ garage_street: 'Radweg', garage_lat: 48.53 }]);
    }
    for (const konto of [users.patientMax, users.plattformTina]) {
      const { rows } = await asUser(konto, LESEN, [LOCATION]);
      expect(rows).toEqual([]);
    }
    const fremd = await fremdeOrganisation();
    const { rows } = await asUser(fremd.owner, LESEN, [LOCATION]);
    expect(rows).toEqual([]);
  });
});

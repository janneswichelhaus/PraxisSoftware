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

/**
 * MAP-006a: Koordinaten bei der Adresse (ANN-016, ADR-019 Punkt 13 und 14).
 *
 * Geprüft werden die drei Zusagen der Migration: Die Koordinate hat genau
 * einen Schreiber, sie verfällt mit ihrer Adresse, und sie wandert in den
 * Hausbesuchs-Snapshot nur, wenn die Adresse dieselbe ist. Dazu das Audit
 * ohne Koordinate und der Startort der Tagesroute.
 */

const { users, patients, organizationId } = SEED;

const SETZEN =
  'select public.set_patient_address_coordinate($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9) as n';
const START = 'select public.set_location_tour_start($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)';
const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const AENDERN =
  'select public.update_patient($1::uuid, $2, $3, $4::date, $5, $6, $7, $8, $9, $10) as id';

const ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

/** Die Seed-Adresse von Max Mustermann. */
const MAX = ['Beispielstrasse', '12', '72070', 'Tuebingen'] as const;

interface Koordinate {
  lat: number | null;
  lon: number | null;
  geocode_precision: string | null;
}

async function koordinateVon(patientId: string): Promise<Koordinate> {
  const { rows } = await asPostgres<Koordinate>(
    'select lat, lon, geocode_precision from public.patient_contact_details where patient_id = $1',
    [patientId],
  );
  return rows[0]!;
}

async function besuchskoordinate(terminId: string) {
  const { rows } = await asPostgres<{
    visit_lat: number | null;
    visit_geocode_precision: string | null;
  }>('select visit_lat, visit_geocode_precision from public.appointments where id = $1', [
    terminId,
  ]);
  return rows[0]!;
}

beforeEach(async () => {
  await resetDatabase();
}, 120_000);

describe('Seed', () => {
  it('traegt synthetische Koordinaten und uebernimmt sie in die Hausbesuche', async () => {
    expect(await koordinateVon(patients.max)).toEqual({
      lat: 48.5305,
      lon: 9.049,
      geocode_precision: 'address',
    });
    const besuch = await besuchskoordinate('aaaaaaaa-aaaa-4aaa-8aaa-000000000001');
    expect(besuch.visit_lat).toBe(48.5305);
  });
});

describe('Auskunft nach Art. 15 DSGVO', () => {
  it('enthaelt die Koordinate der Adresse und des Hausbesuchs', async () => {
    const { rows } = await asUser<{
      daten: { tabellen: Record<string, Record<string, unknown>[]> };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.max,
    ]);
    const tabellen = rows[0]!.daten.tabellen;
    expect(tabellen['patient_contact_details']![0]).toMatchObject({
      lat: 48.5305,
      lon: 9.049,
      geocode_precision: 'address',
    });
    expect(tabellen['appointments']!.some((t) => t['visit_lat'] === 48.5305)).toBe(true);
  });
});

describe('Die Koordinate verfaellt mit der Adresse', () => {
  it('bei einer Adressaenderung ueber update_patient', async () => {
    await asUserCommitted(users.office, AENDERN, [
      patients.max,
      'Max',
      'Mustermann',
      '1957-04-30',
      'max.mustermann@patient.invalid',
      '+49 7071 0000005',
      'Beispielstrasse',
      '14',
      '72070',
      'Tuebingen',
    ]);
    expect(await koordinateVon(patients.max)).toEqual({
      lat: null,
      lon: null,
      geocode_precision: null,
    });
  });

  it('nicht bei einer Aenderung ohne Adressbezug', async () => {
    await asUserCommitted(users.office, AENDERN, [
      patients.max,
      'Max',
      'Mustermann',
      '1957-04-30',
      'max.neu@patient.invalid',
      '+49 7071 0000005',
      ...MAX,
    ]);
    expect((await koordinateVon(patients.max)).lat).toBe(48.5305);
  });

  it('auch am Startort des Standorts', async () => {
    await asPostgres("update public.locations set house_number = '2' where id = $1", [LOCATION]);
    const { rows } = await asPostgres<{ lat: number | null }>(
      'select lat from public.locations where id = $1',
      [LOCATION],
    );
    expect(rows[0]!.lat).toBeNull();
  });
});

describe('set_patient_address_coordinate', () => {
  it.each([
    ['therapist', users.therapist],
    ['office', users.office],
    ['owner', users.ownerTherapist],
    ['team_lead', users.teamLead],
  ])('setzt die Koordinate als %s und protokolliert ohne Koordinate', async (_, konto) => {
    await asPostgres(
      'update public.patient_contact_details set lat = null, lon = null, geocode_precision = null where patient_id = $1',
      [patients.max],
    );
    await asUserCommitted(konto, SETZEN, [patients.max, ...MAX, 48.53, 9.05, 'address', false]);

    expect(await koordinateVon(patients.max)).toEqual({
      lat: 48.53,
      lon: 9.05,
      geocode_precision: 'address',
    });

    const { rows } = await asPostgres<{ context: Record<string, unknown>; subject_id: string }>(
      `select context, subject_id from public.audit_log
       where action = 'patient.address_geocoded' and actor_user_id = $1`,
      [konto],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subject_id).toBe(patients.max);
    const kontext = JSON.stringify(rows[0]!.context);
    expect(kontext).not.toMatch(/48[.,]5|9[.,]05|Beispielstrasse|72070/);
    expect(rows[0]!.context['precision']).toBe('address');
  });

  it('verlangt unterhalb der Hausnummer eine Bestaetigung (ANN-016)', async () => {
    await expect(
      asUser(users.therapist, SETZEN, [patients.max, ...MAX, 48.53, 9.05, 'street', false]),
    ).rejects.toMatchObject({ code: '22023' });

    await asUserCommitted(users.therapist, SETZEN, [
      patients.max,
      ...MAX,
      48.53,
      9.05,
      'street',
      true,
    ]);
    expect((await koordinateVon(patients.max)).geocode_precision).toBe('street');
  });

  it('schreibt nichts, wenn sich die Adresse seit dem Geocoding geaendert hat', async () => {
    await expect(
      asUser(users.therapist, SETZEN, [
        patients.max,
        'Beispielstrasse',
        '99',
        '72070',
        'Tuebingen',
        48.53,
        9.05,
        'address',
        false,
      ]),
    ).rejects.toMatchObject({ code: '40001' });
  });

  it.each([
    ['Breitengrad', 91, 9.05],
    ['Laengengrad', 48.5, -181],
  ])('weist einen %s ausserhalb der Erde ab', async (_, lat, lon) => {
    await expect(
      asUser(users.therapist, SETZEN, [patients.max, ...MAX, lat, lon, 'address', false]),
    ).rejects.toMatchObject({ code: '22023' });
  });

  it('weist eine unbekannte Genauigkeit ab', async () => {
    await expect(
      asUser(users.therapist, SETZEN, [patients.max, ...MAX, 48.5, 9.05, 'exakt', true]),
    ).rejects.toMatchObject({ code: '22023' });
  });

  it.each([
    ['Patientenkonto', users.patientMax],
    ['trainer', users.trainer],
  ])('weist das %s ab', async (_, konto) => {
    await expect(
      asUser(konto, SETZEN, [patients.max, ...MAX, 48.53, 9.05, 'address', false]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('weist ohne Anmeldung ab', async () => {
    await expect(
      asUser(null, SETZEN, [patients.max, ...MAX, 48.53, 9.05, 'address', false]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('findet den Patienten einer fremden Praxis nicht', async () => {
    const fremd = await fremdeOrganisation();
    await expect(
      asUser(users.therapist, SETZEN, [fremd.patient, ...MAX, 48.53, 9.05, 'address', false]),
    ).rejects.toMatchObject({ code: 'P0002' });
  });

  it('laesst die Tabelle ueber den Anwendungspfad unbeschreibbar', async () => {
    await expect(
      asUser(
        users.therapist,
        'update public.patient_contact_details set lat = 1, lon = 1, geocode_precision = $2 where patient_id = $1',
        [patients.max, 'address'],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('uebertraegt die Koordinate in kuenftige Hausbesuche derselben Adresse (ANN-095)', async () => {
    // Ausgangslage: Adresse ohne Koordinate, ein kuenftiger Hausbesuch.
    await asPostgres(
      'update public.patient_contact_details set lat = null, lon = null, geocode_precision = null where patient_id = $1',
      [patients.max],
    );
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
      patients.max,
      ANNA,
      'home_visit',
      tagInTagen(30),
      '09:00',
      '10:00',
      null,
    ]);
    const termin = rows[0]!.id;
    expect((await besuchskoordinate(termin)).visit_lat).toBeNull();

    const gesetzt = await asUserCommitted<{ n: number }>(users.therapist, SETZEN, [
      patients.max,
      ...MAX,
      48.53,
      9.05,
      'address',
      false,
    ]);
    expect(gesetzt.rows[0]!.n).toBe(1);
    expect(await besuchskoordinate(termin)).toEqual({
      visit_lat: 48.53,
      visit_geocode_precision: 'address',
    });
    // Der Hausbesuch von heute Morgen liegt in der Vergangenheit oder zumindest
    // vor dem Stichtag des Aufrufs - er behaelt, was er hatte.
  });
});

describe('Koordinate im Hausbesuchs-Snapshot', () => {
  it('wird bei der Anlage uebernommen, wenn die Patientenadresse eine hat', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
      patients.max,
      ANNA,
      'home_visit',
      tagInTagen(30),
      '09:00',
      '10:00',
      null,
    ]);
    expect(await besuchskoordinate(rows[0]!.id)).toEqual({
      visit_lat: 48.5305,
      visit_geocode_precision: 'address',
    });
  });

  it('bleibt leer bei Praxis- und Videoterminen', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
      patients.max,
      ANNA,
      'video',
      tagInTagen(30),
      '11:00',
      '12:00',
      null,
    ]);
    expect((await besuchskoordinate(rows[0]!.id)).visit_lat).toBeNull();
  });

  it('bleibt leer, wenn die Snapshot-Adresse nicht mit der geocodierten uebereinstimmt', async () => {
    await asPostgres(
      `update public.appointments set visit_house_number = '13'
       where id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'`,
    );
    expect((await besuchskoordinate('aaaaaaaa-aaaa-4aaa-8aaa-000000000001')).visit_lat).toBeNull();
  });

  it('kennt keine Koordinate ohne Adresse (Constraint)', async () => {
    await expect(
      asPostgres(
        `update public.appointments set visit_lat = 1, visit_lon = 1, visit_geocode_precision = 'address'
         where appointment_type <> 'home_visit' and organization_id = $1`,
        [organizationId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('set_location_tour_start', () => {
  const PRAXIS = ['Praxisplatz', '3', '72072', 'Tuebingen'] as const;

  it('setzt Adresse und Koordinate als owner und protokolliert ohne Koordinate', async () => {
    await asUserCommitted(users.ownerTherapist, START, [
      LOCATION,
      ...PRAXIS,
      48.52,
      9.06,
      'address',
      false,
    ]);
    const { rows } = await asPostgres<{ house_number: string; lat: number }>(
      'select house_number, lat from public.locations where id = $1',
      [LOCATION],
    );
    expect(rows[0]).toEqual({ house_number: '3', lat: 48.52 });

    const audit = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log where action = 'organization.tour_start_changed'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows[0]!.context)).not.toMatch(/48[.,]52|Praxisplatz/);
  });

  it.each([
    ['therapist', users.therapist],
    ['office', users.office],
    ['team_lead', users.teamLead],
  ])('weist %s ab', async (_, konto) => {
    await expect(
      asUser(konto, START, [LOCATION, ...PRAXIS, 48.52, 9.06, 'address', false]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('findet einen Standort einer fremden Praxis nicht', async () => {
    await expect(
      asUser(users.ownerTherapist, START, [
        '33333333-3333-4333-8333-0000000000ff',
        ...PRAXIS,
        48.52,
        9.06,
        'address',
        false,
      ]),
    ).rejects.toMatchObject({ code: 'P0002' });
  });

  it('verlangt eine Bestaetigung unterhalb der Hausnummer', async () => {
    await expect(
      asUser(users.ownerTherapist, START, [LOCATION, ...PRAXIS, 48.52, 9.06, 'locality', false]),
    ).rejects.toMatchObject({ code: '22023' });
  });
});

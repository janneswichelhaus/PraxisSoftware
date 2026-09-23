import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, resetDatabase } from './helpers/db';

const { users, organizationId, patients } = SEED;

const LESEN = 'select * from public.list_appointments($1::date, $2::date, $3::uuid, $4::uuid, $5)';

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

const LOCATION = '33333333-3333-4333-8333-000000000001';

interface Zeile {
  id: string;
  patient_id: string;
  staff_member_id: string;
  location_id: string | null;
  appointment_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  patient_family_name: string;
  staff_family_name: string;
  location_name: string | null;
}

function lesen(
  userId: string | null,
  von: string,
  bis: string,
  filter: { person?: string | null; standort?: string | null; status?: string } = {},
) {
  return asUser<Zeile>(userId, LESEN, [
    von,
    bis,
    filter.person ?? null,
    filter.standort ?? null,
    filter.status ?? 'confirmed',
  ]);
}

/**
 * Legt einen Termin unmittelbar an - mit Ortszeit der Praxis als Vorgabe.
 *
 * Bewusst nicht ueber create_appointment: der Kalender muss auch vergangene
 * Termine und Randzeiten zeigen, die beim Anlegen zu Recht abgewiesen wuerden.
 */
async function termin(opts: {
  tag: string;
  von: string;
  bis: string;
  staff?: string;
  patient?: string;
  typ?: 'home_visit' | 'practice' | 'video';
  status?: 'confirmed' | 'cancelled';
  ort?: string | null;
}): Promise<string> {
  const typ = opts.typ ?? 'video';
  const ort = typ === 'practice' ? (opts.ort ?? LOCATION) : null;
  const abgesagt = opts.status === 'cancelled';

  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, cancelled_at, cancelled_by,
       visit_street, visit_house_number, visit_postal_code, visit_city
     )
     values (
       $1, $2, $3, $4, $5, $6,
       (($7 || ' ' || $8)::timestamp at time zone 'Europe/Berlin'),
       (($7 || ' ' || $9)::timestamp at time zone 'Europe/Berlin'),
       case when $6 = 'cancelled' then now() end,
       case when $6 = 'cancelled' then $10::uuid end,
       case when $5 = 'home_visit' then 'Teststrasse' end,
       case when $5 = 'home_visit' then '1' end,
       case when $5 = 'home_visit' then '72070' end,
       case when $5 = 'home_visit' then 'Tuebingen' end
     )
     returning id`,
    [
      organizationId,
      opts.patient ?? patients.max,
      opts.staff ?? STAFF.anna,
      ort,
      typ,
      abgesagt ? 'cancelled' : 'confirmed',
      opts.tag,
      opts.von,
      opts.bis,
      users.office,
    ],
  );
  return rows[0]!.id;
}

describe('list_appointments: Zeitfenster', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('liefert genau die Termine des angefragten Tages', async () => {
    const drin = await termin({ tag: '2027-05-12', von: '09:00', bis: '10:00' });
    await termin({ tag: '2027-05-11', von: '09:00', bis: '10:00' });
    await termin({ tag: '2027-05-13', von: '09:00', bis: '10:00' });

    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13');
    expect(rows.map((r) => r.id)).toEqual([drin]);
  });

  it('liefert genau die Termine der angefragten Woche', async () => {
    // Montag bis Sonntag der Woche des 12.05.2027 (Mittwoch).
    const montag = await termin({ tag: '2027-05-10', von: '08:00', bis: '09:00' });
    const sonntag = await termin({ tag: '2027-05-16', von: '08:00', bis: '09:00' });
    await termin({ tag: '2027-05-09', von: '08:00', bis: '09:00' });
    await termin({ tag: '2027-05-17', von: '08:00', bis: '09:00' });

    const { rows } = await lesen(users.office, '2027-05-10', '2027-05-17');
    expect(rows.map((r) => r.id).sort()).toEqual([montag, sonntag].sort());
  });

  it('schliesst den ersten Moment des Bereichs ein und den ersten danach aus', async () => {
    const ganzFrueh = await termin({ tag: '2027-05-12', von: '00:00', bis: '01:00' });
    const ganzSpaet = await termin({ tag: '2027-05-12', von: '22:30', bis: '23:30' });
    // Erster Moment des Folgetages - gehoert nicht mehr dazu.
    await termin({ tag: '2027-05-13', von: '00:00', bis: '01:00' });

    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13');
    expect(rows.map((r) => r.id)).toEqual([ganzFrueh, ganzSpaet]);
  });

  it('ordnet die Termine chronologisch', async () => {
    const mittag = await termin({ tag: '2027-05-12', von: '12:00', bis: '13:00' });
    const frueh = await termin({ tag: '2027-05-12', von: '08:00', bis: '09:00' });
    const abend = await termin({ tag: '2027-05-12', von: '17:00', bis: '18:00' });

    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13');
    expect(rows.map((r) => r.id)).toEqual([frueh, mittag, abend]);
  });

  it('weist ein Bis vor oder gleich dem Von ab', async () => {
    await expect(lesen(users.office, '2027-05-12', '2027-05-12')).rejects.toThrow(
      /to must be after from/,
    );
    await expect(lesen(users.office, '2027-05-12', '2027-05-11')).rejects.toThrow(
      /to must be after from/,
    );
  });

  it('weist ein unangemessen grosses Fenster ab', async () => {
    await expect(lesen(users.office, '2027-01-01', '2027-12-31')).rejects.toThrow(
      /range is too large/,
    );
  });

  it('erlaubt bis zu 31 Tage', async () => {
    await expect(lesen(users.office, '2027-05-01', '2027-06-01')).resolves.toBeDefined();
  });

  it('weist einen unbekannten Statusfilter ab', async () => {
    await expect(
      lesen(users.office, '2027-05-12', '2027-05-13', { status: 'deleted' }),
    ).rejects.toThrow(/unknown status filter/);
  });
});

describe('list_appointments: Praxiszeitzone', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('ordnet einen Termin dem Kalendertag der Praxis zu, nicht dem UTC-Tag', async () => {
    // 00:30 Ortszeit am 12.05. ist 22:30 UTC am 11.05.
    const id = await termin({ tag: '2027-05-12', von: '00:30', bis: '01:30' });

    const { rows: utcTag } = await asPostgres<{ utc: string }>(
      "select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD') as utc from public.appointments where id = $1",
      [id],
    );
    expect(utcTag[0]?.utc).toBe('2027-05-11');

    // Der Kalender zeigt ihn trotzdem am 12.05. …
    const { rows: amZwoelften } = await lesen(users.office, '2027-05-12', '2027-05-13');
    expect(amZwoelften.map((r) => r.id)).toEqual([id]);

    // … und nicht am 11.05.
    const { rows: amElften } = await lesen(users.office, '2027-05-11', '2027-05-12');
    expect(amElften).toHaveLength(0);
  });

  it('behandelt den kurzen Tag der Zeitumstellung im Fruehjahr korrekt', async () => {
    // 28.03.2027: die Uhr springt um 02:00 auf 03:00, der Tag hat 23 Stunden.
    const frueh = await termin({ tag: '2027-03-28', von: '00:30', bis: '01:30' });
    const spaet = await termin({ tag: '2027-03-28', von: '22:30', bis: '23:30' });
    await termin({ tag: '2027-03-27', von: '22:30', bis: '23:30' });

    const { rows } = await lesen(users.office, '2027-03-28', '2027-03-29');
    expect(rows.map((r) => r.id)).toEqual([frueh, spaet]);
  });

  it('behandelt den langen Tag der Zeitumstellung im Herbst korrekt', async () => {
    // 31.10.2027: die Uhr springt um 03:00 auf 02:00, der Tag hat 25 Stunden.
    const frueh = await termin({ tag: '2027-10-31', von: '00:30', bis: '01:30' });
    const spaet = await termin({ tag: '2027-10-31', von: '22:30', bis: '23:30' });
    await termin({ tag: '2027-11-01', von: '00:30', bis: '01:30' });

    const { rows } = await lesen(users.office, '2027-10-31', '2027-11-01');
    expect(rows.map((r) => r.id)).toEqual([frueh, spaet]);
  });

  it('umfasst eine Woche mit Zeitumstellung genau sieben Kalendertage', async () => {
    const montag = await termin({ tag: '2027-03-22', von: '09:00', bis: '10:00' });
    const sonntag = await termin({ tag: '2027-03-28', von: '09:00', bis: '10:00' });
    await termin({ tag: '2027-03-29', von: '09:00', bis: '10:00' });

    const { rows } = await lesen(users.office, '2027-03-22', '2027-03-29');
    expect(rows.map((r) => r.id)).toEqual([montag, sonntag]);
  });
});

describe('list_appointments: Filter', () => {
  let annaTermin: string;
  let timTermin: string;
  let praxisTermin: string;
  let abgesagt: string;

  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    annaTermin = await termin({ tag: '2027-05-12', von: '08:00', bis: '09:00', staff: STAFF.anna });
    timTermin = await termin({ tag: '2027-05-12', von: '10:00', bis: '11:00', staff: STAFF.tim });
    praxisTermin = await termin({
      tag: '2027-05-12',
      von: '12:00',
      bis: '13:00',
      staff: STAFF.jannes,
      typ: 'practice',
    });
    abgesagt = await termin({
      tag: '2027-05-12',
      von: '14:00',
      bis: '15:00',
      staff: STAFF.anna,
      status: 'cancelled',
    });
  });

  it('filtert nach behandelnder Person', async () => {
    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13', {
      person: STAFF.tim,
    });
    expect(rows.map((r) => r.id)).toEqual([timTermin]);
  });

  it('filtert nach Standort', async () => {
    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13', {
      standort: LOCATION,
    });
    expect(rows.map((r) => r.id)).toEqual([praxisTermin]);
    expect(rows[0]?.location_name).toBe('Hauptstandort Tuebingen');
  });

  it('zeigt standardmaessig nur geplante Termine', async () => {
    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13');
    expect(rows.map((r) => r.id)).toEqual([annaTermin, timTermin, praxisTermin]);
    expect(rows.map((r) => r.id)).not.toContain(abgesagt);
  });

  it('zeigt auf Wunsch nur abgesagte Termine', async () => {
    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13', {
      status: 'cancelled',
    });
    expect(rows.map((r) => r.id)).toEqual([abgesagt]);
  });

  it('zeigt auf Wunsch geplante und abgesagte Termine', async () => {
    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13', { status: 'all' });
    expect(rows).toHaveLength(4);
  });

  it('kombiniert Filter', async () => {
    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13', {
      person: STAFF.anna,
      status: 'all',
    });
    expect(rows.map((r) => r.id)).toEqual([annaTermin, abgesagt]);
  });

  it('liefert fuer einen unbekannten Filterwert eine leere Liste statt einer Meldung', async () => {
    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13', {
      person: '55555555-5555-4555-8555-00000000ffff',
    });
    expect(rows).toHaveLength(0);
  });
});

describe('list_appointments: Berechtigungen und Mandantentrennung', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000c1';
  const fremderOwner = '11111111-1111-4111-8111-0000000000c1';
  const fremdePerson = '44444444-4444-4444-8444-0000000000c1';
  const fremdePatientPerson = '44444444-4444-4444-8444-0000000000c2';
  const fremderStaff = '55555555-5555-4555-8555-0000000000c1';
  const fremderPatient = '66666666-6666-4666-8666-0000000000c1';

  let eigener: string;
  let fremder: string;

  beforeAll(async () => {
    await resetDatabase();

    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderOwner}', 'frida.kalender@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name, time_zone)
        values ('${fremdeOrg}', 'Test Praxis Woanders', 'Europe/Berlin');
      insert into public.persons (id, organization_id, given_name, family_name) values
        ('${fremdePerson}',        '${fremdeOrg}', 'Frida', 'Fremd'),
        ('${fremdePatientPerson}', '${fremdeOrg}', 'Fritz', 'Fremdpatient');
      insert into public.staff_members (id, organization_id, person_id)
        values ('${fremderStaff}', '${fremdeOrg}', '${fremdePerson}');
      insert into public.patients (id, organization_id, person_id, status)
        values ('${fremderPatient}', '${fremdeOrg}', '${fremdePatientPerson}', 'active');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('${fremderOwner}', '${fremdeOrg}', '${fremdePerson}', 'Frida Fremd');
      insert into public.user_roles (user_id, organization_id, role_key) values
        ('${fremderOwner}', '${fremdeOrg}', 'owner'),
        ('${fremderOwner}', '${fremdeOrg}', 'therapist');
    `);

    eigener = await termin({ tag: '2027-05-12', von: '09:00', bis: '10:00' });

    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments
         (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at)
       values ($1, $2, $3, 'video', 'confirmed',
         ('2027-05-12 09:00'::timestamp at time zone 'Europe/Berlin'),
         ('2027-05-12 10:00'::timestamp at time zone 'Europe/Berlin'))
       returning id`,
      [fremdeOrg, fremderPatient, fremderStaff],
    );
    fremder = rows[0]!.id;
  }, 120_000);

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('laesst %s den Kalender lesen', async (_rolle, userId) => {
    const { rows } = await lesen(userId, '2027-05-12', '2027-05-13');
    expect(rows.map((r) => r.id)).toEqual([eigener]);
  });

  it('weist ein Patientenkonto ab', async () => {
    // G6b: null Zeilen statt Ausnahme, der Versuch steht im Auditlog
    // (abgewiesene-lesepfade.test.ts).
    expect((await lesen(users.patientMax, '2027-05-12', '2027-05-13')).rows).toEqual([]);
  });

  it('weist einen Aufruf ohne Sitzung ab', async () => {
    await expect(lesen(null, '2027-05-12', '2027-05-13')).rejects.toThrow(
      /not authenticated|not allowed/,
    );
  });

  it('weist anon ab', async () => {
    await expect(
      asAnon(LESEN, ['2027-05-12', '2027-05-13', null, null, 'confirmed']),
    ).rejects.toThrow(/permission denied|not authenticated/i);
  });

  it('zeigt keine Termine fremder Organisationen', async () => {
    const { rows } = await lesen(users.ownerTherapist, '2027-05-12', '2027-05-13', {
      status: 'all',
    });
    expect(rows.map((r) => r.id)).not.toContain(fremder);
    expect(rows.map((r) => r.id)).toEqual([eigener]);
  });

  it('laesst auch ein Filtern auf fremde Bezuege nichts durch', async () => {
    const { rows } = await lesen(users.ownerTherapist, '2027-05-12', '2027-05-13', {
      person: fremderStaff,
      status: 'all',
    });
    expect(rows).toHaveLength(0);
  });

  it('zeigt der fremden Praxis ihren eigenen Termin', async () => {
    const { rows } = await lesen(fremderOwner, '2027-05-12', '2027-05-13');
    expect(rows.map((r) => r.id)).toEqual([fremder]);
  });

  it('nimmt keine organization_id entgegen', async () => {
    const { rows } = await asPostgres<{ argumente: string }>(
      "select pg_get_function_arguments(oid) as argumente from pg_proc where proname = 'list_appointments'",
    );
    expect(rows[0]?.argumente).not.toMatch(/organization/i);
  });
});

describe('list_appointments: Datensparsamkeit', () => {
  beforeAll(async () => {
    await resetDatabase();
    await termin({ tag: '2027-05-12', von: '09:00', bis: '10:00', typ: 'home_visit' });
  }, 120_000);

  it('liefert genau die Felder, die der Kalender anzeigt', async () => {
    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13');
    expect(Object.keys(rows[0]!).sort()).toEqual(
      [
        'id',
        'patient_id',
        'staff_member_id',
        'location_id',
        'appointment_type',
        // Art und Titel seit CAL-015b: Der Kalender zeigt auch Ereignisse des
        // Praxisbetriebs, und die haben keinen Patientennamen.
        'kind',
        'title',
        'status',
        'starts_at',
        'ends_at',
        'patient_given_name',
        'patient_family_name',
        'staff_given_name',
        'staff_family_name',
        'location_name',
      ].sort(),
    );
  });

  it('liefert keine Kontaktdaten und keinen Adress-Snapshot mit', async () => {
    const { rows } = await lesen(users.office, '2027-05-12', '2027-05-13');
    const schluessel = Object.keys(rows[0]!);
    for (const feld of [
      'date_of_birth',
      'email',
      'phone',
      'visit_street',
      'visit_house_number',
      'visit_postal_code',
      'visit_city',
    ]) {
      expect(schluessel).not.toContain(feld);
    }
  });
});

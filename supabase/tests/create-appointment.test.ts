import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabase,
  tagInTagen,
  testDatabaseUrl,
} from './helpers/db';

const { users, organizationId, patients } = SEED;

// Bewusst MIT Arbeitszeitbestaetigung: diese Datei prueft andere Zusagen und
// benutzt Zeiten ueber den ganzen Tag sowie Kalendertage, die auch auf ein
// Wochenende fallen koennen. Die Arbeitszeitpruefung hat eigene Tests in
// scheduling-rules.test.ts; hier waere sie nur Rauschen (CAL-005).
const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';

/** Feste IDs aus supabase/seed.sql. */
const STAFF = {
  jannesOwnerTherapist: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

const LOCATION = '33333333-3333-4333-8333-000000000001';

/**
 * Kalendertag weit genug in der Zukunft, damit kein Testlauf um Mitternacht
 * kippt. Termine werden in der Praxiszeitzone ausgelegt.
 */
const TAG = tagInTagen(30);

interface Termin {
  patient: string;
  staff: string;
  typ: 'home_visit' | 'practice' | 'video';
  tag: string;
  von: string;
  bis: string;
  ort: string | null;
}

const STANDARD: Termin = {
  patient: patients.max,
  staff: STAFF.anna,
  typ: 'video',
  tag: TAG,
  von: '09:00',
  bis: '10:00',
  ort: null,
};

function args(felder: Partial<Termin> = {}) {
  const t = { ...STANDARD, ...felder };
  return [t.patient, t.staff, t.typ, t.tag, t.von, t.bis, t.ort];
}

/** Legt zurueckgerollt an - fuer Berechtigungs- und Fehlerfaelle. */
function anlegen(userId: string | null, felder: Partial<Termin> = {}) {
  return asUser<{ id: string }>(userId, ANLEGEN, args(felder));
}

/** Legt bestaetigt an - fuer Faelle, deren Ergebnis anschliessend geprueft wird. */
async function anlegenCommitted(userId: string, felder: Partial<Termin> = {}): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(userId, ANLEGEN, args(felder));
  return rows[0]!.id;
}

async function termin(id: string) {
  const { rows } = await asPostgres<Record<string, unknown>>(
    'select * from public.appointments where id = $1',
    [id],
  );
  return rows[0];
}

// =============================================================================
// Positivfaelle
// =============================================================================

describe('create_appointment: berechtigte Rollen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('erlaubt %s das Anlegen', async (_rolle, userId) => {
    const id = await anlegenCommitted(userId);
    expect(await termin(id)).toBeDefined();
  });

  it('setzt den Status serverseitig auf confirmed', async () => {
    const id = await anlegenCommitted(users.office);
    expect((await termin(id))?.status).toBe('confirmed');
  });

  it('nimmt keinen Status entgegen - er ist kein Argument der Funktion', async () => {
    const { rows } = await asPostgres<{ argumente: string }>(
      "select pg_get_function_arguments(oid) as argumente from pg_proc where proname = 'create_appointment'",
    );
    expect(rows[0]?.argumente).not.toMatch(/status/i);
  });

  it('setzt die Organisation aus dem Benutzerkontext', async () => {
    const id = await anlegenCommitted(users.office);
    expect((await termin(id))?.organization_id).toBe(organizationId);
  });

  it('nimmt keine organization_id entgegen - Einschleusung ist strukturell unmoeglich', async () => {
    const { rows } = await asPostgres<{ argumente: string }>(
      "select pg_get_function_arguments(oid) as argumente from pg_proc where proname = 'create_appointment'",
    );
    expect(rows[0]?.argumente).not.toMatch(/organization/i);
  });

  it('vermerkt den Ersteller', async () => {
    const id = await anlegenCommitted(users.teamLead);
    expect((await termin(id))?.created_by).toBe(users.teamLead);
  });

  it.each([
    ['therapist', STAFF.anna],
    ['team_lead', STAFF.tim],
    ['owner mit therapeutischer Zusatzrolle', STAFF.jannesOwnerTherapist],
  ])('erlaubt %s als behandelnde Person', async (_wer, staff) => {
    const id = await anlegenCommitted(users.office, { staff });
    expect((await termin(id))?.staff_member_id).toBe(staff);
  });
});

describe('create_appointment: Zeitzone der Praxis', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  async function lokal(id: string) {
    const { rows } = await asPostgres<{ von: string; bis: string }>(
      `select to_char(starts_at at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI') as von,
              to_char(ends_at   at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI') as bis
         from public.appointments where id = $1`,
      [id],
    );
    return rows[0];
  }

  it('legt eine Winterzeit-Uhrzeit korrekt als timestamptz ab (CET, +01:00)', async () => {
    const id = await anlegenCommitted(users.office, {
      tag: '2027-01-15',
      von: '09:00',
      bis: '10:00',
    });
    const { rows } = await asPostgres<{ utc: string }>(
      "select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as utc from public.appointments where id = $1",
      [id],
    );
    expect(rows[0]?.utc).toBe('2027-01-15 08:00');
    expect(await lokal(id)).toEqual({ von: '2027-01-15 09:00', bis: '2027-01-15 10:00' });
  });

  it('legt eine Sommerzeit-Uhrzeit korrekt als timestamptz ab (CEST, +02:00)', async () => {
    const id = await anlegenCommitted(users.office, {
      tag: '2027-07-15',
      von: '09:00',
      bis: '10:00',
    });
    const { rows } = await asPostgres<{ utc: string }>(
      "select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as utc from public.appointments where id = $1",
      [id],
    );
    expect(rows[0]?.utc).toBe('2027-07-15 07:00');
    expect(await lokal(id)).toEqual({ von: '2027-07-15 09:00', bis: '2027-07-15 10:00' });
  });

  it('haelt dieselbe Ortszeit ueber die Zeitumstellung hinweg fest', async () => {
    // Der Tag vor und der Tag nach der Umstellung Ende Maerz 2027.
    const vorher = await anlegenCommitted(users.office, {
      tag: '2027-03-27',
      von: '09:00',
      bis: '10:00',
    });
    const nachher = await anlegenCommitted(users.office, {
      tag: '2027-03-29',
      von: '09:00',
      bis: '10:00',
    });

    expect((await lokal(vorher))?.von).toBe('2027-03-27 09:00');
    expect((await lokal(nachher))?.von).toBe('2027-03-29 09:00');

    // Ortszeit gleich, UTC-Zeitstempel unterschiedlich - genau das leistet die
    // Zeitzone der Organisation.
    const { rows } = await asPostgres<{ utc: string }>(
      "select to_char(starts_at at time zone 'UTC', 'HH24:MI') as utc from public.appointments order by starts_at",
      [],
    );
    expect(rows.map((r) => r.utc)).toEqual(['08:00', '07:00']);
  });

  it('leitet die Zeitzone aus der Organisation ab, nicht aus der Sitzung', async () => {
    // Eine abweichende Zeitzone der Datenbanksitzung darf nichts veraendern.
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('role', 'authenticated', true)");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: users.office, role: 'authenticated' }),
      ]);
      await client.query("set local timezone to 'Pacific/Kiritimati'");
      const res = await client.query(
        ANLEGEN,
        args({ tag: '2027-07-15', von: '09:00', bis: '10:00' }),
      );
      await client.query('commit');

      const id = (res.rows[0] as { id: string }).id;
      expect(await lokal(id)).toEqual({ von: '2027-07-15 09:00', bis: '2027-07-15 10:00' });
    } finally {
      await client.end();
    }
  });
});

describe('create_appointment: Terminart und Ort', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('uebernimmt die Patientenadresse als Snapshot beim Hausbesuch', async () => {
    const id = await anlegenCommitted(users.office, { typ: 'home_visit' });
    expect(await termin(id)).toMatchObject({
      appointment_type: 'home_visit',
      visit_street: 'Beispielstrasse',
      visit_house_number: '12',
      visit_postal_code: '72070',
      visit_city: 'Tuebingen',
      location_id: null,
    });
  });

  it('laesst den Snapshot von einer spaeteren Stammdatenaenderung unberuehrt', async () => {
    const id = await anlegenCommitted(users.office, { typ: 'home_visit' });

    await asUserCommitted(
      users.office,
      'select public.update_patient($1::uuid, $2, $3, $4::date, $5, $6, $7, $8, $9, $10)',
      [
        patients.max,
        'Max',
        'Mustermann',
        '1957-04-30',
        null,
        null,
        'Neuestrasse',
        '99',
        '10115',
        'Berlin',
      ],
    );

    // Der Termin zeigt weiterhin, wohin an diesem Tag gefahren wird.
    expect(await termin(id)).toMatchObject({
      visit_street: 'Beispielstrasse',
      visit_house_number: '12',
      visit_postal_code: '72070',
      visit_city: 'Tuebingen',
    });
  });

  it('speichert den Standort beim Praxistermin', async () => {
    const id = await anlegenCommitted(users.office, { typ: 'practice', ort: LOCATION });
    expect(await termin(id)).toMatchObject({
      appointment_type: 'practice',
      location_id: LOCATION,
      visit_street: null,
      visit_house_number: null,
      visit_postal_code: null,
      visit_city: null,
    });
  });

  it('speichert beim Videotermin weder Ort noch Adresse', async () => {
    const id = await anlegenCommitted(users.office, { typ: 'video' });
    expect(await termin(id)).toMatchObject({
      appointment_type: 'video',
      location_id: null,
      visit_street: null,
      visit_house_number: null,
      visit_postal_code: null,
      visit_city: null,
    });
  });

  it('speichert einen mitgegebenen Standort NICHT, wenn die Terminart keinen kennt', async () => {
    const id = await anlegenCommitted(users.office, { typ: 'video', ort: LOCATION });
    expect((await termin(id))?.location_id).toBeNull();
  });

  it('speichert bei einem Hausbesuch keinen Standort, auch wenn einer mitkommt', async () => {
    const id = await anlegenCommitted(users.office, { typ: 'home_visit', ort: LOCATION });
    expect((await termin(id))?.location_id).toBeNull();
  });

  it('verhindert widerspruechliche Ortsdaten auch auf Schemaebene', async () => {
    await expect(
      asPostgres(
        `insert into public.appointments
           (organization_id, patient_id, staff_member_id, location_id, appointment_type, status, starts_at, ends_at)
         values ($1, $2, $3, $4, 'video', 'confirmed', now() + interval '1 day', now() + interval '1 day 1 hour')`,
        [organizationId, patients.max, STAFF.anna, LOCATION],
      ),
    ).rejects.toThrow(/appointments_location_matches_type/);
  });

  it('verhindert einen unvollstaendigen Adress-Snapshot auf Schemaebene', async () => {
    await expect(
      asPostgres(
        `insert into public.appointments
           (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at, visit_street)
         values ($1, $2, $3, 'home_visit', 'confirmed', now() + interval '1 day', now() + interval '1 day 1 hour', 'Nurstrasse')`,
        [organizationId, patients.max, STAFF.anna],
      ),
    ).rejects.toThrow(/appointments_address_matches_type/);
  });
});

describe('create_appointment: Ueberschneidungen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('erlaubt direkt angrenzende Termine derselben Person', async () => {
    await anlegenCommitted(users.office, { von: '09:00', bis: '10:00' });
    const zweiter = await anlegenCommitted(users.office, { von: '10:00', bis: '11:00' });
    expect(await termin(zweiter)).toBeDefined();
  });

  it('weist eine echte Ueberschneidung derselben Person ab', async () => {
    await anlegenCommitted(users.office, { von: '09:00', bis: '10:00' });
    await expect(anlegen(users.office, { von: '09:30', bis: '10:30' })).rejects.toThrow(/overlap/);
  });

  it('weist auch einen vollstaendig eingeschlossenen Termin ab', async () => {
    // Der umschliessende Termin entsteht an der RPC vorbei: seit CAL-010a ist
    // jedes neue Zeitfenster 60 Minuten lang, ein laengerer Termin kann also
    // nur ein Bestandstermin sein. Die EXCLUDE-Constraint muss ihn trotzdem
    // schuetzen - genau das prueft dieser Fall.
    await asPostgres(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, appointment_type, status,
         starts_at, ends_at
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 'video', 'confirmed',
         ($4::date + time '09:00') at time zone 'Europe/Berlin',
         ($4::date + time '11:00') at time zone 'Europe/Berlin'
       )`,
      [organizationId, patients.max, STAFF.anna, TAG],
    );
    await expect(anlegen(users.office, { von: '09:30', bis: '10:30' })).rejects.toThrow(/overlap/);
  });

  it('erlaubt zeitgleiche Termine verschiedener behandelnder Personen', async () => {
    await anlegenCommitted(users.office, { staff: STAFF.anna, von: '09:00', bis: '10:00' });
    const zweiter = await anlegenCommitted(users.office, {
      staff: STAFF.tim,
      patient: patients.erika,
      von: '09:00',
      bis: '10:00',
    });
    expect(await termin(zweiter)).toBeDefined();
  });

  it('setzt den Schutz als Datenbank-Constraint durch, nicht per Abfrage', async () => {
    const { rows } = await asPostgres<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint where conname = 'appointments_no_overlap'`,
    );
    expect(rows[0]?.definition).toMatch(/EXCLUDE USING gist/i);
    expect(rows[0]?.definition).toMatch(/tstzrange\(starts_at, ends_at, '\[\)'/);
    // Jeder Zustand ausser der Absage belegt seinen Zeitraum: durchgefuehrt,
    // dokumentiert und abgerechnet haben stattgefunden, und ein wieder
    // geoeffneter No-show braucht seinen Zeitraum zurueck (ADR-018).
    expect(rows[0]?.definition).toMatch(/WHERE \(+status <> 'cancelled'/);
  });

  it('laesst zwei gleichzeitige ueberschneidende Anlagen nicht beide gelingen', async () => {
    // Beide Transaktionen bleiben offen, bis beide eingefuegt haben. Eine
    // Pruefung per SELECT-dann-INSERT wuerde hier beide durchlassen.
    const a = new Client({ connectionString: testDatabaseUrl() });
    const b = new Client({ connectionString: testDatabaseUrl() });
    await a.connect();
    await b.connect();

    async function beginne(c: Client) {
      await c.query('begin');
      await c.query("select set_config('role', 'authenticated', true)");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: users.office, role: 'authenticated' }),
      ]);
    }

    try {
      await beginne(a);
      await beginne(b);

      await a.query(ANLEGEN, args({ von: '09:00', bis: '10:00' }));

      // Die zweite Anlage ueberschneidet sich und blockiert, bis die erste
      // Transaktion entschieden ist.
      const zweite = abgefangen(
        b.query(ANLEGEN, args({ patient: patients.erika, von: '09:30', bis: '10:30' })),
      );

      await a.query('commit');

      const fehler = await zweite;
      expect(fehler, 'die zweite Anlage darf nicht gelingen').not.toBeNull();
      expect(fehler?.message).toMatch(/overlap|exclusion/i);
      await b.query('rollback').catch(() => undefined);

      const { rows } = await asPostgres<{ anzahl: string }>(
        'select count(*)::text as anzahl from public.appointments',
      );
      expect(rows[0]?.anzahl).toBe('1');
    } finally {
      await a.end();
      await b.end();
    }
  });
});

describe('create_appointment: Audit', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    await asPostgres('delete from public.audit_log');
  });

  async function eintrag() {
    const { rows } = await asPostgres<{
      organization_id: string;
      actor_user_id: string;
      action: string;
      subject_type: string;
      subject_id: string;
      outcome: string;
      context: Record<string, unknown>;
    }>("select * from public.audit_log where action = 'appointment.created'");
    return rows;
  }

  it('protokolliert appointment.created mit Akteur, Organisation und Bezug', async () => {
    const id = await anlegenCommitted(users.teamLead, { typ: 'home_visit' });
    const rows = await eintrag();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: organizationId,
      actor_user_id: users.teamLead,
      subject_type: 'appointment',
      subject_id: id,
      outcome: 'success',
    });
  });

  it('enthaelt ausschliesslich zugelassene Kontextschluessel', async () => {
    await anlegenCommitted(users.office, { typ: 'home_visit' });
    const rows = await eintrag();

    expect(Object.keys(rows[0]!.context).sort()).toEqual(
      // treatment_basis_id kam mit CAL-007 dazu und ist eine ID, kein Inhalt;
      // in_the_past mit FIX-019 - ein Kennzeichen, kein Inhalt.
      [
        'patient_id',
        'staff_member_id',
        'surface',
        'outside_working_hours',
        'treatment_basis_id',
        'in_the_past',
      ].sort(),
    );
    expect(rows[0]!.context).toMatchObject({
      surface: 'web',
      patient_id: patients.max,
      staff_member_id: STAFF.anna,
    });
  });

  it('kopiert keine Stammdaten und keine konkreten Terminzeiten in den Kontext', async () => {
    await anlegenCommitted(users.office, { typ: 'home_visit' });
    const rows = await eintrag();
    const serialisiert = JSON.stringify(rows[0]!.context);

    for (const verboten of [
      'Max',
      'Mustermann',
      'Beispielstrasse',
      '72070',
      'Tuebingen',
      '1957-04-30',
      '09:00',
      TAG,
    ]) {
      expect(serialisiert).not.toContain(verboten);
    }
  });

  it('haelt den Ereigniskatalog deckungsgleich mit der Anwendung', async () => {
    const { rows } = await asPostgres<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint where conname = 'audit_log_action_check'`,
    );
    expect(rows[0]?.definition).toContain('appointment.created');
  });
});

// =============================================================================
// Negativfaelle
// =============================================================================

describe('create_appointment: nicht berechtigte Zugriffe', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('weist ein Patientenkonto ab', async () => {
    await expect(anlegen(users.patientMax)).rejects.toThrow(/not allowed/);
  });

  it('weist einen Aufruf ohne Sitzung ab', async () => {
    await expect(anlegen(null)).rejects.toThrow(/not authenticated|not allowed/);
  });

  it('weist anon ab', async () => {
    await expect(asAnon(ANLEGEN, args())).rejects.toThrow(/permission denied|not authenticated/i);
  });

  it('gibt authenticated kein direktes INSERT auf die Termintabelle', async () => {
    await expect(
      asUser(
        users.office,
        `insert into public.appointments
           (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at)
         values ($1, $2, $3, 'video', 'confirmed', now() + interval '1 day', now() + interval '1 day 1 hour')`,
        [organizationId, patients.max, STAFF.anna],
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('gibt authenticated weder UPDATE noch DELETE auf die Termintabelle', async () => {
    const { rows } = await asPostgres<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where table_name = 'appointments' and grantee = 'authenticated'`,
    );
    expect(rows.map((r) => r.privilege_type).sort()).toEqual(['SELECT']);
  });
});

describe('create_appointment: fachliche Pruefungen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('weist einen inaktiven Patienten ab', async () => {
    await expect(anlegen(users.office, { patient: patients.petra })).rejects.toThrow(
      /not in active care/,
    );
  });

  it('weist ein Ende gleich dem Beginn ab', async () => {
    await expect(anlegen(users.office, { von: '09:00', bis: '09:00' })).rejects.toThrow(
      /end time must be after start time/,
    );
  });

  it('weist ein Ende vor dem Beginn ab', async () => {
    await expect(anlegen(users.office, { von: '10:00', bis: '09:00' })).rejects.toThrow(
      /end time must be after start time/,
    );
  });

  it('weist eine unbekannte Terminart ab', async () => {
    await expect(
      asUser(users.office, ANLEGEN, [
        patients.max,
        STAFF.anna,
        'surgery',
        TAG,
        '09:00',
        '10:00',
        null,
      ]),
    ).rejects.toThrow(/unknown appointment type/);
  });

  it('weist einen vergangenen Kalendertag ohne Bestaetigung ab', async () => {
    await expect(anlegen(users.office, { tag: tagInTagen(-1) })).rejects.toThrow(/in the past/);
  });

  // FIX-019, ANN-057: Die Vergangenheit ist erlaubt, aber nie unbemerkt. Die
  // Bestaetigung ist der zehnte Parameter; der Auditeintrag traegt das
  // Kennzeichen, damit ein nachgetragener Termin spaeter als solcher erkennbar
  // bleibt (ADR-010).
  it('nimmt einen vergangenen Kalendertag mit Bestaetigung an und vermerkt ihn im Audit', async () => {
    await asPostgres('delete from public.audit_log');
    const { rows } = await asUserCommitted<{ id: string }>(
      users.office,
      'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true, null, true) as id',
      args({ tag: tagInTagen(-30) }),
    );
    expect(rows[0]!.id).toBeTruthy();

    const audit = await asPostgres<{ context: Record<string, unknown> }>(
      "select context from public.audit_log where action = 'appointment.created'",
    );
    expect(audit.rows[0]!.context).toMatchObject({ in_the_past: true });
  });

  it('vermerkt einen kuenftigen Termin nicht als vergangen', async () => {
    await asPostgres('delete from public.audit_log');
    await anlegenCommitted(users.office, {});
    const audit = await asPostgres<{ context: Record<string, unknown> }>(
      "select context from public.audit_log where action = 'appointment.created'",
    );
    expect(audit.rows[0]!.context).toMatchObject({ in_the_past: false });
  });

  it('erlaubt den laufenden Kalendertag der Praxiszeitzone', async () => {
    const { rows } = await asPostgres<{ heute: string }>(
      "select (now() at time zone 'Europe/Berlin')::date::text as heute",
    );
    const id = await anlegenCommitted(users.office, {
      tag: rows[0]!.heute,
      von: '00:00',
      bis: '01:00',
    });
    expect(await termin(id)).toBeDefined();
  });

  it('weist einen Praxistermin ohne Standort ab', async () => {
    await expect(anlegen(users.office, { typ: 'practice', ort: null })).rejects.toThrow(
      /requires a location/,
    );
  });

  it('weist einen Hausbesuch ohne vollstaendige Adresse ab', async () => {
    // Hausnummer entfernen: die Adresse ist damit fuer eine Anfahrt unbrauchbar.
    await asPostgres(
      'update public.patient_contact_details set house_number = null where patient_id = $1',
      [patients.max],
    );
    try {
      await expect(anlegen(users.office, { typ: 'home_visit' })).rejects.toThrow(
        /complete patient address/,
      );
    } finally {
      await asPostgres(
        "update public.patient_contact_details set house_number = '12' where patient_id = $1",
        [patients.max],
      );
    }
  });

  it('hinterlaesst bei einem Fehler weder Termin noch Erfolgsaudit', async () => {
    await asPostgres('delete from public.audit_log');
    await expect(anlegen(users.office, { patient: patients.petra })).rejects.toThrow();

    const { rows: termine } = await asPostgres<{ anzahl: string }>(
      'select count(*)::text as anzahl from public.appointments',
    );
    const { rows: audits } = await asPostgres<{ anzahl: string }>(
      "select count(*)::text as anzahl from public.audit_log where action = 'appointment.created'",
    );
    expect(termine[0]?.anzahl).toBe('0');
    expect(audits[0]?.anzahl).toBe('0');
  });
});

describe('create_appointment: zuordenbare behandelnde Personen', () => {
  const ownerOhneTherapie = '11111111-1111-4111-8111-0000000000a1';
  const personOwner = '44444444-4444-4444-8444-0000000000a1';
  const staffOwner = '55555555-5555-4555-8555-0000000000a1';
  const personInaktiv = '44444444-4444-4444-8444-0000000000a2';
  const staffInaktiv = '55555555-5555-4555-8555-0000000000a2';
  const userInaktiv = '11111111-1111-4111-8111-0000000000a2';

  beforeAll(async () => {
    await resetDatabase();

    await asPostgres(`
      insert into auth.users (id, email, aud, role) values
        ('${ownerOhneTherapie}', 'oskar.ohnetherapie@praxis.invalid', 'authenticated', 'authenticated'),
        ('${userInaktiv}',       'ida.inaktiv@praxis.invalid',        'authenticated', 'authenticated');

      insert into public.persons (id, organization_id, given_name, family_name) values
        ('${personOwner}',   '${organizationId}', 'Oskar', 'Ohnetherapie'),
        ('${personInaktiv}', '${organizationId}', 'Ida',   'Inaktiv');

      -- Reiner owner: verwaltet, behandelt aber nicht.
      insert into public.staff_members (id, organization_id, person_id, employment_status) values
        ('${staffOwner}',   '${organizationId}', '${personOwner}',   'active'),
        ('${staffInaktiv}', '${organizationId}', '${personInaktiv}', 'inactive');

      insert into public.user_profiles (id, organization_id, person_id, display_name) values
        ('${ownerOhneTherapie}', '${organizationId}', '${personOwner}',   'Oskar Ohnetherapie'),
        ('${userInaktiv}',       '${organizationId}', '${personInaktiv}', 'Ida Inaktiv');

      insert into public.user_roles (user_id, organization_id, role_key) values
        ('${ownerOhneTherapie}', '${organizationId}', 'owner'),
        ('${userInaktiv}',       '${organizationId}', 'therapist');
    `);
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('weist ein Office-Mitglied als behandelnde Person ab', async () => {
    await expect(anlegen(users.office, { staff: STAFF.olivia })).rejects.toThrow(/not assignable/);
  });

  it('weist einen owner ohne therapeutische Zusatzrolle ab', async () => {
    await expect(anlegen(users.office, { staff: staffOwner })).rejects.toThrow(/not assignable/);
  });

  it('weist ein inaktives Mitglied ab, auch mit therapeutischer Rolle', async () => {
    await expect(anlegen(users.office, { staff: staffInaktiv })).rejects.toThrow(/not assignable/);
  });

  it('erzeugt fuer eine unbekannte und eine nicht zuordenbare ID dieselbe Meldung', async () => {
    const unbekannt = await anlegen(users.office, {
      staff: '55555555-5555-4555-8555-00000000ffff',
    }).catch((e: Error) => e.message);
    const office = await anlegen(users.office, { staff: STAFF.olivia }).catch(
      (e: Error) => e.message,
    );
    expect(unbekannt).toBe(office);
  });

  it('ist als Rohfunktion nicht aufrufbar und taugt damit nicht als Existenz-Orakel', async () => {
    // Der Aufrufer wuerde die Organisation selbst mitgeben. Waere die Funktion
    // direkt aufrufbar, liesse sich damit die Existenz fremder Mitarbeitender
    // erfragen (PROJECT_PRINCIPLES.md 13).
    await expect(
      asUser(users.office, 'select app.is_assignable_therapist($1::uuid, $2::uuid)', [
        STAFF.anna,
        organizationId,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('gibt authenticated kein EXECUTE auf die Rohfunktion', async () => {
    const { rows } = await asPostgres<{ erlaubt: boolean }>(
      `select has_function_privilege('authenticated',
                'app.is_assignable_therapist(uuid, uuid)', 'EXECUTE') as erlaubt`,
    );
    expect(rows[0]?.erlaubt).toBe(false);
  });

  it('listet genau die zuordenbaren Mitarbeitenden', async () => {
    const { rows } = await asUser<{ staff_member_id: string; display_name: string }>(
      users.office,
      'select * from public.list_assignable_therapists()',
    );
    const ids = rows.map((r) => r.staff_member_id).sort();
    expect(ids).toEqual([STAFF.jannesOwnerTherapist, STAFF.anna, STAFF.tim].sort());
    expect(ids).not.toContain(STAFF.olivia);
    expect(ids).not.toContain(staffOwner);
    expect(ids).not.toContain(staffInaktiv);
  });

  it('verweigert die Liste einem Patientenkonto', async () => {
    await expect(
      asUser(users.patientMax, 'select * from public.list_assignable_therapists()'),
    ).rejects.toThrow(/not allowed/);
  });

  it('verweigert die Liste ohne Sitzung', async () => {
    await expect(asUser(null, 'select * from public.list_assignable_therapists()')).rejects.toThrow(
      /not authenticated|not allowed/,
    );
  });
});

describe('create_appointment: Mandantentrennung', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000f3';
  const fremderOwner = '11111111-1111-4111-8111-0000000000f3';
  const fremdePerson = '44444444-4444-4444-8444-0000000000f3';
  const fremdePatientPerson = '44444444-4444-4444-8444-0000000000f4';
  const fremderStaff = '55555555-5555-4555-8555-0000000000f3';
  const fremderPatient = '66666666-6666-4666-8666-0000000000f3';
  const fremderOrt = '33333333-3333-4333-8333-0000000000f3';

  let fremderTermin: string;

  beforeAll(async () => {
    await resetDatabase();

    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderOwner}', 'frida.fremd@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name, time_zone)
        values ('${fremdeOrg}', 'Test Praxis Woanders', 'Europe/Berlin');
      insert into public.locations (id, organization_id, name)
        values ('${fremderOrt}', '${fremdeOrg}', 'Standort Woanders');
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

    fremderTermin = await anlegenCommitted(fremderOwner, {
      patient: fremderPatient,
      staff: fremderStaff,
    });
  }, 120_000);

  it('weist einen Patienten einer fremden Organisation ab', async () => {
    await expect(anlegen(users.office, { patient: fremderPatient })).rejects.toThrow(
      /patient not found/,
    );
  });

  it('weist eine behandelnde Person einer fremden Organisation ab', async () => {
    await expect(anlegen(users.office, { staff: fremderStaff })).rejects.toThrow(/not assignable/);
  });

  it('weist einen Standort einer fremden Organisation ab', async () => {
    await expect(anlegen(users.office, { typ: 'practice', ort: fremderOrt })).rejects.toThrow(
      /location not found/,
    );
  });

  it('erzeugt fuer eine unbekannte und eine fremde Patienten-ID dieselbe Meldung', async () => {
    const unbekannt = await anlegen(users.office, {
      patient: '66666666-6666-4666-8666-00000000ffff',
    }).catch((e: Error) => e.message);
    const fremd = await anlegen(users.office, { patient: fremderPatient }).catch(
      (e: Error) => e.message,
    );
    expect(unbekannt).toBe(fremd);
  });

  it('erzeugt fuer einen unbekannten und einen fremden Standort dieselbe Meldung', async () => {
    const unbekannt = await anlegen(users.office, {
      typ: 'practice',
      ort: '33333333-3333-4333-8333-00000000ffff',
    }).catch((e: Error) => e.message);
    const fremd = await anlegen(users.office, { typ: 'practice', ort: fremderOrt }).catch(
      (e: Error) => e.message,
    );
    expect(unbekannt).toBe(fremd);
  });

  it('zeigt den Termin der fremden Praxis nicht in der Terminsicht', async () => {
    const { rows } = await asUser<{ id: string }>(
      users.ownerTherapist,
      'select id from public.appointment_directory where id = $1',
      [fremderTermin],
    );
    expect(rows).toHaveLength(0);
  });

  it('zeigt den Termin der fremden Praxis auch nicht auf der Tabelle', async () => {
    const { rows } = await asUser<{ id: string }>(
      users.ownerTherapist,
      'select id from public.appointments where id = $1',
      [fremderTermin],
    );
    expect(rows).toHaveLength(0);
  });

  it('laesst die fremde Praxis ihren eigenen Termin sehen', async () => {
    const { rows } = await asUser<{ id: string }>(
      fremderOwner,
      'select id from public.appointment_directory where id = $1',
      [fremderTermin],
    );
    expect(rows).toHaveLength(1);
  });
});

describe('appointment_directory: Lesepfad', () => {
  let id: string;

  beforeAll(async () => {
    await resetDatabase();
    id = await anlegenCommitted(users.office, { typ: 'home_visit' });
  }, 120_000);

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('laesst %s den Termin lesen', async (_rolle, userId) => {
    const { rows } = await asUser<{ id: string }>(
      userId,
      'select id from public.appointment_directory where id = $1',
      [id],
    );
    expect(rows).toHaveLength(1);
  });

  it('gibt einem Patientenkonto in diesem Stand keinen Zugriff', async () => {
    const { rows } = await asUser<{ id: string }>(
      users.patientMax,
      'select id from public.appointment_directory where id = $1',
      [id],
    );
    expect(rows).toHaveLength(0);
  });

  it('gibt anon keinen Zugriff', async () => {
    await expect(asAnon('select id from public.appointment_directory')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('liefert die organisatorischen Anzeigefelder samt Praxiszeitzone', async () => {
    const { rows } = await asUser<Record<string, unknown>>(
      users.office,
      'select * from public.appointment_directory where id = $1',
      [id],
    );
    expect(rows[0]).toMatchObject({
      patient_given_name: 'Max',
      patient_family_name: 'Mustermann',
      staff_given_name: 'Anna',
      staff_family_name: 'Beispiel',
      appointment_type: 'home_visit',
      status: 'confirmed',
      organization_time_zone: 'Europe/Berlin',
    });
  });

  it('laeuft mit security_invoker, umgeht die RLS der Basistabellen also nicht', async () => {
    const { rows } = await asPostgres<{ optionen: string[] | null }>(
      "select reloptions as optionen from pg_class where relname = 'appointment_directory'",
    );
    expect(rows[0]?.optionen).toContain('security_invoker=true');
  });
});

describe('organizations.time_zone', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('ist gesetzt und verpflichtend', async () => {
    const { rows } = await asPostgres<{ time_zone: string; is_nullable: string }>(
      `select o.time_zone, c.is_nullable
         from public.organizations o
         join information_schema.columns c
           on c.table_name = 'organizations' and c.column_name = 'time_zone'
        where o.id = $1`,
      [organizationId],
    );
    expect(rows[0]?.time_zone).toBe('Europe/Berlin');
    expect(rows[0]?.is_nullable).toBe('NO');
  });

  it('hat bewusst keinen Datenbank-Default', async () => {
    const { rows } = await asPostgres<{ column_default: string | null }>(
      `select column_default from information_schema.columns
        where table_name = 'organizations' and column_name = 'time_zone'`,
    );
    expect(rows[0]?.column_default).toBeNull();
  });

  it('weist eine unbekannte Zeitzone ab', async () => {
    await expect(
      asPostgres(
        "insert into public.organizations (name, time_zone) values ('Falsch', 'Europe/Berlim')",
      ),
    ).rejects.toThrow(/unknown IANA time zone/);
  });

  it('akzeptiert eine andere gueltige IANA-Zeitzone', async () => {
    const { rows } = await asPostgres<{ time_zone: string }>(
      "insert into public.organizations (name, time_zone) values ('Woanders', 'America/New_York') returning time_zone",
    );
    expect(rows[0]?.time_zone).toBe('America/New_York');
    await asPostgres("delete from public.organizations where name = 'Woanders'");
  });
});

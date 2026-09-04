import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabase,
  testDatabaseUrl,
} from './helpers/db';

/**
 * Mitarbeiterverwaltung (STAFF-001).
 *
 * Geprüft werden die fachlichen und sicherheitsrelevanten Zusagen der drei
 * Schreibvorgänge, die Trennung von Mitarbeiterdatensatz und Zugang, die
 * Erhaltung historischer Bezüge und die serverseitige Durchsetzung des
 * Aktivstatus bei Terminzuweisungen - einschließlich der Nebenläufigkeit.
 */
const { users, organizationId, patients } = SEED;

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

const LOCATION = '33333333-3333-4333-8333-000000000001';

const ANLEGEN =
  'select public.create_staff_member($1, $2, $3, $4, $5::uuid, $6::date, $7, $8, $9, $10, $11) as id';
const AENDERN =
  'select public.update_staff_member($1::uuid, $2, $3, $4, $5, $6::uuid, $7::date, $8, $9, $10, $11, $12) as id';
const STATUS = 'select public.set_staff_employment_status($1::uuid, $2, $3)';
// Termine bewusst mit Arbeitszeitbestaetigung: die Arbeitszeitpruefung hat
// eigene Tests (CAL-005) und waere hier nur Rauschen.
const TERMIN_ANLEGEN =
  "select public.create_appointment($1::uuid, $2::uuid, 'video', $3::date, $4::time, $5::time, null, true) as id";

interface AnlageFelder {
  vorname?: string;
  nachname?: string;
  dienstMail?: string | null;
  dienstTelefon?: string | null;
  standort?: string | null;
  geburtstag?: string | null;
  privatMail?: string | null;
  privatTelefon?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
}

function anlageArgs(f: AnlageFelder = {}): unknown[] {
  return [
    f.vorname ?? 'Nina',
    f.nachname ?? 'Neu',
    f.dienstMail ?? null,
    f.dienstTelefon ?? null,
    f.standort ?? null,
    f.geburtstag ?? null,
    f.privatMail ?? null,
    f.privatTelefon ?? null,
    f.strasse ?? null,
    f.plz ?? null,
    f.ort ?? null,
  ];
}

function aenderArgs(staffId: string, f: AnlageFelder = {}): unknown[] {
  return [staffId, ...anlageArgs(f)];
}

async function anlegen(userId: string, f: AnlageFelder = {}): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(userId, ANLEGEN, anlageArgs(f));
  return rows[0]!.id;
}

async function satz(staffId: string) {
  const { rows } = await asPostgres<{
    employment_status: string;
    person_id: string;
    work_email: string | null;
    work_phone: string | null;
    primary_location_id: string | null;
  }>(
    `select employment_status, person_id, work_email, work_phone, primary_location_id
       from public.staff_members where id = $1`,
    [staffId],
  );
  return rows[0]!;
}

async function auditEintraege(action?: string) {
  const { rows } = await asPostgres<{
    action: string;
    subject_type: string;
    subject_id: string;
    outcome: string;
    context: Record<string, unknown>;
  }>(
    `select action, subject_type, subject_id, outcome, context
       from public.audit_log
      where action like 'staff_member.%' ${action ? 'and action = $1' : ''}
      order by occurred_at, id`,
    action ? [action] : [],
  );
  return rows;
}

/** Liest den aktuellen Stand als Eingabefelder - fuer wertgleiche Aufrufe. */
async function unveraenderteEingabe(staffId: string): Promise<AnlageFelder> {
  const { rows } = await asPostgres<{
    given_name: string;
    family_name: string;
    work_email: string | null;
    work_phone: string | null;
    primary_location_id: string | null;
    date_of_birth: string | null;
    private_email: string | null;
    private_phone: string | null;
    street: string | null;
    postal_code: string | null;
    city: string | null;
  }>(
    `select pe.given_name, pe.family_name, sm.work_email, sm.work_phone, sm.primary_location_id,
            to_char(spd.date_of_birth, 'YYYY-MM-DD') as date_of_birth,
            spd.private_email, spd.private_phone, spd.street, spd.postal_code, spd.city
       from public.staff_members sm
       join public.persons pe on pe.id = sm.person_id
       left join public.staff_private_details spd on spd.staff_member_id = sm.id
      where sm.id = $1`,
    [staffId],
  );
  const r = rows[0]!;
  return {
    vorname: r.given_name,
    nachname: r.family_name,
    dienstMail: r.work_email,
    dienstTelefon: r.work_phone,
    standort: r.primary_location_id,
    geburtstag: r.date_of_birth,
    privatMail: r.private_email,
    privatTelefon: r.private_phone,
    strasse: r.street,
    plz: r.postal_code,
    ort: r.city,
  };
}

/**
 * Aktueller Terminstand mit updated_at als Rohwert.
 *
 * `to_char` statt der Date-Umwandlung des Treibers: der Vergleich in
 * update_appointment / cancel_appointment ist mikrosekundengenau.
 */
async function terminStand(id: string) {
  const { rows } = await asPostgres<{ id: string; updated_at: string; status: string }>(
    `select id, status,
            to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as updated_at
       from public.appointments where id = $1`,
    [id],
  );
  return rows[0]!;
}

/** Kalendertag in der Zeitzone der Praxis, um n Tage verschoben. */
function tagInTagen(tage: number): string {
  const jetzt = new Date();
  const berlin = new Date(jetzt.getTime() + tage * 86_400_000);
  return berlin.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// Berechtigungen
// -----------------------------------------------------------------------------
describe('Mitarbeiterverwaltung: wer darf schreiben', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('erlaubt owner das Anlegen', async () => {
    const id = await anlegen(users.ownerTherapist);
    expect((await satz(id)).employment_status).toBe('active');
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
    ['patient', users.patientMax],
  ])('verweigert %s das Anlegen', async (_rolle, userId) => {
    await expect(asUser(userId, ANLEGEN, anlageArgs())).rejects.toThrow(
      /not allowed to manage staff/,
    );
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('verweigert %s das Aendern, obwohl die Liste lesbar ist', async (_rolle, userId) => {
    // Der Rollenschnitt fuer das Schreiben ist enger als der fuers Lesen.
    const { rows } = await asUser(userId, 'select id from public.staff_directory where id = $1', [
      STAFF.anna,
    ]);
    expect(rows).toHaveLength(1);

    await expect(asUser(userId, AENDERN, aenderArgs(STAFF.anna))).rejects.toThrow(
      /not allowed to manage staff/,
    );
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('verweigert %s den Statuswechsel', async (_rolle, userId) => {
    await expect(asUser(userId, STATUS, [STAFF.anna, 'inactive', false])).rejects.toThrow(
      /not allowed to manage staff/,
    );
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(ANLEGEN, anlageArgs())).rejects.toThrow(/permission denied/i);
    await expect(asAnon(AENDERN, aenderArgs(STAFF.anna))).rejects.toThrow(/permission denied/i);
    await expect(asAnon(STATUS, [STAFF.anna, 'inactive', false])).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('haelt die Tabellen fuer authenticated schreibgeschuetzt', async () => {
    const { rows } = await asPostgres<{ tabelle: string; recht: string; erlaubt: boolean }>(`
      select t.tabelle, p.recht,
             has_table_privilege('authenticated', 'public.' || t.tabelle, p.recht) as erlaubt
      from (values ('persons'), ('staff_members'), ('staff_private_details')) as t (tabelle)
      cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) as p (recht)
    `);
    expect(rows.filter((r) => r.erlaubt)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Organisationsgrenze
// -----------------------------------------------------------------------------
describe('Mitarbeiterverwaltung: Organisationsgrenze', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000ff';
  const fremdePerson = '44444444-4444-4444-8444-0000000000ff';
  const fremderStaff = '55555555-5555-4555-8555-0000000000ff';
  const fremderStandort = '33333333-3333-4333-8333-0000000000ff';

  beforeEach(async () => {
    await resetDatabase();
    await asPostgres(`
      insert into public.organizations (id, name, time_zone)
        values ('${fremdeOrg}', 'Test Praxis Woanders', 'Europe/Berlin');
      insert into public.locations (id, organization_id, name)
        values ('${fremderStandort}', '${fremdeOrg}', 'Standort Woanders');
      insert into public.persons (id, organization_id, given_name, family_name)
        values ('${fremdePerson}', '${fremdeOrg}', 'Frida', 'Fremd');
      insert into public.staff_members (id, organization_id, person_id)
        values ('${fremderStaff}', '${fremdeOrg}', '${fremdePerson}');
    `);
  }, 120_000);

  it('legt ausschliesslich in der eigenen Organisation an', async () => {
    const id = await anlegen(users.ownerTherapist);
    const { rows } = await asPostgres<{ organization_id: string }>(
      'select organization_id from public.staff_members where id = $1',
      [id],
    );
    expect(rows[0]?.organization_id).toBe(organizationId);
  });

  it('weist einen Standort einer fremden Organisation ab', async () => {
    await expect(
      asUser(users.ownerTherapist, ANLEGEN, anlageArgs({ standort: fremderStandort })),
    ).rejects.toThrow(/location not found/);
  });

  it('findet einen fremden Mitarbeiter beim Aendern nicht', async () => {
    await expect(asUser(users.ownerTherapist, AENDERN, aenderArgs(fremderStaff))).rejects.toThrow(
      /staff member not found/,
    );
  });

  it('findet einen fremden Mitarbeiter beim Statuswechsel nicht', async () => {
    await expect(
      asUser(users.ownerTherapist, STATUS, [fremderStaff, 'inactive', false]),
    ).rejects.toThrow(/staff member not found/);
    expect((await satz(fremderStaff)).employment_status).toBe('active');
  });

  it('meldet fuer eine unbekannte und eine fremde ID dasselbe', async () => {
    const unbekannt = '55555555-5555-4555-8555-0000000000ee';
    const fremd = await abgefangen(
      asUser(users.ownerTherapist, STATUS, [fremderStaff, 'inactive', false]),
    );
    const weg = await abgefangen(
      asUser(users.ownerTherapist, STATUS, [unbekannt, 'inactive', false]),
    );
    expect(fremd?.message).toBe(weg?.message);
  });
});

// -----------------------------------------------------------------------------
// Anlage
// -----------------------------------------------------------------------------
describe('create_staff_member', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('legt Person, Mitarbeiterdatensatz und Privatdaten in einem Vorgang an', async () => {
    const id = await anlegen(users.ownerTherapist, {
      vorname: '  Nina  ',
      nachname: '  Neu  ',
      dienstMail: 'nina.neu@praxis.invalid',
      dienstTelefon: '+49 7071 999',
      standort: LOCATION,
      geburtstag: '1995-05-05',
      privatMail: 'nina.privat@beispiel.invalid',
      strasse: 'Neuweg 5',
      plz: '72070',
      ort: 'Tuebingen',
    });

    const s = await satz(id);
    expect(s.work_email).toBe('nina.neu@praxis.invalid');
    expect(s.primary_location_id).toBe(LOCATION);

    const { rows: person } = await asPostgres<{ given_name: string; family_name: string }>(
      'select given_name, family_name from public.persons where id = $1',
      [s.person_id],
    );
    // Fuehrende und nachlaufende Leerzeichen werden serverseitig entfernt.
    expect(person[0]).toEqual({ given_name: 'Nina', family_name: 'Neu' });

    const { rows: privat } = await asPostgres<{ date_of_birth: Date; street: string }>(
      'select date_of_birth, street from public.staff_private_details where staff_member_id = $1',
      [id],
    );
    expect(privat).toHaveLength(1);
    expect(privat[0]?.street).toBe('Neuweg 5');
  });

  it('erzeugt weder Zugang noch Rollen (Person, Mitarbeiter und Konto bleiben getrennt)', async () => {
    const id = await anlegen(users.ownerTherapist);
    const s = await satz(id);

    const { rows: profile } = await asPostgres(
      'select id from public.user_profiles where person_id = $1',
      [s.person_id],
    );
    expect(profile).toEqual([]);

    const { rows: konten } = await asPostgres<{ anzahl: string }>(
      "select count(*) as anzahl from auth.users where email like '%nina%'",
    );
    expect(konten[0]?.anzahl).toBe('0');
  });

  it('macht eine neu angelegte Person nicht automatisch fuer Termine zuordenbar', async () => {
    // Ohne eigenen Zugang mit therapeutischer Rolle bleibt sie ausserhalb der
    // Auswahl. Das ist die bestehende Regel aus CAL-001 und wird hier nur
    // festgehalten, nicht veraendert.
    const id = await anlegen(users.ownerTherapist);
    const { rows } = await asUser<{ staff_member_id: string }>(
      users.office,
      'select staff_member_id from public.list_assignable_therapists()',
    );
    expect(rows.map((r) => r.staff_member_id)).not.toContain(id);
  });

  it('verlangt Vor- und Nachname', async () => {
    await expect(
      asUser(users.ownerTherapist, ANLEGEN, anlageArgs({ vorname: '   ' })),
    ).rejects.toThrow(/given name and family name are required/);
  });

  it('hinterlaesst bei einem Fehler keine verwaiste Person', async () => {
    const vorher = await asPostgres<{ anzahl: string }>(
      'select count(*) as anzahl from public.persons',
    );
    await expect(
      asUser(
        users.ownerTherapist,
        ANLEGEN,
        anlageArgs({ vorname: 'Fehler', standort: '33333333-3333-4333-8333-0000000000ee' }),
      ),
    ).rejects.toThrow(/location not found/);
    const nachher = await asPostgres<{ anzahl: string }>(
      'select count(*) as anzahl from public.persons',
    );
    expect(nachher.rows[0]?.anzahl).toBe(vorher.rows[0]?.anzahl);
  });

  it('protokolliert staff_member.created ohne Stammdaten', async () => {
    const id = await anlegen(users.ownerTherapist, {
      vorname: 'Nina',
      nachname: 'Neu',
      dienstMail: 'nina.neu@praxis.invalid',
      privatTelefon: '+49 7071 4711',
    });

    const eintraege = await auditEintraege('staff_member.created');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]?.subject_type).toBe('staff_member');
    expect(eintraege[0]?.subject_id).toBe(id);
    expect(eintraege[0]?.context).toEqual({ surface: 'web' });

    const roh = JSON.stringify(eintraege[0]);
    for (const wert of ['Nina', 'Neu', 'nina.neu@praxis.invalid', '4711']) {
      expect(roh).not.toContain(wert);
    }
  });

  it('schreibt bei einem abgewiesenen Aufruf keinen Auditeintrag', async () => {
    await expect(asUser(users.office, ANLEGEN, anlageArgs())).rejects.toThrow();
    expect(await auditEintraege()).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Stammdaten aendern
// -----------------------------------------------------------------------------
describe('update_staff_member', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('aendert Name, dienstliche Erreichbarkeit und Standort', async () => {
    await asUserCommitted(
      users.ownerTherapist,
      AENDERN,
      aenderArgs(STAFF.anna, {
        vorname: 'Anna-Lena',
        nachname: 'Beispiel',
        dienstMail: 'anna.neu@praxis.invalid',
        dienstTelefon: '+49 7071 111',
        standort: LOCATION,
      }),
    );

    const s = await satz(STAFF.anna);
    expect(s.work_email).toBe('anna.neu@praxis.invalid');
    const { rows } = await asPostgres<{ given_name: string }>(
      'select given_name from public.persons where id = $1',
      [s.person_id],
    );
    expect(rows[0]?.given_name).toBe('Anna-Lena');
  });

  it('leert ein Optionalfeld auf null statt auf einen leeren Text', async () => {
    await asUserCommitted(
      users.ownerTherapist,
      AENDERN,
      aenderArgs(STAFF.anna, { vorname: 'Anna', nachname: 'Beispiel', dienstMail: '   ' }),
    );
    expect((await satz(STAFF.anna)).work_email).toBeNull();
  });

  it('protokolliert ausschliesslich die Namen der geaenderten Felder', async () => {
    const bestand = await unveraenderteEingabe(STAFF.anna);

    await asUserCommitted(users.ownerTherapist, AENDERN, [
      STAFF.anna,
      ...anlageArgs({ ...bestand, dienstMail: 'anna.neu@praxis.invalid' }),
    ]);

    const eintraege = await auditEintraege('staff_member.updated');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]?.context).toEqual({ surface: 'web', changed_fields: ['work_email'] });
    expect(JSON.stringify(eintraege[0])).not.toContain('anna.neu@praxis.invalid');
  });

  it('nennt bei einer Namensaenderung nur das Feld, nicht den Namen', async () => {
    const bestand = await unveraenderteEingabe(STAFF.anna);

    await asUserCommitted(users.ownerTherapist, AENDERN, [
      STAFF.anna,
      ...anlageArgs({ ...bestand, vorname: 'Anna-Lena' }),
    ]);

    const eintraege = await auditEintraege('staff_member.updated');
    expect(eintraege[0]?.context).toEqual({ surface: 'web', changed_fields: ['name'] });
    expect(JSON.stringify(eintraege[0])).not.toContain('Anna-Lena');
  });

  it('nennt bei einer Privatdatenaenderung nur das Sammelfeld', async () => {
    const bestand = await unveraenderteEingabe(STAFF.anna);

    await asUserCommitted(users.ownerTherapist, AENDERN, [
      STAFF.anna,
      ...anlageArgs({ ...bestand, privatTelefon: '+49 7071 4711' }),
    ]);

    const eintraege = await auditEintraege('staff_member.updated');
    expect(eintraege[0]?.context).toEqual({ surface: 'web', changed_fields: ['private_details'] });
    expect(JSON.stringify(eintraege[0])).not.toContain('4711');
  });

  it('schreibt ohne tatsaechliche Aenderung keinen Auditeintrag', async () => {
    const bestand = await unveraenderteEingabe(STAFF.anna);
    await asUserCommitted(users.ownerTherapist, AENDERN, [STAFF.anna, ...anlageArgs(bestand)]);
    expect(await auditEintraege('staff_member.updated')).toEqual([]);
  });

  it('aendert den Beschaeftigungsstatus nicht mit', async () => {
    await asUserCommitted(users.ownerTherapist, STATUS, [STAFF.anna, 'inactive', true]);
    await asUserCommitted(
      users.ownerTherapist,
      AENDERN,
      aenderArgs(STAFF.anna, { vorname: 'Anna', nachname: 'Beispiel' }),
    );
    expect((await satz(STAFF.anna)).employment_status).toBe('inactive');
  });
});

// -----------------------------------------------------------------------------
// Deaktivieren und Reaktivieren
// -----------------------------------------------------------------------------
describe('set_staff_employment_status', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function terminFuer(staffId: string, tage = 3): Promise<string> {
    const { rows } = await asUserCommitted<{ id: string }>(users.office, TERMIN_ANLEGEN, [
      patients.max,
      staffId,
      tagInTagen(tage),
      '10:00',
      '11:00',
    ]);
    return rows[0]!.id;
  }

  it('deaktiviert und reaktiviert', async () => {
    await asUserCommitted(users.ownerTherapist, STATUS, [STAFF.olivia, 'inactive', false]);
    expect((await satz(STAFF.olivia)).employment_status).toBe('inactive');

    await asUserCommitted(users.ownerTherapist, STATUS, [STAFF.olivia, 'active', false]);
    expect((await satz(STAFF.olivia)).employment_status).toBe('active');
  });

  it('protokolliert beide Richtungen ohne Stammdaten', async () => {
    await asUserCommitted(users.ownerTherapist, STATUS, [STAFF.olivia, 'inactive', false]);
    await asUserCommitted(users.ownerTherapist, STATUS, [STAFF.olivia, 'active', false]);

    const eintraege = await auditEintraege('staff_member.status_changed');
    expect(eintraege.map((e) => e.context)).toEqual([
      { surface: 'web', employment_status: 'inactive', open_future_appointments: 0 },
      { surface: 'web', employment_status: 'active', open_future_appointments: 0 },
    ]);
    expect(JSON.stringify(eintraege)).not.toContain('Olivia');
  });

  it('schreibt bei gleichem Status weder Daten noch Audit', async () => {
    await asUserCommitted(users.ownerTherapist, STATUS, [STAFF.olivia, 'active', false]);
    expect(await auditEintraege()).toEqual([]);
  });

  it('weist einen unbekannten Status ab', async () => {
    await expect(
      asUser(users.ownerTherapist, STATUS, [STAFF.anna, 'gekuendigt', false]),
    ).rejects.toThrow(/unknown employment status/);
  });

  it('fragt bei offenen zukuenftigen Terminen zurueck und schreibt nichts', async () => {
    const termin = await terminFuer(STAFF.anna);

    await expect(
      asUser(users.ownerTherapist, STATUS, [STAFF.anna, 'inactive', false]),
    ).rejects.toThrow(/staff_has_future_appointments/);

    expect((await satz(STAFF.anna)).employment_status).toBe('active');
    const { rows } = await asPostgres<{ status: string; cancelled_at: Date | null }>(
      'select status, cancelled_at from public.appointments where id = $1',
      [termin],
    );
    expect(rows[0]).toMatchObject({ status: 'scheduled', cancelled_at: null });
    expect(await auditEintraege()).toEqual([]);
  });

  it('deaktiviert nach ausdruecklicher Bestaetigung, ohne Termine anzutasten', async () => {
    const termin = await terminFuer(STAFF.anna);

    await asUserCommitted(users.ownerTherapist, STATUS, [STAFF.anna, 'inactive', true]);

    expect((await satz(STAFF.anna)).employment_status).toBe('inactive');
    const { rows } = await asPostgres<{
      status: string;
      cancelled_at: Date | null;
      staff_member_id: string;
    }>('select status, cancelled_at, staff_member_id from public.appointments where id = $1', [
      termin,
    ]);
    expect(rows[0]).toMatchObject({
      status: 'scheduled',
      cancelled_at: null,
      staff_member_id: STAFF.anna,
    });

    const eintraege = await auditEintraege('staff_member.status_changed');
    expect(eintraege[0]?.context).toEqual({
      surface: 'web',
      employment_status: 'inactive',
      open_future_appointments: 1,
    });
  });

  it('braucht fuer einen rein vergangenen Terminbestand keine Bestaetigung', async () => {
    await asPostgres(
      `insert into public.appointments
         (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at)
       values ($1, $2, $3, 'video', 'scheduled', now() - interval '2 days', now() - interval '2 days' + interval '1 hour')`,
      [organizationId, patients.max, STAFF.anna],
    );

    await asUserCommitted(users.ownerTherapist, STATUS, [STAFF.anna, 'inactive', false]);
    expect((await satz(STAFF.anna)).employment_status).toBe('inactive');
  });

  it('zaehlt abgesagte Termine nicht als offen', async () => {
    const termin = await terminFuer(STAFF.anna);
    const stand = await terminStand(termin);
    await asUserCommitted(
      users.office,
      'select public.cancel_appointment($1::uuid, $2::timestamptz)',
      [stand.id, stand.updated_at],
    );

    await asUserCommitted(users.ownerTherapist, STATUS, [STAFF.anna, 'inactive', false]);
    expect((await satz(STAFF.anna)).employment_status).toBe('inactive');
  });

  it('sperrt niemanden aus: der Zugang bleibt beim Deaktivieren unveraendert', async () => {
    await asUserCommitted(users.ownerTherapist, STATUS, [STAFF.olivia, 'inactive', false]);
    const { rows } = await asPostgres<{ is_active: boolean }>(
      `select up.is_active
         from public.user_profiles up
         join public.staff_members sm on sm.person_id = up.person_id
        where sm.id = $1`,
      [STAFF.olivia],
    );
    expect(rows[0]?.is_active).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Aktivstatus bei Terminzuweisungen
// -----------------------------------------------------------------------------
describe('Aktivstatus bei Terminzuweisungen', () => {
  beforeEach(async () => {
    await resetDatabase();
    await asUserCommitted(users.ownerTherapist, STATUS, [STAFF.anna, 'inactive', true]);
  }, 120_000);

  it('weist eine neue Terminzuweisung an eine inaktive Person ab', async () => {
    await expect(
      asUser(users.office, TERMIN_ANLEGEN, [
        patients.max,
        STAFF.anna,
        tagInTagen(4),
        '10:00',
        '11:00',
      ]),
    ).rejects.toThrow(/staff member not assignable/);
  });

  it('nimmt eine inaktive Person aus der Auswahl der behandelnden Personen', async () => {
    const { rows } = await asUser<{ staff_member_id: string }>(
      users.office,
      'select staff_member_id from public.list_assignable_therapists()',
    );
    expect(rows.map((r) => r.staff_member_id)).not.toContain(STAFF.anna);
  });

  it('setzt den Aktivstatus auch am Schema durch, nicht nur in der RPC', async () => {
    // Zweite Verteidigungslinie: ein direkter INSERT umgeht die RPC, nicht
    // aber den Trigger.
    await expect(
      asPostgres(
        `insert into public.appointments
           (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at)
         values ($1, $2, $3, 'video', 'scheduled', now() + interval '5 days', now() + interval '5 days 1 hour')`,
        [organizationId, patients.max, STAFF.anna],
      ),
    ).rejects.toThrow(/staff member is not active/);
  });

  it('verhindert das Umhaengen eines Termins auf eine inaktive Person am Schema', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments
         (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at)
       values ($1, $2, $3, 'video', 'scheduled', now() + interval '6 days', now() + interval '6 days 1 hour')
       returning id`,
      [organizationId, patients.max, STAFF.tim],
    );

    await expect(
      asPostgres('update public.appointments set staff_member_id = $1 where id = $2', [
        STAFF.anna,
        rows[0]!.id,
      ]),
    ).rejects.toThrow(/staff member is not active/);
  });

  it('laesst bestehende Termine einer inaktiven Person absagen und neu zuordnen', async () => {
    // Vor der Deaktivierung angelegt - der Bestand muss beherrschbar bleiben.
    await asPostgres(
      `insert into public.appointments
         (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at)
       values ($1, $2, $3, 'video', 'scheduled', now() + interval '7 days', now() + interval '7 days 1 hour')`,
      [organizationId, patients.max, STAFF.tim],
    );
    await asPostgres('update public.staff_members set employment_status = $1 where id = $2', [
      'inactive',
      STAFF.tim,
    ]);

    const { rows } = await asPostgres<{ id: string }>(
      'select id from public.appointments where staff_member_id = $1',
      [STAFF.tim],
    );
    const stand = await terminStand(rows[0]!.id);

    // Umhaengen auf eine aktive Person bleibt moeglich.
    await asUserCommitted(
      users.office,
      `select public.update_appointment($1::uuid, $2::timestamptz, $3::uuid, 'video',
              (now() at time zone 'Europe/Berlin')::date + 7, '10:00'::time, '11:00'::time, null, true)`,
      [stand.id, stand.updated_at, STAFF.jannes],
    );

    const nachher = await asPostgres<{ staff_member_id: string }>(
      'select staff_member_id from public.appointments where id = $1',
      [stand.id],
    );
    expect(nachher.rows[0]?.staff_member_id).toBe(STAFF.jannes);
  });

  it('laesst einen Termin einer inaktiven Person absagen', async () => {
    await asPostgres(
      `insert into public.appointments
         (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at)
       values ($1, $2, $3, 'video', 'scheduled', now() + interval '8 days', now() + interval '8 days 1 hour')`,
      [organizationId, patients.erika, STAFF.tim],
    );
    await asPostgres('update public.staff_members set employment_status = $1 where id = $2', [
      'inactive',
      STAFF.tim,
    ]);

    const { rows } = await asPostgres<{ id: string }>(
      'select id from public.appointments where staff_member_id = $1',
      [STAFF.tim],
    );
    const stand = await terminStand(rows[0]!.id);
    await asUserCommitted(
      users.office,
      'select public.cancel_appointment($1::uuid, $2::timestamptz)',
      [stand.id, stand.updated_at],
    );

    expect((await terminStand(stand.id)).status).toBe('cancelled');
  });
});

// -----------------------------------------------------------------------------
// Nebenlaeufigkeit
// -----------------------------------------------------------------------------
describe('Nebenlaeufigkeit von Deaktivierung und Terminzuweisung', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function beginne(c: Client, userId: string) {
    await c.query('begin');
    await c.query("select set_config('role', 'authenticated', true)");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
  }

  it('laesst eine Terminanlage nicht an einer bereits deaktivierten Person vorbeilaufen', async () => {
    const a = new Client({ connectionString: testDatabaseUrl() });
    const b = new Client({ connectionString: testDatabaseUrl() });
    await a.connect();
    await b.connect();

    try {
      await beginne(a, users.ownerTherapist);
      await beginne(b, users.office);

      // A deaktiviert und haelt die Sperre auf der Mitarbeiterzeile.
      await a.query('select public.set_staff_employment_status($1::uuid, $2, $3)', [
        STAFF.anna,
        'inactive',
        true,
      ]);

      // B versucht gleichzeitig eine Terminzuweisung. Der Aufruf blockiert an
      // der Zeilensperre und wertet die Zeile nach dem Commit von A neu aus.
      const zweite = abgefangen(
        b.query(TERMIN_ANLEGEN, [patients.max, STAFF.anna, tagInTagen(9), '10:00', '11:00']),
      );

      await a.query('commit');

      const fehler = await zweite;
      expect(fehler, 'die Terminanlage darf nicht gelingen').not.toBeNull();
      expect(fehler?.message).toMatch(/not assignable|not active/i);
      await b.query('rollback').catch(() => undefined);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('laesst eine Deaktivierung einen gleichzeitig angelegten Termin nicht uebersehen', async () => {
    const a = new Client({ connectionString: testDatabaseUrl() });
    const b = new Client({ connectionString: testDatabaseUrl() });
    await a.connect();
    await b.connect();

    try {
      await beginne(a, users.office);
      await beginne(b, users.ownerTherapist);

      // A legt den Termin an und haelt die Zeilensperre auf dem Mitarbeiter.
      await a.query(TERMIN_ANLEGEN, [patients.max, STAFF.anna, tagInTagen(10), '10:00', '11:00']);

      // B deaktiviert gleichzeitig ohne Bestaetigung.
      const zweite = abgefangen(
        b.query('select public.set_staff_employment_status($1::uuid, $2, $3)', [
          STAFF.anna,
          'inactive',
          false,
        ]),
      );

      await a.query('commit');

      const fehler = await zweite;
      expect(fehler, 'die Deaktivierung darf den neuen Termin nicht uebersehen').not.toBeNull();
      expect(fehler?.message).toMatch(/staff_has_future_appointments/);
      await b.query('rollback').catch(() => undefined);

      expect((await satz(STAFF.anna)).employment_status).toBe('active');
    } finally {
      await a.end();
      await b.end();
    }
  });
});

// -----------------------------------------------------------------------------
// Zukuenftige Termine sichtbar machen
// -----------------------------------------------------------------------------
describe('list_staff_future_appointments', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt owner die offenen zukuenftigen Termine der Person', async () => {
    await asUserCommitted(users.office, TERMIN_ANLEGEN, [
      patients.max,
      STAFF.anna,
      tagInTagen(11),
      '10:00',
      '11:00',
    ]);

    const { rows } = await asUser<{ patient_family_name: string }>(
      users.ownerTherapist,
      'select patient_family_name from public.list_staff_future_appointments($1::uuid)',
      [STAFF.anna],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.patient_family_name).toBe('Mustermann');
  });

  it('reicht ueber das 31-Tage-Fenster des Kalenders hinaus', async () => {
    await asPostgres(
      `insert into public.appointments
         (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at)
       values ($1, $2, $3, 'video', 'scheduled', now() + interval '90 days', now() + interval '90 days 1 hour')`,
      [organizationId, patients.max, STAFF.anna],
    );

    const { rows } = await asUser(
      users.ownerTherapist,
      'select id from public.list_staff_future_appointments($1::uuid)',
      [STAFF.anna],
    );
    expect(rows).toHaveLength(1);
  });

  it('zeigt weder vergangene noch abgesagte Termine', async () => {
    await asPostgres(
      `insert into public.appointments
         (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at,
          cancelled_at, cancelled_by)
       values
         ($1, $2, $3, 'video', 'scheduled', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', null, null),
         ($1, $2, $3, 'video', 'cancelled', now() + interval '12 days', now() + interval '12 days 1 hour', now(), $4)`,
      [organizationId, patients.max, STAFF.anna, users.office],
    );

    const { rows } = await asUser(
      users.ownerTherapist,
      'select id from public.list_staff_future_appointments($1::uuid)',
      [STAFF.anna],
    );
    expect(rows).toEqual([]);
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('verweigert %s den Zugriff', async (_rolle, userId) => {
    await expect(
      asUser(userId, 'select id from public.list_staff_future_appointments($1::uuid)', [
        STAFF.anna,
      ]),
    ).rejects.toThrow(/not allowed to manage staff/);
  });
});

// -----------------------------------------------------------------------------
// Lesesicht und Datensparsamkeit
// -----------------------------------------------------------------------------
describe('staff_directory', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt allen Praxisrollen die Liste mit dienstlichen Angaben', async () => {
    for (const userId of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
      const { rows } = await asUser<{ id: string; work_email: string | null }>(
        userId,
        'select id, work_email from public.staff_directory order by family_name',
      );
      expect(rows.length).toBeGreaterThanOrEqual(4);
      expect(rows.some((r) => r.work_email !== null)).toBe(true);
    }
  });

  it('zeigt einem Patientenkonto keine Mitarbeitenden', async () => {
    const { rows } = await asUser(users.patientMax, 'select id from public.staff_directory');
    expect(rows).toEqual([]);
  });

  it('liefert Privatdaten nur an owner und die betroffene Person', async () => {
    const owner = await asUser<{ private_email: string | null }>(
      users.ownerTherapist,
      'select private_email from public.staff_directory where id = $1',
      [STAFF.anna],
    );
    expect(owner.rows[0]?.private_email).not.toBeNull();

    const selbst = await asUser<{ private_email: string | null }>(
      users.therapist,
      'select private_email from public.staff_directory where id = $1',
      [STAFF.anna],
    );
    expect(selbst.rows[0]?.private_email).not.toBeNull();

    for (const userId of [users.office, users.teamLead]) {
      const fremd = await asUser<{ private_email: string | null; date_of_birth: Date | null }>(
        userId,
        'select private_email, date_of_birth from public.staff_directory where id = $1',
        [STAFF.anna],
      );
      // Nicht ausgeliefert und im Client ausgeblendet, sondern gar nicht erst
      // geliefert (PROJECT_PRINCIPLES.md 4.7).
      expect(fremd.rows[0]?.private_email).toBeNull();
      expect(fremd.rows[0]?.date_of_birth).toBeNull();
    }
  });

  it('ist fuer anon nicht lesbar', async () => {
    await expect(asAnon('select id from public.staff_directory')).rejects.toThrow(
      /permission denied/i,
    );
  });
});

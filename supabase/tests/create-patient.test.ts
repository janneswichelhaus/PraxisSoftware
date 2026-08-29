import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

const { users, organizationId } = SEED;

const ANLEGEN = 'select public.create_patient($1, $2, $3::date, $4, $5, $6, $7, $8, $9) as id';

async function anlegen(
  userId: string | null,
  felder: Partial<{
    given: string;
    family: string;
    dob: string;
    email: string | null;
    phone: string | null;
    street: string | null;
    house: string | null;
    plz: string | null;
    city: string | null;
  }> = {},
) {
  const f = {
    given: 'Neu',
    family: 'Testpatient',
    dob: '1980-03-14',
    email: null,
    phone: null,
    street: null,
    house: null,
    plz: null,
    city: null,
    ...felder,
  };
  return asUser<{ id: string }>(userId, ANLEGEN, [
    f.given,
    f.family,
    f.dob,
    f.email,
    f.phone,
    f.street,
    f.house,
    f.plz,
    f.city,
  ]);
}

/** Wie anlegen, aber die Transaktion bleibt bestehen. */
async function anlegenCommitted(userId: string, given = 'Neu', family = 'Testpatient') {
  const { rows } = await asUserCommitted<{ id: string }>(userId, ANLEGEN, [
    given,
    family,
    '1980-03-14',
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  return rows[0]!.id;
}

describe('create_patient: berechtigte Rollen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('erlaubt %s das Anlegen', async (_rolle, userId) => {
    const { rows } = await anlegen(userId);
    expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('create_patient: unberechtigte Aufrufer', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('verweigert einem Patientenkonto das Anlegen', async () => {
    await expect(anlegen(users.patientMax)).rejects.toThrow(/not allowed to create patients/);
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(
      asAnon(ANLEGEN, ['Neu', 'Testpatient', '1980-03-14', null, null, null, null, null, null]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('verweigert den Aufruf ohne Session', async () => {
    await expect(anlegen(null)).rejects.toThrow(/not authenticated/);
  });

  it('erteilt anon kein EXECUTE-Recht', async () => {
    const { rows } = await asPostgres(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_patient'
        and has_function_privilege('anon', p.oid, 'execute')
    `);
    expect(rows).toEqual([]);
  });

  it('laeuft als SECURITY DEFINER mit leerem search_path', async () => {
    const { rows } = await asPostgres<{ prosecdef: boolean; proconfig: string[] | null }>(`
      select p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_patient'
    `);
    expect(rows[0]?.prosecdef).toBe(true);
    expect(rows[0]?.proconfig).toContain('search_path=""');
  });

  it('gibt authenticated weiterhin kein direktes INSERT-Recht', async () => {
    const { rows } = await asPostgres<{ table_name: string }>(`
      select table_name from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    `);
    expect(rows).toEqual([]);
  });
});

describe('create_patient: erzeugter Datensatz', () => {
  let patientId: string;

  beforeAll(async () => {
    await resetDatabase();
    patientId = await anlegenCommitted(users.office, 'Nora', 'Neuzugang');
  }, 120_000);

  it('verknuepft Person, Patient und Kontaktdaten vollstaendig', async () => {
    const { rows } = await asPostgres<{
      given_name: string;
      family_name: string;
      status: string;
      date_of_birth: Date;
      person_org: string;
      contact_org: string;
    }>(
      `select pe.given_name, pe.family_name, p.status, c.date_of_birth,
              pe.organization_id as person_org, c.organization_id as contact_org
       from public.patients p
       join public.persons pe on pe.id = p.person_id
       join public.patient_contact_details c on c.patient_id = p.id
       where p.id = $1`,
      [patientId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.given_name).toBe('Nora');
    expect(rows[0]?.family_name).toBe('Neuzugang');
    expect(rows[0]?.status).toBe('active');
    expect(rows[0]?.person_org).toBe(organizationId);
    expect(rows[0]?.contact_org).toBe(organizationId);
  });

  it('setzt created_by auf den handelnden Account', async () => {
    const { rows } = await asPostgres<{ created_by: string }>(
      'select created_by from public.patients where id = $1',
      [patientId],
    );
    expect(rows[0]?.created_by).toBe(users.office);
  });

  it('macht den neuen Patienten fuer die Praxisrollen lesbar', async () => {
    const { rows } = await asUser<{ family_name: string }>(
      users.therapist,
      'select family_name from public.patient_directory where id = $1',
      [patientId],
    );
    expect(rows[0]?.family_name).toBe('Neuzugang');
  });

  it('legt den Patienten in der Organisation des Aufrufers an', async () => {
    const { rows } = await asUser<{ id: string }>(
      users.ownerTherapist,
      'select id from public.patients where organization_id = $1 and id = $2',
      [organizationId, patientId],
    );
    expect(rows).toHaveLength(1);
  });

  it('bleibt fuer fremde Patientenkonten unsichtbar', async () => {
    const { rows } = await asUser(
      users.patientMax,
      'select id from public.patients where id = $1',
      [patientId],
    );
    expect(rows).toEqual([]);
  });

  it('normalisiert Eingaben: trimmt Namen, leere Optionalfelder werden null', async () => {
    const { rows: angelegt } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
      '  Lea  ',
      '  Leerfeld  ',
      '1975-01-02',
      '   ',
      '',
      '   ',
      null,
      '',
      '  Tuebingen  ',
    ]);
    const id = angelegt[0]!.id;

    const { rows } = await asPostgres<Record<string, string | null>>(
      `select pe.given_name, pe.family_name, c.email, c.phone, c.street, c.house_number, c.postal_code, c.city
       from public.patients p
       join public.persons pe on pe.id = p.person_id
       join public.patient_contact_details c on c.patient_id = p.id
       where p.id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({
      given_name: 'Lea',
      family_name: 'Leerfeld',
      email: null,
      phone: null,
      street: null,
      house_number: null,
      postal_code: null,
      city: 'Tuebingen',
    });
  });
});

describe('create_patient: Eingabepruefung serverseitig', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('lehnt leere Namen ab, auch wenn nur Leerzeichen uebergeben werden', async () => {
    await expect(anlegen(users.office, { given: '   ' })).rejects.toThrow(/are required/);
    await expect(anlegen(users.office, { family: '' })).rejects.toThrow(/are required/);
  });

  it('lehnt ein Geburtsdatum in der Zukunft ab', async () => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await expect(anlegen(users.office, { dob: morgen })).rejects.toThrow(
      /must not be in the future/,
    );
  });

  it('lehnt eine ungueltige E-Mail ab', async () => {
    await expect(anlegen(users.office, { email: 'kein-at-zeichen' })).rejects.toThrow();
  });
});

describe('create_patient: Atomaritaet', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres("delete from public.persons where family_name = 'Rollbacktest'");
  });

  it('hinterlaesst bei einem Fehler im letzten Schritt keinen Teildatensatz', async () => {
    // Die E-Mail verletzt die CHECK-Constraint auf patient_contact_details -
    // also erst NACH dem Anlegen von Person und Patient.
    await expect(
      asPostgres(
        `begin;
         select set_config('role', 'authenticated', true);
         select set_config('request.jwt.claims', '{"sub":"${users.office}","role":"authenticated"}', true);
         select public.create_patient('Ruth', 'Rollbacktest', '1980-03-14'::date,
           'ungueltige-adresse', null, null, null, null, null);
         commit;`,
      ),
    ).rejects.toThrow();

    const person = await asPostgres(
      "select id from public.persons where family_name = 'Rollbacktest'",
    );
    const kontakt = await asPostgres(
      "select patient_id from public.patient_contact_details c where c.email = 'ungueltige-adresse'",
    );
    expect(person.rows).toEqual([]);
    expect(kontakt.rows).toEqual([]);
  });

  it('hinterlaesst bei fehlender Berechtigung gar nichts', async () => {
    await expect(anlegen(users.patientMax, { family: 'Rollbacktest' })).rejects.toThrow();
    const { rows } = await asPostgres(
      "select id from public.persons where family_name = 'Rollbacktest'",
    );
    expect(rows).toEqual([]);
  });
});

describe('create_patient: Audit', () => {
  let patientId: string;

  beforeAll(async () => {
    await resetDatabase();
    await asPostgres('delete from public.audit_log');
    patientId = await anlegenCommitted(users.teamLead, 'Aud', 'Ittest');
  }, 120_000);

  it('erzeugt genau ein patient.created-Ereignis mit Akteur, Organisation und Bezug', async () => {
    const { rows } = await asPostgres<{
      action: string;
      actor_user_id: string;
      organization_id: string;
      subject_type: string;
      subject_id: string;
      outcome: string;
      occurred_at: Date;
    }>("select * from public.audit_log where action = 'patient.created'");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_user_id).toBe(users.teamLead);
    expect(rows[0]?.organization_id).toBe(organizationId);
    expect(rows[0]?.subject_type).toBe('patient');
    expect(rows[0]?.subject_id).toBe(patientId);
    expect(rows[0]?.outcome).toBe('success');
    expect(rows[0]?.occurred_at).toBeInstanceOf(Date);
  });

  it('kopiert keine Stammdaten in den Auditinhalt', async () => {
    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      "select context from public.audit_log where action = 'patient.created'",
    );
    const inhalt = JSON.stringify(rows[0]?.context);
    expect(rows[0]?.context).toEqual({ surface: 'web' });
    for (const stammdatum of ['Aud', 'Ittest', '1980-03-14']) {
      expect(inhalt).not.toContain(stammdatum);
    }
  });

  it('zeigt das Ereignis im owner-Lesepfad', async () => {
    const { rows } = await asUser<{ action: string; subject_id: string }>(
      users.ownerTherapist,
      "select action, subject_id from public.list_audit_events(null, null, null, 'patient.created')",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject_id).toBe(patientId);
  });
});

describe('create_patient: Mandantentrennung', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000f1';
  const fremderOwner = '11111111-1111-4111-8111-0000000000f1';
  const fremdePerson = '44444444-4444-4444-8444-0000000000f1';

  beforeAll(async () => {
    await resetDatabase();
    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderOwner}', 'frida.fremd@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name) values ('${fremdeOrg}', 'Test Praxis Woanders');
      insert into public.persons (id, organization_id, given_name, family_name)
        values ('${fremdePerson}', '${fremdeOrg}', 'Frida', 'Fremd');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('${fremderOwner}', '${fremdeOrg}', '${fremdePerson}', 'Frida Fremd');
      insert into public.user_roles (user_id, organization_id, role_key)
        values ('${fremderOwner}', '${fremdeOrg}', 'owner');
    `);
  }, 120_000);

  it('nimmt gar keine organization_id entgegen - Einschleusung ist strukturell unmoeglich', async () => {
    const { rows } = await asPostgres<{ args: string }>(`
      select pg_get_function_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_patient'
    `);
    const args = rows[0]?.args ?? '';
    expect(args).not.toMatch(/organization/i);
    // Auch keine ID-Parameter: die Schluessel erzeugt die Funktion selbst.
    expect(args).not.toMatch(/uuid/i);
  });

  it('legt einen Patienten immer in der Organisation des Aufrufers an', async () => {
    const fremderPatient = await anlegenCommitted(fremderOwner, 'Peter', 'Fremdneu');
    const { rows } = await asPostgres<{ organization_id: string }>(
      'select organization_id from public.patients where id = $1',
      [fremderPatient],
    );
    expect(rows[0]?.organization_id).toBe(fremdeOrg);

    // Und er bleibt fuer die Testpraxis unsichtbar.
    const sichtbar = await asUser(
      users.ownerTherapist,
      'select id from public.patients where id = $1',
      [fremderPatient],
    );
    expect(sichtbar.rows).toEqual([]);
  });

  it('protokolliert das Ereignis in der Organisation des Aufrufers', async () => {
    const { rows } = await asPostgres<{ organization_id: string }>(
      "select distinct organization_id from public.audit_log where action = 'patient.created'",
    );
    expect(rows.map((r) => r.organization_id)).toEqual([fremdeOrg]);

    // Der owner der Testpraxis sieht dieses Ereignis nicht.
    const fremdSicht = await asUser(
      users.ownerTherapist,
      "select id from public.list_audit_events(null, null, null, 'patient.created')",
    );
    expect(fremdSicht.rows).toEqual([]);
  });
});

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

const { users, organizationId, patients } = SEED;

const ANLEGEN = 'select public.create_patient($1, $2, $3::date, $4, $5, $6, $7, $8, $9) as id';
const AENDERN =
  'select public.update_patient($1::uuid, $2, $3, $4::date, $5, $6, $7, $8, $9, $10) as id';

interface Stammdaten {
  given: string;
  family: string;
  dob: string;
  email: string | null;
  phone: string | null;
  street: string | null;
  house: string | null;
  plz: string | null;
  city: string | null;
}

const AUSGANG: Stammdaten = {
  given: 'Berta',
  family: 'Bestand',
  dob: '1970-05-06',
  email: 'berta.bestand@example.invalid',
  phone: '0221 111111',
  street: 'Altstrasse',
  house: '1',
  plz: '50667',
  city: 'Koeln',
};

function args(patientId: string, felder: Partial<Stammdaten> = {}) {
  const f = { ...AUSGANG, ...felder };
  return [patientId, f.given, f.family, f.dob, f.email, f.phone, f.street, f.house, f.plz, f.city];
}

/** Legt einen Patienten mit den Ausgangsstammdaten an; die Transaktion bleibt bestehen. */
async function bestandsPatient(userId: string = users.office): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(userId, ANLEGEN, [
    AUSGANG.given,
    AUSGANG.family,
    AUSGANG.dob,
    AUSGANG.email,
    AUSGANG.phone,
    AUSGANG.street,
    AUSGANG.house,
    AUSGANG.plz,
    AUSGANG.city,
  ]);
  return rows[0]!.id;
}

/** Aendert zurueckgerollt - fuer Berechtigungs- und Fehlerfaelle. */
function aendern(userId: string | null, patientId: string, felder: Partial<Stammdaten> = {}) {
  return asUser<{ id: string }>(userId, AENDERN, args(patientId, felder));
}

/** Aendert bestaetigt - fuer Faelle, deren Ergebnis anschliessend geprueft wird. */
function aendernCommitted(userId: string, patientId: string, felder: Partial<Stammdaten> = {}) {
  return asUserCommitted<{ id: string }>(userId, AENDERN, args(patientId, felder));
}

describe('update_patient: berechtigte Rollen', () => {
  let patientId: string;

  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    patientId = await bestandsPatient();
  });

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('erlaubt %s das Aendern', async (rolle, userId) => {
    await aendernCommitted(userId, patientId, { family: `Geaendert-${rolle}` });

    const { rows } = await asPostgres<{ family_name: string }>(
      'select pe.family_name from public.patients p join public.persons pe on pe.id = p.person_id where p.id = $1',
      [patientId],
    );
    expect(rows[0]?.family_name).toBe(`Geaendert-${rolle}`);
  });
});

describe('update_patient: unberechtigte Aufrufer', () => {
  let patientId: string;

  beforeAll(async () => {
    await resetDatabase();
    patientId = await bestandsPatient();
  }, 120_000);

  it('verweigert einem Patientenkonto das Aendern', async () => {
    await expect(aendern(users.patientMax, patientId)).rejects.toThrow(
      /not allowed to update patients/,
    );
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(AENDERN, args(patientId))).rejects.toThrow(/permission denied/i);
  });

  it('verweigert den Aufruf ohne Session', async () => {
    await expect(aendern(null, patientId)).rejects.toThrow(/not authenticated/);
  });

  it('erteilt anon kein EXECUTE-Recht', async () => {
    const { rows } = await asPostgres(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'update_patient'
        and has_function_privilege('anon', p.oid, 'execute')
    `);
    expect(rows).toEqual([]);
  });

  it('laeuft als SECURITY DEFINER mit leerem search_path', async () => {
    const { rows } = await asPostgres<{ prosecdef: boolean; proconfig: string[] | null }>(`
      select p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'update_patient'
    `);
    expect(rows[0]?.prosecdef).toBe(true);
    expect(rows[0]?.proconfig).toContain('search_path=""');
  });

  it('gibt authenticated weiterhin kein direktes UPDATE-Recht', async () => {
    const { rows } = await asPostgres<{ table_name: string }>(`
      select table_name from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    `);
    expect(rows).toEqual([]);
  });

  it('hinterlaesst bei fehlender Berechtigung keine Aenderung', async () => {
    await expect(aendern(users.patientMax, patientId, { family: 'Unerlaubt' })).rejects.toThrow();
    const { rows } = await asPostgres(
      "select id from public.persons where family_name = 'Unerlaubt'",
    );
    expect(rows).toEqual([]);
  });
});

describe('update_patient: geaenderter Datensatz', () => {
  let patientId: string;

  beforeAll(async () => {
    await resetDatabase();
    patientId = await bestandsPatient();
    await aendernCommitted(users.therapist, patientId, {
      given: '  Bertha  ',
      family: '  Bestandt  ',
      dob: '1970-05-07',
      email: 'bertha.bestandt@example.invalid',
      phone: '0221 222222',
      street: 'Neustrasse',
      house: '2a',
      plz: '50668',
      city: 'Bonn',
    });
  }, 120_000);

  it('schreibt Person und Kontaktdaten gemeinsam und trimmt die Namen', async () => {
    const { rows } = await asPostgres<Record<string, string | Date | null>>(
      `select pe.given_name, pe.family_name, c.date_of_birth, c.email, c.phone,
              c.street, c.house_number, c.postal_code, c.city
       from public.patients p
       join public.persons pe on pe.id = p.person_id
       join public.patient_contact_details c on c.patient_id = p.id
       where p.id = $1`,
      [patientId],
    );
    expect(rows[0]?.given_name).toBe('Bertha');
    expect(rows[0]?.family_name).toBe('Bestandt');
    expect(rows[0]?.email).toBe('bertha.bestandt@example.invalid');
    expect(rows[0]?.phone).toBe('0221 222222');
    expect(rows[0]?.street).toBe('Neustrasse');
    expect(rows[0]?.house_number).toBe('2a');
    expect(rows[0]?.postal_code).toBe('50668');
    expect(rows[0]?.city).toBe('Bonn');
  });

  it('macht die geaenderten Werte ueber patient_directory lesbar', async () => {
    const { rows } = await asUser<{ given_name: string; family_name: string; city: string }>(
      users.office,
      'select given_name, family_name, city from public.patient_directory where id = $1',
      [patientId],
    );
    expect(rows[0]).toMatchObject({
      given_name: 'Bertha',
      family_name: 'Bestandt',
      city: 'Bonn',
    });
  });

  it('laesst Status und Organisation unveraendert', async () => {
    const { rows } = await asPostgres<{ status: string; organization_id: string }>(
      'select status, organization_id from public.patients where id = $1',
      [patientId],
    );
    expect(rows[0]?.status).toBe('active');
    expect(rows[0]?.organization_id).toBe(organizationId);
  });
});

describe('update_patient: geleerte Optionalfelder', () => {
  let patientId: string;

  beforeAll(async () => {
    await resetDatabase();
    patientId = await bestandsPatient();
    await aendernCommitted(users.office, patientId, {
      email: '',
      phone: '   ',
      street: '',
      house: null,
      plz: '  ',
      city: '',
    });
  }, 120_000);

  it('speichert geleerte Optionalfelder als null, nicht als leeren String', async () => {
    const { rows } = await asPostgres<Record<string, string | null>>(
      `select c.email, c.phone, c.street, c.house_number, c.postal_code, c.city
       from public.patient_contact_details c where c.patient_id = $1`,
      [patientId],
    );
    expect(rows[0]).toEqual({
      email: null,
      phone: null,
      street: null,
      house_number: null,
      postal_code: null,
      city: null,
    });
  });

  it('laesst die Pflichtfelder bestehen', async () => {
    const { rows } = await asPostgres<{ given_name: string; date_of_birth: Date }>(
      `select pe.given_name, c.date_of_birth
       from public.patients p
       join public.persons pe on pe.id = p.person_id
       join public.patient_contact_details c on c.patient_id = p.id
       where p.id = $1`,
      [patientId],
    );
    expect(rows[0]?.given_name).toBe('Berta');
    expect(rows[0]?.date_of_birth).toBeInstanceOf(Date);
  });
});

describe('update_patient: Eingabepruefung serverseitig', () => {
  let patientId: string;

  beforeAll(async () => {
    await resetDatabase();
    patientId = await bestandsPatient();
  }, 120_000);

  it('lehnt leere Namen ab, auch wenn nur Leerzeichen uebergeben werden', async () => {
    await expect(aendern(users.office, patientId, { given: '   ' })).rejects.toThrow(
      /are required/,
    );
    await expect(aendern(users.office, patientId, { family: '' })).rejects.toThrow(/are required/);
  });

  it('lehnt ein fehlendes Geburtsdatum ab', async () => {
    await expect(
      asUser(users.office, AENDERN, [
        patientId,
        AUSGANG.given,
        AUSGANG.family,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/date_of_birth is required/);
  });

  it('lehnt ein Geburtsdatum in der Zukunft ab', async () => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await expect(aendern(users.office, patientId, { dob: morgen })).rejects.toThrow(
      /must not be in the future/,
    );
  });

  it('lehnt eine ungueltige E-Mail ab', async () => {
    await expect(aendern(users.office, patientId, { email: 'kein-at-zeichen' })).rejects.toThrow();
  });
});

describe('update_patient: unbekannte und fremde Patienten', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000f2';
  const fremderOwner = '11111111-1111-4111-8111-0000000000f2';
  const fremdePerson = '44444444-4444-4444-8444-0000000000f2';
  const unbekannt = '66666666-6666-4666-8666-00000000ffff';
  let fremderPatient: string;

  beforeAll(async () => {
    await resetDatabase();
    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderOwner}', 'frida.fremd@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name, time_zone) values ('${fremdeOrg}', 'Test Praxis Woanders', 'Europe/Berlin');
      insert into public.persons (id, organization_id, given_name, family_name)
        values ('${fremdePerson}', '${fremdeOrg}', 'Frida', 'Fremd');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('${fremderOwner}', '${fremdeOrg}', '${fremdePerson}', 'Frida Fremd');
      insert into public.user_roles (user_id, organization_id, role_key)
        values ('${fremderOwner}', '${fremdeOrg}', 'owner');
    `);
    fremderPatient = await bestandsPatient(fremderOwner);
  }, 120_000);

  it('erzeugt fuer eine unbekannte und eine fremde ID dieselbe Meldung', async () => {
    const unbekanntFehler = await aendern(users.office, unbekannt).catch((e: Error) => e.message);
    const fremdFehler = await aendern(users.office, fremderPatient).catch((e: Error) => e.message);

    expect(unbekanntFehler).toBe('patient not found');
    expect(fremdFehler).toBe(unbekanntFehler);
  });

  it('laesst den Patienten der fremden Praxis unveraendert', async () => {
    await expect(
      aendern(users.ownerTherapist, fremderPatient, { family: 'Uebergriff' }),
    ).rejects.toThrow(/patient not found/);

    const { rows } = await asPostgres<{ family_name: string }>(
      'select pe.family_name from public.patients p join public.persons pe on pe.id = p.person_id where p.id = $1',
      [fremderPatient],
    );
    expect(rows[0]?.family_name).toBe('Bestand');
  });

  it('nimmt keine organization_id entgegen - Einschleusung ist strukturell unmoeglich', async () => {
    const { rows } = await asPostgres<{ args: string }>(`
      select pg_get_function_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'update_patient'
    `);
    const argumente = rows[0]?.args ?? '';
    expect(argumente).not.toMatch(/organization/i);
    // Genau ein ID-Parameter: der Zielpatient. Alles andere leitet die
    // Funktion aus der Sitzung ab.
    expect(argumente.match(/uuid/gi)).toHaveLength(1);
  });
});

describe('update_patient: Atomaritaet', () => {
  let patientId: string;

  beforeAll(async () => {
    await resetDatabase();
    patientId = await bestandsPatient();
  }, 120_000);

  it('hinterlaesst bei einem Fehler im zweiten Schritt keinen halb geaenderten Datensatz', async () => {
    // Der Name ist gueltig, die PLZ verletzt die CHECK-Constraint auf
    // patient_contact_details - der Fehler faellt also NACH dem Update auf
    // persons an.
    await expect(
      asPostgres(
        `begin;
         select set_config('role', 'authenticated', true);
         select set_config('request.jwt.claims', '{"sub":"${users.office}","role":"authenticated"}', true);
         select public.update_patient('${patientId}'::uuid, 'Halb', 'Geaendert', '1970-05-06'::date,
           null, null, null, null, 'x', null);
         commit;`,
      ),
    ).rejects.toThrow();

    const { rows } = await asPostgres<Record<string, string | null>>(
      `select pe.given_name, pe.family_name, c.postal_code
       from public.patients p
       join public.persons pe on pe.id = p.person_id
       join public.patient_contact_details c on c.patient_id = p.id
       where p.id = $1`,
      [patientId],
    );
    expect(rows[0]).toEqual({
      given_name: 'Berta',
      family_name: 'Bestand',
      postal_code: '50667',
    });
  });

  it('schreibt bei einem Fehler auch keinen Auditeintrag', async () => {
    const { rows } = await asPostgres(
      "select id from public.audit_log where action = 'patient.updated' and subject_id = $1",
      [patientId],
    );
    expect(rows).toEqual([]);
  });
});

describe('update_patient: Audit', () => {
  let patientId: string;

  beforeAll(async () => {
    await resetDatabase();
    await asPostgres('delete from public.audit_log');
    patientId = await bestandsPatient();
    await aendernCommitted(users.teamLead, patientId, { family: 'Auditiert', city: 'Aachen' });
  }, 120_000);

  it('erzeugt genau ein patient.updated-Ereignis mit Akteur, Organisation und Bezug', async () => {
    const { rows } = await asPostgres<{
      actor_user_id: string;
      organization_id: string;
      subject_type: string;
      subject_id: string;
      outcome: string;
      occurred_at: Date;
    }>("select * from public.audit_log where action = 'patient.updated'");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_user_id).toBe(users.teamLead);
    expect(rows[0]?.organization_id).toBe(organizationId);
    expect(rows[0]?.subject_type).toBe('patient');
    expect(rows[0]?.subject_id).toBe(patientId);
    expect(rows[0]?.outcome).toBe('success');
    expect(rows[0]?.occurred_at).toBeInstanceOf(Date);
  });

  it('haelt genau die tatsaechlich geaenderten Feldnamen fest', async () => {
    const { rows } = await asPostgres<{
      context: { surface?: string; changed_fields?: string[] };
    }>("select context from public.audit_log where action = 'patient.updated'");
    const kontext = rows[0]?.context;

    // Der Auditkontext traegt nichts ausser Oberflaeche und Feldnamen.
    expect(Object.keys(kontext ?? {}).sort()).toEqual(['changed_fields', 'surface']);
    expect(kontext?.surface).toBe('web');

    // Genau die geaenderten Felder - nicht mehr, nicht weniger, nicht anders
    // benannt. Die Reihenfolge im Array hat keine fachliche Bedeutung und
    // wird deshalb bewusst nicht mitgeprueft.
    expect([...(kontext?.changed_fields ?? [])].sort()).toEqual(['city', 'family_name']);
  });

  it('kopiert keine Stammdatenwerte in den Auditinhalt', async () => {
    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      "select context from public.audit_log where action = 'patient.updated'",
    );
    const inhalt = JSON.stringify(rows[0]?.context);
    for (const wert of [
      'Berta',
      'Bestand',
      'Auditiert',
      'Aachen',
      'Koeln',
      '1970-05-06',
      '50667',
      '0221 111111',
      'berta.bestand@example.invalid',
    ]) {
      expect(inhalt).not.toContain(wert);
    }
  });

  it('zeigt das Ereignis im owner-Lesepfad', async () => {
    const { rows } = await asUser<{ subject_id: string }>(
      users.ownerTherapist,
      "select subject_id from public.list_audit_events(null, null, null, 'patient.updated')",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject_id).toBe(patientId);
  });
});

describe('update_patient: Absenden ohne Aenderung', () => {
  let patientId: string;

  beforeAll(async () => {
    await resetDatabase();
    patientId = await bestandsPatient();
    await asPostgres('delete from public.audit_log');
    // Exakt dieselben Werte erneut - inklusive Leerraum um die Namen, der
    // serverseitig ohnehin entfernt wird.
    await aendernCommitted(users.office, patientId, { given: '  Berta  ' });
  }, 120_000);

  it('erzeugt kein Auditereignis', async () => {
    const { rows } = await asPostgres(
      "select id from public.audit_log where action = 'patient.updated'",
    );
    expect(rows).toEqual([]);
  });

  it('gibt die Patienten-ID trotzdem zurueck', async () => {
    const { rows } = await aendern(users.office, patientId);
    expect(rows[0]?.id).toBe(patientId);
  });
});

describe('update_patient: Bestandsdaten ohne Kontaktsatz', () => {
  beforeAll(async () => {
    await resetDatabase();
    await asPostgres('delete from public.patient_contact_details where patient_id = $1', [
      patients.petra,
    ]);
    await aendernCommitted(users.office, patients.petra, {
      given: 'Petra',
      family: 'Probe',
      dob: '1960-01-01',
      city: 'Duesseldorf',
    });
  }, 120_000);

  it('legt den fehlenden Kontaktsatz in der Organisation des Patienten an', async () => {
    const { rows } = await asPostgres<{ organization_id: string; city: string }>(
      'select organization_id, city from public.patient_contact_details where patient_id = $1',
      [patients.petra],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.organization_id).toBe(organizationId);
    expect(rows[0]?.city).toBe('Duesseldorf');
  });
});

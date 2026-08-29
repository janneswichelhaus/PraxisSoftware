import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

const { users, organizationId, patients } = SEED;

const SETZEN = 'select public.set_patient_status($1::uuid, $2)';

/** Der Seed fuehrt Max als aktiv und Petra als inaktiv. */
const AKTIV = patients.max;
const INAKTIV = patients.petra;

function setzen(userId: string | null, patientId: string, status: string) {
  return asUser(userId, SETZEN, [patientId, status]);
}

function setzenCommitted(userId: string, patientId: string, status: string) {
  return asUserCommitted(userId, SETZEN, [patientId, status]);
}

async function statusVon(patientId: string): Promise<string | undefined> {
  const { rows } = await asPostgres<{ status: string }>(
    'select status from public.patients where id = $1',
    [patientId],
  );
  return rows[0]?.status;
}

describe('set_patient_status: berechtigte Rollen', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it.each([
    ['owner', users.ownerTherapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('erlaubt %s die Deaktivierung', async (_rolle, userId) => {
    await setzenCommitted(userId, AKTIV, 'inactive');
    expect(await statusVon(AKTIV)).toBe('inactive');
  });

  it.each([
    ['owner', users.ownerTherapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('erlaubt %s die Reaktivierung', async (_rolle, userId) => {
    await setzenCommitted(userId, INAKTIV, 'active');
    expect(await statusVon(INAKTIV)).toBe('active');
  });
});

describe('set_patient_status: unberechtigte Aufrufer', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('verweigert therapist den Statuswechsel, obwohl die Kartei lesbar ist', async () => {
    // Der Rollenschnitt ist hier bewusst enger als beim Anlegen und Aendern.
    const { rows } = await asUser(
      users.therapist,
      'select id from public.patient_directory where id = $1',
      [AKTIV],
    );
    expect(rows).toHaveLength(1);

    await expect(setzen(users.therapist, AKTIV, 'inactive')).rejects.toThrow(
      /not allowed to change patient status/,
    );
  });

  it('verweigert einem Patientenkonto den Statuswechsel', async () => {
    await expect(setzen(users.patientMax, AKTIV, 'inactive')).rejects.toThrow(
      /not allowed to change patient status/,
    );
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(SETZEN, [AKTIV, 'inactive'])).rejects.toThrow(/permission denied/i);
  });

  it('verweigert den Aufruf ohne Session', async () => {
    await expect(setzen(null, AKTIV, 'inactive')).rejects.toThrow(/not authenticated/);
  });

  it('erteilt anon kein EXECUTE-Recht', async () => {
    const { rows } = await asPostgres(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_patient_status'
        and has_function_privilege('anon', p.oid, 'execute')
    `);
    expect(rows).toEqual([]);
  });

  it('laeuft als SECURITY DEFINER mit leerem search_path', async () => {
    const { rows } = await asPostgres<{ prosecdef: boolean; proconfig: string[] | null }>(`
      select p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_patient_status'
    `);
    expect(rows[0]?.prosecdef).toBe(true);
    expect(rows[0]?.proconfig).toContain('search_path=""');
  });

  it('gibt authenticated weiterhin kein direktes UPDATE-Recht', async () => {
    const { rows } = await asPostgres(`
      select table_name from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    `);
    expect(rows).toEqual([]);
  });

  it('laesst den Status bei fehlender Berechtigung unveraendert', async () => {
    await expect(setzen(users.therapist, AKTIV, 'inactive')).rejects.toThrow();
    expect(await statusVon(AKTIV)).toBe('active');
  });
});

describe('set_patient_status: Eingabepruefung', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it.each([['archiviert'], ['ACTIVE'], ['']])(
    'lehnt den unbekannten Status %p ab',
    async (wert) => {
      await expect(setzen(users.office, AKTIV, wert)).rejects.toThrow(/unknown patient status/);
    },
  );

  it('lehnt einen fehlenden Status ab', async () => {
    await expect(asUser(users.office, SETZEN, [AKTIV, null])).rejects.toThrow(
      /unknown patient status/,
    );
  });

  it('prueft den Status, bevor der Patient gesucht wird', async () => {
    // Sonst waere die Reihenfolge der Meldungen ein Hinweis darauf, ob es die
    // ID gibt.
    const unbekannt = '66666666-6666-4666-8666-00000000ffff';
    await expect(setzen(users.office, unbekannt, 'archiviert')).rejects.toThrow(
      /unknown patient status/,
    );
  });
});

describe('set_patient_status: unbekannte und fremde Patienten', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000f3';
  const fremderOwner = '11111111-1111-4111-8111-0000000000f3';
  const fremdePerson = '44444444-4444-4444-8444-0000000000f3';
  const fremderPatient = '66666666-6666-4666-8666-0000000000f3';
  const unbekannt = '66666666-6666-4666-8666-00000000ffff';

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
      insert into public.patients (id, organization_id, person_id, status)
        values ('${fremderPatient}', '${fremdeOrg}', '${fremdePerson}', 'active');
    `);
  }, 120_000);

  it('erzeugt fuer eine unbekannte und eine fremde ID dieselbe Meldung', async () => {
    const unbekanntFehler = await setzen(users.office, unbekannt, 'inactive').catch(
      (e: Error) => e.message,
    );
    const fremdFehler = await setzen(users.office, fremderPatient, 'inactive').catch(
      (e: Error) => e.message,
    );

    expect(unbekanntFehler).toBe('patient not found');
    expect(fremdFehler).toBe(unbekanntFehler);
  });

  it('laesst den Patienten der fremden Praxis unveraendert', async () => {
    await expect(setzen(users.ownerTherapist, fremderPatient, 'inactive')).rejects.toThrow(
      /patient not found/,
    );
    expect(await statusVon(fremderPatient)).toBe('active');
  });

  it('nimmt keine organization_id entgegen', async () => {
    const { rows } = await asPostgres<{ args: string }>(`
      select pg_get_function_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_patient_status'
    `);
    const argumente = rows[0]?.args ?? '';
    expect(argumente).not.toMatch(/organization/i);
    expect(argumente.match(/uuid/gi)).toHaveLength(1);
  });
});

describe('set_patient_status: Audit', () => {
  beforeAll(async () => {
    await resetDatabase();
    await asPostgres('delete from public.audit_log');
    await setzenCommitted(users.teamLead, AKTIV, 'inactive');
  }, 120_000);

  it('erzeugt genau ein patient.status_changed-Ereignis mit Akteur und Bezug', async () => {
    const { rows } = await asPostgres<{
      actor_user_id: string;
      organization_id: string;
      subject_type: string;
      subject_id: string;
      outcome: string;
      occurred_at: Date;
    }>("select * from public.audit_log where action = 'patient.status_changed'");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_user_id).toBe(users.teamLead);
    expect(rows[0]?.organization_id).toBe(organizationId);
    expect(rows[0]?.subject_type).toBe('patient');
    expect(rows[0]?.subject_id).toBe(AKTIV);
    expect(rows[0]?.outcome).toBe('success');
    expect(rows[0]?.occurred_at).toBeInstanceOf(Date);
  });

  it('haelt den neuen Status fest, aber keine Stammdaten', async () => {
    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      "select context from public.audit_log where action = 'patient.status_changed'",
    );
    expect(rows[0]?.context).toEqual({ surface: 'web', status: 'inactive' });

    const inhalt = JSON.stringify(rows[0]?.context);
    for (const stammdatum of ['Max', 'Mustermann', '1957-04-30', 'Tuebingen', '72070']) {
      expect(inhalt).not.toContain(stammdatum);
    }
  });

  it('zeigt das Ereignis im owner-Lesepfad', async () => {
    const { rows } = await asUser<{ subject_id: string }>(
      users.ownerTherapist,
      "select subject_id from public.list_audit_events(null, null, null, 'patient.status_changed')",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject_id).toBe(AKTIV);
  });
});

describe('set_patient_status: Wechsel ohne Aenderung', () => {
  beforeAll(async () => {
    await resetDatabase();
    await asPostgres('delete from public.audit_log');
    // Max ist bereits aktiv.
    await setzenCommitted(users.office, AKTIV, 'active');
  }, 120_000);

  it('erzeugt kein Auditereignis', async () => {
    const { rows } = await asPostgres(
      "select id from public.audit_log where action = 'patient.status_changed'",
    );
    expect(rows).toEqual([]);
  });

  it('laesst den Status unveraendert', async () => {
    expect(await statusVon(AKTIV)).toBe('active');
  });
});

describe('set_patient_status: Abgrenzung zu anderen Daten', () => {
  beforeAll(async () => {
    await resetDatabase();
    await setzenCommitted(users.office, AKTIV, 'inactive');
  }, 120_000);

  it('aendert weder Stammdaten noch die Organisationszuordnung', async () => {
    const { rows } = await asPostgres<Record<string, unknown>>(
      `select pe.given_name, pe.family_name, p.organization_id, p.person_id, p.care_started_on,
              c.date_of_birth, c.city
       from public.patients p
       join public.persons pe on pe.id = p.person_id
       join public.patient_contact_details c on c.patient_id = p.id
       where p.id = $1`,
      [AKTIV],
    );
    expect(rows[0]?.given_name).toBe('Max');
    expect(rows[0]?.family_name).toBe('Mustermann');
    expect(rows[0]?.organization_id).toBe(organizationId);
    expect(rows[0]?.city).toBe('Tuebingen');
  });

  it('laesst die Akte fuer die Praxisrollen vollstaendig lesbar', async () => {
    // 'inactive' ist eine organisatorische Markierung, keine Sperre.
    const { rows } = await asUser<{ family_name: string; status: string }>(
      users.therapist,
      'select family_name, status from public.patient_directory where id = $1',
      [AKTIV],
    );
    expect(rows[0]?.family_name).toBe('Mustermann');
    expect(rows[0]?.status).toBe('inactive');
  });
});

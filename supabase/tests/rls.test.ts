import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, resetDatabase } from './helpers/db';

const { users, patients, organizationId } = SEED;

async function sichtbarePatienten(userId: string | null): Promise<string[]> {
  const { rows } = await asUser<{ id: string }>(
    userId,
    'select id from public.patients order by id',
  );
  return rows.map((r) => r.id);
}

/**
 * RLS ist die zweite Verteidigungslinie aus ADR-004. Diese Tests pruefen sie
 * gegen eine echte PostgreSQL-Instanz - nicht gegen ein Mock und nicht ueber
 * die Benutzeroberflaeche. Ausgeblendete UI-Elemente sind keine Autorisierung.
 */
describe('RLS: Patientenkartei', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt owner alle Patienten der Organisation (4.1)', async () => {
    expect(await sichtbarePatienten(users.ownerTherapist)).toEqual(
      [patients.max, patients.erika, patients.petra].sort(),
    );
  });

  it('zeigt therapist alle Patienten der Organisation (4.2, bewusste Entscheidung)', async () => {
    expect(await sichtbarePatienten(users.therapist)).toEqual(
      [patients.max, patients.erika, patients.petra].sort(),
    );
  });

  it('zeigt team_lead alle Patienten der Organisation (4.5)', async () => {
    expect(await sichtbarePatienten(users.teamLead)).toEqual(
      [patients.max, patients.erika, patients.petra].sort(),
    );
  });

  it('zeigt office die organisatorischen Patientenstammdaten (4.3)', async () => {
    expect(await sichtbarePatienten(users.office)).toEqual(
      [patients.max, patients.erika, patients.petra].sort(),
    );
  });

  it('zeigt einem Patienten ausschliesslich den eigenen Kontext (4.6)', async () => {
    expect(await sichtbarePatienten(users.patientMax)).toEqual([patients.max]);
    expect(await sichtbarePatienten(users.patientErika)).toEqual([patients.erika]);
  });

  it('zeigt einem Patienten keine anderen Patienten - auch nicht gezielt abgefragt', async () => {
    const { rows } = await asUser(
      users.patientMax,
      'select id from public.patients where id = $1',
      [patients.erika],
    );
    expect(rows).toEqual([]);
  });

  it('zeigt ohne gueltige Session nichts', async () => {
    expect(await sichtbarePatienten(null)).toEqual([]);
    await expect(asAnon('select id from public.patients')).rejects.toThrow(/permission denied/i);
  });
});

describe('RLS: Personen und Mitarbeiter', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt Praxisrollen alle Personen der Organisation', async () => {
    const { rows } = await asUser<{ n: string }>(
      users.therapist,
      'select count(*)::text as n from public.persons',
    );
    expect(rows[0]?.n).toBe('7');
  });

  it('zeigt einem Patienten ausschliesslich die eigene Person', async () => {
    const { rows } = await asUser<{ id: string }>(
      users.patientMax,
      'select id from public.persons',
    );
    expect(rows.map((r) => r.id)).toEqual([SEED.persons.max]);
  });

  it('verbirgt Mitarbeiterdatensaetze vor Patienten', async () => {
    const { rows } = await asUser(users.patientMax, 'select id from public.staff_members');
    expect(rows).toEqual([]);
  });

  it('zeigt Praxisrollen die Mitarbeiterdatensaetze der Organisation', async () => {
    const { rows } = await asUser(users.office, 'select id from public.staff_members');
    expect(rows).toHaveLength(4);
  });
});

describe('RLS: Accounts und Rollen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt jedem Account das eigene Profil', async () => {
    const { rows } = await asUser<{ id: string }>(
      users.therapist,
      'select id from public.user_profiles',
    );
    expect(rows.map((r) => r.id)).toEqual([users.therapist]);
  });

  it('zeigt owner die Profile der Organisation (4.1)', async () => {
    const { rows } = await asUser(users.ownerTherapist, 'select id from public.user_profiles');
    expect(rows).toHaveLength(6);
  });

  it('zeigt jedem Account nur die eigenen Rollen, owner alle', async () => {
    const eigene = await asUser<{ role_key: string }>(
      users.office,
      'select role_key from public.user_roles',
    );
    expect(eigene.rows.map((r) => r.role_key)).toEqual(['office']);

    const alle = await asUser(users.ownerTherapist, 'select id from public.user_roles');
    expect(alle.rows).toHaveLength(8);
  });

  it('unterstuetzt mehrere Rollen pro Benutzer (ADR-004, ADR-014)', async () => {
    const { rows } = await asUser<{ role_key: string }>(
      users.ownerTherapist,
      'select role_key from public.user_roles where user_id = $1 order by role_key',
      [users.ownerTherapist],
    );
    expect(rows.map((r) => r.role_key)).toEqual(['owner', 'therapist']);
  });
});

describe('Mandantentrennung (ADR-003)', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000ff';
  const fremdePerson = '44444444-4444-4444-8444-0000000000ff';
  const fremderAccount = '11111111-1111-4111-8111-0000000000ff';
  const fremderPatient = '66666666-6666-4666-8666-0000000000ff';
  const fremdePatientPerson = '44444444-4444-4444-8444-0000000000fe';

  beforeAll(async () => {
    await resetDatabase();
    // Zweite, ebenfalls rein synthetische Organisation. Bewusst ohne
    // Parameter, damit die Anweisungen als ein einfacher Batch laufen.
    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderAccount}', 'frida.fremd@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name)
        values ('${fremdeOrg}', 'Test Praxis Woanders');
      insert into public.persons (id, organization_id, given_name, family_name) values
        ('${fremdePerson}', '${fremdeOrg}', 'Frida', 'Fremd'),
        ('${fremdePatientPerson}', '${fremdeOrg}', 'Peter', 'Fremdpatient');
      insert into public.patients (id, organization_id, person_id)
        values ('${fremderPatient}', '${fremdeOrg}', '${fremdePatientPerson}');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('${fremderAccount}', '${fremdeOrg}', '${fremdePerson}', 'Frida Fremd');
      insert into public.user_roles (user_id, organization_id, role_key)
        values ('${fremderAccount}', '${fremdeOrg}', 'therapist');
    `);
  }, 120_000);

  it('zeigt einer fremden Organisation keine Patienten der Testpraxis', async () => {
    expect(await sichtbarePatienten(fremderAccount)).toEqual([fremderPatient]);
  });

  it('zeigt der Testpraxis keine Patienten der fremden Organisation', async () => {
    const sichtbar = await sichtbarePatienten(users.ownerTherapist);
    expect(sichtbar).not.toContain(fremderPatient);
    expect(sichtbar).toHaveLength(3);
  });

  it('zeigt nur die eigene Organisation', async () => {
    const { rows } = await asUser<{ id: string }>(
      users.therapist,
      'select id from public.organizations',
    );
    expect(rows.map((r) => r.id)).toEqual([organizationId]);
  });
});

describe('Audit-Log (ADR-010)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('erlaubt therapist das Protokollieren eines sichtbaren Patienten', async () => {
    await expect(
      asUser(users.therapist, 'select public.log_patient_record_view($1)', [patients.max]),
    ).resolves.toBeDefined();
  });

  it('schreibt einen Eintrag mit Metadaten, wenn die Transaktion bestehen bleibt', async () => {
    await asPostgres(
      `begin;
       select set_config('role', 'authenticated', true);
       select set_config('request.jwt.claims', '{"sub":"${users.therapist}","role":"authenticated"}', true);
       select public.log_patient_record_view('${patients.max}');
       commit;`,
    );
    const { rows } = await asPostgres<{
      action: string;
      actor_user_id: string;
      subject_id: string;
      context: Record<string, unknown>;
    }>('select action, actor_user_id, subject_id, context from public.audit_log');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('patient_record.viewed');
    expect(rows[0]?.actor_user_id).toBe(users.therapist);
    expect(rows[0]?.subject_id).toBe(patients.max);
    expect(rows[0]?.context).toEqual({ surface: 'web' });
    await asPostgres('delete from public.audit_log');
  });

  it('verweigert das Protokollieren fremder Patienten (kein Orakel)', async () => {
    await expect(
      asUser(users.patientMax, 'select public.log_patient_record_view($1)', [patients.erika]),
    ).rejects.toThrow(/not accessible/i);
  });

  it('verweigert das Protokollieren ohne Session', async () => {
    await expect(
      asUser(null, 'select public.log_patient_record_view($1)', [patients.max]),
    ).rejects.toThrow(/not authenticated/i);
    await expect(
      asAnon('select public.log_patient_record_view($1)', [patients.max]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('laesst das Audit-Log durch Anwendungsrollen nicht lesen oder aendern', async () => {
    await expect(asUser(users.ownerTherapist, 'select * from public.audit_log')).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asUser(users.ownerTherapist, 'delete from public.audit_log')).rejects.toThrow(
      /permission denied/i,
    );
  });
});

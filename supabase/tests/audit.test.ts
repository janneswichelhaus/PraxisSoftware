import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, resetDatabase } from './helpers/db';
import { AUDIT_ACTIONS } from '@/features/audit/actions';

const { users, patients, organizationId } = SEED;

/** Fuehrt einen Aufruf aus und behaelt die Aenderungen (kein Rollback). */
async function committedAs(userId: string, sql: string): Promise<void> {
  await asPostgres(
    `begin;
     select set_config('role', 'authenticated', true);
     select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true);
     ${sql};
     commit;`,
  );
}

const LIST = 'select * from public.list_audit_events()';

describe('Audit-Schreibpfad', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.audit_log');
  });

  it('laesst beide Auditfunktionen als SECURITY DEFINER mit leerem search_path laufen', async () => {
    // Ohne festgesetzten search_path koennte ein Aufrufer eigene Objekte
    // vorschieben und die Funktion mit erhoehten Rechten umlenken.
    const { rows } = await asPostgres<{
      proname: string;
      prosecdef: boolean;
      proconfig: string[] | null;
    }>(
      `select p.proname, p.prosecdef, p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('log_patient_record_view', 'list_audit_events')
       order by p.proname`,
    );
    expect(rows).toHaveLength(2);
    for (const fn of rows) {
      expect(fn.prosecdef, fn.proname).toBe(true);
      expect(fn.proconfig, fn.proname).toContain('search_path=""');
    }
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(
      asAnon('select public.log_patient_record_view($1)', [patients.max]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('verweigert den Aufruf ohne Session', async () => {
    await expect(
      asUser(null, 'select public.log_patient_record_view($1)', [patients.max]),
    ).rejects.toThrow(/not authenticated/i);
  });

  it('taugt nicht als Orakel: unbekannte und fremde IDs verhalten sich gleich', async () => {
    const erfunden = '66666666-6666-4666-8666-0000000000aa';
    const fehlerFremd = await asUser(
      users.patientMax,
      'select public.log_patient_record_view($1)',
      [patients.erika],
    ).catch((error: Error) => error.message);
    const fehlerUnbekannt = await asUser(
      users.patientMax,
      'select public.log_patient_record_view($1)',
      [erfunden],
    ).catch((error: Error) => error.message);

    expect(fehlerFremd).toBe(fehlerUnbekannt);
    expect(fehlerFremd).toMatch(/patient not accessible/);
  });

  it('isoliert Organisationen', async () => {
    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('11111111-1111-4111-8111-0000000000fa', 'fremd@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name, time_zone)
        values ('22222222-2222-4222-8222-0000000000fa', 'Test Praxis Woanders', 'Europe/Berlin');
      insert into public.persons (id, organization_id, given_name, family_name)
        values ('44444444-4444-4444-8444-0000000000fa', '22222222-2222-4222-8222-0000000000fa', 'Frida', 'Fremd');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('11111111-1111-4111-8111-0000000000fa', '22222222-2222-4222-8222-0000000000fa', '44444444-4444-4444-8444-0000000000fa', 'Frida Fremd');
      insert into public.user_roles (user_id, organization_id, role_key)
        values ('11111111-1111-4111-8111-0000000000fa', '22222222-2222-4222-8222-0000000000fa', 'owner');
    `);

    await expect(
      asUser('11111111-1111-4111-8111-0000000000fa', 'select public.log_patient_record_view($1)', [
        patients.max,
      ]),
    ).rejects.toThrow(/patient not accessible/);
  });
});

describe('Audit-Lesepfad', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.audit_log');
    await committedAs(users.therapist, `select public.log_patient_record_view('${patients.max}')`);
    await committedAs(users.office, `select public.log_patient_record_view('${patients.erika}')`);
  });

  it('gibt owner die Ereignisse der eigenen Organisation mit Klarnamen zurueck', async () => {
    const { rows } = await asUser<{
      action: string;
      actor_display_name: string;
      subject_id: string;
      outcome: string;
      total_count: string;
    }>(users.ownerTherapist, LIST);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.actor_display_name).sort()).toEqual([
      'Anna Beispiel',
      'Olivia Office',
    ]);
    expect(rows[0]?.action).toBe('patient_record.viewed');
    expect(rows[0]?.outcome).toBe('success');
    expect(rows[0]?.total_count).toBe('2');
  });

  it('gibt die Spalte context grundsaetzlich nicht heraus', async () => {
    const { rows } = await asUser<Record<string, unknown>>(users.ownerTherapist, LIST);
    expect(Object.keys(rows[0] ?? {})).not.toContain('context');
  });

  it('verweigert therapist, team_lead, office und patient den Zugriff', async () => {
    // OPS-004: abgewiesen wird mit null Zeilen statt mit einer Ausnahme, damit
    // der Versuch im Log bestehen bleibt (der naechste Test prueft das).
    for (const user of [users.therapist, users.teamLead, users.office, users.patientMax]) {
      const { rows } = await asUser(user, LIST);
      expect(rows, user).toEqual([]);
    }
  });

  it('protokolliert jeden abgewiesenen Versuch als denied (OPS-004)', async () => {
    const abgewiesen = [users.therapist, users.teamLead, users.office, users.patientMax];
    for (const user of abgewiesen) {
      await committedAs(user, LIST);
    }
    const { rows } = await asPostgres<{
      actor_user_id: string;
      organization_id: string;
      subject_id: string;
      outcome: string;
    }>(
      `select actor_user_id, organization_id, subject_id, outcome
       from public.audit_log where action = 'audit_log.read'`,
    );
    expect(rows.map((r) => r.actor_user_id).sort()).toEqual([...abgewiesen].sort());
    for (const row of rows) {
      expect(row.outcome).toBe('denied');
      expect(row.organization_id).toBe(organizationId);
      expect(row.subject_id).toBe(organizationId);
    }
  });

  it('zeigt owner die abgewiesenen Versuche mit ihrem Ergebnis', async () => {
    await committedAs(users.office, LIST);
    const { rows } = await asUser<{ actor_user_id: string; outcome: string }>(
      users.ownerTherapist,
      'select * from public.list_audit_events(null, null, null, $1)',
      ['audit_log.read'],
    );
    expect(rows).toEqual([
      expect.objectContaining({ actor_user_id: users.office, outcome: 'denied' }),
    ]);
  });

  it('bricht fuer ein Konto ohne Praxis weiter ab - es gibt kein Log, in das der Versuch gehoerte', async () => {
    const ohnePraxis = '11111111-1111-4111-8111-0000000000d1';
    await asPostgres(
      `insert into auth.users (id, email, aud, role)
       values ($1, 'ohne-praxis@example.invalid', 'authenticated', 'authenticated')`,
      [ohnePraxis],
    );
    try {
      await expect(asUser(ohnePraxis, LIST)).rejects.toThrow(/audit log access denied/);
    } finally {
      await asPostgres('delete from auth.users where id = $1', [ohnePraxis]);
    }
  });

  it('laesst den Schreibhelfer fuer abgewiesene Versuche fuer keine Anwendungsrolle ausfuehren', async () => {
    // Sonst liesse sich das Log mit erfundenen denied-Zeilen fuellen.
    const { rows } = await asPostgres<{ rolname: string }>(`
      select r.rolname
      from pg_roles r
      where r.rolname in ('anon', 'authenticated', 'service_role')
        and (
          has_function_privilege(r.oid, 'app.record_denied_owner_read(uuid, text, text)', 'execute')
          or has_function_privilege(r.oid, 'app.record_denied_read(uuid, text, text)', 'execute')
        )
    `);
    expect(rows).toEqual([]);
  });

  it('kennt genau die Pfade, die eine Abweisung ueberleben lassen (OPS-004, G6a, G6b)', async () => {
    // Die Liste ist die Entscheidung aus G6a und G6b: klinische Dokumente nach
    // ADR-010 Punkt 2, die beiden owner-Nachweise und die uebrigen Lesepfade,
    // die die Oberflaeche fuer die abgewiesene Rolle nie aufruft. Bewusst
    // fehlt list_assignable_therapists (BEF-034). Ein neuer Pfad hier ist
    // Absicht, ein fehlender ein Rueckschritt - beides soll ein Review sehen.
    const { rows } = await asPostgres<{ proname: string }>(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'app')
        and p.prosrc ~ 'app\\.record_denied_(owner_)?read\\('
        and p.proname not in ('record_denied_read', 'record_denied_owner_read')
      order by p.proname
    `);
    expect(rows.map((r) => r.proname)).toEqual([
      'check_appointment_slots',
      'count_orphaned_patient_file_objects',
      'get_billable_service_draft',
      'get_invoice',
      'get_payment_reminder',
      'get_treatment_basis',
      'get_treatment_basis_slots',
      'get_treatment_note',
      'get_treatment_note_versions',
      'list_appointments',
      'list_audit_events',
      'list_billable_services',
      'list_day_plan',
      'list_deletion_runs',
      'list_event_participants',
      'list_event_series',
      'list_invoice_candidates',
      'list_invoice_payments',
      'list_invoice_recipients',
      'list_invoice_reminders',
      'list_invoices',
      'list_legal_holds',
      'list_missing_patient_file_objects',
      'list_open_billable_appointments',
      'list_open_items',
      'list_patient_appointment_slip',
      'list_patient_appointments',
      'list_patient_files',
      'list_patient_treatment_bases',
      'list_patient_treatment_bases_clinical',
      'list_patient_treatment_basis_slots',
      'list_patient_treatment_evidence',
      'list_patient_treatment_notes',
      'list_patient_upcoming_appointments',
      'list_payments',
      'list_revenue_by_service_area',
      'list_revenue_years',
      'list_staff_future_appointments',
      'list_storage_deletion_orders',
      'list_text_snippets',
      'search_patients',
    ]);
  });

  it('verweigert den Zugriff ohne Session', async () => {
    await expect(asUser(null, LIST)).rejects.toThrow(/not authenticated/);
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(LIST)).rejects.toThrow(/permission denied/i);
  });

  it('erteilt anon kein EXECUTE-Recht auf den Auditfunktionen', async () => {
    const { rows } = await asPostgres<{ proname: string }>(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('list_audit_events', 'log_patient_record_view')
        and has_function_privilege('anon', p.oid, 'execute')
    `);
    expect(rows).toEqual([]);
  });

  it('gibt weiterhin kein direktes SELECT-Recht auf audit_log', async () => {
    await expect(asUser(users.ownerTherapist, 'select * from public.audit_log')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('filtert nach Zeitraum', async () => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString();
    const { rows } = await asUser(
      users.ownerTherapist,
      'select * from public.list_audit_events($1)',
      [morgen],
    );
    expect(rows).toEqual([]);
  });

  it('filtert nach Benutzer', async () => {
    const { rows } = await asUser<{ actor_user_id: string }>(
      users.ownerTherapist,
      'select * from public.list_audit_events(null, null, $1)',
      [users.office],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_user_id).toBe(users.office);
  });

  it('filtert nach Aktion', async () => {
    const { rows } = await asUser(
      users.ownerTherapist,
      'select * from public.list_audit_events(null, null, null, $1)',
      ['audit_log.read'],
    );
    expect(rows).toEqual([]);
  });

  it('paginiert und meldet die Gesamtzahl', async () => {
    const seite1 = await asUser<{ id: string; total_count: string }>(
      users.ownerTherapist,
      'select * from public.list_audit_events(null, null, null, null, $1, $2)',
      [1, 0],
    );
    const seite2 = await asUser<{ id: string; total_count: string }>(
      users.ownerTherapist,
      'select * from public.list_audit_events(null, null, null, null, $1, $2)',
      [1, 1],
    );
    expect(seite1.rows).toHaveLength(1);
    expect(seite2.rows).toHaveLength(1);
    expect(seite1.rows[0]?.id).not.toBe(seite2.rows[0]?.id);
    expect(seite1.rows[0]?.total_count).toBe('2');
  });

  it('begrenzt ein ueberhoehtes Limit', async () => {
    const { rows } = await asUser(
      users.ownerTherapist,
      'select * from public.list_audit_events(null, null, null, null, $1)',
      [100_000],
    );
    expect(rows.length).toBeLessThanOrEqual(200);
  });

  it('protokolliert den Zugriff auf das Auditlog selbst', async () => {
    await committedAs(users.ownerTherapist, 'select * from public.list_audit_events()');
    const { rows } = await asPostgres<{
      action: string;
      actor_user_id: string;
      subject_id: string;
    }>(
      "select action, actor_user_id, subject_id from public.audit_log where action = 'audit_log.read'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_user_id).toBe(users.ownerTherapist);
    expect(rows[0]?.subject_id).toBe(organizationId);
  });

  it('taugt der Benutzerfilter nicht als Existenz-Orakel', async () => {
    // Ein owner darf ueber den Filter nicht unterscheiden koennen, ob eine
    // Benutzer-ID in einer fremden Organisation existiert oder gar nicht.
    const fremderAccount = '11111111-1111-4111-8111-0000000000e1';
    const fremdeOrg = '22222222-2222-4222-8222-0000000000e1';
    const fremdePerson = '44444444-4444-4444-8444-0000000000e1';
    const erfunden = '11111111-1111-4111-8111-0000000000ee';

    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderAccount}', 'orakel.test@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name, time_zone)
        values ('${fremdeOrg}', 'Test Praxis Orakel', 'Europe/Berlin');
      insert into public.persons (id, organization_id, given_name, family_name)
        values ('${fremdePerson}', '${fremdeOrg}', 'Otto', 'Orakel');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('${fremderAccount}', '${fremdeOrg}', '${fremdePerson}', 'Otto Orakel');
      insert into public.audit_log (organization_id, actor_user_id, action, subject_type, subject_id)
        values ('${fremdeOrg}', '${fremderAccount}', 'patient_record.viewed', 'patient',
                '66666666-6666-4666-8666-0000000000e1');
    `);

    const existierendFremd = await asUser(
      users.ownerTherapist,
      'select * from public.list_audit_events(null, null, $1)',
      [fremderAccount],
    );
    const garNichtVorhanden = await asUser(
      users.ownerTherapist,
      'select * from public.list_audit_events(null, null, $1)',
      [erfunden],
    );

    // Beides muss ununterscheidbar leer sein - kein Fehler, kein Unterschied.
    expect(existierendFremd.rows).toEqual([]);
    expect(garNichtVorhanden.rows).toEqual([]);
  });

  it('zeigt owner keine Ereignisse fremder Organisationen', async () => {
    await asPostgres(`
      insert into public.organizations (id, name, time_zone)
        values ('22222222-2222-4222-8222-0000000000fb', 'Test Praxis Woanders', 'Europe/Berlin');
      insert into public.audit_log (organization_id, actor_user_id, action, subject_type, subject_id)
        values ('22222222-2222-4222-8222-0000000000fb', '11111111-1111-4111-8111-0000000000fb',
                'patient_record.viewed', 'patient', '66666666-6666-4666-8666-0000000000fb');
    `);
    const { rows } = await asUser<{ total_count: string }>(users.ownerTherapist, LIST);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.total_count).toBe('2');
  });
});

describe('Ereigniskatalog', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('haelt Datenbank-Constraint und Oberflaechenkatalog deckungsgleich', async () => {
    const { rows } = await asPostgres<{ def: string }>(`
      select pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      where c.conrelid = 'public.audit_log'::regclass and c.conname = 'audit_log_action_check'
    `);
    const inDatenbank = [...(rows[0]?.def.matchAll(/'([a-z_]+\.[a-z_]+)'/g) ?? [])]
      .map((match) => match[1])
      .sort();
    expect(inDatenbank).toEqual([...AUDIT_ACTIONS].sort());
  });
});

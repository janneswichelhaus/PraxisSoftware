import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asPostgres, resetDatabase } from './helpers/db';

/**
 * Strukturelle Invarianten des Datenmodells.
 *
 * Diese Tests halten die Zusagen aus ADR-014 und ADR-004 fest, damit sie nicht
 * bei der naechsten Migration still verloren gehen.
 */
describe('Schema-Invarianten', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('aktiviert RLS auf jeder Tabelle in public (deny-by-default, ADR-004)', async () => {
    const { rows } = await asPostgres<{ tablename: string; rowsecurity: boolean }>(`
      select tablename, rowsecurity
      from pg_tables
      where schemaname = 'public'
      order by tablename
    `);
    expect(rows.length).toBeGreaterThan(0);
    const ohneRls = rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
    expect(ohneRls).toEqual([]);
  });

  it('verwendet ausschliesslich uuid-Primaerschluessel (ADR-014)', async () => {
    const { rows } = await asPostgres<{ table_name: string; data_type: string }>(`
      select c.table_name, c.data_type
      from information_schema.table_constraints tc
      join information_schema.key_column_usage k
        on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
      join information_schema.columns c
        on c.table_schema = k.table_schema and c.table_name = k.table_name
       and c.column_name = k.column_name
      where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'
    `);
    // Referenzkataloge tragen einen sprechenden Schluessel: roles, und seit
    // LOE-001a der Retention Schedule (Klasse und Tabellenname). Alles
    // Fachliche bleibt uuid.
    const katalogeMitTextschluessel = [
      'roles',
      'retention_classes',
      'retention_assignments',
      'patient_file_document_types',
    ];
    const abweichend = rows.filter(
      (r) => r.data_type !== 'uuid' && !katalogeMitTextschluessel.includes(r.table_name),
    );
    expect(abweichend).toEqual([]);
  });

  it('speichert Zeitpunkte zeitzonenbewusst (ADR-014)', async () => {
    const { rows } = await asPostgres<{ table_name: string; column_name: string }>(`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public' and data_type = 'timestamp without time zone'
    `);
    expect(rows).toEqual([]);
  });

  it('fuehrt organization_id auf allen fachlichen Tabellen (ADR-003)', async () => {
    const fachlich = [
      'locations',
      'persons',
      'staff_members',
      'staff_private_details',
      'patients',
      'training_relationships',
      'training_bases',
      'patient_contact_details',
      'patient_care_details',
      'user_profiles',
      'user_roles',
      'audit_log',
      'appointments',
      'appointment_notifications',
      'staff_working_hours',
      'staff_working_hour_exceptions',
      'treatment_notes',
      'treatment_note_versions',
      'prescribers',
      'treatment_bases',
      'treatment_base_items',
      'treatment_text_snippets',
      'staff_account_invitations',
      'legal_holds',
      'deletion_journal',
      'patient_files',
      'storage_deletion_orders',
      'patient_file_access_grants',
      'service_catalog_versions',
      'service_catalog_items',
      'billable_services',
      'practice_billing_profiles',
      'invoice_recipients',
      'invoices',
      'invoice_items',
      'invoice_number_series',
      'payments',
      'invoice_cancellations',
      'invoice_payment_reminders',
      'patient_privacy_records',
      'patient_questionnaire_responses',
    ];
    const { rows } = await asPostgres<{ table_name: string }>(
      `select c.table_name
       from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public'
         and c.column_name = 'organization_id'
         and t.table_type = 'BASE TABLE'`,
    );
    const vorhanden = rows.map((r) => r.table_name).sort();
    expect(vorhanden).toEqual([...fachlich].sort());
  });

  it('beschraenkt persons auf den Identitaetskern (Datenminimierung)', async () => {
    const { rows } = await asPostgres<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'persons'
       order by column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'created_at',
      'created_by',
      'family_name',
      'given_name',
      'id',
      'organization_id',
    ]);
  });

  it('wertet die Patientensicht mit den Rechten der aufrufenden Person aus', async () => {
    // Ohne security_invoker wuerde die Sicht die Policies der Basistabellen
    // umgehen und mit den Rechten des Eigentuemers laufen.
    const { rows } = await asPostgres<{ options: string[] | null }>(
      `select c.reloptions as options
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'patient_directory'`,
    );
    expect(rows[0]?.options ?? []).toContain('security_invoker=true');
  });

  it('gibt der Rolle anon keinerlei Tabellenrechte in public', async () => {
    const { rows } = await asPostgres<{ table_name: string; privilege_type: string }>(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'
    `);
    expect(rows).toEqual([]);
  });

  it('laesst anon keine Patientendaten lesen', async () => {
    await expect(asAnon('select id from public.patients')).rejects.toThrow(/permission denied/i);
  });

  it('haelt audit_log ueber den Anwendungspfad unerreichbar (ADR-010)', async () => {
    const { rows: policies } = await asPostgres<{ policyname: string }>(
      `select policyname from pg_policies where schemaname = 'public' and tablename = 'audit_log'`,
    );
    expect(policies).toEqual([]);

    const { rows: grants } = await asPostgres<{ privilege_type: string }>(`
      select privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'audit_log'
        and grantee in ('anon', 'authenticated')
    `);
    expect(grants).toEqual([]);
  });

  it('haelt treatment_notes ueber den Anwendungspfad unerreichbar (ADR-010, DOK-001)', async () => {
    // Gaebe es hier eine Policy oder ein Tabellenrecht, koennte klinischer
    // Freitext an get_treatment_note und damit am Auditeintrag vorbei gelesen
    // werden. Der einzige Lesepfad ist die Funktion.
    const { rows: policies } = await asPostgres<{ policyname: string }>(
      `select policyname from pg_policies where schemaname = 'public' and tablename = 'treatment_notes'`,
    );
    expect(policies).toEqual([]);

    const { rows: grants } = await asPostgres<{ privilege_type: string }>(`
      select privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'treatment_notes'
        and grantee in ('anon', 'authenticated')
    `);
    expect(grants).toEqual([]);
  });

  it('haelt patient_questionnaire_responses ueber den Anwendungspfad unerreichbar (ADR-010, FRB-002b)', async () => {
    // Die Antworten eines Anamnesebogens sind Gesundheitsdaten. Der einzige
    // Lesepfad ist list_patient_questionnaire_responses - er protokolliert.
    const { rows: policies } = await asPostgres<{ policyname: string }>(
      `select policyname from pg_policies
       where schemaname = 'public' and tablename = 'patient_questionnaire_responses'`,
    );
    expect(policies).toEqual([]);

    const { rows: grants } = await asPostgres<{ privilege_type: string }>(`
      select privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'patient_questionnaire_responses'
        and grantee in ('anon', 'authenticated')
    `);
    expect(grants).toEqual([]);
  });

  it('haelt treatment_note_versions ueber den Anwendungspfad unerreichbar (ADR-010, DOK-002)', async () => {
    // Der Versionsverlauf enthaelt jeden je festgeschriebenen Behandlungstext.
    // Waere er direkt lesbar, liesse sich die gesamte Historie an
    // get_treatment_note_versions und damit am Auditeintrag vorbei abziehen.
    const { rows: policies } = await asPostgres<{ policyname: string }>(
      `select policyname from pg_policies
       where schemaname = 'public' and tablename = 'treatment_note_versions'`,
    );
    expect(policies).toEqual([]);

    const { rows: grants } = await asPostgres<{ privilege_type: string }>(`
      select privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'treatment_note_versions'
        and grantee in ('anon', 'authenticated')
    `);
    expect(grants).toEqual([]);
  });

  it('enthaelt die Rollen aus PROJECT_PRINCIPLES.md 4', async () => {
    const { rows } = await asPostgres<{ key: string }>(
      'select key from public.roles order by sort_order',
    );
    // Seit LEI-003 sechs: §4.9 Trainingsbetreuung besetzt die Trainingsseite
    // der Grenze aus §4.8. §4.10 Trainingskund:in fehlt noch - sie kommt mit
    // dem Trainingsbereich, so wie §4.6 mit dem Patientenportal.
    expect(rows.map((r) => r.key)).toEqual([
      'owner',
      'therapist',
      'team_lead',
      'office',
      'trainer',
      'patient',
    ]);
  });

  it('legt keine klinischen Felder in patients ab (PROJECT_PRINCIPLES.md 4.6)', async () => {
    const { rows } = await asPostgres<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'patients'`,
    );
    const spalten = rows.map((r) => r.column_name);
    for (const verboten of ['diagnosis', 'anamnesis', 'notes', 'findings', 'clinical_notes']) {
      expect(spalten).not.toContain(verboten);
    }
  });
  it.each(['treatment_bases', 'treatment_base_items'])(
    'haelt %s ueber den Anwendungspfad unerreichbar (VER-001, ADR-004)',
    async (tabelle) => {
      // Beide Tabellen tragen klinische und organisatorische Felder
      // nebeneinander. Gaebe es hier eine Policy oder ein Tabellenrecht, koennte
      // office die Diagnose lesen - die rollenabhaengige Projektion aus ADR-004
      // waere an genau dieser Stelle ausgehebelt.
      const { rows: policies } = await asPostgres<{ policyname: string }>(
        `select policyname from pg_policies where schemaname = 'public' and tablename = $1`,
        [tabelle],
      );
      expect(policies).toEqual([]);

      const { rows: grants } = await asPostgres<{ privilege_type: string }>(
        `select privilege_type from information_schema.role_table_grants
          where table_schema = 'public' and table_name = $1
            and grantee in ('anon', 'authenticated')`,
        [tabelle],
      );
      expect(grants).toEqual([]);
    },
  );
});

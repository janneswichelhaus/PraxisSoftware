import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * PAT-005: erweiterte Patientenstammdaten.
 *
 * Der Kern dieser Story ist nicht, dass mehr Felder gespeichert werden, sondern
 * dass sie an der richtigen Stelle liegen: die zusaetzliche Erreichbarkeit
 * gehoert der Person, die internen Versorgungsangaben gehoeren der Praxis. Die
 * Tests halten genau diese Trennung fest (ANN-010, ADR-004).
 */
const { users, patients } = SEED;

const ANLEGEN = `
  select public.create_patient(
    $1, $2, $3::date, null, null, null, null, null, null,
    $4, $5, $6, $7, $8::uuid, $9, $10, $11
  ) as id`;

const AENDERN = `
  select public.update_patient(
    $1::uuid, $2, $3, $4::date, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15::uuid, $16, $17, $18
  ) as id`;

const KARTEI = `
  select phone_work, phone_mobile, fax, institution,
         primary_therapist_staff_member_id, primary_therapist_name,
         home_visit_access_note, special_note, remark
  from public.patient_directory where id = $1::uuid`;

const ANNA = '55555555-5555-4555-8555-000000000002';
const FREMDE_ID = '99999999-9999-4999-8999-000000000001';

interface Kartei {
  phone_work: string | null;
  phone_mobile: string | null;
  fax: string | null;
  institution: string | null;
  primary_therapist_staff_member_id: string | null;
  primary_therapist_name: string | null;
  home_visit_access_note: string | null;
  special_note: string | null;
  remark: string | null;
}

async function kartei(userId: string, patientId: string): Promise<Kartei | undefined> {
  const { rows } = await asUser<Kartei>(userId, KARTEI, [patientId]);
  return rows[0];
}

describe('PAT-005: erweiterte Stammdaten und interne Versorgungsangaben', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('liefert den Praxisrollen Erreichbarkeit und Versorgungsangaben', async () => {
    const alsTherapeutin = await kartei(users.therapist, patients.max);
    expect(alsTherapeutin?.phone_mobile).toBe('+49 160 0000005');
    expect(alsTherapeutin?.phone_work).toBe('+49 7071 0000205');
    expect(alsTherapeutin?.home_visit_access_note).toContain('Klingel');
    expect(alsTherapeutin?.primary_therapist_name).toBe('Anna Beispiel');

    // Office organisiert Termine und ruft an - genau dafuer sind die Felder da
    // (PROJECT_PRINCIPLES.md 4.3).
    const alsOffice = await kartei(users.office, patients.max);
    expect(alsOffice?.home_visit_access_note).toContain('Klingel');
    expect(alsOffice?.special_note).toContain('Hund');
    expect(alsOffice?.institution).toBeNull();
  });

  it('haelt die internen Versorgungsangaben vom Patientenkonto fern (ANN-010)', async () => {
    // Die eigene Erreichbarkeit sieht das Patientenkonto weiterhin - die
    // Arbeitsnotizen der Praxis nicht. Beides kommt aus derselben Sicht; die
    // Projektion macht die Datenbank, nicht der Client (ADR-004).
    const eigene = await kartei(users.patientMax, patients.max);
    expect(eigene?.phone_mobile).toBe('+49 160 0000005');
    expect(eigene?.home_visit_access_note).toBeNull();
    expect(eigene?.special_note).toBeNull();
    expect(eigene?.remark).toBeNull();
    expect(eigene?.primary_therapist_staff_member_id).toBeNull();
    expect(eigene?.primary_therapist_name).toBeNull();

    // Gegenprobe auf der Tabelle selbst: auch der direkte Weg liefert nichts.
    const { rows } = await asUser(
      users.patientMax,
      'select patient_id from public.patient_care_details',
    );
    expect(rows).toEqual([]);
  });

  it('zeigt einem Patientenkonto keine fremden Versorgungsangaben', async () => {
    const fremde = await kartei(users.patientMax, patients.erika);
    expect(fremde).toBeUndefined();
  });

  it('legt Erreichbarkeit und Versorgungsangaben beim Anlegen mit an', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ANLEGEN, [
      'Nora',
      'Neuzugang',
      '1980-03-14',
      '+49 7071 0000900',
      '+49 160 0000900',
      '+49 7071 0000901',
      'Pflegedienst Fiktiv',
      ANNA,
      'Hintereingang, Code 1234.',
      'Treppenhaus ohne Licht.',
      'Nur dienstags erreichbar.',
    ]);
    const neu = rows[0]!.id;

    const gelesen = await kartei(users.ownerTherapist, neu);
    expect(gelesen).toMatchObject({
      phone_work: '+49 7071 0000900',
      phone_mobile: '+49 160 0000900',
      fax: '+49 7071 0000901',
      institution: 'Pflegedienst Fiktiv',
      primary_therapist_staff_member_id: ANNA,
      primary_therapist_name: 'Anna Beispiel',
      home_visit_access_note: 'Hintereingang, Code 1234.',
      special_note: 'Treppenhaus ohne Licht.',
      remark: 'Nur dienstags erreichbar.',
    });
  });

  it('normalisiert leere Eingaben zu null', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ANLEGEN, [
      'Leer',
      'Felder',
      '1975-01-01',
      '   ',
      '',
      null,
      '  ',
      null,
      '',
      '   ',
      null,
    ]);
    const gelesen = await kartei(users.ownerTherapist, rows[0]!.id);
    expect(gelesen).toMatchObject({
      phone_work: null,
      phone_mobile: null,
      fax: null,
      institution: null,
      primary_therapist_staff_member_id: null,
      home_visit_access_note: null,
      special_note: null,
      remark: null,
    });
  });

  it('aendert die neuen Felder und protokolliert nur ihre Namen', async () => {
    await asUserCommitted(users.office, AENDERN, [
      patients.erika,
      'Erika',
      'Beispiel',
      '1963-09-17',
      'erika.beispiel@patient.invalid',
      '+49 7071 0000006',
      'Testweg',
      '7',
      '72072',
      'Tuebingen',
      null,
      '+49 160 0000006',
      null,
      'Betreutes Wohnen Fiktiv',
      ANNA,
      'Erdgeschoss, Klingel "Beispiel". Schluessel bei Nachbarin Frau Fiktiv im 1. OG.',
      null,
      null,
    ]);

    const gelesen = await kartei(users.office, patients.erika);
    expect(gelesen?.institution).toBe('Betreutes Wohnen Fiktiv');
    expect(gelesen?.primary_therapist_staff_member_id).toBe(ANNA);

    const { rows } = await asPostgres<{ context: { changed_fields: string[] } }>(
      `select context from public.audit_log
        where action = 'patient.updated' and subject_id = $1::uuid
        order by occurred_at desc limit 1`,
      [patients.erika],
    );
    const felder = rows[0]!.context.changed_fields;
    expect(felder.sort()).toEqual(['institution', 'primary_therapist_staff_member_id']);
    // Keine Inhalte im Auditlog, nur Feldnamen (ADR-010, ADR-011).
    expect(JSON.stringify(rows[0]!.context)).not.toContain('Fiktiv');
  });

  it('weist eine feste Therapeut:in ausserhalb der Organisation ab', async () => {
    await expect(
      asUser(users.ownerTherapist, AENDERN, [
        patients.max,
        'Max',
        'Mustermann',
        '1957-04-30',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        FREMDE_ID,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/staff member not found/i);
  });

  it('laesst ein Patientenkonto keine Stammdaten aendern', async () => {
    await expect(
      asUser(users.patientMax, AENDERN, [
        patients.max,
        'Max',
        'Manipuliert',
        '1957-04-30',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        'Neuer Zugangshinweis',
        null,
        null,
      ]),
    ).rejects.toThrow(/not allowed to update patients/i);
  });

  it('haelt die Versorgungsangaben fuer die Rolle authenticated schreibgeschuetzt', async () => {
    // Deny-by-default: gelesen wird ueber die Policy, geschrieben ausschliesslich
    // ueber update_patient (ADR-004).
    const { rows } = await asPostgres<{ privilege_type: string }>(`
      select privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'patient_care_details'
        and grantee in ('anon', 'authenticated')
    `);
    expect(rows.map((r) => r.privilege_type)).toEqual(['SELECT']);
  });
});

/**
 * Mandantentrennung (ADR-003): FREMDE_ID oben ist eine schlicht nicht
 * existierende ID. Dieser Block legt eine real existierende Mitarbeiter:in
 * in einer zweiten Organisation an (Muster aus rls.test.ts) und prueft, dass
 * `app.assert_staff_member_in_org` eine echte fremde ID genauso abweist wie
 * eine unbekannte.
 */
describe('Mandantentrennung (ADR-003)', () => {
  const fremdeOrg = '33333333-3333-4333-8333-000000000201';
  const fremdePerson = '33333333-3333-4333-8333-000000000202';
  const fremderStaffMember = '33333333-3333-4333-8333-000000000203';

  beforeAll(async () => {
    await resetDatabase();
    await asPostgres(`
      insert into public.organizations (id, name, time_zone)
        values ('${fremdeOrg}', 'Test Praxis Woanders', 'Europe/Berlin');
      insert into public.persons (id, organization_id, given_name, family_name)
        values ('${fremdePerson}', '${fremdeOrg}', 'Tessa', 'Fremdtherapeutin');
      insert into public.staff_members (id, organization_id, person_id)
        values ('${fremderStaffMember}', '${fremdeOrg}', '${fremdePerson}');
    `);
  }, 120_000);

  it('weist eine echte feste Therapeut:in einer fremden Organisation ab wie eine unbekannte', async () => {
    await expect(
      asUser(users.ownerTherapist, AENDERN, [
        patients.max,
        'Max',
        'Mustermann',
        '1957-04-30',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        fremderStaffMember,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/staff member not found/i);

    const { rows } = await asUser<{ primary_therapist_staff_member_id: string | null }>(
      users.ownerTherapist,
      KARTEI,
      [patients.max],
    );
    expect(rows[0]?.primary_therapist_staff_member_id).not.toBe(fremderStaffMember);
  });
});

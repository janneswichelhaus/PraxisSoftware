import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asPostgres, asUser, resetDatabase, SEED } from './helpers/db';

/**
 * Das Trainingsverhaeltnis als zweite Verhaeltnistabelle (LEI-001, ADR-021).
 *
 * Die Tests hier halten die drei harten Zusagen des ADR fest, die man einer
 * Tabelle spaeter nicht mehr ansieht: kein Fremdschluessel zwischen den
 * Verhaeltnissen (Punkt 3), keine klinischen und keine Screening-Felder
 * (Punkt 4), und eine eigene Frist mit eigenem Anker im Retention Schedule.
 */
describe('Trainingsverhaeltnis', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('verbindet sich mit dem Behandlungsverhaeltnis ausschliesslich ueber person_id (ADR-021 Punkt 3)', async () => {
    // Ein Fremdschluessel auf patients waere die Abkuerzung, die ADR-021
    // ausdruecklich verbietet: er macht aus zwei Verhaeltnissen wieder eines
    // und nimmt Datenklasse und Frist die Trennung.
    const { rows } = await asPostgres<{ referenziert: string; spalte: string }>(`
      select ccu.table_name as referenziert, kcu.column_name as spalte
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and tc.table_name = 'training_relationships'
      order by ccu.table_name
    `);

    expect(rows.map((r) => r.referenziert).sort()).toEqual(['organizations', 'persons']);
    expect(rows.find((r) => r.referenziert === 'persons')?.spalte).toBe('person_id');
  });

  it('traegt weder klinische noch Screening-Felder (ADR-021 Punkt 4)', async () => {
    const { rows } = await asPostgres<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'training_relationships'
       order by column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'contract_ended_on',
      'contract_started_on',
      'created_at',
      'created_by',
      'id',
      'organization_id',
      'person_id',
      'status',
    ]);
  });

  it('haelt eine Person mit beiden Verhaeltnissen auseinander (ADR-021 Punkt 1)', async () => {
    // Erika ist Patientin UND Trainingskundin. Zwei Zeilen, zwei Fristen,
    // zwei Rechtsgrundlagen - und keine Spalte, die beides vermengt.
    const { rows } = await asPostgres<{ akte: string; training: string }>(
      `select p.id as akte, t.id as training
         from public.patients p
         join public.training_relationships t on t.person_id = p.person_id
        where p.person_id = $1`,
      [SEED.persons.erika],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.akte).toBe(SEED.patients.erika);
    expect(rows[0]?.training).toBe(SEED.trainingRelationships.erika);

    // Umgekehrt: Tina trainiert und hat keine Akte. Eine Person ohne
    // Behandlungsverhaeltnis ist im zweiten Leistungsbereich der Regelfall.
    const { rows: ohneAkte } = await asPostgres(
      `select 1 from public.patients where person_id = $1`,
      [SEED.persons.tina],
    );
    expect(ohneAkte).toEqual([]);
  });

  it('laesst einen Vertrag nicht vor seinem Beginn enden', async () => {
    await expect(
      asPostgres(
        `insert into public.training_relationships
           (organization_id, person_id, contract_started_on, contract_ended_on)
         values ($1, $2, '2026-05-01', '2026-04-30')`,
        [SEED.organizationId, SEED.persons.max],
      ),
    ).rejects.toThrow(/training_relationships_end_after_start/);
  });

  it('fuehrt je Person und Organisation hoechstens ein Trainingsverhaeltnis', async () => {
    // Wer nach einer Pause weitertrainiert, bekommt kein zweites Verhaeltnis:
    // sonst gaebe es zwei Anker und damit zwei Fristen fuer dieselbe Sache.
    await expect(
      asPostgres(
        `insert into public.training_relationships (organization_id, person_id)
         values ($1, $2)`,
        [SEED.organizationId, SEED.persons.tina],
      ),
    ).rejects.toThrow(/training_relationships_organization_id_person_id_key/);
  });

  it('bewahrt Trainingsdaten drei Jahre ab Vertragsende, nicht zehn (ADR-021 Punkt 4)', async () => {
    const { rows } = await asPostgres<{
      basis: string;
      anchor: string;
      frist: string;
      assumption_key: string | null;
    }>(
      `select basis, anchor, retention_interval::text as frist, assumption_key
         from public.retention_classes where key = 'trainingsverhaeltnis'`,
    );
    expect(rows[0]?.anchor).toBe('contract_ended');
    expect(rows[0]?.frist).toContain('3 years');
    expect(rows[0]?.basis).toBe('gesetzlich_gepraegt');
    // Die Frist steht in ADR-021 und ist damit keine Annahme des Loops.
    expect(rows[0]?.assumption_key).toBeNull();

    // Und sie kommt auch hier nur aus dem Schedule (ANN-001).
    const { rows: ueberFunktion } = await asPostgres<{ frist: string }>(
      `select app.retention_interval('trainingsverhaeltnis')::text as frist`,
    );
    expect(ueberFunktion[0]?.frist).toContain('3 years');
  });

  it('bleibt fuer anon und fuer ein Patientenkonto unerreichbar', async () => {
    await expect(asAnon('select id from public.training_relationships')).rejects.toThrow(
      /permission denied/i,
    );

    // Erika hat beide Verhaeltnisse. Ihr Patientenkonto traegt die Rolle aus
    // §4.6 - und die gilt im Bereich `therapy`. Die eigene Sicht auf das
    // Training gehoert zu §4.10 und damit zu einer Rolle, die es noch nicht
    // gibt; auch in der eigenen Sicht bleiben die Bereiche getrennt (§4.8).
    const { rows } = await asUser(
      SEED.users.patientErika,
      'select id from public.training_relationships',
    );
    expect(rows).toEqual([]);
  });
});

/**
 * Kein Durchgriff, in beide Richtungen (ADR-021 Punkt 6, §4.8).
 *
 * Durchgesetzt wird die Grenze in den Policies, nicht in der Oberflaeche.
 * Diese Tests laufen deshalb gegen die Datenbank und nicht gegen die
 * Anwendung: Ausgeblendete Elemente sind keine Zugriffskontrolle (ADR-004
 * Punkt 5).
 */
describe('Kein Durchgriff zwischen Behandlung und Training', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt der Trainingsbetreuung die Trainingsverhaeltnisse ihrer Organisation', async () => {
    const { rows } = await asUser<{ id: string }>(
      SEED.users.trainer,
      'select id from public.training_relationships order by id',
    );
    expect(rows.map((r) => r.id)).toEqual([
      SEED.trainingRelationships.tina,
      SEED.trainingRelationships.erika,
    ]);
  });

  it.each([
    ['owner', SEED.users.ownerTherapist],
    ['office', SEED.users.office],
  ])('laesst %s beide Bereiche sehen - beides ist ihre Rolle (§4.8)', async (_rolle, user) => {
    const { rows } = await asUser(user, 'select id from public.training_relationships');
    expect(rows).toHaveLength(2);
  });

  it.each([
    ['therapist', SEED.users.therapist],
    ['team_lead', SEED.users.teamLead],
  ])('verbirgt Trainingsverhaeltnisse vor %s', async (_rolle, user) => {
    // Der offene Zugriff aller Therapeut:innen auf alle Akten (§4.2) gilt
    // INNERHALB der Behandlung. Teamleitung bekommt Trainingsdaten erst,
    // wenn ihr §4.9 zusaetzlich zugewiesen ist.
    const { rows } = await asUser(user, 'select id from public.training_relationships');
    expect(rows).toEqual([]);
  });

  it('verbirgt die Patientenkartei und die Akte vor der Trainingsbetreuung', async () => {
    for (const tabelle of ['patients', 'patient_contact_details', 'patient_care_details']) {
      const { rows } = await asUser(SEED.users.trainer, `select 1 as x from public.${tabelle}`);
      expect({ tabelle, rows }).toEqual({ tabelle, rows: [] });
    }

    // Klinischer Freitext und Behandlungsgrundlagen sind ueber den
    // Anwendungspfad ueberhaupt nicht erreichbar; fuer die Trainingsbetreuung
    // erst recht.
    for (const tabelle of ['treatment_notes', 'treatment_bases']) {
      await expect(asUser(SEED.users.trainer, `select id from public.${tabelle}`)).rejects.toThrow(
        /permission denied/i,
      );
    }
  });

  it('gibt der Trainingsbetreuung nur die Personen ihres Bereichs (§4.8)', async () => {
    // Weder mittelbar ueber die gemeinsame Identitaet: Max ist ausschliesslich
    // Patient. Waere er hier sichtbar, liesse sich aus der Trainingsrolle auf
    // den Bestand der Behandlung schliessen.
    const { rows } = await asUser<{ id: string }>(
      SEED.users.trainer,
      'select id from public.persons order by id',
    );
    const sichtbar = rows.map((r) => r.id);
    expect(sichtbar).toContain(SEED.persons.tina);
    expect(sichtbar).toContain(SEED.persons.erika);
    expect(sichtbar).not.toContain(SEED.persons.max);
  });

  it('macht aus der Trainingsrolle keine Praxisrolle', async () => {
    // app.is_staff() traegt die vier Behandlungsrollen. Die Gegenprobe zu den
    // Tabellen oben: Die Trainingsbetreuung faellt nicht still in einen
    // Sammelbegriff, an dem andere Policies haengen.
    const { rows } = await asUser<{ staff: boolean; training: boolean }>(
      SEED.users.trainer,
      'select app.is_staff() as staff, app.can_read_training_relationships() as training',
    );
    expect(rows[0]?.staff).toBe(false);
    expect(rows[0]?.training).toBe(true);
  });
});

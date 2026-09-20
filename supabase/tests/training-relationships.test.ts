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

    const { rows } = await asUser(
      SEED.users.patientErika,
      'select id from public.training_relationships',
    );
    expect(rows).toEqual([]);
  });
});

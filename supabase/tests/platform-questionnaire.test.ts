import { Client } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabase,
  testDatabaseUrl,
  jwtClaims,
} from './helpers/db';

/**
 * Befundbogen vorab über die Plattform (POR-012, §7, DSN-001 4.1, ANN-248).
 *
 * Die Person füllt den Anamnesebogen selbst aus; absenden heißt abgeschlossen,
 * der Server prüft jede Antwort gegen die Definition (ABN-014). Nur
 * Instrumente für die Patient:in, nur Person und rechtliche Vertretung, nur
 * der Behandlungszugang; in der Praxis erhobene Bögen bleiben Befund.
 */

const { users, platformAccesses, patients } = SEED;
const ERIKA = platformAccesses.erikaBehandlung;
const STAND = 'select * from public.platform_questionnaire($1::uuid)';
const SPEICHERN = `select public.save_platform_questionnaire_response(
  $1::uuid, $2::uuid, $3, $4, $5::jsonb) as id`;
const ABSENDEN = 'select public.complete_platform_questionnaire_response($1::uuid, $2::uuid) as ok';
const VERWERFEN = 'select public.discard_platform_questionnaire_response($1::uuid, $2::uuid) as ok';
const AKTE = 'select * from public.list_patient_questionnaire_responses($1::uuid)';

const ANTWORTEN = { beruf: { text: 'Lehrerin' }, schmerzen_aktuell: { auswahl: 'ja' } };

interface Zeile {
  id: string;
  instrument_id: string;
  definition_version: string;
  status: string;
  source: string;
  answers: Record<string, unknown> | null;
}

async function speichern(
  konto: string,
  zugang: string,
  antworten: unknown = ANTWORTEN,
  entwurf: string | null = null,
  instrument = 'anamnese_v8',
  version = '1.0.0',
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, SPEICHERN, [
    zugang,
    entwurf,
    instrument,
    version,
    JSON.stringify(antworten),
  ]);
  return rows[0]!.id;
}

async function erlaubt(konto: string, zugang: string, recht: string): Promise<boolean> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('request.jwt.claims', $1, true)", [jwtClaims(konto)]);
    const { rows } = await client.query<{ ok: boolean }>(
      'select app.platform_access_allows($1::uuid, $2) as ok',
      [zugang, recht],
    );
    await client.query('rollback');
    return rows[0]?.ok === true;
  } finally {
    await client.end();
  }
}

describe('Befundbogen ueber die Plattform (POR-012)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('legt einen Entwurf an, zeigt ihn der Person mit Antworten und schliesst ihn ab', async () => {
    const id = await speichern(users.plattformErika, ERIKA);
    let stand = (await asUser<Zeile>(users.plattformErika, STAND, [ERIKA])).rows;
    expect(stand).toEqual([
      expect.objectContaining({
        id,
        instrument_id: 'anamnese_v8',
        status: 'entwurf',
        source: 'platform',
        answers: ANTWORTEN,
      }),
    ]);
    // Ueberschreiben des Entwurfs, dann absenden.
    const neu = { ...ANTWORTEN, sport_hobby: { text: 'Radfahren' } };
    expect(await speichern(users.plattformErika, ERIKA, neu, id)).toBe(id);
    const { rows } = await asUserCommitted<{ ok: boolean }>(users.plattformErika, ABSENDEN, [
      ERIKA,
      id,
    ]);
    expect(rows[0]!.ok).toBe(true);
    stand = (await asUser<Zeile>(users.plattformErika, STAND, [ERIKA])).rows;
    expect(stand[0]).toEqual(
      expect.objectContaining({ id, status: 'abgeschlossen', answers: neu }),
    );

    // In der Akte: abgeschlossen, Herkunft Plattform, kein Praxisname.
    const akte = await asUser<{
      id: string;
      source: string;
      author_name: string | null;
      status: string;
    }>(users.therapist, AKTE, [patients.erika]);
    expect(akte.rows.find((r) => r.id === id)).toEqual(
      expect.objectContaining({ source: 'platform', author_name: null, status: 'abgeschlossen' }),
    );
    const nachweis = await asPostgres<{
      created_by: string;
      source_access_id: string;
      completed_by: string;
    }>(
      `select created_by, source_access_id, completed_by from public.patient_questionnaire_responses where id = $1`,
      [id],
    );
    expect(nachweis.rows[0]).toEqual({
      created_by: users.plattformErika,
      source_access_id: ERIKA,
      completed_by: users.plattformErika,
    });
  });

  it('prueft die Antworten gegen die Definition und laesst nur Boegen fuer die Person zu', async () => {
    const fremdesItem = await abgefangen(
      asUser(users.plattformErika, SPEICHERN, [
        ERIKA,
        null,
        'anamnese_v8',
        '1.0.0',
        JSON.stringify({ gibt_es_nicht: { text: 'x' } }),
      ]),
    );
    expect(fremdesItem).not.toBeNull();
    const falscheForm = await abgefangen(
      asUser(users.plattformErika, SPEICHERN, [
        ERIKA,
        null,
        'anamnese_v8',
        '1.0.0',
        JSON.stringify({ beruf: 'Lehrerin' }),
      ]),
    );
    expect(falscheForm).not.toBeNull();
    // NRS ist inaktiv - nicht auf der Plattform.
    const inaktiv = await abgefangen(
      asUser(users.plattformErika, SPEICHERN, [
        ERIKA,
        null,
        'nrs_schmerz',
        '0.1.0',
        JSON.stringify({}),
      ]),
    );
    expect(inaktiv?.message).toContain('not available on the platform');
    const unbekannt = await abgefangen(
      asUser(users.plattformErika, SPEICHERN, [ERIKA, null, 'anamnese_v8', '9.9.9', '{}']),
    );
    expect(unbekannt?.message).toContain('not available on the platform');
  });

  it('haelt die Fassung eines Entwurfs fest - eine neue Fassung heisst neu beginnen (Zweitreview)', async () => {
    const id = await speichern(users.plattformErika, ERIKA);
    await asPostgres(
      `insert into public.questionnaire_definitions (instrument_id, version, definition)
       select instrument_id, '9.9.9', jsonb_set(definition, '{meta,version}', '"9.9.9"')
       from public.questionnaire_definitions where instrument_id = 'anamnese_v8' and version = '1.0.0'`,
    );
    const andereFassung = await abgefangen(
      asUser(users.plattformErika, SPEICHERN, [
        ERIKA,
        null,
        'anamnese_v8',
        '9.9.9',
        JSON.stringify(ANTWORTEN),
      ]),
    );
    expect(andereFassung?.message).toContain('draft identity is fixed');
    const stand = (await asUser<Zeile>(users.plattformErika, STAND, [ERIKA])).rows;
    expect(stand.map((z) => [z.id, z.definition_version])).toEqual([[id, '1.0.0']]);
  });

  it('nimmt keinen zweiten Bogen an, wenn einer abgeschlossen vorliegt', async () => {
    const id = await speichern(users.plattformErika, ERIKA);
    await asUserCommitted(users.plattformErika, ABSENDEN, [ERIKA, id]);
    const zweiter = await abgefangen(
      asUser(users.plattformErika, SPEICHERN, [
        ERIKA,
        null,
        'anamnese_v8',
        '1.0.0',
        JSON.stringify(ANTWORTEN),
      ]),
    );
    expect(zweiter?.message).toContain('already completed');
    // Abgeschlossen laesst sich nicht noch einmal absenden und nicht verwerfen.
    const nochmal = await abgefangen(asUser(users.plattformErika, ABSENDEN, [ERIKA, id]));
    expect(nochmal?.message).toContain('is completed');
    const verwerfen = await asUser<{ ok: boolean }>(users.plattformErika, VERWERFEN, [ERIKA, id]);
    expect(verwerfen.rows[0]!.ok).toBe(false);
  });

  it('zeigt eine in der Praxis erhobene Anamnese nur als Tatsache, ohne Antworten', async () => {
    await asPostgres(
      `insert into public.patient_questionnaire_responses
         (organization_id, patient_id, instrument_id, definition_version, recorded_on, answers,
          status, completed_at, completed_by, created_by, updated_by)
       values ($1, $2, 'anamnese_v8', '1.0.0', current_date, $3::jsonb,
               'abgeschlossen', now(), $4, $4, $4)`,
      [SEED.organizationId, patients.erika, JSON.stringify(ANTWORTEN), users.therapist],
    );
    // Ein Entwurf der Praxis bleibt deren Arbeit und erscheint nicht (Zweitreview).
    await asPostgres(
      `insert into public.patient_questionnaire_responses
         (organization_id, patient_id, instrument_id, definition_version, recorded_on, answers,
          status, created_by, updated_by)
       values ($1, $2, 'anamnese_v8', '1.0.0', current_date, '{}'::jsonb, 'entwurf', $3, $3)`,
      [SEED.organizationId, patients.erika, users.therapist],
    );
    const stand = (await asUser<Zeile>(users.plattformErika, STAND, [ERIKA])).rows;
    expect(stand).toEqual([
      expect.objectContaining({ status: 'abgeschlossen', source: 'practice', answers: null }),
    ]);
    const neu = await abgefangen(
      asUser(users.plattformErika, SPEICHERN, [
        ERIKA,
        null,
        'anamnese_v8',
        '1.0.0',
        JSON.stringify(ANTWORTEN),
      ]),
    );
    expect(neu?.message).toContain('already completed');
  });

  it('verwirft nur den eigenen Entwurf', async () => {
    const id = await speichern(users.plattformErika, ERIKA);
    // Abschliessen kann ihn auch nur die Person selbst (Zweitreview).
    const fremdAbsenden = await abgefangen(
      asUser(users.plattformTina, ABSENDEN, [platformAccesses.tinaTraining, id]),
    );
    expect(fremdAbsenden).not.toBeNull();
    const fremd = await asUser<{ ok: boolean }>(users.plattformTina, VERWERFEN, [
      platformAccesses.tinaTraining,
      id,
    ]);
    expect(fremd.rows[0]!.ok).toBe(false);
    const eigen = await asUserCommitted<{ ok: boolean }>(users.plattformErika, VERWERFEN, [
      ERIKA,
      id,
    ]);
    expect(eigen.rows[0]!.ok).toBe(true);
    expect((await asUser<Zeile>(users.plattformErika, STAND, [ERIKA])).rows).toEqual([]);
  });

  it('Begleitung, Training, fremde Person, gesperrt, Praxiskonto: abgewiesen (ANN-248)', async () => {
    expect(
      await erlaubt(users.plattformPaula, platformAccesses.paulaBegleitungMax, 'questionnaire'),
    ).toBe(false);
    expect(await erlaubt(users.plattformErika, ERIKA, 'questionnaire')).toBe(true);
    const paula = await abgefangen(
      asUser(users.plattformPaula, SPEICHERN, [
        platformAccesses.paulaBegleitungMax,
        null,
        'anamnese_v8',
        '1.0.0',
        JSON.stringify(ANTWORTEN),
      ]),
    );
    expect(paula?.message).toContain('not allowed');
    const training = await abgefangen(
      asUser(users.plattformErika, SPEICHERN, [
        platformAccesses.erikaTraining,
        null,
        'anamnese_v8',
        '1.0.0',
        JSON.stringify(ANTWORTEN),
      ]),
    );
    expect(training?.message).toContain('not allowed');
    expect(
      (await asUser(users.plattformErika, STAND, [platformAccesses.erikaTraining])).rows,
    ).toEqual([]);
    const tina = await abgefangen(
      asUser(users.plattformTina, SPEICHERN, [ERIKA, null, 'anamnese_v8', '1.0.0', '{}']),
    );
    expect(tina?.message).toContain('not allowed');
    const praxis = await abgefangen(
      asUser(users.therapist, SPEICHERN, [ERIKA, null, 'anamnese_v8', '1.0.0', '{}']),
    );
    expect(praxis?.message).toContain('not allowed');
    await asPostgres(
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      [ERIKA],
    );
    const gesperrt = await abgefangen(
      asUser(users.plattformErika, SPEICHERN, [ERIKA, null, 'anamnese_v8', '1.0.0', '{}']),
    );
    expect(gesperrt?.message).toContain('not allowed');
    expect((await asUser(users.plattformErika, STAND, [ERIKA])).rows).toEqual([]);
  });
});

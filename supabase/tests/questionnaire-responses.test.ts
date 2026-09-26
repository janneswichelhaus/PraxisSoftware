import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
  tagInTagen,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Erhobene Fragebögen in der Akte (FRB-002b, ANN-103).
 *
 * Die wichtigste Zusage zuerst: Ein abgeschlossener Bogen bleibt, wie er
 * beantwortet wurde (PROJECT_PRINCIPLES.md §7) — weder die Funktionen noch ein
 * direkter Zugriff ändern ihn, und eine Korrektur steht als eigene Erhebung
 * daneben. Danach Rollen nach ADR-013 Punkt 9 Nr. 1 (fremde Organisation,
 * fremde Person, anderer Leistungsbereich, Rolle ohne Recht), Auditeintrag und
 * die Auskunft nach Art. 15.
 */

const { users, patients } = SEED;

const SPEICHERN = `select public.save_questionnaire_response(
  $1::uuid, $2::uuid, $3, $4, $5::date, $6::jsonb, $7::uuid, $8) as id`;
const ABSCHLIESSEN = 'select public.complete_questionnaire_response($1::uuid)';
const VERWERFEN = 'select public.discard_questionnaire_response($1::uuid)';
const LESEN = `select id, instrument_id, definition_version, status, recorded_on::text as recorded_on,
                      answers, supersedes_response_id, superseded_by_response_id, change_reason,
                      author_name, completed_by_name
                 from public.list_patient_questionnaire_responses($1::uuid)`;

const HEUTE = tagInTagen(0);
const ANTWORTEN = { schmerzen_aktuell: { auswahl: 'ja' }, schmerzstaerke: { wert: 6 } };

async function erheben(
  userId: string = users.therapist,
  antworten: unknown = ANTWORTEN,
  patientId: string = patients.max,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(userId, SPEICHERN, [
    patientId,
    null,
    'anamnese_v8',
    '1.0.0',
    HEUTE,
    JSON.stringify(antworten),
    null,
    null,
  ]);
  return rows[0]!.id;
}

async function fehler(
  userId: string | null,
  sql: string,
  params: unknown[],
): Promise<{ code?: string; message: string } | null> {
  try {
    await asUser(userId, sql, params);
    return null;
  } catch (f) {
    return f as { code?: string; message: string };
  }
}

async function auditZeilen(action: string) {
  const { rows } = await asPostgres<{ subject_id: string; context: Record<string, unknown> }>(
    `select subject_id, context from public.audit_log where action = $1 and outcome = 'success'
     order by occurred_at`,
    [action],
  );
  return rows;
}

describe('Erhebung eines Fragebogens', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('legt einen Entwurf an und liefert ihn mit Namen statt Kennungen', async () => {
    const id = await erheben();
    const { rows } = await asUser(users.therapist, LESEN, [patients.max]);
    expect(rows).toEqual([
      {
        id,
        instrument_id: 'anamnese_v8',
        definition_version: '1.0.0',
        status: 'entwurf',
        recorded_on: HEUTE,
        answers: ANTWORTEN,
        supersedes_response_id: null,
        superseded_by_response_id: null,
        change_reason: null,
        author_name: 'Anna Beispiel',
        completed_by_name: null,
      },
    ]);
  });

  it('ueberschreibt einen Entwurf, solange er Entwurf ist', async () => {
    const id = await erheben();
    const neu = { schmerzen_aktuell: { auswahl: 'nein' } };
    await asUserCommitted(users.teamLead, SPEICHERN, [
      patients.max,
      id,
      'anamnese_v8',
      '1.0.0',
      HEUTE,
      JSON.stringify(neu),
      null,
      null,
    ]);
    const { rows } = await asUser(users.therapist, LESEN, [patients.max]);
    expect(rows[0]!['answers']).toEqual(neu);
  });

  it('haelt einen abgeschlossenen Bogen fest - Funktion und direkter Zugriff scheitern', async () => {
    const id = await erheben();
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [id]);

    expect(
      (
        await fehler(users.therapist, SPEICHERN, [
          patients.max,
          id,
          'anamnese_v8',
          '1.0.0',
          HEUTE,
          '{}',
          null,
          null,
        ])
      )?.message,
    ).toMatch(/completed/);
    expect((await fehler(users.therapist, VERWERFEN, [id]))?.message).toMatch(/completed/);
    expect((await fehler(users.therapist, ABSCHLIESSEN, [id]))?.message).toMatch(/completed/);

    // Auch ein Pfad an den Funktionen vorbei aendert nichts: Der Trigger haelt die Zeile.
    await expect(
      asPostgres(`update public.patient_questionnaire_responses set answers = '{}' where id = $1`, [
        id,
      ]),
    ).rejects.toThrow(/completed/);

    const { rows } = await asUser(users.therapist, LESEN, [patients.max]);
    expect(rows[0]!['answers']).toEqual(ANTWORTEN);
    expect(rows[0]!['status']).toBe('abgeschlossen');
    expect(rows[0]!['completed_by_name']).toBe('Anna Beispiel');
  });

  it('korrigiert als neue Erhebung mit Begruendung; die alte bleibt lesbar', async () => {
    const alt = await erheben();
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [alt]);

    const ohneGrund = await fehler(users.therapist, SPEICHERN, [
      patients.max,
      null,
      'anamnese_v8',
      '1.0.0',
      HEUTE,
      '{}',
      alt,
      null,
    ]);
    expect(ohneGrund?.message).toMatch(/reason/);

    const { rows: neu } = await asUserCommitted<{ id: string }>(users.teamLead, SPEICHERN, [
      patients.max,
      null,
      'anamnese_v8',
      '1.0.0',
      HEUTE,
      JSON.stringify({ schmerzstaerke: { wert: 4 } }),
      alt,
      'Frage 3 falsch übertragen',
    ]);

    const { rows } = await asUser(users.therapist, LESEN, [patients.max]);
    const altZeile = rows.find((r) => r['id'] === alt)!;
    const neuZeile = rows.find((r) => r['id'] === neu[0]!.id)!;
    expect(altZeile['answers']).toEqual(ANTWORTEN);
    expect(altZeile['superseded_by_response_id']).toBe(neu[0]!.id);
    expect(neuZeile['supersedes_response_id']).toBe(alt);
    expect(neuZeile['change_reason']).toBe('Frage 3 falsch übertragen');

    // Eine Kette verzweigt nicht: ein zweiter Nachfolger wird abgewiesen.
    const zweiter = await fehler(users.therapist, SPEICHERN, [
      patients.max,
      null,
      'anamnese_v8',
      '1.0.0',
      HEUTE,
      '{}',
      alt,
      'noch einmal',
    ]);
    expect(zweiter?.message).toMatch(/already corrected/);
  });

  it('korrigiert keinen Entwurf und kein anderes Instrument', async () => {
    const entwurf = await erheben();
    expect(
      (
        await fehler(users.therapist, SPEICHERN, [
          patients.max,
          null,
          'anamnese_v8',
          '1.0.0',
          HEUTE,
          '{}',
          entwurf,
          'Grund',
        ])
      )?.message,
    ).toMatch(/only a completed/);

    await asUserCommitted(users.therapist, ABSCHLIESSEN, [entwurf]);
    expect(
      (
        await fehler(users.therapist, SPEICHERN, [
          patients.max,
          null,
          'nrs_schmerz',
          '0.1.0',
          HEUTE,
          '{}',
          entwurf,
          'Grund',
        ])
      )?.message,
    ).toMatch(/same instrument/);
  });

  it('weist beim Ueberschreiben eines Entwurfs abweichende Kennung, Version oder Korrektur ab', async () => {
    const id = await erheben();
    for (const [instrument, version, korrigiert, grund] of [
      ['nrs_schmerz', '1.0.0', null, null],
      ['anamnese_v8', '1.0.1', null, null],
      ['anamnese_v8', '1.0.0', id, 'Grund'],
    ]) {
      const f = await fehler(users.therapist, SPEICHERN, [
        patients.max,
        id,
        instrument,
        version,
        HEUTE,
        '{}',
        korrigiert,
        grund,
      ]);
      expect(f?.message).toMatch(/identity is fixed/);
    }
  });

  it('verwirft einen Entwurf und protokolliert es', async () => {
    const id = await erheben();
    await asUserCommitted(users.therapist, VERWERFEN, [id]);
    const { rows } = await asUser(users.therapist, LESEN, [patients.max]);
    expect(rows).toEqual([]);
    expect(
      (await auditZeilen('questionnaire_response.discarded')).map((z) => z.subject_id),
    ).toEqual([id]);
  });

  it('weist ein Datum in der Zukunft, fremde Formen und zu grosse Antworten ab', async () => {
    const zukunft = await fehler(users.therapist, SPEICHERN, [
      patients.max,
      null,
      'anamnese_v8',
      '1.0.0',
      tagInTagen(2),
      '{}',
      null,
      null,
    ]);
    expect(zukunft?.message).toMatch(/future/);

    for (const antworten of ['[]', '{"Frage 1": {}}', '{"frage": 3}']) {
      const f = await fehler(users.therapist, SPEICHERN, [
        patients.max,
        null,
        'anamnese_v8',
        '1.0.0',
        HEUTE,
        antworten,
        null,
        null,
      ]);
      expect(f?.code).toBe('22023');
    }

    const riesig = JSON.stringify({ text: { text: 'x'.repeat(70000) } });
    expect(
      (
        await fehler(users.therapist, SPEICHERN, [
          patients.max,
          null,
          'anamnese_v8',
          '1.0.0',
          HEUTE,
          riesig,
          null,
          null,
        ])
      )?.message,
    ).toMatch(/too large/);

    const version = await fehler(users.therapist, SPEICHERN, [
      patients.max,
      null,
      'anamnese_v8',
      '1.0',
      HEUTE,
      '{}',
      null,
      null,
    ]);
    expect(version?.code).toBe('23514');
  });
});

describe('Rollen und Grenzen (ADR-013 Punkt 9 Nr. 1)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('laesst owner, therapist und team_lead erheben, office nicht', async () => {
    await erheben(users.ownerTherapist);
    await erheben(users.therapist);
    await erheben(users.teamLead);
    const office = await fehler(users.office, SPEICHERN, [
      patients.max,
      null,
      'anamnese_v8',
      '1.0.0',
      HEUTE,
      '{}',
      null,
      null,
    ]);
    expect(office?.code).toBe('42501');
  });

  it('laesst office lesen (ADR-004 Fassung 2) und protokolliert je Erhebung', async () => {
    const id = await erheben();
    const { rows } = await asUserCommitted(users.office, LESEN, [patients.max]);
    expect(rows).toHaveLength(1);
    const gelesen = await auditZeilen('questionnaire_response.viewed');
    expect(gelesen).toEqual([
      { subject_id: id, context: { surface: 'web', patient_id: patients.max } },
    ]);
  });

  it('schreibt keine Antworten ins Auditlog (ADR-010 Punkt 3)', async () => {
    await erheben();
    const { rows } = await asPostgres<{ context: string }>(
      `select context::text as context from public.audit_log where action like 'questionnaire_response.%'`,
    );
    for (const zeile of rows) expect(zeile.context).not.toMatch(/schmerz|auswahl|wert/);
  });

  it('weist Patientenkonto (fremde Person) und Trainingsbetreuung mit denied-Eintrag ab', async () => {
    await erheben(users.therapist, ANTWORTEN, patients.erika);
    // Max sieht Erikas Bogen nicht - und auch seinen eigenen nicht ueber diesen Pfad.
    await erwarteAbgewiesenenLeseversuch(
      users.patientMax,
      LESEN,
      [patients.erika],
      'questionnaire_response.viewed',
    );
    await erwarteAbgewiesenenLeseversuch(
      users.patientMax,
      LESEN,
      [patients.max],
      'questionnaire_response.viewed',
    );
    // Anderer Leistungsbereich: Die Trainingsrolle sieht keine Befunde (ADR-021 Punkt 6).
    await erwarteAbgewiesenenLeseversuch(
      users.trainer,
      LESEN,
      [patients.erika],
      'questionnaire_response.viewed',
    );
  });

  it('laesst Patientenkonto und Trainingsbetreuung nicht schreiben', async () => {
    for (const nutzer of [users.patientMax, users.trainer]) {
      const f = await fehler(nutzer, SPEICHERN, [
        patients.max,
        null,
        'anamnese_v8',
        '1.0.0',
        HEUTE,
        '{}',
        null,
        null,
      ]);
      expect(f?.code).toBe('42501');
    }
  });

  it('haelt die Mandantengrenze: fremde Akte wie eine unbekannte, fremde Erhebung unsichtbar', async () => {
    const f = await fremdeOrganisation();
    const eigen = await erheben();

    const fremdeAkte = await fehler(users.therapist, SPEICHERN, [
      f.patient,
      null,
      'anamnese_v8',
      '1.0.0',
      HEUTE,
      '{}',
      null,
      null,
    ]);
    const unbekannt = await fehler(users.therapist, SPEICHERN, [
      '66666666-6666-4666-8666-0000000000ff',
      null,
      'anamnese_v8',
      '1.0.0',
      HEUTE,
      '{}',
      null,
      null,
    ]);
    expect(fremdeAkte?.message).toBe(unbekannt?.message);

    // Die fremde Praxis sieht die Erhebung nicht, schliesst sie nicht ab, verwirft sie nicht.
    const { rows } = await asUser(f.owner, LESEN, [patients.max]);
    expect(rows).toEqual([]);
    expect((await fehler(f.owner, ABSCHLIESSEN, [eigen]))?.code).toBe('P0002');
    expect((await fehler(f.owner, VERWERFEN, [eigen]))?.code).toBe('P0002');
  });

  it('weist einen Aufruf ohne Sitzung ab', async () => {
    await expect(asAnon(LESEN, [patients.max])).rejects.toThrow();
    expect((await fehler(null, LESEN, [patients.max]))?.message).toMatch(/not authenticated/);
  });

  it('gibt der Rolle authenticated kein Tabellenrecht', async () => {
    await erheben();
    await expect(
      asUser(users.therapist, 'select * from public.patient_questionnaire_responses'),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('Auskunft und Loeschung', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('nimmt die Erhebungen samt Antworten in die Kopie nach Art. 15', async () => {
    await erheben();
    const { rows } = await asUser<{
      daten: { tabellen: Record<string, Record<string, unknown>[]> };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.max,
    ]);
    const erhebungen = rows[0]!.daten.tabellen['patient_questionnaire_responses']!;
    expect(erhebungen).toHaveLength(1);
    expect(erhebungen[0]!['answers']).toEqual(ANTWORTEN);
    expect(erhebungen[0]!['author']).toBe('Anna Beispiel');
  });

  it('faellt mit der Akte, auch abgeschlossen', async () => {
    const id = await erheben();
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [id]);
    // Der Loeschweg der Aufbewahrung (ADR-008): Die Erhebung haengt an der Akte.
    await asPostgres(
      'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
      [patients.max],
    );
    const { rows } = await asPostgres('select 1 from public.patient_questionnaire_responses');
    expect(rows).toEqual([]);
  });
});

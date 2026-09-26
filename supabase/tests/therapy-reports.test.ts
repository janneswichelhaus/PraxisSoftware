import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Therapiebericht an die Verordner:in (DOK-005a, ANN-121, ANN-122).
 *
 * Der Bericht übernimmt wörtlich, was die Therapeut:in ankreuzt, und friert
 * es beim Abschluss ein. Geprüft werden Rollen nach ADR-013 Punkt 9 Nr. 1,
 * das Auditlog ohne Inhalt, die Unveränderlichkeit, die Auskunft nach Art. 15
 * und der Löschweg mit der Akte.
 */

const { users, patients, organizationId } = SEED;

/** Folgeverordnung von Max bei Dr. Probst (Seed). */
const VERORDNUNG = '88888888-8888-4888-8888-000000000002';
/** Selbstzahler von Erika (Seed) — ohne Verordner:in. */
const SELBSTZAHLER = '88888888-8888-4888-8888-000000000005';
const ANNA = '55555555-5555-4555-8555-000000000002';
const PRAXIS = '33333333-3333-4333-8333-000000000001';

const ANLEGEN = 'select public.create_therapy_report($1::uuid) as id';
const SPEICHERN = `select public.update_therapy_report($1::uuid, $2, $3, $4::uuid[], $5::uuid, $6::timestamptz) as stand`;
const ABSCHLIESSEN = 'select public.complete_therapy_report($1::uuid, $2::timestamptz)';
const VERWERFEN = 'select public.discard_therapy_report($1::uuid)';
// Der Stand mit Mikrosekunden als Text: Ein JS-Date kennt nur Millisekunden,
// und der Server vergleicht genau (wie in treatment-notes.test.ts).
const LESEN = `select id, status,
                        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as updated_at,
                        note_ids, document
                 from public.get_therapy_report($1::uuid)`;
const LISTE = `select id, status, recommendation, recommendation_by_name, recommendation_on::text as recommendation_on
                 from public.list_patient_therapy_reports($1::uuid)`;
const QUELLEN =
  'select kind, id, in_treatment_basis from public.list_therapy_report_sources($1::uuid)';
const DRUCK = 'select public.log_therapy_report_export($1::uuid)';

interface Bericht {
  id: string;
  status: string;
  updated_at: string;
  note_ids: string[];
  document: Record<string, unknown> & {
    eintraege: { inhalt: string; verfasser: string }[];
    empfehlung: { inhalt: string; verfasser: string; datum: string } | null;
    koerperschema: { markierungen: unknown[] } | null;
    verordnung: { termine_durchgefuehrt: number; diagnosis: string };
    empfaenger: { family_name: string; fax: string } | null;
    praxis: { name: string; street?: string };
  };
}

async function fehler(userId: string | null, sql: string, params: unknown[]) {
  try {
    await asUser(userId, sql, params);
    return null;
  } catch (f) {
    return f as { code?: string; message: string };
  }
}

/**
 * Ein durchgeführter Termin der Verordnung mit finalisierter Dokumentation.
 * Der Seed enthält bewusst keine klinischen Freitexte.
 */
async function eintragAnlegen(
  inhalt: string,
  tageZurueck: number,
  status: 'final' | 'draft' = 'final',
  verordnung: string | null = VERORDNUNG,
  patientId: string = patients.max,
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `with termin as (
       insert into public.appointments
         (organization_id, patient_id, staff_member_id, location_id, appointment_type,
          status, starts_at, ends_at, treatment_basis_id, completed_at, completed_by)
       values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'practice', 'documented',
               now() - make_interval(days => $5::int),
               now() - make_interval(days => $5::int) + interval '30 minutes',
               $6::uuid, now() - make_interval(days => $5::int), $7::uuid)
       returning id
     )
     insert into public.treatment_notes
       (organization_id, appointment_id, status, content, created_by, updated_by,
        finalisation_kind, finalized_at, finalized_by)
     select $1::uuid, termin.id, $8, $9, $7::uuid, $7::uuid,
            case when $8 = 'final' then 'manual' end,
            case when $8 = 'final' then now() end,
            case when $8 = 'final' then $7::uuid end
     from termin
     returning id`,
    [
      organizationId,
      patientId,
      ANNA,
      PRAXIS,
      tageZurueck,
      verordnung,
      users.therapist,
      status,
      inhalt,
    ],
  );
  return rows[0]!.id;
}

/** Eine abgeschlossene Erhebung mit zwei Kreisen im Körperschema. */
async function koerperschemaAnlegen(patientId: string = patients.max): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.patient_questionnaire_responses
       (organization_id, patient_id, instrument_id, definition_version, status, recorded_on,
        answers, created_by, completed_at, completed_by)
     values ($1::uuid, $2::uuid, 'anamnese', '1.0.0', 'abgeschlossen', current_date - 20,
             '{"schmerzort": {"markierungen": [{"x": 0.3, "y": 0.2, "bereich": "schulter_rechts"},
                                               {"x": 0.31, "y": 0.25, "bereich": "schulter_rechts"}]},
               "beruf": {"text": "Synthetisch"}}'::jsonb,
             $3::uuid, now(), $3::uuid)
     returning id`,
    [organizationId, patientId, users.therapist],
  );
  return rows[0]!.id;
}

async function anlegen(userId: string = users.therapist, basis = VERORDNUNG): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(userId, ANLEGEN, [basis]);
  return rows[0]!.id;
}

async function lesen(id: string, userId: string = users.therapist): Promise<Bericht> {
  const { rows } = await asUserCommitted<Bericht>(userId, LESEN, [id]);
  return rows[0]!;
}

async function speichern(
  id: string,
  felder: {
    text?: string | null;
    empfehlung?: string | null;
    eintraege?: string[];
    koerper?: string | null;
  },
  userId: string = users.therapist,
): Promise<void> {
  const stand = (await lesen(id, userId)).updated_at;
  await asUserCommitted(userId, SPEICHERN, [
    id,
    felder.text ?? null,
    felder.empfehlung ?? null,
    felder.eintraege ?? [],
    felder.koerper ?? null,
    stand,
  ]);
}

async function abschliessen(id: string, userId: string = users.therapist): Promise<void> {
  const stand = (await lesen(id, userId)).updated_at;
  await asUserCommitted(userId, ABSCHLIESSEN, [id, stand]);
}

describe('Therapiebericht', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('baut den Entwurf aus Verordnung, angekreuzten Einträgen und Körperschema', async () => {
    const eintrag = await eintragAnlegen('Synthetischer Befund: Abduktion rechts 90 Grad.', 20);
    await eintragAnlegen('Synthetisch: nicht angekreuzt.', 10);
    const koerper = await koerperschemaAnlegen();
    const id = await anlegen();
    await speichern(id, {
      text: 'Synthetisch: Verlauf aus meiner Sicht.',
      empfehlung: 'Synthetisch: Folgeverordnung sinnvoll.',
      eintraege: [eintrag],
      koerper,
    });

    const bericht = await lesen(id, users.office);
    expect(bericht.status).toBe('entwurf');
    expect(bericht.document.eintraege).toEqual([
      expect.objectContaining({
        inhalt: 'Synthetischer Befund: Abduktion rechts 90 Grad.',
        verfasser: 'Anna Beispiel',
      }),
    ]);
    expect(bericht.document.koerperschema?.markierungen).toHaveLength(2);
    expect(bericht.document.verordnung.diagnosis).toContain('Schulter');
    expect(bericht.document.verordnung.termine_durchgefuehrt).toBe(2);
    expect(bericht.document.empfaenger).toMatchObject({
      family_name: 'Probst',
      fax: '+49 7071 0000402',
    });
    expect(bericht.document.empfehlung).toMatchObject({
      inhalt: 'Synthetisch: Folgeverordnung sinnvoll.',
      verfasser: 'Anna Beispiel',
    });
    // Briefkopf ohne Steuer- und Bankangaben (ANN-123).
    const praxis = JSON.stringify(bericht.document.praxis);
    expect(praxis).not.toMatch(/iban|tax|bic|steuer/i);
  });

  it('nennt als Quelle der Empfehlung, wer sie geschrieben hat, nicht wer zuletzt gespeichert hat', async () => {
    const id = await anlegen();
    await speichern(id, { empfehlung: 'Synthetisch: Weiter wie bisher.' });
    await speichern(
      id,
      { empfehlung: 'Synthetisch: Weiter wie bisher.', text: 'Synthetisch.' },
      users.teamLead,
    );
    const bericht = await lesen(id);
    expect(bericht.document.empfehlung?.verfasser).toBe('Anna Beispiel');
  });

  it('friert den Bericht beim Abschluss ein - spätere Änderungen der Akte ändern ihn nicht', async () => {
    const eintrag = await eintragAnlegen('Synthetisch: Stand bei Abschluss.', 5);
    const id = await anlegen();
    await speichern(id, { empfehlung: 'Synthetisch: Empfehlung.', eintraege: [eintrag] });
    await abschliessen(id);

    await asPostgres(
      `update public.treatment_notes set content = 'Spaeter geaendert' where id = $1`,
      [eintrag],
    );
    const bericht = await lesen(id);
    expect(bericht.status).toBe('abgeschlossen');
    expect(bericht.document.eintraege[0]!.inhalt).toBe('Synthetisch: Stand bei Abschluss.');
    expect(bericht.document['abgeschlossen']).toMatchObject({ von: 'Anna Beispiel' });

    const stand = bericht.updated_at;
    const aendern = await fehler(users.therapist, SPEICHERN, [id, 'neu', null, [], null, stand]);
    expect(aendern?.code).toBe('55000');
    expect((await fehler(users.therapist, VERWERFEN, [id]))?.code).toBe('55000');
    // Auch am Anwendungspfad vorbei bleibt er, wie er ist.
    await expect(
      asPostgres(`update public.therapy_reports set report_text = 'x' where id = $1`, [id]),
    ).rejects.toThrow(/completed/);
  });

  it('liefert die Empfehlung mit Quelle und Datum für die Verordnung', async () => {
    const id = await anlegen();
    await speichern(id, { empfehlung: 'Synthetisch: Keine weitere Verordnung.' });
    await abschliessen(id);
    const { rows } = await asUser<{ id: string; recommendation_on: string }>(users.office, LISTE, [
      patients.max,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      status: 'abgeschlossen',
      recommendation: 'Synthetisch: Keine weitere Verordnung.',
      recommendation_by_name: 'Anna Beispiel',
    });
    expect(rows[0]!.recommendation_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('weist leere Berichte, Entwürfe als Eintrag und fremde Einträge ab', async () => {
    const id = await anlegen();
    const stand = (await lesen(id)).updated_at;
    expect((await fehler(users.therapist, ABSCHLIESSEN, [id, stand]))?.code).toBe('22023');

    const entwurf = await eintragAnlegen('Synthetisch: Entwurf.', 3, 'draft');
    expect(
      (await fehler(users.therapist, SPEICHERN, [id, null, null, [entwurf], null, stand]))?.code,
    ).toBe('22023');

    const f = await fremdeOrganisation();
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.patient_questionnaire_responses
         (organization_id, patient_id, instrument_id, definition_version, status, recorded_on,
          answers, completed_at)
       values ($1::uuid, $2::uuid, 'anamnese', '1.0.0', 'abgeschlossen', current_date,
               '{"k": {"markierungen": [{"x": 0.1, "y": 0.1, "bereich": "kopf"}]}}'::jsonb, now())
       returning id`,
      [f.organizationId, f.patient],
    );
    expect(
      (await fehler(users.therapist, SPEICHERN, [id, null, null, [], rows[0]!.id, stand]))?.code,
    ).toBe('22023');
  });

  it('erkennt einen gleichzeitigen Stand und verliert keinen Text still', async () => {
    const id = await anlegen();
    const alt = (await lesen(id)).updated_at;
    await speichern(id, { text: 'Synthetisch: erste Fassung.' }, users.teamLead);
    expect(
      (await fehler(users.therapist, SPEICHERN, [id, 'zweite', null, [], null, alt]))?.code,
    ).toBe('40001');
  });

  it('gibt es nur zu einer Verordnung, nicht zum Selbstzahler', async () => {
    expect((await fehler(users.therapist, ANLEGEN, [SELBSTZAHLER]))?.code).toBe('22023');
  });

  it('verwirft einen Entwurf und protokolliert alles ohne Inhalt', async () => {
    const id = await anlegen();
    await speichern(id, { text: 'Synthetischer Berichtstext.' });
    await asUserCommitted(users.therapist, DRUCK, [id]);
    await asUserCommitted(users.therapist, VERWERFEN, [id]);
    expect((await asUser(users.therapist, LISTE, [patients.max])).rows).toEqual([]);

    const { rows } = await asPostgres<{ action: string; context: Record<string, unknown> }>(
      `select action, context from public.audit_log
        where action like 'therapy_report.%' and outcome = 'success' order by occurred_at, action`,
    );
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        'therapy_report.created',
        'therapy_report.updated',
        'therapy_report.viewed',
        'therapy_report.exported',
        'therapy_report.discarded',
      ]),
    );
    for (const zeile of rows) {
      expect(JSON.stringify(zeile.context)).not.toContain('Synthetisch');
      expect(zeile.context['patient_id']).toBe(patients.max);
    }
  });

  it('protokolliert die Auswahlquellen je Eintrag und Erhebung', async () => {
    const eintrag = await eintragAnlegen('Synthetisch: Quelle.', 4);
    const anderer = await eintragAnlegen('Synthetisch: ohne Verordnung.', 6, 'final', null);
    const koerper = await koerperschemaAnlegen();
    const id = await anlegen();
    const { rows } = await asUserCommitted<{
      kind: string;
      id: string;
      in_treatment_basis: boolean | null;
    }>(users.therapist, QUELLEN, [id]);
    expect(rows).toEqual(
      expect.arrayContaining([
        { kind: 'eintrag', id: eintrag, in_treatment_basis: true },
        { kind: 'eintrag', id: anderer, in_treatment_basis: false },
        { kind: 'koerperschema', id: koerper, in_treatment_basis: null },
      ]),
    );
    const { rows: protokoll } = await asPostgres<{ action: string; subject_id: string }>(
      `select action, subject_id from public.audit_log
        where action in ('treatment_note.viewed', 'questionnaire_response.viewed') and outcome = 'success'`,
    );
    expect(protokoll.map((p) => p.subject_id).sort()).toEqual([eintrag, anderer, koerper].sort());
  });

  it('lässt office lesen und drucken, aber nicht schreiben', async () => {
    const id = await anlegen();
    expect((await fehler(users.office, ANLEGEN, [VERORDNUNG]))?.code).toBe('42501');
    const stand = (await lesen(id)).updated_at;
    expect((await fehler(users.office, SPEICHERN, [id, 'x', null, [], null, stand]))?.code).toBe(
      '42501',
    );
    expect((await fehler(users.office, ABSCHLIESSEN, [id, stand]))?.code).toBe('42501');
    expect((await fehler(users.office, VERWERFEN, [id]))?.code).toBe('42501');
    expect((await lesen(id, users.office)).id).toBe(id);
    await asUserCommitted(users.office, DRUCK, [id]);
    // Wer nicht schreibt, hat nichts auszuwählen.
    await erwarteAbgewiesenenLeseversuch(users.office, QUELLEN, [id], 'treatment_note.viewed');
  });

  it('weist Patientenkonto, fremde Person und Trainingsbetreuung mit denied-Eintrag ab', async () => {
    const id = await anlegen();
    for (const nutzer of [users.patientMax, users.patientErika, users.trainer]) {
      await erwarteAbgewiesenenLeseversuch(nutzer, LESEN, [id], 'therapy_report.viewed');
      await erwarteAbgewiesenenLeseversuch(nutzer, LISTE, [patients.max], 'therapy_report.viewed');
      expect((await fehler(nutzer, ANLEGEN, [VERORDNUNG]))?.code).toBe('42501');
      expect((await fehler(nutzer, DRUCK, [id]))?.code).toBe('42501');
    }
  });

  it('hält die Mandantengrenze', async () => {
    const f = await fremdeOrganisation();
    const id = await anlegen();
    expect((await asUser(f.owner, LESEN, [id])).rows).toEqual([]);
    expect((await asUser(f.owner, LISTE, [patients.max])).rows).toEqual([]);
    expect((await fehler(f.owner, DRUCK, [id]))?.code).toBe('P0002');
  });

  it('schreibt nie in einen Bericht einer fremden Organisation', async () => {
    const f = await fremdeOrganisation();
    const { rows } = await asPostgres<{ id: string; stand: string }>(
      `with grundlage as (
         insert into public.treatment_bases
           (organization_id, patient_id, treatment_basis_kind, issued_on, appointment_count)
         values ($1::uuid, $2::uuid, 'self_pay', current_date, 1)
         returning id
       )
       insert into public.therapy_reports (organization_id, patient_id, treatment_basis_id)
       select $1::uuid, $2::uuid, grundlage.id from grundlage
       returning id,
         to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as stand`,
      [f.organizationId, f.patient],
    );
    const { id, stand } = rows[0]!;
    expect((await fehler(users.therapist, SPEICHERN, [id, 'x', null, [], null, stand]))?.code).toBe(
      'P0002',
    );
    expect((await fehler(users.therapist, ABSCHLIESSEN, [id, stand]))?.code).toBe('P0002');
    expect((await fehler(users.therapist, VERWERFEN, [id]))?.code).toBe('P0002');
    expect((await fehler(users.therapist, QUELLEN, [id]))?.code).toBe('P0002');
    expect((await asUser(users.therapist, LESEN, [id])).rows).toEqual([]);
    const { rows: bestand } = await asPostgres<{ report_text: string | null }>(
      'select report_text from public.therapy_reports where id = $1',
      [id],
    );
    expect(bestand).toEqual([{ report_text: null }]);
  });

  it('nimmt keinen Eintrag und kein Körperschema einer anderen Akte derselben Praxis', async () => {
    const fremderEintrag = await eintragAnlegen(
      'Synthetisch: Erika.',
      5,
      'final',
      null,
      patients.erika,
    );
    const fremdesSchema = await koerperschemaAnlegen(patients.erika);
    const id = await anlegen();
    const stand = (await lesen(id)).updated_at;
    expect(
      (await fehler(users.therapist, SPEICHERN, [id, null, null, [fremderEintrag], null, stand]))
        ?.code,
    ).toBe('22023');
    expect(
      (await fehler(users.therapist, SPEICHERN, [id, null, null, [], fremdesSchema, stand]))?.code,
    ).toBe('22023');
  });

  it('nimmt ein ersetztes Körperschema nicht mehr, ein bloßer Korrekturentwurf hält es nicht auf', async () => {
    const koerper = await koerperschemaAnlegen();
    const id = await anlegen();
    const korrektur = `insert into public.patient_questionnaire_responses
         (organization_id, patient_id, instrument_id, definition_version, status, recorded_on,
          answers, supersedes_response_id, change_reason, completed_at)
       values ($1::uuid, $2::uuid, 'anamnese', '1.0.0', $4, current_date, '{}'::jsonb,
               $3::uuid, 'Synthetische Korrektur',
               case when $4 = 'abgeschlossen' then now() end)`;
    await asPostgres(korrektur, [organizationId, patients.max, koerper, 'entwurf']);
    await speichern(id, { koerper, text: 'Synthetisch.' });

    await asPostgres(
      'delete from public.patient_questionnaire_responses where supersedes_response_id = $1',
      [koerper],
    );
    await asPostgres(korrektur, [organizationId, patients.max, koerper, 'abgeschlossen']);
    const stand = (await lesen(id)).updated_at;
    expect((await fehler(users.therapist, ABSCHLIESSEN, [id, stand]))?.code).toBe('22023');
  });

  it('lässt das Patientenkonto weder auswählen noch speichern', async () => {
    const id = await anlegen();
    const stand = (await lesen(id)).updated_at;
    await erwarteAbgewiesenenLeseversuch(users.patientMax, QUELLEN, [id], 'treatment_note.viewed');
    expect(
      (await fehler(users.patientMax, SPEICHERN, [id, 'x', null, [], null, stand]))?.code,
    ).toBe('42501');
  });

  it('hält eine Verordnung mit Bericht gegen stilles Löschen', async () => {
    await anlegen();
    const loeschen = await fehler(
      users.therapist,
      'select public.delete_treatment_basis($1::uuid)',
      [VERORDNUNG],
    );
    expect(loeschen?.code).toBe('23503');
  });

  it('gehört zur Kopie nach Art. 15 und fällt mit der Akte', async () => {
    const eintrag = await eintragAnlegen('Synthetisch: Auskunft.', 8);
    const koerper = await koerperschemaAnlegen();
    const id = await anlegen();
    await speichern(id, { empfehlung: 'Synthetisch.', eintraege: [eintrag], koerper });
    await abschliessen(id);

    const { rows } = await asUser<{ daten: { tabellen: Record<string, { snapshot: unknown }[]> } }>(
      users.ownerTherapist,
      'select public.export_patient_record($1::uuid) as daten',
      [patients.max],
    );
    const berichte = rows[0]!.daten.tabellen['therapy_reports']!;
    expect(berichte).toHaveLength(1);
    expect(berichte[0]!.snapshot).not.toBeNull();

    await asPostgres(
      'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
      [patients.max],
    );
    expect((await asPostgres('select 1 from public.therapy_reports')).rows).toEqual([]);
  });
});

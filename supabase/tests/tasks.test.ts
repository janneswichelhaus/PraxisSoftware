import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Aufgaben und Wiedervorlagen (PRX-012, ANN-142).
 *
 * Geprüft werden die vier Praxisrollen und ihre Gegenproben (ADR-013 Punkt 9
 * Nr. 1), die Mandantengrenze auch für Bezüge, das Auditlog ohne Titel, die
 * Auskunft nach Art. 15 und die Frist im Löschlauf.
 */
const { users, patients, organizationId } = SEED;

const ANNA = '55555555-5555-4555-8555-000000000002';

const ANLEGEN = `select public.create_task($1, $2, $3::date, $4::uuid, $5::uuid) as id`;
const AENDERN = `select public.update_task($1::uuid, $2, $3, $4::date, $5::uuid, $6::uuid)`;
const ERLEDIGEN = `select public.set_task_done($1::uuid, $2::boolean)`;
const LOESCHEN = `select public.delete_task($1::uuid)`;
const LISTE = `select * from public.list_tasks($1, $2::uuid)`;

interface Aufgabe {
  id: string;
  title: string;
  due_on: string | null;
  status: string;
  patient_id: string | null;
  patient_family_name: string | null;
  assigned_name: string | null;
  created_by_name: string | null;
  done_by_name: string | null;
}

interface Stand {
  created_by: string | null;
  updated_by: string | null;
  done_by: string | null;
  done_at: string | null;
}

/** Wer und wann an der Aufgabe, mikrosekundengenau (LOG-EPIC-001). */
async function stand(id: string): Promise<Stand> {
  const { rows } = await asPostgres<Stand>(
    `select created_by, updated_by, done_by,
            to_char(done_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') as done_at
       from public.tasks where id = $1`,
    [id],
  );
  return rows[0]!;
}

async function anlegen(
  konto: string = users.office,
  f: { titel?: string; faellig?: string | null; an?: string | null; patient?: string | null } = {},
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, ANLEGEN, [
    f.titel ?? 'Verordnung nachfordern',
    'Synthetisch: Praxis Probst anrufen.',
    f.faellig === undefined ? '2026-10-01' : f.faellig,
    f.an === undefined ? ANNA : f.an,
    f.patient === undefined ? patients.max : f.patient,
  ]);
  return rows[0]!.id;
}

async function vorhanden(id: string): Promise<boolean> {
  const { rows } = await asPostgres('select 1 from public.tasks where id = $1', [id]);
  return rows.length === 1;
}

describe('Aufgaben (PRX-012)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('laesst alle vier Praxisrollen anlegen, lesen, aendern, erledigen und loeschen', async () => {
    for (const konto of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
      const id = await anlegen(konto);
      await asUserCommitted(konto, AENDERN, [id, 'Rückruf', null, null, null, null]);
      await asUserCommitted(konto, ERLEDIGEN, [id, true]);
      const { rows } = await asUser<Aufgabe>(konto, LISTE, ['done', null]);
      expect(
        rows.map((r) => r.id),
        konto,
      ).toContain(id);
      await asUserCommitted(konto, LOESCHEN, [id]);
      expect(await vorhanden(id)).toBe(false);
    }
  });

  it('liefert offene Aufgaben nach Faelligkeit, mit Person, Zuweisung und anlegender Person', async () => {
    const spaeter = await anlegen(users.office, { faellig: '2026-10-05' });
    const frueher = await anlegen(users.office, { faellig: '2026-10-01', titel: 'Rückruf' });
    const ohne = await anlegen(users.office, { faellig: null, patient: null, an: null });

    const { rows } = await asUser<Aufgabe>(users.therapist, LISTE, ['open', null]);
    expect(rows.map((r) => r.id)).toEqual([frueher, spaeter, ohne]);
    expect(rows[0]).toMatchObject({
      title: 'Rückruf',
      patient_id: patients.max,
      patient_family_name: 'Mustermann',
      assigned_name: 'Anna Beispiel',
    });
    expect(rows[0]!.created_by_name).toBeTruthy();
    expect(rows[2]).toMatchObject({ patient_id: null, assigned_name: null });
  });

  it('filtert je Person', async () => {
    const max = await anlegen();
    await anlegen(users.office, { patient: patients.erika });
    const { rows } = await asUser<Aufgabe>(users.office, LISTE, ['open', patients.max]);
    expect(rows.map((r) => r.id)).toEqual([max]);
  });

  it('erledigt und oeffnet wieder - ein doppelter Tipp schreibt nichts zweimal', async () => {
    const id = await anlegen();
    await asUserCommitted(users.therapist, ERLEDIGEN, [id, true]);
    const nachErstemTipp = await stand(id);
    await asUserCommitted(users.therapist, ERLEDIGEN, [id, true]);
    expect(await stand(id)).toEqual(nachErstemTipp);
    const erledigt = await asUser<Aufgabe>(users.office, LISTE, ['done', null]);
    expect(erledigt.rows[0]).toMatchObject({ id, status: 'done' });
    expect(erledigt.rows[0]!.done_by_name).toBeTruthy();

    // Wer und wann stehen an der Aufgabe, nicht im Auditlog (LOG-EPIC-001).
    expect(nachErstemTipp).toMatchObject({
      created_by: users.office,
      done_by: users.therapist,
      updated_by: users.therapist,
    });
    expect(nachErstemTipp.done_at).not.toBeNull();

    await asUserCommitted(users.office, ERLEDIGEN, [id, false]);
    expect(await stand(id)).toMatchObject({
      done_by: null,
      done_at: null,
      updated_by: users.office,
    });
    const { rows } = await asPostgres('select 1 from public.audit_log where subject_id = $1', [id]);
    expect(rows).toEqual([]);
  });

  it('schreibt ins Auditlog nie Titel oder Notiz (ADR-010 Punkt 3, LOG-EPIC-001)', async () => {
    const id = await anlegen(users.office, { titel: 'Rückruf Frau Geheimname' });
    await asUserCommitted(users.office, AENDERN, [
      id,
      'Rückruf Frau Geheimname',
      'Synthetisch: Notiz Geheimwort',
      null,
      null,
      patients.max,
    ]);
    // Anlegen und Aendern schreiben keinen Auditeintrag mehr (LOG-EPIC-001);
    // Titel und Notiz stehen in keinem Eintrag.
    const { rows } = await asPostgres<{ eintrag: string }>(
      `select row_to_json(a)::text as eintrag from public.audit_log a
        where subject_id = $1
           or row_to_json(a)::text like '%Geheimname%'
           or row_to_json(a)::text like '%Geheimwort%'`,
      [id],
    );
    expect(rows).toEqual([]);
    expect(await stand(id)).toMatchObject({
      created_by: users.office,
      updated_by: users.office,
    });
  });

  it('weist Trainingsbetreuung und Patientenkonto beim Schreiben ab', async () => {
    const id = await anlegen();
    for (const konto of [users.trainer, users.patientMax]) {
      for (const [sql, params] of [
        [ANLEGEN, ['x', null, null, null, null]],
        [AENDERN, [id, 'x', null, null, null, null]],
        [ERLEDIGEN, [id, true]],
        [LOESCHEN, [id]],
      ] as const) {
        const fehler = await abgefangen(asUser(konto, sql, [...params]));
        expect(fehler?.message, `${konto} ${sql}`).toMatch(/not allowed to write tasks/);
      }
    }
    expect(await vorhanden(id)).toBe(true);
  });

  it('weist Trainingsbetreuung und Patientenkonto beim Lesen protokolliert ab (G6b)', async () => {
    await anlegen();
    for (const konto of [users.trainer, users.patientMax]) {
      await erwarteAbgewiesenenLeseversuch(konto, LISTE, ['open', null], 'tasks.read');
    }
  });

  it('endet an der eigenen Praxis - auch fuer Bezuege', async () => {
    const id = await anlegen();
    const fremd = await fremdeOrganisation();

    const liste = await asUser<Aufgabe>(fremd.owner, LISTE, ['open', null]);
    expect(liste.rows).toEqual([]);
    for (const [sql, params] of [
      [AENDERN, [id, 'x', null, null, null, null]],
      [ERLEDIGEN, [id, true]],
      [LOESCHEN, [id]],
    ] as const) {
      const fehler = await abgefangen(asUser(fremd.owner, sql, [...params]));
      expect(fehler?.message).toMatch(/task not found/);
    }

    // Eine fremde Person oder eine fremde Mitarbeiterin laesst sich nicht
    // anhaengen.
    const fremdePerson = await abgefangen(
      asUser(users.office, ANLEGEN, ['x', null, null, null, fremd.patient]),
    );
    expect(fremdePerson?.message).toMatch(/patient not found/);
    const fremdeKraft = await abgefangen(
      asUser(users.office, ANLEGEN, ['x', null, null, fremd.staffMember, null]),
    );
    expect(fremdeKraft?.message).toMatch(/staff member not found/);
  });

  it('verlangt einen Titel und begrenzt die Laengen', async () => {
    const leer = await abgefangen(asUser(users.office, ANLEGEN, ['  ', null, null, null, null]));
    expect(leer?.message).toMatch(/tasks_title_check/);
    const lang = await abgefangen(
      asUser(users.office, ANLEGEN, ['x'.repeat(201), null, null, null, null]),
    );
    expect(lang?.message).toMatch(/tasks_title_check/);
  });

  it('ist ohne Session und fuer anon nicht aufrufbar; die Tabelle ist verschlossen', async () => {
    await expect(asUser(null, LISTE, ['open', null])).rejects.toThrow(/not authenticated/);
    await expect(asAnon(LISTE, ['open', null])).rejects.toThrow(/permission denied/i);
    await expect(asUser(users.ownerTherapist, 'select * from public.tasks')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('gehoert zur Auskunft nach Art. 15', async () => {
    await anlegen();
    await anlegen(users.office, { patient: patients.erika, titel: 'Nicht Max' });
    const { rows } = await asUser<{ daten: { tabellen: Record<string, unknown[]> } }>(
      users.ownerTherapist,
      'select public.export_patient_record($1::uuid) as daten',
      [patients.max],
    );
    expect(rows[0]!.daten.tabellen['tasks']).toEqual([
      expect.objectContaining({
        title: 'Verordnung nachfordern',
        status: 'open',
        assigned_to: 'Anna Beispiel',
      }),
    ]);
  });
});

describe('Aufgaben im Loeschlauf (ANN-142)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function erledigtVor(monate: number, patient: string | null = patients.max) {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.tasks (organization_id, patient_id, title, status, done_at)
       values ($1::uuid, $2::uuid, 'Erledigt', 'done', now() - make_interval(months => $3::int))
       returning id`,
      [organizationId, patient, monate],
    );
    return rows[0]!.id;
  }

  it('loescht eine erledigte Aufgabe zwoelf Monate nach dem Erledigen und journalisiert sie', async () => {
    const alt = await erledigtVor(13);
    const altOhnePerson = await erledigtVor(13, null);
    const jung = await erledigtVor(11);

    await asPostgres('select public.apply_retention()');

    expect(await vorhanden(alt)).toBe(false);
    expect(await vorhanden(altOhnePerson)).toBe(false);
    expect(await vorhanden(jung)).toBe(true);
    const { rows } = await asPostgres<{ retention_class: string }>(
      `select retention_class from public.deletion_journal where target_id = $1`,
      [alt],
    );
    expect(rows).toEqual([{ retention_class: 'aufgabe' }]);
  });

  it('laesst offene Aufgaben stehen, egal wie alt', async () => {
    const id = await anlegen();
    await asPostgres(
      `update public.tasks set created_at = now() - interval '5 years' where id = $1`,
      [id],
    );
    await asPostgres('select public.apply_retention()');
    expect(await vorhanden(id)).toBe(true);
  });

  it('haelt eine faellige Aufgabe unter Loeschsperre der Akte', async () => {
    const alt = await erledigtVor(13);
    await asPostgres(
      `insert into public.legal_holds (organization_id, subject_type, subject_id, reason, placed_by)
       values ($1::uuid, 'patient', $2::uuid, 'Laufender Vorgang', $3::uuid)`,
      [organizationId, patients.max, users.ownerTherapist],
    );
    await asPostgres('select public.apply_retention()');
    expect(await vorhanden(alt)).toBe(true);
  });

  it('loescht nach einer Wiederherstellung erneut', async () => {
    const alt = await erledigtVor(13);
    await asPostgres('select public.apply_retention()');
    await asPostgres(
      `insert into public.tasks (id, organization_id, patient_id, title, status, done_at)
       values ($1::uuid, $2::uuid, $3::uuid, 'Erledigt', 'done', now())`,
      [alt, organizationId, patients.max],
    );
    await asPostgres('select public.reapply_deletion_journal()');
    expect(await vorhanden(alt)).toBe(false);
  });

  it('faellt mit der Akte', async () => {
    const id = await anlegen();
    await asPostgres(
      'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
      [patients.max],
    );
    expect(await vorhanden(id)).toBe(false);
  });
});

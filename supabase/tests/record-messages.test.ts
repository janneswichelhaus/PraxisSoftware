import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Klinisch Relevantes kommt in die Akte (KOM-004, §10, IDEA-KOM-007, ANN-312).
 *
 *   * Zuordnen dürfen owner, Therapeut:innen und Teamleitung, nur in der
 *     Behandlung; endgültig, der Inhalt bleibt unverändert.
 *   * Zugeordnet heißt Datenklasse Akte: Der Löschlauf lässt den Vorgang stehen;
 *     er fällt mit der Akte.
 *   * Auskunft (Art. 15) und Plattformexport nennen die Nachrichten.
 *   * Beim Zusammenführen ziehen sie mit; im Training fallen sie nach drei
 *     Jahren, auch wenn Belege bleiben.
 */

const { users, platformAccesses, patients, trainingRelationships, organizationId } = SEED;
const FRAGEN = 'select public.start_platform_message($1::uuid, $2, $3, null, null) as id';
const ZUORDNEN = 'select public.assign_platform_message_to_record($1::uuid)';
const IN_DER_AKTE = 'select public.list_record_platform_messages($1::uuid) as v';
const OEFFNEN = 'select public.get_platform_message($1::uuid) as v';
const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };

async function fragen(
  zugang: string = erika.zugang,
  thema = 'complaint',
  text = 'Knie schmerzt seit gestern',
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(erika.konto, FRAGEN, [
    zugang,
    thema,
    text,
  ]);
  return rows[0]!.id;
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

interface Aktenvorgang {
  id: string;
  record_assigned_by_label: string;
  entries: { body: string; author_kind: string }[];
}

describe('Rückfragen in der Akte (KOM-004)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.platform_messages');
    await asPostgres('delete from public.audit_log');
  });

  it('Therapeut:innen ordnen zu; in der Akte steht der Text unverändert mit Herkunft', async () => {
    const id = await fragen();
    const nicht = await fragen(erika.zugang, 'organisational', 'Termin?');
    const vorher = await asUser<{ v: { can_assign: boolean } }>(users.therapist, OEFFNEN, [id]);
    expect(vorher.rows[0]!.v.can_assign).toBe(true);
    await asUserCommitted(users.therapist, ZUORDNEN, [id]);

    for (const konto of [users.therapist, users.office, users.ownerTherapist, users.teamLead]) {
      const { rows } = await asUserCommitted<{ v: Aktenvorgang[] }>(konto, IN_DER_AKTE, [
        patients.erika,
      ]);
      expect(rows[0]!.v.map((m) => m.id)).toEqual([id]);
      expect(rows[0]!.v[0]!.record_assigned_by_label).toBe('Anna Beispiel');
      expect(rows[0]!.v[0]!.entries).toEqual([
        expect.objectContaining({ body: 'Knie schmerzt seit gestern', author_kind: 'self' }),
      ]);
    }
    expect(
      JSON.stringify((await asUser(users.therapist, IN_DER_AKTE, [patients.erika])).rows),
    ).not.toContain(nicht);
    const nachher = await asUser<{ v: { can_assign: boolean; record_assigned_at: string } }>(
      users.therapist,
      OEFFNEN,
      [id],
    );
    expect(nachher.rows[0]!.v.can_assign).toBe(false);
    expect(nachher.rows[0]!.v.record_assigned_at).toBeTruthy();
    // Lesen in der Akte ist „Akte geöffnet", ohne Inhalt.
    const { rows } = await asPostgres<{ action: string; context: unknown }>(
      `select action, context from public.audit_log where actor_user_id = $1`,
      [users.office],
    );
    expect(rows.map((r) => r.action)).toEqual(['patient_record.viewed']);
    expect(JSON.stringify(rows)).not.toContain('Knie');
  });

  it('endgültig: kein zweites Mal, kein Zurück, auch nicht am Schreibpfad vorbei', async () => {
    const id = await fragen();
    await asUserCommitted(users.therapist, ZUORDNEN, [id]);
    expect(await fehler(asUser(users.ownerTherapist, ZUORDNEN, [id]))).toBe('22023');
    expect(
      await fehler(
        asPostgres(
          `update public.platform_messages
              set record_assigned_at = null, record_assigned_by = null,
                  record_assigned_by_label = null
            where id = $1`,
          [id],
        ),
      ),
    ).toBe('42501');
    // Antworten und erledigen bleiben möglich - der Vorgang ist nicht eingefroren.
    await asUserCommitted(users.therapist, 'select public.answer_platform_message($1::uuid, $2)', [
      id,
      'Bitte kühlen.',
    ]);
  });

  it('nur owner, Therapeut:innen, Teamleitung, nur in der Behandlung', async () => {
    const id = await fragen();
    expect(await fehler(asUser(users.office, ZUORDNEN, [id]))).toBe('42501');
    // Die Trainingsbetreuung liest die Behandlung gar nicht (ADR-021 Punkt 6).
    expect(await fehler(asUser(users.trainer, ZUORDNEN, [id]))).toBe('P0002');
    const fremd = await fremdeOrganisation();
    expect(await fehler(asUser(fremd.owner, ZUORDNEN, [id]))).toBe('P0002');
    expect(await fehler(asUser(erika.konto, ZUORDNEN, [id]))).toBe('42501');
    expect(await fehler(asUser(null, ZUORDNEN, [id]))).toBe('42501');

    const training = await fragen(platformAccesses.erikaTraining, 'organisational', 'Rechnung?');
    expect(await fehler(asUser(users.ownerTherapist, ZUORDNEN, [training]))).toBe('42501');
    const { rows } = await asUser<{ v: { can_assign: boolean } }>(users.ownerTherapist, OEFFNEN, [
      training,
    ]);
    expect(rows[0]!.v.can_assign).toBe(false);

    // Die Akte liest die Trainingsbetreuung nicht, ein Plattformkonto auch nicht.
    expect(await fehler(asUser(users.trainer, IN_DER_AKTE, [patients.erika]))).toBe('42501');
    expect(await fehler(asUser(erika.konto, IN_DER_AKTE, [patients.erika]))).toBe('42501');
    const fremdeAkte = await asUser<{ v: unknown[] }>(fremd.owner, IN_DER_AKTE, [patients.erika]);
    expect(fremdeAkte.rows[0]!.v).toEqual([]);
  });

  it('zugeordnet: der Löschlauf lässt den Vorgang stehen, mit der Akte fällt er', async () => {
    const zugeordnet = await fragen();
    const nicht = await fragen();
    await asUserCommitted(users.therapist, ZUORDNEN, [zugeordnet]);
    await asPostgres(
      `update public.platform_messages
          set status = 'closed', due_on = null, closed_by_side = 'practice',
              closed_at = now() - interval '5 years'`,
    );
    await asPostgres('select public.apply_retention()');
    const { rows } = await asPostgres<{ id: string }>('select id from public.platform_messages');
    expect(rows.map((r) => r.id)).toEqual([zugeordnet]);
    expect(rows.map((r) => r.id)).not.toContain(nicht);
    try {
      await asPostgres(
        'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
        [patients.erika],
      );
      const leer = await asPostgres<{ n: number }>(
        `select (select count(*) from public.platform_messages)
              + (select count(*) from public.platform_message_entries) as n`,
      );
      expect(Number(leer.rows[0]!.n)).toBe(0);
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('Auskunft nach Art. 15 und Plattformexport nennen die Nachrichten', async () => {
    const id = await fragen();
    await asUserCommitted(users.therapist, 'select public.answer_platform_message($1::uuid, $2)', [
      id,
      'Bitte kühlen.',
    ]);
    const auskunft = await asUser<{
      d: { tabellen: { platform_messages: { entries: { body: string; side: string }[] }[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as d', [
      patients.erika,
    ]);
    const nachrichten = auskunft.rows[0]!.d.tabellen.platform_messages;
    expect(nachrichten).toHaveLength(1);
    expect(nachrichten[0]!.entries.map((e) => [e.side, e.body])).toEqual([
      ['person', 'Knie schmerzt seit gestern'],
      ['practice', 'Bitte kühlen.'],
    ]);
    const plattform = await asUser<{ d: { messages: { id: string }[] } }>(
      erika.konto,
      'select public.platform_export($1::uuid) as d',
      [erika.zugang],
    );
    expect(plattform.rows[0]!.d.messages.map((m) => m.id)).toEqual([id]);
  });

  it('beim Zusammenführen ziehen die Rückfragen mit, auch zugeordnete (PRX-018)', async () => {
    const { rows } = await asPostgres<{ patient: string }>(
      `with person as (
         insert into public.persons (organization_id, given_name, family_name)
         values ($1, 'Erika', 'Beispiel-Dublette') returning id
       )
       insert into public.patients (organization_id, person_id, status, care_started_on)
       select $1, id, 'active', current_date - 10 from person returning id as patient`,
      [organizationId],
    );
    const dublette = rows[0]!.patient;
    const nachricht = await asPostgres<{ id: string }>(
      `insert into public.platform_messages
         (organization_id, relationship_kind, relationship_id, patient_id, topic, status, due_on,
          created_by)
       values ($1, 'treatment', $2, $2, 'complaint', 'open', current_date + 2, $3) returning id`,
      [organizationId, dublette, users.office],
    );
    const id = nachricht.rows[0]!.id;
    await asPostgres(
      `insert into public.platform_message_entries
         (organization_id, message_id, side, body, author_kind, created_by)
       values ($1, $2, 'person', 'Frage an der Dublette', 'self', $3)`,
      [organizationId, id, users.office],
    );
    await asUserCommitted(users.therapist, ZUORDNEN, [id]);
    try {
      await asUserCommitted(
        users.ownerTherapist,
        'select public.merge_patients($1::uuid, $2::uuid)',
        [dublette, patients.erika],
      );
      const { rows: nach } = await asPostgres<{ patient_id: string; relationship_id: string }>(
        'select patient_id, relationship_id from public.platform_messages where id = $1',
        [id],
      );
      expect(nach).toEqual([{ patient_id: patients.erika, relationship_id: patients.erika }]);
      const eintraege = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.platform_message_entries where message_id = $1',
        [id],
      );
      expect(eintraege.rows[0]!.n).toBe(1);
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('im Training fallen die Rückfragen nach drei Jahren, auch wenn Belege bleiben', async () => {
    const id = await fragen(platformAccesses.erikaTraining, 'organisational', 'Rechnung?');
    await asPostgres(
      'select app.reduce_training_relationship($1::uuid, extensions.gen_random_uuid(), now())',
      [trainingRelationships.erika],
    );
    const { rows } = await asPostgres('select 1 from public.platform_messages where id = $1', [id]);
    expect(rows).toHaveLength(0);
    const journal = await asPostgres<{ retention_class: string }>(
      'select retention_class from public.deletion_journal where target_id = $1',
      [id],
    );
    expect(journal.rows).toEqual([{ retention_class: 'trainingsverhaeltnis' }]);
  });
});

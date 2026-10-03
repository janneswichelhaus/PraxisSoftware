import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
  tagInTagen,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Ereignisse im Verlauf (FRB-002e, ANN-106).
 *
 * Eine Markierung ist eine Angabe der Praxis, gesetzt und entfernt, nie
 * geändert. Geprüft werden Rollen nach ADR-013 Punkt 9 Nr. 1, der Nachweis
 * am Datenmodell statt im Auditlog (ANN-230) und die Auskunft nach Art. 15.
 */

const { users, patients } = SEED;

const SETZEN = 'select public.add_patient_course_event($1::uuid, $2::date, $3, $4) as id';
const ENTFERNEN = 'select public.remove_patient_course_event($1::uuid)';
const LESEN = `select id, occurred_on::text as occurred_on, kind, note, author_name
                 from public.list_patient_course_events($1::uuid)`;
const ENTFERNTE = `select id, kind, note, author_name, removed_by_name, removed_at is not null as entfernt
                     from public.list_removed_patient_course_events($1::uuid)`;

async function setzen(
  userId: string = users.therapist,
  kind = 'operation',
  note: string | null = 'Knie-TEP rechts',
  tag = tagInTagen(-10),
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(userId, SETZEN, [
    patients.max,
    tag,
    kind,
    note,
  ]);
  return rows[0]!.id;
}

async function fehler(userId: string | null, sql: string, params: unknown[]) {
  try {
    await asUser(userId, sql, params);
    return null;
  } catch (f) {
    return f as { code?: string; message: string };
  }
}

describe('Ereignisse im Verlauf', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('setzt eine Markierung und liefert sie mit Namen', async () => {
    const id = await setzen();
    const { rows } = await asUser(users.office, LESEN, [patients.max]);
    expect(rows).toEqual([
      {
        id,
        occurred_on: tagInTagen(-10),
        kind: 'operation',
        note: 'Knie-TEP rechts',
        author_name: 'Anna Beispiel',
      },
    ]);
  });

  it('nimmt einen kuenftigen Tag an - eine geplante Operation gehoert vorher hinein', async () => {
    await setzen(users.therapist, 'operation', null, tagInTagen(30));
  });

  it('weist eine unbekannte Art und eine zu lange Notiz ab', async () => {
    const art = await fehler(users.therapist, SETZEN, [patients.max, tagInTagen(0), 'schub', null]);
    expect(art?.code).toBe('23514');
    const lang = await fehler(users.therapist, SETZEN, [
      patients.max,
      tagInTagen(0),
      'sonstiges',
      'x'.repeat(201),
    ]);
    expect(lang?.code).toBe('23514');
  });

  it('weist Setzen und Entfernen an der Markierung nach und schreibt keinen Auditeintrag (LOG-EPIC-001)', async () => {
    const id = await setzen();
    await asUserCommitted(users.teamLead, ENTFERNEN, [id]);
    expect((await asUser(users.therapist, LESEN, [patients.max])).rows).toEqual([]);

    // Wer und wann stehen an der Markierung selbst (ANN-230).
    const zeile = await asPostgres<{
      created_by: string;
      created_at: string | null;
      removed_by: string | null;
      removed_at: string | null;
    }>(
      `select created_by, created_at::text as created_at, removed_by, removed_at::text as removed_at
         from public.patient_course_events where id = $1`,
      [id],
    );
    expect(zeile.rows[0]!.created_by).toBe(users.therapist);
    expect(zeile.rows[0]!.created_at).not.toBeNull();
    expect(zeile.rows[0]!.removed_by).toBe(users.teamLead);
    expect(zeile.rows[0]!.removed_at).not.toBeNull();

    // Weder Notiz noch Art im Auditlog: es steht dort gar kein Schreibvorgang.
    const { rows } = await asPostgres<{ action: string }>(
      `select action from public.audit_log where outcome = 'success' order by occurred_at`,
    );
    expect(rows).toEqual([]);
  });

  it('entfernt nachvollziehbar: Zeile bleibt, Inhalt und Urheber unter "Entfernte Ereignisse" (BEF-102)', async () => {
    const id = await setzen();
    await asUserCommitted(users.teamLead, ENTFERNEN, [id]);

    const zeile = await asPostgres<{ removed_by: string; note: string }>(
      'select removed_by, note from public.patient_course_events where id = $1',
      [id],
    );
    expect(zeile.rows).toEqual([{ removed_by: users.teamLead, note: 'Knie-TEP rechts' }]);

    // Office liest die Akte, also auch die entfernten Ereignisse.
    const { rows } = await asUser<{ removed_by_name: string | null }>(users.office, ENTFERNTE, [
      patients.max,
    ]);
    expect(rows).toMatchObject([
      {
        id,
        kind: 'operation',
        note: 'Knie-TEP rechts',
        author_name: 'Anna Beispiel',
        entfernt: true,
      },
    ]);
    expect(rows[0]!.removed_by_name).not.toBeNull();

    // Ein zweites Entfernen findet nichts mehr.
    expect((await fehler(users.teamLead, ENTFERNEN, [id]))?.code).toBe('P0002');
  });

  it('weist das Lesen entfernter Ereignisse ohne Leserecht ab und haelt die Mandantengrenze', async () => {
    const id = await setzen();
    await asUserCommitted(users.therapist, ENTFERNEN, [id]);
    await erwarteAbgewiesenenLeseversuch(
      users.trainer,
      ENTFERNTE,
      [patients.max],
      'patient_course_event.viewed',
    );
    const f = await fremdeOrganisation();
    expect((await asUser(f.owner, ENTFERNTE, [patients.max])).rows).toEqual([]);
  });

  it('laesst office lesen, aber nicht setzen oder entfernen', async () => {
    const id = await setzen();
    expect(
      (await fehler(users.office, SETZEN, [patients.max, tagInTagen(0), 'urlaub', null]))?.code,
    ).toBe('42501');
    expect((await fehler(users.office, ENTFERNEN, [id]))?.code).toBe('42501');
  });

  it('weist Patientenkonto und Trainingsbetreuung beim Lesen mit denied-Eintrag ab', async () => {
    await setzen();
    await erwarteAbgewiesenenLeseversuch(
      users.patientErika,
      LESEN,
      [patients.max],
      'patient_course_event.viewed',
    );
    await erwarteAbgewiesenenLeseversuch(
      users.trainer,
      LESEN,
      [patients.max],
      'patient_course_event.viewed',
    );
    for (const nutzer of [users.patientMax, users.trainer]) {
      expect(
        (await fehler(nutzer, SETZEN, [patients.max, tagInTagen(0), 'urlaub', null]))?.code,
      ).toBe('42501');
    }
  });

  it('haelt die Mandantengrenze', async () => {
    const f = await fremdeOrganisation();
    const id = await setzen();
    expect((await asUser(f.owner, LESEN, [patients.max])).rows).toEqual([]);
    expect((await fehler(f.owner, ENTFERNEN, [id]))?.code).toBe('P0002');
    const fremd = await fehler(users.therapist, SETZEN, [f.patient, tagInTagen(0), 'urlaub', null]);
    expect(fremd?.code).toBe('P0002');
  });

  it('gehoert zur Kopie nach Art. 15 und faellt mit der Akte', async () => {
    await setzen();
    const { rows } = await asUser<{ daten: { tabellen: Record<string, unknown[]> } }>(
      users.ownerTherapist,
      'select public.export_patient_record($1::uuid) as daten',
      [patients.max],
    );
    expect(rows[0]!.daten.tabellen['patient_course_events']).toHaveLength(1);

    // Ein entferntes Ereignis bleibt Teil der Auskunft, gekennzeichnet.
    const [ereignis] = (
      await asPostgres<{ id: string }>('select id from public.patient_course_events')
    ).rows;
    await asUserCommitted(users.therapist, ENTFERNEN, [ereignis!.id]);
    const danach = await asUser<{
      daten: { tabellen: Record<string, { removed_at: string | null }[]> };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.max,
    ]);
    const liste = danach.rows[0]!.daten.tabellen['patient_course_events']!;
    expect(liste).toHaveLength(1);
    expect(liste[0]!.removed_at).not.toBeNull();

    await asPostgres(
      'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
      [patients.max],
    );
    expect((await asPostgres('select 1 from public.patient_course_events')).rows).toEqual([]);
  });
});

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
 * geändert. Geprüft werden Rollen nach ADR-013 Punkt 9 Nr. 1, das Auditlog
 * ohne Notiz und die Auskunft nach Art. 15.
 */

const { users, patients } = SEED;

const SETZEN = 'select public.add_patient_course_event($1::uuid, $2::date, $3, $4) as id';
const ENTFERNEN = 'select public.remove_patient_course_event($1::uuid)';
const LESEN = `select id, occurred_on::text as occurred_on, kind, note, author_name
                 from public.list_patient_course_events($1::uuid)`;

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

  it('entfernt eine Markierung und protokolliert Setzen und Entfernen ohne Art und Notiz', async () => {
    const id = await setzen();
    await asUserCommitted(users.teamLead, ENTFERNEN, [id]);
    expect((await asUser(users.therapist, LESEN, [patients.max])).rows).toEqual([]);

    const { rows } = await asPostgres<{ action: string; context: Record<string, unknown> }>(
      `select action, context from public.audit_log
        where action like 'patient_course_event.%' and outcome = 'success' order by occurred_at`,
    );
    expect(rows.map((r) => r.action)).toEqual([
      'patient_course_event.created',
      'patient_course_event.removed',
    ]);
    // Weder Notiz noch Art: "Operation" waere schon eine klinische Angabe.
    for (const zeile of rows) {
      expect(zeile.context).toEqual({ surface: 'web', patient_id: patients.max });
    }
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

    await asPostgres(
      'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
      [patients.max],
    );
    expect((await asPostgres('select 1 from public.patient_course_events')).rows).toEqual([]);
  });
});

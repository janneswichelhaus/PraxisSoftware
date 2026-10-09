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
 * Nachrichten in der Praxis (KOM-002, KOM-003; DSN-001 Abschnitt 6, D1).
 *
 *   * Behandlung: owner, Therapeut:innen, Teamleitung und Büro lesen (E15);
 *     auf Übung und Beschwerden antworten nur die therapeutischen Rollen,
 *     das Büro auf Termin, Rechnung und Sonstiges (ANN-310).
 *   * Training: owner und Trainingsbetreuung; das Büro nur „Termin oder
 *     Rechnung" (ANN-311). Kein Durchgriff (ADR-021 Punkt 6).
 *   * Die Liste trägt keinen Text; das Öffnen steht als „Akte geöffnet" im
 *     Protokoll (ADR-010 Fassung 3).
 */

const { users, platformAccesses, patients, trainingRelationships, organizationId } = SEED;
const FRAGEN = 'select public.start_platform_message($1::uuid, $2, $3, null, null) as id';
const LISTE = 'select * from public.list_platform_messages($1, $2::uuid, $3)';
const OEFFNEN = 'select public.get_platform_message($1::uuid) as v';
const ANTWORTEN = 'select public.answer_platform_message($1::uuid, $2) as id';
const ERLEDIGEN = 'select public.close_platform_message_by_practice($1::uuid)';
const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };
const tina = { konto: users.plattformTina, zugang: platformAccesses.tinaTraining };

interface Zeile {
  id: string;
  topic: string;
  status: string;
  overdue: boolean;
  given_name: string;
  family_name: string;
  can_answer: boolean;
  asked_by: string;
  entry_count: number;
}

async function fragen(
  wer: { konto: string; zugang: string },
  thema: string,
  text = 'Eine Frage',
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(wer.konto, FRAGEN, [
    wer.zugang,
    thema,
    text,
  ]);
  return rows[0]!.id;
}

async function liste(
  konto: string,
  bereich: string | null = null,
  verhaeltnis: string | null = null,
  erledigte = false,
): Promise<Zeile[]> {
  const { rows } = await asUser<Zeile>(konto, LISTE, [bereich, verhaeltnis, erledigte]);
  return rows;
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function gesundheitImTraining() {
  await asPostgres(
    `insert into public.training_consent_records
       (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by)
     values ($1, $2, 'consent_granted', 'training_health_data', current_date, $3)`,
    [organizationId, trainingRelationships.tina, users.trainer],
  );
}

describe('Nachrichten in der Praxis (KOM-002, KOM-003)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.platform_messages');
    await asPostgres('delete from public.audit_log');
  });

  it('Behandlung: die vier Praxisrollen sehen die Liste ohne Text, mit Person', async () => {
    const id = await fragen(erika, 'complaint', 'Knie schmerzt seit gestern');
    for (const konto of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
      const zeilen = await liste(konto, 'treatment');
      expect(zeilen.map((z) => z.id)).toEqual([id]);
      expect(zeilen[0]).toEqual(
        expect.objectContaining({
          topic: 'complaint',
          status: 'open',
          overdue: false,
          given_name: 'Erika',
          asked_by: 'self',
          entry_count: 1,
        }),
      );
      expect(JSON.stringify(zeilen)).not.toContain('Knie schmerzt');
    }
    // Die Trainingsbetreuung sieht die Behandlung nicht (ADR-021 Punkt 6).
    expect(await liste(users.trainer, 'treatment')).toEqual([]);
    expect(await liste(users.trainer)).toEqual([]);
  });

  it('antworten: therapeutische Rollen auf alles, das Büro nur organisatorisch (ANN-310)', async () => {
    const beschwerde = await fragen(erika, 'complaint');
    const termin = await fragen(erika, 'organisational');
    const sonst = await fragen(erika, 'other');

    const zeilen = await liste(users.office, 'treatment');
    const darf = Object.fromEntries(zeilen.map((z) => [z.id, z.can_answer]));
    expect(darf).toEqual({ [beschwerde]: false, [termin]: true, [sonst]: true });

    expect(await fehler(asUser(users.office, ANTWORTEN, [beschwerde, 'Bitte kühlen']))).toBe(
      '42501',
    );
    await asUserCommitted(users.office, ANTWORTEN, [termin, 'Freitag geht.']);
    await asUserCommitted(users.therapist, ANTWORTEN, [beschwerde, 'Ich rufe Sie an.']);

    const v = await asUser<{
      v: { status: string; entries: { side: string; author_label: string }[] };
    }>(users.therapist, OEFFNEN, [beschwerde]);
    expect(v.rows[0]!.v.status).toBe('answered');
    expect(v.rows[0]!.v.entries.map((e) => e.side)).toEqual(['person', 'practice']);
    expect(v.rows[0]!.v.entries[1]!.author_label).toBe('Anna Beispiel');

    // Auf der Plattform steht die Antwort als „Praxis", ohne Namen.
    const plattform = await asUser<{
      d: { messages: { id: string; status: string; entries: Record<string, unknown>[] }[] };
    }>(erika.konto, 'select public.platform_messages($1::uuid) as d', [erika.zugang]);
    const sicht = plattform.rows[0]!.d.messages.find((m) => m.id === beschwerde)!;
    expect(sicht.status).toBe('answered');
    expect(sicht.entries[1]).toEqual(
      expect.objectContaining({ author: 'practice', author_label: null }),
    );
    expect(JSON.stringify(sicht)).not.toContain('Anna');
  });

  it('ein Nachtrag nach der Antwort: wieder offen, neue Frist; erledigen schließt', async () => {
    const id = await fragen(erika, 'organisational');
    await asUserCommitted(users.office, ANTWORTEN, [id, 'Freitag geht.']);
    await asUserCommitted(
      erika.konto,
      'select public.add_platform_message_entry($1::uuid, $2::uuid, $3)',
      [erika.zugang, id, 'Und um welche Uhrzeit?'],
    );
    let [zeile] = await liste(users.office, 'treatment');
    expect(zeile!.status).toBe('open');
    await asUserCommitted(users.office, ERLEDIGEN, [id]);
    expect(await liste(users.office, 'treatment')).toEqual([]);
    [zeile] = await liste(users.office, 'treatment', null, true);
    expect(zeile!.status).toBe('closed');
    expect(await fehler(asUser(users.office, ANTWORTEN, [id, 'Noch was']))).toBe('22023');
    expect(await fehler(asUser(users.office, ERLEDIGEN, [id]))).toBe('22023');
  });

  it('überfällig, wenn die Frist vorbei ist (ANN-309)', async () => {
    const id = await fragen(erika, 'other');
    await asPostgres(
      `update public.platform_messages set due_on = app.training_today($2::uuid) - 1 where id = $1`,
      [id, organizationId],
    );
    const [zeile] = await liste(users.office, 'treatment');
    expect(zeile!.overdue).toBe(true);
    await asUserCommitted(users.office, ANTWORTEN, [id, 'Erledigt.']);
    const [beantwortet] = await liste(users.office, 'treatment');
    expect(beantwortet!.overdue).toBe(false);
  });

  it('öffnen steht als „Akte geöffnet" im Protokoll, ohne Inhalt', async () => {
    const id = await fragen(erika, 'complaint', 'Knie schmerzt');
    await asUserCommitted(users.office, OEFFNEN, [id]);
    const { rows } = await asPostgres<{ action: string; subject_id: string; context: unknown }>(
      `select action, subject_id, context from public.audit_log where actor_user_id = $1`,
      [users.office],
    );
    expect(rows.map((r) => [r.action, r.subject_id])).toEqual([
      ['patient_record.viewed', patients.erika],
    ]);
    expect(JSON.stringify(rows)).not.toContain('Knie');
    // Die Liste allein protokolliert nichts.
    await asPostgres('delete from public.audit_log');
    await liste(users.office, 'treatment');
    const leer = await asPostgres('select 1 from public.audit_log');
    expect(leer.rows).toHaveLength(0);
  });

  it('Training: owner und Trainingsbetreuung alles, das Büro nur Termin oder Rechnung (ANN-311)', async () => {
    await gesundheitImTraining();
    const beschwerde = await fragen(tina, 'complaint', 'Schulter zwickt');
    const rechnung = await fragen(tina, 'organisational');
    const sonst = await fragen(tina, 'other');

    for (const konto of [users.ownerTherapist, users.trainer]) {
      expect((await liste(konto, 'training')).map((z) => z.id).sort()).toEqual(
        [beschwerde, rechnung, sonst].sort(),
      );
    }
    const buero = await liste(users.office, 'training');
    expect(buero.map((z) => z.id)).toEqual([rechnung]);
    expect(buero[0]!.can_answer).toBe(true);
    expect(await fehler(asUser(users.office, OEFFNEN, [beschwerde]))).toBe('P0002');
    expect(await fehler(asUser(users.office, OEFFNEN, [sonst]))).toBe('P0002');
    expect(await fehler(asUser(users.office, ANTWORTEN, [sonst, 'x']))).toBe('P0002');
    await asUserCommitted(users.office, ANTWORTEN, [rechnung, 'Ist korrigiert.']);

    // Therapeut:innen und Teamleitung sehen im Training nichts.
    for (const konto of [users.therapist, users.teamLead]) {
      expect(await liste(konto, 'training')).toEqual([]);
      expect(await fehler(asUser(konto, OEFFNEN, [beschwerde]))).toBe('P0002');
      expect(await fehler(asUser(konto, ANTWORTEN, [beschwerde, 'x']))).toBe('P0002');
    }
    await asUserCommitted(users.trainer, ANTWORTEN, [beschwerde, 'Wir schauen beim Termin.']);
    await asUserCommitted(users.trainer, OEFFNEN, [beschwerde]);
    const { rows } = await asPostgres<{ action: string }>(
      `select action from public.audit_log where actor_user_id = $1`,
      [users.trainer],
    );
    expect(rows.map((r) => r.action)).toEqual(['training_relationship.viewed']);
  });

  it('nach Verhältnis gefiltert - für Akte und Trainingsverhältnis', async () => {
    const behandlung = await fragen(erika, 'other');
    const training = await fragen(
      { konto: erika.konto, zugang: platformAccesses.erikaTraining },
      'other',
    );
    expect((await liste(users.ownerTherapist, null, patients.erika)).map((z) => z.id)).toEqual([
      behandlung,
    ]);
    expect(
      (await liste(users.ownerTherapist, null, trainingRelationships.erika)).map((z) => z.id),
    ).toEqual([training]);
    expect(await liste(users.ownerTherapist, null, patients.max)).toEqual([]);
  });

  it('andere Organisation, Plattformkonto, ohne Anmeldung: nichts', async () => {
    const id = await fragen(erika, 'other');
    const fremd = await fremdeOrganisation();
    expect(await liste(fremd.owner)).toEqual([]);
    expect(await fehler(asUser(fremd.owner, OEFFNEN, [id]))).toBe('P0002');
    expect(await fehler(asUser(fremd.owner, ANTWORTEN, [id, 'x']))).toBe('P0002');
    expect(await fehler(asUser(fremd.owner, ERLEDIGEN, [id]))).toBe('P0002');
    for (const konto of [erika.konto, null]) {
      expect(await fehler(asUser(konto, LISTE, [null, null, false]))).toBe('42501');
      expect(await fehler(asUser(konto, OEFFNEN, [id]))).toBe('42501');
      expect(await fehler(asUser(konto, ANTWORTEN, [id, 'x']))).toBe('42501');
      expect(await fehler(asUser(konto, ERLEDIGEN, [id]))).toBe('42501');
    }
  });

  it('die Antwortfrist ändert nur owner, 1 bis 10 Werktage (ANN-309)', async () => {
    const SETZEN = 'select public.set_message_response_workdays($1)';
    try {
      for (const konto of [users.office, users.therapist, users.trainer, erika.konto]) {
        expect(await fehler(asUser(konto, SETZEN, [3]))).toBe('42501');
      }
      expect(await fehler(asUser(users.ownerTherapist, SETZEN, [0]))).toBe('22023');
      expect(await fehler(asUser(users.ownerTherapist, SETZEN, [11]))).toBe('22023');
      await asUserCommitted(users.ownerTherapist, SETZEN, [3]);
      const { rows } = await asUser<{ n: number }>(
        users.office,
        'select public.get_message_response_workdays() as n',
      );
      expect(rows[0]!.n).toBe(3);
      const plattform = await asUser<{ d: { response_workdays: number } }>(
        erika.konto,
        'select public.platform_messages($1::uuid) as d',
        [erika.zugang],
      );
      expect(plattform.rows[0]!.d.response_workdays).toBe(3);
    } finally {
      await asPostgres('update public.organizations set message_response_workdays = 2');
    }
  });
});

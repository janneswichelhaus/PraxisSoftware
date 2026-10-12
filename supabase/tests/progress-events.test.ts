import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { praxistag, zugewiesenerPlan } from './helpers/plaene';

/**
 * Verlaufsbild mit Ereignissen (OUT-001, IDEA-OUT-005, ANN-364).
 *
 *   * Im Training vermerken Inhaber:in und Trainingsbetreuung Ereignisse am
 *     Verhältnis, nur mit Einwilligung zu Gesundheitsangaben (ADR-021 Punkt 4);
 *     Entfernen nimmt aus dem Verlauf und bleibt am Datensatz.
 *   * `get_checkins` liefert dazu die Ereignisse, die Planwechsel und die Tage
 *     durchgeführter Termine – in der Behandlung die Ereignisse der Akte.
 *   * Kein Durchgriff zwischen den Bereichen, keine fremde Organisation, kein
 *     Plattformkonto, kein Tabellenrecht.
 */

const { users, patients, trainingRelationships, organizationId } = SEED;

const LESEN = 'select public.get_checkins($1, $2::uuid) as daten';
const VERMERKEN = 'select public.add_training_course_event($1::uuid, $2::date, $3, $4) as id';
const ENTFERNEN = 'select public.remove_training_course_event($1::uuid)';

interface Ereignis {
  id: string;
  occurred_on: string;
  kind: string;
  note: string | null;
  author_name: string | null;
}

interface Daten {
  events: Ereignis[];
  plan_events: { occurred_on: string; kind: string; title: string }[];
  appointment_days: string[];
  events_writable: boolean;
  health_consent: boolean | null;
}

async function lesen(konto: string, art: string, verhaeltnis: string): Promise<Daten | null> {
  const { rows } = await asUser<{ daten: Daten | null }>(konto, LESEN, [art, verhaeltnis]);
  return rows[0]!.daten;
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function einwilligen(verhaeltnis: string, art = 'consent_granted'): Promise<void> {
  await asPostgres(
    `insert into public.training_consent_records
       (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by)
     values ($1, $2, $3, 'training_health_data', current_date, $4)`,
    [organizationId, verhaeltnis, art, users.trainer],
  );
}

async function vermerken(
  konto: string,
  verhaeltnis: string,
  tag: string,
  art = 'erkrankung',
  notiz: string | null = 'Grippe',
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, VERMERKEN, [
    verhaeltnis,
    tag,
    art,
    notiz,
  ]);
  return rows[0]!.id;
}

describe('Ereignisse im Verlauf des Trainings (OUT-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.training_course_events');
    await asPostgres('delete from public.training_consent_records');
    await asPostgres('delete from public.audit_log');
  });

  it('ohne Einwilligung kein Vermerk; mit ihr vermerken owner und Trainingsbetreuung', async () => {
    const tag = await praxistag(-3);
    expect(await fehler(vermerken(users.trainer, trainingRelationships.tina, tag))).toBe('42501');
    const ohne = await lesen(users.trainer, 'training', trainingRelationships.tina);
    expect(ohne).toMatchObject({ events_writable: false, health_consent: false, events: [] });

    await einwilligen(trainingRelationships.tina);
    await vermerken(users.trainer, trainingRelationships.tina, tag);
    await vermerken(users.ownerTherapist, trainingRelationships.tina, tag, 'urlaub', null);

    for (const konto of [users.trainer, users.ownerTherapist, users.office]) {
      const daten = await lesen(konto, 'training', trainingRelationships.tina);
      expect(daten!.events).toHaveLength(2);
      expect(daten!.events[0]).toMatchObject({
        occurred_on: tag,
        kind: 'erkrankung',
        note: 'Grippe',
        author_name: 'Tom Trainingsbetreuung',
      });
      expect(daten!.health_consent).toBe(true);
    }
    expect(
      (await lesen(users.trainer, 'training', trainingRelationships.tina))!.events_writable,
    ).toBe(true);
    // Das Büro liest im Training alles, schreibt aber nichts (ADR-021 Punkt 10).
    expect(
      (await lesen(users.office, 'training', trainingRelationships.tina))!.events_writable,
    ).toBe(false);
  });

  it('ein Widerruf sperrt den nächsten Vermerk; was steht, bleibt lesbar', async () => {
    await einwilligen(trainingRelationships.tina);
    await vermerken(users.trainer, trainingRelationships.tina, await praxistag(-1));
    await asPostgres(
      `insert into public.training_consent_records
         (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by,
          recorded_at)
       values ($1, $2, 'consent_withdrawn', 'training_health_data', current_date, $3,
               now() + interval '1 second')`,
      [organizationId, trainingRelationships.tina, users.trainer],
    );
    expect(
      await fehler(vermerken(users.trainer, trainingRelationships.tina, await praxistag(0))),
    ).toBe('42501');
    const daten = await lesen(users.trainer, 'training', trainingRelationships.tina);
    expect(daten).toMatchObject({ health_consent: false, events_writable: false });
    expect(daten!.events).toHaveLength(1);
  });

  it('prüft Art, Notiz und Tag', async () => {
    await einwilligen(trainingRelationships.tina);
    const tag = await praxistag(0);
    expect(await fehler(vermerken(users.trainer, trainingRelationships.tina, tag, 'schub'))).toBe(
      '23514',
    );
    expect(
      await fehler(
        vermerken(users.trainer, trainingRelationships.tina, tag, 'sonstiges', 'x'.repeat(201)),
      ),
    ).toBe('23514');
    expect(
      await fehler(
        asUser(users.trainer, VERMERKEN, [trainingRelationships.tina, null, 'urlaub', null]),
      ),
    ).toBe('22023');
    // Leere Notiz heißt keine Notiz; ein künftiger Tag ist erlaubt.
    await vermerken(
      users.trainer,
      trainingRelationships.tina,
      await praxistag(10),
      'operation',
      '  ',
    );
    const daten = await lesen(users.trainer, 'training', trainingRelationships.tina);
    expect(daten!.events[0]).toMatchObject({ kind: 'operation', note: null });
  });

  it('Rolle ohne Recht, Plattformkonto, ohne Anmeldung: abgewiesen', async () => {
    await einwilligen(trainingRelationships.tina);
    const tag = await praxistag(0);
    for (const konto of [users.office, users.therapist, users.teamLead, users.plattformTina]) {
      expect(await fehler(vermerken(konto, trainingRelationships.tina, tag))).toBe('42501');
    }
    expect(
      await fehler(asUser(null, VERMERKEN, [trainingRelationships.tina, tag, 'urlaub', null])),
    ).toBe('42501');
    // Wer das Training nicht liest, bekommt nichts – auch keine Ereignisse.
    expect(await lesen(users.therapist, 'training', trainingRelationships.tina)).toBeNull();
    expect(await fehler(lesen(users.plattformTina, 'training', trainingRelationships.tina))).toBe(
      '42501',
    );
  });

  it('unbekanntes und fremdes Verhältnis gibt es nicht; nach Vertragsende kein neuer Vermerk', async () => {
    await einwilligen(trainingRelationships.tina);
    const tag = await praxistag(0);
    expect(
      await fehler(vermerken(users.trainer, 'eeeeeeee-eeee-4eee-8eee-0000000000ff', tag)),
    ).toBe('P0002');
    expect(await fehler(vermerken(users.trainer, FREMDE_ORGANISATION.patient, tag))).toBe('P0002');

    const id = await vermerken(users.trainer, trainingRelationships.tina, tag);
    await asPostgres(
      'update public.training_relationships set contract_ended_on = current_date where id = $1',
      [trainingRelationships.tina],
    );
    try {
      expect(await fehler(vermerken(users.trainer, trainingRelationships.tina, tag))).toBe('22023');
      // Ein falscher Vermerk lässt sich auch danach entfernen.
      await asUserCommitted(users.trainer, ENTFERNEN, [id]);
    } finally {
      await asPostgres(
        'update public.training_relationships set contract_ended_on = null where id = $1',
        [trainingRelationships.tina],
      );
    }
  });

  it('Entfernen nimmt aus dem Verlauf; Inhalt und wer entfernt hat bleiben', async () => {
    await einwilligen(trainingRelationships.tina);
    const id = await vermerken(users.trainer, trainingRelationships.tina, await praxistag(-2));
    expect(await fehler(asUser(users.office, ENTFERNEN, [id]))).toBe('42501');
    expect(await fehler(asUser(users.plattformTina, ENTFERNEN, [id]))).toBe('42501');
    await asUserCommitted(users.ownerTherapist, ENTFERNEN, [id]);
    expect((await lesen(users.trainer, 'training', trainingRelationships.tina))!.events).toEqual(
      [],
    );
    const { rows } = await asPostgres<{ note: string; removed_by: string }>(
      'select note, removed_by from public.training_course_events where id = $1',
      [id],
    );
    expect(rows[0]).toEqual({ note: 'Grippe', removed_by: users.ownerTherapist });
    // Ein zweites Mal gibt es nicht; eine fremde Kennung auch nicht.
    expect(await fehler(asUser(users.trainer, ENTFERNEN, [id]))).toBe('P0002');
    expect(
      await fehler(asUser(users.trainer, ENTFERNEN, ['eeeeeeee-eeee-4eee-8eee-0000000000fe'])),
    ).toBe('P0002');
  });

  it('ein Ereignis einer anderen Organisation lässt sich weder lesen noch entfernen', async () => {
    const { rows: fremd } = await asPostgres<{ id: string }>(
      `insert into public.training_course_events
         (organization_id, training_relationship_id, occurred_on, kind, created_by)
       values ($1, $2, current_date, 'urlaub', $3) returning id`,
      [organizationId, trainingRelationships.tina, users.trainer],
    );
    await asPostgres(
      'update public.training_course_events set organization_id = $1 where id = $2',
      [FREMDE_ORGANISATION.organizationId, fremd[0]!.id],
    );
    expect((await lesen(users.trainer, 'training', trainingRelationships.tina))!.events).toEqual(
      [],
    );
    expect(await fehler(asUser(users.trainer, ENTFERNEN, [fremd[0]!.id]))).toBe('P0002');
  });

  it('Tinas Ereignisse stehen nicht bei Erika (fremde Person)', async () => {
    await einwilligen(trainingRelationships.tina);
    await vermerken(users.trainer, trainingRelationships.tina, await praxistag(-1));
    const erika = await lesen(users.trainer, 'training', trainingRelationships.erika);
    expect(erika!.events).toEqual([]);
  });

  it('kein Tabellenrecht (ADR-004)', async () => {
    for (const konto of [users.trainer, users.ownerTherapist, users.plattformTina]) {
      expect(await fehler(asUser(konto, 'select * from public.training_course_events', []))).toBe(
        '42501',
      );
    }
  });

  it('fällt mit dem Trainingsverhältnis (ADR-008)', async () => {
    await einwilligen(trainingRelationships.tina);
    await vermerken(users.trainer, trainingRelationships.tina, await praxistag(0));
    const { rows } = await asPostgres<{ class_key: string; deletion_mode: string }>(
      `select class_key, deletion_mode from public.retention_assignments
       where table_name = 'training_course_events'`,
    );
    expect(rows).toEqual([
      { class_key: 'trainingsverhaeltnis', deletion_mode: 'ueber_elterndatensatz' },
    ]);
    try {
      await asPostgres(
        'select app.delete_training_relationship($1::uuid, extensions.gen_random_uuid(), now())',
        [trainingRelationships.tina],
      );
      const { rows: rest } = await asPostgres<{ n: string }>(
        'select count(*)::text as n from public.training_course_events',
      );
      expect(rest[0]!.n).toBe('0');
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });
});

describe('Planwechsel, Termine und Ereignisse der Akte im Verlaufsbild (OUT-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.audit_log');
  });

  it('zeigt im Training Zuweisung und Ende eines Plans, aber keinen Entwurf', async () => {
    const plan = await zugewiesenerPlan('training', trainingRelationships.tina, 'Kraft zwei');
    await asUserCommitted(users.trainer, 'select public.create_exercise_plan($1, $2::uuid, $3)', [
      'training',
      trainingRelationships.tina,
      'Nur ein Entwurf',
    ]);
    let daten = await lesen(users.trainer, 'training', trainingRelationships.tina);
    const heute = await praxistag(0);
    expect(daten!.plan_events).toContainEqual({
      occurred_on: heute,
      kind: 'plan_assigned',
      title: 'Kraft zwei',
    });
    expect(daten!.plan_events.map((e) => e.title)).not.toContain('Nur ein Entwurf');
    // Der Behandlungsplan der Akte steht nicht im Training (ADR-021 Punkt 6).
    await zugewiesenerPlan('therapy', patients.erika, 'Knie zu Hause');
    daten = await lesen(users.trainer, 'training', trainingRelationships.tina);
    expect(daten!.plan_events.map((e) => e.title)).not.toContain('Knie zu Hause');
    const erikaTraining = await lesen(users.trainer, 'training', trainingRelationships.erika);
    expect(erikaTraining!.plan_events.map((e) => e.title)).not.toContain('Knie zu Hause');

    await asUserCommitted(users.trainer, 'select public.end_exercise_plan($1::uuid)', [plan]);
    daten = await lesen(users.trainer, 'training', trainingRelationships.tina);
    expect(daten!.plan_events).toContainEqual({
      occurred_on: heute,
      kind: 'plan_ended',
      title: 'Kraft zwei',
    });

    const behandlung = await lesen(users.therapist, 'treatment', patients.erika);
    expect(behandlung!.plan_events.map((e) => e.title)).toContain('Knie zu Hause');
    expect(behandlung!.plan_events.map((e) => e.title)).not.toContain('Kraft zwei');
  });

  it('nennt die Tage durchgeführter Termine, nicht die geplanten', async () => {
    const daten = await lesen(users.trainer, 'training', trainingRelationships.tina);
    // Seed: eine durchgeführte Stunde vorgestern, zwei bestätigte heute und morgen.
    expect(daten!.appointment_days).toEqual([await praxistag(-2)]);
    // Behandlung: Erikas Hausbesuch heute ist abgeschlossen (Seed), Terminart therapy.
    const akte = await lesen(users.therapist, 'treatment', patients.erika);
    expect(akte!.appointment_days).toContain(await praxistag(0));
    expect(akte!.appointment_days).not.toContain(await praxistag(-2));
    // Anderer Bereich (ADR-021 Punkt 6): Erikas Behandlungstermin steht nicht
    // in ihrem Training, Tinas Trainingsstunde in keiner Akte.
    const erikaTraining = await lesen(users.trainer, 'training', trainingRelationships.erika);
    expect(erikaTraining!.appointment_days).toEqual([]);
    const max = await lesen(users.therapist, 'treatment', patients.max);
    expect(max!.appointment_days).not.toContain(await praxistag(-2));
  });

  it('zeigt in der Behandlung die Ereignisse der Akte , protokolliert als Öffnen der Akte', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.add_patient_course_event($1::uuid, $2::date, $3, $4) as id',
      [patients.erika, await praxistag(-5), 'medikation', 'Ibuprofen abgesetzt'],
    );
    const entfernt = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.add_patient_course_event($1::uuid, $2::date, $3, $4) as id',
      [patients.erika, await praxistag(-4), 'urlaub', null],
    );
    await asUserCommitted(users.therapist, 'select public.remove_patient_course_event($1::uuid)', [
      entfernt.rows[0]!.id,
    ]);
    await asPostgres('delete from public.audit_log');

    for (const konto of [users.therapist, users.office, users.ownerTherapist, users.teamLead]) {
      const { rows: gelesen } = await asUserCommitted<{ daten: Daten }>(konto, LESEN, [
        'treatment',
        patients.erika,
      ]);
      const daten = gelesen[0]!.daten;
      expect(daten.events).toEqual([
        expect.objectContaining({
          id: rows[0]!.id,
          kind: 'medikation',
          note: 'Ibuprofen abgesetzt',
        }),
      ]);
      // In der Behandlung vermerkt die Praxis im Befund, nicht hier.
      expect(daten.events_writable).toBe(false);
      expect(daten.health_consent).toBeNull();
    }
    // Das Lesen steht als Öffnen der Akte im Protokoll, ohne Art und Notiz.
    const { rows: protokoll } = await asPostgres<{ action: string; context: unknown }>(
      `select action, context from public.audit_log where action <> 'access.denied'`,
    );
    expect(protokoll).toHaveLength(4);
    expect(new Set(protokoll.map((z) => z.action))).toEqual(new Set(['patient_record.viewed']));
    expect(JSON.stringify(protokoll)).not.toContain('Ibuprofen');
    // Ein Ereignis einer anderen Organisation erscheint nicht.
    await asPostgres('update public.patient_course_events set organization_id = $1 where id = $2', [
      FREMDE_ORGANISATION.organizationId,
      rows[0]!.id,
    ]);
    expect((await lesen(users.therapist, 'treatment', patients.erika))!.events).toEqual([]);
    // Ereignisse der Akte erreichen das Training nicht (ADR-021 Punkt 6).
    const training = await lesen(users.trainer, 'training', trainingRelationships.erika);
    expect(training!.events).toEqual([]);
  });

  it('protokolliert das Lesen weiter als Öffnen des Trainingsverhältnisses, ohne Inhalt', async () => {
    await asUserCommitted(users.trainer, LESEN, ['training', trainingRelationships.tina]);
    const { rows } = await asPostgres<{ action: string; context: Record<string, unknown> }>(
      `select action, context from public.audit_log where actor_user_id = $1`,
      [users.trainer],
    );
    expect(rows.map((z) => [z.action, z.context['view']])).toEqual([
      ['training_relationship.viewed', 'checkins'],
    ]);
    expect(JSON.stringify(rows)).not.toContain('Grippe');
  });
});

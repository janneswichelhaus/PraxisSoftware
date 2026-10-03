import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUserCommitted, resetDatabase } from './helpers/db';
import { auditOperationLabels } from '@/features/audit/actions';

/**
 * LOG-EPIC-001, PR (a): Lesen je Akte und Tag, Abweisungen mit Zähler
 * (ADR-010; Freigabe Jannes 2026-10-03, ANN-230).
 *
 * „Akte geöffnet“ steht höchstens einmal je Person, Akte und Kalendertag der
 * Praxis im Log - gleich, über welchen Lesepfad die Akte gelesen wurde. Eine
 * Abweisung ist `access.denied`; gleichartige innerhalb von zehn Minuten fasst
 * ein Zähler zusammen.
 */

const { users, patients, trainingRelationships, organizationId } = SEED;

interface Zeile {
  id: string;
  action: string;
  actor_user_id: string | null;
  subject_type: string;
  subject_id: string;
  outcome: string;
  context: Record<string, unknown>;
}

async function eintraege(): Promise<Zeile[]> {
  return (
    await asPostgres<Zeile>(
      `select id, action, actor_user_id, subject_type, subject_id, outcome, context
       from public.audit_log order by occurred_at, id`,
    )
  ).rows;
}

/** Tagesbeginn in der Zeitzone der Praxis, wie ihn der Helfer rechnet. */
const TAGESBEGINN = `(select date_trunc('day', now() at time zone o.time_zone) at time zone o.time_zone
                      from public.organizations o where o.id = '${organizationId}')`;

describe('Akte geöffnet: einmal je Person, Akte und Tag', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.audit_log');
  });

  it('schreibt beim zweiten Öffnen am selben Tag nichts', async () => {
    await asUserCommitted(users.therapist, 'select public.log_patient_record_view($1)', [
      patients.max,
    ]);
    await asUserCommitted(users.therapist, 'select public.log_patient_record_view($1)', [
      patients.max,
    ]);

    const zeilen = await eintraege();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({
      action: 'patient_record.viewed',
      actor_user_id: users.therapist,
      subject_type: 'patient',
      subject_id: patients.max,
      outcome: 'success',
    });
  });

  it('fasst alle Lesepfade der Akte in diesem einen Eintrag zusammen', async () => {
    const pfade = [
      'select * from public.list_patient_treatment_notes($1, 50, null, null)',
      'select * from public.list_patient_treatment_bases_clinical($1)',
      'select * from public.list_patient_course_events($1)',
      'select * from public.list_patient_questionnaire_responses($1)',
      'select * from public.list_patient_therapy_reports($1)',
      'select * from public.list_patient_appointment_slip($1, 10)',
      'select public.log_patient_record_view($1)',
    ];
    for (const sql of pfade) {
      await asUserCommitted(users.office, sql, [patients.max]);
    }

    const zeilen = await eintraege();
    expect(zeilen.map((z) => z.action)).toEqual(['patient_record.viewed']);
    expect(zeilen[0]!.actor_user_id).toBe(users.office);
  });

  it('trennt Personen und Akten', async () => {
    await asUserCommitted(users.therapist, 'select public.log_patient_record_view($1)', [
      patients.max,
    ]);
    await asUserCommitted(users.office, 'select public.log_patient_record_view($1)', [
      patients.max,
    ]);
    await asUserCommitted(users.therapist, 'select public.log_patient_record_view($1)', [
      patients.erika,
    ]);

    const zeilen = await eintraege();
    expect(zeilen).toHaveLength(3);
    expect(new Set(zeilen.map((z) => `${z.actor_user_id}:${z.subject_id}`)).size).toBe(3);
  });

  it('beginnt am nächsten Kalendertag der Praxis einen neuen Eintrag', async () => {
    await asUserCommitted(users.therapist, 'select public.log_patient_record_view($1)', [
      patients.max,
    ]);
    // Genau am Tagesbeginn zählt er noch zum heutigen Tag.
    await asPostgres(`update public.audit_log set occurred_at = ${TAGESBEGINN}`);
    await asUserCommitted(users.therapist, 'select public.log_patient_record_view($1)', [
      patients.max,
    ]);
    expect(await eintraege()).toHaveLength(1);

    // Eine Minute davor ist gestern.
    await asPostgres(
      `update public.audit_log set occurred_at = ${TAGESBEGINN} - interval '1 minute'`,
    );
    await asUserCommitted(users.therapist, 'select public.log_patient_record_view($1)', [
      patients.max,
    ]);
    expect(await eintraege()).toHaveLength(2);
  });

  it('schreibt bei gleichzeitigen Aufrufen nur einen Eintrag', async () => {
    await Promise.all(
      Array.from({ length: 6 }, () =>
        asUserCommitted(users.therapist, 'select public.log_patient_record_view($1)', [
          patients.max,
        ]),
      ),
    );
    expect(await eintraege()).toHaveLength(1);
  });

  it('gilt für das Trainingsverhältnis ebenso', async () => {
    await asUserCommitted(users.trainer, 'select * from public.get_training_client($1)', [
      trainingRelationships.tina,
    ]);
    await asUserCommitted(users.trainer, 'select * from public.list_training_protocols($1, 50)', [
      trainingRelationships.tina,
    ]);

    const zeilen = await eintraege();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({
      action: 'training_relationship.viewed',
      subject_type: 'training_relationship',
      subject_id: trainingRelationships.tina,
    });
  });

  it('nimmt im Helfer nur die drei Leseaktionen an', async () => {
    await expect(
      asPostgres(`select app.log_record_access($1, $2, 'patient.updated', 'patient', $3)`, [
        organizationId,
        users.therapist,
        patients.max,
      ]),
    ).rejects.toThrow(/not a record access action/);
  });

  it('ist für keine Anwendungsrolle ausführbar', async () => {
    const { rows } = await asPostgres<{ rolle: string; darf: boolean }>(
      `select r as rolle,
              has_function_privilege(r, 'app.log_record_access(uuid, uuid, text, text, uuid, text, jsonb)', 'execute') as darf
       from unnest(array['anon', 'authenticated', 'service_role']) as r`,
    );
    expect(rows.every((z) => !z.darf)).toBe(true);
  });
});

describe('access.denied: gleichartige Abweisungen mit Zähler', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.audit_log');
  });

  const LIST = 'select * from public.list_audit_events()';

  it('zählt eine wiederholte Abweisung im ersten Eintrag hoch', async () => {
    for (let i = 0; i < 3; i += 1) {
      await asUserCommitted(users.therapist, LIST, []);
    }

    const zeilen = await eintraege();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({
      action: 'access.denied',
      outcome: 'denied',
      actor_user_id: users.therapist,
      subject_type: 'organization',
      subject_id: organizationId,
    });
    expect(zeilen[0]!.context).toMatchObject({
      surface: 'api',
      reason: 'role',
      operation: 'audit_log.read',
      count: 3,
    });
    expect(typeof zeilen[0]!.context['last_at']).toBe('string');
  });

  it('beginnt nach zehn Minuten einen neuen Eintrag', async () => {
    await asUserCommitted(users.therapist, LIST, []);
    await asPostgres(`update public.audit_log set occurred_at = now() - interval '11 minutes'`);
    await asUserCommitted(users.therapist, LIST, []);

    const zeilen = await eintraege();
    expect(zeilen).toHaveLength(2);
    expect(zeilen.map((z) => z.context['count'])).toEqual([1, 1]);
  });

  it('trennt Personen und Operationen', async () => {
    await asUserCommitted(users.therapist, LIST, []);
    await asUserCommitted(users.office, LIST, []);
    await asUserCommitted(users.therapist, 'select * from public.list_deletion_runs()', []);

    const zeilen = await eintraege();
    expect(zeilen).toHaveLength(3);
    expect(zeilen.every((z) => z.context['count'] === 1)).toBe(true);
  });

  it('zählt gleichzeitige Abweisungen vollständig in einem Eintrag', async () => {
    await Promise.all(Array.from({ length: 5 }, () => asUserCommitted(users.therapist, LIST, [])));

    const zeilen = await eintraege();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.context['count']).toBe(5);
  });

  it('zeigt owner Operation und Zähler, sonst keinen Kontext', async () => {
    await asUserCommitted(users.therapist, LIST, []);
    await asUserCommitted(users.therapist, LIST, []);

    const { rows } = await asUserCommitted<Record<string, unknown>>(users.ownerTherapist, LIST, []);
    const abgewiesen = rows.find((z) => z['action'] === 'access.denied');
    expect(abgewiesen).toMatchObject({ denied_operation: 'audit_log.read', denied_count: 2 });
    expect(Object.keys(abgewiesen!)).not.toContain('context');
    // Das Lesen des Protokolls selbst steht nicht im Protokoll.
    expect((await eintraege()).map((z) => z.action)).toEqual(['access.denied']);
  });

  it('ändert das Auditlog nur an dieser einen Stelle', async () => {
    // Das Auditlog ist über den Anwendungspfad unveränderlich (ADR-010
    // Punkt 4). Der Zähler ist die eine, eng begrenzte Ausnahme.
    const { rows } = await asPostgres<{ name: string }>(
      `select n.nspname || '.' || p.proname as name
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosrc ~* 'update\\s+public\\.audit_log'
          or p.prosrc ~* 'delete\\s+from\\s+public\\.audit_log'
       order by 1`,
    );
    expect(rows.map((z) => z.name)).toEqual(['app.record_denied_read', 'public.apply_retention']);
  });

  it('beschriftet jede Operation, die eine Funktion abweisen kann', async () => {
    // Die Protokollseite zeigt die Operation in Worten; eine neue Abweisung
    // ohne Beschriftung erschiene dort als Kennung.
    const { rows } = await asPostgres<{ operation: string }>(
      `select distinct m[1] as operation
       from pg_proc p,
            regexp_matches(p.prosrc,
              'record_denied_(?:read|write|owner_read)\\(\\s*[^,]+,\\s*''([^'']+)''', 'g') m
       order by 1`,
    );
    expect(rows.length).toBeGreaterThan(40);
    const ohne = rows.map((z) => z.operation).filter((o) => !(o in auditOperationLabels));
    expect(ohne).toEqual([]);
  });
});

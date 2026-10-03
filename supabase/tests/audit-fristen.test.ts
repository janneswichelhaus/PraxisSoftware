import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, resetDatabase } from './helpers/db';

/**
 * LOG-EPIC-001, PR (c): Fristen des Auditlogs, Legal Hold, Löschjournal und
 * Löschaufträge (ANN-230; ADR-008, ADR-011 Punkt 4, ADR-012).
 *
 * Lese- und Sicherheitsereignisse fallen nach zwölf Monaten, alle übrigen
 * Auditeinträge nach drei Jahren. Ein Legal Hold hält jede Zeile seiner Akte,
 * auch über context.patient_id und für eine zusammengeführte Doppelanlage. Das
 * Löschjournal lebt 60 Tage (Backups 30 Tage plus Puffer), quittierte
 * Löschaufträge drei Jahre.
 */

const { users, patients, organizationId } = SEED;

async function eintrag(
  action: string,
  alter: string,
  opts: { subjectType?: string; subjectId?: string; context?: Record<string, unknown> } = {},
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.audit_log
       (organization_id, actor_user_id, action, subject_type, subject_id, occurred_at, context)
     values ($1, $2, $3, $4, $5, now() - $6::interval, $7::jsonb) returning id`,
    [
      organizationId,
      users.therapist,
      action,
      opts.subjectType ?? 'patient',
      opts.subjectId ?? patients.max,
      alter,
      JSON.stringify(opts.context ?? {}),
    ],
  );
  return rows[0]!.id;
}

async function vorhanden(id: string): Promise<boolean> {
  return (await asPostgres('select 1 from public.audit_log where id = $1', [id])).rows.length === 1;
}

async function legalHold(patientId: string): Promise<void> {
  await asPostgres(
    `insert into public.legal_holds (organization_id, subject_type, subject_id, reason, placed_by)
     values ($1, 'patient', $2, 'Synthetische Anfrage', $3)`,
    [organizationId, patientId, users.ownerTherapist],
  );
}

const LAUF = 'select public.apply_retention()';

describe('Auditlog: zwei Fristen (ADR-011 Punkt 4)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await asPostgres('delete from public.audit_log');
  }, 120_000);

  it('löscht Lese- und Sicherheitsereignisse nach zwölf Monaten, die übrigen nach drei Jahren', async () => {
    const lesen = await eintrag('patient_record.viewed', '13 months');
    const abweisung = await eintrag('access.denied', '13 months', {
      subjectType: 'organization',
      subjectId: organizationId,
    });
    const export13 = await eintrag('patient_record.exported', '13 months');
    const export37 = await eintrag('patient_record.exported', '37 months');
    const lesenFrisch = await eintrag('patient_record.viewed', '11 months');

    await asPostgres(LAUF);

    expect(await vorhanden(lesen)).toBe(false);
    expect(await vorhanden(abweisung)).toBe(false);
    expect(await vorhanden(export13)).toBe(true);
    expect(await vorhanden(export37)).toBe(false);
    expect(await vorhanden(lesenFrisch)).toBe(true);

    // Das Journal nennt die Klasse je Zeile.
    const { rows } = await asPostgres<{ target_id: string; retention_class: string }>(
      `select target_id, retention_class from public.deletion_journal
        where target_table = 'audit_log' order by retention_class`,
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { target_id: lesen, retention_class: 'auditlog_lesen_sicherheit' },
        { target_id: export37, retention_class: 'auditlog' },
      ]),
    );
  });

  it('ordnet genau die Lese- und Sicherheitsereignisse der kurzen Frist zu', async () => {
    const { rows } = await asPostgres<{ action: string; klasse: string }>(
      `select a as action, app.audit_retention_class(a) as klasse
         from unnest(array['patient_record.viewed', 'training_relationship.viewed',
                           'platform_representation.read', 'access.denied',
                           'account.password_changed', 'staff_account.locked',
                           'patient_file.downloaded', 'patient_record.exported',
                           'staff_account.roles_changed', 'retention.applied']) a`,
    );
    const kurz = rows.filter((z) => z.klasse === 'auditlog_lesen_sicherheit').map((z) => z.action);
    expect(kurz).toEqual([
      'patient_record.viewed',
      'training_relationship.viewed',
      'platform_representation.read',
      'access.denied',
      'account.password_changed',
      'staff_account.locked',
    ]);
  });
});

describe('Legal Hold hält jede Zeile seiner Akte', () => {
  beforeEach(async () => {
    await resetDatabase();
    await asPostgres('delete from public.audit_log');
  }, 120_000);

  it('hält Einträge über den Gegenstand und über context.patient_id', async () => {
    await legalHold(patients.max);
    const akte = await eintrag('patient_record.viewed', '40 months');
    const datei = await eintrag('patient_file.downloaded', '40 months', {
      subjectType: 'patient_file',
      subjectId: '77777777-7777-4777-8777-0000000000f1',
      context: { patient_id: patients.max },
    });
    const andere = await eintrag('patient_file.downloaded', '40 months', {
      subjectType: 'patient_file',
      subjectId: '77777777-7777-4777-8777-0000000000f2',
      context: { patient_id: patients.erika },
    });

    await asPostgres(LAUF);

    expect(await vorhanden(akte)).toBe(true);
    expect(await vorhanden(datei)).toBe(true);
    expect(await vorhanden(andere)).toBe(false);
  });

  it('hält auch die Einträge einer zusammengeführten Doppelanlage', async () => {
    const quelle = '66666666-6666-4666-8666-0000000000d1';
    await asPostgres(
      `insert into public.patient_merge_records
         (organization_id, source_patient_id, target_patient_id, merged_by, counts)
       values ($1, $2, $3, $4, '{}'::jsonb)`,
      [organizationId, quelle, patients.max, users.ownerTherapist],
    );
    await legalHold(patients.max);
    const alt = await eintrag('patient_record.exported', '40 months', {
      subjectType: 'patient',
      subjectId: quelle,
    });

    await asPostgres(LAUF);

    expect(await vorhanden(alt)).toBe(true);
  });

  it('hält einen Plattformzugang zur gehaltenen Akte über seine Frist hinaus', async () => {
    const zugang = SEED.platformAccesses.erikaBehandlung;
    await asPostgres(
      `update public.platform_accesses
          set status = 'revoked', revoked_at = now() - interval '4 years', revoked_by = $2,
              revoked_reason = 'practice'
        where id = $1`,
      [zugang, users.office],
    );
    await legalHold(patients.erika);

    await asPostgres(LAUF);

    expect(
      (await asPostgres('select 1 from public.platform_accesses where id = $1', [zugang])).rows,
    ).toHaveLength(1);
  });
});

describe('Löschjournal und Löschaufträge', () => {
  beforeEach(async () => {
    await resetDatabase();
    await asPostgres('delete from public.deletion_journal');
    await asPostgres('delete from public.storage_deletion_orders');
  }, 120_000);

  async function journal(alter: string): Promise<string> {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.deletion_journal
         (organization_id, run_id, target_table, target_id, retention_class, due_at, deleted_at)
       values ($1, extensions.gen_random_uuid(), 'tasks', extensions.gen_random_uuid(),
               'aufgabe', now() - $2::interval, now() - $2::interval)
       returning id`,
      [organizationId, alter],
    );
    return rows[0]!.id;
  }

  async function auftrag(quittiert: string | null): Promise<string> {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.storage_deletion_orders
         (organization_id, bucket_id, object_key, ordered_at, receipted_at, receipted_by)
       values ($1::uuid, 'patientenakte', $1::text || '/' || extensions.gen_random_uuid() || '.pdf',
               now() - interval '5 years',
               case when $2::interval is null then null else now() - $2::interval end,
               case when $2::interval is null then null else $3::uuid end)
       returning id`,
      [organizationId, quittiert, users.ownerTherapist],
    );
    return rows[0]!.id;
  }

  it('löscht Journaleinträge nach 60 Tagen', async () => {
    const alt = await journal('61 days');
    const jung = await journal('59 days');

    await asPostgres(LAUF);

    const { rows } = await asPostgres<{ id: string }>('select id from public.deletion_journal');
    const ids = rows.map((z) => z.id);
    expect(ids).not.toContain(alt);
    expect(ids).toContain(jung);
  });

  it('löscht quittierte Aufträge nach drei Jahren, offene nie', async () => {
    const alt = await auftrag('37 months');
    const jung = await auftrag('2 years');
    const offen = await auftrag(null);

    await asPostgres(LAUF);

    const { rows } = await asPostgres<{ id: string }>(
      'select id from public.storage_deletion_orders',
    );
    const ids = rows.map((z) => z.id);
    expect(ids).not.toContain(alt);
    expect(ids).toContain(jung);
    expect(ids).toContain(offen);
  });

  it('zählt beides in der Zusammenfassung des Laufs', async () => {
    await journal('61 days');
    await auftrag('37 months');

    await asPostgres(LAUF);

    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      "select context from public.audit_log where action = 'retention.applied'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.context).toMatchObject({ loeschjournal: 1, loeschauftrag: 1 });
  });
});

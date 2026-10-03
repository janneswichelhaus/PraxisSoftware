import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, abgefangen, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Öffnen heißt Anzeigen, Herunterladen ist eine eigene Aktion (ABN-027,
 * ADR-017 Punkte 54 und 55): das Kennzeichen im Protokoll und kein
 * Herunterladen für Fotos.
 */

const { users, patients } = SEED;
const PRUEFSUMME = 'a'.repeat(64);

async function datei(art: string, mime: string): Promise<string> {
  const { rows } = await asUserCommitted<{
    file_id: string;
    bucket_id: string;
    object_key: string;
  }>(
    users.therapist,
    `select file_id, bucket_id, object_key from public.prepare_patient_file_upload(
       $1::uuid, null, $2, 'Datei', $3, 1000, $4)`,
    [patients.max, art, mime, PRUEFSUMME],
  );
  const d = rows[0]!;
  await asPostgres(
    `insert into storage.objects (bucket_id, name, metadata)
     values ($1, $2, jsonb_build_object('size', 1000, 'mimetype', $3::text))`,
    [d.bucket_id, d.object_key, mime],
  );
  await asUserCommitted(users.therapist, 'select public.confirm_patient_file_upload($1::uuid)', [
    d.file_id,
  ]);
  return d.file_id;
}

/** Die protokollierten Downloads einer Datei; das Anzeigen steht nicht im Protokoll (LOG-EPIC-001). */
async function protokoll(fileId: string): Promise<string[]> {
  const { rows } = await asPostgres<{ action: string }>(
    `select action from public.audit_log
      where subject_id = $1 and action like 'patient_file.%' and action <> 'patient_file.uploaded'
      order by occurred_at`,
    [fileId],
  );
  return rows.map((r) => r.action);
}

describe('Öffnen und Herunterladen (ABN-027)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.patient_file_access_grants');
    await asPostgres('delete from public.patient_files');
    await asPostgres("delete from storage.objects where bucket_id = 'patientenakte'");
    await asPostgres("delete from public.audit_log where action like 'patient_file.%'");
  });

  it('protokolliert nur das Herunterladen, nicht das Anzeigen (Punkt 55, LOG-EPIC-001)', async () => {
    const id = await datei('arztbrief', 'application/pdf');
    await asUserCommitted(
      users.therapist,
      'select * from public.issue_patient_file_link($1::uuid)',
      [id],
    );
    await asUserCommitted(
      users.therapist,
      'select * from public.issue_patient_file_link($1::uuid, true)',
      [id],
    );
    expect(await protokoll(id)).toEqual(['patient_file.downloaded']);
  });

  it('gibt ein Dokumentationsfoto nicht zum Herunterladen heraus, nur zum Anzeigen', async () => {
    const id = await datei('dokumentationsfoto', 'image/jpeg');
    const fehler = await abgefangen(
      asUser(users.ownerTherapist, 'select * from public.issue_patient_file_link($1::uuid, true)', [
        id,
      ]),
    );
    expect(fehler?.message).toMatch(/photos cannot be downloaded/);
    const { rows } = await asUser<{ bucket_id: string }>(
      users.ownerTherapist,
      'select bucket_id from public.issue_patient_file_link($1::uuid, false)',
      [id],
    );
    expect(rows[0]?.bucket_id).toBe('patientenakte');
  });

  it('gibt eine Arbeitshilfe nicht zum Herunterladen heraus', async () => {
    await asUserCommitted(
      users.office,
      `select public.record_patient_privacy_entry($1::uuid, 'consent_granted', 'patient_photos', null, current_date)`,
      [patients.max],
    );
    const id = await datei('patientenfoto', 'image/jpeg');
    const fehler = await abgefangen(
      asUser(users.therapist, 'select * from public.issue_patient_file_link($1::uuid, true)', [id]),
    );
    expect(fehler?.message).toMatch(/photos cannot be downloaded/);
    await asPostgres('delete from public.patient_privacy_records');
  });
});

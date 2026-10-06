import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asStorageApi,
  asUser,
  asUserCommitted,
  resetDatabase,
  fremdeOrganisation,
} from './helpers/db';

/**
 * Freigegebene Dokumente (POR-014, DSN-001 D3, ADR-017 Punkte 15, 20, 21, 37,
 * ANN-249).
 *
 * Nur einzeln freigegebene Dateien, nie Fotos; die Freigabe setzen owner,
 * therapist und team_lead; der Abruf steht als `patient_file.downloaded` im
 * Protokoll; die Ablage gibt das Objekt nur mit der einmaligen Freigabe her.
 */

const { users, platformAccesses, patients, organizationId } = SEED;
const ERIKA = platformAccesses.erikaBehandlung;
const PRUEFSUMME = 'a'.repeat(64);
const ARZTBRIEF = 'abababab-abab-4bab-8bab-000000000001';
const FOTO = 'abababab-abab-4bab-8bab-000000000002';
const MAX_BRIEF = 'abababab-abab-4bab-8bab-000000000003';

const FREIGEBEN = 'select public.set_patient_file_release($1::uuid, $2::boolean) as ok';
const LISTE = 'select * from public.platform_files($1::uuid)';
const VERWEIS = 'select * from public.issue_platform_file_link($1::uuid, $2::uuid)';
const AKTE = 'select id, released_at from public.list_patient_files($1::uuid)';
const LESEN = "select name from storage.objects where bucket_id = 'patientenakte' and name = $1";

async function dateien() {
  await asPostgres(
    `insert into public.patient_files
       (id, organization_id, patient_id, document_type, display_name, mime_type, byte_size,
        checksum_sha256, status, confirmed_at, uploaded_by)
     values
       ($1, $4, $5, 'arztbrief', 'Arztbrief Orthopaedie.pdf', 'application/pdf', 12345, $7, 'ready', now(), $8),
       ($2, $4, $5, 'dokumentationsfoto', 'Foto.jpg', 'image/jpeg', 2345, $7, 'ready', now(), $8),
       ($3, $4, $6, 'arztbrief', 'Max Brief.pdf', 'application/pdf', 12345, $7, 'ready', now(), $8)`,
    [
      ARZTBRIEF,
      FOTO,
      MAX_BRIEF,
      organizationId,
      patients.erika,
      patients.max,
      PRUEFSUMME,
      users.therapist,
    ],
  );
  await asPostgres(
    `insert into storage.objects (bucket_id, name, metadata)
     select 'patientenakte', f.object_key, jsonb_build_object('size', 12345, 'mimetype', f.mime_type)
     from public.patient_files f where f.id in ($1, $3)
     union all
     select 'patientenfotos', f.object_key, jsonb_build_object('size', 2345, 'mimetype', f.mime_type)
     from public.patient_files f where f.id = $2`,
    [ARZTBRIEF, FOTO, MAX_BRIEF],
  );
}

async function schluessel(id: string): Promise<string> {
  const { rows } = await asPostgres<{ object_key: string }>(
    'select object_key from public.patient_files where id = $1',
    [id],
  );
  return rows[0]!.object_key;
}

describe('Freigegebene Dokumente (POR-014)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await dateien();
  }, 120_000);

  it('zeigt nichts, bis eine Behandlungsrolle die Datei einzeln freigibt (D3)', async () => {
    expect((await asUser(users.plattformErika, LISTE, [ERIKA])).rows).toEqual([]);
    const { rows } = await asUserCommitted<{ ok: boolean }>(users.therapist, FREIGEBEN, [
      ARZTBRIEF,
      true,
    ]);
    expect(rows[0]!.ok).toBe(true);
    const liste = await asUser<{ id: string; display_name: string; released_at: string }>(
      users.plattformErika,
      LISTE,
      [ERIKA],
    );
    expect(liste.rows).toEqual([
      expect.objectContaining({ id: ARZTBRIEF, display_name: 'Arztbrief Orthopaedie.pdf' }),
    ]);
    // Nachweis am Datensatz, in der Dateiliste der Praxis sichtbar.
    const akte = await asUser<{ id: string; released_at: string | null }>(users.office, AKTE, [
      patients.erika,
    ]);
    expect(akte.rows.find((r) => r.id === ARZTBRIEF)!.released_at).not.toBeNull();
    const nachweis = await asPostgres<{ released_by: string }>(
      'select released_by from public.patient_files where id = $1',
      [ARZTBRIEF],
    );
    expect(nachweis.rows[0]!.released_by).toBe(users.therapist);
    // Zuruecknehmen wirkt sofort.
    await asUserCommitted(users.therapist, FREIGEBEN, [ARZTBRIEF, false]);
    expect((await asUser(users.plattformErika, LISTE, [ERIKA])).rows).toEqual([]);
  });

  it('laesst Fotos nie freigeben und das Buero nicht freigeben (ANN-249)', async () => {
    const foto = await abgefangen(asUser(users.therapist, FREIGEBEN, [FOTO, true]));
    expect(foto?.message).toContain('photos cannot be released');
    const buero = await abgefangen(asUser(users.office, FREIGEBEN, [ARZTBRIEF, true]));
    expect(buero?.message).toContain('not allowed');
    const plattform = await abgefangen(asUser(users.plattformErika, FREIGEBEN, [ARZTBRIEF, true]));
    expect(plattform?.message).toContain('not allowed');
    // Eine fremde Organisation findet die Datei nicht (Zweitreview).
    const fremd = await fremdeOrganisation();
    const fremdeOwner = await abgefangen(asUser(fremd.owner, FREIGEBEN, [ARZTBRIEF, true]));
    expect(fremdeOwner).not.toBeNull();
    // Auch direkt in der Tabelle haelt die Constraint.
    const direkt = await abgefangen(
      asPostgres(
        `update public.patient_files set released_at = now(), released_by = $2 where id = $1`,
        [FOTO, users.therapist],
      ),
    );
    expect(direkt).not.toBeNull();
  });

  it('gibt den Verweis nur fuer die eigene freigegebene Datei heraus und protokolliert den Abruf', async () => {
    await asUserCommitted(users.therapist, FREIGEBEN, [ARZTBRIEF, true]);
    await asUserCommitted(users.therapist, FREIGEBEN, [MAX_BRIEF, true]);
    const { rows } = await asUserCommitted<{ bucket_id: string; object_key: string }>(
      users.plattformErika,
      VERWEIS,
      [ERIKA, ARZTBRIEF],
    );
    expect(rows[0]!.bucket_id).toBe('patientenakte');
    expect(rows[0]!.object_key).toBe(await schluessel(ARZTBRIEF));
    // Max' freigegebener Brief ist fuer Erika fremd.
    const fremd = await abgefangen(asUser(users.plattformErika, VERWEIS, [ERIKA, MAX_BRIEF]));
    expect(fremd?.message).toContain('not accessible');
    const protokoll = await asPostgres<{
      actor_kind: string;
      actor_user_id: string;
      context: Record<string, unknown>;
    }>(
      `select actor_kind, actor_user_id, context from public.audit_log
        where action = 'patient_file.downloaded' and subject_id = $1`,
      [ARZTBRIEF],
    );
    expect(protokoll.rows).toEqual([
      expect.objectContaining({
        actor_kind: 'platform',
        actor_user_id: users.plattformErika,
        context: expect.objectContaining({
          surface: 'platform',
          platform_access_id: ERIKA,
        }) as unknown,
      }),
    ]);
  });

  it('die Ablage gibt das Objekt nur mit der einmaligen Freigabe her (ADR-017 Punkte 15, 21)', async () => {
    await asUserCommitted(users.therapist, FREIGEBEN, [ARZTBRIEF, true]);
    const key = await schluessel(ARZTBRIEF);
    // Ohne Freigabe: nichts.
    expect(
      (await asStorageApi(users.plattformErika, 'storage.object.get', LESEN, [key])).rows,
    ).toEqual([]);
    await asUserCommitted(users.plattformErika, VERWEIS, [ERIKA, ARZTBRIEF]);
    // Mit Freigabe: einmal, dann verbraucht.
    expect(
      (await asStorageApi(users.plattformErika, 'storage.object.get', LESEN, [key])).rows,
    ).toHaveLength(1);
    expect(
      (await asStorageApi(users.plattformErika, 'storage.object.get', LESEN, [key])).rows,
    ).toEqual([]);
    // Eine Freigabe schuetzt nicht ueber die Ruecknahme hinweg.
    await asUserCommitted(users.plattformErika, VERWEIS, [ERIKA, ARZTBRIEF]);
    await asUserCommitted(users.therapist, FREIGEBEN, [ARZTBRIEF, false]);
    expect(
      (await asStorageApi(users.plattformErika, 'storage.object.get', LESEN, [key])).rows,
    ).toEqual([]);
    // Und ein fremdes Konto liest mit fremder Freigabe nichts.
    await asUserCommitted(users.therapist, FREIGEBEN, [ARZTBRIEF, true]);
    await asUserCommitted(users.plattformErika, VERWEIS, [ERIKA, ARZTBRIEF]);
    expect(
      (await asStorageApi(users.plattformTina, 'storage.object.get', LESEN, [key])).rows,
    ).toEqual([]);
  });

  it('fremde Person, Training, gesperrt, Praxiskonto: keine Liste, kein Verweis', async () => {
    await asUserCommitted(users.therapist, FREIGEBEN, [ARZTBRIEF, true]);
    expect((await asUser(users.plattformTina, LISTE, [ERIKA])).rows).toEqual([]);
    expect(
      (await asUser(users.plattformErika, LISTE, [platformAccesses.erikaTraining])).rows,
    ).toEqual([]);
    expect((await asUser(users.office, LISTE, [ERIKA])).rows).toEqual([]);
    const tina = await abgefangen(asUser(users.plattformTina, VERWEIS, [ERIKA, ARZTBRIEF]));
    expect(tina?.message).toContain('not accessible');
    await asPostgres(
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      [ERIKA],
    );
    expect((await asUser(users.plattformErika, LISTE, [ERIKA])).rows).toEqual([]);
    const gesperrt = await abgefangen(asUser(users.plattformErika, VERWEIS, [ERIKA, ARZTBRIEF]));
    expect(gesperrt?.message).toContain('not accessible');
  });

  it('Begleitung liest freigegebene Dokumente mit, protokolliert als Vertretung', async () => {
    await asUserCommitted(users.therapist, FREIGEBEN, [MAX_BRIEF, true]);
    const liste = await asUserCommitted<{ id: string }>(users.plattformPaula, LISTE, [
      platformAccesses.paulaBegleitungMax,
    ]);
    expect(liste.rows.map((r) => r.id)).toEqual([MAX_BRIEF]);
    await asUserCommitted(users.plattformPaula, VERWEIS, [
      platformAccesses.paulaBegleitungMax,
      MAX_BRIEF,
    ]);
    const protokoll = await asPostgres<{ actor_kind: string }>(
      `select actor_kind from public.audit_log where action = 'patient_file.downloaded' and subject_id = $1`,
      [MAX_BRIEF],
    );
    expect(protokoll.rows).toEqual([{ actor_kind: 'representative' }]);
  });
});

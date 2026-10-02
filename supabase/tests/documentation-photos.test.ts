import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Dokumentationsfotos zur Akte (ABN-023, BEF-106; ADR-017 Fassung 3,
 * Abschnitt H).
 *
 * Belegt wird, was das Dokumentationsfoto von der Arbeitshilfe trennt: keine
 * Einwilligung (Punkt 45), Bucket und Klasse der Akte, der Widerruf beruehrt
 * es nicht (Punkt 46), keine Korrektur zwischen den Fotoarten (Punkt 47),
 * Loeschen nur am Aufnahmetag durch die aufnehmende Person oder owner
 * (Punkt 48), ein Legal Hold haelt es, die Liste und die Auskunft fuehren es,
 * fremde Organisationen sehen es nicht.
 */

const { users, patients } = SEED;

const PRUEFSUMME = 'c'.repeat(64);

interface Vorbereitet {
  file_id: string;
  bucket_id: string;
  object_key: string;
}

const VORBEREITEN = `
  select file_id, bucket_id, object_key
  from public.prepare_patient_file_upload(
    $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::bigint, $7::text
  )
`;

async function vorbereiten(
  userId: string = users.therapist,
  optionen: { art?: string; mime?: string; grundlage?: string | null } = {},
): Promise<Vorbereitet> {
  const { rows } = await asUserCommitted<Vorbereitet>(userId, VORBEREITEN, [
    patients.max,
    optionen.grundlage ?? null,
    optionen.art ?? 'dokumentationsfoto',
    'Dokumentationsfoto vom 04.10.2026',
    optionen.mime ?? 'image/jpeg',
    54_321,
    PRUEFSUMME,
  ]);
  return rows[0]!;
}

async function foto(
  userId: string = users.therapist,
  art: string = 'dokumentationsfoto',
): Promise<Vorbereitet> {
  const datei = await vorbereiten(userId, { art });
  await asPostgres(
    `insert into storage.objects (bucket_id, name, metadata)
     values ($1, $2, jsonb_build_object('size', 54321, 'mimetype', 'image/jpeg'))`,
    [datei.bucket_id, datei.object_key],
  );
  await asUserCommitted(userId, 'select public.confirm_patient_file_upload($1::uuid)', [
    datei.file_id,
  ]);
  return datei;
}

async function vermerken(art: 'consent_granted' | 'consent_withdrawn'): Promise<void> {
  await asUserCommitted(
    users.office,
    `select public.record_patient_privacy_entry($1::uuid, $2, 'patient_photos', null, current_date)`,
    [patients.max, art],
  );
}

/** Verlegt die Aufnahme auf gestern - in jeder Zeitzone ein anderer Tag. */
async function gestern(fileId: string): Promise<void> {
  await asPostgres(
    `update public.patient_files
        set created_at = now() - interval '2 days', confirmed_at = now() - interval '2 days'
      where id = $1`,
    [fileId],
  );
}

interface FotoZeile {
  id: string;
  document_type: string;
  delete_after: string | null;
  deletable: boolean;
}

async function fotoliste(userId: string = users.therapist): Promise<FotoZeile[]> {
  const { rows } = await asUser<FotoZeile>(
    userId,
    'select id, document_type, delete_after, deletable from public.list_patient_photos($1::uuid)',
    [patients.max],
  );
  return rows;
}

async function anzahl(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await asPostgres<{ count: string }>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

async function aufraeumen(): Promise<void> {
  await asPostgres('delete from public.patient_file_access_grants');
  await asPostgres('delete from public.patient_files');
  await asPostgres('delete from public.storage_deletion_orders');
  await asPostgres(
    "delete from storage.objects where bucket_id in ('patientenakte', 'patientenfotos')",
  );
  await asPostgres('delete from public.patient_privacy_records');
  await asPostgres('delete from public.legal_holds');
  await asPostgres("delete from public.deletion_journal where target_table = 'patient_files'");
  await asPostgres(
    `delete from public.audit_log
      where action like 'patient_file.%' or action like 'patient_files.%'
         or action like 'patient_privacy.%'`,
  );
}

describe('Dokumentationsfotos (ABN-023)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await aufraeumen();
  });

  it('fuehrt dokumentationsfoto als klinische Art im Bucket und in der Klasse der Akte', async () => {
    const { rows } = await asPostgres<{ is_clinical: boolean; bucket: string }>(
      `select is_clinical, app.patient_file_bucket_for(key) as bucket
         from public.patient_file_document_types where key = 'dokumentationsfoto'`,
    );
    expect(rows[0]).toEqual({ is_clinical: true, bucket: 'patientenakte' });
  });

  it('entsteht ohne Einwilligung (Punkt 45)', async () => {
    const datei = await foto();
    expect(datei.bucket_id).toBe('patientenakte');
    const liste = await fotoliste();
    expect(liste).toEqual([
      {
        id: datei.file_id,
        document_type: 'dokumentationsfoto',
        delete_after: null,
        deletable: true,
      },
    ]);
  });

  it('bleibt nur JPEG und haengt nur an der Patient:in', async () => {
    const png = await abgefangen(vorbereiten(users.therapist, { mime: 'image/png' }));
    expect(png?.message).toMatch(/unsupported media type/);

    const { rows } = await asPostgres<{ id: string }>(
      'select id from public.treatment_bases where patient_id = $1 limit 1',
      [patients.max],
    );
    const anGrundlage = await abgefangen(vorbereiten(users.therapist, { grundlage: rows[0]!.id }));
    expect(anGrundlage?.message).toMatch(/belongs to the patient/);
  });

  it('verlangt fuer die Arbeitshilfe weiter die Einwilligung', async () => {
    const fehler = await abgefangen(vorbereiten(users.therapist, { art: 'patientenfoto' }));
    expect(fehler?.message).toMatch(/no consent/);
  });

  it('erscheint nicht in der Dateiliste der Akte', async () => {
    await foto();
    const { rows } = await asUser<{ id: string }>(
      users.therapist,
      'select id from public.list_patient_files($1::uuid)',
      [patients.max],
    );
    expect(rows).toEqual([]);
  });

  it('bleibt beim Widerruf der Foto-Einwilligung, die Arbeitshilfe faellt (Punkt 46)', async () => {
    await vermerken('consent_granted');
    const doku = await foto();
    const hilfe = await foto(users.therapist, 'patientenfoto');
    await vermerken('consent_withdrawn');

    expect(
      await anzahl('select count(*) from public.patient_files where id = $1', [doku.file_id]),
    ).toBe(1);
    expect(
      await anzahl('select count(*) from public.patient_files where id = $1', [hilfe.file_id]),
    ).toBe(0);
    expect((await fotoliste()).map((z) => z.id)).toEqual([doku.file_id]);

    const { rows } = await asUser<{ bucket_id: string }>(
      users.therapist,
      'select bucket_id from public.issue_patient_file_link($1::uuid)',
      [doku.file_id],
    );
    expect(rows[0]?.bucket_id).toBe('patientenakte');
  });

  it('wird zwischen den Fotoarten nicht korrigiert, in keine Richtung (Punkt 47)', async () => {
    const doku = await foto();
    for (const ziel of ['patientenfoto', 'klinisches_bild']) {
      const fehler = await abgefangen(
        asUserCommitted(
          users.therapist,
          'select public.set_patient_file_document_type($1::uuid, $2)',
          [doku.file_id, ziel],
        ),
      );
      expect(fehler?.message).toMatch(/cannot be corrected/);
    }

    const direkt = await abgefangen(
      asPostgres("update public.patient_files set document_type = 'patientenfoto' where id = $1", [
        doku.file_id,
      ]),
    );
    expect(direkt?.message).toMatch(/cannot be corrected/);
  });

  describe('Loeschen nur am Aufnahmetag (Punkt 48)', () => {
    it('erlaubt der aufnehmenden Person am Aufnahmetag, mit Auditeintrag', async () => {
      const doku = await foto();
      await asUserCommitted(users.therapist, 'select public.delete_patient_file($1::uuid)', [
        doku.file_id,
      ]);
      expect(
        await anzahl(
          `select count(*) from public.audit_log
            where action = 'patient_file.deleted' and subject_id = $1
              and context ->> 'document_type' = 'dokumentationsfoto'`,
          [doku.file_id],
        ),
      ).toBe(1);
      expect(
        await anzahl('select count(*) from public.storage_deletion_orders where object_key = $1', [
          doku.object_key,
        ]),
      ).toBe(1);
    });

    it('erlaubt owner am Aufnahmetag, einer anderen Therapeut:in nicht', async () => {
      const doku = await foto(users.teamLead);
      expect((await fotoliste(users.therapist))[0]?.deletable).toBe(false);

      const fremd = await abgefangen(
        asUserCommitted(users.therapist, 'select public.delete_patient_file($1::uuid)', [
          doku.file_id,
        ]),
      );
      expect(fremd?.message).toMatch(/only be deleted on the day/);

      expect((await fotoliste(users.ownerTherapist))[0]?.deletable).toBe(true);
      await asUserCommitted(users.ownerTherapist, 'select public.delete_patient_file($1::uuid)', [
        doku.file_id,
      ]);
      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [doku.file_id]),
      ).toBe(0);
    });

    it('weist nach dem Aufnahmetag jeden ab, auch owner', async () => {
      const doku = await foto();
      await gestern(doku.file_id);
      expect((await fotoliste())[0]?.deletable).toBe(false);

      for (const wer of [users.therapist, users.ownerTherapist]) {
        const fehler = await abgefangen(
          asUserCommitted(wer, 'select public.delete_patient_file($1::uuid)', [doku.file_id]),
        );
        expect(fehler?.message).toMatch(/only be deleted on the day/);
      }
      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [doku.file_id]),
      ).toBe(1);
    });

    it('laesst die Arbeitshilfe weiter jederzeit loeschen (Punkt 37)', async () => {
      await vermerken('consent_granted');
      const hilfe = await foto(users.therapist, 'patientenfoto');
      await asPostgres(
        `update public.patient_files
            set created_at = now() - interval '2 days', confirmed_at = now() - interval '2 days'
          where id = $1`,
        [hilfe.file_id],
      );
      expect((await fotoliste())[0]?.deletable).toBe(true);
      await asUserCommitted(users.therapist, 'select public.delete_patient_file($1::uuid)', [
        hilfe.file_id,
      ]);
    });
  });

  it('erscheint in Auskunft und Herausgabe fuer owner', async () => {
    const doku = await foto();
    const { rows } = await asUser<{ id: string; document_type: string; locked: boolean }>(
      users.ownerTherapist,
      'select id, document_type, locked from public.list_patient_photos_for_access_request($1::uuid)',
      [patients.max],
    );
    expect(rows).toEqual([
      { id: doku.file_id, document_type: 'dokumentationsfoto', locked: false },
    ]);

    const { rows: export_ } = await asUser<{ fotos: { id: string; art: string }[] }>(
      users.ownerTherapist,
      "select public.export_patient_record($1::uuid) -> 'tabellen' -> 'patient_photos' as fotos",
      [patients.max],
    );
    expect(export_[0]?.fotos.map((f) => [f.id, f.art])).toEqual([
      [doku.file_id, 'dokumentationsfoto'],
    ]);

    const { rows: heraus } = await asUser<{ bucket_id: string }>(
      users.ownerTherapist,
      'select bucket_id from public.hand_out_patient_photo($1::uuid)',
      [doku.file_id],
    );
    expect(heraus[0]?.bucket_id).toBe('patientenakte');
  });

  it('bleibt fuer eine fremde Organisation unsichtbar: keine Liste, kein Verweis', async () => {
    const doku = await foto();
    const { owner } = await fremdeOrganisation();
    const liste = await abgefangen(
      asUser(owner, 'select * from public.list_patient_photos($1::uuid)', [patients.max]),
    );
    expect(liste?.message).toMatch(/not accessible/);
    const verweis = await abgefangen(
      asUser(owner, 'select * from public.issue_patient_file_link($1::uuid)', [doku.file_id]),
    );
    expect(verweis?.message).toMatch(/not accessible/);
  });

  it('haelt mit dem Legal Hold der Akte, auch gegen die Loeschung der Akte', async () => {
    const doku = await foto();
    await gestern(doku.file_id);
    await asUserCommitted(users.ownerTherapist, 'select public.place_legal_hold($1::uuid, $2)', [
      patients.max,
      'Anfrage der Aufsicht',
    ]);
    const { rows } = await asPostgres<{ gehalten: boolean }>(
      "select app.under_legal_hold($1, 'patient', $2) as gehalten",
      [SEED.organizationId, patients.max],
    );
    expect(rows[0]?.gehalten).toBe(true);
    expect((await fotoliste()).map((z) => z.id)).toEqual([doku.file_id]);
  });

  // Zweitreview, Checkliste Nr. 1: Rolle ohne klinisches Schreibrecht.
  it('laesst office kein Dokumentationsfoto aufnehmen oder loeschen und nicht herausgeben', async () => {
    const aufnahme = await abgefangen(vorbereiten(users.office));
    expect(aufnahme?.message).toMatch(/not allowed/);

    const doku = await foto();
    const loeschen = await abgefangen(
      asUserCommitted(users.office, 'select public.delete_patient_file($1::uuid)', [doku.file_id]),
    );
    expect(loeschen?.message).toMatch(/not allowed/);

    for (const wer of [users.office, users.therapist]) {
      const heraus = await abgefangen(
        asUser(wer, 'select * from public.hand_out_patient_photo($1::uuid)', [doku.file_id]),
      );
      expect(heraus?.message).toMatch(/denied/);
    }
  });
});

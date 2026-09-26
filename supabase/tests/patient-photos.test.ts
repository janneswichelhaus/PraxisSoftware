import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Fotos von Patient:innen (DOK-006b, ADR-017 Abschnitt G).
 *
 * `PROJECT_PRINCIPLES.md` §12: Dateizugriffe sind testpflichtig. ADR-017
 * Fassung 2 nennt, was hier ausdruecklich belegt sein muss: die
 * Einwilligungspruefung auf allen vier Wegen (Vorbereitung, Bestaetigung,
 * Liste, Verweis) und an der Leseregel des Objekts, das Loeschen beim Widerruf
 * mit Journal und Auftrag, der Legal Hold, die beiden Fristen und die
 * gesperrte Artkorrektur - mit der Folge Erteilung, Widerruf, Legal Hold, neue
 * Erteilung.
 *
 * Was die Nachbildung nicht kann, behauptet diese Datei nicht: dass die Bytes
 * aus dem Kameradialog stammen (Punkt 33, eine Eigenschaft des Aufnahmewegs)
 * und dass sie keine Metadaten tragen (Punkt 34, `metadaten.test.ts`).
 */

const { users, patients, organizationId } = SEED;

const PRUEFSUMME = 'b'.repeat(64);
const BUCKET = 'patientenfotos';

interface Vorbereitet {
  file_id: string;
  bucket_id: string;
  object_key: string;
}

async function vermerken(
  art: 'consent_granted' | 'consent_withdrawn' | 'consent_refused',
  optionen: { userId?: string; patientId?: string; zweck?: string } = {},
): Promise<void> {
  await asUserCommitted(
    optionen.userId ?? users.office,
    `select public.record_patient_privacy_entry($1::uuid, $2, $3, null, current_date)`,
    [optionen.patientId ?? patients.max, art, optionen.zweck ?? 'patient_photos'],
  );
}

const VORBEREITEN = `
  select file_id, bucket_id, object_key
  from public.prepare_patient_file_upload(
    $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::bigint, $7::text
  )
`;

async function vorbereiten(
  userId: string = users.therapist,
  optionen: {
    patientId?: string;
    grundlage?: string | null;
    art?: string;
    mime?: string;
  } = {},
): Promise<Vorbereitet> {
  const { rows } = await asUserCommitted<Vorbereitet>(userId, VORBEREITEN, [
    optionen.patientId ?? patients.max,
    optionen.grundlage ?? null,
    optionen.art ?? 'patientenfoto',
    'Foto vom 26.09.2026',
    optionen.mime ?? 'image/jpeg',
    54_321,
    PRUEFSUMME,
  ]);
  return rows[0]!;
}

/** Spielt nach, was die Storage-API beim Upload tut (siehe patient-files.test.ts). */
async function objektAblegen(bucket: string, objectKey: string): Promise<void> {
  await asPostgres(
    `insert into storage.objects (bucket_id, name, metadata)
     values ($1, $2, jsonb_build_object('size', 54321, 'mimetype', 'image/jpeg'))`,
    [bucket, objectKey],
  );
}

async function bestaetigen(fileId: string, userId: string = users.therapist): Promise<void> {
  await asUserCommitted(userId, 'select public.confirm_patient_file_upload($1::uuid)', [fileId]);
}

/** Der vollstaendige Weg: vorbereiten, ablegen, bestaetigen. */
async function foto(userId: string = users.therapist, patientId: string = patients.max) {
  const datei = await vorbereiten(userId, { patientId });
  await objektAblegen(datei.bucket_id, datei.object_key);
  await bestaetigen(datei.file_id, userId);
  return datei;
}

/** Verlegt die Aufnahme eines Fotos in die Vergangenheit. */
async function aufgenommenVor(fileId: string, intervall: string): Promise<void> {
  await asPostgres(
    `update public.patient_files
        set created_at = now() - $2::interval, confirmed_at = now() - $2::interval
      where id = $1`,
    [fileId, intervall],
  );
}

interface FotoZeile {
  id: string;
  display_name: string;
  taken_at: string;
  taken_by_name: string | null;
  delete_after: string;
  object_missing: boolean;
}

async function fotoliste(userId: string = users.therapist, patientId: string = patients.max) {
  const { rows } = await asUser<FotoZeile>(
    userId,
    'select * from public.list_patient_photos($1::uuid)',
    [patientId],
  );
  return rows;
}

async function anzahl(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await asPostgres<{ count: string }>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

const VERWEIS = 'select * from public.issue_patient_file_link($1::uuid)';

async function hold(): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(
    users.ownerTherapist,
    'select public.place_legal_hold($1::uuid, $2) as id',
    [patients.max, 'Anfrage der Aufsicht'],
  );
  return rows[0]!.id;
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
    `update public.patients
        set care_concluded_on = null, care_concluded_at = null, care_concluded_by = null
      where id = $1`,
    [patients.max],
  );
  await asPostgres(
    `delete from public.audit_log
      where action like 'patient_file.%' or action like 'patient_files.%'
         or action like 'patient_privacy.%' or action like 'retention.%'`,
  );
}

describe('Patientenfotos (DOK-006b)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await aufraeumen();
  });

  describe('Katalog, Bucket und Klasse', () => {
    it('fuehrt patientenfoto als klinische Art mit eigenem Bucket nur fuer JPEG', async () => {
      const { rows: art } = await asPostgres<{ is_clinical: boolean }>(
        "select is_clinical from public.patient_file_document_types where key = 'patientenfoto'",
      );
      expect(art[0]?.is_clinical).toBe(true);

      const { rows: bucket } = await asPostgres<{ public: boolean; allowed_mime_types: string[] }>(
        "select public, allowed_mime_types from storage.buckets where id = 'patientenfotos'",
      );
      expect(bucket[0]).toEqual({ public: false, allowed_mime_types: ['image/jpeg'] });
    });

    it('fuehrt die Klasse patientenfoto mit Frist, Obergrenze und Annahme im Schedule', async () => {
      const { rows } = await asPostgres<{
        anchor: string;
        frist: string;
        upper_bound_anchor: string;
        obergrenze: string;
        assumption_key: string;
      }>(`
        select anchor, retention_interval::text as frist, upper_bound_anchor,
               upper_bound_interval::text as obergrenze, assumption_key
        from public.retention_classes where key = 'patientenfoto'
      `);
      expect(rows[0]).toEqual({
        anchor: 'event_time',
        frist: '1 year',
        upper_bound_anchor: 'care_concluded_recorded',
        obergrenze: '3 mons',
        assumption_key: 'ANN-126',
      });

      const zuordnung = await anzahl(
        `select count(*) from public.retention_assignments
          where table_name = 'patient_files' and class_key = 'patientenfoto'
            and deletion_mode = 'automatisch'`,
      );
      expect(zuordnung).toBe(1);
    });
  });

  describe('Einwilligung auf allen Wegen (Punkt 36)', () => {
    it('weist die Vorbereitung ohne Einwilligung ab, bevor eine Zeile entsteht', async () => {
      const fehler = await abgefangen(vorbereiten());
      expect(fehler?.message).toMatch(/no consent/);
      expect(await anzahl('select count(*) from public.patient_files')).toBe(0);
    });

    it('weist sie nach einer Ablehnung ebenso ab', async () => {
      await vermerken('consent_refused');
      const fehler = await abgefangen(vorbereiten());
      expect(fehler?.message).toMatch(/no consent/);
    });

    it('legt nach der Erteilung das Foto im eigenen Bucket an der Patient:in ab', async () => {
      await vermerken('consent_granted');
      const datei = await vorbereiten();

      expect(datei.bucket_id).toBe(BUCKET);
      expect(datei.object_key).toBe(`${organizationId}/${patients.max}/${datei.file_id}`);

      await objektAblegen(BUCKET, datei.object_key);
      await bestaetigen(datei.file_id);

      const liste = await fotoliste();
      expect(liste).toHaveLength(1);
      expect(liste[0]!.display_name).toBe('Foto vom 26.09.2026');
      expect(liste[0]!.taken_by_name).toBe('Anna Beispiel');
      expect(liste[0]!.object_missing).toBe(false);
      // Zwoelf Monate nach der Aufnahme (Punkt 38).
      const ab = new Date(liste[0]!.taken_at);
      const bis = new Date(liste[0]!.delete_after);
      ab.setFullYear(ab.getFullYear() + 1);
      expect(bis.getTime()).toBe(ab.getTime());

      // Das Hochladen ist auditiert wie jede Datei (Punkt 20).
      const hochgeladen = await anzahl(
        `select count(*) from public.audit_log
          where action = 'patient_file.uploaded' and subject_id = $1
            and context ->> 'document_type' = 'patientenfoto'`,
        [datei.file_id],
      );
      expect(hochgeladen).toBe(1);
    });

    it('bestaetigt nicht, wenn zwischen Vorbereitung und Bestaetigung widerrufen wurde', async () => {
      await vermerken('consent_granted');
      const datei = await vorbereiten();
      await objektAblegen(BUCKET, datei.object_key);
      await vermerken('consent_withdrawn');

      const fehler = await abgefangen(bestaetigen(datei.file_id));
      expect(fehler?.message).toMatch(/no consent/);
      expect(await fotoliste()).toEqual([]);
    });

    it('laesst das Objekt nach einem Widerruf nicht mehr hochladen (Regel am Objekt)', async () => {
      await vermerken('consent_granted');
      const datei = await vorbereiten();
      await vermerken('consent_withdrawn');

      const fehler = await abgefangen(
        asUser(
          users.therapist,
          `insert into storage.objects (bucket_id, name, metadata)
           values ($1, $2, '{}'::jsonb)`,
          [BUCKET, datei.object_key],
        ),
      );
      expect(fehler?.message).toMatch(/row-level security/);
    });

    it('laesst Bucket und Art nicht auseinanderfallen', async () => {
      await vermerken('consent_granted');
      const fotoZeile = await vorbereiten();
      const befund = await vorbereiten(users.therapist, { art: 'befund', mime: 'application/pdf' });

      // Ein Foto in den Bucket der Akte - dort hielte es zehn Jahre.
      const falschHin = await abgefangen(
        asUser(
          users.therapist,
          `insert into storage.objects (bucket_id, name, metadata) values ('patientenakte', $1, '{}'::jsonb)`,
          [fotoZeile.object_key],
        ),
      );
      expect(falschHin?.message).toMatch(/row-level security/);

      // Ein Befund in den Bucket der Fotos.
      const falschHer = await abgefangen(
        asUser(
          users.therapist,
          `insert into storage.objects (bucket_id, name, metadata) values ('patientenfotos', $1, '{}'::jsonb)`,
          [befund.object_key],
        ),
      );
      expect(falschHer?.message).toMatch(/row-level security/);

      // Und die Bestaetigung sucht im Bucket der Art.
      await objektAblegen('patientenakte', fotoZeile.object_key);
      const bestaetigung = await abgefangen(bestaetigen(fotoZeile.file_id));
      expect(bestaetigung?.message).toMatch(/was not uploaded/);
    });

    it('nimmt nur JPEG und nur an der Patient:in, nicht an einer Verordnung', async () => {
      await vermerken('consent_granted');
      const png = await abgefangen(vorbereiten(users.therapist, { mime: 'image/png' }));
      expect(png?.message).toMatch(/unsupported media type/);

      const anVerordnung = await abgefangen(
        vorbereiten(users.therapist, { grundlage: '88888888-8888-4888-8888-000000000001' }),
      );
      expect(anVerordnung?.message).toMatch(/belongs to the patient/);
    });

    it('fuehrt Fotos nicht in der Dateiliste der Akte (Punkt 40)', async () => {
      await vermerken('consent_granted');
      await foto();
      const { rows } = await asUser<{ document_type: string }>(
        users.therapist,
        'select document_type from public.list_patient_files($1::uuid)',
        [patients.max],
      );
      expect(rows).toEqual([]);
    });

    it('stellt fuer ein nutzbares Foto einen Verweis im Bucket der Fotos aus, auditiert', async () => {
      await vermerken('consent_granted');
      const datei = await foto();

      const { rows } = await asUserCommitted<{ bucket_id: string; object_key: string }>(
        users.therapist,
        VERWEIS,
        [datei.file_id],
      );
      expect(rows[0]).toEqual(
        expect.objectContaining({ bucket_id: BUCKET, object_key: datei.object_key }),
      );

      // Mit der Freigabe laesst die Storage-API genau einmal lesen.
      const lesen = `select name from storage.objects where bucket_id = '${BUCKET}' and name = $1`;
      expect((await asUserCommitted(users.therapist, lesen, [datei.object_key])).rows).toHaveLength(
        1,
      );
      expect((await asUserCommitted(users.therapist, lesen, [datei.object_key])).rows).toHaveLength(
        0,
      );

      expect(
        await anzahl(
          `select count(*) from public.audit_log where action = 'patient_file.link_issued' and subject_id = $1`,
          [datei.file_id],
        ),
      ).toBe(1);
    });
  });

  describe('Widerruf (Punkt 36)', () => {
    it('loescht beim Widerruf in derselben Transaktion: Zeilen, Auftraege, Journal, Audit', async () => {
      await vermerken('consent_granted');
      const eins = await foto();
      const zwei = await foto();

      await vermerken('consent_withdrawn');

      expect(
        await anzahl(
          "select count(*) from public.patient_files where document_type = 'patientenfoto'",
        ),
      ).toBe(0);
      expect(
        await anzahl(
          `select count(*) from public.storage_deletion_orders
            where bucket_id = $1 and receipted_at is null and object_key = any($2)`,
          [BUCKET, [eins.object_key, zwei.object_key]],
        ),
      ).toBe(2);
      expect(
        await anzahl(
          `select count(*) from public.deletion_journal
            where target_table = 'patient_files' and retention_class = 'patientenfoto'
              and target_id = any($1::uuid[])`,
          [[eins.file_id, zwei.file_id]],
        ),
      ).toBe(2);
      const { rows: geloescht } = await asPostgres<{ actor: string; reason: string }>(
        `select actor_user_id as actor, context ->> 'reason' as reason from public.audit_log
          where action = 'patient_file.deleted' and subject_id = any($1::uuid[])`,
        [[eins.file_id, zwei.file_id]],
      );
      expect(geloescht).toEqual([
        { actor: users.office, reason: 'consent_withdrawn' },
        { actor: users.office, reason: 'consent_withdrawn' },
      ]);
      const { rows: vermerk } = await asPostgres<{ fotos: string }>(
        `select context ->> 'photos_deleted' as fotos from public.audit_log
          where action = 'patient_privacy.recorded' and context ->> 'record_kind' = 'consent_withdrawn'`,
      );
      expect(vermerk[0]?.fotos).toBe('2');
      // Kein Name, kein Objektschluessel im Auditkontext (ADR-017 Punkt 20).
      const { rows: kontexte } = await asPostgres<{ context: string }>(
        "select context::text as context from public.audit_log where action = 'patient_file.deleted'",
      );
      for (const { context } of kontexte) {
        expect(context).not.toContain('Foto vom');
        expect(context).not.toContain(eins.object_key);
      }
    });

    it('verlangt nach dem Widerruf eine neue Erteilung; die gilt nur fuer neue Fotos', async () => {
      await vermerken('consent_granted');
      await vermerken('consent_withdrawn');
      expect((await abgefangen(vorbereiten()))?.message).toMatch(/no consent/);

      await vermerken('consent_granted');
      const neu = await foto();
      expect((await fotoliste()).map((f) => f.id)).toEqual([neu.file_id]);
    });

    it('beruehrt die Fotos einer anderen Patient:in nicht', async () => {
      await vermerken('consent_granted');
      await vermerken('consent_granted', { patientId: patients.erika });
      await foto();
      const erika = await foto(users.therapist, patients.erika);

      await vermerken('consent_withdrawn');

      expect((await fotoliste(users.therapist, patients.erika)).map((f) => f.id)).toEqual([
        erika.file_id,
      ]);
    });

    it('widerruft auch durch die Verwaltung - die Loeschung ist die Rechtsfolge der Erklaerung', async () => {
      await vermerken('consent_granted');
      await foto();
      await vermerken('consent_withdrawn', { userId: users.office });
      expect(await fotoliste()).toEqual([]);
    });
  });

  describe('Legal Hold (Punkt 36, ANN-033)', () => {
    it('sperrt ein widerrufenes Foto auf allen Wegen und loescht es, sobald der Hold endet', async () => {
      await vermerken('consent_granted');
      const datei = await foto();
      const holdId = await hold();

      await vermerken('consent_withdrawn');

      // Die Zeile bleibt, gesperrt: keine Liste, kein Verweis, kein Loeschen von Hand.
      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [datei.file_id]),
      ).toBe(1);
      expect(await fotoliste()).toEqual([]);
      expect(
        (await abgefangen(asUserCommitted(users.therapist, VERWEIS, [datei.file_id])))?.message,
      ).toMatch(/not accessible/);
      expect(
        (
          await abgefangen(
            asUserCommitted(users.therapist, 'select public.delete_patient_file($1::uuid)', [
              datei.file_id,
            ]),
          )
        )?.message,
      ).toMatch(/not accessible/);

      // Auch eine Freigabe, die es fuer das Foto noch gaebe, liest nichts.
      await asPostgres(
        `insert into public.patient_file_access_grants (organization_id, user_id, patient_file_id, expires_at)
         values ($1, $2, $3, now() + interval '30 seconds')`,
        [organizationId, users.therapist, datei.file_id],
      );
      const { rows: gelesen } = await asUserCommitted(
        users.therapist,
        `select name from storage.objects where bucket_id = '${BUCKET}' and name = $1`,
        [datei.object_key],
      );
      expect(gelesen).toEqual([]);

      // Der Loeschlauf haelt an.
      await asPostgres('select public.apply_retention()');
      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [datei.file_id]),
      ).toBe(1);

      await asUserCommitted(users.ownerTherapist, 'select public.release_legal_hold($1::uuid)', [
        holdId,
      ]);

      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [datei.file_id]),
      ).toBe(0);
      expect(
        await anzahl(
          `select count(*) from public.deletion_journal where target_id = $1 and retention_class = 'patientenfoto'`,
          [datei.file_id],
        ),
      ).toBe(1);
      expect(
        await anzahl(
          `select count(*) from public.audit_log
            where action = 'patient_file.deleted' and subject_id = $1
              and context ->> 'reason' = 'legal_hold_released' and actor_user_id = $2`,
          [datei.file_id, users.ownerTherapist],
        ),
      ).toBe(1);
      expect(
        await anzahl(
          `select count(*) from public.storage_deletion_orders where bucket_id = $1 and object_key = $2`,
          [BUCKET, datei.object_key],
        ),
      ).toBe(1);
    });

    it('Erteilung, Widerruf, Hold, neue Erteilung: das alte Foto bleibt gesperrt, das neue ist nutzbar', async () => {
      await vermerken('consent_granted');
      const alt = await foto();
      await hold();
      await vermerken('consent_withdrawn');
      await vermerken('consent_granted');
      const neu = await foto();

      expect((await fotoliste()).map((f) => f.id)).toEqual([neu.file_id]);
      expect(
        (await abgefangen(asUserCommitted(users.therapist, VERWEIS, [alt.file_id])))?.message,
      ).toMatch(/not accessible/);
      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [alt.file_id]),
      ).toBe(1);
    });

    it('laesst ein nicht widerrufenes, nicht faelliges Foto unter Hold nutzbar', async () => {
      await vermerken('consent_granted');
      const datei = await foto();
      await hold();
      expect((await fotoliste()).map((f) => f.id)).toEqual([datei.file_id]);
    });
  });

  describe('Frist (Punkt 38)', () => {
    it('loescht ein Foto zwoelf Monate nach der Aufnahme im Loeschlauf, mit Journal und Auftrag', async () => {
      await vermerken('consent_granted');
      const alt = await foto();
      const jung = await foto();
      await aufgenommenVor(alt.file_id, '13 months');
      await aufgenommenVor(jung.file_id, '11 months');

      // Faellig ist faellig: schon vor dem Lauf gesperrt.
      expect((await fotoliste()).map((f) => f.id)).toEqual([jung.file_id]);

      await asPostgres('select public.apply_retention()');

      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [alt.file_id]),
      ).toBe(0);
      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [jung.file_id]),
      ).toBe(1);
      expect(
        await anzahl(
          `select count(*) from public.deletion_journal
            where target_id = $1 and retention_class = 'patientenfoto'`,
          [alt.file_id],
        ),
      ).toBe(1);
      expect(
        await anzahl(
          'select count(*) from public.storage_deletion_orders where bucket_id = $1 and object_key = $2',
          [BUCKET, alt.object_key],
        ),
      ).toBe(1);
      const { rows } = await asPostgres<{ fotos: string }>(
        `select context ->> 'patientenfoto' as fotos from public.audit_log
          where action = 'retention.applied' and organization_id = $1`,
        [organizationId],
      );
      expect(rows[0]?.fotos).toBe('1');
    });

    it('loescht spaetestens drei Monate nach dem festgehaltenen Abschluss der Versorgung', async () => {
      await vermerken('consent_granted');
      const datei = await foto();
      await aufgenommenVor(datei.file_id, '5 months');
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 120,
                care_concluded_at = now() - interval '4 months',
                care_concluded_by = $2
          where id = $1`,
        [patients.max, users.ownerTherapist],
      );

      expect(await fotoliste()).toEqual([]);
      await asPostgres('select public.apply_retention()');
      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [datei.file_id]),
      ).toBe(0);
    });

    it('rechnet ab dem Festhalten, nicht ab dem zurueckdatierten Tag (ANN-032)', async () => {
      await vermerken('consent_granted');
      const datei = await foto();
      await aufgenommenVor(datei.file_id, '5 months');
      // Heute festgehalten, fachlich vier Monate zurueckdatiert.
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 120,
                care_concluded_at = now(),
                care_concluded_by = $2
          where id = $1`,
        [patients.max, users.ownerTherapist],
      );

      const liste = await fotoliste();
      expect(liste.map((f) => f.id)).toEqual([datei.file_id]);
      // Loeschdatum: drei Monate ab heute, frueher als zwoelf Monate ab Aufnahme.
      const tage = (new Date(liste[0]!.delete_after).getTime() - Date.now()) / 86_400_000;
      expect(tage).toBeGreaterThan(85);
      expect(tage).toBeLessThan(95);

      await asPostgres('select public.apply_retention()');
      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [datei.file_id]),
      ).toBe(1);
    });

    it('haelt ein faelliges Foto unter Legal Hold an - gesperrt, aber nicht geloescht', async () => {
      await vermerken('consent_granted');
      const datei = await foto();
      await aufgenommenVor(datei.file_id, '13 months');
      await hold();

      await asPostgres('select public.apply_retention()');
      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [datei.file_id]),
      ).toBe(1);
      expect(await fotoliste()).toEqual([]);
    });
  });

  describe('Wiederherstellung (Punkt 26, ADR-008 Punkt 8)', () => {
    it('wendet eine Fotoloeschung nach dem Zurueckspielen erneut an', async () => {
      await vermerken('consent_granted');
      const datei = await foto();
      const { rows: zeile } = await asPostgres<Record<string, unknown>>(
        `select id, organization_id, patient_id, document_type, display_name, mime_type,
                byte_size, checksum_sha256, status, uploaded_by, created_at, confirmed_at
           from public.patient_files where id = $1`,
        [datei.file_id],
      );
      await vermerken('consent_withdrawn');
      // Der Auftrag fuer das Objekt ist quittiert, das Objekt weg - wie nach der Loeschung.
      await asPostgres('delete from public.storage_deletion_orders');

      // Die Wiederherstellung bringt Zeile und Objekt zurueck.
      const z = zeile[0]!;
      await asPostgres(
        `insert into public.patient_files (id, organization_id, patient_id, document_type, display_name,
           mime_type, byte_size, checksum_sha256, status, uploaded_by, created_at, confirmed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          z.id,
          z.organization_id,
          z.patient_id,
          z.document_type,
          z.display_name,
          z.mime_type,
          z.byte_size,
          z.checksum_sha256,
          z.status,
          z.uploaded_by,
          z.created_at,
          z.confirmed_at,
        ],
      );

      await asPostgres('select public.reapply_deletion_journal()');

      expect(
        await anzahl('select count(*) from public.patient_files where id = $1', [datei.file_id]),
      ).toBe(0);
      // Das Objekt liegt noch (die Nachbildung hat es nie entfernt) - also neuer Auftrag.
      expect(
        await anzahl(
          `select count(*) from public.storage_deletion_orders
            where bucket_id = $1 and object_key = $2 and receipted_at is null`,
          [BUCKET, datei.object_key],
        ),
      ).toBe(1);
    });
  });

  describe('Keine Artkorrektur (Punkt 32)', () => {
    const KORRIGIEREN = 'select public.set_patient_file_document_type($1::uuid, $2)';

    it('macht aus einem Foto keine andere Art', async () => {
      await vermerken('consent_granted');
      const datei = await foto();
      const fehler = await abgefangen(
        asUserCommitted(users.ownerTherapist, KORRIGIEREN, [datei.file_id, 'klinisches_bild']),
      );
      expect(fehler?.message).toMatch(/cannot be corrected/);
    });

    it('macht aus keiner Datei nachtraeglich ein Foto - auch nicht am Anwendungspfad vorbei', async () => {
      const befund = await vorbereiten(users.therapist, { art: 'befund', mime: 'image/jpeg' });
      await asPostgres(
        `insert into storage.objects (bucket_id, name, metadata)
         values ('patientenakte', $1, jsonb_build_object('size', 54321, 'mimetype', 'image/jpeg'))`,
        [befund.object_key],
      );
      await bestaetigen(befund.file_id);

      const fehler = await abgefangen(
        asUserCommitted(users.ownerTherapist, KORRIGIEREN, [befund.file_id, 'patientenfoto']),
      );
      expect(fehler?.message).toMatch(/cannot be corrected/);

      // Der Trigger haelt es auch fuer einen direkten Schreibzugriff.
      const direkt = await abgefangen(
        asPostgres(
          "update public.patient_files set document_type = 'patientenfoto' where id = $1",
          [befund.file_id],
        ),
      );
      expect(direkt?.message).toMatch(/cannot be corrected/);
    });
  });

  describe('Rollen und Grenzen (Punkt 37, ADR-013 Punkt 9 Nr. 1)', () => {
    beforeEach(async () => {
      await vermerken('consent_granted');
    });

    it('laesst die Verwaltung nicht aufnehmen, wohl aber sehen und oeffnen (§4.3)', async () => {
      const fehler = await abgefangen(vorbereiten(users.office));
      expect(fehler?.message).toMatch(/not allowed/);

      const datei = await foto();
      expect((await fotoliste(users.office)).map((f) => f.id)).toEqual([datei.file_id]);
      const { rows } = await asUserCommitted(users.office, VERWEIS, [datei.file_id]);
      expect(rows).toHaveLength(1);

      // Loeschen folgt dem Schreibrecht (Punkt 13).
      const loeschen = await abgefangen(
        asUserCommitted(users.office, 'select public.delete_patient_file($1::uuid)', [
          datei.file_id,
        ]),
      );
      expect(loeschen?.message).toMatch(/not allowed/);
    });

    it('laesst Behandelnde ein Foto jederzeit loeschen', async () => {
      const datei = await foto();
      await asUserCommitted(users.teamLead, 'select public.delete_patient_file($1::uuid)', [
        datei.file_id,
      ]);
      expect(await fotoliste()).toEqual([]);
      expect(
        await anzahl(
          'select count(*) from public.storage_deletion_orders where bucket_id = $1 and object_key = $2',
          [BUCKET, datei.object_key],
        ),
      ).toBe(1);
    });

    it('zeigt der Trainingsbetreuung keine Fotos - anderer Leistungsbereich (§4.8)', async () => {
      const datei = await foto();
      const { rows } = await asUserCommitted(
        users.trainer,
        'select * from public.list_patient_photos($1::uuid)',
        [patients.max],
      );
      expect(rows).toEqual([]);
      // Abgewiesen wird mit null Zeilen und einem Eintrag (G6b).
      expect(
        await anzahl(
          `select count(*) from public.audit_log
            where action = 'patient_files.read' and outcome = 'denied' and actor_user_id = $1`,
          [users.trainer],
        ),
      ).toBe(1);
      expect((await abgefangen(asUser(users.trainer, VERWEIS, [datei.file_id])))?.message).toMatch(
        /not accessible/,
      );
      expect((await abgefangen(vorbereiten(users.trainer)))?.message).toBeTruthy();
    });

    it('zeigt einem Patientenkonto nichts - auch nicht die eigenen Fotos (Punkt 37)', async () => {
      const datei = await foto();
      expect(await fotoliste(users.patientMax)).toEqual([]);
      expect(
        (await abgefangen(asUser(users.patientMax, VERWEIS, [datei.file_id])))?.message,
      ).toMatch(/not accessible/);
      expect((await abgefangen(vorbereiten(users.patientMax)))?.message).toBeTruthy();
    });

    it('zeigt einer fremden Person nichts von einer anderen Patient:in', async () => {
      await vermerken('consent_granted', { patientId: patients.erika });
      const erika = await foto(users.therapist, patients.erika);
      expect(await fotoliste(users.patientMax, patients.erika)).toEqual([]);
      expect(
        (await abgefangen(asUser(users.patientMax, VERWEIS, [erika.file_id])))?.message,
      ).toMatch(/not accessible/);
    });

    it('trennt Organisationen: keine Liste, kein Verweis, keine Aufnahme fuer eine fremde Praxis', async () => {
      const datei = await foto();
      const { owner } = await fremdeOrganisation();

      expect((await abgefangen(fotoliste(owner)))?.message).toMatch(/not accessible/);
      expect((await abgefangen(asUser(owner, VERWEIS, [datei.file_id])))?.message).toMatch(
        /not accessible/,
      );
      expect((await abgefangen(vorbereiten(owner)))?.message).toMatch(/not accessible/);
    });

    it('laesst niemanden ohne Anmeldung heran', async () => {
      const fehler = await abgefangen(
        asAnon('select * from public.list_patient_photos($1::uuid)', [patients.max]),
      );
      expect(fehler?.message).toMatch(/permission denied/);
    });

    it('gibt die internen Pruef- und Loeschfunktionen nicht heraus', async () => {
      const fehler = await abgefangen(
        asUser(
          users.ownerTherapist,
          'select app.delete_due_patient_photos($1::uuid, null, gen_random_uuid(), null, $2)',
          [organizationId, 'retention'],
        ),
      );
      expect(fehler?.message).toMatch(/permission denied/);
    });
  });

  describe('Herausgabe an die Person (DOK-006d, Punkt 40)', () => {
    const HERAUSGEBEN = 'select * from public.hand_out_patient_photo($1::uuid)';

    beforeEach(async () => {
      await vermerken('consent_granted');
    });

    it('gibt owner eine Kopie heraus, protokolliert als eigenes Ereignis, mit einmaliger Freigabe', async () => {
      const datei = await foto();
      const { rows } = await asUserCommitted<{
        bucket_id: string;
        object_key: string;
        display_name: string;
      }>(users.ownerTherapist, HERAUSGEBEN, [datei.file_id]);
      expect(rows[0]).toEqual({
        bucket_id: BUCKET,
        object_key: datei.object_key,
        display_name: 'Foto vom 26.09.2026',
      });

      const { rows: eintrag } = await asPostgres<{ context: Record<string, string> }>(
        `select context from public.audit_log
          where action = 'patient_file.handed_out' and subject_id = $1`,
        [datei.file_id],
      );
      expect(eintrag).toHaveLength(1);
      expect(eintrag[0]!.context).toEqual({
        surface: 'web',
        patient_id: patients.max,
        document_type: 'patientenfoto',
      });

      const lesen = `select name from storage.objects where bucket_id = '${BUCKET}' and name = $1`;
      expect(
        (await asUserCommitted(users.ownerTherapist, lesen, [datei.object_key])).rows,
      ).toHaveLength(1);
      expect(
        (await asUserCommitted(users.ownerTherapist, lesen, [datei.object_key])).rows,
      ).toHaveLength(0);
    });

    it('weist jede andere Rolle ab - auch die, die das Foto aufgenommen hat', async () => {
      const datei = await foto();
      for (const userId of [
        users.therapist,
        users.teamLead,
        users.office,
        users.trainer,
        users.patientMax,
      ]) {
        const fehler = await abgefangen(asUser(userId, HERAUSGEBEN, [datei.file_id]));
        expect(fehler?.message).toMatch(/access denied|not accessible/);
      }
      expect(
        await anzahl(
          "select count(*) from public.audit_log where action = 'patient_file.handed_out'",
        ),
      ).toBe(0);
    });

    it('gibt kein gesperrtes Foto heraus und keine andere Datei', async () => {
      const datei = await foto();
      await aufgenommenVor(datei.file_id, '13 months');
      expect(
        (await abgefangen(asUser(users.ownerTherapist, HERAUSGEBEN, [datei.file_id])))?.message,
      ).toMatch(/not accessible/);

      const befund = await vorbereiten(users.therapist, { art: 'befund', mime: 'application/pdf' });
      await asPostgres(
        `insert into storage.objects (bucket_id, name, metadata)
         values ('patientenakte', $1, jsonb_build_object('size', 54321, 'mimetype', 'application/pdf'))`,
        [befund.object_key],
      );
      await asUserCommitted(
        users.therapist,
        'select public.confirm_patient_file_upload($1::uuid)',
        [befund.file_id],
      );
      expect(
        (await abgefangen(asUser(users.ownerTherapist, HERAUSGEBEN, [befund.file_id])))?.message,
      ).toMatch(/not accessible/);
    });

    it('gibt einer fremden Praxis nichts heraus', async () => {
      const datei = await foto();
      const { owner } = await fremdeOrganisation();
      expect((await abgefangen(asUser(owner, HERAUSGEBEN, [datei.file_id])))?.message).toMatch(
        /not accessible/,
      );
    });
  });
});

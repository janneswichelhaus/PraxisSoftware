import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asStorageApi,
  asUser,
  asUserCommitted,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Loeschen, Dokumentart korrigieren, Loeschauftraege quittieren
 * (DAT-002, ADR-017 Punkt 8, 13 und 25).
 *
 * Der wichtigste Test hier ist der letzte Abschnitt: Eine Quittung gibt es
 * nur, wenn das Objekt tatsaechlich nicht mehr da ist. Ohne diese Pruefung
 * waere "geloescht" auf der Objektseite eine Behauptung der Oberflaeche - und
 * ADR-017 Punkt 25 verlangt ausdruecklich einen Nachweis.
 */

const { users, patients } = SEED;

const VERORDNUNG_MAX = '88888888-8888-4888-8888-000000000001';
const PRUEFSUMME = 'b'.repeat(64);

interface Vorbereitet {
  file_id: string;
  bucket_id: string;
  object_key: string;
}

async function abgelegteDatei(
  userId: string,
  optionen: { art?: string; verordnungId?: string | null; name?: string } = {},
): Promise<Vorbereitet> {
  const { rows } = await asUserCommitted<Vorbereitet>(
    userId,
    `select file_id, bucket_id, object_key
       from public.prepare_patient_file_upload($1::uuid, $2::uuid, $3, $4, $5, $6::bigint, $7)`,
    [
      patients.max,
      optionen.verordnungId === undefined ? VERORDNUNG_MAX : optionen.verordnungId,
      optionen.art ?? 'verordnungsscan',
      optionen.name ?? 'Rezept.pdf',
      'application/pdf',
      2048,
      PRUEFSUMME,
    ],
  );
  const datei = rows[0]!;

  await asPostgres(
    `insert into storage.objects (bucket_id, name, metadata)
     values ('patientenakte', $1, jsonb_build_object('size', 2048::bigint, 'mimetype', 'application/pdf'))`,
    [datei.object_key],
  );
  await asUserCommitted(userId, 'select public.confirm_patient_file_upload($1::uuid)', [
    datei.file_id,
  ]);
  return datei;
}

async function aufraeumen(): Promise<void> {
  await asPostgres('delete from public.patient_files');
  await asPostgres('delete from public.storage_deletion_orders');
  await asPostgres("delete from storage.objects where bucket_id = 'patientenakte'");
  await asPostgres(
    "delete from public.audit_log where action like 'patient_file.%' or action like 'storage_deletion.%'",
  );
}

describe('Dateien loeschen und Loeschauftraege quittieren (DAT-002)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await aufraeumen();
  });

  describe('Datei loeschen', () => {
    it('loescht die Zeile, protokolliert und hinterlaesst einen offenen Auftrag', async () => {
      const datei = await abgelegteDatei(users.therapist);

      await asUserCommitted(users.therapist, 'select public.delete_patient_file($1::uuid)', [
        datei.file_id,
      ]);

      const zeilen = await asPostgres('select id from public.patient_files');
      expect(zeilen.rows).toEqual([]);

      const audit = await asPostgres<{ subject_id: string; context: Record<string, unknown> }>(
        "select subject_id, context from public.audit_log where action = 'patient_file.deleted'",
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]!.subject_id).toBe(datei.file_id);
      expect(audit.rows[0]!.context).toMatchObject({ document_type: 'verordnungsscan' });

      const auftraege = await asPostgres<{ object_key: string; receipted_at: string | null }>(
        'select object_key, receipted_at from public.storage_deletion_orders',
      );
      expect(auftraege.rows).toHaveLength(1);
      expect(auftraege.rows[0]!.object_key).toBe(datei.object_key);
      expect(auftraege.rows[0]!.receipted_at).toBeNull();
    });

    it('haelt den Anzeigenamen aus dem Auditeintrag heraus (ADR-017 Punkt 20)', async () => {
      const datei = await abgelegteDatei(users.therapist, { name: 'Rezept Schulter.pdf' });
      await asUserCommitted(users.therapist, 'select public.delete_patient_file($1::uuid)', [
        datei.file_id,
      ]);

      const { rows } = await asPostgres<{ eintrag: string }>(
        "select row_to_json(a)::text as eintrag from public.audit_log a where a.action = 'patient_file.deleted'",
      );
      expect(rows[0]!.eintrag).not.toContain('Rezept Schulter.pdf');
      expect(rows[0]!.eintrag).not.toContain(datei.object_key);
    });

    it('laesst office eine klinische Datei nicht loeschen', async () => {
      const datei = await abgelegteDatei(users.therapist);
      const fehler = await abgefangen(
        asUserCommitted(users.office, 'select public.delete_patient_file($1::uuid)', [
          datei.file_id,
        ]),
      );
      expect(fehler?.message).toMatch(/not allowed to delete this file|file not accessible/);

      const zeilen = await asPostgres('select id from public.patient_files');
      expect(zeilen.rows).toHaveLength(1);
    });

    it('laesst office eine organisatorische Datei loeschen', async () => {
      const datei = await abgelegteDatei(users.office, {
        verordnungId: null,
        art: 'einwilligung',
        name: 'Einwilligung.pdf',
      });
      const fehler = await abgefangen(
        asUserCommitted(users.office, 'select public.delete_patient_file($1::uuid)', [
          datei.file_id,
        ]),
      );
      expect(fehler).toBeNull();
    });

    it('weist ein Patientenkonto ab', async () => {
      const datei = await abgelegteDatei(users.therapist);
      const fehler = await abgefangen(
        asUserCommitted(users.patientMax, 'select public.delete_patient_file($1::uuid)', [
          datei.file_id,
        ]),
      );
      expect(fehler?.message).toMatch(/file not accessible|not allowed/);
    });
  });

  describe('Dokumentart korrigieren (ADR-017 Punkt 13)', () => {
    it('verschiebt die Schreibgrenze und protokolliert beide Arten', async () => {
      const datei = await abgelegteDatei(users.therapist, {
        verordnungId: null,
        art: 'befund',
        name: 'Blatt.pdf',
      });
      const LISTE = 'select document_type, is_clinical from public.list_patient_files($1::uuid)';
      const LOESCHEN = 'select public.delete_patient_file($1::uuid)';

      // Vorher: office sieht die Datei seit E15, aber als klinische - loeschen
      // darf es sie nicht (ADR-017 Punkt 13). asUser rollt zurueck.
      const vorher = await asUser(users.office, LISTE, [patients.max]);
      expect(vorher.rows).toEqual([{ document_type: 'befund', is_clinical: true }]);
      const verweigert = await abgefangen(asUser(users.office, LOESCHEN, [datei.file_id]));
      expect(verweigert?.message).toMatch(/not allowed to delete this file/);

      await asUserCommitted(
        users.therapist,
        'select public.set_patient_file_document_type($1::uuid, $2)',
        [datei.file_id, 'einwilligung'],
      );

      // Danach organisatorisch - und damit fuer office pflegbar.
      const nachher = await asUser(users.office, LISTE, [patients.max]);
      expect(nachher.rows).toEqual([{ document_type: 'einwilligung', is_clinical: false }]);
      expect(await abgefangen(asUser(users.office, LOESCHEN, [datei.file_id]))).toBeNull();

      const audit = await asPostgres<{ context: Record<string, unknown> }>(
        "select context from public.audit_log where action = 'patient_file.type_corrected'",
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]!.context).toMatchObject({
        document_type_before: 'befund',
        document_type: 'einwilligung',
      });
    });

    it('laesst office die Art nicht aendern - auch nicht an der eigenen Datei', async () => {
      const datei = await abgelegteDatei(users.office, {
        verordnungId: null,
        art: 'einwilligung',
        name: 'Einwilligung.pdf',
      });
      const fehler = await abgefangen(
        asUserCommitted(
          users.office,
          'select public.set_patient_file_document_type($1::uuid, $2)',
          [datei.file_id, 'befund'],
        ),
      );
      // Die Rolle darf nicht korrigieren (Punkt 13). Das Leserecht aus E15
      // aendert daran nichts: die Art bestimmt, wer schreiben darf.
      expect(fehler?.message).toMatch(/not allowed to correct this document type/);
    });

    it('weist einen Verordnungsscan ohne Verordnung ab', async () => {
      const datei = await abgelegteDatei(users.therapist, {
        verordnungId: null,
        art: 'befund',
        name: 'Blatt.pdf',
      });
      const fehler = await abgefangen(
        asUserCommitted(
          users.therapist,
          'select public.set_patient_file_document_type($1::uuid, $2)',
          [datei.file_id, 'verordnungsscan'],
        ),
      );
      expect(fehler?.message).toMatch(/prescription scan needs a treatment basis/);
    });

    it('weist eine unbekannte Art ab und protokolliert nichts bei gleicher Art', async () => {
      const datei = await abgelegteDatei(users.therapist);

      const unbekannt = await abgefangen(
        asUserCommitted(
          users.therapist,
          'select public.set_patient_file_document_type($1::uuid, $2)',
          [datei.file_id, 'roentgenbild'],
        ),
      );
      expect(unbekannt?.message).toMatch(/unknown document type/);

      await asUserCommitted(
        users.therapist,
        'select public.set_patient_file_document_type($1::uuid, $2)',
        [datei.file_id, 'verordnungsscan'],
      );
      const audit = await asPostgres(
        "select id from public.audit_log where action = 'patient_file.type_corrected'",
      );
      expect(audit.rows).toEqual([]);
    });
  });

  describe('Loeschauftraege ausfuehren und quittieren (ADR-017 Punkt 25)', () => {
    async function offenerAuftrag(): Promise<{ orderId: string; objectKey: string }> {
      const datei = await abgelegteDatei(users.therapist);
      await asUserCommitted(users.therapist, 'select public.delete_patient_file($1::uuid)', [
        datei.file_id,
      ]);
      const { rows } = await asPostgres<{ id: string }>(
        'select id from public.storage_deletion_orders',
      );
      return { orderId: rows[0]!.id, objectKey: datei.object_key };
    }

    it('zeigt owner den offenen Auftrag samt der Auskunft, ob das Objekt noch liegt', async () => {
      await offenerAuftrag();

      const { rows } = await asUser<{ bucket_id: string; object_present: boolean }>(
        users.ownerTherapist,
        'select bucket_id, object_present from public.list_storage_deletion_orders()',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.bucket_id).toBe('patientenakte');
      expect(rows[0]!.object_present).toBe(true);
    });

    it('gibt die Liste nicht ohne die Rolle heraus und nennt keinen Objektschluessel', async () => {
      await offenerAuftrag();

      await erwarteAbgewiesenenLeseversuch(
        users.therapist,
        'select * from public.list_storage_deletion_orders()',
        [],
        'storage_deletion.read',
      );

      const { rows } = await asUser<Record<string, unknown>>(
        users.ownerTherapist,
        'select * from public.list_storage_deletion_orders()',
      );
      expect(Object.keys(rows[0]!)).not.toContain('object_key');
    });

    it('quittiert nicht, solange das Objekt noch da ist', async () => {
      const { orderId } = await offenerAuftrag();

      const fehler = await abgefangen(
        asUserCommitted(
          users.ownerTherapist,
          'select public.receipt_storage_deletion_order($1::uuid)',
          [orderId],
        ),
      );
      expect(fehler?.message).toMatch(/object is still present/);

      const { rows } = await asPostgres<{ receipted_at: string | null }>(
        'select receipted_at from public.storage_deletion_orders',
      );
      expect(rows[0]!.receipted_at).toBeNull();
    });

    it('quittiert, sobald das Objekt weg ist, und protokolliert das', async () => {
      const { orderId, objectKey } = await offenerAuftrag();

      // Der Weg, den die Oberflaeche geht: Schluessel holen, Objekt entfernen,
      // quittieren. Das Holen legt die Loeschfreigabe an und muss deshalb
      // bestaetigt sein (FIX-015).
      const geholt = await asUserCommitted<{ object_key: string }>(
        users.ownerTherapist,
        'select object_key from public.claim_storage_deletion_order($1::uuid)',
        [orderId],
      );
      expect(geholt.rows[0]!.object_key).toBe(objectKey);

      await asStorageApi(
        users.ownerTherapist,
        'storage.object.delete_many',
        "delete from storage.objects where bucket_id = 'patientenakte' and name = $1",
        [objectKey],
      );
      await asUserCommitted(
        users.ownerTherapist,
        'select public.receipt_storage_deletion_order($1::uuid)',
        [orderId],
      );

      const { rows } = await asPostgres<{ receipted_at: string | null; receipted_by: string }>(
        'select receipted_at, receipted_by from public.storage_deletion_orders',
      );
      expect(rows[0]!.receipted_at).not.toBeNull();
      expect(rows[0]!.receipted_by).toBe(users.ownerTherapist);

      const offen = await asUser(
        users.ownerTherapist,
        'select id from public.list_storage_deletion_orders()',
      );
      expect(offen.rows).toEqual([]);

      const audit = await asPostgres<{ subject_id: string; eintrag: string }>(
        `select a.subject_id, row_to_json(a)::text as eintrag from public.audit_log a
          where a.action = 'storage_deletion.receipted'`,
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]!.subject_id).toBe(orderId);
      // Der Objektschluessel gehoert nicht ins Log (ADR-011).
      expect(audit.rows[0]!.eintrag).not.toContain(objectKey);
    });

    it('quittiert keinen Auftrag zweimal', async () => {
      const { orderId, objectKey } = await offenerAuftrag();
      await asPostgres(
        "delete from storage.objects where bucket_id = 'patientenakte' and name = $1",
        [objectKey],
      );
      await asUserCommitted(
        users.ownerTherapist,
        'select public.receipt_storage_deletion_order($1::uuid)',
        [orderId],
      );

      const fehler = await abgefangen(
        asUserCommitted(
          users.ownerTherapist,
          'select public.receipt_storage_deletion_order($1::uuid)',
          [orderId],
        ),
      );
      expect(fehler?.message).toMatch(/deletion order not accessible/);
    });
  });

  describe('DELETE-Policy auf storage.objects', () => {
    const LOESCHEN =
      "delete from storage.objects where bucket_id = 'patientenakte' and name = $1 returning id";
    // So meldet die Storage-API das Entfernen (FIX-015: nur dafuer gilt die
    // Loeschfreigabe).
    const ENTFERNEN = 'storage.object.delete_many';

    it('laesst kein Objekt loeschen, dessen Zeile noch steht', async () => {
      const datei = await abgelegteDatei(users.therapist);

      const { rows } = await asStorageApi(users.ownerTherapist, ENTFERNEN, LOESCHEN, [
        datei.object_key,
      ]);
      expect(rows).toEqual([]);

      const objekte = await asPostgres(
        "select id from storage.objects where bucket_id = 'patientenakte'",
      );
      expect(objekte.rows).toHaveLength(1);
    });

    it('laesst mit offenem Auftrag loeschen - aber nur owner', async () => {
      const datei = await abgelegteDatei(users.therapist);
      await asUserCommitted(users.therapist, 'select public.delete_patient_file($1::uuid)', [
        datei.file_id,
      ]);

      const therapeutin = await asStorageApi(users.therapist, ENTFERNEN, LOESCHEN, [
        datei.object_key,
      ]);
      expect(therapeutin.rows).toEqual([]);

      // FIX-015: Auch der Owner loescht nur gegen eine Loeschfreigabe.
      const { rows: auftraege } = await asPostgres<{ id: string }>(
        'select id from public.storage_deletion_orders where object_key = $1',
        [datei.object_key],
      );
      await asUserCommitted(
        users.ownerTherapist,
        'select object_key from public.claim_storage_deletion_order($1::uuid)',
        [auftraege[0]!.id],
      );

      const inhaberin = await asStorageApi<{ id: string }>(
        users.ownerTherapist,
        ENTFERNEN,
        LOESCHEN,
        [datei.object_key],
      );
      expect(inhaberin.rows).toHaveLength(1);
    });
  });
});

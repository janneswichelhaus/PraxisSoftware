import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, abgefangen, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Abgleich zwischen Datenbank und Ablage (DAT-003, ADR-017 Punkt 27).
 *
 * Der ADR nennt zwei Zustaende, die es nicht geben darf, und der Abgleich ist
 * die einzige Stelle, an der sie ueberhaupt auffallen: ein Datensatz ohne
 * Objekt und ein Objekt ohne Datensatz. Ohne diese Tests waere der Abgleich
 * eine Absichtserklaerung.
 */

const { users, patients, organizationId } = SEED;

const VERORDNUNG_MAX = '88888888-8888-4888-8888-000000000001';

interface Vorbereitet {
  file_id: string;
  object_key: string;
}

async function abgelegteDatei(): Promise<Vorbereitet> {
  const { rows } = await asUserCommitted<Vorbereitet>(
    users.therapist,
    `select file_id, object_key
       from public.prepare_patient_file_upload($1::uuid, $2::uuid, $3, $4, $5, $6::bigint, $7)`,
    [
      patients.max,
      VERORDNUNG_MAX,
      'verordnungsscan',
      'Rezept.pdf',
      'application/pdf',
      1024,
      'c'.repeat(64),
    ],
  );
  const datei = rows[0]!;
  await asPostgres(
    `insert into storage.objects (bucket_id, name, metadata)
     values ('patientenakte', $1, jsonb_build_object('size', 1024::bigint, 'mimetype', 'application/pdf'))`,
    [datei.object_key],
  );
  await asUserCommitted(users.therapist, 'select public.confirm_patient_file_upload($1::uuid)', [
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

describe('Abgleich der Dateiablage (DAT-003)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await aufraeumen();
  });

  describe('Fehlende Objekte', () => {
    it('meldet nichts, solange alles zusammenpasst', async () => {
      await abgelegteDatei();

      const fehlend = await asUser(
        users.ownerTherapist,
        'select file_id from public.list_missing_patient_file_objects()',
      );
      expect(fehlend.rows).toEqual([]);

      const verwaist = await asUser<{ anzahl: number }>(
        users.ownerTherapist,
        'select public.count_orphaned_patient_file_objects() as anzahl',
      );
      expect(verwaist.rows[0]!.anzahl).toBe(0);
    });

    it('nennt Akte und Dateinamen, wenn das Objekt fehlt', async () => {
      const datei = await abgelegteDatei();
      await asPostgres(
        "delete from storage.objects where bucket_id = 'patientenakte' and name = $1",
        [datei.object_key],
      );

      const { rows } = await asUser<{
        file_id: string;
        patient_id: string;
        patient_name: string;
        display_name: string;
      }>(users.ownerTherapist, 'select * from public.list_missing_patient_file_objects()');

      expect(rows).toHaveLength(1);
      expect(rows[0]!.file_id).toBe(datei.file_id);
      expect(rows[0]!.patient_id).toBe(patients.max);
      expect(rows[0]!.patient_name).toBe('Max Mustermann');
      expect(rows[0]!.display_name).toBe('Rezept.pdf');
    });

    it('zaehlt eine nicht bestaetigte Datei nicht als fehlend', async () => {
      // Eine 'pending'-Zeile ohne Objekt ist ein abgebrochener Upload, kein
      // Verlust - sie wird nach 24 Stunden verworfen (ADR-017 Punkt 7).
      await asUserCommitted(
        users.therapist,
        `select file_id from public.prepare_patient_file_upload(
           $1::uuid, $2::uuid, 'verordnungsscan', 'Rezept.pdf', 'application/pdf', 1024, $3)`,
        [patients.max, VERORDNUNG_MAX, 'd'.repeat(64)],
      );

      const { rows } = await asUser(
        users.ownerTherapist,
        'select file_id from public.list_missing_patient_file_objects()',
      );
      expect(rows).toEqual([]);
    });
  });

  describe('Verwaiste Objekte', () => {
    it('zaehlt ein Objekt ohne Datensatz', async () => {
      await asPostgres(
        `insert into storage.objects (bucket_id, name, metadata)
         values ('patientenakte', $1, '{}'::jsonb)`,
        [`${organizationId}/${patients.max}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`],
      );

      const { rows } = await asUser<{ anzahl: number }>(
        users.ownerTherapist,
        'select public.count_orphaned_patient_file_objects() as anzahl',
      );
      expect(rows[0]!.anzahl).toBe(1);
    });

    it('zaehlt ein Objekt einer fremden Organisation nicht mit', async () => {
      await asPostgres(
        `insert into storage.objects (bucket_id, name, metadata)
         values ('patientenakte', $1, '{}'::jsonb)`,
        ['22222222-2222-4222-8222-0000000000ff/x/y'],
      );

      const { rows } = await asUser<{ anzahl: number }>(
        users.ownerTherapist,
        'select public.count_orphaned_patient_file_objects() as anzahl',
      );
      expect(rows[0]!.anzahl).toBe(0);
    });

    it('zaehlt ein Objekt mit offenem Loeschauftrag nicht als verwaist', async () => {
      const datei = await abgelegteDatei();
      await asUserCommitted(users.therapist, 'select public.delete_patient_file($1::uuid)', [
        datei.file_id,
      ]);

      // Die Zeile ist weg, das Objekt liegt noch - aber es ist in Arbeit und
      // nicht verwaist.
      const { rows } = await asUser<{ anzahl: number }>(
        users.ownerTherapist,
        'select public.count_orphaned_patient_file_objects() as anzahl',
      );
      expect(rows[0]!.anzahl).toBe(0);
    });

    it('merkt verwaiste Objekte ueber denselben Loeschweg vor', async () => {
      const schluessel = `${organizationId}/${patients.max}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
      await asPostgres(
        `insert into storage.objects (bucket_id, name, metadata)
         values ('patientenakte', $1, '{}'::jsonb)`,
        [schluessel],
      );

      const vorgemerkt = await asUserCommitted<{ anzahl: number }>(
        users.ownerTherapist,
        'select public.order_orphaned_object_deletion() as anzahl',
      );
      expect(vorgemerkt.rows[0]!.anzahl).toBe(1);

      const auftraege = await asPostgres<{ object_key: string }>(
        'select object_key from public.storage_deletion_orders where receipted_at is null',
      );
      expect(auftraege.rows.map((r) => r.object_key)).toEqual([schluessel]);

      // Danach ist nichts mehr verwaist - es ist in Arbeit.
      const nachher = await asUser<{ anzahl: number }>(
        users.ownerTherapist,
        'select public.count_orphaned_patient_file_objects() as anzahl',
      );
      expect(nachher.rows[0]!.anzahl).toBe(0);
    });

    it('merkt kein Objekt vor, zu dem noch ein Datensatz gehoert', async () => {
      await abgelegteDatei();

      const vorgemerkt = await asUserCommitted<{ anzahl: number }>(
        users.ownerTherapist,
        'select public.order_orphaned_object_deletion() as anzahl',
      );
      expect(vorgemerkt.rows[0]!.anzahl).toBe(0);

      const auftraege = await asPostgres('select id from public.storage_deletion_orders');
      expect(auftraege.rows).toEqual([]);
    });

    it('merkt ein Objekt nicht zweimal vor', async () => {
      await asPostgres(
        `insert into storage.objects (bucket_id, name, metadata)
         values ('patientenakte', $1, '{}'::jsonb)`,
        [`${organizationId}/${patients.max}/cccccccc-cccc-4ccc-8ccc-cccccccccccc`],
      );

      await asUserCommitted(users.ownerTherapist, 'select public.order_orphaned_object_deletion()');
      const zweiter = await asUserCommitted<{ anzahl: number }>(
        users.ownerTherapist,
        'select public.order_orphaned_object_deletion() as anzahl',
      );
      expect(zweiter.rows[0]!.anzahl).toBe(0);

      const auftraege = await asPostgres('select id from public.storage_deletion_orders');
      expect(auftraege.rows).toHaveLength(1);
    });
  });

  describe('Wer den Abgleich sehen darf', () => {
    it('weist alle Rollen ausser owner ab', async () => {
      for (const konto of [users.therapist, users.teamLead, users.office, users.patientMax]) {
        const fehlend = await abgefangen(
          asUser(konto, 'select * from public.list_missing_patient_file_objects()'),
        );
        expect(fehlend?.message).toMatch(/not allowed to read the storage reconciliation/);

        const verwaist = await abgefangen(
          asUser(konto, 'select public.count_orphaned_patient_file_objects()'),
        );
        expect(verwaist?.message).toMatch(/not allowed to read the storage reconciliation/);

        const vormerken = await abgefangen(
          asUser(konto, 'select public.order_orphaned_object_deletion()'),
        );
        expect(vormerken?.message).toMatch(/not allowed to order deletions/);
      }
    });
  });
});

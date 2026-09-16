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

/**
 * BEF-004: Dateizugriff nur ueber den auditierten Weg (ADR-017 Punkt 11, 15,
 * 20, 25; ADR-010 Punkt 2 und 14).
 *
 * Die Storage-API liest, signiert, listet und loescht mit der Rolle der
 * anfragenden Person gegen `storage.objects` - unter genau den RLS-Policies,
 * die hier gegen den Shim geprueft werden. Signieren und Laden sind ein
 * `SELECT ... WHERE name = $1`, Auflisten ein Praefix-Scan, Loeschen ein
 * `DELETE ... RETURNING`. Was diese Tests einer Rolle verweigern, verweigert
 * ihr die Storage-API also auch. Den Nachweis gegen die echte API fuehrt
 * `tests/e2e/authenticated/patient-file-access.spec.ts`.
 *
 * Der Befund: Wer die Dateiliste lesen darf, kennt den Objektschluessel
 * (`<organisation>/<bezug>/<datei-id>`) und bekam das Objekt bisher, ohne
 * `issue_patient_file_link` aufzurufen - also ohne Auditeintrag. Ein
 * versteckter Zufallsanteil im Schluessel allein wuerde daran nichts aendern:
 * Wer einmal oeffnen durfte, kennt den Schluessel danach.
 */

const { users, patients, organizationId } = SEED;

/** Verordnung von Max Mustermann aus supabase/seed.sql. */
const VERORDNUNG_MAX = '88888888-8888-4888-8888-000000000001';
const PRUEFSUMME = 'a'.repeat(64);

const LESEN = "select name from storage.objects where bucket_id = 'patientenakte' and name = $1";
const AUFLISTEN =
  "select name from storage.objects where bucket_id = 'patientenakte' and name like $1";
const LOESCHEN =
  "delete from storage.objects where bucket_id = 'patientenakte' and name = $1 returning name";
const VERWEIS = 'select object_key from public.issue_patient_file_link($1::uuid)';
const LOESCHFREIGABE = 'select object_key from public.claim_storage_deletion_order($1::uuid)';

/** Operationen, wie die Storage-API sie in `storage.operation` meldet (v1.72.1). */
const ENTFERNEN = 'storage.object.delete_many';
const LESEOPERATIONEN = [
  'storage.object.sign',
  'storage.object.get_authenticated',
  'storage.object.info_authenticated',
  'storage.object.copy',
  'storage.object.list',
  'storage.object.move',
];

interface Datei {
  file_id: string;
  object_key: string;
}

/** Vorbereiten, Objekt ablegen, bestaetigen - der Weg aus ADR-017 Punkt 7. */
async function abgelegteDatei(userId: string = users.therapist): Promise<Datei> {
  const { rows } = await asUserCommitted<Datei>(
    userId,
    `select file_id, object_key from public.prepare_patient_file_upload(
       $1::uuid, $2::uuid, 'verordnungsscan', 'Rezept.pdf', 'application/pdf', 12345, $3)`,
    [patients.max, VERORDNUNG_MAX, PRUEFSUMME],
  );
  const datei = rows[0]!;
  await asPostgres(
    `insert into storage.objects (bucket_id, name, metadata)
     values ('patientenakte', $1, jsonb_build_object('size', 12345, 'mimetype', 'application/pdf'))`,
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

async function auditAnzahl(action: string): Promise<number> {
  const { rows } = await asPostgres<{ n: string }>(
    'select count(*)::text as n from public.audit_log where action = $1',
    [action],
  );
  return Number(rows[0]!.n);
}

async function objektVorhanden(objectKey: string): Promise<boolean> {
  const { rows } = await asPostgres(
    "select 1 from storage.objects where bucket_id = 'patientenakte' and name = $1",
    [objectKey],
  );
  return rows.length === 1;
}

async function freigaben(): Promise<number> {
  const { rows } = await asPostgres<{ n: string }>(
    'select count(*)::text as n from public.patient_file_access_grants',
  );
  return Number(rows[0]!.n);
}

/** Datei ablegen und ueber den Anwendungspfad loeschen: ein offener Auftrag. */
async function offenerAuftrag(): Promise<{ orderId: string; objectKey: string }> {
  const datei = await abgelegteDatei();
  await asUserCommitted(users.therapist, 'select public.delete_patient_file($1::uuid)', [
    datei.file_id,
  ]);
  const { rows } = await asPostgres<{ id: string }>(
    'select id from public.storage_deletion_orders where object_key = $1',
    [datei.object_key],
  );
  return { orderId: rows[0]!.id, objectKey: datei.object_key };
}

describe('BEF-004: Dateizugriff nur ueber den auditierten Weg', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await aufraeumen();
  });

  describe('ohne ausgestellten Verweis', () => {
    it.each([
      ['therapist', users.therapist],
      ['team_lead', users.teamLead],
      ['owner', users.ownerTherapist],
      ['office', users.office],
    ])('liefert %s das Objekt nicht - auch mit bekanntem Schluessel', async (_rolle, konto) => {
      const datei = await abgelegteDatei();

      const { rows } = await asUserCommitted(konto, LESEN, [datei.object_key]);
      expect(rows).toEqual([]);
    });

    it('listet kein Objekt der Praxis auf', async () => {
      await abgelegteDatei();

      for (const konto of [users.therapist, users.office, users.ownerTherapist]) {
        const { rows } = await asUserCommitted(konto, AUFLISTEN, [`${organizationId}/%`]);
        expect(rows).toEqual([]);
      }
    });
  });

  describe('nach der Ausstellung', () => {
    it('gibt genau einen Zugriff frei - jeder weitere braucht eine neue Ausstellung', async () => {
      const datei = await abgelegteDatei();
      await asUserCommitted(users.office, VERWEIS, [datei.file_id]);

      const erster = await asUserCommitted(users.office, LESEN, [datei.object_key]);
      expect(erster.rows).toHaveLength(1);

      // Nach einem erlaubten Oeffnen ist der Schluessel bekannt - er allein
      // oeffnet nichts mehr.
      const zweiter = await asUserCommitted(users.office, LESEN, [datei.object_key]);
      expect(zweiter.rows).toEqual([]);

      await asUserCommitted(users.office, VERWEIS, [datei.file_id]);
      const dritter = await asUserCommitted(users.office, LESEN, [datei.object_key]);
      expect(dritter.rows).toHaveLength(1);

      // Zwei Zugriffe, zwei Auditeintraege (ADR-010 Punkt 14).
      expect(await auditAnzahl('patient_file.link_issued')).toBe(2);
    });

    it('bindet die Freigabe an die Person, der der Verweis ausgestellt wurde', async () => {
      const datei = await abgelegteDatei();
      await asUserCommitted(users.therapist, VERWEIS, [datei.file_id]);

      const fremd = await asUserCommitted(users.office, LESEN, [datei.object_key]);
      expect(fremd.rows).toEqual([]);

      const eigen = await asUserCommitted(users.therapist, LESEN, [datei.object_key]);
      expect(eigen.rows).toHaveLength(1);
    });

    it('bindet die Freigabe an genau diese Datei', async () => {
      const erste = await abgelegteDatei();
      const zweite = await abgelegteDatei();
      await asUserCommitted(users.therapist, VERWEIS, [erste.file_id]);

      const andere = await asUserCommitted(users.therapist, LESEN, [zweite.object_key]);
      expect(andere.rows).toEqual([]);
    });

    it('oeffnet ueber ein Auflisten keinen weiteren Zugriff', async () => {
      const datei = await abgelegteDatei();
      await asUserCommitted(users.therapist, VERWEIS, [datei.file_id]);

      const liste = await asUserCommitted<{ name: string }>(users.therapist, AUFLISTEN, [
        `${organizationId}/%`,
      ]);
      // Hoechstens der eine ausgestellte Schluessel, und damit ist die
      // Freigabe verbraucht.
      expect(liste.rows.map((r) => r.name).filter((n) => n !== datei.object_key)).toEqual([]);

      const danach = await asUserCommitted(users.therapist, LESEN, [datei.object_key]);
      expect(danach.rows).toEqual([]);
    });

    it('laesst eine nicht genutzte Freigabe verfallen', async () => {
      const datei = await abgelegteDatei();
      await asUserCommitted(users.therapist, VERWEIS, [datei.file_id]);
      await asPostgres(
        "update public.patient_file_access_grants set created_at = now() - interval '2 minutes', expires_at = now() - interval '1 second'",
      );

      const { rows } = await asUserCommitted(users.therapist, LESEN, [datei.object_key]);
      expect(rows).toEqual([]);
    });

    it('gibt einem Patientenkonto weder Verweis noch Objekt', async () => {
      const datei = await abgelegteDatei();

      const verweis = await abgefangen(asUserCommitted(users.patientMax, VERWEIS, [datei.file_id]));
      expect(verweis?.message).toMatch(/file not accessible/);

      const { rows } = await asUserCommitted(users.patientMax, LESEN, [datei.object_key]);
      expect(rows).toEqual([]);
    });
  });

  describe('Loeschauftrag (ADR-017 Punkt 25)', () => {
    it('liefert dem Owner das Objekt eines Auftrags ohne Loeschfreigabe weder zum Lesen noch zum Loeschen', async () => {
      const { objectKey } = await offenerAuftrag();

      const gelesen = await asUserCommitted(users.ownerTherapist, LESEN, [objectKey]);
      expect(gelesen.rows).toEqual([]);

      const geloescht = await asStorageApi(users.ownerTherapist, ENTFERNEN, LOESCHEN, [objectKey]);
      expect(geloescht.rows).toEqual([]);
      expect(await objektVorhanden(objectKey)).toBe(true);
    });

    it('gibt nach der Loeschfreigabe genau eine Operation frei und protokolliert die Freigabe', async () => {
      const { orderId, objectKey } = await offenerAuftrag();

      await asUserCommitted(users.ownerTherapist, LOESCHFREIGABE, [orderId]);
      expect(await auditAnzahl('storage_deletion.claimed')).toBe(1);

      // Verbraucht eine Abfrage unter der Entfernen-Operation die Freigabe, ohne
      // zu loeschen, bleibt das Objekt liegen - und der Auftrag offen, weil die
      // Quittung es noch findet.
      const gelesen = await asStorageApi(users.ownerTherapist, ENTFERNEN, LESEN, [objectKey]);
      expect(gelesen.rows).toHaveLength(1);
      const geloescht = await asStorageApi(users.ownerTherapist, ENTFERNEN, LOESCHEN, [objectKey]);
      expect(geloescht.rows).toEqual([]);
      expect(await objektVorhanden(objectKey)).toBe(true);

      // Mit einer neuen, wieder protokollierten Freigabe gelingt das Loeschen.
      await asUserCommitted(users.ownerTherapist, LOESCHFREIGABE, [orderId]);
      expect(await auditAnzahl('storage_deletion.claimed')).toBe(2);
      const zweiter = await asStorageApi(users.ownerTherapist, ENTFERNEN, LOESCHEN, [objectKey]);
      expect(zweiter.rows).toHaveLength(1);

      await asUserCommitted(
        users.ownerTherapist,
        'select public.receipt_storage_deletion_order($1::uuid)',
        [orderId],
      );
      expect(await auditAnzahl('storage_deletion.receipted')).toBe(1);
    });

    it('oeffnet mit der Loeschfreigabe kein Lesen, Signieren, Kopieren oder Auflisten', async () => {
      const { orderId, objectKey } = await offenerAuftrag();
      await asUserCommitted(users.ownerTherapist, LOESCHFREIGABE, [orderId]);

      // Eine Datei, die aus der Akte schon verschwunden ist, soll ueber die
      // Loeschfreigabe nicht noch einmal geladen werden koennen.
      for (const operation of LESEOPERATIONEN) {
        const gelesen = await asStorageApi(users.ownerTherapist, operation, LESEN, [objectKey]);
        expect(gelesen.rows, operation).toEqual([]);
      }
      const liste = await asStorageApi(users.ownerTherapist, 'storage.object.list', AUFLISTEN, [
        `${organizationId}/%`,
      ]);
      expect(liste.rows).toEqual([]);
      const ohneOperation = await asUserCommitted(users.ownerTherapist, LESEN, [objectKey]);
      expect(ohneOperation.rows).toEqual([]);

      // Die Versuche haben die Freigabe nicht verbraucht: Das Entfernen gelingt.
      const geloescht = await asStorageApi(users.ownerTherapist, ENTFERNEN, LOESCHEN, [objectKey]);
      expect(geloescht.rows).toHaveLength(1);
    });

    it('stellt einer anderen Rolle keine Loeschfreigabe aus', async () => {
      const { orderId } = await offenerAuftrag();

      for (const konto of [users.therapist, users.office, users.teamLead]) {
        const fehler = await abgefangen(asUserCommitted(konto, LOESCHFREIGABE, [orderId]));
        expect(fehler?.message).toMatch(/not allowed to execute deletion orders/);
      }
      expect(await auditAnzahl('storage_deletion.claimed')).toBe(0);
    });
  });

  describe('Mandantentrennung (ADR-003)', () => {
    const FREMDE_ORG = '22222222-2222-4222-8222-0000000000f2';
    const FREMDE_PERSON = '44444444-4444-4444-8444-0000000000f2';
    const FREMDE_PATIENTIN = '66666666-6666-4666-8666-0000000000f2';
    const FREMDE_DATEI = '99999999-9999-4999-8999-0000000000f2';

    it('oeffnet auch mit einer Freigabe kein Objekt einer fremden Praxis', async () => {
      // Testvorbereitung als postgres: Datei, Loeschauftrag und Freigaben einer
      // anderen Organisation - Freigaben, wie sie nur ein Fehler anlegen koennte.
      await asPostgres(`
        insert into public.organizations (id, name, time_zone)
          values ('${FREMDE_ORG}', 'Test Praxis Anderswo', 'Europe/Berlin')
          on conflict do nothing;
        insert into public.persons (id, organization_id, given_name, family_name)
          values ('${FREMDE_PERSON}', '${FREMDE_ORG}', 'Frieda', 'Fremdpatientin')
          on conflict do nothing;
        insert into public.patients (id, organization_id, person_id, status)
          values ('${FREMDE_PATIENTIN}', '${FREMDE_ORG}', '${FREMDE_PERSON}', 'active')
          on conflict do nothing;
        insert into public.patient_files (id, organization_id, patient_id, document_type,
            display_name, mime_type, byte_size, checksum_sha256, status, confirmed_at)
          values ('${FREMDE_DATEI}', '${FREMDE_ORG}', '${FREMDE_PATIENTIN}', 'befund',
            'Fremder Befund.pdf', 'application/pdf', 12345, '${PRUEFSUMME}', 'ready', now());
      `);
      const { rows: dateien } = await asPostgres<{ object_key: string }>(
        'select object_key from public.patient_files where id = $1',
        [FREMDE_DATEI],
      );
      const dateiSchluessel = dateien[0]!.object_key;
      const auftragSchluessel = `${FREMDE_ORG}/${FREMDE_PATIENTIN}/geloescht`;
      for (const schluessel of [dateiSchluessel, auftragSchluessel]) {
        await asPostgres(
          `insert into storage.objects (bucket_id, name, metadata)
           values ('patientenakte', $1, jsonb_build_object('size', 12345, 'mimetype', 'application/pdf'))`,
          [schluessel],
        );
      }
      const { rows: auftraege } = await asPostgres<{ id: string }>(
        `insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
         values ($1, 'patientenakte', $2) returning id`,
        [FREMDE_ORG, auftragSchluessel],
      );
      for (const org of [organizationId, FREMDE_ORG]) {
        await asPostgres(
          `insert into public.patient_file_access_grants
             (organization_id, user_id, patient_file_id, expires_at)
           values ($1, $2, $3, now() + interval '30 seconds'),
                  ($1, $4, $3, now() + interval '30 seconds')`,
          [org, users.office, FREMDE_DATEI, users.ownerTherapist],
        );
        await asPostgres(
          `insert into public.patient_file_access_grants
             (organization_id, user_id, deletion_order_id, expires_at)
           values ($1, $2, $3, now() + interval '30 seconds')`,
          [org, users.ownerTherapist, auftraege[0]!.id],
        );
      }

      for (const konto of [users.office, users.ownerTherapist]) {
        const gelesen = await asUserCommitted(konto, LESEN, [dateiSchluessel]);
        expect(gelesen.rows).toEqual([]);
      }
      // Beim Entfernen prueft auch app.may_delete_storage_object die Organisation:
      // Diese Haelfte ist Verteidigung in der Tiefe, kein Nachweis der Leseregel allein.
      const geloescht = await asStorageApi(users.ownerTherapist, ENTFERNEN, LOESCHEN, [
        auftragSchluessel,
      ]);
      expect(geloescht.rows).toEqual([]);
      expect(await objektVorhanden(auftragSchluessel)).toBe(true);
    });
  });

  describe('Freigabetabelle (ADR-008)', () => {
    it('ist fuer den Anwendungspfad verschlossen', async () => {
      const fehler = await abgefangen(
        asUser(users.ownerTherapist, 'select * from public.patient_file_access_grants'),
      );
      expect(fehler?.message).toMatch(/permission denied/i);
    });

    it('entfernt verbrauchte und abgelaufene Freigaben und faellt mit der Datei', async () => {
      const datei = await abgelegteDatei();

      await asUserCommitted(users.therapist, VERWEIS, [datei.file_id]);
      expect(await freigaben()).toBe(1);
      await asUserCommitted(users.therapist, LESEN, [datei.object_key]);
      expect(await freigaben()).toBe(0);

      await asUserCommitted(users.office, VERWEIS, [datei.file_id]);
      await asPostgres(
        "update public.patient_file_access_grants set created_at = now() - interval '2 minutes', expires_at = now() - interval '1 second'",
      );
      await asUserCommitted(users.therapist, VERWEIS, [datei.file_id]);
      expect(await freigaben()).toBe(1);

      await asPostgres('delete from public.patient_files where id = $1', [datei.file_id]);
      expect(await freigaben()).toBe(0);
    });
  });
});

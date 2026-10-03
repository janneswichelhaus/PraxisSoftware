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
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * PRX-011: Verordnung ohne Papier.
 *
 * Die Therapeut:in fotografiert am Termin, der Scan haengt vorlaeufig an der
 * Patient:in; das Buero sieht ihn als "Verordnung zu erfassen" und haengt ihn
 * beim Speichern an die neue Grundlage (ANN-011, ADR-017 Punkt 10).
 */
const { users, patients, organizationId } = SEED;

const VERORDNUNG_MAX = '88888888-8888-4888-8888-000000000001';
const VERORDNUNG_ERIKA = '88888888-8888-4888-8888-000000000003';
const PRUEFSUMME = 'c'.repeat(64);

const LISTE = 'select * from public.list_open_prescription_scans()';
const ZUORDNEN = 'select public.assign_prescription_scan($1::uuid, $2::uuid)';

interface OffenerScan {
  file_id: string;
  patient_id: string;
  patient_given_name: string;
  patient_family_name: string;
  uploaded_at: string;
  uploaded_by_name: string | null;
}

/** Legt eine bestaetigte Datei ab - der ganze Weg aus ADR-017 Punkt 7. */
async function abgelegterScan(
  userId: string,
  optionen: { patientId?: string; grundlage?: string | null; art?: string } = {},
): Promise<{ file_id: string; object_key: string }> {
  const { rows } = await asUserCommitted<{ file_id: string; object_key: string }>(
    userId,
    `select file_id, object_key
       from public.prepare_patient_file_upload($1::uuid, $2::uuid, $3, $4, $5, $6::bigint, $7)`,
    [
      optionen.patientId ?? patients.max,
      optionen.grundlage === undefined ? null : optionen.grundlage,
      optionen.art ?? 'verordnungsscan',
      'Verordnung.jpg',
      'image/jpeg',
      2048,
      PRUEFSUMME,
    ],
  );
  const datei = rows[0]!;
  await asPostgres(
    `insert into storage.objects (bucket_id, name, metadata)
     values ('patientenakte', $1, jsonb_build_object('size', 2048::bigint, 'mimetype', 'image/jpeg'))`,
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
  await asPostgres("delete from public.audit_log where action like 'patient_file.%'");
}

describe('Verordnung ohne Papier (PRX-011)', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await aufraeumen();
  });

  describe('list_open_prescription_scans', () => {
    it('zeigt dem Buero den Scan ohne Grundlage, mit Name, Tag und aufnehmender Person', async () => {
      const datei = await abgelegterScan(users.therapist);

      const { rows } = await asUser<OffenerScan>(users.office, LISTE);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        file_id: datei.file_id,
        patient_id: patients.max,
        patient_given_name: 'Max',
        patient_family_name: 'Mustermann',
      });
      expect(rows[0]!.uploaded_at).toBeTruthy();
      expect(rows[0]!.uploaded_by_name).toBeTruthy();
      // Kein Objektschluessel, kein Verweis in der Liste (ADR-017 Punkt 15).
      expect(Object.keys(rows[0]!)).not.toContain('object_key');
    });

    it('zeigt weder einen zugeordneten Scan noch eine andere Dateiart noch eine unbestaetigte Datei', async () => {
      await abgelegterScan(users.therapist, { grundlage: VERORDNUNG_MAX });
      await abgelegterScan(users.therapist, { art: 'befund' });
      await asUserCommitted(
        users.therapist,
        `select file_id from public.prepare_patient_file_upload($1::uuid, null, 'verordnungsscan', 'x.jpg', 'image/jpeg', 10::bigint, $2)`,
        [patients.max, PRUEFSUMME],
      );

      const { rows } = await asUser<OffenerScan>(users.office, LISTE);
      expect(rows).toEqual([]);
    });

    it('zeigt allen vier Praxisrollen dieselbe Liste', async () => {
      await abgelegterScan(users.therapist);
      for (const konto of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
        const { rows } = await asUser<OffenerScan>(konto, LISTE);
        expect(rows, konto).toHaveLength(1);
      }
    });

    it('weist Trainingsbetreuung und Patientenkonto protokolliert ab (G6b)', async () => {
      await abgelegterScan(users.therapist);
      for (const konto of [users.trainer, users.patientMax]) {
        await erwarteAbgewiesenenLeseversuch(konto, LISTE, [], 'treatment_bases.read');
      }
    });

    it('endet an der eigenen Praxis', async () => {
      await abgelegterScan(users.therapist);
      const fremd = await fremdeOrganisation();
      const { rows } = await asUser<OffenerScan>(fremd.owner, LISTE);
      expect(rows).toEqual([]);
    });

    it('ist ohne Session und fuer anon nicht aufrufbar', async () => {
      await expect(asUser(null, LISTE)).rejects.toThrow(/not authenticated/);
      await expect(asAnon(LISTE)).rejects.toThrow(/permission denied/i);
    });
  });

  describe('assign_prescription_scan', () => {
    it('haengt den Scan an die Grundlage, ohne den Ort des Objekts zu aendern', async () => {
      const datei = await abgelegterScan(users.therapist);

      await asUserCommitted(users.office, ZUORDNEN, [datei.file_id, VERORDNUNG_MAX]);

      const { rows } = await asPostgres<{ treatment_basis_id: string; object_key: string }>(
        'select treatment_basis_id, object_key from public.patient_files where id = $1',
        [datei.file_id],
      );
      expect(rows[0]!.treatment_basis_id).toBe(VERORDNUNG_MAX);
      // Das Objekt liegt weiter unter dem alten Schluessel - und wird gefunden.
      expect(rows[0]!.object_key).toBe(datei.object_key);
      expect(rows[0]!.object_key).toBe(`${organizationId}/${patients.max}/${datei.file_id}`);

      const anDerGrundlage = await asUser<{ id: string; object_missing: boolean }>(
        users.office,
        'select id, object_missing from public.list_patient_files($1::uuid, $2::uuid)',
        [patients.max, VERORDNUNG_MAX],
      );
      expect(anDerGrundlage.rows).toEqual([{ id: datei.file_id, object_missing: false }]);

      const offen = await asUser<OffenerScan>(users.office, LISTE);
      expect(offen.rows).toEqual([]);
    });

    it('ordnet zu und schreibt keinen Auditeintrag (LOG-EPIC-001)', async () => {
      const datei = await abgelegterScan(users.therapist);
      await asUserCommitted(users.office, ZUORDNEN, [datei.file_id, VERORDNUNG_MAX]);

      const zeile = await asPostgres<{ treatment_basis_id: string }>(
        'select treatment_basis_id from public.patient_files where id = $1',
        [datei.file_id],
      );
      expect(zeile.rows).toEqual([{ treatment_basis_id: VERORDNUNG_MAX }]);

      // Die Zuordnung ist eine anerkannte Luecke (ANN-230): kein Eintrag, also
      // auch weder Dateiname noch Objektschluessel im Auditlog.
      const { rows } = await asPostgres<{ action: string }>(
        `select action from public.audit_log where subject_id = $1 and outcome = 'success'`,
        [datei.file_id],
      );
      expect(rows).toEqual([]);
    });

    it('ordnet nur einmal zu', async () => {
      const datei = await abgelegterScan(users.therapist);
      await asUserCommitted(users.office, ZUORDNEN, [datei.file_id, VERORDNUNG_MAX]);
      const fehler = await abgefangen(
        asUser(users.office, ZUORDNEN, [datei.file_id, '88888888-8888-4888-8888-000000000002']),
      );
      expect(fehler?.message).toMatch(/already assigned/);
    });

    it('weist die Grundlage einer anderen Patientin ab', async () => {
      const datei = await abgelegterScan(users.therapist);
      const fehler = await abgefangen(
        asUser(users.office, ZUORDNEN, [datei.file_id, VERORDNUNG_ERIKA]),
      );
      expect(fehler?.message).toMatch(/treatment basis not accessible/);
    });

    it('ordnet nur einen Verordnungsscan zu', async () => {
      const datei = await abgelegterScan(users.therapist, { art: 'befund' });
      const fehler = await abgefangen(
        asUser(users.therapist, ZUORDNEN, [datei.file_id, VERORDNUNG_MAX]),
      );
      expect(fehler?.message).toMatch(/only a prescription scan/);
    });

    it('weist Trainingsbetreuung, Patientenkonto und eine fremde Praxis ab', async () => {
      const datei = await abgelegterScan(users.therapist);
      for (const konto of [users.trainer, users.patientMax]) {
        const fehler = await abgefangen(asUser(konto, ZUORDNEN, [datei.file_id, VERORDNUNG_MAX]));
        expect(fehler?.message, konto).toMatch(/not allowed to write treatment_bases/);
      }
      const fremd = await fremdeOrganisation();
      const fremdFehler = await abgefangen(
        asUser(fremd.owner, ZUORDNEN, [datei.file_id, VERORDNUNG_MAX]),
      );
      expect(fremdFehler?.message).toMatch(/file not accessible/);

      const { rows } = await asPostgres<{ treatment_basis_id: string | null }>(
        'select treatment_basis_id from public.patient_files where id = $1',
        [datei.file_id],
      );
      expect(rows[0]!.treatment_basis_id).toBeNull();
    });
  });

  describe('Objektschluessel', () => {
    it('laesst sich weder beim Anlegen vorgeben noch spaeter aendern', async () => {
      const datei = await abgelegterScan(users.therapist);
      const fehler = await abgefangen(
        asPostgres(`update public.patient_files set object_key = 'anders' where id = $1`, [
          datei.file_id,
        ]),
      );
      expect(fehler?.message).toMatch(/cannot be changed/);
    });

    it('faellt mit der Akte: eine geloeschte Patientin nimmt ihren offenen Scan mit (Loeschtest)', async () => {
      // Eine eigene, frische Akte ohne weitere Bezuege - die Seed-Akten tragen
      // Termine und Rechnungen, die das Loeschen zu Recht aufhalten.
      await asPostgres(`
        insert into public.persons (id, organization_id, given_name, family_name)
          values ('44444444-4444-4444-8444-0000000000f1', '${organizationId}', 'Lena', 'Loeschprobe');
        insert into public.patients (id, organization_id, person_id)
          values ('66666666-6666-4666-8666-0000000000f1', '${organizationId}', '44444444-4444-4444-8444-0000000000f1');
      `);
      const datei = await abgelegterScan(users.therapist, {
        patientId: '66666666-6666-4666-8666-0000000000f1',
      });

      await asPostgres('delete from public.patients where id = $1', [
        '66666666-6666-4666-8666-0000000000f1',
      ]);

      const { rows } = await asPostgres('select 1 from public.patient_files where id = $1', [
        datei.file_id,
      ]);
      expect(rows).toEqual([]);
      const auftrag = await asPostgres<{ object_key: string }>(
        'select object_key from public.storage_deletion_orders where object_key = $1',
        [datei.object_key],
      );
      expect(auftrag.rows).toHaveLength(1);
      await asPostgres('delete from public.persons where id = $1', [
        '44444444-4444-4444-8444-0000000000f1',
      ]);
    });
  });
});

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';
import {
  DOKUMENTARTEN,
  KLINISCHE_DOKUMENTARTEN,
  dokumentartLabels,
} from '@/features/files/dokumentarten';

/**
 * Dateiablage der Patientenakte (DAT-001, ADR-017).
 *
 * PROJECT_PRINCIPLES.md §12 fuehrt "Dateizugriffe" ausdruecklich in der Liste
 * der testpflichtigen Funktionen. Weil `pnpm test:db` gegen reines PostgreSQL
 * laeuft, bildet der Shim `storage.buckets` und `storage.objects` nach - erst
 * dadurch sind die Policies aus ADR-017 Punkt 11 hier ueberhaupt pruefbar.
 *
 * Was die Nachbildung NICHT kann und was diese Datei deshalb nicht behauptet:
 * signierte Verweise, ihre Gueltigkeit von 60 Sekunden, `cacheControl` und die
 * Frage, ob Bytes tatsaechlich geflossen sind. Das sind Zusagen der
 * Storage-API, keine der Datenbank.
 */

const { users, patients, organizationId } = SEED;

/** Verordnung von Max Mustermann aus supabase/seed.sql. */
const VERORDNUNG_MAX = '88888888-8888-4888-8888-000000000001';
/** Verordnung von Erika Beispiel - fuer die Gegenprobe "fremder Auftrag". */
const VERORDNUNG_ERIKA = '88888888-8888-4888-8888-000000000003';

const PRUEFSUMME = 'a'.repeat(64);

const VORBEREITEN = `
  select file_id, bucket_id, object_key
  from public.prepare_patient_file_upload(
    $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::bigint, $7::text
  )
`;

interface Vorbereitet {
  file_id: string;
  bucket_id: string;
  object_key: string;
}

async function vorbereiten(
  userId: string,
  optionen: {
    patientId?: string;
    verordnungId?: string | null;
    art?: string;
    name?: string;
    mime?: string;
    groesse?: number;
  } = {},
): Promise<Vorbereitet> {
  const { rows } = await asUserCommitted<Vorbereitet>(userId, VORBEREITEN, [
    optionen.patientId ?? patients.max,
    optionen.verordnungId === undefined ? VERORDNUNG_MAX : optionen.verordnungId,
    optionen.art ?? 'verordnungsscan',
    optionen.name ?? 'Rezept.pdf',
    optionen.mime ?? 'application/pdf',
    optionen.groesse ?? 12_345,
    PRUEFSUMME,
  ]);
  return rows[0]!;
}

/**
 * Spielt nach, was die Storage-API beim Upload tut: sie legt die Objektzeile
 * an und schreibt Groesse und MIME-Typ selbst nach `metadata`. Genau gegen
 * diese beiden Werte prueft die Bestaetigung aus ADR-017 Punkt 7c - deshalb
 * setzt der Test sie hier und nicht die Anwendung.
 */
async function objektAblegen(
  objectKey: string,
  optionen: { groesse?: number; mime?: string } = {},
): Promise<void> {
  await asPostgres(
    `insert into storage.objects (bucket_id, name, metadata)
     values ('patientenakte', $1, jsonb_build_object('size', $2::bigint, 'mimetype', $3::text))`,
    [objectKey, optionen.groesse ?? 12_345, optionen.mime ?? 'application/pdf'],
  );
}

/** Vorbereiten, hochladen, bestaetigen - der vollstaendige Weg aus Punkt 7. */
async function abgelegteDatei(
  userId: string,
  optionen: Parameters<typeof vorbereiten>[1] = {},
): Promise<Vorbereitet> {
  const datei = await vorbereiten(userId, optionen);
  await objektAblegen(datei.object_key, {
    groesse: optionen.groesse ?? 12_345,
    mime: optionen.mime ?? 'application/pdf',
  });
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

describe('Dateiablage der Patientenakte (DAT-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await aufraeumen();
  });

  describe('Bucket und Katalog', () => {
    it('legt je Datenklasse einen privaten Bucket mit Allowlist und Groessenlimit an', async () => {
      const { rows } = await asPostgres<{
        id: string;
        public: boolean;
        file_size_limit: string;
        allowed_mime_types: string[];
      }>('select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id');

      // Punkt 3: ein Bucket je Datenklasse. Seit DOK-006 zwei - die Akte und
      // die Patientenfotos mit eigener Frist (Punkt 32).
      expect(rows.map((r) => r.id)).toEqual(['patientenakte', 'patientenfotos']);
      for (const bucket of rows) {
        expect(bucket.public).toBe(false);
        expect(Number(bucket.file_size_limit)).toBe(10 * 1024 * 1024);
      }
      expect(rows[0]!.allowed_mime_types.sort()).toEqual([
        'application/pdf',
        'image/jpeg',
        'image/png',
      ]);
      // Enger als Punkt 18: nur JPEG, das der Kameradialog erzeugt.
      expect(rows[1]!.allowed_mime_types).toEqual(['image/jpeg']);
    });

    it('fuehrt den Verordnungsscan als klinisch (ANN-011, ADR-017 Punkt 12)', async () => {
      const { rows } = await asPostgres<{ key: string; is_clinical: boolean }>(
        'select key, is_clinical from public.patient_file_document_types order by sort_order',
      );
      const klinisch = rows.filter((r) => r.is_clinical).map((r) => r.key);
      const organisatorisch = rows.filter((r) => !r.is_clinical).map((r) => r.key);

      expect(klinisch).toContain('verordnungsscan');
      expect(klinisch).toEqual([
        'verordnungsscan',
        'befund',
        'arztbrief',
        'klinisches_bild',
        'patientenfoto',
      ]);
      expect(organisatorisch).toEqual(['einwilligung', 'vertrag']);
    });

    it('haelt Katalog und Beschriftungen deckungsgleich', async () => {
      // Der Rollenschnitt steht in der Datenbank, die deutschen Woerter in
      // src/features/files/dokumentarten.ts. Laufen beide auseinander, zeigt
      // die Oberflaeche entweder einen Schluessel oder eine Art, die es nicht
      // gibt - und im schlimmeren Fall eine falsche Sichtbarkeitszusage.
      const { rows } = await asPostgres<{ key: string; is_clinical: boolean }>(
        'select key, is_clinical from public.patient_file_document_types',
      );

      const inDatenbank = rows.map((r) => r.key).sort();
      expect(inDatenbank).toEqual([...DOKUMENTARTEN].sort());
      expect(rows.filter((r) => !dokumentartLabels[r.key as never]).map((r) => r.key)).toEqual([]);

      const klinischLautDatenbank = rows
        .filter((r) => r.is_clinical)
        .map((r) => r.key)
        .sort();
      expect(klinischLautDatenbank).toEqual([...KLINISCHE_DOKUMENTARTEN].sort());
    });

    it('haelt patient_files fuer den Anwendungspfad verschlossen (deny-by-default)', async () => {
      const fehler = await abgefangen(
        asUser(users.ownerTherapist, 'select * from public.patient_files'),
      );
      expect(fehler?.message).toMatch(/permission denied/i);
    });
  });

  describe('Phase (a): vorbereiten', () => {
    it('leitet den Objektschluessel aus Kennungen ab - ohne Namen und ohne Endung', async () => {
      const datei = await vorbereiten(users.therapist);

      expect(datei.bucket_id).toBe('patientenakte');
      expect(datei.object_key).toBe(`${organizationId}/${VERORDNUNG_MAX}/${datei.file_id}`);
      expect(datei.object_key).not.toMatch(/Rezept|\.pdf/);
    });

    it('haengt eine Datei ohne Verordnung an die Patientin', async () => {
      const datei = await vorbereiten(users.therapist, {
        verordnungId: null,
        art: 'befund',
        name: 'Befund.pdf',
      });
      expect(datei.object_key).toBe(`${organizationId}/${patients.max}/${datei.file_id}`);
    });

    it('legt die Zeile als pending an - unsichtbar und ohne Verweis', async () => {
      const datei = await vorbereiten(users.therapist);
      const { rows } = await asPostgres<{ status: string; confirmed_at: string | null }>(
        'select status, confirmed_at from public.patient_files where id = $1',
        [datei.file_id],
      );
      expect(rows[0]!).toEqual({ status: 'pending', confirmed_at: null });

      const sichtbar = await asUser(
        users.therapist,
        'select id from public.list_patient_files($1::uuid)',
        [patients.max],
      );
      expect(sichtbar.rows).toEqual([]);
    });

    it('weist einen Verordnungsscan ohne Verordnung ab (ADR-017 Punkt 10)', async () => {
      const fehler = await abgefangen(
        vorbereiten(users.therapist, { verordnungId: null, art: 'verordnungsscan' }),
      );
      expect(fehler?.message).toMatch(/patient_files_scan_belongs_to_treatment_basis/);
    });

    it('weist eine Verordnung ab, die einer anderen Patientin gehoert', async () => {
      const fehler = await abgefangen(
        vorbereiten(users.therapist, { verordnungId: VERORDNUNG_ERIKA }),
      );
      expect(fehler?.message).toMatch(/treatment basis not accessible/);
    });

    it('weist unbekannte Dokumentarten, fremde Formate und zu grosse Dateien ab', async () => {
      const unbekannt = await abgefangen(vorbereiten(users.therapist, { art: 'roentgenbild' }));
      expect(unbekannt?.message).toMatch(/unknown document type/);

      const format = await abgefangen(
        vorbereiten(users.therapist, { mime: 'image/svg+xml', name: 'Skript.svg' }),
      );
      expect(format?.message).toMatch(/unsupported media type/);

      const gross = await abgefangen(
        vorbereiten(users.therapist, { groesse: 10 * 1024 * 1024 + 1 }),
      );
      expect(gross?.message).toMatch(/file too large or empty/);
    });

    it('weist eine fremde Patientin und eine nicht angemeldete Anfrage ab', async () => {
      const fremd = await abgefangen(
        vorbereiten(users.therapist, {
          patientId: '66666666-6666-4666-8666-0000000000ff',
          verordnungId: null,
          art: 'befund',
        }),
      );
      expect(fremd?.message).toMatch(/patient not accessible/);

      const anonym = await abgefangen(
        asAnon(
          'select * from public.prepare_patient_file_upload($1::uuid, null, $2, $3, $4, $5, $6)',
          [patients.max, 'befund', 'Befund.pdf', 'application/pdf', 1000, PRUEFSUMME],
        ),
      );
      expect(anonym?.message).toMatch(/permission denied/i);
    });
  });

  describe('Rollenschnitt an der Dokumentart (ADR-017 Punkt 12 und 13)', () => {
    it('laesst office keine klinische Datei anlegen - auch nicht den Verordnungsscan', async () => {
      const scan = await abgefangen(vorbereiten(users.office));
      expect(scan?.message).toMatch(/not allowed to upload this document type/);

      const befund = await abgefangen(
        vorbereiten(users.office, { verordnungId: null, art: 'befund' }),
      );
      expect(befund?.message).toMatch(/not allowed to upload this document type/);
    });

    it('laesst office eine organisatorische Datei an der Patientin anlegen', async () => {
      const datei = await vorbereiten(users.office, {
        verordnungId: null,
        art: 'einwilligung',
        name: 'Einwilligung.pdf',
      });
      expect(datei.file_id).toBeTruthy();
    });

    it('zeigt office seit E15 auch die klinische Datei - wie der Therapeutin', async () => {
      await abgelegteDatei(users.therapist);
      await abgelegteDatei(users.office, {
        verordnungId: null,
        art: 'einwilligung',
        name: 'Einwilligung.pdf',
      });

      const therapeutin = await asUser<{ document_type: string }>(
        users.therapist,
        'select document_type from public.list_patient_files($1::uuid)',
        [patients.max],
      );
      const buero = await asUser<{ document_type: string }>(
        users.office,
        'select document_type from public.list_patient_files($1::uuid)',
        [patients.max],
      );

      expect(therapeutin.rows.map((r) => r.document_type).sort()).toEqual([
        'einwilligung',
        'verordnungsscan',
      ]);
      // ADR-004 Fassung 2 Punkt 3: Verordnung einschliesslich Scan.
      expect(buero.rows.map((r) => r.document_type).sort()).toEqual([
        'einwilligung',
        'verordnungsscan',
      ]);
    });

    it('sieht team_lead klinische Dateien, ein Patientenkonto keine', async () => {
      await abgelegteDatei(users.therapist);

      const teamLead = await asUser(
        users.teamLead,
        'select id from public.list_patient_files($1::uuid)',
        [patients.max],
      );
      expect(teamLead.rows).toHaveLength(1);

      // G6b: null Zeilen, der Versuch steht im Auditlog.
      await erwarteAbgewiesenenLeseversuch(
        users.patientMax,
        'select id from public.list_patient_files($1::uuid)',
        [patients.max],
        'patient_files.read',
      );
    });
  });

  describe('Phase (c): bestaetigen', () => {
    it('macht die Datei erst nach der Bestaetigung sichtbar und protokolliert sie', async () => {
      const datei = await vorbereiten(users.therapist);
      await objektAblegen(datei.object_key);

      await asUserCommitted(
        users.therapist,
        'select public.confirm_patient_file_upload($1::uuid)',
        [datei.file_id],
      );

      const { rows } = await asUser<{ id: string; display_name: string; object_missing: boolean }>(
        users.therapist,
        'select id, display_name, object_missing from public.list_patient_files($1::uuid)',
        [patients.max],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.display_name).toBe('Rezept.pdf');
      expect(rows[0]!.object_missing).toBe(false);

      const audit = await asPostgres<{
        action: string;
        subject_id: string;
        context: Record<string, unknown>;
      }>(
        "select action, subject_id, context from public.audit_log where action = 'patient_file.uploaded'",
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]!.subject_id).toBe(datei.file_id);
      expect(audit.rows[0]!.context).toMatchObject({
        patient_id: patients.max,
        document_type: 'verordnungsscan',
      });
    });

    it('traegt weder Anzeigenamen noch Objektschluessel in das Auditlog (ADR-017 Punkt 20)', async () => {
      const datei = await abgelegteDatei(users.therapist);
      const { rows } = await asPostgres<{ eintrag: string }>(
        "select row_to_json(a)::text as eintrag from public.audit_log a where a.action like 'patient_file.%'",
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const zeile of rows) {
        expect(zeile.eintrag).not.toContain('Rezept.pdf');
        expect(zeile.eintrag).not.toContain(datei.object_key);
      }
    });

    it('verweigert die Bestaetigung, solange kein Objekt liegt', async () => {
      const datei = await vorbereiten(users.therapist);
      const fehler = await abgefangen(
        asUserCommitted(users.therapist, 'select public.confirm_patient_file_upload($1::uuid)', [
          datei.file_id,
        ]),
      );
      expect(fehler?.message).toMatch(/object was not uploaded/);
    });

    it('prueft Groesse und MIME-Typ gegen das, was tatsaechlich abgelegt wurde', async () => {
      const zuGross = await vorbereiten(users.therapist);
      await objektAblegen(zuGross.object_key, { groesse: 999_999 });
      const groesse = await abgefangen(
        asUserCommitted(users.therapist, 'select public.confirm_patient_file_upload($1::uuid)', [
          zuGross.file_id,
        ]),
      );
      expect(groesse?.message).toMatch(/size does not match/);

      const falschesFormat = await vorbereiten(users.therapist);
      await objektAblegen(falschesFormat.object_key, { mime: 'text/html' });
      const format = await abgefangen(
        asUserCommitted(users.therapist, 'select public.confirm_patient_file_upload($1::uuid)', [
          falschesFormat.file_id,
        ]),
      );
      expect(format?.message).toMatch(/media type does not match/);
    });

    it('bestaetigt keine Datei zweimal', async () => {
      const datei = await abgelegteDatei(users.therapist);
      const fehler = await abgefangen(
        asUserCommitted(users.therapist, 'select public.confirm_patient_file_upload($1::uuid)', [
          datei.file_id,
        ]),
      );
      expect(fehler?.message).toMatch(/file is not pending/);
    });
  });

  describe('Auslieferung (ADR-017 Punkt 15, 20, 21; ANN-052)', () => {
    it('gibt den Objektschluessel nicht ueber den Lesepfad heraus', async () => {
      await abgelegteDatei(users.therapist);
      const { rows } = await asUser<Record<string, unknown>>(
        users.therapist,
        'select * from public.list_patient_files($1::uuid)',
        [patients.max],
      );
      expect(Object.keys(rows[0]!)).not.toContain('object_key');
    });

    it('liefert den Schluessel nur ueber den auditierten Vorgang', async () => {
      const datei = await abgelegteDatei(users.therapist);

      const { rows } = await asUserCommitted<{ object_key: string; display_name: string }>(
        users.therapist,
        'select object_key, display_name from public.issue_patient_file_link($1::uuid)',
        [datei.file_id],
      );
      expect(rows[0]!.object_key).toBe(datei.object_key);
      expect(rows[0]!.display_name).toBe('Rezept.pdf');

      const audit = await asPostgres<{ subject_id: string }>(
        "select subject_id from public.audit_log where action = 'patient_file.link_issued'",
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]!.subject_id).toBe(datei.file_id);
    });

    it('protokolliert jeden einzelnen Zugriff, nicht nur den ersten', async () => {
      const datei = await abgelegteDatei(users.therapist);
      for (let i = 0; i < 3; i += 1) {
        await asUserCommitted(
          users.therapist,
          'select object_key from public.issue_patient_file_link($1::uuid)',
          [datei.file_id],
        );
      }
      const { rows } = await asPostgres<{ anzahl: string }>(
        "select count(*) as anzahl from public.audit_log where action = 'patient_file.link_issued'",
      );
      expect(Number(rows[0]!.anzahl)).toBe(3);
    });

    it('gibt office den Verweis auf eine klinische Datei und protokolliert ihn (E15)', async () => {
      const datei = await abgelegteDatei(users.therapist);
      const { rows } = await asUserCommitted<{ object_key: string }>(
        users.office,
        'select object_key from public.issue_patient_file_link($1::uuid)',
        [datei.file_id],
      );
      expect(rows[0]!.object_key).toBe(datei.object_key);

      // ADR-010 Punkt 14: die Ausstellung des Verweises ist das Download-Ereignis.
      const audit = await asPostgres<{ subject_id: string; actor_user_id: string }>(
        "select subject_id, actor_user_id from public.audit_log where action = 'patient_file.link_issued'",
      );
      expect(audit.rows).toEqual([{ subject_id: datei.file_id, actor_user_id: users.office }]);
    });

    it('verweigert einem Patientenkonto den Verweis auf eine klinische Datei', async () => {
      const datei = await abgelegteDatei(users.therapist);
      const fehler = await abgefangen(
        asUserCommitted(
          users.patientMax,
          'select object_key from public.issue_patient_file_link($1::uuid)',
          [datei.file_id],
        ),
      );
      expect(fehler?.message).toMatch(/file not accessible/);
    });

    it('protokolliert das Auflisten bewusst nicht (ADR-017 Punkt 22)', async () => {
      await abgelegteDatei(users.therapist);
      await asUserCommitted(users.therapist, 'select id from public.list_patient_files($1::uuid)', [
        patients.max,
      ]);
      const { rows } = await asPostgres<{ anzahl: string }>(
        "select count(*) as anzahl from public.audit_log where action = 'patient_file.link_issued'",
      );
      expect(Number(rows[0]!.anzahl)).toBe(0);
    });
  });

  describe('RLS auf storage.objects (ADR-017 Punkt 11)', () => {
    const HOCHLADEN = `
      insert into storage.objects (bucket_id, name, metadata)
      values ('patientenakte', $1, jsonb_build_object('size', 12345, 'mimetype', 'application/pdf'))
    `;

    it('laesst nur den Schluessel zu, zu dem eine pending-Zeile mit Schreibrecht gehoert', async () => {
      const datei = await vorbereiten(users.therapist);

      const erfunden = await abgefangen(
        asUser(users.therapist, HOCHLADEN, [`${organizationId}/${patients.max}/beliebig`]),
      );
      expect(erfunden?.message).toMatch(/row-level security/i);

      const echt = await abgefangen(asUser(users.therapist, HOCHLADEN, [datei.object_key]));
      expect(echt).toBeNull();
    });

    it('laesst office nicht zu einem klinischen Schluessel hochladen', async () => {
      const datei = await vorbereiten(users.therapist);
      const fehler = await abgefangen(asUser(users.office, HOCHLADEN, [datei.object_key]));
      expect(fehler?.message).toMatch(/row-level security/i);
    });

    it('laesst nach der Bestaetigung nicht mehr hochladen (kein Ueberschreiben)', async () => {
      const datei = await abgelegteDatei(users.therapist);
      await asPostgres("delete from storage.objects where bucket_id = 'patientenakte'");

      const fehler = await abgefangen(asUser(users.therapist, HOCHLADEN, [datei.object_key]));
      expect(fehler?.message).toMatch(/row-level security/i);
    });

    it('gibt Dateien unveraenderlich weiter: kein UPDATE auf storage.objects (Punkt 8)', async () => {
      const datei = await abgelegteDatei(users.therapist);
      const { rows } = await asUser<{ id: string }>(
        users.therapist,
        `update storage.objects set metadata = jsonb_build_object('size', 1)
          where bucket_id = 'patientenakte' and name = $1 returning id`,
        [datei.object_key],
      ).catch(() => ({ rows: [] as { id: string }[] }));
      expect(rows).toEqual([]);
    });

    it('liest das Objekt nur, wer die Dokumentart sehen darf - und nur gegen eine Ausstellung', async () => {
      const datei = await abgelegteDatei(users.therapist);
      const LESEN =
        "select name from storage.objects where bucket_id = 'patientenakte' and name = $1";
      const VERWEIS = 'select object_key from public.issue_patient_file_link($1::uuid)';

      // FIX-015 (BEF-004): ohne Ausstellung liest auch die Therapeutin nichts.
      const ohne = await asUserCommitted(users.therapist, LESEN, [datei.object_key]);
      expect(ohne.rows).toEqual([]);

      await asUserCommitted(users.therapist, VERWEIS, [datei.file_id]);
      const therapeutin = await asUserCommitted(users.therapist, LESEN, [datei.object_key]);
      expect(therapeutin.rows).toHaveLength(1);

      // Seit E15 dieselbe Leseregel fuer office (ADR-004 Fassung 2 Punkt 3).
      await asUserCommitted(users.office, VERWEIS, [datei.file_id]);
      const buero = await asUserCommitted(users.office, LESEN, [datei.object_key]);
      expect(buero.rows).toHaveLength(1);

      const patient = await asUser(users.patientMax, LESEN, [datei.object_key]);
      expect(patient.rows).toEqual([]);

      const anonym = await asAnon(LESEN, [datei.object_key]);
      expect(anonym.rows).toEqual([]);
    });

    it('haelt die Objektzeile verschlossen, solange die Datei pending ist', async () => {
      const datei = await vorbereiten(users.therapist);
      await objektAblegen(datei.object_key);

      const { rows } = await asUser(
        users.therapist,
        "select name from storage.objects where bucket_id = 'patientenakte' and name = $1",
        [datei.object_key],
      );
      expect(rows).toEqual([]);
    });
  });

  describe('Loeschauftrag fuer das Objekt (ADR-017 Punkt 25)', () => {
    it('schreibt beim Loeschen der Zeile einen Auftrag - auf jedem Weg', async () => {
      const datei = await abgelegteDatei(users.therapist);
      await asPostgres('delete from public.patient_files where id = $1', [datei.file_id]);

      const { rows } = await asPostgres<{ object_key: string; receipted_at: string | null }>(
        'select object_key, receipted_at from public.storage_deletion_orders',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.object_key).toBe(datei.object_key);
      expect(rows[0]!.receipted_at).toBeNull();
    });

    it('nimmt die Datei mit, wenn ihre Verordnung faellt', async () => {
      const datei = await abgelegteDatei(users.therapist);
      await asUserCommitted(users.therapist, 'select public.delete_treatment_basis($1::uuid)', [
        VERORDNUNG_MAX,
      ]);

      const zeilen = await asPostgres('select id from public.patient_files');
      expect(zeilen.rows).toEqual([]);

      const auftraege = await asPostgres<{ object_key: string }>(
        'select object_key from public.storage_deletion_orders',
      );
      expect(auftraege.rows.map((r) => r.object_key)).toEqual([datei.object_key]);

      // Der Vorgang ist bestaetigt und nicht zurueckgerollt: die Verordnung des
      // Seeds ist danach weg. Der Neuaufbau haelt die folgenden Tests sauber.
      await resetDatabase();
    }, 120_000);

    it('nimmt die Datei mit, wenn der Loeschlauf die Akte loescht', async () => {
      const datei = await abgelegteDatei(users.therapist);

      // Derselbe Weg, den apply_retention geht (LOE-002a). Die Dateizeile
      // faellt per Kaskade mit der Akte; das Objekt bekommt seinen Auftrag.
      await asPostgres(
        'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
        [patients.max],
      );

      const zeilen = await asPostgres('select id from public.patient_files');
      expect(zeilen.rows).toEqual([]);

      const auftraege = await asPostgres<{ object_key: string }>(
        'select object_key from public.storage_deletion_orders',
      );
      expect(auftraege.rows.map((r) => r.object_key)).toEqual([datei.object_key]);

      await resetDatabase();
    }, 120_000);

    it('schreibt keinen Auftrag fuer eine Zeile ohne Objekt', async () => {
      const datei = await vorbereiten(users.therapist);
      await asPostgres('delete from public.patient_files where id = $1', [datei.file_id]);

      const { rows } = await asPostgres('select id from public.storage_deletion_orders');
      expect(rows).toEqual([]);
    });

    it('haelt die Auftragsliste fuer den Anwendungspfad verschlossen', async () => {
      const fehler = await abgefangen(
        asUser(users.ownerTherapist, 'select * from public.storage_deletion_orders'),
      );
      expect(fehler?.message).toMatch(/permission denied/i);
    });
  });

  describe('Unbestaetigte Uploads (ADR-017 Punkt 7)', () => {
    it('verwirft eine pending-Zeile auf Wunsch samt Objekt', async () => {
      const datei = await vorbereiten(users.therapist);
      await objektAblegen(datei.object_key);

      await asUserCommitted(
        users.therapist,
        'select public.discard_patient_file_upload($1::uuid)',
        [datei.file_id],
      );

      const zeilen = await asPostgres('select id from public.patient_files');
      expect(zeilen.rows).toEqual([]);
      const auftraege = await asPostgres('select id from public.storage_deletion_orders');
      expect(auftraege.rows).toHaveLength(1);
    });

    it('verwirft keine bestaetigte Datei ueber diesen Weg', async () => {
      const datei = await abgelegteDatei(users.therapist);
      const fehler = await abgefangen(
        asUserCommitted(users.therapist, 'select public.discard_patient_file_upload($1::uuid)', [
          datei.file_id,
        ]),
      );
      expect(fehler?.message).toMatch(/pending upload not accessible/);
    });

    it('verwirft zeitgesteuert, was nach 24 Stunden nicht bestaetigt ist', async () => {
      const alt = await vorbereiten(users.therapist);
      const frisch = await vorbereiten(users.therapist, { verordnungId: null, art: 'befund' });
      await asPostgres(
        "update public.patient_files set created_at = now() - interval '25 hours' where id = $1",
        [alt.file_id],
      );

      const { rows } = await asPostgres<{ anzahl: number }>(
        'select public.discard_stale_patient_file_uploads() as anzahl',
      );
      expect(rows[0]!.anzahl).toBe(1);

      const uebrig = await asPostgres<{ id: string }>('select id from public.patient_files');
      expect(uebrig.rows.map((r) => r.id)).toEqual([frisch.file_id]);
    });

    it('gibt den zeitgesteuerten Lauf nicht fuer angemeldete Konten frei', async () => {
      const fehler = await abgefangen(
        asUser(users.ownerTherapist, 'select public.discard_stale_patient_file_uploads()'),
      );
      expect(fehler?.message).toMatch(/permission denied/i);
    });
  });

  describe('Fehlendes Objekt (ADR-017 Punkt 27)', () => {
    it('meldet eine Datei ohne Objekt als Fehler statt als leere Flaeche', async () => {
      const datei = await abgelegteDatei(users.therapist);
      await asPostgres(
        "delete from storage.objects where bucket_id = 'patientenakte' and name = $1",
        [datei.object_key],
      );

      const { rows } = await asUser<{ object_missing: boolean }>(
        users.therapist,
        'select object_missing from public.list_patient_files($1::uuid)',
        [patients.max],
      );
      expect(rows[0]!.object_missing).toBe(true);
    });
  });

  describe('Filter auf eine Verordnung', () => {
    it('zeigt an der Verordnung nur ihre eigenen Dateien', async () => {
      await abgelegteDatei(users.therapist);
      await abgelegteDatei(users.therapist, {
        verordnungId: null,
        art: 'befund',
        name: 'Befund.pdf',
      });

      const { rows } = await asUser<{ display_name: string }>(
        users.therapist,
        'select display_name from public.list_patient_files($1::uuid, $2::uuid)',
        [patients.max, VERORDNUNG_MAX],
      );
      expect(rows.map((r) => r.display_name)).toEqual(['Rezept.pdf']);
    });
  });

  describe('Mandantentrennung fuer office (ROL-002, E15)', () => {
    const FREMDE_ORG = '22222222-2222-4222-8222-0000000000f1';
    const FREMDE_PERSON = '44444444-4444-4444-8444-0000000000f1';
    const FREMDE_PATIENTIN = '66666666-6666-4666-8666-0000000000f1';
    const FREMDE_DATEI = '99999999-9999-4999-8999-0000000000f1';

    it('liefert office weder Liste, Verweis noch Objekt einer fremden Praxis', async () => {
      // Testvorbereitung als postgres: eine bestaetigte klinische Datei einer
      // anderen Organisation, ohne den Weg ueber deren Konten.
      await asPostgres(`
        insert into public.organizations (id, name, time_zone)
          values ('${FREMDE_ORG}', 'Test Praxis Andernorts', 'Europe/Berlin')
          on conflict do nothing;
        insert into public.persons (id, organization_id, given_name, family_name)
          values ('${FREMDE_PERSON}', '${FREMDE_ORG}', 'Fritz', 'Fremdpatient')
          on conflict do nothing;
        insert into public.patients (id, organization_id, person_id, status)
          values ('${FREMDE_PATIENTIN}', '${FREMDE_ORG}', '${FREMDE_PERSON}', 'active')
          on conflict do nothing;
        insert into public.patient_files (id, organization_id, patient_id, document_type,
            display_name, mime_type, byte_size, checksum_sha256, status, confirmed_at)
          values ('${FREMDE_DATEI}', '${FREMDE_ORG}', '${FREMDE_PATIENTIN}', 'befund',
            'Fremder Befund.pdf', 'application/pdf', 12345, '${PRUEFSUMME}', 'ready', now());
      `);
      const { rows } = await asPostgres<{ object_key: string }>(
        'select object_key from public.patient_files where id = $1',
        [FREMDE_DATEI],
      );
      const schluessel = rows[0]!.object_key;
      await objektAblegen(schluessel);

      const liste = await abgefangen(
        asUser(users.office, 'select id from public.list_patient_files($1::uuid)', [
          FREMDE_PATIENTIN,
        ]),
      );
      expect(liste?.message).toMatch(/patient not accessible/);

      const verweis = await abgefangen(
        asUserCommitted(
          users.office,
          'select object_key from public.issue_patient_file_link($1::uuid)',
          [FREMDE_DATEI],
        ),
      );
      expect(verweis?.message).toMatch(/file not accessible/);

      const objekt = await asUser(
        users.office,
        "select name from storage.objects where bucket_id = 'patientenakte' and name = $1",
        [schluessel],
      );
      expect(objekt.rows).toEqual([]);

      const audit = await asPostgres(
        "select id from public.audit_log where action = 'patient_file.link_issued'",
      );
      expect(audit.rows).toEqual([]);
    });
  });
});

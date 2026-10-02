import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asServiceRole,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Pruefung am Server (ABN-024, BEF-105; ADR-017 Fassung 3, Punkte 49 bis 52).
 *
 * Die Edge Function selbst laeuft hier nicht (keine Edge Runtime); belegt
 * wird, was die Datenbank davon fuehrt: das Kennzeichen „nicht serverseitig
 * geprueft", das Ergebnis, der Schalter, das Verwerfen nach Befund mit
 * Loeschauftrag und Auditeintrag - und dass nur der Dienst das Ergebnis
 * schreibt.
 */

const { users, patients } = SEED;
const PRUEFSUMME = 'd'.repeat(64);

interface Vorbereitet {
  file_id: string;
  bucket_id: string;
  object_key: string;
}

async function hochladen(mime = 'application/pdf'): Promise<Vorbereitet> {
  const { rows } = await asUserCommitted<Vorbereitet>(
    users.therapist,
    `select file_id, bucket_id, object_key from public.prepare_patient_file_upload(
       $1::uuid, null, 'befund', 'Befund vom 02.10.2026', $2, 4321, $3)`,
    [patients.max, mime, PRUEFSUMME],
  );
  const datei = rows[0]!;
  await asPostgres(
    `insert into storage.objects (bucket_id, name, metadata)
     values ($1, $2, jsonb_build_object('size', 4321, 'mimetype', $3::text))`,
    [datei.bucket_id, datei.object_key, mime],
  );
  await asUserCommitted(users.therapist, 'select public.confirm_patient_file_upload($1::uuid)', [
    datei.file_id,
  ]);
  return datei;
}

async function ergebnis(
  fileId: string,
  typ: boolean,
  summe: boolean,
  metadaten: boolean | null,
): Promise<string> {
  const { rows } = await asServiceRole<{ r: string }>(
    'select public.record_patient_file_verification($1::uuid, $2, $3, $4) as r',
    [fileId, typ, summe, metadaten],
  );
  return rows[0]!.r;
}

async function zeile(fileId: string) {
  const { rows } = await asPostgres<{
    status: string;
    verified_at: string | null;
    content_type_verified: boolean | null;
    checksum_verified: boolean | null;
    metadata_verified: boolean | null;
  }>(
    `select status, verified_at, content_type_verified, checksum_verified, metadata_verified
       from public.patient_files where id = $1`,
    [fileId],
  );
  return rows[0];
}

async function schalter(an: boolean): Promise<void> {
  await asPostgres(
    `create or replace function app.patient_file_verification_required()
       returns boolean language sql immutable set search_path = '' as $$ select ${an} $$`,
  );
}

describe('Pruefung am Server (ABN-024)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.patient_file_access_grants');
    await asPostgres('delete from public.patient_files');
    await asPostgres('delete from public.storage_deletion_orders');
    await asPostgres("delete from storage.objects where bucket_id = 'patientenakte'");
    await asPostgres("delete from public.audit_log where action like 'patient_file%'");
  });

  afterEach(async () => {
    await schalter(false);
  });

  it('steht bis OPS-001 aus: die Datei wird ready und ist nicht serverseitig geprueft', async () => {
    const { rows } = await asPostgres<{ an: boolean }>(
      'select app.patient_file_verification_required() as an',
    );
    expect(rows[0]?.an).toBe(false);

    const datei = await hochladen();
    expect(await zeile(datei.file_id)).toMatchObject({ status: 'ready', verified_at: null });

    const { rows: liste } = await asUser<{ id: string; verified_at: string | null }>(
      users.therapist,
      'select id, verified_at from public.list_patient_files($1::uuid)',
      [patients.max],
    );
    expect(liste).toEqual([{ id: datei.file_id, verified_at: null }]);
  });

  it('traegt ein bestandenes Ergebnis ein; ein zweiter Lauf aendert nichts', async () => {
    const datei = await hochladen();
    expect(await ergebnis(datei.file_id, true, true, null)).toBe('passed');
    const nachher = await zeile(datei.file_id);
    expect(nachher).toMatchObject({
      status: 'ready',
      content_type_verified: true,
      checksum_verified: true,
      metadata_verified: null,
    });
    expect(nachher?.verified_at).not.toBeNull();

    expect(await ergebnis(datei.file_id, false, true, null)).toBe('already_verified');
    expect((await zeile(datei.file_id))?.status).toBe('ready');
  });

  it('verlangt bei Bildern ein Metadatenergebnis und bei PDF keines', async () => {
    const pdf = await hochladen();
    const pdfFehler = await abgefangen(ergebnis(pdf.file_id, true, true, true));
    expect(pdfFehler?.message).toMatch(/metadata result/);

    const bild = await hochladen('image/png');
    const bildFehler = await abgefangen(ergebnis(bild.file_id, true, true, null));
    expect(bildFehler?.message).toMatch(/metadata result/);
    expect(await ergebnis(bild.file_id, true, true, true)).toBe('passed');
  });

  for (const [fall, typ, summe, metadaten] of [
    ['Typ an der Signatur', false, true, true],
    ['Pruefsumme', true, false, true],
    ['Restmetadaten', true, true, false],
  ] as const) {
    it(`verwirft nach Befund (${fall}): Zeile weg, Loeschauftrag, Auditeintrag (Punkt 52)`, async () => {
      const datei = await hochladen('image/jpeg');
      expect(await ergebnis(datei.file_id, typ, summe, metadaten)).toBe('rejected');

      expect(await zeile(datei.file_id)).toBeUndefined();
      const { rows: auftraege } = await asPostgres<{ count: string }>(
        'select count(*) from public.storage_deletion_orders where object_key = $1',
        [datei.object_key],
      );
      expect(Number(auftraege[0]?.count)).toBe(1);

      const { rows: protokoll } = await asPostgres<{
        actor_kind: string;
        outcome: string;
        context: Record<string, unknown>;
      }>(
        `select actor_kind, outcome, context from public.audit_log
          where action = 'patient_file.verification_failed' and subject_id = $1`,
        [datei.file_id],
      );
      expect(protokoll).toHaveLength(1);
      expect(protokoll[0]).toMatchObject({ actor_kind: 'system', outcome: 'denied' });
      expect(protokoll[0]!.context).toMatchObject({
        document_type: 'befund',
        content_type_ok: typ,
        checksum_ok: summe,
        metadata_ok: metadaten,
        was_ready: true,
      });
      // Nie Name oder Objektschluessel im Protokoll (ADR-017 Punkt 20).
      expect(JSON.stringify(protokoll[0]!.context)).not.toContain(datei.object_key);
      expect(JSON.stringify(protokoll[0]!.context)).not.toContain('Befund vom');
    });
  }

  describe('scharf geschaltet (Punkt 51)', () => {
    it('laesst die Datei nach der Bestaetigung pending, bis das Ergebnis vorliegt', async () => {
      await schalter(true);
      const datei = await hochladen();
      expect((await zeile(datei.file_id))?.status).toBe('pending');

      // Pending ist unsichtbar und nicht verweisfaehig.
      const { rows: liste } = await asUser(
        users.therapist,
        'select id from public.list_patient_files($1::uuid)',
        [patients.max],
      );
      expect(liste).toEqual([]);
      const verweis = await abgefangen(
        asUser(users.therapist, 'select * from public.issue_patient_file_link($1::uuid)', [
          datei.file_id,
        ]),
      );
      expect(verweis?.message).toMatch(/not accessible/);

      expect(await ergebnis(datei.file_id, true, true, null)).toBe('passed');
      expect((await zeile(datei.file_id))?.status).toBe('ready');
    });

    it('verwirft eine noch nicht freigegebene Datei nach Befund', async () => {
      await schalter(true);
      const datei = await hochladen();
      expect(await ergebnis(datei.file_id, true, false, null)).toBe('rejected');
      expect(await zeile(datei.file_id)).toBeUndefined();
    });

    it('nimmt kein Ergebnis fuer eine unbestaetigte Datei an', async () => {
      await schalter(true);
      const { rows } = await asUserCommitted<Vorbereitet>(
        users.therapist,
        `select file_id from public.prepare_patient_file_upload(
           $1::uuid, null, 'befund', 'Befund', 'application/pdf', 4321, $2)`,
        [patients.max, PRUEFSUMME],
      );
      expect(await ergebnis(rows[0]!.file_id, true, true, null)).toBe('not_confirmed');
    });
  });

  describe('nur der Dienst (Punkt 50)', () => {
    it('weist angemeldete Konten ab - auch owner', async () => {
      const datei = await hochladen();
      for (const sql of [
        'select public.record_patient_file_verification($1::uuid, true, true, null)',
        'select * from public.patient_file_for_verification($1::uuid, $2::uuid)',
      ]) {
        const fehler = await abgefangen(
          asUser(
            users.ownerTherapist,
            sql,
            sql.includes('$2') ? [datei.file_id, users.ownerTherapist] : [datei.file_id],
          ),
        );
        expect(fehler?.message).toMatch(/permission denied/);
      }
    });

    it('gibt dem Dienst Bucket und Ankuendigung, aber nur fuer die Organisation der Person', async () => {
      const datei = await hochladen();
      const { rows } = await asServiceRole<{
        bucket_id: string;
        object_key: string;
        checksum_sha256: string;
        already_verified: boolean;
      }>('select * from public.patient_file_for_verification($1::uuid, $2::uuid)', [
        datei.file_id,
        users.therapist,
      ]);
      expect(rows[0]).toMatchObject({
        bucket_id: 'patientenakte',
        object_key: datei.object_key,
        checksum_sha256: PRUEFSUMME,
        already_verified: false,
      });

      const { owner } = await fremdeOrganisation();
      const { rows: fremd } = await asServiceRole(
        'select * from public.patient_file_for_verification($1::uuid, $2::uuid)',
        [datei.file_id, owner],
      );
      expect(fremd).toEqual([]);
    });
  });
});

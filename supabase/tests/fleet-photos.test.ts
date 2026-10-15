import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asServiceRole,
  asStorageApi,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Fotos am Rad (FLT-002, ANN-547): ADR-017 sinngemäß wie die Anhänge an
 * Rückfragen (Punkt 60) - eigener Bucket, eigene Tabelle, derselbe Weg.
 *
 *   * Zwei Phasen mit Bestätigung, nur zum eigenen Check-Up oder zur eigenen
 *     Stelle, binnen 24 Stunden, höchstens vier je Bezug, nur JPEG bis 10 MB
 *     (Punkte 7, 18).
 *   * Der Objektschlüssel besteht nur aus Kennungen, die Zeile ist
 *     unveränderlich, kein Tabellenrecht (Punkte 5, 8; ADR-004).
 *   * Ansehen nur gegen eine einmalige Freigabe (Punkt 15, ANN-052), für jede
 *     Praxisrolle der Behandlung (app.can_read_fleet).
 *   * Löschen: die aufnehmende Person am selben Tag, owner immer. Jeder Weg -
 *     Löschen, Verwerfen, Befund, Kaskade, Löschlauf - hinterlässt einen
 *     Löschauftrag für das Objekt (Punkt 25).
 *   * Prüfung am Server mit demselben Schalter wie die Akte (Punkte 49 bis
 *     52), Abgleich verwaister Objekte auch im neuen Bucket (Punkt 27).
 *   * Kein Auditeintrag (ADR-010 Fassung 3): wer hochgeladen hat, steht an der
 *     Zeile, wer gelöscht hat, am Löschauftrag.
 *
 * Wie in patient-files.test.ts gilt: signierte Verweise, ihre Gültigkeit und
 * ob Bytes geflossen sind, kann die Nachbildung des Objektspeichers nicht
 * prüfen.
 */

const { users, organizationId } = SEED;

/** Feste Kennungen der Radflotte aus supabase/seed.sql. */
const FLOTTE = {
  rad2: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000012',
  rad3: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000013',
  /** Check-Up von Lastenrad 3, vor zwei Tagen von Tim (Teamleitung). */
  checkup: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000021',
  /** Panne von Lastenrad 3, gestern von Tim. */
  panne: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000031',
  /** Stellen am Check-Up (Bremse, Reifen) und an der Panne (Riemen), von Tim. */
  stelleBremse: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000051',
  stelleReifen: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000052',
  stelleRiemen: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000053',
} as const;

const UNBEKANNT = 'b2b2b2b2-b2b2-4b2b-8b2b-0000000000ff';
const SUMME = 'c'.repeat(64);
const GROESSE = 123_456;

const VORBEREITEN =
  'select * from public.prepare_fleet_photo_upload($1::uuid, $2::uuid, $3::bigint, $4::text)';
const BESTAETIGEN = 'select public.confirm_fleet_photo_upload($1::uuid)';
const VERWERFEN = 'select public.discard_fleet_photo_upload($1::uuid)';
const VERWEIS = 'select * from public.issue_fleet_photo_link($1::uuid)';
const LISTE = 'select * from public.list_fleet_photos($1::uuid)';
const LOESCHEN = 'select public.delete_fleet_photo($1::uuid)';
const ANKUENDIGUNG = 'select * from public.fleet_photo_for_verification($1::uuid, $2::uuid)';
const CHECKUP =
  'select public.record_fleet_checkup($1::uuid, $2::jsonb, $3, $4::jsonb, $5::boolean) as daten';
const PANNE =
  'select public.record_fleet_breakdown($1::uuid, $2, $3, $4, $5, $6, $7::jsonb) as daten';

interface Vorbereitet {
  photo_id: string;
  bucket_id: string;
  object_key: string;
}

/** Genau einer von beiden: eine Stelle oder ein Check-Up ("Weitere Fotos"). */
interface Bezug {
  spot?: string;
  checkup?: string;
}

interface Listeneintrag {
  id: string;
  spot_id: string | null;
  checkup_id: string | null;
  created_at: string;
  verified: boolean;
  may_delete: boolean;
}

async function code(versuch: Promise<unknown>): Promise<string> {
  const fehler = await abgefangen(versuch);
  return fehler ? String((fehler as { code?: string }).code ?? fehler.message) : 'kein Fehler';
}

async function meldung(versuch: Promise<unknown>): Promise<string> {
  return (await abgefangen(versuch))?.message ?? 'kein Fehler';
}

/**
 * Ein frischer Check-Up an Lastenrad 2 mit einer Stelle am Lenker - auf dem
 * Weg der Anwendung, damit Bezug und Zeit stimmen. Der Lenker hebt keinen
 * Prüfpunkt an (ANN-550); alle Prüfpunkte stehen auf "In Ordnung".
 */
async function checkUp(konto: string): Promise<{ checkup: string; stelle: string }> {
  const { rows: katalog } = await asPostgres<{ items: string[] }>(
    "select app.fleet_check_items('load60_riemen') as items",
  );
  const punkte = katalog[0]!.items.map((key) => ({ key, rating: 'ok', note: null }));
  const { rows } = await asUserCommitted<{
    daten: { checkup_id: string; spot_ids: string[] };
  }>(konto, CHECKUP, [
    FLOTTE.rad2,
    JSON.stringify(punkte),
    null,
    JSON.stringify([{ zone: 'lenker', severity: 'problem', point: null, note: null }]),
    true,
  ]);
  return { checkup: rows[0]!.daten.checkup_id, stelle: rows[0]!.daten.spot_ids[0]! };
}

/** Eine Panne an Lastenrad 2 ohne Sperre, mit einer Stelle an der Klingel. */
async function panne(konto: string): Promise<{ panne: string; stelle: string }> {
  const { rows } = await asUserCommitted<{
    daten: { breakdown_id: string; spot_ids: string[] };
  }>(konto, PANNE, [
    FLOTTE.rad2,
    'meldungOhneSperre',
    'Weiterfahrt möglich: Klingel klemmt',
    'Klingel klemmt',
    null,
    null,
    JSON.stringify([{ zone: 'klingel', point: null, note: null }]),
  ]);
  return { panne: rows[0]!.daten.breakdown_id, stelle: rows[0]!.daten.spot_ids[0]! };
}

/** Holt Check-Up, Panne und Stellen des Seeds in die letzte Stunde. */
async function seedFrisch(): Promise<void> {
  await asPostgres(
    "update public.fleet_checkups set checked_at = now() - interval '1 hour' where id = $1",
    [FLOTTE.checkup],
  );
  await asPostgres(
    "update public.fleet_breakdowns set reported_at = now() - interval '50 minutes' where id = $1",
    [FLOTTE.panne],
  );
  await asPostgres(
    "update public.fleet_spots set created_at = now() - interval '45 minutes' where bike_id = $1",
    [FLOTTE.rad3],
  );
}

async function vorbereiten(
  konto: string,
  bezug: Bezug,
  groesse: number | null = GROESSE,
  summe: string | null = SUMME,
): Promise<Vorbereitet> {
  const { rows } = await asUserCommitted<Vorbereitet>(konto, VORBEREITEN, [
    bezug.spot ?? null,
    bezug.checkup ?? null,
    groesse,
    summe,
  ]);
  return rows[0]!;
}

/**
 * Spielt nach, was die Storage-API beim Upload tut - mit der RLS des Kontos.
 * Größe und Typ schreibt sie selbst nach `metadata`; dagegen prüft Phase (c).
 */
async function hochladen(
  konto: string,
  v: Pick<Vorbereitet, 'bucket_id' | 'object_key'>,
  groesse = GROESSE,
  mime = 'image/jpeg',
): Promise<void> {
  await asStorageApi(
    konto,
    'storage.object.upload',
    `insert into storage.objects (bucket_id, name, metadata)
     values ($1, $2, jsonb_build_object('size', $3::bigint, 'mimetype', $4::text))`,
    [v.bucket_id, v.object_key, groesse, mime],
  );
}

/** Der ganze Weg: vorbereiten, hochladen, bestätigen. */
async function fotografieren(konto: string, bezug: Bezug): Promise<Vorbereitet> {
  const v = await vorbereiten(konto, bezug);
  await hochladen(konto, v);
  await asUserCommitted(konto, BESTAETIGEN, [v.photo_id]);
  return v;
}

/** Liest das Objekt mit der RLS des Kontos, wie die Storage-API beim Signieren. */
async function signieren(konto: string, objectKey: string): Promise<number> {
  const { rows } = await asStorageApi<{ n: number }>(
    konto,
    'storage.object.sign',
    `select count(*)::integer as n from storage.objects
     where bucket_id = 'radflotte' and name = $1`,
    [objectKey],
  );
  return rows[0]!.n;
}

async function liste(konto: string, rad: string = FLOTTE.rad2): Promise<Listeneintrag[]> {
  return (await asUser<Listeneintrag>(konto, LISTE, [rad])).rows;
}

async function zeile(photoId: string) {
  const { rows } = await asPostgres<{
    status: string;
    confirmation_requested_at: string | null;
    confirmed_at: string | null;
    verified_at: string | null;
  }>(
    `select status, confirmation_requested_at, confirmed_at, verified_at
       from public.fleet_photos where id = $1`,
    [photoId],
  );
  return rows[0];
}

async function fotos(): Promise<string[]> {
  const { rows } = await asPostgres<{ id: string }>(
    'select id from public.fleet_photos order by created_at, id',
  );
  return rows.map((r) => r.id);
}

/** Die offenen Löschaufträge im Bucket der Fotos am Rad. */
async function auftraege(): Promise<{ object_key: string; ordered_by: string | null }[]> {
  const { rows } = await asPostgres<{ object_key: string; ordered_by: string | null }>(
    `select object_key, ordered_by from public.storage_deletion_orders
      where bucket_id = 'radflotte' and receipted_at is null
      order by ordered_at, object_key`,
  );
  return rows;
}

async function auditAnzahl(): Promise<number> {
  const { rows } = await asPostgres<{ n: number }>(
    'select count(*)::integer as n from public.audit_log',
  );
  return rows[0]!.n;
}

/** Verlegt die Aufnahme zurück - am Wächter vorbei, nur für den Test. */
async function aufgenommenVor(photoId: string, intervall: string): Promise<void> {
  await asPostgres('alter table public.fleet_photos disable trigger fleet_photos_guard');
  try {
    await asPostgres(
      'update public.fleet_photos set created_at = now() - $2::interval where id = $1',
      [photoId, intervall],
    );
  } finally {
    await asPostgres('alter table public.fleet_photos enable trigger fleet_photos_guard');
  }
}

/** Der Schalter der Prüfung am Server (ADR-017 Punkt 51) - derselbe wie für die Akte. */
async function schalter(an: boolean): Promise<void> {
  await asPostgres(
    `create or replace function app.patient_file_verification_required()
       returns boolean language sql immutable set search_path = '' as $$ select ${an} $$`,
  );
}

async function ergebnis(
  photoId: string,
  typ: boolean | null,
  summe: boolean | null,
  metadaten: boolean | null,
): Promise<string> {
  const { rows } = await asServiceRole<{ r: string }>(
    'select public.record_fleet_photo_verification($1::uuid, $2, $3, $4) as r',
    [photoId, typ, summe, metadaten],
  );
  return rows[0]!.r;
}

describe('Fotos am Rad (FLT-002)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  describe('Phase (a): vorbereiten', () => {
    it('legt das Foto an Stelle oder Check-Up an - der Schlüssel besteht nur aus Kennungen (Punkt 5)', async () => {
      const { checkup, stelle } = await checkUp(users.teamLead);
      const anDerStelle = await vorbereiten(users.teamLead, { spot: stelle });
      const amCheckup = await vorbereiten(users.teamLead, { checkup });

      expect(anDerStelle.bucket_id).toBe('radflotte');
      expect(anDerStelle.object_key).toBe(`${organizationId}/${stelle}/${anDerStelle.photo_id}`);
      expect(amCheckup.bucket_id).toBe('radflotte');
      expect(amCheckup.object_key).toBe(`${organizationId}/${checkup}/${amCheckup.photo_id}`);

      const { rows } = await asPostgres(
        `select bike_id, spot_id, checkup_id, mime_type, byte_size::integer as byte_size,
                checksum_sha256, status, confirmed_at, created_by
           from public.fleet_photos where id = $1`,
        [anDerStelle.photo_id],
      );
      expect(rows).toEqual([
        {
          bike_id: FLOTTE.rad2,
          spot_id: stelle,
          checkup_id: null,
          mime_type: 'image/jpeg',
          byte_size: GROESSE,
          checksum_sha256: SUMME,
          status: 'pending',
          confirmed_at: null,
          created_by: users.teamLead,
        },
      ]);
      // Vorbereitet ist unsichtbar und hat keinen Verweis.
      expect(await liste(users.teamLead)).toEqual([]);
      expect(await code(asUserCommitted(users.teamLead, VERWEIS, [anDerStelle.photo_id]))).toBe(
        'P0002',
      );
    });

    it('nur zum eigenen Check-Up und zur eigenen Stelle, binnen 24 Stunden, nie an einer erledigten (P0002)', async () => {
      const { checkup, stelle } = await checkUp(users.teamLead);
      // Fremd: auch owner und das Büro fotografieren nicht an Tims Meldung.
      for (const konto of [users.therapist, users.ownerTherapist, users.office]) {
        expect(await code(vorbereiten(konto, { spot: stelle })), konto).toBe('P0002');
        expect(await code(vorbereiten(konto, { checkup })), konto).toBe('P0002');
      }
      // Nicht vorhanden sieht genauso aus.
      expect(await code(vorbereiten(users.teamLead, { spot: UNBEKANNT }))).toBe('P0002');
      expect(await code(vorbereiten(users.teamLead, { checkup: UNBEKANNT }))).toBe('P0002');

      // Der Seed: Tim hat Check-Up und Panne von Lastenrad 3 vor zwei Tagen
      // und gestern gemeldet - das ist länger als 24 Stunden her.
      expect(await code(vorbereiten(users.teamLead, { checkup: FLOTTE.checkup }))).toBe('P0002');
      for (const spot of [FLOTTE.stelleBremse, FLOTTE.stelleReifen, FLOTTE.stelleRiemen]) {
        expect(await code(vorbereiten(users.teamLead, { spot })), spot).toBe('P0002');
      }

      // Erledigt: Nach der Freigabe nimmt die Stelle keine Fotos mehr an.
      await asUserCommitted(users.teamLead, 'select public.release_fleet_bike($1::uuid)', [
        FLOTTE.rad2,
      ]);
      expect(await code(vorbereiten(users.teamLead, { spot: stelle }))).toBe('P0002');

      // „Weitere Fotos“ am eigenen Check-Up gehen nach der Freigabe noch -
      // an einem ausgemusterten Rad nicht mehr.
      await vorbereiten(users.teamLead, { checkup });
      expect(
        (
          await asUserCommitted<{ ergebnis: string }>(
            users.ownerTherapist,
            'select public.remove_fleet_bike($1::uuid) as ergebnis',
            [FLOTTE.rad2],
          )
        ).rows[0]!.ergebnis,
      ).toBe('archived');
      expect(await code(vorbereiten(users.teamLead, { checkup }))).toBe('P0002');
    });

    it('nimmt an der Meldung des Seeds Fotos an, solange sie jünger als 24 Stunden ist', async () => {
      await seedFrisch();
      await vorbereiten(users.teamLead, { checkup: FLOTTE.checkup });
      await vorbereiten(users.teamLead, { spot: FLOTTE.stelleBremse });
      // Auch an der Stelle einer Panne.
      await vorbereiten(users.teamLead, { spot: FLOTTE.stelleRiemen });
      // Anna hat den Check-Up nicht gemacht.
      expect(await code(vorbereiten(users.therapist, { checkup: FLOTTE.checkup }))).toBe('P0002');
      expect(await code(vorbereiten(users.therapist, { spot: FLOTTE.stelleRiemen }))).toBe('P0002');

      // 24 Stunden und eine Minute später ist es vorbei.
      await asPostgres(
        "update public.fleet_checkups set checked_at = now() - interval '24 hours 1 minute' where id = $1",
        [FLOTTE.checkup],
      );
      await asPostgres(
        "update public.fleet_spots set created_at = now() - interval '24 hours 1 minute' where id = $1",
        [FLOTTE.stelleRiemen],
      );
      expect(await code(vorbereiten(users.teamLead, { checkup: FLOTTE.checkup }))).toBe('P0002');
      expect(await code(vorbereiten(users.teamLead, { spot: FLOTTE.stelleRiemen }))).toBe('P0002');
      // Die Stelle am Check-Up ist jünger - sie zählt für sich.
      await vorbereiten(users.teamLead, { spot: FLOTTE.stelleBremse });
    });

    it('verlangt genau einen Bezug, eine Größe bis 10 MB und eine SHA-256 (22023)', async () => {
      const { checkup, stelle } = await checkUp(users.teamLead);
      expect(
        await code(asUserCommitted(users.teamLead, VORBEREITEN, [stelle, checkup, GROESSE, SUMME])),
      ).toBe('22023');
      expect(
        await code(asUserCommitted(users.teamLead, VORBEREITEN, [null, null, GROESSE, SUMME])),
      ).toBe('22023');

      for (const groesse of [0, -1, 10_485_761, null]) {
        expect(
          await meldung(vorbereiten(users.teamLead, { spot: stelle }, groesse)),
          String(groesse),
        ).toContain('too large or empty');
      }
      for (const summe of ['C'.repeat(64), 'c'.repeat(63), 'g'.repeat(64), null]) {
        expect(
          await code(vorbereiten(users.teamLead, { spot: stelle }, GROESSE, summe)),
          String(summe),
        ).toBe('22023');
      }
      // Genau 10 MB gehen (Punkt 18, Limit am Bucket).
      const gross = await vorbereiten(users.teamLead, { spot: stelle }, 10_485_760);
      expect(gross.photo_id).toBeTruthy();
    });

    it('höchstens vier Fotos je Stelle und je Check-Up - vorbereitete zählen mit (23514)', async () => {
      const { checkup, stelle } = await checkUp(users.teamLead);
      const erstes = await fotografieren(users.teamLead, { spot: stelle });
      for (let i = 0; i < 3; i += 1) await vorbereiten(users.teamLead, { spot: stelle });
      expect(await code(vorbereiten(users.teamLead, { spot: stelle }))).toBe('23514');

      // Der Check-Up zählt für sich ("Weitere Fotos").
      for (let i = 0; i < 4; i += 1) await vorbereiten(users.teamLead, { checkup });
      expect(await code(vorbereiten(users.teamLead, { checkup }))).toBe('23514');

      // Ein gelöschtes Foto gibt seinen Platz frei.
      await asUserCommitted(users.teamLead, LOESCHEN, [erstes.photo_id]);
      await vorbereiten(users.teamLead, { spot: stelle });
    });

    it('weist Trainingsbetreuung, Patienten- und Plattformkonto, Anonyme und die fremde Organisation ab', async () => {
      const fremd = await fremdeOrganisation();
      const { checkup, stelle } = await checkUp(users.teamLead);
      for (const konto of [users.trainer, users.patientMax, users.plattformTina, null]) {
        expect(
          await code(asUser(konto, VORBEREITEN, [stelle, null, GROESSE, SUMME])),
          String(konto),
        ).toBe('42501');
        // Erst Konto und Recht, dann die Eingaben.
        expect(await code(asUser(konto, VORBEREITEN, [null, null, 0, 'x'])), String(konto)).toBe(
          '42501',
        );
      }
      expect(await code(asAnon(VORBEREITEN, [stelle, null, GROESSE, SUMME]))).toBe('42501');
      // Die fremde Organisation findet den Bezug nicht.
      expect(await code(vorbereiten(fremd.owner, { spot: stelle }))).toBe('P0002');
      expect(await code(vorbereiten(fremd.owner, { checkup }))).toBe('P0002');
      expect(await fotos()).toEqual([]);
    });
  });

  describe('Objektspeicher (ADR-017 Punkt 11)', () => {
    it('lädt nur unter dem Schlüssel einer eigenen vorbereiteten Zeile hoch', async () => {
      const { stelle } = await checkUp(users.teamLead);
      const v = await vorbereiten(users.teamLead, { spot: stelle });

      // Kein anderes Konto legt unter Tims Schlüssel ab - auch owner nicht.
      for (const konto of [
        users.therapist,
        users.ownerTherapist,
        users.office,
        users.trainer,
        users.plattformTina,
      ]) {
        expect(await meldung(hochladen(konto, v)), konto).toContain('row-level security');
      }
      // Ein erfundener Schlüssel und ein anderer Bucket gehen auch für Tim nicht.
      expect(
        await meldung(
          hochladen(users.teamLead, {
            bucket_id: 'radflotte',
            object_key: `${organizationId}/${stelle}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
          }),
        ),
      ).toContain('row-level security');
      expect(
        await meldung(
          hochladen(users.teamLead, { bucket_id: 'patientenakte', object_key: v.object_key }),
        ),
      ).toContain('row-level security');

      // Der eigene Schlüssel: ja.
      expect(await abgefangen(hochladen(users.teamLead, v))).toBeNull();
    });

    it('kein Hochladen nach der Bestätigung, während der Prüfung oder nach 24 Stunden', async () => {
      const { checkup, stelle } = await checkUp(users.teamLead);

      // Nach der Bestätigung: kein zweites Objekt unter dem Schlüssel.
      const fertig = await fotografieren(users.teamLead, { spot: stelle });
      await asPostgres("delete from storage.objects where bucket_id = 'radflotte' and name = $1", [
        fertig.object_key,
      ]);
      expect(await meldung(hochladen(users.teamLead, fertig))).toContain('row-level security');

      // Während die Prüfung am Server läuft.
      await schalter(true);
      try {
        const geprueft = await fotografieren(users.teamLead, { checkup });
        await asPostgres(
          "delete from storage.objects where bucket_id = 'radflotte' and name = $1",
          [geprueft.object_key],
        );
        expect(await meldung(hochladen(users.teamLead, geprueft))).toContain('row-level security');
      } finally {
        await schalter(false);
      }

      // Älter als 24 Stunden.
      const alt = await vorbereiten(users.teamLead, { spot: stelle });
      await aufgenommenVor(alt.photo_id, '25 hours');
      expect(await meldung(hochladen(users.teamLead, alt))).toContain('row-level security');
    });

    it('kein Überschreiben und kein direktes Löschen am Objektspeicher (Punkte 8, 25)', async () => {
      const { stelle } = await checkUp(users.teamLead);
      const v = await fotografieren(users.teamLead, { spot: stelle });

      const { rows } = await asUser<{ id: string }>(
        users.teamLead,
        `update storage.objects set metadata = jsonb_build_object('size', 1)
          where bucket_id = 'radflotte' and name = $1 returning id`,
        [v.object_key],
      ).catch(() => ({ rows: [] as { id: string }[] }));
      expect(rows).toEqual([]);

      // Ohne Löschauftrag löscht niemand das Objekt - auch owner nicht.
      for (const konto of [users.teamLead, users.ownerTherapist]) {
        await asStorageApi(
          konto,
          'storage.object.delete',
          "delete from storage.objects where bucket_id = 'radflotte' and name = $1",
          [v.object_key],
        );
      }
      const { rows: objekt } = await asPostgres<{ size: string }>(
        "select metadata ->> 'size' as size from storage.objects where bucket_id = 'radflotte' and name = $1",
        [v.object_key],
      );
      expect(objekt).toEqual([{ size: String(GROESSE) }]);
    });
  });

  describe('Phase (c): bestätigen', () => {
    it('prüft gegen das abgelegte Objekt: vorhanden, Größe und Typ wie angekündigt', async () => {
      const { stelle } = await checkUp(users.teamLead);

      // Ohne Objekt keine Bestätigung.
      const ohne = await vorbereiten(users.teamLead, { spot: stelle });
      expect(
        await meldung(asUserCommitted(users.teamLead, BESTAETIGEN, [ohne.photo_id])),
      ).toContain('not uploaded');
      expect(await code(asUserCommitted(users.teamLead, BESTAETIGEN, [ohne.photo_id]))).toBe(
        '22023',
      );

      // Andere Größe als angekündigt.
      const groesse = await vorbereiten(users.teamLead, { spot: stelle });
      await hochladen(users.teamLead, groesse, 999);
      expect(
        await meldung(asUserCommitted(users.teamLead, BESTAETIGEN, [groesse.photo_id])),
      ).toContain('size does not match');

      // Anderer Typ als angekündigt.
      const typ = await vorbereiten(users.teamLead, { spot: stelle });
      await hochladen(users.teamLead, typ, GROESSE, 'image/png');
      const fehler = await abgefangen(asUserCommitted(users.teamLead, BESTAETIGEN, [typ.photo_id]));
      expect(fehler?.message).toContain('media type does not match');
      expect((fehler as { code?: string } | null)?.code).toBe('22023');

      // Alle drei bleiben vorbereitet und unsichtbar.
      for (const v of [ohne, groesse, typ]) {
        expect((await zeile(v.photo_id))?.status).toBe('pending');
      }
      expect(await liste(users.teamLead)).toEqual([]);
    });

    it('macht das Foto fertig - einmal und nur für die aufnehmende Person', async () => {
      const { checkup } = await checkUp(users.teamLead);
      const v = await vorbereiten(users.teamLead, { checkup });
      await hochladen(users.teamLead, v);

      // Andere bestätigen und verwerfen nicht, gleich welche Rolle.
      for (const konto of [users.therapist, users.ownerTherapist, users.office]) {
        expect(await code(asUserCommitted(konto, BESTAETIGEN, [v.photo_id])), konto).toBe('P0002');
        expect(await code(asUserCommitted(konto, VERWERFEN, [v.photo_id])), konto).toBe('P0002');
      }
      for (const konto of [users.trainer, users.plattformTina]) {
        expect(await code(asUserCommitted(konto, BESTAETIGEN, [v.photo_id])), konto).toBe('42501');
        expect(await code(asUserCommitted(konto, VERWERFEN, [v.photo_id])), konto).toBe('42501');
      }

      await asUserCommitted(users.teamLead, BESTAETIGEN, [v.photo_id]);
      const nachher = await zeile(v.photo_id);
      expect(nachher).toMatchObject({
        status: 'ready',
        confirmation_requested_at: null,
        verified_at: null,
      });
      expect(nachher?.confirmed_at).not.toBeNull();
      expect((await liste(users.teamLead)).map((f) => f.id)).toEqual([v.photo_id]);

      // Kein zweites Mal, und verwerfen geht nur vor der Bestätigung.
      expect(await code(asUserCommitted(users.teamLead, BESTAETIGEN, [v.photo_id]))).toBe('P0002');
      expect(await code(asUserCommitted(users.teamLead, VERWERFEN, [v.photo_id]))).toBe('P0002');
    });

    it('verwirft die eigene vorbereitete Zeile; liegt schon ein Objekt, folgt ein Löschauftrag', async () => {
      const { stelle } = await checkUp(users.teamLead);
      const ohne = await vorbereiten(users.teamLead, { spot: stelle });
      const mit = await vorbereiten(users.teamLead, { spot: stelle });
      await hochladen(users.teamLead, mit, 999);

      await asUserCommitted(users.teamLead, VERWERFEN, [ohne.photo_id]);
      await asUserCommitted(users.teamLead, VERWERFEN, [mit.photo_id]);

      expect(await fotos()).toEqual([]);
      expect(await auftraege()).toEqual([
        { object_key: mit.object_key, ordered_by: users.teamLead },
      ]);
    });
  });

  describe('Prüfung am Server (ADR-017 Punkte 49 bis 52)', () => {
    it('ist der Schalter scharf, wird das Foto erst mit bestandenem Ergebnis fertig (Punkt 51)', async () => {
      const { stelle } = await checkUp(users.teamLead);
      await schalter(true);
      try {
        const v = await fotografieren(users.teamLead, { spot: stelle });
        const wartend = await zeile(v.photo_id);
        expect(wartend).toMatchObject({ status: 'pending', confirmed_at: null, verified_at: null });
        expect(wartend?.confirmation_requested_at).not.toBeNull();

        // Unsichtbar, ohne Verweis; weder ein zweites Bestätigen noch Verwerfen.
        expect(await liste(users.therapist)).toEqual([]);
        expect(await code(asUserCommitted(users.therapist, VERWEIS, [v.photo_id]))).toBe('P0002');
        expect(await code(asUserCommitted(users.teamLead, BESTAETIGEN, [v.photo_id]))).toBe(
          'P0002',
        );
        expect(await code(asUserCommitted(users.teamLead, VERWERFEN, [v.photo_id]))).toBe('P0002');

        // Die Ankündigung für den Dienst - nur zum Konto, das aufgenommen hat.
        const { rows } = await asServiceRole<{
          bucket_id: string;
          object_key: string;
          mime_type: string;
          byte_size: string;
          checksum_sha256: string;
          already_verified: boolean;
        }>(ANKUENDIGUNG, [v.photo_id, users.teamLead]);
        expect(rows).toEqual([
          {
            bucket_id: 'radflotte',
            object_key: v.object_key,
            mime_type: 'image/jpeg',
            byte_size: String(GROESSE),
            checksum_sha256: SUMME,
            already_verified: false,
          },
        ]);
        expect((await asServiceRole(ANKUENDIGUNG, [v.photo_id, users.therapist])).rows).toEqual([]);

        expect(await ergebnis(v.photo_id, true, true, true)).toBe('passed');
        const fertig = await zeile(v.photo_id);
        expect(fertig?.status).toBe('ready');
        expect(fertig?.confirmed_at).not.toBeNull();
        expect(fertig?.verified_at).not.toBeNull();
        expect((await liste(users.therapist)).map((f) => [f.id, f.verified])).toEqual([
          [v.photo_id, true],
        ]);
        // Ein zweiter Lauf ändert nichts.
        expect(await ergebnis(v.photo_id, false, false, false)).toBe('already_verified');
        expect((await zeile(v.photo_id))?.status).toBe('ready');
        expect(
          (
            await asServiceRole<{ already_verified: boolean }>(ANKUENDIGUNG, [
              v.photo_id,
              users.teamLead,
            ])
          ).rows[0]?.already_verified,
        ).toBe(true);
      } finally {
        await schalter(false);
      }
    });

    it('ein Befund verwirft das Foto samt Löschauftrag, ohne Auditeintrag (Punkt 52)', async () => {
      const { checkup, stelle } = await checkUp(users.teamLead);
      await schalter(true);
      try {
        const typ = await fotografieren(users.teamLead, { spot: stelle });
        const summe = await fotografieren(users.teamLead, { spot: stelle });
        const metadaten = await fotografieren(users.teamLead, { checkup });
        const audit = await auditAnzahl();

        expect(await ergebnis(typ.photo_id, false, true, true)).toBe('rejected');
        expect(await ergebnis(summe.photo_id, true, false, true)).toBe('rejected');
        expect(await ergebnis(metadaten.photo_id, true, true, false)).toBe('rejected');

        expect(await fotos()).toEqual([]);
        // Der Dienst hat kein Konto: ordered_by bleibt leer.
        expect((await auftraege()).map((a) => a.object_key).sort()).toEqual(
          [typ.object_key, summe.object_key, metadaten.object_key].sort(),
        );
        expect((await auftraege()).every((a) => a.ordered_by === null)).toBe(true);
        expect(await auditAnzahl()).toBe(audit);
      } finally {
        await schalter(false);
      }
    });

    it('nimmt nur vollständige Ergebnisse zu bestätigten Fotos an', async () => {
      const { stelle } = await checkUp(users.teamLead);
      const fertig = await fotografieren(users.teamLead, { spot: stelle });
      const offen = await vorbereiten(users.teamLead, { spot: stelle });

      for (const [typ, summe, metadaten] of [
        [null, true, true],
        [true, null, true],
        [true, true, null],
      ] as const) {
        expect(await code(ergebnis(fertig.photo_id, typ, summe, metadaten))).toBe('22023');
      }
      expect(await ergebnis(offen.photo_id, true, true, true)).toBe('not_confirmed');
      expect(await ergebnis(UNBEKANNT, true, true, true)).toBe('not_found');
      // Für eine vorbereitete Zeile gibt es keine Ankündigung.
      expect((await asServiceRole(ANKUENDIGUNG, [offen.photo_id, users.teamLead])).rows).toEqual(
        [],
      );
      expect(await fotos()).toEqual([fertig.photo_id, offen.photo_id]);
    });

    it('ohne Schalter ist bestätigt fertig; das Ergebnis vermerkt nur die Prüfung', async () => {
      const { rows: schalterStand } = await asPostgres<{ an: boolean }>(
        'select app.patient_file_verification_required() as an',
      );
      expect(schalterStand[0]?.an).toBe(false);

      const { stelle } = await checkUp(users.teamLead);
      const v = await fotografieren(users.teamLead, { spot: stelle });
      expect((await liste(users.teamLead)).map((f) => [f.id, f.verified])).toEqual([
        [v.photo_id, false],
      ]);
      expect(await ergebnis(v.photo_id, true, true, true)).toBe('passed');
      expect((await liste(users.teamLead)).map((f) => [f.id, f.verified])).toEqual([
        [v.photo_id, true],
      ]);
      // Nach 24 Stunden gibt es keine Ankündigung mehr.
      await aufgenommenVor(v.photo_id, '25 hours');
      expect((await asServiceRole(ANKUENDIGUNG, [v.photo_id, users.teamLead])).rows).toEqual([]);
    });

    it('Ankündigung und Ergebnis nur für den Dienst, nie für die Anwendung', async () => {
      const { stelle } = await checkUp(users.teamLead);
      const v = await fotografieren(users.teamLead, { spot: stelle });
      for (const konto of [users.teamLead, users.ownerTherapist]) {
        expect(await code(asUser(konto, ANKUENDIGUNG, [v.photo_id, konto])), konto).toBe('42501');
        expect(
          await code(
            asUser(
              konto,
              'select public.record_fleet_photo_verification($1::uuid, true, true, true)',
              [v.photo_id],
            ),
          ),
          konto,
        ).toBe('42501');
      }
      expect(await code(asAnon(ANKUENDIGUNG, [v.photo_id, users.teamLead]))).toBe('42501');
      expect((await zeile(v.photo_id))?.verified_at).toBeNull();
    });
  });

  describe('Die Tabelle (ADR-017 Punkte 5 und 8)', () => {
    it('ist unveränderlich bis auf Zustand und Prüfung', async () => {
      const { stelle } = await checkUp(users.teamLead);
      const v = await fotografieren(users.teamLead, { spot: stelle });
      for (const aenderung of [
        'byte_size = 1',
        `checksum_sha256 = '${'d'.repeat(64)}'`,
        `created_by = '${users.therapist}'`,
        "created_at = now() - interval '1 day'",
        `bike_id = '${FLOTTE.rad3}'`,
      ]) {
        expect(
          await meldung(
            asPostgres(`update public.fleet_photos set ${aenderung} where id = $1`, [v.photo_id]),
          ),
          aenderung,
        ).toContain('fleet photos are immutable');
      }
      // Der Schlüssel ist generiert und lässt sich gar nicht setzen.
      expect(
        await abgefangen(
          asPostgres("update public.fleet_photos set object_key = 'x/y/z' where id = $1", [
            v.photo_id,
          ]),
        ),
      ).not.toBeNull();
      const { rows } = await asPostgres<{ object_key: string; byte_size: number }>(
        'select object_key, byte_size::integer as byte_size from public.fleet_photos where id = $1',
        [v.photo_id],
      );
      expect(rows).toEqual([{ object_key: v.object_key, byte_size: GROESSE }]);
    });

    it('gibt keiner Rolle Tabellenrecht - nur die Funktionen (ADR-004)', async () => {
      for (const tabelle of ['fleet_photos', 'fleet_photo_access_grants']) {
        for (const sql of [
          `select * from public.${tabelle}`,
          `insert into public.${tabelle} default values`,
          `update public.${tabelle} set created_at = now()`,
          `delete from public.${tabelle}`,
        ]) {
          for (const konto of [users.ownerTherapist, users.teamLead]) {
            await expect(asUser(konto, sql), `${konto} ${sql}`).rejects.toThrow(
              /permission denied/i,
            );
          }
          await expect(asAnon(sql), sql).rejects.toThrow(/permission denied/i);
        }
      }
    });
  });

  describe('Ansehen gegen eine einmalige Freigabe (Punkt 15, ANN-052)', () => {
    it('gilt einmal und nur für die Person, die sie bekam; den Schlüssel zu kennen genügt nicht', async () => {
      const { stelle } = await checkUp(users.teamLead);
      const v = await fotografieren(users.teamLead, { spot: stelle });

      // Ohne Freigabe nichts - auch nicht für die aufnehmende Person.
      expect(await signieren(users.teamLead, v.object_key)).toBe(0);
      expect(await signieren(users.therapist, v.object_key)).toBe(0);

      const { rows } = await asUserCommitted(users.therapist, VERWEIS, [v.photo_id]);
      expect(rows).toEqual([
        { bucket_id: 'radflotte', object_key: v.object_key, mime_type: 'image/jpeg' },
      ]);
      const { rows: freigaben } = await asPostgres<{
        organization_id: string;
        user_id: string;
        sekunden: number;
      }>(
        `select organization_id, user_id,
                extract(epoch from expires_at - created_at)::integer as sekunden
           from public.fleet_photo_access_grants where photo_id = $1`,
        [v.photo_id],
      );
      expect(freigaben).toEqual([
        { organization_id: organizationId, user_id: users.therapist, sekunden: 30 },
      ]);

      // Eine andere Person nutzt sie nicht.
      expect(await signieren(users.office, v.object_key)).toBe(0);
      expect(await signieren(users.teamLead, v.object_key)).toBe(0);
      // Die Person selbst genau einmal.
      expect(await signieren(users.therapist, v.object_key)).toBe(1);
      expect(await signieren(users.therapist, v.object_key)).toBe(0);
      expect(
        (
          await asPostgres('select 1 from public.fleet_photo_access_grants where photo_id = $1', [
            v.photo_id,
          ])
        ).rows,
      ).toEqual([]);
    });

    it('eine Freigabe hilft nicht mehr, wenn die Rolle fehlt (Defense-in-Depth, ADR-004)', async () => {
      const { stelle } = await checkUp(users.teamLead);
      const v = await fotografieren(users.teamLead, { spot: stelle });
      await asUserCommitted(users.office, VERWEIS, [v.photo_id]);
      await asPostgres(`delete from public.user_roles where user_id = $1 and role_key = 'office'`, [
        users.office,
      ]);
      expect(await signieren(users.office, v.object_key)).toBe(0);
      // Abgewiesen, nicht verbraucht: Die Freigabe verfällt von selbst.
      const { rows } = await asPostgres<{ user_id: string }>(
        'select user_id from public.fleet_photo_access_grants where photo_id = $1',
        [v.photo_id],
      );
      expect(rows).toEqual([{ user_id: users.office }]);
    });

    it('eine abgelaufene Freigabe öffnet nichts und fällt beim nächsten Ausstellen weg', async () => {
      const { stelle } = await checkUp(users.teamLead);
      const v = await fotografieren(users.teamLead, { spot: stelle });
      await asUserCommitted(users.therapist, VERWEIS, [v.photo_id]);
      await asPostgres(
        `update public.fleet_photo_access_grants
            set created_at = now() - interval '1 minute', expires_at = now() - interval '30 seconds'`,
      );
      expect(await signieren(users.therapist, v.object_key)).toBe(0);

      await asUserCommitted(users.office, VERWEIS, [v.photo_id]);
      const { rows } = await asPostgres<{ user_id: string }>(
        'select user_id from public.fleet_photo_access_grants',
      );
      expect(rows).toEqual([{ user_id: users.office }]);
    });

    it('jede Praxisrolle der Behandlung liest; Trainingsbetreuung, Patienten-, Plattformkonto und Anonyme nicht', async () => {
      const { stelle } = await checkUp(users.teamLead);
      const v = await fotografieren(users.teamLead, { spot: stelle });

      for (const konto of [users.ownerTherapist, users.therapist, users.office, users.teamLead]) {
        await asUserCommitted(konto, VERWEIS, [v.photo_id]);
        expect(await signieren(konto, v.object_key), konto).toBe(1);
        expect(
          (await liste(konto)).map((f) => f.id),
          konto,
        ).toEqual([v.photo_id]);
      }
      for (const konto of [users.trainer, users.patientMax, users.plattformTina]) {
        expect(await code(asUserCommitted(konto, VERWEIS, [v.photo_id])), konto).toBe('42501');
        expect(await code(asUser(konto, LISTE, [FLOTTE.rad2])), konto).toBe('42501');
        expect(await signieren(konto, v.object_key), konto).toBe(0);
      }
      expect(await code(asUser(null, VERWEIS, [v.photo_id]))).toBe('42501');
      expect(await code(asUser(null, LISTE, [FLOTTE.rad2]))).toBe('42501');
      expect(await code(asAnon(VERWEIS, [v.photo_id]))).toBe('42501');
      expect(await code(asAnon(LISTE, [FLOTTE.rad2]))).toBe('42501');
      expect(
        (await asAnon("select name from storage.objects where bucket_id = 'radflotte'")).rows,
      ).toEqual([]);
      // Abgewiesene Versuche legen keine Freigabe an.
      const { rows } = await asPostgres<{ n: number }>(
        'select count(*)::integer as n from public.fleet_photo_access_grants',
      );
      expect(rows[0]!.n).toBe(0);
    });

    it('eine fremde Organisation sieht, öffnet, bestätigt und löscht nichts (ADR-003)', async () => {
      const fremd = await fremdeOrganisation();
      const { checkup, stelle } = await checkUp(users.teamLead);
      const v = await fotografieren(users.teamLead, { spot: stelle });
      const offen = await vorbereiten(users.teamLead, { checkup });

      expect(await code(asUserCommitted(fremd.owner, VERWEIS, [v.photo_id]))).toBe('P0002');
      expect(await code(asUser(fremd.owner, LISTE, [FLOTTE.rad2]))).toBe('P0002');
      expect(await code(asUserCommitted(fremd.owner, LOESCHEN, [v.photo_id]))).toBe('P0002');
      expect(await code(asUserCommitted(fremd.owner, BESTAETIGEN, [offen.photo_id]))).toBe('P0002');
      expect(await code(asUserCommitted(fremd.owner, VERWERFEN, [offen.photo_id]))).toBe('P0002');
      expect(await meldung(hochladen(fremd.owner, offen))).toContain('row-level security');
      // Auch im Objektspeicher nichts.
      expect(await signieren(fremd.owner, v.object_key)).toBe(0);
      expect(await fotos()).toEqual([v.photo_id, offen.photo_id]);
    });
  });

  describe('Die Liste eines Rads', () => {
    it('nur fertige Fotos, ohne Objektschlüssel, mit dem Löschrecht der anfragenden Person', async () => {
      const tim = await checkUp(users.teamLead);
      const anna = await checkUp(users.therapist);
      const amCheckup = await fotografieren(users.teamLead, { checkup: tim.checkup });
      const anDerStelle = await fotografieren(users.teamLead, { spot: tim.stelle });
      const vonAnna = await fotografieren(users.therapist, { checkup: anna.checkup });
      // Vorbereitet: nicht in der Liste.
      await vorbereiten(users.teamLead, { spot: tim.stelle });

      const { rows } = await asUser<Record<string, unknown>>(users.teamLead, LISTE, [FLOTTE.rad2]);
      expect(Object.keys(rows[0]!).sort()).toEqual([
        'checkup_id',
        'created_at',
        'id',
        'may_delete',
        'spot_id',
        'verified',
      ]);
      for (const v of [amCheckup, anDerStelle, vonAnna]) {
        expect(JSON.stringify(rows)).not.toContain(v.object_key);
      }
      expect(rows.map((r) => [r.id, r.spot_id, r.checkup_id, r.verified])).toEqual([
        [amCheckup.photo_id, null, tim.checkup, false],
        [anDerStelle.photo_id, tim.stelle, null, false],
        [vonAnna.photo_id, null, anna.checkup, false],
      ]);

      const recht = async (konto: string) => (await liste(konto)).map((f) => f.may_delete);
      // Die aufnehmende Person am selben Tag, owner immer, sonst niemand.
      expect(await recht(users.teamLead)).toEqual([true, true, false]);
      expect(await recht(users.therapist)).toEqual([false, false, true]);
      expect(await recht(users.ownerTherapist)).toEqual([true, true, true]);
      expect(await recht(users.office)).toEqual([false, false, false]);

      // Am Folgetag nur noch owner.
      await aufgenommenVor(amCheckup.photo_id, '2 days');
      expect(await recht(users.teamLead)).toEqual([false, true, false]);
      expect(await recht(users.ownerTherapist)).toEqual([true, true, true]);

      // Ein anderes Rad hat keine Fotos; ein unbekanntes ist nicht gefunden.
      expect(await liste(users.teamLead, FLOTTE.rad3)).toEqual([]);
      expect(await code(liste(users.teamLead, UNBEKANNT))).toBe('P0002');
    });
  });

  describe('Löschen', () => {
    it('die aufnehmende Person am selben Tag, owner jederzeit - Nachweis am Löschauftrag, nicht im Auditlog', async () => {
      const { checkup, stelle } = await checkUp(users.teamLead);
      const a = await fotografieren(users.teamLead, { spot: stelle });
      const b = await fotografieren(users.teamLead, { checkup });
      const c = await fotografieren(users.teamLead, { checkup });
      const audit = await auditAnzahl();

      // Eine Kollegin nicht, das Büro nicht, die Trainingsbetreuung gar nicht.
      expect(await code(asUserCommitted(users.therapist, LOESCHEN, [a.photo_id]))).toBe('42501');
      expect(await code(asUserCommitted(users.office, LOESCHEN, [a.photo_id]))).toBe('42501');
      expect(await code(asUserCommitted(users.trainer, LOESCHEN, [a.photo_id]))).toBe('42501');

      await asUserCommitted(users.teamLead, LOESCHEN, [a.photo_id]);
      await asUserCommitted(users.ownerTherapist, LOESCHEN, [b.photo_id]);
      // Am Folgetag nur noch owner.
      await aufgenommenVor(c.photo_id, '2 days');
      expect(await code(asUserCommitted(users.teamLead, LOESCHEN, [c.photo_id]))).toBe('42501');
      await asUserCommitted(users.ownerTherapist, LOESCHEN, [c.photo_id]);

      expect(await fotos()).toEqual([]);
      expect(await auftraege()).toEqual([
        { object_key: a.object_key, ordered_by: users.teamLead },
        { object_key: b.object_key, ordered_by: users.ownerTherapist },
        { object_key: c.object_key, ordered_by: users.ownerTherapist },
      ]);
      expect(await auditAnzahl()).toBe(audit);

      // Ein zweites Mal gibt es nicht; ein vorbereitetes Foto geht über den Rückweg.
      expect(await code(asUserCommitted(users.teamLead, LOESCHEN, [a.photo_id]))).toBe('P0002');
      const offen = await vorbereiten(users.teamLead, { spot: stelle });
      expect(await code(asUserCommitted(users.teamLead, LOESCHEN, [offen.photo_id]))).toBe('P0002');
    });

    it('mit Check-Up, Panne oder Rad fallen die Fotos - jede Kaskade hinterlässt den Auftrag', async () => {
      const { checkup, stelle } = await checkUp(users.teamLead);
      const amCheckup = await fotografieren(users.teamLead, { checkup });
      const anDerStelle = await fotografieren(users.teamLead, { spot: stelle });
      const ohneObjekt = await vorbereiten(users.teamLead, { spot: stelle });
      const kaputt = await panne(users.teamLead);
      const anDerPanne = await fotografieren(users.teamLead, { spot: kaputt.stelle });
      const zweite = await panne(users.teamLead);
      const amRad = await fotografieren(users.teamLead, { spot: zweite.stelle });

      // Check-Up: seine Fotos und die seiner Stellen; ohne Objekt kein Auftrag.
      await asPostgres('delete from public.fleet_checkups where id = $1', [checkup]);
      expect(await fotos()).toEqual([anDerPanne.photo_id, amRad.photo_id]);
      const nachCheckup = await auftraege();
      expect(nachCheckup.map((a) => a.object_key).sort()).toEqual(
        [amCheckup.object_key, anDerStelle.object_key].sort(),
      );
      expect(nachCheckup.every((a) => a.ordered_by === null)).toBe(true);
      expect(nachCheckup.map((a) => a.object_key)).not.toContain(ohneObjekt.object_key);

      // Panne: über ihre Stelle.
      await asPostgres('delete from public.fleet_breakdowns where id = $1', [kaputt.panne]);
      expect(await fotos()).toEqual([amRad.photo_id]);

      // Rad: alles, was an ihm hängt.
      await asPostgres('delete from public.fleet_bikes where id = $1', [FLOTTE.rad2]);
      expect(await fotos()).toEqual([]);
      expect((await auftraege()).map((a) => a.object_key).sort()).toEqual(
        [amCheckup, anDerStelle, anDerPanne, amRad].map((v) => v.object_key).sort(),
      );
    });

    it('der Auftrag lässt sich ausführen und quittieren - nur owner, nur gegen die Löschfreigabe (DAT-002)', async () => {
      const ENTFERNEN =
        "delete from storage.objects where bucket_id = 'radflotte' and name = $1 returning id";
      // So meldet die Storage-API das Entfernen (FIX-015).
      const OPERATION = 'storage.object.delete_many';
      const { stelle } = await checkUp(users.teamLead);
      const bleibt = await fotografieren(users.teamLead, { spot: stelle });
      const v = await fotografieren(users.teamLead, { spot: stelle });

      // Solange die Zeile steht, entfernt niemand das Objekt.
      expect(
        (await asStorageApi(users.ownerTherapist, OPERATION, ENTFERNEN, [bleibt.object_key])).rows,
      ).toEqual([]);

      await asUserCommitted(users.teamLead, LOESCHEN, [v.photo_id]);
      const { rows: offen } = await asUser<{
        id: string;
        bucket_id: string;
        object_present: boolean;
      }>(
        users.ownerTherapist,
        'select id, bucket_id, object_present from public.list_storage_deletion_orders()',
      );
      expect(offen.map((o) => [o.bucket_id, o.object_present])).toEqual([['radflotte', true]]);

      // Die Teamleitung führt keine Aufträge aus; owner nur gegen die Freigabe.
      for (const konto of [users.teamLead, users.ownerTherapist]) {
        expect(
          (await asStorageApi(konto, OPERATION, ENTFERNEN, [v.object_key])).rows,
          konto,
        ).toEqual([]);
      }
      const { rows: geholt } = await asUserCommitted(
        users.ownerTherapist,
        'select * from public.claim_storage_deletion_order($1::uuid)',
        [offen[0]!.id],
      );
      expect(geholt).toEqual([{ bucket_id: 'radflotte', object_key: v.object_key }]);
      // Die Löschfreigabe öffnet das Objekt nicht zum Ansehen.
      expect(await signieren(users.ownerTherapist, v.object_key)).toBe(0);
      expect(
        (await asStorageApi(users.ownerTherapist, OPERATION, ENTFERNEN, [v.object_key])).rows,
      ).toHaveLength(1);
      await asUserCommitted(
        users.ownerTherapist,
        'select public.receipt_storage_deletion_order($1::uuid)',
        [offen[0]!.id],
      );

      expect(await auftraege()).toEqual([]);
      const { rows: objekte } = await asPostgres<{ name: string }>(
        "select name from storage.objects where bucket_id = 'radflotte'",
      );
      expect(objekte).toEqual([{ name: bleibt.object_key }]);
      expect(await fotos()).toEqual([bleibt.photo_id]);
    });
  });

  describe('Löschlauf (ADR-008, ANN-546)', () => {
    it('nach der Frist fallen die Fotos mit Check-Up, Panne und Stellen; das Objekt folgt über den Auftrag', async () => {
      await seedFrisch();
      const amCheckup = await fotografieren(users.teamLead, { checkup: FLOTTE.checkup });
      const anDerBremse = await fotografieren(users.teamLead, { spot: FLOTTE.stelleBremse });
      const amRiemen = await fotografieren(users.teamLead, { spot: FLOTTE.stelleRiemen });
      const alle = [amCheckup, anDerBremse, amRiemen];

      // Solange Stellen und Sperre offen sind, fällt nichts (ANN-546).
      await asPostgres(
        "update public.fleet_checkups set checked_at = now() - interval '5 years' where id = $1",
        [FLOTTE.checkup],
      );
      await asPostgres(
        "update public.fleet_breakdowns set reported_at = now() - interval '5 years' where id = $1",
        [FLOTTE.panne],
      );
      await asPostgres('select public.apply_retention()');
      expect((await fotos()).sort()).toEqual(alle.map((v) => v.photo_id).sort());
      expect(await auftraege()).toEqual([]);

      // Freigegeben (Teamleitung) vor fünf Jahren: alles fällt, Fotos mit.
      await asUserCommitted(users.teamLead, 'select public.release_fleet_bike($1::uuid)', [
        FLOTTE.rad3,
      ]);
      await asPostgres(
        "update public.fleet_spots set resolved_at = now() - interval '5 years' where bike_id = $1",
        [FLOTTE.rad3],
      );
      await asPostgres(
        `update public.fleet_blocks set blocked_at = now() - interval '6 years',
                released_at = now() - interval '5 years'
          where bike_id = $1`,
        [FLOTTE.rad3],
      );
      await asPostgres('select public.apply_retention()');

      expect(await fotos()).toEqual([]);
      const { rows: stellen } = await asPostgres(
        'select id from public.fleet_spots where bike_id = $1',
        [FLOTTE.rad3],
      );
      expect(stellen).toEqual([]);
      // Ein zeitgesteuerter Lauf hat kein Konto: ordered_by bleibt leer.
      expect((await auftraege()).map((a) => a.object_key).sort()).toEqual(
        alle.map((v) => v.object_key).sort(),
      );
      expect((await auftraege()).every((a) => a.ordered_by === null)).toBe(true);

      // Der Lauf zählt, er nennt keine Schlüssel (ADR-017 Punkt 20).
      const { rows: lauf } = await asPostgres<{ eintrag: string }>(
        `select row_to_json(a)::text as eintrag from public.audit_log a
          where action = 'retention.applied' order by occurred_at desc limit 1`,
      );
      for (const v of alle) {
        expect(lauf[0]!.eintrag).not.toContain(v.photo_id);
        expect(lauf[0]!.eintrag).not.toContain(v.object_key);
      }
    });

    it('verwirft unbestätigte Uploads nach 24 Stunden - nur der zeitgesteuerte Lauf (Punkt 7)', async () => {
      const { checkup, stelle } = await checkUp(users.teamLead);
      const alt = await vorbereiten(users.teamLead, { spot: stelle });
      await hochladen(users.teamLead, alt);
      const altOhneObjekt = await vorbereiten(users.teamLead, { spot: stelle });
      const frisch = await vorbereiten(users.teamLead, { spot: stelle });
      const fertig = await fotografieren(users.teamLead, { checkup });
      await aufgenommenVor(alt.photo_id, '25 hours');
      await aufgenommenVor(altOhneObjekt.photo_id, '25 hours');
      await aufgenommenVor(fertig.photo_id, '25 hours');

      for (const konto of [users.ownerTherapist, users.teamLead]) {
        expect(
          await meldung(asUser(konto, 'select public.discard_stale_fleet_photo_uploads()')),
          konto,
        ).toMatch(/permission denied/i);
      }
      expect(await meldung(asAnon('select public.discard_stale_fleet_photo_uploads()'))).toMatch(
        /permission denied/i,
      );

      const { rows } = await asPostgres<{ n: number }>(
        'select public.discard_stale_fleet_photo_uploads() as n',
      );
      expect(rows[0]!.n).toBe(2);
      expect((await fotos()).sort()).toEqual([fertig.photo_id, frisch.photo_id].sort());
      expect(await auftraege()).toEqual([{ object_key: alt.object_key, ordered_by: null }]);
    });
  });

  describe('Abgleich (ADR-017 Punkt 27)', () => {
    const ZAEHLEN = 'select public.count_orphaned_patient_file_objects() as anzahl';
    const VORMERKEN = 'select public.order_orphaned_object_deletion() as anzahl';

    async function ablegen(schluessel: string): Promise<void> {
      await asPostgres(
        `insert into storage.objects (bucket_id, name, metadata)
         values ('radflotte', $1, '{}'::jsonb)`,
        [schluessel],
      );
    }

    it('zählt ein Objekt ohne Zeile im Bucket der Fotos und merkt es über denselben Weg vor', async () => {
      const { stelle } = await checkUp(users.teamLead);
      const schluessel = `${organizationId}/${stelle}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
      await ablegen(schluessel);
      // Ein Objekt einer fremden Organisation zählt nicht mit.
      await ablegen('22222222-2222-4222-8222-0000000000ff/x/y');

      const vorher = await asUser<{ anzahl: number }>(users.ownerTherapist, ZAEHLEN);
      expect(vorher.rows[0]!.anzahl).toBe(1);

      const vorgemerkt = await asUserCommitted<{ anzahl: number }>(users.ownerTherapist, VORMERKEN);
      expect(vorgemerkt.rows[0]!.anzahl).toBe(1);
      expect(await auftraege()).toEqual([
        { object_key: schluessel, ordered_by: users.ownerTherapist },
      ]);

      // Danach ist nichts mehr verwaist - es ist in Arbeit; ein zweites Mal nicht.
      const nachher = await asUser<{ anzahl: number }>(users.ownerTherapist, ZAEHLEN);
      expect(nachher.rows[0]!.anzahl).toBe(0);
      const zweiter = await asUserCommitted<{ anzahl: number }>(users.ownerTherapist, VORMERKEN);
      expect(zweiter.rows[0]!.anzahl).toBe(0);
    });

    it('ein Objekt mit Zeile ist nicht verwaist - fertig oder noch vorbereitet', async () => {
      const { checkup, stelle } = await checkUp(users.teamLead);
      await fotografieren(users.teamLead, { spot: stelle });
      const offen = await vorbereiten(users.teamLead, { checkup });
      await hochladen(users.teamLead, offen);

      const { rows } = await asUser<{ anzahl: number }>(users.ownerTherapist, ZAEHLEN);
      expect(rows[0]!.anzahl).toBe(0);
      const vorgemerkt = await asUserCommitted<{ anzahl: number }>(users.ownerTherapist, VORMERKEN);
      expect(vorgemerkt.rows[0]!.anzahl).toBe(0);
      expect(await auftraege()).toEqual([]);
    });
  });
});

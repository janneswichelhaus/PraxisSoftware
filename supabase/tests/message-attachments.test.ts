import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asServiceRole,
  asStorageApi,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { gleichzeitig } from './helpers/gleichzeitig';
import { praxistag } from './helpers/plaene';

/**
 * Foto und Video an einer Rückfrage (KOM-005, ADR-017 Abschnitt L).
 *
 *   * Anhängen nur im Training und im Nachsorge-Abo, nie während der
 *     Behandlung, nie durch die Begleitung (Punkt 59, ANN-332).
 *   * Nur mit eigener Einwilligung; der Widerruf löscht sofort alles
 *     (Punkt 61), unter Legal Hold gesperrt (ANN-335).
 *   * Höchstens drei je Vorgang, JPEG oder Video ohne Ton bis 30 Sekunden,
 *     10 MB (Punkte 59, 62, 63).
 *   * Zwei Phasen mit Bestätigung, einmalige Lesefreigabe, Löschauftrag
 *     (Punkte 7, 15, 25; ANN-052).
 *   * 30 Tage ab der Aufnahme (Punkt 65); Antwort mit Zeitmarke (Punkt 68).
 */

const { users, platformAccesses, organizationId, patients } = SEED;

const FRAGEN = 'select public.start_platform_message($1::uuid, $2, $3, null, null) as id';
const VORBEREITEN =
  'select * from public.prepare_message_attachment_upload($1::uuid, $2::uuid, $3, $4::bigint, $5, $6::integer)';
const BESTAETIGEN = 'select public.confirm_message_attachment_upload($1::uuid, $2::uuid)';
const EINWILLIGUNG =
  "select public.record_platform_consent($1::uuid, 'message_attachments', $2::boolean, '2026-10') as id";
const LESEN = 'select public.platform_messages($1::uuid) as daten';
const PRAXIS = 'select public.get_platform_message($1::uuid) as daten';
const VERWEIS_PLATTFORM =
  'select * from public.issue_platform_message_attachment_link($1::uuid, $2::uuid)';
const VERWEIS_PRAXIS = 'select * from public.issue_message_attachment_link($1::uuid)';
const LOESCHEN_PLATTFORM = 'select public.delete_platform_message_attachment($1::uuid, $2::uuid)';
const LOESCHEN_PRAXIS = 'select public.delete_message_attachment($1::uuid)';
const ANTWORTEN =
  'select public.answer_platform_message($1::uuid, $2, $3::uuid, $4::integer) as id';

const SUMME = 'c'.repeat(64);
const tina = { konto: users.plattformTina, zugang: platformAccesses.tinaTraining };
const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };
const paula = { konto: users.plattformPaula, zugang: platformAccesses.paulaBegleitungMax };

interface Vorbereitet {
  attachment_id: string;
  bucket_id: string;
  object_key: string;
}
interface Anhang {
  id: string;
  media_kind: string;
  duration_seconds: number | null;
  delete_on: string;
  author: string;
  server_verified: boolean;
  malware_scanned: boolean;
}
interface Ansicht {
  can_attach: boolean;
  attachment_consent: string | null;
  attachment_limit: number;
  messages: {
    id: string;
    attachment_count: number | null;
    attachments: Anhang[];
    entries: {
      side: string;
      attachment_id: string | null;
      attachment_mark_seconds: number | null;
    }[];
  }[];
}

async function fragen(wer: { konto: string; zugang: string }): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(wer.konto, FRAGEN, [
    wer.zugang,
    'organisational',
    'Ist das so richtig?',
  ]);
  return rows[0]!.id;
}

async function einwilligen(wer: { konto: string; zugang: string }, ja = true): Promise<void> {
  await asUserCommitted(wer.konto, EINWILLIGUNG, [wer.zugang, ja]);
}

async function vorbereiten(
  wer: { konto: string; zugang: string },
  vorgang: string,
  mime = 'video/webm',
  dauer: number | null = 12,
  groesse = 4_000_000,
): Promise<Vorbereitet> {
  const { rows } = await asUserCommitted<Vorbereitet>(wer.konto, VORBEREITEN, [
    wer.zugang,
    vorgang,
    mime,
    groesse,
    SUMME,
    dauer,
  ]);
  return rows[0]!;
}

/** Spielt nach, was die Storage-API beim Upload tut - mit der RLS der Person. */
async function hochladen(
  konto: string,
  v: Vorbereitet,
  mime = 'video/webm',
  groesse = 4_000_000,
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
async function anhaengen(
  wer: { konto: string; zugang: string },
  vorgang: string,
  mime = 'video/webm',
  dauer: number | null = 12,
): Promise<Vorbereitet> {
  const v = await vorbereiten(wer, vorgang, mime, dauer);
  await hochladen(wer.konto, v, mime);
  await asUserCommitted(wer.konto, BESTAETIGEN, [wer.zugang, v.attachment_id]);
  return v;
}

async function ansicht(wer: { konto: string; zugang: string }): Promise<Ansicht> {
  const { rows } = await asUser<{ daten: Ansicht }>(wer.konto, LESEN, [wer.zugang]);
  return rows[0]!.daten;
}

async function praxis(konto: string, vorgang: string) {
  const { rows } = await asUser<{
    daten: {
      attachments: { id: string; object_missing: boolean; delete_on: string }[];
      entries: { attachment_id: string | null; attachment_mark_seconds: number | null }[];
    };
  }>(konto, PRAXIS, [vorgang]);
  return rows[0]!.daten;
}

async function code(versuch: Promise<unknown>): Promise<string> {
  const fehler = await abgefangen(versuch);
  return fehler ? String((fehler as { code?: string }).code ?? fehler.message) : 'kein Fehler';
}

async function meldung(versuch: Promise<unknown>): Promise<string> {
  return (await abgefangen(versuch))?.message ?? 'kein Fehler';
}

/** Liest das Objekt mit der RLS des Kontos, wie die Storage-API beim Signieren. */
async function signieren(konto: string, objectKey: string): Promise<number> {
  const { rows } = await asStorageApi<{ n: number }>(
    konto,
    'storage.object.sign',
    `select count(*)::integer as n from storage.objects
     where bucket_id = 'rueckfrageanhang' and name = $1`,
    [objectKey],
  );
  return rows[0]!.n;
}

/** Verlegt die Aufnahme zurück - am Wächter vorbei, nur für den Test. */
async function aufgenommenVor(id: string, intervall: string): Promise<void> {
  await asPostgres(
    'alter table public.platform_message_attachments disable trigger platform_message_attachments_guard',
  );
  try {
    await asPostgres(
      'update public.platform_message_attachments set created_at = now() - $2::interval where id = $1',
      [id, intervall],
    );
  } finally {
    await asPostgres(
      'alter table public.platform_message_attachments enable trigger platform_message_attachments_guard',
    );
  }
}

/** Ein laufendes Nachsorge-Abo für Erika (Stufe 2). */
async function abo(): Promise<void> {
  await asPostgres(
    `insert into public.aftercare_subscriptions (organization_id, patient_id, starts_on, created_by)
     values ($1, $2, app.training_today($1) - 10, $3)`,
    [organizationId, patients.erika, users.office],
  );
}

describe('Foto und Video an einer Rückfrage (KOM-005)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('Training: mit Einwilligung angehängt, bestätigt, mit Löschdatum sichtbar', async () => {
    const vorgang = await fragen(tina);
    let daten = await ansicht(tina);
    expect(daten.can_attach).toBe(true);
    expect(daten.attachment_consent).toBe('open');
    expect(daten.attachment_limit).toBe(3);

    // Ohne Einwilligung kein Byte (Punkt 61).
    expect(await meldung(vorbereiten(tina, vorgang))).toContain('no consent');

    await einwilligen(tina);
    const v = await anhaengen(tina, vorgang);
    expect(v.bucket_id).toBe('rueckfrageanhang');
    expect(v.object_key).toBe(`${organizationId}/${vorgang}/${v.attachment_id}`);

    daten = await ansicht(tina);
    expect(daten.attachment_consent).toBe('granted');
    const anhang = daten.messages[0]!.attachments[0]!;
    expect(anhang).toEqual(
      expect.objectContaining({
        id: v.attachment_id,
        media_kind: 'video',
        duration_seconds: 12,
        author: 'you',
        server_verified: false,
        malware_scanned: false,
      }),
    );
    const { rows } = await asPostgres<{ soll: string }>(
      `select to_char((now() + interval '30 days') at time zone 'Europe/Berlin', 'YYYY-MM-DD') as soll`,
    );
    expect(anhang.delete_on).toBe(rows[0]!.soll);
    expect(daten.messages[0]!.attachment_count).toBe(1);

    // Ein Objektschlüssel steht in keiner Projektion (ANN-052).
    expect(JSON.stringify(daten)).not.toContain(v.object_key);
    const p = await praxis(users.trainer, vorgang);
    expect(p.attachments).toHaveLength(1);
    expect(p.attachments[0]!.object_missing).toBe(false);
    expect(JSON.stringify(p)).not.toContain(v.object_key);
  });

  it('erledigt die Praxis, während die Person bestätigt: „erledigt“ steht (BEF-132)', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const v = await vorbereiten(tina, vorgang);
    await hochladen(tina.konto, v);
    const fehler = await gleichzeitig(
      {
        konto: users.office,
        sql: 'select public.close_platform_message_by_practice($1::uuid)',
        params: [vorgang],
      },
      { konto: tina.konto, sql: BESTAETIGEN, params: [tina.zugang, v.attachment_id] },
    );
    expect(fehler).toMatchObject({ code: '22023', message: 'message is closed' });
    const { rows } = await asPostgres<{ vorgang: string; anhang: string }>(
      `select m.status as vorgang, x.status as anhang
         from public.platform_messages m
         join public.platform_message_attachments x on x.message_id = m.id
        where x.id = $1`,
      [v.attachment_id],
    );
    expect(rows).toEqual([{ vorgang: 'closed', anhang: 'pending' }]);
  });

  it('Behandlung: nur mit laufendem Nachsorge-Abo, nicht während der Behandlung (Punkt 59)', async () => {
    const vorgang = await fragen(erika);
    await einwilligen(erika);
    expect((await ansicht(erika)).can_attach).toBe(false);
    expect(await meldung(vorbereiten(erika, vorgang))).toContain('not offered');

    await abo();
    expect((await ansicht(erika)).can_attach).toBe(true);
    const v = await anhaengen(erika, vorgang, 'image/jpeg', null);
    expect((await ansicht(erika)).messages[0]!.attachments[0]!.media_kind).toBe('photo');
    // Die Praxis der Behandlung liest; das Büro auch (BEF-137).
    expect((await praxis(users.therapist, vorgang)).attachments[0]!.id).toBe(v.attachment_id);
    expect((await praxis(users.office, vorgang)).attachments).toHaveLength(1);
  });

  it('Schalter „Anhänge von außen aus“: kein Angebot, keine Vorbereitung, Vorhandenes bleibt (KOM-012, ANN-371)', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const vorher = await anhaengen(tina, vorgang);
    await abo();
    const frage = await fragen(erika);
    await einwilligen(erika);
    await asPostgres(
      'update public.organizations set external_attachments_enabled = false where id = $1',
      [organizationId],
    );
    // Training und Nachsorge-Abo: beide aus, gleich welche Stufe.
    expect((await ansicht(tina)).can_attach).toBe(false);
    expect((await ansicht(erika)).can_attach).toBe(false);
    expect(await meldung(vorbereiten(tina, vorgang))).toContain('not offered');
    expect(await code(vorbereiten(erika, frage))).toBe('42501');
    // Was schon da ist, bleibt bis zu seiner Frist sichtbar.
    expect((await ansicht(tina)).messages[0]!.attachments[0]!.id).toBe(vorher.attachment_id);
    // Eine neue Organisation hat ihn von selbst an (KOM-013, ADR-017 Fassung 6);
    // niemand ändert ihn über die Anwendung.
    const fremd = await fremdeOrganisation();
    const { rows } = await asPostgres<{ an: boolean; aendern: boolean; lesen: boolean }>(
      `select o.external_attachments_enabled as an,
              has_column_privilege('authenticated', 'public.organizations',
                                   'external_attachments_enabled', 'UPDATE') as aendern,
              has_function_privilege('authenticated', 'app.external_attachments_enabled(uuid)',
                                     'EXECUTE') as lesen
       from public.organizations o where o.id = $1`,
      [fremd.organizationId],
    );
    expect(rows).toEqual([{ an: true, aendern: false, lesen: false }]);
  });

  it('die Begleitung hängt nichts an und sieht nichts davon (Punkt 67)', async () => {
    const vorgang = await fragen(paula);
    const daten = await ansicht(paula);
    expect(daten.can_attach).toBe(false);
    expect(daten.attachment_consent).toBeNull();
    expect(daten.messages[0]!.attachment_count).toBeNull();
    expect(daten.messages[0]!.attachments).toEqual([]);
    expect(await code(vorbereiten(paula, vorgang))).toBe('42501');
  });

  it('Format, Dauer, Größe und höchstens drei je Vorgang (Punkte 59, 62, 63)', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    expect(await meldung(vorbereiten(tina, vorgang, 'video/webm', null))).toContain('too long');
    expect(await meldung(vorbereiten(tina, vorgang, 'video/webm', 31))).toContain('too long');
    expect(await meldung(vorbereiten(tina, vorgang, 'image/jpeg', 3))).toContain('no duration');
    expect(await meldung(vorbereiten(tina, vorgang, 'image/png', null))).toContain('unsupported');
    expect(await meldung(vorbereiten(tina, vorgang, 'video/quicktime', 5))).toContain(
      'unsupported',
    );
    expect(await meldung(vorbereiten(tina, vorgang, 'video/mp4', 5, 10_485_761))).toContain(
      'too large',
    );

    await anhaengen(tina, vorgang);
    await anhaengen(tina, vorgang, 'video/mp4', 30);
    // Auch eine vorbereitete, noch nicht bestätigte Zeile zählt.
    await vorbereiten(tina, vorgang, 'image/jpeg', null);
    expect(await meldung(vorbereiten(tina, vorgang, 'image/jpeg', null))).toContain('too many');
  });

  it('nicht an einem erledigten, fremden oder in der Lesefrist liegenden Vorgang', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    // Fremd: Erikas Training sieht Tinas Vorgang nicht.
    await asUserCommitted(
      users.plattformErika,
      "select public.record_platform_consent($1::uuid, 'message_attachments', true, '2026-10')",
      [platformAccesses.erikaTraining],
    );
    expect(
      await code(
        vorbereiten(
          { konto: users.plattformErika, zugang: platformAccesses.erikaTraining },
          vorgang,
        ),
      ),
    ).toBe('P0002');
    // Ein Praxiskonto ist kein Zugang.
    expect(await code(vorbereiten({ konto: users.trainer, zugang: tina.zugang }, vorgang))).toBe(
      '42501',
    );
    await asUserCommitted(tina.konto, 'select public.close_platform_message($1::uuid, $2::uuid)', [
      tina.zugang,
      vorgang,
    ]);
    expect(await meldung(vorbereiten(tina, vorgang))).toContain('closed');
  });

  it('Phase (c) prüft gegen das abgelegte Objekt; nur die eigene Zeile lädt hoch', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const v = await vorbereiten(tina, vorgang);

    // Ohne Objekt keine Bestätigung.
    expect(
      await meldung(asUserCommitted(tina.konto, BESTAETIGEN, [tina.zugang, v.attachment_id])),
    ).toContain('not uploaded');
    // Ein anderes Konto darf unter dem Schlüssel nicht ablegen (RLS).
    expect(await abgefangen(hochladen(users.plattformErika, v))).not.toBeNull();
    expect(await abgefangen(hochladen(users.trainer, v))).not.toBeNull();
    // Falsche Größe.
    await hochladen(tina.konto, v, 'video/webm', 123);
    expect(
      await meldung(asUserCommitted(tina.konto, BESTAETIGEN, [tina.zugang, v.attachment_id])),
    ).toContain('size');
    // Kein Überschreiben (keine UPDATE-Policy): verwerfen und neu.
    await asUserCommitted(
      tina.konto,
      'select public.discard_message_attachment_upload($1::uuid, $2::uuid)',
      [tina.zugang, v.attachment_id],
    );
    const { rows } = await asPostgres<{ n: number }>(
      `select count(*)::integer as n from public.storage_deletion_orders
       where bucket_id = 'rueckfrageanhang' and object_key = $1 and receipted_at is null`,
      [v.object_key],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('Ansehen nur gegen eine einmalige Freigabe; nie die Begleitung, nie ohne Leserecht', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const v = await anhaengen(tina, vorgang);

    // Den Schlüssel zu kennen genügt nicht.
    expect(await signieren(tina.konto, v.object_key)).toBe(0);
    await asUserCommitted(tina.konto, VERWEIS_PLATTFORM, [tina.zugang, v.attachment_id]);
    expect(await signieren(tina.konto, v.object_key)).toBe(1);
    expect(await signieren(tina.konto, v.object_key)).toBe(0);

    // Praxis: die Trainingsbetreuung ja, Therapeut:innen nicht (ADR-021 Punkt 6).
    await asUserCommitted(users.trainer, VERWEIS_PRAXIS, [v.attachment_id]);
    expect(await signieren(users.trainer, v.object_key)).toBe(1);
    expect(await code(asUserCommitted(users.therapist, VERWEIS_PRAXIS, [v.attachment_id]))).toBe(
      '42501',
    );
    // Ein fremder Zugang bekommt keine Freigabe.
    expect(
      await code(
        asUserCommitted(users.plattformErika, VERWEIS_PLATTFORM, [
          platformAccesses.erikaTraining,
          v.attachment_id,
        ]),
      ),
    ).toBe('42501');
  });

  it('eine andere Organisation sieht, öffnet und löscht nichts (ADR-003)', async () => {
    const fremd = await fremdeOrganisation();
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const v = await anhaengen(tina, vorgang);
    expect(await code(asUserCommitted(fremd.owner, VERWEIS_PRAXIS, [v.attachment_id]))).toBe(
      '42501',
    );
    expect(await code(asUserCommitted(fremd.owner, LOESCHEN_PRAXIS, [v.attachment_id]))).toBe(
      '42501',
    );
    expect(await code(asUser(fremd.owner, PRAXIS, [vorgang]))).toBe('P0002');
    expect(
      await code(asUserCommitted(fremd.owner, ANTWORTEN, [vorgang, 'Fremd', v.attachment_id, 1])),
    ).toBe('P0002');
    // Auch ohne Freigabe im Objektspeicher nichts.
    expect(await signieren(fremd.owner, v.object_key)).toBe(0);
  });

  it('die Begleitung bekommt auch in der Behandlung keine Freigabe', async () => {
    // Der Anhang entsteht direkt in der Datenbank - als hätte Max ihn angehängt.
    const vorgang = await fragen(paula);
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.platform_message_attachments
         (organization_id, message_id, media_kind, mime_type, byte_size, checksum_sha256, status,
          confirmed_at, author_kind, created_by)
       values ($1, $2, 'photo', 'image/jpeg', 1000, $3, 'ready', now(), 'self', $4)
       returning id`,
      [organizationId, vorgang, SUMME, users.plattformPaula],
    );
    expect(
      await code(asUserCommitted(paula.konto, VERWEIS_PLATTFORM, [paula.zugang, rows[0]!.id])),
    ).toBe('42501');
    expect((await praxis(users.therapist, vorgang)).attachments).toHaveLength(1);
  });

  it('Löschen: die Person jederzeit, die Praxis mit Antwortrecht - Journal und Auftrag', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const a = await anhaengen(tina, vorgang);
    const b = await anhaengen(tina, vorgang, 'image/jpeg', null);

    await asUserCommitted(tina.konto, LOESCHEN_PLATTFORM, [tina.zugang, a.attachment_id]);
    // Das Büro antwortet im Training nicht auf "Termin oder Rechnung"? Doch -
    // aber Therapeut:innen lesen dort nichts.
    expect(await code(asUserCommitted(users.therapist, LOESCHEN_PRAXIS, [b.attachment_id]))).toBe(
      '42501',
    );
    await asUserCommitted(users.trainer, LOESCHEN_PRAXIS, [b.attachment_id]);

    expect((await ansicht(tina)).messages[0]!.attachments).toEqual([]);
    const { rows } = await asPostgres<{ target_id: string; retention_class: string }>(
      `select target_id, retention_class from public.deletion_journal
       where target_table = 'platform_message_attachments' order by deleted_at`,
    );
    expect(rows.map((r) => r.target_id).sort()).toEqual([a.attachment_id, b.attachment_id].sort());
    expect(rows.every((r) => r.retention_class === 'rueckfrageanhang')).toBe(true);
    const { rows: auftraege } = await asPostgres<{ object_key: string; ordered_by: string }>(
      `select object_key, ordered_by from public.storage_deletion_orders
       where bucket_id = 'rueckfrageanhang' order by ordered_at`,
    );
    expect(auftraege).toEqual([
      { object_key: a.object_key, ordered_by: tina.konto },
      { object_key: b.object_key, ordered_by: users.trainer },
    ]);
    // Ein zweites Mal gibt es nicht.
    expect(
      await code(asUserCommitted(tina.konto, LOESCHEN_PLATTFORM, [tina.zugang, a.attachment_id])),
    ).toBe('42501');
  });

  it('der Widerruf löscht sofort alle Anhänge des Verhältnisses (Punkt 61)', async () => {
    const eins = await fragen(tina);
    const zwei = await fragen(tina);
    await einwilligen(tina);
    await anhaengen(tina, eins);
    await anhaengen(tina, zwei, 'image/jpeg', null);
    await einwilligen(tina, false);

    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::integer as n from public.platform_message_attachments',
    );
    expect(rows[0]!.n).toBe(0);
    const daten = await ansicht(tina);
    expect(daten.attachment_consent).toBe('withdrawn');
    expect(await meldung(vorbereiten(tina, eins))).toContain('no consent');
    const { rows: journal } = await asPostgres<{ n: number }>(
      `select count(*)::integer as n from public.deletion_journal
       where target_table = 'platform_message_attachments'`,
    );
    expect(journal[0]!.n).toBe(2);
  });

  it('die Akte vermerkt nur den Widerruf vom Papier - und er löscht ebenso (ANN-333)', async () => {
    await abo();
    const vorgang = await fragen(erika);
    const VERMERK =
      "select public.record_patient_privacy_entry($1::uuid, $2, 'message_attachments', null, $3::date) as id";
    // Der Tag des Vermerks ist der Praxistag wie bei der Einwilligung auf der
    // Plattform; der UTC-Tag läge zwischen 0 und 2 Uhr davor (BEF-164).
    const heute = await praxistag(0);
    expect(
      await meldung(
        asUserCommitted(users.office, VERMERK, [patients.erika, 'consent_granted', heute]),
      ),
    ).toContain('on the platform');
    expect(
      await meldung(
        asUserCommitted(users.office, VERMERK, [patients.erika, 'consent_refused', heute]),
      ),
    ).toContain('on the platform');

    await einwilligen(erika);
    await anhaengen(erika, vorgang, 'image/jpeg', null);
    await asUserCommitted(users.office, VERMERK, [
      patients.erika,
      'consent_withdrawn',
      await praxistag(0),
    ]);
    expect((await ansicht(erika)).messages[0]!.attachments).toEqual([]);
    expect((await ansicht(erika)).attachment_consent).toBe('withdrawn');
  });

  it('unter Legal Hold gesperrt statt gelöscht, danach vom Lauf gelöscht (ANN-335)', async () => {
    await abo();
    const vorgang = await fragen(erika);
    await einwilligen(erika);
    const v = await anhaengen(erika, vorgang);
    await asUserCommitted(users.ownerTherapist, 'select public.place_legal_hold($1::uuid, $2)', [
      patients.erika,
      'Probe',
    ]);
    await einwilligen(erika, false);

    const { rows } = await asPostgres<{ locked_at: string | null }>(
      'select locked_at from public.platform_message_attachments where id = $1',
      [v.attachment_id],
    );
    expect(rows[0]!.locked_at).not.toBeNull();
    expect((await ansicht(erika)).messages[0]!.attachments).toEqual([]);
    expect((await praxis(users.therapist, vorgang)).attachments).toEqual([]);
    expect(await code(asUserCommitted(users.therapist, VERWEIS_PRAXIS, [v.attachment_id]))).toBe(
      '42501',
    );

    await asPostgres('select public.apply_retention()');
    expect(
      (
        await asPostgres('select 1 from public.platform_message_attachments where id = $1', [
          v.attachment_id,
        ])
      ).rows,
    ).toHaveLength(1);

    await asPostgres('delete from public.legal_holds');
    await asPostgres('select public.apply_retention()');
    expect(
      (
        await asPostgres('select 1 from public.platform_message_attachments where id = $1', [
          v.attachment_id,
        ])
      ).rows,
    ).toHaveLength(0);
  });

  it('nach 30 Tagen löscht der Lauf; mit dem Vorgang fällt der Anhang (Punkt 65)', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const alt = await anhaengen(tina, vorgang);
    const neu = await anhaengen(tina, vorgang, 'image/jpeg', null);
    await aufgenommenVor(alt.attachment_id, '30 days 1 minute');
    // Abgelaufen ist schon vor dem Lauf nicht mehr sichtbar.
    expect((await ansicht(tina)).messages[0]!.attachments.map((x) => x.id)).toEqual([
      neu.attachment_id,
    ]);

    await asPostgres('select public.apply_retention()');
    const { rows } = await asPostgres<{ id: string }>(
      'select id from public.platform_message_attachments',
    );
    expect(rows.map((r) => r.id)).toEqual([neu.attachment_id]);
    const { rows: lauf } = await asPostgres<{ context: { rueckfrageanhang: number } }>(
      `select context from public.audit_log where action = 'retention.applied'
       order by occurred_at desc limit 1`,
    );
    expect(lauf[0]!.context.rueckfrageanhang).toBe(1);

    await asPostgres('delete from public.platform_messages where id = $1', [vorgang]);
    const { rows: auftraege } = await asPostgres<{ object_key: string }>(
      `select object_key from public.storage_deletion_orders where bucket_id = 'rueckfrageanhang'
       order by object_key`,
    );
    expect(auftraege.map((a) => a.object_key).sort()).toEqual(
      [alt.object_key, neu.object_key].sort(),
    );
  });

  it('die Wiederanwendung des Journals kennt die Anhänge', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const v = await anhaengen(tina, vorgang);
    await asUserCommitted(tina.konto, LOESCHEN_PLATTFORM, [tina.zugang, v.attachment_id]);
    // Nach einem Restore stünde die Zeile wieder da.
    await asPostgres(
      `insert into public.platform_message_attachments
         (id, organization_id, message_id, media_kind, mime_type, byte_size, duration_seconds,
          checksum_sha256, status, confirmed_at, author_kind, created_by)
       values ($1, $2, $3, 'video', 'video/webm', 4000000, 12, $4, 'ready', now(), 'self', $5)`,
      [v.attachment_id, organizationId, vorgang, SUMME, tina.konto],
    );
    await asPostgres('select public.reapply_deletion_journal()');
    expect(
      (
        await asPostgres('select 1 from public.platform_message_attachments where id = $1', [
          v.attachment_id,
        ])
      ).rows,
    ).toHaveLength(0);
  });

  it('Antwort mit Zeitmarke: nur in einem Video dieses Vorgangs, innerhalb seiner Dauer (Punkt 68)', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const video = await anhaengen(tina, vorgang, 'video/webm', 12);
    const foto = await anhaengen(tina, vorgang, 'image/jpeg', null);

    expect(
      await meldung(
        asUserCommitted(users.trainer, ANTWORTEN, [vorgang, 'Bei 0:13', video.attachment_id, 13]),
      ),
    ).toContain('outside');
    expect(
      await meldung(
        asUserCommitted(users.trainer, ANTWORTEN, [vorgang, 'Hier', foto.attachment_id, 1]),
      ),
    ).toContain('not found');
    expect(
      await meldung(
        asUserCommitted(users.trainer, ANTWORTEN, [vorgang, 'Hier', video.attachment_id, null]),
      ),
    ).toContain('mark');
    // Ohne Marke wie bisher.
    await asUserCommitted(users.trainer, ANTWORTEN, [vorgang, 'Danke!', null, null]);
    await asUserCommitted(users.trainer, ANTWORTEN, [
      vorgang,
      'Bei 0:07 kippt das Knie nach innen.',
      video.attachment_id,
      7,
    ]);

    let daten = await ansicht(tina);
    const marke = daten.messages[0]!.entries.at(-1)!;
    expect(marke).toEqual(
      expect.objectContaining({ attachment_id: video.attachment_id, attachment_mark_seconds: 7 }),
    );

    // Fällt das Video, bleibt der Eintrag - mit der Zahl, ohne Verweis.
    await asUserCommitted(tina.konto, LOESCHEN_PLATTFORM, [tina.zugang, video.attachment_id]);
    daten = await ansicht(tina);
    expect(daten.messages[0]!.entries.at(-1)).toEqual(
      expect.objectContaining({ attachment_id: null, attachment_mark_seconds: 7 }),
    );
    expect((await praxis(users.trainer, vorgang)).entries.at(-1)).toEqual(
      expect.objectContaining({ attachment_id: null, attachment_mark_seconds: 7 }),
    );
  });

  it('Prüfung am Server: bestanden heißt geprüft, ein Befund verwirft (Punkte 49, 52)', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const gut = await anhaengen(tina, vorgang);
    const schlecht = await anhaengen(tina, vorgang, 'video/mp4', 8);

    const { rows: ankuendigung } = await asServiceRole<{ bucket_id: string; object_key: string }>(
      'select * from public.message_attachment_for_verification($1::uuid, $2::uuid)',
      [gut.attachment_id, tina.konto],
    );
    expect(ankuendigung[0]).toEqual(expect.objectContaining({ object_key: gut.object_key }));
    // Nur für das Konto, das angehängt hat.
    const { rows: fremd } = await asServiceRole(
      'select * from public.message_attachment_for_verification($1::uuid, $2::uuid)',
      [gut.attachment_id, users.trainer],
    );
    expect(fremd).toEqual([]);

    const ergebnis = async (id: string, tonOk: boolean) =>
      (
        await asServiceRole<{ r: string }>(
          'select public.record_message_attachment_verification($1::uuid, true, true, true, $2) as r',
          [id, tonOk],
        )
      ).rows[0]!.r;
    expect(await ergebnis(gut.attachment_id, true)).toBe('passed');
    expect(await ergebnis(gut.attachment_id, true)).toBe('already_verified');
    // Eine Tonspur ist ein Befund (Punkt 63).
    expect(await ergebnis(schlecht.attachment_id, false)).toBe('rejected');

    const daten = await ansicht(tina);
    expect(daten.messages[0]!.attachments.map((x) => [x.id, x.server_verified])).toEqual([
      [gut.attachment_id, true],
    ]);
    // Kein neues Auditereignis (ANN-334).
    const { rows: audit } = await asPostgres<{ n: number }>(
      `select count(*)::integer as n from public.audit_log where subject_id = $1`,
      [schlecht.attachment_id],
    );
    expect(audit[0]!.n).toBe(0);
    // Für die Anwendung gesperrt.
    expect(
      await code(
        asUser(
          tina.konto,
          'select public.record_message_attachment_verification($1::uuid, true, true, true, true)',
          [gut.attachment_id],
        ),
      ),
    ).toBe('42501');
  });

  it('ist ein Schalter scharf, wartet der Anhang auf das Ergebnis (Punkte 51, 69)', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    await asPostgres(
      `create or replace function app.message_attachment_scan_required() returns boolean
       language sql immutable set search_path = '' as $$ select true $$`,
    );
    try {
      const v = await anhaengen(tina, vorgang);
      const { rows } = await asPostgres<{
        status: string;
        confirmation_requested_at: string | null;
      }>(
        'select status, confirmation_requested_at from public.platform_message_attachments where id = $1',
        [v.attachment_id],
      );
      expect(rows[0]!.status).toBe('pending');
      expect(rows[0]!.confirmation_requested_at).not.toBeNull();
      expect((await ansicht(tina)).messages[0]!.attachments).toEqual([]);
      // Die Prüfung am Inhalt allein macht ihn nicht sichtbar.
      await asServiceRole(
        'select public.record_message_attachment_verification($1::uuid, true, true, true, true)',
        [v.attachment_id],
      );
      expect((await ansicht(tina)).messages[0]!.attachments).toEqual([]);
    } finally {
      await asPostgres(
        `create or replace function app.message_attachment_scan_required() returns boolean
         language sql immutable set search_path = '' as $$ select false $$`,
      );
    }
  });

  it('unbestätigte Uploads verfallen nach 24 Stunden', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const v = await vorbereiten(tina, vorgang);
    await aufgenommenVor(v.attachment_id, '25 hours');
    const { rows } = await asPostgres<{ n: number }>(
      'select public.discard_stale_message_attachment_uploads() as n',
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('ein Anhang ist unveränderlich (Punkt 8)', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const v = await anhaengen(tina, vorgang);
    expect(
      await meldung(
        asPostgres('update public.platform_message_attachments set byte_size = 1 where id = $1', [
          v.attachment_id,
        ]),
      ),
    ).toContain('immutable');
  });

  // ---------------------------------------------------------------------------
  // Aus dem Zweitreview (S1, S3, H4)
  // ---------------------------------------------------------------------------

  it('ein Anhang an einer beantworteten Frage gibt sie der Praxis zurück (S1)', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    await asUserCommitted(users.trainer, ANTWORTEN, [vorgang, 'Bitte filmen.', null, null]);
    let { rows } = await asPostgres<{ status: string; due_on: string | null }>(
      'select status, due_on from public.platform_messages where id = $1',
      [vorgang],
    );
    expect(rows[0]).toEqual({ status: 'answered', due_on: null });
    await anhaengen(tina, vorgang);
    ({ rows } = await asPostgres<{ status: string; due_on: string | null }>(
      'select status, due_on from public.platform_messages where id = $1',
      [vorgang],
    ));
    expect(rows[0]!.status).toBe('open');
    expect(rows[0]!.due_on).not.toBeNull();
  });

  it('die Trainingsbetreuung sieht keine Anhänge der Behandlung (§4.8)', async () => {
    await abo();
    const vorgang = await fragen(erika);
    await einwilligen(erika);
    const v = await anhaengen(erika, vorgang);
    expect(await code(asUserCommitted(users.trainer, VERWEIS_PRAXIS, [v.attachment_id]))).toBe(
      '42501',
    );
    expect(await code(asUserCommitted(users.trainer, LOESCHEN_PRAXIS, [v.attachment_id]))).toBe(
      '42501',
    );
    expect(
      await code(asUserCommitted(users.trainer, ANTWORTEN, [vorgang, 'x', v.attachment_id, 1])),
    ).toBe('P0002');
  });

  it('lesen ja, löschen nein: das Büro bei Beschwerden (Punkt 67)', async () => {
    await abo();
    const { rows } = await asUserCommitted<{ id: string }>(
      erika.konto,
      "select public.start_platform_message($1::uuid, 'complaint', $2, null, null) as id",
      [erika.zugang, 'Das Knie schmerzt beim Treppensteigen.'],
    );
    const vorgang = rows[0]!.id;
    await einwilligen(erika);
    const v = await anhaengen(erika, vorgang, 'image/jpeg', null);
    await asUserCommitted(users.office, VERWEIS_PRAXIS, [v.attachment_id]);
    expect(
      await meldung(asUserCommitted(users.office, LOESCHEN_PRAXIS, [v.attachment_id])),
    ).toContain('not allowed to delete');
  });

  it('Plattformkonten rufen keine Praxiswege, Praxiskonten keine Plattformwege', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const v = await anhaengen(tina, vorgang);
    expect(await code(asUserCommitted(tina.konto, VERWEIS_PRAXIS, [v.attachment_id]))).toBe(
      '42501',
    );
    expect(await code(asUserCommitted(tina.konto, LOESCHEN_PRAXIS, [v.attachment_id]))).toBe(
      '42501',
    );
    expect(await code(asUser(tina.konto, PRAXIS, [vorgang]))).toBe('42501');
    expect(
      await code(asUserCommitted(users.trainer, VERWEIS_PLATTFORM, [tina.zugang, v.attachment_id])),
    ).toBe('42501');
    expect(
      await code(
        asUserCommitted(users.trainer, LOESCHEN_PLATTFORM, [tina.zugang, v.attachment_id]),
      ),
    ).toBe('42501');
    const offen = await vorbereiten(tina, vorgang, 'image/jpeg', null);
    expect(
      await code(asUserCommitted(users.trainer, BESTAETIGEN, [tina.zugang, offen.attachment_id])),
    ).toBe('42501');
    expect(
      await code(
        asUserCommitted(
          users.trainer,
          'select public.discard_message_attachment_upload($1::uuid, $2::uuid)',
          [tina.zugang, offen.attachment_id],
        ),
      ),
    ).toBe('42501');
  });

  it('die rechtliche Vertretung hängt an, mit ihrem Namen; die Person sieht es', async () => {
    await abo();
    const BERND = 'cafecafe-cafe-4afe-8afe-0000000000e1';
    const KONTO = '99999999-9999-4999-8999-0000000000e1';
    await asPostgres(
      `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', 'bernd.anhang@patient.invalid')`,
      [KONTO],
    );
    await asPostgres(
      `insert into public.platform_accesses
         (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
          status, activated_at, access_kind, legal_basis, representative_name, proof_documents,
          health_scope, finance_scope, proof_recorded_by, proof_recorded_at, created_by)
       values ($1, $2, 'treatment', $3, $3, $4, 'active', now(), 'legal_representative',
               'guardianship', 'Bernd Betreuer', array['identity_document', 'guardianship_certificate'],
               true, false, $5, now(), $5)`,
      [BERND, organizationId, patients.erika, KONTO, users.office],
    );
    const bernd = { konto: KONTO, zugang: BERND };
    const vorgang = await fragen(bernd);
    await einwilligen(bernd);
    const v = await anhaengen(bernd, vorgang, 'image/jpeg', null);
    const vonErika = (await ansicht(erika)).messages[0]!.attachments[0]!;
    expect(vonErika).toEqual(
      expect.objectContaining({ id: v.attachment_id, author: 'representative' }),
    );
    await asUserCommitted(bernd.konto, LOESCHEN_PLATTFORM, [bernd.zugang, v.attachment_id]);
    expect((await ansicht(erika)).messages[0]!.attachments).toEqual([]);
  });

  it('der Objektspeicher: kein Upload nach der Bestätigung, nach 24 Stunden oder als Begleitung; kein direktes Löschen', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const v = await anhaengen(tina, vorgang);
    // Nach der Bestätigung: kein zweites Objekt unter dem Schlüssel.
    await asPostgres("delete from storage.objects where bucket_id = 'rueckfrageanhang'");
    expect(await abgefangen(hochladen(tina.konto, v))).not.toBeNull();
    // Älter als 24 Stunden.
    const alt = await vorbereiten(tina, vorgang, 'image/jpeg', null);
    await aufgenommenVor(alt.attachment_id, '25 hours');
    expect(await abgefangen(hochladen(tina.konto, alt, 'image/jpeg'))).not.toBeNull();
    // Direktes Löschen der Person am Objektspeicher: nichts.
    const neu = await vorbereiten(tina, vorgang, 'image/jpeg', null);
    await hochladen(tina.konto, neu, 'image/jpeg');
    await asStorageApi(
      tina.konto,
      'storage.object.delete',
      "delete from storage.objects where bucket_id = 'rueckfrageanhang' and name = $1",
      [neu.object_key],
    );
    const { rows } = await asPostgres<{ n: number }>(
      "select count(*)::integer as n from storage.objects where bucket_id = 'rueckfrageanhang' and name = $1",
      [neu.object_key],
    );
    expect(rows[0]!.n).toBe(1);
    // Die Begleitung hat keinen Weg zu einer vorbereiteten Zeile.
    expect(await abgefangen(hochladen(paula.konto, neu, 'image/jpeg'))).not.toBeNull();
  });

  it('unter Legal Hold sperrt auch das Löschen und ein Befund; gesperrte zählen nicht (H4)', async () => {
    await abo();
    const vorgang = await fragen(erika);
    await einwilligen(erika);
    const a = await anhaengen(erika, vorgang);
    const b = await anhaengen(erika, vorgang, 'image/jpeg', null);
    const c = await anhaengen(erika, vorgang, 'image/jpeg', null);
    await asUserCommitted(users.ownerTherapist, 'select public.place_legal_hold($1::uuid, $2)', [
      patients.erika,
      'Probe',
    ]);
    await asUserCommitted(erika.konto, LOESCHEN_PLATTFORM, [erika.zugang, a.attachment_id]);
    await asUserCommitted(users.therapist, LOESCHEN_PRAXIS, [b.attachment_id]);
    await asServiceRole(
      'select public.record_message_attachment_verification($1::uuid, false, true, true, true)',
      [c.attachment_id],
    );
    const { rows } = await asPostgres<{ id: string; locked: boolean }>(
      'select id, locked_at is not null as locked from public.platform_message_attachments order by id',
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.locked)).toBe(true);
    expect((await ansicht(erika)).messages[0]!.attachment_count).toBe(0);
    // Gesperrte belegen keinen Platz.
    await anhaengen(erika, vorgang, 'image/jpeg', null);
  });
});

/**
 * Herausgabe an die Person (BEF-188, ADR-017 Punkt 96, ANN-672): owner gibt
 * jeden bestätigten Anhang als Kopie heraus, auch einen gesperrten; jede
 * Kopie steht als `message_attachment.handed_out` im Protokoll und in der
 * nächsten Auskunft.
 */
describe('Herausgabe der Anhänge an die Person (BEF-188)', () => {
  const LISTE =
    'select * from public.list_message_attachments_for_access_request($1, $2::uuid) order by taken_at';
  const HERAUSGEBEN = 'select * from public.hand_out_message_attachment($1::uuid)';

  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function gesperrterAnhang(): Promise<{ vorgang: string; v: Vorbereitet }> {
    await abo();
    const vorgang = await fragen(erika);
    await einwilligen(erika);
    const v = await anhaengen(erika, vorgang, 'image/jpeg', null);
    await asUserCommitted(users.ownerTherapist, 'select public.place_legal_hold($1::uuid, $2)', [
      patients.erika,
      'Probe',
    ]);
    await einwilligen(erika, false);
    return { vorgang, v };
  }

  it('owner gibt einen gesperrten Anhang heraus, einmal je Freigabe, protokolliert', async () => {
    const { v } = await gesperrterAnhang();

    const { rows: liste } = await asUser<{ id: string; locked: boolean; object_missing: boolean }>(
      users.ownerTherapist,
      LISTE,
      ['treatment', patients.erika],
    );
    expect(liste).toEqual([
      expect.objectContaining({ id: v.attachment_id, locked: true, object_missing: false }),
    ]);

    // Ansehen bleibt gesperrt (Punkt 54); die Herausgabe nicht.
    expect(
      await code(asUserCommitted(users.ownerTherapist, VERWEIS_PRAXIS, [v.attachment_id])),
    ).toBe('42501');
    expect(await signieren(users.ownerTherapist, v.object_key)).toBe(0);

    const { rows } = await asUserCommitted<{ bucket_id: string; object_key: string }>(
      users.ownerTherapist,
      HERAUSGEBEN,
      [v.attachment_id],
    );
    expect(rows[0]).toMatchObject({ bucket_id: 'rueckfrageanhang', object_key: v.object_key });
    // Eine Freigabe, eine Operation - und nur für das eigene Konto.
    expect(await signieren(users.therapist, v.object_key)).toBe(0);
    expect(await signieren(users.ownerTherapist, v.object_key)).toBe(1);
    expect(await signieren(users.ownerTherapist, v.object_key)).toBe(0);

    const { rows: protokoll } = await asPostgres<{
      action: string;
      subject_type: string;
      subject_id: string;
      context: Record<string, unknown>;
    }>(
      `select action, subject_type, subject_id, context from public.audit_log
        where action = 'message_attachment.handed_out'`,
    );
    expect(protokoll).toEqual([
      {
        action: 'message_attachment.handed_out',
        subject_type: 'platform_message_attachment',
        subject_id: v.attachment_id,
        context: {
          surface: 'web',
          patient_id: patients.erika,
          media_kind: 'photo',
          gesperrt: true,
        },
      },
    ]);

    // Die nächste Auskunft nennt die Herausgabe.
    const { rows: auskunft } = await asUser<{
      daten: { tabellen: { access_log: { aktion: string; gegenstand: string }[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.erika,
    ]);
    expect(auskunft[0]!.daten.tabellen.access_log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aktion: 'message_attachment.handed_out',
          gegenstand: 'platform_message_attachment',
        }),
      ]),
    );
  });

  it('nur owner: Therapeut:in, Büro und Trainingsbetreuung weder Liste noch Kopie', async () => {
    const { v } = await gesperrterAnhang();
    for (const wer of [users.therapist, users.office, users.trainer, users.teamLead]) {
      expect(await code(asUser(wer, LISTE, ['treatment', patients.erika]))).toBe('42501');
      expect(await code(asUserCommitted(wer, HERAUSGEBEN, [v.attachment_id]))).toBe('42501');
    }
    // Plattformkonten ebenso wenig, auch die Person selbst nicht über diesen Weg.
    expect(await code(asUserCommitted(erika.konto, HERAUSGEBEN, [v.attachment_id]))).toBe('42501');
    const { rows } = await asPostgres(
      "select 1 from public.audit_log where action = 'message_attachment.handed_out'",
    );
    expect(rows).toHaveLength(0);
  });

  it('eine andere Organisation gibt nichts heraus und erfährt nichts (ADR-003)', async () => {
    const fremd = await fremdeOrganisation();
    const { v } = await gesperrterAnhang();
    expect(await code(asUserCommitted(fremd.owner, HERAUSGEBEN, [v.attachment_id]))).toBe('42501');
    expect(await code(asUser(fremd.owner, LISTE, ['treatment', patients.erika]))).toBe('42501');
    expect(await signieren(fremd.owner, v.object_key)).toBe(0);
  });

  it('Training: ein sichtbarer Anhang, die Auskunft zum Verhältnis nennt die Kopie', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const v = await anhaengen(tina, vorgang);

    const { rows: liste } = await asUser<{ id: string; locked: boolean; media_kind: string }>(
      users.ownerTherapist,
      LISTE,
      ['training', SEED.trainingRelationships.tina],
    );
    expect(liste).toEqual([
      expect.objectContaining({ id: v.attachment_id, locked: false, media_kind: 'video' }),
    ]);
    // Die Akte einer anderen Person führt diesen Anhang nicht.
    expect((await asUser(users.ownerTherapist, LISTE, ['treatment', patients.erika])).rows).toEqual(
      [],
    );

    await asUserCommitted(users.ownerTherapist, HERAUSGEBEN, [v.attachment_id]);
    expect(await signieren(users.ownerTherapist, v.object_key)).toBe(1);

    const { rows: protokoll } = await asPostgres<{ context: Record<string, unknown> }>(
      "select context from public.audit_log where action = 'message_attachment.handed_out'",
    );
    expect(protokoll[0]!.context).toEqual({
      surface: 'web',
      training_relationship_id: SEED.trainingRelationships.tina,
      media_kind: 'video',
      gesperrt: false,
    });

    const { rows: auskunft } = await asUser<{
      daten: { tabellen: { access_log: { aktion: string }[] } };
    }>(users.ownerTherapist, 'select public.export_training_record($1::uuid) as daten', [
      SEED.trainingRelationships.tina,
    ]);
    expect(auskunft[0]!.daten.tabellen.access_log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ aktion: 'message_attachment.handed_out' }),
      ]),
    );
  });

  it('nichts Unbestätigtes; eine falsche Art des Verhältnisses wird abgewiesen', async () => {
    const vorgang = await fragen(tina);
    await einwilligen(tina);
    const v = await vorbereiten(tina, vorgang);
    await hochladen(tina.konto, v);
    expect(
      (await asUser(users.ownerTherapist, LISTE, ['training', SEED.trainingRelationships.tina]))
        .rows,
    ).toEqual([]);
    expect(await code(asUserCommitted(users.ownerTherapist, HERAUSGEBEN, [v.attachment_id]))).toBe(
      '42501',
    );
    expect(
      await code(asUser(users.ownerTherapist, LISTE, ['other', SEED.trainingRelationships.tina])),
    ).toBe('42501');
  });

  it('eine Freigabe zum Ansehen öffnet keinen gesperrten Anhang (Punkt 54)', async () => {
    await abo();
    const vorgang = await fragen(erika);
    await einwilligen(erika);
    const v = await anhaengen(erika, vorgang, 'image/jpeg', null);
    // Freigabe zum Ansehen, solange sichtbar - dann gesperrt.
    await asUserCommitted(users.ownerTherapist, VERWEIS_PRAXIS, [v.attachment_id]);
    await asUserCommitted(users.ownerTherapist, 'select public.place_legal_hold($1::uuid, $2)', [
      patients.erika,
      'Probe',
    ]);
    await einwilligen(erika, false);
    expect(await signieren(users.ownerTherapist, v.object_key)).toBe(0);
  });
});

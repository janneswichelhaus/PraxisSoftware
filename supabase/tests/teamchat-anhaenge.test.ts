import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asServiceRole,
  asStorageApi,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { gleichzeitig } from './helpers/gleichzeitig';

/**
 * Anhänge im Teamchat (TEAM-003, ADR-017 Fassung 8, Abschnitt M) und
 * Sprachnachrichten (TEAM-004, Fassung 9, Abschnitt N).
 *
 * Fotos (JPEG, PNG) und PDF an einer Nachricht, bis zu fünf, ohne
 * Virenprüfung. Geprüft werden der Weg jeder Datei (Phase a und c, einmalige
 * Lesefreigabe, Speicherregeln), das Binden beim Senden, die Rechte (ADR-013
 * Punkt 9 Nr. 1: andere Organisation, Konto ohne Praxisrolle, Plattformkonto,
 * ohne Sitzung, wer nicht Mitglied ist, Tabellenrechte), der Löschpfad (mit
 * der Nachricht, ihrem Inhalt, dem Gespräch und der Frist, jeweils mit
 * Löschauftrag; ungesendete nach 24 Stunden; nach einem Restore erneut), die
 * Prüfung am Server, der Abgleich und Rennen zwischen zwei Verbindungen.
 */

const { users, organizationId } = SEED;

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
  tom: '55555555-5555-4555-8555-000000000006',
} as const;

const SUMME = 'a'.repeat(64);
const GROESSE = 2048;

const VORBEREITEN =
  'select * from public.prepare_team_attachment_upload($1::uuid, $2, $3::bigint, $4, $5)';
// TEAM-004: mit der Dauer einer Sprachnachricht (ANN-655).
const VORBEREITEN_MIT_DAUER =
  'select * from public.prepare_team_attachment_upload($1::uuid, $2, $3::bigint, $4, $5, $6::integer)';
const BESTAETIGEN = 'select public.confirm_team_attachment_upload($1::uuid)';
const VERWERFEN = 'select public.discard_team_attachment($1::uuid)';
const VERWEIS = 'select * from public.issue_team_attachment_link($1::uuid)';
const DATEIEN = 'select * from public.list_team_channel_attachments($1::uuid)';
const SENDEN =
  'select public.post_team_message($1::uuid, $2::uuid, $3, $4::uuid[], $5::uuid, false, false, $6::timestamptz, $7::uuid[]) as id';
const BEARBEITEN = 'select public.edit_team_message($1::uuid, $2)';
const LOESCHEN = 'select public.delete_team_message($1::uuid)';
const NACHRICHTEN = 'select * from public.list_team_messages($1::uuid, $2::uuid)';
const KANAL_ANLEGEN = 'select public.create_team_channel($1, $2, $3::boolean, $4::uuid[]) as id';
const DIREKT = 'select public.open_team_direct($1::uuid) as id';
const VERLASSEN = 'select public.leave_team_channel($1::uuid)';
const GRUPPE = 'select public.open_team_group($1::uuid[]) as id';

interface Vorbereitet {
  attachment_id: string;
  bucket_id: string;
  object_key: string;
}

interface Anhang {
  id: string;
  name: string;
  mime_type: string;
  byte_size: number;
  verified: boolean;
  duration_seconds: number | null;
}

interface Nachricht {
  id: string;
  body: string | null;
  removed_kind: string | null;
  attachments: Anhang[];
}

async function code(versprechen: Promise<unknown>): Promise<string | undefined> {
  try {
    await versprechen;
    return undefined;
  } catch (cause) {
    return (cause as { code?: string }).code ?? 'ohne Code';
  }
}

async function anzahl(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await asPostgres<{ n: string }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

async function kanal(konto: string, name: string): Promise<string> {
  const { rows } = await asUser<{ id: string; name: string | null }>(
    konto,
    'select id, name from public.list_team_channels()',
  );
  const treffer = rows.find((k) => k.name === name);
  if (!treffer) throw new Error(`Kanal ${name} fehlt`);
  return treffer.id;
}

async function fleet(): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `select id from public.team_channels where organization_id = $1 and kind = 'fleet'`,
    [organizationId],
  );
  return rows[0]!.id;
}

async function vorbereiten(
  konto: string,
  kanalId: string,
  optionen: { mime?: string; groesse?: number; name?: string; summe?: string } = {},
): Promise<Vorbereitet> {
  const { rows } = await asUserCommitted<Vorbereitet>(konto, VORBEREITEN, [
    kanalId,
    optionen.mime ?? 'image/jpeg',
    optionen.groesse ?? GROESSE,
    optionen.summe ?? SUMME,
    optionen.name ?? 'Foto Rad.jpg',
  ]);
  return rows[0]!;
}

/** Spielt nach, was die Storage-API beim Upload tut - mit der RLS des Kontos. */
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

/** Der ganze Weg einer Sprachnachricht vor dem Senden (TEAM-004). */
async function sprachnachricht(
  konto: string,
  kanalId: string,
  dauer = 42,
  mime = 'audio/webm',
): Promise<Vorbereitet> {
  const { rows } = await asUserCommitted<Vorbereitet>(konto, VORBEREITEN_MIT_DAUER, [
    kanalId,
    mime,
    GROESSE,
    SUMME,
    'Sprachnachricht 18.10., 14:05',
    dauer,
  ]);
  const v = rows[0]!;
  await hochladen(konto, v, GROESSE, mime);
  await asUserCommitted(konto, BESTAETIGEN, [v.attachment_id]);
  return v;
}

/** Der ganze Weg vor dem Senden: vorbereiten, hochladen, bestätigen. */
async function anhang(
  konto: string,
  kanalId: string,
  mime = 'image/jpeg',
  name = 'Foto Rad.jpg',
): Promise<Vorbereitet> {
  const v = await vorbereiten(konto, kanalId, { mime, name });
  await hochladen(konto, v, GROESSE, mime);
  await asUserCommitted(konto, BESTAETIGEN, [v.attachment_id]);
  return v;
}

async function senden(
  konto: string,
  kanalId: string,
  text: string,
  optionen: { parent?: string | null; anhaenge?: string[]; um?: string | null; id?: string } = {},
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, SENDEN, [
    kanalId,
    optionen.parent ?? null,
    text,
    [],
    optionen.id ?? null,
    optionen.um ?? null,
    optionen.anhaenge ?? [],
  ]);
  return rows[0]!.id;
}

async function nachrichten(
  konto: string,
  kanalId: string,
  parent: string | null = null,
): Promise<Nachricht[]> {
  return (await asUser<Nachricht>(konto, NACHRICHTEN, [kanalId, parent])).rows;
}

/** Die offenen Löschaufträge im Bucket des Teamchats. */
async function auftraege(): Promise<string[]> {
  const { rows } = await asPostgres<{ object_key: string }>(
    `select object_key from public.storage_deletion_orders
      where bucket_id = 'teamchat' and receipted_at is null order by object_key`,
  );
  return rows.map((r) => r.object_key);
}

async function zeilen(): Promise<number> {
  return anzahl('select count(*) n from public.team_message_attachments');
}

/** Liest das Objekt so, wie die Storage-API beim Signieren fragt. */
async function lesen(konto: string, schluessel: string): Promise<number> {
  const { rows } = await asStorageApi<{ n: number }>(
    konto,
    'storage.object.sign',
    `select count(*)::integer as n from storage.objects where bucket_id = 'teamchat' and name = $1`,
    [schluessel],
  );
  return rows[0]!.n;
}

/** Verlegt den Zeitpunkt des Hochladens zurück - am Wächter vorbei, nur für den Test. */
async function anhangVor(id: string, intervall: string): Promise<void> {
  await asPostgres(
    'alter table public.team_message_attachments disable trigger team_message_attachments_guard',
  );
  try {
    await asPostgres(
      'update public.team_message_attachments set created_at = now() - $2::interval where id = $1',
      [id, intervall],
    );
  } finally {
    await asPostgres(
      'alter table public.team_message_attachments enable trigger team_message_attachments_guard',
    );
  }
}

/** Der Schalter der Prüfung am Server (ADR-017 Punkt 51) - derselbe wie für die Akte. */
async function schalter(an: boolean): Promise<void> {
  await asPostgres(
    `create or replace function app.patient_file_verification_required()
       returns boolean language sql immutable set search_path = '' as $$ select ${an} $$`,
  );
}

async function auditAnzahl(): Promise<number> {
  return anzahl('select count(*) n from public.audit_log');
}

beforeEach(async () => {
  await resetDatabase();
  await asPostgres(
    `insert into public.team_channels (organization_id, kind, name, description)
     values ($1, 'channel', 'Allgemein', 'Organisatorisches'),
            ($1, 'channel', 'Vertretungen', null)`,
    [organizationId],
  );
}, 120_000);

describe('Teamchat: Anhänge senden (ADR-017 Punkte 71 und 73)', () => {
  it('hängt Fotos und PDF an, in der Reihenfolge des Sendens, und zeigt sie allen, die lesen', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const pdf = await anhang(users.therapist, allgemein, 'application/pdf', 'Dienstplan KW 43.pdf');
    const foto = await anhang(users.therapist, allgemein, 'image/png', 'Bildschirmfoto.png');
    const id = await senden(users.therapist, allgemein, 'Plan und Bild', {
      anhaenge: [pdf.attachment_id, foto.attachment_id],
    });

    for (const konto of [users.therapist, users.office, users.ownerTherapist]) {
      const nachricht = (await nachrichten(konto, allgemein)).find((n) => n.id === id)!;
      expect(nachricht.attachments).toEqual([
        {
          id: pdf.attachment_id,
          name: 'Dienstplan KW 43.pdf',
          mime_type: 'application/pdf',
          byte_size: GROESSE,
          // Ohne scharfe Prüfung „nicht serverseitig geprüft“ (Punkt 51).
          verified: false,
          // Eine Dauer hat nur eine Sprachnachricht (TEAM-004).
          duration_seconds: null,
        },
        {
          id: foto.attachment_id,
          name: 'Bildschirmfoto.png',
          mime_type: 'image/png',
          byte_size: GROESSE,
          verified: false,
          duration_seconds: null,
        },
      ]);
    }
    const { rows } = await asUser<{
      id: string;
      author_name: string;
      message_id: string;
      verified: boolean;
    }>(users.office, DATEIEN, [allgemein]);
    expect(rows.map((r) => r.id).sort()).toEqual([pdf.attachment_id, foto.attachment_id].sort());
    expect(rows.every((r) => r.message_id === id && r.author_name === 'Anna Beispiel')).toBe(true);
    expect(rows.every((r) => !r.verified)).toBe(true);
  });

  it('sendet eine Nachricht nur mit Anhängen - ohne Anhang bleibt ein leerer Text abgewiesen', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.therapist, allgemein);
    const nurBild = await senden(users.therapist, allgemein, '   ', {
      anhaenge: [foto.attachment_id],
    });
    expect(
      (await nachrichten(users.office, allgemein)).find((n) => n.id === nurBild),
    ).toMatchObject({
      body: '',
      attachments: [expect.objectContaining({ id: foto.attachment_id })],
    });
    expect(await code(senden(users.therapist, allgemein, ''))).toBe('22023');

    // Bearbeiten: mit Anhängen darf der Text leer werden, ohne nicht.
    await asUserCommitted(users.therapist, BEARBEITEN, [nurBild, 'Mit Text']);
    await asUserCommitted(users.therapist, BEARBEITEN, [nurBild, '']);
    const nurText = await senden(users.therapist, allgemein, 'Nur Text');
    expect(await code(asUser(users.therapist, BEARBEITEN, [nurText, '']))).toBe('22023');
    // Eine fremde Kennung antwortet immer gleich, auch mit leerem Text.
    expect(await code(asUser(users.office, BEARBEITEN, [nurText, '']))).toBe('P0002');
  });

  it('bindet nur eigene, bestätigte, ungesendete Anhänge desselben Gesprächs - sonst entsteht auch die Nachricht nicht', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const vertretungen = await kanal(users.therapist, 'Vertretungen');
    const offen = await vorbereiten(users.therapist, allgemein);
    const fremd = await anhang(users.office, allgemein);
    const anderesGespraech = await anhang(users.therapist, vertretungen);
    const gesendet = await anhang(users.therapist, allgemein);
    await senden(users.therapist, allgemein, 'Erste', { anhaenge: [gesendet.attachment_id] });
    const alt = await anhang(users.therapist, allgemein);
    await anhangVor(alt.attachment_id, '25 hours');
    const vorher = await anzahl('select count(*) n from public.team_messages');

    for (const id of [
      offen.attachment_id,
      fremd.attachment_id,
      anderesGespraech.attachment_id,
      gesendet.attachment_id,
      alt.attachment_id,
    ]) {
      expect(await code(senden(users.therapist, allgemein, 'Mit Anhang', { anhaenge: [id] }))).toBe(
        'P0002',
      );
    }
    const gut = await anhang(users.therapist, allgemein);
    expect(
      await code(
        senden(users.therapist, allgemein, 'Doppelt', {
          anhaenge: [gut.attachment_id, gut.attachment_id],
        }),
      ),
    ).toBe('22023');
    expect(await anzahl('select count(*) n from public.team_messages')).toBe(vorher);
    expect(
      await anzahl(
        'select count(*) n from public.team_message_attachments where id = $1 and message_id is null',
        [gut.attachment_id],
      ),
    ).toBe(1);
  });

  it('nimmt höchstens fünf je Nachricht und keine an einer geplanten', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const sechs: string[] = [];
    for (let i = 0; i < 6; i++)
      sechs.push((await anhang(users.therapist, allgemein)).attachment_id);
    expect(await code(senden(users.therapist, allgemein, 'Zu viele', { anhaenge: sechs }))).toBe(
      '22023',
    );
    const { rows } = await asPostgres<{ t: string }>(
      `select (now() + interval '2 hours')::text as t`,
    );
    expect(
      await code(
        senden(users.therapist, allgemein, 'Geplant', { anhaenge: [sechs[0]!], um: rows[0]!.t }),
      ),
    ).toBe('22023');
    const fuenf = await senden(users.therapist, allgemein, 'Fünf', { anhaenge: sechs.slice(0, 5) });
    const { rows: positionen } = await asPostgres<{ position: number }>(
      'select position from public.team_message_attachments where message_id = $1 order by position',
      [fuenf],
    );
    expect(positionen.map((p) => p.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it('liefert beim Wiederholen dieselbe Nachricht, ohne etwas doppelt zu binden (ANN-641)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.therapist, allgemein);
    const geraet = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';
    const erst = await senden(users.therapist, allgemein, 'Funkloch', {
      id: geraet,
      anhaenge: [foto.attachment_id],
    });
    const nochmal = await senden(users.therapist, allgemein, 'Funkloch', {
      id: geraet,
      anhaenge: [foto.attachment_id],
    });
    expect(nochmal).toBe(erst);
    expect(
      await anzahl('select count(*) n from public.team_message_attachments where message_id = $1', [
        erst,
      ]),
    ).toBe(1);
  });

  it('hängt Anhänge auch an eine Antwort im Thread und an die Radflotte', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const wurzel = await senden(users.therapist, allgemein, 'Frage');
    const foto = await anhang(users.office, allgemein);
    const antwort = await senden(users.office, allgemein, 'Antwort mit Bild', {
      parent: wurzel,
      anhaenge: [foto.attachment_id],
    });
    const thread = await nachrichten(users.therapist, allgemein, wurzel);
    expect(thread.find((n) => n.id === antwort)?.attachments).toHaveLength(1);
    const { rows } = await asUser<{ parent_id: string | null }>(users.therapist, DATEIEN, [
      allgemein,
    ]);
    expect(rows).toEqual([expect.objectContaining({ parent_id: wurzel })]);

    const radflotte = await fleet();
    const rad = await anhang(users.teamLead, radflotte, 'image/jpeg', 'Speiche.jpg');
    await senden(users.teamLead, radflotte, 'Speiche gebrochen', { anhaenge: [rad.attachment_id] });
    expect((await nachrichten(users.therapist, radflotte))[0]?.attachments).toHaveLength(1);
  });
});

describe('Teamchat: Hochladen prüfen (ADR-017 Punkte 7, 18 und 71)', () => {
  it('begrenzt Format, Größe, Prüfsumme, Name und die Zahl ungesendeter Anhänge', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const falsch = async (optionen: Parameters<typeof vorbereiten>[2]) =>
      code(vorbereiten(users.therapist, allgemein, optionen));
    expect(await falsch({ mime: 'image/gif' })).toBe('22023');
    expect(await falsch({ mime: 'video/mp4' })).toBe('22023');
    expect(await falsch({ groesse: 0 })).toBe('22023');
    expect(await falsch({ groesse: 10 * 1024 * 1024 + 1 })).toBe('22023');
    expect(await falsch({ summe: 'xyz' })).toBe('22023');
    expect(await falsch({ name: '   ' })).toBe('22023');
    expect(await falsch({ name: 'a'.repeat(121) })).toBe('22023');
    expect(await falsch({ name: 'Zeile\nzwei.pdf' })).toBe('22023');
    // ADR-017 Punkt 5: nur Kennungen im Schlüssel, kein Name.
    const vorbereitet = await vorbereiten(users.therapist, allgemein, { name: '  Beleg.pdf ' });
    expect(vorbereitet.object_key).toBe(
      `${organizationId}/${allgemein}/${vorbereitet.attachment_id}`,
    );
    expect(
      await anzahl(
        `select count(*) n from public.team_message_attachments where display_name = 'Beleg.pdf'`,
      ),
    ).toBe(1);

    for (let i = 1; i < 20; i++) await vorbereiten(users.therapist, allgemein);
    expect(await falsch({})).toBe('23514');
    // Die Grenze gilt je Person.
    await vorbereiten(users.office, allgemein);
  });

  it('nimmt keine Anhänge für Gespräche an, die die Person nicht lesen oder die archiviert sind', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const { rows } = await asUserCommitted<{ id: string }>(users.teamLead, KANAL_ANLEGEN, [
      'Leitung',
      null,
      true,
      [STAFF.jannes],
    ]);
    const leitung = rows[0]!.id;
    expect(await code(vorbereiten(users.therapist, leitung))).toBe('P0002');
    expect(await code(vorbereiten(users.trainer, await fleet()))).toBe('P0002');
    await asUserCommitted(
      users.teamLead,
      'select public.set_team_channel_archived($1::uuid, true)',
      [allgemein],
    );
    expect(await code(vorbereiten(users.therapist, allgemein))).toBe('22023');
  });

  it('bestätigt nur, was so in der Ablage liegt wie angekündigt', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const ohne = await vorbereiten(users.therapist, allgemein);
    expect(await code(asUser(users.therapist, BESTAETIGEN, [ohne.attachment_id]))).toBe('22023');

    const groesse = await vorbereiten(users.therapist, allgemein);
    await hochladen(users.therapist, groesse, GROESSE + 1);
    expect(await code(asUser(users.therapist, BESTAETIGEN, [groesse.attachment_id]))).toBe('22023');

    const typ = await vorbereiten(users.therapist, allgemein);
    await hochladen(users.therapist, typ, GROESSE, 'image/png');
    expect(await code(asUser(users.therapist, BESTAETIGEN, [typ.attachment_id]))).toBe('22023');

    const gut = await vorbereiten(users.therapist, allgemein);
    await hochladen(users.therapist, gut);
    expect(await code(asUser(users.office, BESTAETIGEN, [gut.attachment_id]))).toBe('P0002');
    await asUserCommitted(users.therapist, BESTAETIGEN, [gut.attachment_id]);
    expect(await code(asUser(users.therapist, BESTAETIGEN, [gut.attachment_id]))).toBe('P0002');
  });
});

describe('Teamchat: Ablage und Lesefreigabe (ADR-017 Punkte 11, 15 und 76)', () => {
  it('lädt nur in die eigene vorbereitete Zeile hoch, nicht danach und nicht in fremde', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const v = await vorbereiten(users.therapist, allgemein);
    expect(await code(hochladen(users.office, v))).toBe('42501');
    // Zweitreview TEAM-003, Punkt 1: auch nicht aus einer anderen Praxis, als
    // Patient:in oder mit einem Konto der Plattform.
    const fremd = await fremdeOrganisation();
    for (const konto of [fremd.owner, users.patientMax, users.plattformTina]) {
      expect(await code(hochladen(konto, v))).toBe('42501');
    }
    expect(
      await code(
        hochladen(users.therapist, {
          bucket_id: 'teamchat',
          object_key: `${organizationId}/${allgemein}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
        }),
      ),
    ).toBe('42501');
    await anhangVor(v.attachment_id, '25 hours');
    expect(await code(hochladen(users.therapist, v))).toBe('42501');

    const gut = await vorbereiten(users.therapist, allgemein);
    await hochladen(users.therapist, gut);
    // Kein Überschreiben: Es gibt keine Regel für UPDATE.
    expect(
      (
        await asStorageApi<{ name: string }>(
          users.therapist,
          'storage.object.upload',
          `update storage.objects set metadata = '{}'::jsonb where bucket_id = 'teamchat' and name = $1
           returning name`,
          [gut.object_key],
        )
      ).rows,
    ).toEqual([]);
  });

  it('gibt einen gesendeten Anhang gegen eine einmalige Freigabe frei, nur wer die Nachricht liest', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.therapist, allgemein);
    // Vor dem Senden gibt es keinen Verweis - auch nicht für die Person selbst.
    expect(await code(asUser(users.therapist, VERWEIS, [foto.attachment_id]))).toBe('P0002');
    await senden(users.therapist, allgemein, 'Bild', { anhaenge: [foto.attachment_id] });

    expect(await lesen(users.office, foto.object_key)).toBe(0);
    const { rows } = await asUserCommitted<{
      bucket_id: string;
      object_key: string;
      mime_type: string;
    }>(users.office, VERWEIS, [foto.attachment_id]);
    expect(rows).toEqual([
      { bucket_id: 'teamchat', object_key: foto.object_key, mime_type: 'image/jpeg' },
    ]);
    expect(await lesen(users.teamLead, foto.object_key)).toBe(0);
    // Die Freigabe gehört Olivia - nicht einer anderen Praxis, einer
    // Patientin oder einem Konto der Plattform (Zweitreview TEAM-003, Punkt 1).
    const fremd = await fremdeOrganisation();
    for (const konto of [fremd.owner, users.patientMax, users.plattformTina]) {
      expect(await lesen(konto, foto.object_key)).toBe(0);
    }
    expect(await lesen(users.office, foto.object_key)).toBe(1);
    expect(await lesen(users.office, foto.object_key)).toBe(0);
  });

  it('zeigt Anhänge privater Kanäle und Direktnachrichten nur ihren Mitgliedern, auch owner nicht (ANN-642)', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, DIREKT, [STAFF.olivia]);
    const direkt = rows[0]!.id;
    const foto = await anhang(users.therapist, direkt);
    await senden(users.therapist, direkt, 'Nur für Olivia', { anhaenge: [foto.attachment_id] });

    expect((await asUserCommitted(users.office, VERWEIS, [foto.attachment_id])).rows).toHaveLength(
      1,
    );
    expect(await code(asUser(users.ownerTherapist, VERWEIS, [foto.attachment_id]))).toBe('P0002');
    expect(await code(asUser(users.ownerTherapist, DATEIEN, [direkt]))).toBe('P0002');
    expect(await code(asUser(users.ownerTherapist, NACHRICHTEN, [direkt, null]))).toBe('P0002');

    const radflotte = await fleet();
    const rad = await anhang(users.teamLead, radflotte);
    await senden(users.teamLead, radflotte, 'Rad', { anhaenge: [rad.attachment_id] });
    expect(await code(asUser(users.trainer, VERWEIS, [rad.attachment_id]))).toBe('P0002');
  });

  it('gibt Anhänge privater Kanäle und Gruppen nur ihren Mitgliedern frei (Zweitreview TEAM-003)', async () => {
    const leitung = (
      await asUserCommitted<{ id: string }>(users.teamLead, KANAL_ANLEGEN, [
        'Leitung',
        null,
        true,
        [STAFF.jannes],
      ])
    ).rows[0]!.id;
    const plan = await anhang(users.teamLead, leitung, 'application/pdf', 'Plan.pdf');
    await senden(users.teamLead, leitung, 'Vertretung', { anhaenge: [plan.attachment_id] });
    const gruppe = (
      await asUserCommitted<{ id: string }>(users.therapist, GRUPPE, [[STAFF.olivia, STAFF.tim]])
    ).rows[0]!.id;
    const foto = await anhang(users.therapist, gruppe);
    await senden(users.therapist, gruppe, 'Für uns drei', { anhaenge: [foto.attachment_id] });

    for (const [konto, anhangId, gespraech] of [
      [users.therapist, plan.attachment_id, leitung],
      [users.office, plan.attachment_id, leitung],
      [users.ownerTherapist, foto.attachment_id, gruppe],
    ] as const) {
      expect(await code(asUser(konto, VERWEIS, [anhangId]))).toBe('P0002');
      expect(await code(asUser(konto, DATEIEN, [gespraech]))).toBe('P0002');
    }
    expect((await asUser(users.ownerTherapist, DATEIEN, [leitung])).rows).toHaveLength(1);
    expect((await asUser(users.office, DATEIEN, [gruppe])).rows).toHaveLength(1);
  });

  it('prüft das Leserecht noch beim Öffnen - wer seit der Freigabe den Kanal verließ, bekommt nichts', async () => {
    const leitung = (
      await asUserCommitted<{ id: string }>(users.teamLead, KANAL_ANLEGEN, [
        'Leitung',
        null,
        true,
        [STAFF.jannes],
      ])
    ).rows[0]!.id;
    const plan = await anhang(users.teamLead, leitung, 'application/pdf', 'Plan.pdf');
    await senden(users.teamLead, leitung, 'Vertretung', { anhaenge: [plan.attachment_id] });
    await asUserCommitted(users.ownerTherapist, VERWEIS, [plan.attachment_id]);
    await asUserCommitted(users.ownerTherapist, VERLASSEN, [leitung]);
    expect(await lesen(users.ownerTherapist, plan.object_key)).toBe(0);

    // Gegenprobe: wer Mitglied bleibt, öffnet mit seiner Freigabe.
    await asUserCommitted(users.teamLead, VERWEIS, [plan.attachment_id]);
    expect(await lesen(users.teamLead, plan.object_key)).toBe(1);
  });
});

describe('Teamchat: Rechte an den Anhängen (ADR-013 Punkt 9 Nr. 1)', () => {
  it('weist andere Organisationen, Konten ohne Praxisrolle, Plattformkonten und ohne Sitzung ab', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.therapist, allgemein);
    await senden(users.therapist, allgemein, 'Bild', { anhaenge: [foto.attachment_id] });
    const offen = await anhang(users.therapist, allgemein);

    const fremd = await fremdeOrganisation();
    expect(await code(vorbereiten(fremd.owner, allgemein))).toBe('P0002');
    expect(await code(asUser(fremd.owner, VERWEIS, [foto.attachment_id]))).toBe('P0002');
    expect(await code(asUser(fremd.owner, DATEIEN, [allgemein]))).toBe('P0002');
    expect(await code(asUser(fremd.owner, VERWERFEN, [offen.attachment_id]))).toBe('P0002');
    expect(await code(asUser(fremd.owner, BESTAETIGEN, [offen.attachment_id]))).toBe('P0002');
    expect(
      await code(
        asUser(fremd.owner, SENDEN, [allgemein, null, 'x', [], null, null, [offen.attachment_id]]),
      ),
    ).toBe('P0002');

    const aufrufe: [string, unknown[]][] = [
      [VORBEREITEN, [allgemein, 'image/jpeg', GROESSE, SUMME, 'x.jpg']],
      [BESTAETIGEN, [offen.attachment_id]],
      [VERWERFEN, [offen.attachment_id]],
      [VERWEIS, [foto.attachment_id]],
      [DATEIEN, [allgemein]],
    ];
    for (const konto of [users.patientMax, users.plattformTina, users.plattformErika]) {
      for (const [sql, params] of aufrufe) {
        expect(await code(asUser(konto, sql, params))).toBe('42501');
      }
    }
    for (const [sql, params] of aufrufe) {
      expect(await code(asUser(null, sql, params))).toBe('42501');
      expect(await code(asAnon(sql, params))).toBe('42501');
    }
    // Der Dienst und das Aufräumen sind keine Wege für Konten.
    for (const sql of [
      'select * from public.team_attachment_for_verification($1::uuid, $2::uuid)',
      'select public.record_team_attachment_verification($1::uuid, true, true, true)',
      'select public.discard_stale_team_attachments()',
    ]) {
      const params = sql.includes('$2')
        ? [offen.attachment_id, users.therapist]
        : sql.includes('$1')
          ? [offen.attachment_id]
          : [];
      expect(await code(asUser(users.ownerTherapist, sql, params))).toBe('42501');
    }
  });

  it('gibt keine Tabellenrechte und schreibt keinen Auditeintrag (ADR-010 Punkt 17)', async () => {
    for (const tabelle of ['team_message_attachments', 'team_attachment_access_grants']) {
      for (const sql of [
        `select * from public.${tabelle}`,
        `delete from public.${tabelle}`,
        `truncate public.${tabelle}`,
      ]) {
        expect(await code(asUser(users.ownerTherapist, sql))).toBe('42501');
      }
    }
    const vorher = await auditAnzahl();
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.therapist, allgemein);
    const id = await senden(users.therapist, allgemein, 'Bild', { anhaenge: [foto.attachment_id] });
    await asUserCommitted(users.office, VERWEIS, [foto.attachment_id]);
    await asUser(users.office, DATEIEN, [allgemein]);
    await asUserCommitted(users.therapist, LOESCHEN, [id]);
    expect(await auditAnzahl()).toBe(vorher);
  });

  it('lässt nur eigene, ungesendete Anhänge verwerfen', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.therapist, allgemein);
    expect(await code(asUser(users.office, VERWERFEN, [foto.attachment_id]))).toBe('P0002');
    await senden(users.therapist, allgemein, 'Bild', { anhaenge: [foto.attachment_id] });
    expect(await code(asUser(users.therapist, VERWERFEN, [foto.attachment_id]))).toBe('P0002');
  });
});

describe('Teamchat: Löschpfad der Anhänge (ADR-017 Punkte 25 und 75)', () => {
  it('lässt Anhänge mit der eigenen Nachricht fallen - ohne Antworten mit der Zeile, mit Antworten mit dem Inhalt', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const allein = await anhang(users.therapist, allgemein);
    const alleinId = await senden(users.therapist, allgemein, 'Vertippt', {
      anhaenge: [allein.attachment_id],
    });
    const mitAntwort = await anhang(users.therapist, allgemein);
    const wurzel = await senden(users.therapist, allgemein, 'Frage', {
      anhaenge: [mitAntwort.attachment_id],
    });
    await senden(users.office, allgemein, 'Antwort', { parent: wurzel });

    await asUserCommitted(users.therapist, LOESCHEN, [alleinId]);
    await asUserCommitted(users.therapist, LOESCHEN, [wurzel]);

    expect(await zeilen()).toBe(0);
    expect(await auftraege()).toEqual([allein.object_key, mitAntwort.object_key].sort());
    const anker = (await nachrichten(users.office, allgemein)).find((n) => n.id === wurzel)!;
    expect(anker).toMatchObject({ body: null, attachments: [] });
  });

  it('lässt Anhänge fallen, wenn owner eine Nachricht im Kanal entfernt', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.office, allgemein);
    const id = await senden(users.office, allgemein, 'Foto einer Patientin', {
      anhaenge: [foto.attachment_id],
    });
    await asUserCommitted(users.ownerTherapist, LOESCHEN, [id]);
    expect(await zeilen()).toBe(0);
    expect(await auftraege()).toEqual([foto.object_key]);
  });

  it('lässt Anhänge mit der Frist fallen - auch am Anker, dessen Antworten noch laufen (ANN-610)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const altAllein = await anhang(users.therapist, allgemein);
    const alleinId = await senden(users.therapist, allgemein, 'Alt', {
      anhaenge: [altAllein.attachment_id],
    });
    const altWurzel = await anhang(users.therapist, allgemein);
    const wurzel = await senden(users.therapist, allgemein, 'Alte Frage', {
      anhaenge: [altWurzel.attachment_id],
    });
    const antwort = await senden(users.office, allgemein, 'Neue Antwort', { parent: wurzel });
    await asPostgres(
      `update public.team_messages set created_at = now() - interval '13 months' where id = any($1::uuid[])`,
      [[alleinId, wurzel]],
    );
    expect(antwort).toBeTruthy();

    await asPostgres('select public.apply_retention()');
    expect(await zeilen()).toBe(0);
    expect(await auftraege()).toEqual([altAllein.object_key, altWurzel.object_key].sort());
  });

  it('lässt Anhänge mit dem Gespräch fallen, wenn das letzte Mitglied einen privaten Kanal verlässt', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.teamLead, KANAL_ANLEGEN, [
      'Leitung',
      null,
      true,
      [],
    ]);
    const leitung = rows[0]!.id;
    const foto = await anhang(users.teamLead, leitung);
    await senden(users.teamLead, leitung, 'Vertraulich', { anhaenge: [foto.attachment_id] });
    const offen = await anhang(users.teamLead, leitung);
    await asUserCommitted(users.teamLead, VERLASSEN, [leitung]);
    expect(await zeilen()).toBe(0);
    expect(await auftraege()).toEqual([foto.object_key, offen.object_key].sort());
  });

  it('verwirft ungesendete sofort oder nach 24 Stunden - jeweils mit Journal und Löschauftrag (ANN-652)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const verworfen = await anhang(users.therapist, allgemein);
    await asUserCommitted(users.therapist, VERWERFEN, [verworfen.attachment_id]);
    const liegen = await anhang(users.therapist, allgemein);
    const frisch = await anhang(users.therapist, allgemein);
    await anhangVor(liegen.attachment_id, '25 hours');
    const gesendet = await anhang(users.office, allgemein);
    await senden(users.office, allgemein, 'Bild', { anhaenge: [gesendet.attachment_id] });
    await asUserCommitted(users.office, VERWEIS, [gesendet.attachment_id]);
    await asPostgres(
      `update public.team_attachment_access_grants set created_at = now() - interval '2 minutes',
              expires_at = now() - interval '1 minute'`,
    );

    const { rows } = await asPostgres<{ n: number }>(
      'select public.discard_stale_team_attachments() as n',
    );
    expect(rows[0]!.n).toBe(1);
    expect(
      await anzahl(
        'select count(*) n from public.team_message_attachments where message_id is null',
      ),
    ).toBe(1);
    expect(
      await anzahl('select count(*) n from public.team_message_attachments where id = $1', [
        frisch.attachment_id,
      ]),
    ).toBe(1);
    expect(await auftraege()).toEqual([verworfen.object_key, liegen.object_key].sort());
    expect(await anzahl('select count(*) n from public.team_attachment_access_grants')).toBe(0);
    // Auf beiden Wegen im Journal, damit eine Wiederherstellung nichts
    // zurückbringt (ADR-008 Punkt 8, ANN-752).
    const { rows: journal } = await asPostgres<{
      target_id: string;
      target_table: string;
      retention_class: string;
      mitternacht: boolean;
    }>(
      `select target_id, target_table, retention_class,
              deleted_at = date_trunc('day', deleted_at) and due_at = deleted_at as mitternacht
         from public.deletion_journal
        where target_id = any($1::uuid[])
        order by target_id`,
      [[verworfen.attachment_id, liegen.attachment_id]],
    );
    // Tageweise, ohne Uhrzeit, in einem Lauf je Praxis und Tag (Zweitreview
    // TEAM-001 N4, TEAM-003 Runde 2).
    expect(journal).toEqual(
      [verworfen.attachment_id, liegen.attachment_id].sort().map((target_id) => ({
        target_id,
        target_table: 'team_message_attachments',
        retention_class: 'teamchat',
        mitternacht: true,
      })),
    );
  });

  it('lässt verworfene und abgewiesene ungesendete Anhänge nach einem Restore erneut fallen (Zweitreview TEAM-003)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const verworfen = await anhang(users.therapist, allgemein);
    await asUserCommitted(users.therapist, VERWERFEN, [verworfen.attachment_id]);
    const befund = await anhang(users.therapist, allgemein);
    await asServiceRole(
      'select public.record_team_attachment_verification($1::uuid, false, true, true)',
      [befund.attachment_id],
    );
    expect(await zeilen()).toBe(0);
    // Die Löschaufträge sind ausgeführt und quittiert.
    await asPostgres(`delete from storage.objects where bucket_id = 'teamchat'`);
    await asPostgres(
      `update public.storage_deletion_orders set receipted_at = now(), receipted_by = $1
        where bucket_id = 'teamchat'`,
      [users.ownerTherapist],
    );

    // Restore aus der Sicherung von vor einer Stunde: Zeilen und Objekte
    // wieder da, jünger als 24 Stunden und damit bindbar - ohne Journal kämen
    // sie zurück.
    for (const v of [verworfen, befund]) {
      await asPostgres(
        `insert into public.team_message_attachments
           (id, organization_id, channel_id, staff_member_id, display_name, mime_type, byte_size,
            checksum_sha256, status, confirmed_at, created_by, created_at)
         values ($1, $2, $3, $4, 'Foto Rad.jpg', 'image/jpeg', $5, $6, 'ready', now(), $7,
                 now() - interval '1 hour')`,
        [v.attachment_id, organizationId, allgemein, STAFF.anna, GROESSE, SUMME, users.therapist],
      );
      // Die Zeile in storage.objects gehört zur Sicherung der Datenbank.
      await asPostgres(
        `insert into storage.objects (bucket_id, name, metadata) values ('teamchat', $1, '{}'::jsonb)`,
        [v.object_key],
      );
    }

    await asPostgres('select public.reapply_deletion_journal()');
    expect(await zeilen()).toBe(0);
    expect(await auftraege()).toEqual([verworfen.object_key, befund.object_key].sort());
    expect(
      await anzahl(
        `select count(*) n from public.deletion_journal
          where target_table = 'team_message_attachments' and reapplied_at is not null`,
      ),
    ).toBe(2);
    // Beide Wege stehen im selben Tageslauf, nicht je Ereignis einzeln, und
    // ohne Uhrzeit - auch der Befund der Prüfung (Zweitreview, Runde 3).
    expect(
      await anzahl(
        `select count(distinct run_id) n from public.deletion_journal
          where target_table = 'team_message_attachments'`,
      ),
    ).toBe(1);
    expect(
      await anzahl(
        `select count(*) n from public.deletion_journal
          where target_table = 'team_message_attachments'
            and (deleted_at <> date_trunc('day', deleted_at) or due_at <> deleted_at)`,
      ),
    ).toBe(0);
    expect(
      await code(
        senden(users.therapist, allgemein, 'Doch noch', { anhaenge: [verworfen.attachment_id] }),
      ),
    ).toBe('P0002');
  });

  it('lässt Anhänge nach einem Restore erneut fallen (ADR-008 Punkt 8)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const allein = await anhang(users.therapist, allgemein);
    const alleinId = await senden(users.therapist, allgemein, 'Vertippt', {
      anhaenge: [allein.attachment_id],
    });
    const mitAntwort = await anhang(users.therapist, allgemein);
    const wurzel = await senden(users.therapist, allgemein, 'Frage', {
      anhaenge: [mitAntwort.attachment_id],
    });
    await senden(users.office, allgemein, 'Antwort', { parent: wurzel });
    await asUserCommitted(users.therapist, LOESCHEN, [alleinId]);
    await asUserCommitted(users.therapist, LOESCHEN, [wurzel]);
    // Die Löschaufträge sind ausgeführt und quittiert.
    await asPostgres(`delete from storage.objects where bucket_id = 'teamchat'`);
    await asPostgres(
      `update public.storage_deletion_orders set receipted_at = now(), receipted_by = $1
        where bucket_id = 'teamchat'`,
      [users.ownerTherapist],
    );

    // Restore: Nachrichten, Inhalte und Anhänge kommen zurück, die Objekte auch.
    await asPostgres(
      `insert into public.team_messages (id, organization_id, channel_id, author_staff_member_id, body)
       values ($1, $2, $3, $4, 'Vertippt')`,
      [alleinId, organizationId, allgemein, STAFF.anna],
    );
    await asPostgres(
      `update public.team_messages
          set body = 'Frage', removed_at = null, removed_kind = null, author_staff_member_id = $2
        where id = $1`,
      [wurzel, STAFF.anna],
    );
    for (const [v, nachricht] of [
      [allein, alleinId],
      [mitAntwort, wurzel],
    ] as const) {
      await asPostgres(
        `insert into public.team_message_attachments
           (id, organization_id, channel_id, message_id, position, attached_at, staff_member_id,
            display_name, mime_type, byte_size, checksum_sha256, status, confirmed_at, created_by)
         values ($1, $2, $3, $4, 1, now(), $5, 'Foto Rad.jpg', 'image/jpeg', $6, $7, 'ready', now(), $8)`,
        [
          v.attachment_id,
          organizationId,
          allgemein,
          nachricht,
          STAFF.anna,
          GROESSE,
          SUMME,
          users.therapist,
        ],
      );
      await asPostgres(
        `insert into storage.objects (bucket_id, name, metadata) values ('teamchat', $1, '{}'::jsonb)`,
        [v.object_key],
      );
    }

    await asPostgres('select public.reapply_deletion_journal()');
    expect(await zeilen()).toBe(0);
    expect(await auftraege()).toEqual([allein.object_key, mitAntwort.object_key].sort());
  });
});

describe('Teamchat: Anhänge unverändert, am Server geprüft, abgeglichen', () => {
  it('lässt Name, Art und Bindung nicht ändern (ADR-017 Punkt 8)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.therapist, allgemein);
    const id = await senden(users.therapist, allgemein, 'Bild', { anhaenge: [foto.attachment_id] });
    const andere = await senden(users.therapist, allgemein, 'Andere');
    for (const [sql, params] of [
      [
        `update public.team_message_attachments set display_name = 'Neu.jpg' where id = $1`,
        [foto.attachment_id],
      ],
      [
        `update public.team_message_attachments set mime_type = 'image/png' where id = $1`,
        [foto.attachment_id],
      ],
      [
        `update public.team_message_attachments set message_id = $2 where id = $1`,
        [foto.attachment_id, andere],
      ],
      [
        `update public.team_message_attachments set position = 2 where id = $1`,
        [foto.attachment_id],
      ],
    ] as const) {
      expect(await code(asPostgres(sql, [...params]))).toBe('42501');
    }
    expect(id).toBeTruthy();
  });

  it('macht einen Anhang bei scharfer Prüfung erst mit dem Ergebnis bereit; ein Befund verwirft (Punkte 49 bis 52)', async () => {
    await schalter(true);
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const geprueft = await anhang(users.therapist, allgemein);
    expect(
      await code(
        senden(users.therapist, allgemein, 'Zu früh', { anhaenge: [geprueft.attachment_id] }),
      ),
    ).toBe('P0002');

    // Nur der eigene, ungesendete - für jede andere Person nicht gefunden.
    const ankuendigung = async (konto: string, id: string) =>
      (
        await asServiceRole(
          'select * from public.team_attachment_for_verification($1::uuid, $2::uuid)',
          [id, konto],
        )
      ).rows;
    expect(await ankuendigung(users.office, geprueft.attachment_id)).toEqual([]);
    expect(await ankuendigung(users.therapist, geprueft.attachment_id)).toHaveLength(1);

    const ergebnis = async (id: string, metadaten: boolean | null, typ = true) =>
      (
        await asServiceRole<{ r: string }>(
          'select public.record_team_attachment_verification($1::uuid, $2, true, $3) as r',
          [id, typ, metadaten],
        )
      ).rows[0]!.r;
    expect(await code(ergebnis(geprueft.attachment_id, null))).toBe('22023');
    expect(await ergebnis(geprueft.attachment_id, true)).toBe('passed');
    expect(await ergebnis(geprueft.attachment_id, true)).toBe('already_verified');
    const id = await senden(users.therapist, allgemein, 'Geprüft', {
      anhaenge: [geprueft.attachment_id],
    });
    expect(await ergebnis(geprueft.attachment_id, true)).toBe('not_found');
    // Punkt 51: Ob am Server geprüft, steht an der Datei - in der Nachricht und
    // unter „Dateien“.
    expect(
      (await nachrichten(users.office, allgemein)).find((n) => n.id === id)?.attachments,
    ).toEqual([expect.objectContaining({ id: geprueft.attachment_id, verified: true })]);
    expect((await asUser(users.office, DATEIEN, [allgemein])).rows).toEqual([
      expect.objectContaining({ id: geprueft.attachment_id, verified: true }),
    ]);

    const befund = await anhang(users.therapist, allgemein);
    expect(await ergebnis(befund.attachment_id, true, false)).toBe('rejected');
    expect(
      await anzahl('select count(*) n from public.team_message_attachments where id = $1', [
        befund.attachment_id,
      ]),
    ).toBe(0);
    expect(await auftraege()).toEqual([befund.object_key]);

    const pdf = await anhang(users.therapist, allgemein, 'application/pdf', 'Plan.pdf');
    expect(await code(ergebnis(pdf.attachment_id, true))).toBe('22023');
    expect(await ergebnis(pdf.attachment_id, null)).toBe('passed');
  });

  it('findet verwaiste Objekte auch im Bucket des Teamchats (ADR-017 Punkt 27)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.therapist, allgemein);
    const verwaist = `${organizationId}/${allgemein}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
    await asPostgres(
      `insert into storage.objects (bucket_id, name, metadata) values ('teamchat', $1, '{}'::jsonb)`,
      [verwaist],
    );
    const { rows } = await asUser<{ n: number }>(
      users.ownerTherapist,
      'select public.count_orphaned_patient_file_objects() as n',
    );
    expect(rows[0]!.n).toBe(1);
    await asUserCommitted(users.ownerTherapist, 'select public.order_orphaned_object_deletion()');
    expect(await auftraege()).toEqual([verwaist]);
    expect((await auftraege()).includes(foto.object_key)).toBe(false);
  });
});

describe('Teamchat: Anhänge gegen Rennen (zwei Verbindungen)', () => {
  it('bindet einen Anhang, den zwei Sendungen gleichzeitig wollen, nur einmal', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.therapist, allgemein);
    const fehler = await gleichzeitig(
      {
        konto: users.therapist,
        sql: SENDEN,
        params: [allgemein, null, 'Erste', [], null, null, [foto.attachment_id]],
      },
      {
        konto: users.therapist,
        sql: SENDEN,
        params: [allgemein, null, 'Zweite', [], null, null, [foto.attachment_id]],
      },
    );
    expect(fehler?.code).toBe('P0002');
    expect(
      await anzahl(`select count(*) n from public.team_messages where body in ('Erste', 'Zweite')`),
    ).toBe(1);
  });

  it('lässt Verwerfen und Senden nicht beide gewinnen', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.therapist, allgemein);
    const fehler = await gleichzeitig(
      { konto: users.therapist, sql: VERWERFEN, params: [foto.attachment_id] },
      {
        konto: users.therapist,
        sql: SENDEN,
        params: [allgemein, null, 'Mit Bild', [], null, null, [foto.attachment_id]],
      },
    );
    expect(fehler?.code).toBe('P0002');
    expect(
      await anzahl(`select count(*) n from public.team_messages where body = 'Mit Bild'`),
    ).toBe(0);
    expect(await zeilen()).toBe(0);

    const zweites = await anhang(users.therapist, allgemein);
    const umgekehrt = await gleichzeitig(
      {
        konto: users.therapist,
        sql: SENDEN,
        params: [allgemein, null, 'Gesendet', [], null, null, [zweites.attachment_id]],
      },
      { konto: users.therapist, sql: VERWERFEN, params: [zweites.attachment_id] },
    );
    expect(umgekehrt?.code).toBe('P0002');
    expect(
      await anzahl(
        'select count(*) n from public.team_message_attachments where message_id is not null',
      ),
    ).toBe(1);
  });

  it('lässt eine Freigabe auf das Löschen der Nachricht warten - danach gibt es keine', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const foto = await anhang(users.therapist, allgemein);
    const id = await senden(users.therapist, allgemein, 'Bild', { anhaenge: [foto.attachment_id] });
    const fehler = await gleichzeitig(
      { konto: users.therapist, sql: LOESCHEN, params: [id] },
      { konto: users.office, sql: VERWEIS, params: [foto.attachment_id] },
    );
    expect(fehler?.code).toBe('P0002');
    expect(await anzahl('select count(*) n from public.team_attachment_access_grants')).toBe(0);
  });
});

describe('Teamchat: Sprachnachrichten (TEAM-004, ADR-017 Abschnitt N)', () => {
  it('nimmt WebM und MP4 nur mit einer Dauer von 1 bis 120 Sekunden an - Foto und PDF ohne', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const vorbereiten = (mime: string, dauer: number | null) =>
      asUser(users.therapist, VORBEREITEN_MIT_DAUER, [
        allgemein,
        mime,
        GROESSE,
        SUMME,
        'Sprachnachricht',
        dauer,
      ]);
    for (const [mime, dauer] of [
      ['audio/webm', 1],
      ['audio/mp4', 120],
      ['image/jpeg', null],
      ['application/pdf', null],
    ] as const) {
      expect(await code(vorbereiten(mime, dauer))).toBeUndefined();
    }
    for (const [mime, dauer] of [
      // Ohne Dauer, ohne Länge, über zwei Minuten (Punkt 83).
      ['audio/webm', null],
      ['audio/mp4', 0],
      ['audio/webm', 121],
      // Ein Foto und ein PDF haben keine Dauer.
      ['image/jpeg', 5],
      ['application/pdf', 5],
      // Nur WebM und MP4, kein Video (Punkt 84) - mit Dauer und ohne.
      ['audio/ogg', 5],
      ['audio/ogg', null],
      ['audio/mpeg', 5],
      ['video/webm', 5],
      ['video/webm', null],
    ] as const) {
      expect(await code(vorbereiten(mime, dauer))).toBe('22023');
    }
    // Ohne den neuen Parameter wie bisher: Foto und PDF ja, Ton nicht.
    expect(
      await code(
        asUser(users.therapist, VORBEREITEN, [
          allgemein,
          'application/pdf',
          GROESSE,
          SUMME,
          'P.pdf',
        ]),
      ),
    ).toBeUndefined();
    expect(
      await code(
        asUser(users.therapist, VORBEREITEN, [allgemein, 'audio/webm', GROESSE, SUMME, 'Ton']),
      ),
    ).toBe('22023');
  });

  it('sendet Sprachnachrichten auch ohne Text und zeigt Art, Dauer und Größe allen, die lesen', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const webm = await sprachnachricht(users.therapist, allgemein, 42);
    const mp4 = await sprachnachricht(users.therapist, allgemein, 7, 'audio/mp4');
    const id = await senden(users.therapist, allgemein, '', {
      anhaenge: [webm.attachment_id, mp4.attachment_id],
    });

    for (const konto of [users.therapist, users.office, users.ownerTherapist]) {
      const nachricht = (await nachrichten(konto, allgemein)).find((n) => n.id === id)!;
      expect(nachricht.body).toBe('');
      expect(nachricht.attachments).toEqual([
        {
          id: webm.attachment_id,
          name: 'Sprachnachricht 18.10., 14:05',
          mime_type: 'audio/webm',
          byte_size: GROESSE,
          verified: false,
          duration_seconds: 42,
        },
        {
          id: mp4.attachment_id,
          name: 'Sprachnachricht 18.10., 14:05',
          mime_type: 'audio/mp4',
          byte_size: GROESSE,
          verified: false,
          duration_seconds: 7,
        },
      ]);
    }
    const { rows: dateien } = await asUser<{ id: string; duration_seconds: number | null }>(
      users.office,
      DATEIEN,
      [allgemein],
    );
    expect(dateien.find((d) => d.id === webm.attachment_id)?.duration_seconds).toBe(42);

    // Abspielen heißt öffnen: dieselbe einmalige Freigabe wie jeder Anhang (Punkt 86).
    const { rows } = await asUserCommitted<{ object_key: string; mime_type: string }>(
      users.office,
      VERWEIS,
      [webm.attachment_id],
    );
    expect(rows).toEqual([
      expect.objectContaining({ object_key: webm.object_key, mime_type: 'audio/webm' }),
    ]);
    expect(await lesen(users.teamLead, webm.object_key)).toBe(0);
    expect(await lesen(users.office, webm.object_key)).toBe(1);
    expect(await lesen(users.office, webm.object_key)).toBe(0);
  });

  it('hält die Dauer fest wie alles, was eine Datei ist (ADR-017 Punkt 8)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const ton = await sprachnachricht(users.therapist, allgemein, 42);
    const foto = await anhang(users.therapist, allgemein);
    for (const [sql, params] of [
      [
        `update public.team_message_attachments set duration_seconds = 5 where id = $1`,
        [ton.attachment_id],
      ],
      [
        `update public.team_message_attachments set mime_type = 'audio/mp4' where id = $1`,
        [ton.attachment_id],
      ],
      [
        `update public.team_message_attachments set duration_seconds = 5 where id = $1`,
        [foto.attachment_id],
      ],
    ] as const) {
      expect(await code(asPostgres(sql, [...params]))).toBe('42501');
    }
    // Auch am Wächter vorbei hält die Tabelle: Ton nur mit Dauer, Foto ohne.
    await asPostgres(
      'alter table public.team_message_attachments disable trigger team_message_attachments_guard',
    );
    try {
      for (const [sql, params] of [
        [
          `update public.team_message_attachments set duration_seconds = null where id = $1`,
          [ton.attachment_id],
        ],
        [
          `update public.team_message_attachments set duration_seconds = 121 where id = $1`,
          [ton.attachment_id],
        ],
        [
          `update public.team_message_attachments set duration_seconds = 5 where id = $1`,
          [foto.attachment_id],
        ],
      ] as const) {
        expect(await code(asPostgres(sql, [...params]))).toBe('23514');
      }
    } finally {
      await asPostgres(
        'alter table public.team_message_attachments enable trigger team_message_attachments_guard',
      );
    }
  });

  it('prüft eine Sprachnachricht mit Metadatenergebnis wie ein Bild; ein Befund verwirft (Punkte 49 und 84)', async () => {
    await schalter(true);
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const ergebnis = async (id: string, metadaten: boolean | null) =>
      (
        await asServiceRole<{ r: string }>(
          'select public.record_team_attachment_verification($1::uuid, true, true, $2) as r',
          [id, metadaten],
        )
      ).rows[0]!.r;
    const ton = await sprachnachricht(users.therapist, allgemein, 30, 'audio/mp4');
    expect(await code(ergebnis(ton.attachment_id, null))).toBe('22023');
    expect(await ergebnis(ton.attachment_id, true)).toBe('passed');
    const id = await senden(users.therapist, allgemein, '', { anhaenge: [ton.attachment_id] });
    expect(
      (await nachrichten(users.office, allgemein)).find((n) => n.id === id)?.attachments,
    ).toEqual([expect.objectContaining({ id: ton.attachment_id, verified: true })]);

    const befund = await sprachnachricht(users.therapist, allgemein, 30);
    expect(await ergebnis(befund.attachment_id, false)).toBe('rejected');
    expect(
      await anzahl('select count(*) n from public.team_message_attachments where id = $1', [
        befund.attachment_id,
      ]),
    ).toBe(0);
    expect(await auftraege()).toEqual([befund.object_key]);
  });

  it('nimmt WebM und MP4 auch am Bucket an - und nur dort, nicht in der Akte', async () => {
    const { rows } = await asPostgres<{ id: string; allowed_mime_types: string[] }>(
      `select id, allowed_mime_types from storage.buckets
        where id in ('teamchat', 'patientenakte') order by id`,
    );
    expect(rows.map((r) => [r.id, [...r.allowed_mime_types].sort()])).toEqual([
      ['patientenakte', ['application/pdf', 'image/jpeg', 'image/png']],
      ['teamchat', ['application/pdf', 'audio/mp4', 'audio/webm', 'image/jpeg', 'image/png']],
    ]);
  });

  it('nennt die Sprachnachricht im Löschkonzept (Zweitreview TEAM-004a)', async () => {
    const { rows } = await asPostgres<{ scope_note: string; class_key: string }>(
      `select scope_note, class_key from public.retention_assignments
        where table_name = 'team_message_attachments'`,
    );
    expect(rows.map((r) => r.class_key)).toEqual(['teamchat']);
    expect(rows[0]!.scope_note).toContain('auch Sprachnachrichten');
  });
});

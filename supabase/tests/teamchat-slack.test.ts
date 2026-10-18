import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { gleichzeitig } from './helpers/gleichzeitig';

/**
 * Teamchat, Teil 2 von TEAM-002: Slack-Kern ohne Regelkonflikt (ANN-642 bis
 * ANN-647).
 *
 * Geprüft werden private Kanäle und Gruppennachrichten (nur Mitglieder lesen,
 * auch owner nicht), Antworten „auch im Kanal“, geplante Nachrichten,
 * Reaktionen, Anheften, „Für später“ mit Erinnerung, Einstellungen je
 * Gespräch, @alle, die Suche mit Filtern und der Zähler für die Navigation -
 * jeweils mit den Rechten (ADR-013 Punkt 9 Nr. 1: andere Organisation, Konto
 * ohne Praxisrolle, Plattformkonto, ohne Sitzung, wer nicht Mitglied ist,
 * Tabellenrechte, Ausgeschiedene), ohne Auditeintrag (ADR-010 Punkt 17) und
 * mit dem Löschpfad (ADR-008 Punkt 12): Was an einer Nachricht hängt, fällt
 * mit ihr und mit ihrem Inhalt, auch nach einem Restore.
 */

const { users, organizationId } = SEED;

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
  tom: '55555555-5555-4555-8555-000000000006',
} as const;

const SENDEN =
  'select public.post_team_message($1::uuid, $2::uuid, $3, $4::uuid[], null, $5::boolean, $6::boolean, $7::timestamptz) as id';
const NACHRICHTEN = 'select * from public.list_team_messages($1::uuid, $2::uuid)';
const KANAL_ANLEGEN = 'select public.create_team_channel($1, $2, $3::boolean, $4::uuid[]) as id';
const GRUPPE = 'select public.open_team_group($1::uuid[]) as id';
const SUCHE =
  'select * from public.search_team_messages($1, $2::uuid, $3::uuid, $4::date, $5::date)';
const ZAEHLER = 'select * from public.get_team_chat_summary()';
const REAKTION = 'select public.toggle_team_reaction($1::uuid, $2) as gesetzt';
const ANHEFTEN = 'select public.set_team_message_pinned($1::uuid, $2::boolean)';
const MERKEN = 'select public.save_team_message($1::uuid, $2::timestamptz)';

interface Kanal {
  id: string;
  kind: string;
  name: string | null;
  member_names: string[] | null;
  member_count: number | null;
  unread: number;
  mentions: number;
  notify: string;
  starred: boolean;
  manageable: boolean;
}

interface Nachricht {
  id: string;
  parent_id: string | null;
  body: string | null;
  edited: boolean;
  also_in_channel: boolean;
  unread: boolean;
  reactions: { reaction: string; count: number; own: boolean; names: string[] }[];
  pinned: boolean;
  saved: boolean;
  root_author_name: string | null;
  root_body: string | null;
  new_replies: number;
}

interface Zaehler {
  badge: number;
  unread_conversations: number;
  threads_new: number;
  activity_unread: number;
  saved_open: number;
  reminders_due: number;
  scheduled: number;
}

interface Fehler {
  code?: string;
  message: string;
}

async function fehler(
  konto: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<Fehler | null> {
  try {
    await asUser(konto, sql, params);
    return null;
  } catch (cause) {
    return cause as Fehler;
  }
}

async function kanaele(konto: string): Promise<Kanal[]> {
  return (await asUser<Kanal>(konto, 'select * from public.list_team_channels()')).rows;
}

async function gespraech(konto: string, id: string): Promise<Kanal | undefined> {
  return (await kanaele(konto)).find((k) => k.id === id);
}

async function kanal(konto: string, name: string): Promise<Kanal> {
  const treffer = (await kanaele(konto)).find((k) => k.name === name);
  if (!treffer) throw new Error(`Kanal ${name} fehlt`);
  return treffer;
}

async function senden(
  konto: string,
  kanalId: string,
  text: string,
  optionen: {
    parent?: string | null;
    erwaehnt?: string[];
    alle?: boolean;
    auchImKanal?: boolean;
    um?: string | null;
  } = {},
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, SENDEN, [
    kanalId,
    optionen.parent ?? null,
    text,
    optionen.erwaehnt ?? [],
    optionen.alle ?? false,
    optionen.auchImKanal ?? false,
    optionen.um ?? null,
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

async function privaterKanal(konto: string, name: string, mitglieder: string[]): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, KANAL_ANLEGEN, [
    name,
    null,
    true,
    mitglieder,
  ]);
  return rows[0]!.id;
}

async function gruppe(konto: string, mit: string[]): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, GRUPPE, [mit]);
  return rows[0]!.id;
}

async function zaehler(konto: string): Promise<Zaehler> {
  return (await asUser<Zaehler>(konto, ZAEHLER)).rows[0]!;
}

async function anzahl(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await asPostgres<{ n: string }>(sql, params);
  return Number(rows[0]?.n ?? 0);
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

describe('Teamchat: private Kanäle (ANN-642)', () => {
  it('lesen nur die Mitglieder - owner nicht, auch nicht über Suche, Für dich oder Zähler', async () => {
    const leitung = await privaterKanal(users.teamLead, 'Leitung', [STAFF.anna]);
    const geheim = await senden(users.teamLead, leitung, 'Dienstplan Dezember Entwurf');
    // Eine Erwähnung an der Anwendung vorbei: Auch sie zeigt owner nichts.
    await asPostgres(
      `insert into public.team_message_mentions (organization_id, message_id, staff_member_id)
       values ($1, $2, $3)`,
      [organizationId, geheim, STAFF.jannes],
    );

    expect(await gespraech(users.therapist, leitung)).toMatchObject({
      kind: 'private',
      name: 'Leitung',
      member_count: 2,
      unread: 1,
    });
    for (const konto of [users.ownerTherapist, users.office, users.trainer]) {
      expect(await gespraech(konto, leitung)).toBeUndefined();
      expect((await fehler(konto, NACHRICHTEN, [leitung, null]))?.code).toBe('P0002');
      expect((await asUser(konto, SUCHE, ['Dienstplan', null, null, null, null])).rows).toEqual([]);
      expect(
        (await fehler(konto, 'select * from public.list_team_channel_members($1)', [leitung]))
          ?.code,
      ).toBe('P0002');
      expect(
        (await fehler(konto, 'select * from public.list_team_pins($1)', [leitung]))?.code,
      ).toBe('P0002');
    }
    expect(
      (await asUser(users.ownerTherapist, 'select * from public.list_team_activity()')).rows,
    ).toEqual([]);
    expect(await zaehler(users.ownerTherapist)).toMatchObject({ badge: 0 });
  });

  it('legen nur owner und Teamleitung an; ihr Name verrät nichts', async () => {
    expect(
      (await fehler(users.therapist, KANAL_ANLEGEN, ['Unter uns', null, true, []]))?.code,
    ).toBe('42501');
    // Eindeutig sind nur offene Kanäle: Ein privater Kanal darf wie ein
    // offener oder ein anderer privater heißen - sonst verriete ein
    // abgelehnter Name, dass es ihn gibt (Zweitreview TEAM-002, Befund 5).
    const geheim = await privaterKanal(users.teamLead, 'allgemein', []);
    await privaterKanal(users.ownerTherapist, 'Allgemein', []);
    expect(
      (await fehler(users.ownerTherapist, KANAL_ANLEGEN, ['ALLGEMEIN', null, false, []]))?.code,
    ).toBe('23505');
    const offen = (
      await asUserCommitted<{ id: string }>(users.ownerTherapist, KANAL_ANLEGEN, [
        'Planung',
        null,
        false,
        [],
      ])
    ).rows[0]!.id;
    await asUserCommitted(users.teamLead, 'select public.update_team_channel($1, $2)', [
      geheim,
      'Planung',
    ]);
    await asUserCommitted(users.teamLead, 'select public.update_team_channel($1, $2)', [
      offen,
      'Planung neu',
    ]);
    expect(
      (
        await fehler(users.teamLead, 'select public.update_team_channel($1, $2)', [
          offen,
          'Vertretungen',
        ])
      )?.code,
    ).toBe('23505');
    // Andersherum: owner gehört nicht dazu und darf einen offenen Kanal wie
    // einen privaten nennen - anlegen und umbenennen (Runde 2, Befund 3).
    await privaterKanal(users.teamLead, 'Geheimrunde', []);
    await privaterKanal(users.teamLead, 'Zweite Runde', []);
    await asUserCommitted(users.ownerTherapist, KANAL_ANLEGEN, ['geheimrunde', null, false, []]);
    await asUserCommitted(users.ownerTherapist, 'select public.update_team_channel($1, $2)', [
      offen,
      'Zweite Runde',
    ]);
    // Unbekannte fallen still weg; wer anlegt, gehört dazu.
    const id = await privaterKanal(users.ownerTherapist, 'Leitung', [
      STAFF.tim,
      '55555555-5555-4555-8555-0000000000ff',
    ]);
    const { rows } = await asUser<{ staff_member_id: string }>(
      users.ownerTherapist,
      'select * from public.list_team_channel_members($1)',
      [id],
    );
    expect(rows.map((r) => r.staff_member_id).sort()).toEqual([STAFF.jannes, STAFF.tim].sort());
  });

  it('lässt jedes Mitglied Personen holen; sie lesen auch, was vorher geschrieben wurde', async () => {
    const id = await privaterKanal(users.teamLead, 'Vertretung Weststadt', [STAFF.anna]);
    await senden(users.teamLead, id, 'Wer kann Donnerstag?');
    expect(
      (
        await fehler(users.office, 'select public.add_team_channel_members($1, $2::uuid[])', [
          id,
          [STAFF.olivia],
        ])
      )?.code,
    ).toBe('P0002');
    const { rows } = await asUserCommitted<{ n: number }>(
      users.therapist,
      'select public.add_team_channel_members($1, $2::uuid[]) as n',
      [id, [STAFF.olivia, STAFF.olivia]],
    );
    expect(rows[0]!.n).toBe(1);
    expect((await nachrichten(users.office, id)).map((n) => n.body)).toEqual([
      'Wer kann Donnerstag?',
    ]);
  });

  it('räumt beim Verlassen den eigenen Stand ab; mit dem letzten Mitglied fällt der Kanal, auch nach einem Restore', async () => {
    const id = await privaterKanal(users.teamLead, 'Kurz', [STAFF.anna]);
    const frage = await senden(users.teamLead, id, 'Frage');
    await senden(users.therapist, id, 'Antwort', { parent: frage });
    await asUserCommitted(users.therapist, MERKEN, [frage, null]);
    await asUserCommitted(
      users.therapist,
      'select public.set_team_channel_preferences($1, $2, $3)',
      [id, 'none', true],
    );
    await asUserCommitted(users.therapist, 'select public.mark_team_channel_read($1)', [id]);

    await asUserCommitted(users.therapist, 'select public.leave_team_channel($1)', [id]);
    expect(await gespraech(users.therapist, id)).toBeUndefined();
    for (const tabelle of [
      'team_read_states',
      'team_thread_states',
      'team_channel_settings',
      'team_saved_messages',
    ]) {
      expect(
        await anzahl(`select count(*) n from public.${tabelle} where staff_member_id = $1`, [
          STAFF.anna,
        ]),
      ).toBe(0);
    }
    // Annas Antwort bleibt: Sie gehört dem Gespräch.
    expect((await nachrichten(users.teamLead, id, frage)).map((n) => n.body)).toEqual([
      'Frage',
      'Antwort',
    ]);

    await asUserCommitted(users.teamLead, 'select public.leave_team_channel($1)', [id]);
    expect(await anzahl('select count(*) n from public.team_channels where id = $1', [id])).toBe(0);
    expect(
      await anzahl('select count(*) n from public.team_messages where channel_id = $1', [id]),
    ).toBe(0);
    expect(
      await anzahl(
        `select count(*) n from public.deletion_journal
         where target_table = 'team_channels' and target_id = $1`,
        [id],
      ),
    ).toBe(1);

    // Restore: der Kanal kommt zurück - und fällt bei der Wiederanwendung.
    await asPostgres(
      `insert into public.team_channels (id, organization_id, kind, name) values ($1, $2, 'private', 'Kurz')`,
      [id, organizationId],
    );
    await asPostgres('select public.reapply_deletion_journal()');
    expect(await anzahl('select count(*) n from public.team_channels where id = $1', [id])).toBe(0);
  });

  it('lässt nur verwaltende Mitglieder jemanden herausnehmen, umbenennen und archivieren', async () => {
    const id = await privaterKanal(users.teamLead, 'Leitung', [STAFF.anna, STAFF.olivia]);
    await asUserCommitted(users.office, 'select public.mark_team_channel_read($1)', [id]);
    expect(
      (
        await fehler(users.therapist, 'select public.remove_team_channel_member($1, $2)', [
          id,
          STAFF.olivia,
        ])
      )?.code,
    ).toBe('42501');
    expect(
      (
        await fehler(users.ownerTherapist, 'select public.remove_team_channel_member($1, $2)', [
          id,
          STAFF.olivia,
        ])
      )?.code,
    ).toBe('P0002');
    await asUserCommitted(users.teamLead, 'select public.remove_team_channel_member($1, $2)', [
      id,
      STAFF.olivia,
    ]);
    expect(await gespraech(users.office, id)).toBeUndefined();
    expect(
      await anzahl('select count(*) n from public.team_read_states where staff_member_id = $1', [
        STAFF.olivia,
      ]),
    ).toBe(0);

    expect(
      (
        await fehler(users.therapist, 'select public.update_team_channel($1, $2, $3)', [
          id,
          'Neu',
          null,
        ])
      )?.code,
    ).toBe('42501');
    expect(
      (
        await fehler(users.ownerTherapist, 'select public.update_team_channel($1, $2, $3)', [
          id,
          'Neu',
          null,
        ])
      )?.code,
    ).toBe('P0002');
    await asUserCommitted(users.teamLead, 'select public.update_team_channel($1, $2, $3)', [
      id,
      'Leitungsrunde',
      'Dienstpläne',
    ]);
    expect(await gespraech(users.therapist, id)).toMatchObject({
      name: 'Leitungsrunde',
      manageable: false,
    });
    expect(await gespraech(users.teamLead, id)).toMatchObject({ manageable: true });

    // Archivieren nimmt geplante Nachrichten mit - aber nur durch wen, der
    // verwalten darf (Zweitreview TEAM-002, Runde 2).
    const { rows: zeit } = await asPostgres<{ t: string }>(
      `select (now() + interval '2 hours')::text as t`,
    );
    const geplant = await senden(users.therapist, id, 'Anna plant', { um: zeit[0]!.t });
    expect(
      (await fehler(users.therapist, 'select public.set_team_channel_archived($1, true)', [id]))
        ?.code,
    ).toBe('42501');
    expect(
      (
        await fehler(users.ownerTherapist, 'select public.set_team_channel_archived($1, true)', [
          id,
        ])
      )?.code,
    ).toBe('P0002');
    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1', [geplant]),
    ).toBe(1);

    await asUserCommitted(users.teamLead, 'select public.set_team_channel_archived($1, true)', [
      id,
    ]);
    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1', [geplant]),
    ).toBe(0);
    expect(
      (await fehler(users.therapist, SENDEN, [id, null, 'x', [], false, false, null]))?.code,
    ).toBe('22023');
  });

  it('lässt owner im privaten Kanal nichts Fremdes entfernen, auch als Mitglied', async () => {
    const id = await privaterKanal(users.ownerTherapist, 'Leitung', [STAFF.tim]);
    const n = await senden(users.teamLead, id, 'Von Tim');
    expect(
      (await fehler(users.ownerTherapist, 'select public.delete_team_message($1)', [n]))?.code,
    ).toBe('42501');
  });
});

describe('Teamchat: Gruppennachrichten (ANN-642)', () => {
  it('öffnet für dieselben Personen dasselbe Gespräch; drei bis neun mit sich selbst', async () => {
    const eins = await gruppe(users.therapist, [STAFF.olivia, STAFF.tim]);
    const zwei = await gruppe(users.teamLead, [STAFF.olivia, STAFF.anna, STAFF.anna]);
    expect(zwei).toBe(eins);
    expect(await gespraech(users.therapist, eins)).toMatchObject({
      kind: 'group',
      member_names: ['Olivia Office', 'Tim Teamleitung'],
      member_count: 3,
    });
    // Mit einer Person ist es die Direktnachricht.
    const direkt = await gruppe(users.therapist, [STAFF.olivia]);
    expect((await gespraech(users.therapist, direkt))?.kind).toBe('direct');

    for (const mit of [[], [STAFF.anna], ['55555555-5555-4555-8555-0000000000ff', STAFF.tim]]) {
      expect((await fehler(users.therapist, GRUPPE, [mit]))?.code).toBe('22023');
    }
  });

  it('lesen nur die Mitglieder; Antworten lassen alle dem Thread folgen', async () => {
    const id = await gruppe(users.therapist, [STAFF.olivia, STAFF.tim]);
    const frage = await senden(users.therapist, id, 'Wer nimmt das Rad heute?');
    await senden(users.office, id, 'Ich', { parent: frage });
    expect(await gespraech(users.ownerTherapist, id)).toBeUndefined();
    expect((await fehler(users.ownerTherapist, NACHRICHTEN, [id, null]))?.code).toBe('P0002');
    const beiTim = (await nachrichten(users.teamLead, id)).find((n) => n.id === frage);
    expect(beiTim).toMatchObject({ new_replies: 1 });
    expect(await zaehler(users.teamLead)).toMatchObject({ badge: 1, threads_new: 1 });
  });
});

describe('Teamchat: auch im Kanal und später senden (ANN-643)', () => {
  it('zeigt eine Antwort „auch im Kanal“ im Gespräch und im Thread, gelesen wo auch immer', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(users.therapist, allgemein.id, 'Schlüssel Depot Nord?');
    const antwort = await senden(users.office, allgemein.id, 'Hängt wieder am Brett', {
      parent: frage,
      auchImKanal: true,
    });
    const imKanal = await nachrichten(users.teamLead, allgemein.id);
    expect(imKanal.map((n) => n.id)).toEqual([frage, antwort]);
    expect(imKanal[1]).toMatchObject({
      also_in_channel: true,
      unread: true,
      root_author_name: 'Anna Beispiel',
      root_body: 'Schlüssel Depot Nord?',
    });
    expect((await nachrichten(users.teamLead, allgemein.id, frage)).map((n) => n.id)).toEqual([
      frage,
      antwort,
    ]);
    // Anna folgt dem Thread und liest ihn dort: auch im Gespräch gelesen.
    await asUserCommitted(users.therapist, 'select public.mark_team_thread_read($1)', [frage]);
    expect(await kanal(users.therapist, 'Allgemein')).toMatchObject({ unread: 0 });
    expect(await kanal(users.teamLead, 'Allgemein')).toMatchObject({ unread: 2 });

    expect(
      (await fehler(users.therapist, SENDEN, [allgemein.id, null, 'x', [], false, true, null]))
        ?.code,
    ).toBe('22023');
  });

  it('zeigt eine geplante Nachricht erst zu ihrer Zeit - bis dahin nur unter „Geplant“', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const { rows: zeit } = await asPostgres<{ t: string }>(
      `select (now() + interval '2 hours')::text as t`,
    );
    const geplant = await senden(users.ownerTherapist, allgemein.id, 'Teamtreffen morgen 8 Uhr', {
      erwaehnt: [STAFF.anna],
      um: zeit[0]!.t,
    });

    for (const konto of [users.therapist, users.ownerTherapist]) {
      expect(await nachrichten(konto, allgemein.id)).toEqual([]);
      expect((await asUser(konto, SUCHE, ['Teamtreffen', null, null, null, null])).rows).toEqual(
        [],
      );
    }
    expect(await kanal(users.therapist, 'Allgemein')).toMatchObject({ unread: 0, mentions: 0 });
    expect(
      (await asUser(users.therapist, 'select * from public.list_team_activity()')).rows,
    ).toEqual([]);
    expect(
      (
        await asUser<{ id: string }>(
          users.ownerTherapist,
          'select * from public.list_team_scheduled()',
        )
      ).rows,
    ).toEqual([expect.objectContaining({ id: geplant })]);
    expect(
      (await asUser(users.therapist, 'select * from public.list_team_scheduled()')).rows,
    ).toEqual([]);
    // Fremde ändern und löschen sie nicht, antworten nicht und öffnen keinen
    // Thread - sie wissen nichts von ihr. Auch die Erwähnte nicht, obwohl sie
    // dem Thread schon folgt (Zweitreview TEAM-002, Punkt 1).
    for (const konto of [users.teamLead, users.therapist]) {
      for (const [sql, params] of [
        ['select public.reschedule_team_message($1)', [geplant]],
        ['select public.delete_team_message($1)', [geplant]],
        ["select public.toggle_team_reaction($1, 'daumen')", [geplant]],
        [ANHEFTEN, [geplant, true]],
        [MERKEN, [geplant, null]],
        ['select public.post_team_message($1::uuid, $2::uuid, $3)', [allgemein.id, geplant, 'Ja']],
        [NACHRICHTEN, [allgemein.id, geplant]],
        [
          'select * from public.list_team_messages($1::uuid, null, null, null, null, null, $2::uuid)',
          [allgemein.id, geplant],
        ],
        ['select public.set_team_thread_following($1, true)', [geplant]],
        ['select public.mark_team_unread($1)', [geplant]],
        ['select public.mark_team_thread_read($1, null)', [geplant]],
      ] as const) {
        expect((await fehler(konto, sql, [...params]))?.code).toBe('P0002');
      }
      expect((await asUser(konto, 'select * from public.list_team_threads()')).rows).toEqual([]);
    }
    // Vor der Zeit bearbeitet: ohne Marke.
    await asUserCommitted(
      users.ownerTherapist,
      'select public.edit_team_message($1, $2, $3::uuid[])',
      [geplant, 'Teamtreffen morgen 8:30 Uhr', [STAFF.anna]],
    );

    await asUserCommitted(users.ownerTherapist, 'select public.reschedule_team_message($1)', [
      geplant,
    ]);
    const liste = await nachrichten(users.therapist, allgemein.id);
    expect(liste).toEqual([
      expect.objectContaining({
        id: geplant,
        body: 'Teamtreffen morgen 8:30 Uhr',
        edited: false,
        unread: true,
      }),
    ]);
    expect(await kanal(users.therapist, 'Allgemein')).toMatchObject({ unread: 1, mentions: 1 });
  });

  it('plant nur Ausgangsnachrichten, frühestens in einer Minute und höchstens 30 Tage voraus', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(users.therapist, allgemein.id, 'Frage');
    const { rows } = await asPostgres<{ bald: string; spaet: string; ok: string }>(
      `select (now() + interval '10 seconds')::text bald, (now() + interval '31 days')::text spaet,
              (now() + interval '1 day')::text ok`,
    );
    for (const [parent, um] of [
      [null, rows[0]!.bald],
      [null, rows[0]!.spaet],
      [frage, rows[0]!.ok],
    ] as const) {
      expect(
        (await fehler(users.therapist, SENDEN, [allgemein.id, parent, 'x', [], false, false, um]))
          ?.code,
      ).toBe('22023');
    }
  });
});

describe('Teamchat: Reaktionen und Anheften (ANN-644, ANN-645)', () => {
  it('setzt und nimmt Reaktionen zurück; alle, die lesen, sehen wer - ohne Zeitpunkt', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.therapist, allgemein.id, 'Rad 2 ist wieder frei');
    for (const konto of [users.office, users.teamLead]) {
      const { rows } = await asUserCommitted<{ gesetzt: boolean }>(konto, REAKTION, [n, 'daumen']);
      expect(rows[0]!.gesetzt).toBe(true);
    }
    await asUserCommitted(users.office, REAKTION, [n, 'danke']);
    const { rows: weg } = await asUserCommitted<{ gesetzt: boolean }>(users.office, REAKTION, [
      n,
      'danke',
    ]);
    expect(weg[0]!.gesetzt).toBe(false);

    const beiOlivia = (await nachrichten(users.office, allgemein.id))[0]!;
    expect(beiOlivia.reactions).toEqual([
      { reaction: 'daumen', count: 2, own: true, names: ['Olivia Office', 'Tim Teamleitung'] },
    ]);
    expect((await nachrichten(users.trainer, allgemein.id))[0]!.reactions[0]!.own).toBe(false);
    expect((await fehler(users.office, REAKTION, [n, 'kotzen']))?.code).toBe('22023');

    const { rows: spalten } = await asPostgres<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'team_message_reactions' order by 1`,
    );
    expect(spalten.map((s) => s.column_name)).toEqual([
      'id',
      'message_id',
      'organization_id',
      'reaction',
      'staff_member_id',
    ]);
  });

  it('heftet an und löst; höchstens 50 je Gespräch; nur wer liest', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.therapist, allgemein.id, 'Notfallnummer Werkstatt');
    await asUserCommitted(users.trainer, ANHEFTEN, [n, true]);
    expect((await nachrichten(users.office, allgemein.id))[0]!.pinned).toBe(true);
    expect(
      (
        await asUser<{ id: string }>(users.office, 'select * from public.list_team_pins($1)', [
          allgemein.id,
        ])
      ).rows,
    ).toEqual([expect.objectContaining({ id: n, body: 'Notfallnummer Werkstatt' })]);

    const ids = (
      await asPostgres<{ id: string }>(
        `insert into public.team_messages (organization_id, channel_id, author_staff_member_id, body)
         select $1, $2, $3, 'Nummer ' || g from generate_series(1, 50) g returning id`,
        [organizationId, allgemein.id, STAFF.anna],
      )
    ).rows.map((r) => r.id);
    await asPostgres(
      `insert into public.team_message_pins (organization_id, channel_id, message_id)
       select $1, $2, unnest($3::uuid[]) limit 49`,
      [organizationId, allgemein.id, ids],
    );
    expect((await fehler(users.office, ANHEFTEN, [ids[49], true]))?.code).toBe('22023');
    await asUserCommitted(users.office, ANHEFTEN, [n, false]);
    await asUserCommitted(users.office, ANHEFTEN, [ids[49], true]);
  });

  it('weist Reaktionen und Anheften in fremden Gesprächen und archivierten Kanälen ab', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.open_team_direct($1) as id',
      [STAFF.olivia],
    );
    const privat = await senden(users.therapist, rows[0]!.id, 'Privat');
    const fremd = await fremdeOrganisation();
    for (const [konto, sql, params] of [
      [users.ownerTherapist, REAKTION, [privat, 'daumen']],
      [users.ownerTherapist, ANHEFTEN, [privat, true]],
      [users.ownerTherapist, MERKEN, [privat, null]],
      [fremd.owner, REAKTION, [privat, 'daumen']],
      [fremd.owner, ANHEFTEN, [privat, true]],
      [fremd.owner, MERKEN, [privat, null]],
    ] as const) {
      expect((await fehler(konto, sql, [...params]))?.code).toBe('P0002');
    }
    const vertretungen = await kanal(users.therapist, 'Vertretungen');
    const alt = await senden(users.therapist, vertretungen.id, 'Alt');
    await asUserCommitted(users.teamLead, 'select public.set_team_channel_archived($1, true)', [
      vertretungen.id,
    ]);
    for (const [sql, params] of [
      [REAKTION, [alt, 'daumen']],
      [ANHEFTEN, [alt, true]],
    ] as const) {
      expect((await fehler(users.office, sql, [...params]))?.code).toBe('22023');
    }
  });
});

describe('Teamchat: Für später (ANN-646)', () => {
  it('merkt nur für die Person selbst; eine fällige Erinnerung zählt in der App', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.office, allgemein.id, 'Belege bis Freitag');
    const { rows: zeit } = await asPostgres<{ t: string }>(
      `select (now() + interval '1 hour')::text as t`,
    );
    await asUserCommitted(users.therapist, MERKEN, [n, zeit[0]!.t]);
    expect((await nachrichten(users.therapist, allgemein.id))[0]!.saved).toBe(true);
    expect((await nachrichten(users.teamLead, allgemein.id))[0]!.saved).toBe(false);
    expect((await asUser(users.teamLead, 'select * from public.list_team_saved()')).rows).toEqual(
      [],
    );

    // Die Erinnerung wird fällig.
    await asPostgres(
      `update public.team_saved_messages set remind_at = now() - interval '1 minute' where message_id = $1`,
      [n],
    );
    await asUserCommitted(users.therapist, 'select public.mark_all_team_channels_read()');
    expect(
      (
        await asUser<{ id: string; due: boolean }>(
          users.therapist,
          'select * from public.list_team_saved()',
        )
      ).rows,
    ).toEqual([expect.objectContaining({ id: n, due: true })]);
    expect(await zaehler(users.therapist)).toMatchObject({
      badge: 1,
      reminders_due: 1,
      saved_open: 1,
    });

    await asUserCommitted(users.therapist, 'select public.update_team_saved($1, true)', [n]);
    expect(await zaehler(users.therapist)).toMatchObject({ badge: 0, saved_open: 0 });
    expect(
      (await asUser(users.therapist, 'select * from public.list_team_saved(true)')).rows,
    ).toHaveLength(1);
    await asUserCommitted(users.therapist, 'select public.unsave_team_message($1)', [n]);
    expect(
      await anzahl('select count(*) n from public.team_saved_messages where message_id = $1', [n]),
    ).toBe(0);

    const { rows: weit } = await asPostgres<{ t: string }>(
      `select (now() + interval '91 days')::text as t`,
    );
    expect((await fehler(users.therapist, MERKEN, [n, weit[0]!.t]))?.code).toBe('22023');

    // Wann jemand gemerkt oder erledigt hat, steht nirgends - nur die selbst
    // gewählte Erinnerung (ANN-646, Zweitreview TEAM-002 Befund 4).
    const { rows: spalten } = await asPostgres<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'team_saved_messages'
         and data_type like 'timestamp%'`,
    );
    expect(spalten.map((s) => s.column_name)).toEqual(['remind_at']);
  });

  it('zeigt Gemerktes aus einem Gespräch nicht mehr, das man nicht mehr liest', async () => {
    const flotte = (await kanaele(users.therapist)).find((k) => k.kind === 'fleet')!;
    const n = await senden(users.office, flotte.id, 'Rad 3 steht im Depot Süd');
    await asUserCommitted(users.therapist, MERKEN, [n, null]);
    await asPostgres(
      `update public.user_roles set role_key = 'trainer' where user_id = $1 and role_key = 'therapist'`,
      [users.therapist],
    );
    expect((await asUser(users.therapist, 'select * from public.list_team_saved()')).rows).toEqual(
      [],
    );
  });
});

describe('Teamchat: Einstellungen je Gespräch, @alle und Zähler (ANN-647)', () => {
  it('zählt im Zähler Direktnachrichten, Erwähnungen und Erinnerungen - stumm nur Erwähnungen', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(
      users.office,
      'select public.open_team_direct($1) as id',
      [STAFF.anna],
    );
    const dm = rows[0]!.id;
    await senden(users.office, dm, 'Hast du kurz Zeit?');
    await senden(users.office, dm, 'Geht um Donnerstag');
    const allgemein = await kanal(users.therapist, 'Allgemein');
    await senden(users.teamLead, allgemein.id, 'Ohne Erwähnung');
    await senden(users.teamLead, allgemein.id, 'Anna?', { erwaehnt: [STAFF.anna] });

    expect(await zaehler(users.therapist)).toMatchObject({ badge: 3, unread_conversations: 2 });
    await asUserCommitted(users.therapist, 'select public.set_team_channel_preferences($1, $2)', [
      dm,
      'none',
    ]);
    await asUserCommitted(users.therapist, 'select public.set_team_channel_preferences($1, $2)', [
      allgemein.id,
      'none',
    ]);
    expect(await zaehler(users.therapist)).toMatchObject({ badge: 1, unread_conversations: 1 });
    expect(await gespraech(users.therapist, allgemein.id)).toMatchObject({
      notify: 'none',
      starred: false,
      mentions: 1,
    });
    await asUserCommitted(
      users.therapist,
      'select public.set_team_channel_preferences($1, null, true)',
      [allgemein.id],
    );
    expect(await gespraech(users.therapist, allgemein.id)).toMatchObject({
      notify: 'none',
      starred: true,
    });
    // Andere bleiben, wie sie sind (§20).
    expect(await gespraech(users.office, allgemein.id)).toMatchObject({ notify: 'all' });
    expect(
      (
        await fehler(users.therapist, 'select public.set_team_channel_preferences($1, $2)', [
          allgemein.id,
          'laut',
        ])
      )?.code,
    ).toBe('22023');
  });

  it('erwähnt mit @alle, wer das Gespräch liest - im privaten Kanal nur die Mitglieder', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.office, allgemein.id, '@alle Teamtreffen', { alle: true });
    const { rows } = await asPostgres<{ staff_member_id: string }>(
      'select staff_member_id from public.team_message_mentions where message_id = $1 order by 1',
      [n],
    );
    expect(rows.map((r) => r.staff_member_id)).toEqual(
      [STAFF.jannes, STAFF.anna, STAFF.tim, STAFF.tom].sort(),
    );

    const leitung = await privaterKanal(users.teamLead, 'Leitung', [STAFF.anna]);
    const p = await senden(users.teamLead, leitung, '@alle bitte lesen', { alle: true });
    const { rows: privat } = await asPostgres<{ staff_member_id: string }>(
      'select staff_member_id from public.team_message_mentions where message_id = $1',
      [p],
    );
    expect(privat.map((r) => r.staff_member_id)).toEqual([STAFF.anna]);
  });
});

describe('Teamchat: Suche mit Filtern', () => {
  it('filtert nach Gespräch, Person und Zeitraum; ohne Wort nur im Gespräch, nie nach Person (ANN-651)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const vertretungen = await kanal(users.therapist, 'Vertretungen');
    await senden(users.therapist, allgemein.id, 'Rad 2 Kette');
    const tim = await senden(users.teamLead, allgemein.id, 'Rad 3 Licht');
    await senden(users.teamLead, vertretungen.id, 'Rad 4 Bremse');
    const alt = await senden(users.teamLead, vertretungen.id, 'Rad 5 alt');
    await asPostgres(
      `update public.team_messages set created_at = now() - interval '40 days' where id = $1`,
      [alt],
    );

    const suche = async (params: unknown[]) =>
      (await asUser<{ body: string }>(users.office, SUCHE, params)).rows.map((r) => r.body);
    expect(await suche(['rad', allgemein.id, null, null, null])).toEqual([
      'Rad 3 Licht',
      'Rad 2 Kette',
    ]);
    expect(await suche(['rad', null, STAFF.tim, null, null])).toEqual([
      'Rad 4 Bremse',
      'Rad 3 Licht',
      'Rad 5 alt',
    ]);
    const { rows: tag } = await asPostgres<{ d: string }>(
      `select ((now() - interval '7 days') at time zone 'Europe/Berlin')::date::text as d`,
    );
    expect(await suche(['rad', null, STAFF.tim, tag[0]!.d, null])).toEqual([
      'Rad 4 Bremse',
      'Rad 3 Licht',
    ]);
    expect(
      (
        await asUser<{ id: string }>(users.office, SUCHE, [
          'licht',
          allgemein.id,
          STAFF.tim,
          null,
          null,
        ])
      ).rows.map((r) => r.id),
    ).toEqual([tim]);
    // Ohne Wort: ein Gespräch ansehen ja, eine Person und alles ohne Ort nein -
    // „alles von Tim“ wäre eine Liste seines Verhaltens (§20).
    expect(await suche([null, allgemein.id, null, null, null])).toEqual([
      'Rad 3 Licht',
      'Rad 2 Kette',
    ]);
    for (const params of [
      [null, null, null, tag[0]!.d, null],
      [null, null, STAFF.tim, null, null],
      [null, allgemein.id, STAFF.tim, null, null],
      ['r', allgemein.id, null, null, null],
    ]) {
      expect((await fehler(users.office, SUCHE, params))?.code).toBe('22023');
    }
  });
});

describe('Teamchat: Rechte an den neuen Wegen (ADR-013 Punkt 9 Nr. 1)', () => {
  const LESEND = [
    ['select * from public.get_team_chat_summary()', []],
    ['select * from public.list_team_saved()', []],
    ['select * from public.list_team_scheduled()', []],
  ] as const;

  it('weist Konten ohne Praxisrolle, Plattformkonten und Anfragen ohne Sitzung ab', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.therapist, allgemein.id, 'Hallo');
    const wege = [
      ...LESEND,
      ['select * from public.list_team_pins($1)', [allgemein.id]],
      ['select * from public.list_team_channel_members($1)', [allgemein.id]],
      [REAKTION, [n, 'daumen']],
      [ANHEFTEN, [n, true]],
      [MERKEN, [n, null]],
      ['select public.update_team_saved($1, true)', [n]],
      ['select public.unsave_team_message($1)', [n]],
      ['select public.set_team_channel_preferences($1, $2)', [allgemein.id, 'none']],
      [GRUPPE, [[STAFF.olivia, STAFF.tim]]],
      [KANAL_ANLEGEN, ['X', null, true, []]],
      ['select public.update_team_channel($1, $2)', [allgemein.id, 'X']],
      ['select public.add_team_channel_members($1, $2::uuid[])', [allgemein.id, [STAFF.tom]]],
      ['select public.remove_team_channel_member($1, $2)', [allgemein.id, STAFF.tom]],
      ['select public.leave_team_channel($1)', [allgemein.id]],
      ['select public.reschedule_team_message($1)', [n]],
      // Neu angelegte Signaturen und geänderte Wege (Zweitreview Runde 3, Befund 4).
      [SENDEN, [allgemein.id, null, 'X', [], false, false, null]],
      [NACHRICHTEN, [allgemein.id, null]],
      [SUCHE, ['Hallo', null, null, null, null]],
      ['select public.edit_team_message($1, $2, $3::uuid[], $4::boolean)', [n, 'Neu', [], false]],
      ['select public.delete_team_message($1)', [n]],
      ['select public.mark_all_team_channels_read()', []],
      ['select public.set_team_channel_archived($1, true)', [allgemein.id]],
    ] as const;
    for (const [sql, params] of wege) {
      for (const konto of [users.patientMax, users.plattformTina]) {
        expect((await fehler(konto, sql, [...params]))?.code).toBe('42501');
      }
      expect((await fehler(null, sql, [...params]))?.code).toBe('42501');
      await expect(asAnon(sql, [...params])).rejects.toThrow();
    }
  });

  it('zeigt einer fremden Praxis nichts und lässt sie nichts ändern', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.therapist, allgemein.id, 'Hallo');
    await asUserCommitted(users.therapist, MERKEN, [n, null]);
    await asUserCommitted(users.office, ANHEFTEN, [n, true]);
    const leitung = await privaterKanal(users.teamLead, 'Leitung', [STAFF.anna]);
    const fremd = await fremdeOrganisation();
    expect(await zaehler(fremd.owner)).toMatchObject({ badge: 0, saved_open: 0 });
    expect((await asUser(fremd.owner, 'select * from public.list_team_saved()')).rows).toEqual([]);
    for (const [sql, params] of [
      ['select * from public.list_team_pins($1)', [allgemein.id]],
      ['select * from public.list_team_channel_members($1)', [allgemein.id]],
      ['select public.set_team_channel_preferences($1, $2)', [allgemein.id, 'none']],
      ['select public.update_team_channel($1, $2)', [allgemein.id, 'Fremd']],
      ['select public.set_team_channel_archived($1, true)', [allgemein.id]],
      ['select public.update_team_saved($1, true)', [n]],
      // Die Mitgliederwege eines privaten Kanals (Zweitreview TEAM-002, Punkt 1).
      ['select public.add_team_channel_members($1, $2::uuid[])', [leitung, [STAFF.olivia]]],
      ['select public.remove_team_channel_member($1, $2)', [leitung, STAFF.anna]],
      ['select public.leave_team_channel($1)', [leitung]],
    ] as const) {
      expect((await fehler(fremd.owner, sql, [...params]))?.code).toBe('P0002');
    }
    expect(
      await anzahl('select count(*) n from public.team_channel_members where channel_id = $1', [
        leitung,
      ]),
    ).toBe(2);
    expect((await fehler(fremd.owner, GRUPPE, [[STAFF.olivia, STAFF.tim]]))?.code).toBe('22023');
  });

  it('gibt keiner Anwendungsrolle ein Recht an den neuen Tabellen', async () => {
    for (const tabelle of [
      'team_message_reactions',
      'team_message_pins',
      'team_saved_messages',
      'team_channel_settings',
    ]) {
      expect((await fehler(users.ownerTherapist, `select * from public.${tabelle}`))?.code).toBe(
        '42501',
      );
      const { rows } = await asPostgres<{ recht: boolean }>(
        `select bool_or(has_table_privilege(r, $1, p)) as recht
         from unnest(array['anon', 'authenticated']) r,
              unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p`,
        [`public.${tabelle}`],
      );
      expect(rows[0]!.recht).toBe(false);
    }
  });

  it('hält die internen Helfer verschlossen - sie löschen und leiten ab, ohne selbst zu prüfen', async () => {
    // app.team_drop_scheduled löscht fremde geplante Nachrichten einer Praxis;
    // ihr einziger Schutz ist der Entzug (Zweitreview TEAM-002, Runde 2).
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const { rows: zeit } = await asPostgres<{ t: string }>(
      `select (now() + interval '2 hours')::text as t`,
    );
    const geplant = await senden(users.office, allgemein.id, 'Geplant', { um: zeit[0]!.t });
    for (const name of ['team_drop_scheduled', 'team_message_key', 'team_forget_channel']) {
      const { rows } = await asPostgres<{ erlaubt: boolean }>(
        `select bool_or(has_function_privilege(r, p.oid, 'EXECUTE')) as erlaubt
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
              unnest(array['anon', 'authenticated']) r
         where n.nspname = 'app' and p.proname = $1`,
        [name],
      );
      expect(rows[0]?.erlaubt, name).toBe(false);
    }
    // Alle internen Helfer des Teamchats, nicht nur diese drei - etwa
    // app.team_view liefert Nachrichten ohne jede Prüfung (Runde 3, Befund 4).
    const { rows: offen } = await asPostgres<{ name: string }>(
      `select distinct p.proname as name
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
            unnest(array['anon', 'authenticated']) r
       where n.nspname = 'app' and p.proname like '%team%'
         and has_function_privilege(r, p.oid, 'EXECUTE')`,
    );
    expect(offen.map((z) => z.name)).toEqual([]);
    expect(
      await anzahl(
        `select count(*) n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'app' and p.proname like '%team%'`,
      ),
    ).toBeGreaterThanOrEqual(20);
    expect(
      (
        await fehler(users.ownerTherapist, 'select app.team_drop_scheduled($1, $2, null)', [
          organizationId,
          allgemein.id,
        ])
      )?.code,
    ).toBe('42501');
    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1', [geplant]),
    ).toBe(1);
  });

  it('schreibt keinen Auditeintrag (ADR-010 Punkt 17)', async () => {
    const vorher = await anzahl('select count(*) n from public.audit_log');
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.therapist, allgemein.id, 'Hallo', { alle: true });
    await asUserCommitted(users.office, REAKTION, [n, 'daumen']);
    await asUserCommitted(users.office, ANHEFTEN, [n, true]);
    await asUserCommitted(users.office, MERKEN, [n, null]);
    await asUserCommitted(users.office, 'select public.set_team_channel_preferences($1, $2)', [
      allgemein.id,
      'mentions',
    ]);
    const id = await privaterKanal(users.teamLead, 'Leitung', [STAFF.anna]);
    await asUserCommitted(users.teamLead, 'select public.leave_team_channel($1)', [id]);
    await gruppe(users.therapist, [STAFF.olivia, STAFF.tim]);
    expect(await anzahl('select count(*) n from public.audit_log')).toBe(vorher);
  });
});

describe('Teamchat: Löschpfad der neuen Tabellen (ADR-008 Punkt 12)', () => {
  it('nimmt mit dem Inhalt einer Nachricht Reaktionen, Angeheftetes und Gemerktes mit - auch nach einem Restore', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.office, allgemein.id, 'Versehentlich ein Patientenname');
    await senden(users.therapist, allgemein.id, 'Bitte löschen', { parent: n });
    await asUserCommitted(users.therapist, REAKTION, [n, 'augen']);
    await asUserCommitted(users.therapist, ANHEFTEN, [n, true]);
    await asUserCommitted(users.therapist, MERKEN, [n, null]);

    await asUserCommitted(users.ownerTherapist, 'select public.delete_team_message($1)', [n]);
    for (const tabelle of ['team_message_reactions', 'team_message_pins', 'team_saved_messages']) {
      expect(
        await anzahl(`select count(*) n from public.${tabelle} where message_id = $1`, [n]),
      ).toBe(0);
    }

    // Restore: Text und Reaktion kommen zurück - die Wiederanwendung leert beides.
    await asPostgres(
      `update public.team_messages
         set body = 'Versehentlich ein Patientenname', author_staff_member_id = $2,
             removed_at = null, removed_kind = null, removed_by_staff_member_id = null
       where id = $1`,
      [n, STAFF.olivia],
    );
    await asPostgres(
      `insert into public.team_message_reactions (organization_id, message_id, staff_member_id, reaction)
       values ($1, $2, $3, 'augen')`,
      [organizationId, n, STAFF.anna],
    );
    await asPostgres('select public.reapply_deletion_journal()');
    expect(
      await anzahl('select count(*) n from public.team_message_reactions where message_id = $1', [
        n,
      ]),
    ).toBe(0);
    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1 and body is null', [
        n,
      ]),
    ).toBe(1);
  });

  it('räumt Gemerktes und Einstellungen Ausgeschiedener ab, lässt ihre Reaktionen bis zur Frist', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.office, allgemein.id, 'Rad 1 hat einen Platten');
    await asUserCommitted(users.teamLead, REAKTION, [n, 'erledigt']);
    await asUserCommitted(users.teamLead, MERKEN, [n, null]);
    await asUserCommitted(users.teamLead, 'select public.set_team_channel_preferences($1, $2)', [
      allgemein.id,
      'mentions',
    ]);
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.tim],
    );
    await asPostgres('select public.apply_retention()');
    for (const tabelle of ['team_saved_messages', 'team_channel_settings']) {
      expect(
        await anzahl(`select count(*) n from public.${tabelle} where staff_member_id = $1`, [
          STAFF.tim,
        ]),
      ).toBe(0);
    }
    expect(
      await anzahl(
        'select count(*) n from public.team_message_reactions where staff_member_id = $1',
        [STAFF.tim],
      ),
    ).toBe(1);

    // Mit der Nachricht fällt auch die Reaktion.
    await asPostgres(
      `update public.team_messages set created_at = now() - interval '13 months' where id = $1`,
      [n],
    );
    await asPostgres('select public.apply_retention()');
    expect(
      await anzahl('select count(*) n from public.team_message_reactions where message_id = $1', [
        n,
      ]),
    ).toBe(0);
  });

  it('lässt Ungesendetes nicht erscheinen, wenn die Verfasser:in geht, herausgenommen wird oder ausscheidet, und nicht im Archiv', async () => {
    const { rows: zeit } = await asPostgres<{ t: string }>(
      `select (now() + interval '2 hours')::text as t`,
    );
    const um = zeit[0]!.t;
    const leitung = await privaterKanal(users.teamLead, 'Leitung', [STAFF.anna, STAFF.olivia]);
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const vertretungen = await kanal(users.therapist, 'Vertretungen');
    const verlassen = await senden(users.therapist, leitung, 'Anna plant', { um });
    const genommen = await senden(users.office, leitung, 'Olivia plant', { um });
    const archiviert = await senden(users.office, allgemein.id, 'Vor dem Archiv', { um });
    const ausgeschieden = await senden(users.trainer, vertretungen.id, 'Tom plant', { um });
    const bleibt = await senden(users.teamLead, vertretungen.id, 'Tim plant', { um });

    await asUserCommitted(users.therapist, 'select public.leave_team_channel($1)', [leitung]);
    await asUserCommitted(users.teamLead, 'select public.remove_team_channel_member($1, $2)', [
      leitung,
      STAFF.olivia,
    ]);
    await asUserCommitted(
      users.ownerTherapist,
      'select public.set_team_channel_archived($1, true)',
      [allgemein.id],
    );
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.tom],
    );
    await asPostgres('select public.apply_retention()');

    for (const id of [verlassen, genommen, archiviert, ausgeschieden]) {
      expect(await anzahl('select count(*) n from public.team_messages where id = $1', [id])).toBe(
        0,
      );
      expect(
        await anzahl(
          `select count(*) n from public.deletion_journal
           where target_table = 'team_messages' and target_id = $1`,
          [id],
        ),
      ).toBe(1);
    }
    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1', [bleibt]),
    ).toBe(1);

    // Restore: Die Wiederanwendung nimmt sie wieder heraus.
    await asPostgres(
      `insert into public.team_messages
         (id, organization_id, channel_id, author_staff_member_id, body, created_at)
       values ($1, $2, $3, $4, 'Anna plant', now() + interval '2 hours')`,
      [verlassen, organizationId, leitung, STAFF.anna],
    );
    await asPostgres('select public.reapply_deletion_journal()');
    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1', [verlassen]),
    ).toBe(0);
  });

  it('lässt Geplantes gesperrter Konten und nach einem Rollenwechsel mit dem Lauf fallen', async () => {
    const { rows: zeit } = await asPostgres<{ t: string }>(
      `select (now() + interval '2 hours')::text as t`,
    );
    const um = zeit[0]!.t;
    const direkt = (
      await asUserCommitted<{ id: string }>(
        users.office,
        'select public.open_team_direct($1) as id',
        [STAFF.tim],
      )
    ).rows[0]!.id;
    const flotte = (await kanaele(users.therapist)).find((k) => k.kind === 'fleet')!;
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const gesperrt = await senden(users.office, direkt, 'Olivia plant', { um });
    const rollenwechsel = await senden(users.therapist, flotte.id, 'Anna plant', { um });
    const bleibt = await senden(users.teamLead, allgemein.id, 'Tim plant', { um });

    // Konto gesperrt (wie set_staff_account_active) - ein kompromittiertes
    // Konto hinterlässt nichts, was später erscheint (Runde 2, Befund 1).
    await asPostgres('update public.user_profiles set is_active = false where id = $1', [
      users.office,
    ]);
    // Anna wird Trainingsbetreuung und liest die Radflotte nicht mehr.
    await asPostgres(
      `update public.user_roles set role_key = 'trainer' where user_id = $1 and role_key = 'therapist'`,
      [users.therapist],
    );
    await asPostgres('select public.apply_retention()');

    for (const id of [gesperrt, rollenwechsel]) {
      expect(await anzahl('select count(*) n from public.team_messages where id = $1', [id])).toBe(
        0,
      );
      expect(
        await anzahl(
          `select count(*) n from public.deletion_journal
           where target_table = 'team_messages' and target_id = $1
             and run_id is distinct from md5('team_manual:' || organization_id::text || ':' || current_date::text)::uuid`,
          [id],
        ),
      ).toBe(1);
    }
    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1', [bleibt]),
    ).toBe(1);
  });

  it('löscht einen privaten Kanal, sobald kein aktives Mitglied mehr dabei ist', async () => {
    const id = await privaterKanal(users.teamLead, 'Abschied', [STAFF.tom]);
    await senden(users.trainer, id, 'Letzter Tag');
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.tom],
    );
    await asPostgres('select public.apply_retention()');
    expect(await anzahl('select count(*) n from public.team_channels where id = $1', [id])).toBe(1);

    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.tim],
    );
    await asPostgres('select public.apply_retention()');
    expect(await anzahl('select count(*) n from public.team_channels where id = $1', [id])).toBe(0);
    expect(
      await anzahl(
        `select count(*) n from public.deletion_journal
         where target_table = 'team_channels' and target_id = $1`,
        [id],
      ),
    ).toBe(1);
    const { rows } = await asPostgres<{ scope_note: string }>(
      `select scope_note from public.retention_assignments where table_name = 'team_channels'`,
    );
    expect(rows[0]!.scope_note).toContain('private Kanäle');
  });

  it('löscht leere Gruppennachrichten nach zwölf Monaten, mit Journal', async () => {
    const id = await gruppe(users.therapist, [STAFF.olivia, STAFF.tim]);
    await asPostgres(
      `update public.team_channels set created_at = now() - interval '13 months' where id = $1`,
      [id],
    );
    await asPostgres('select public.apply_retention()');
    expect(await anzahl('select count(*) n from public.team_channels where id = $1', [id])).toBe(0);
    expect(
      await anzahl(
        `select count(*) n from public.deletion_journal where target_table = 'team_channels' and target_id = $1`,
        [id],
      ),
    ).toBe(1);
  });
});

describe('Teamchat: Rennen und Lesestand beim Senden (Zweitreview TEAM-002, Runde 3)', () => {
  it('lässt Geplantes in einem archivierten Gespräch mit dem täglichen Lauf fallen', async () => {
    // Ein Rennen mit dem Archivieren nachgestellt: Die geplante Nachricht
    // landet nach dem sofortigen Fallenlassen (Befund 2).
    const { rows: zeit } = await asPostgres<{ t: string }>(
      `select (now() + interval '2 hours')::text as t`,
    );
    const vertretungen = await kanal(users.therapist, 'Vertretungen');
    const geplant = await senden(users.therapist, vertretungen.id, 'Anna plant', {
      um: zeit[0]!.t,
    });
    await asPostgres('update public.team_channels set archived_at = now() where id = $1', [
      vertretungen.id,
    ]);
    await asPostgres('select public.apply_retention()');
    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1', [geplant]),
    ).toBe(0);
    expect(
      await anzahl(
        `select count(*) n from public.deletion_journal
         where target_table = 'team_messages' and target_id = $1`,
        [geplant],
      ),
    ).toBe(1);
  });

  it('zeigt am leeren Anker weder Reaktionen noch „angeheftet“ (Befund 3)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const wurzel = await senden(users.therapist, allgemein.id, 'Wer hat Rad 2?');
    await senden(users.office, allgemein.id, 'Ich', { parent: wurzel });
    await asUserCommitted(users.therapist, 'select public.delete_team_message($1)', [wurzel]);
    // Reaktion und Anheften, die ein Rennen mit dem Entfernen überstanden.
    await asPostgres(
      `insert into public.team_message_reactions (organization_id, message_id, staff_member_id, reaction)
       values ($1, $2, $3, 'daumen')`,
      [organizationId, wurzel, STAFF.olivia],
    );
    await asPostgres(
      `insert into public.team_message_pins (organization_id, channel_id, message_id)
       values ($1, $2, $3)`,
      [organizationId, allgemein.id, wurzel],
    );
    const anker = (await nachrichten(users.office, allgemein.id)).find((m) => m.id === wurzel)!;
    expect(anker.body).toBeNull();
    expect(anker.reactions).toEqual([]);
    expect(anker.pinned).toBe(false);
    expect(
      (await asUser(users.office, 'select * from public.list_team_pins($1)', [allgemein.id])).rows,
    ).toEqual([]);
  });

  it('zieht beim Senden keinen Lesestand vor - Ungezeigtes anderer bleibt neu (ANN-640)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const wurzel = await senden(users.therapist, allgemein.id, 'Wer übernimmt Frau B.?');
    await asUserCommitted(users.therapist, 'select public.mark_team_channel_read($1, null)', [
      allgemein.id,
    ]);
    // Olivia schreibt; Anna sendet, bevor ihre Ansicht es gezeigt hat.
    await senden(users.office, allgemein.id, 'Ich nicht, ich bin im Büro.');
    await senden(users.office, allgemein.id, 'Tim vielleicht', { parent: wurzel });
    await senden(users.therapist, allgemein.id, 'Dann frage ich Tim.');
    expect((await kanal(users.therapist, 'Allgemein')).unread).toBe(1);
    await senden(users.therapist, allgemein.id, 'Danke', { parent: wurzel });
    const imGespraech = (await nachrichten(users.therapist, allgemein.id)).find(
      (m) => m.id === wurzel,
    )!;
    expect(imGespraech.new_replies).toBe(1);
  });
});

describe('Teamchat: Sperren gegen Rennen (Zweitreview TEAM-002, Runde 4)', () => {
  async function inZweiStunden(): Promise<string> {
    const { rows } = await asPostgres<{ t: string }>(
      `select (now() + interval '2 hours')::text as t`,
    );
    return rows[0]!.t;
  }
  const ARCHIVIEREN = 'select public.set_team_channel_archived($1::uuid, true)';
  const HERAUSNEHMEN = 'select public.remove_team_channel_member($1::uuid, $2::uuid)';
  const geplant = (kanalId: string, um: string) => ({
    konto: users.therapist,
    sql: SENDEN,
    params: [kanalId, null, 'Anna plant', [], false, false, um],
  });
  const vonAnnaGeplant = (kanalId: string) =>
    anzahl(
      `select count(*) n from public.team_messages
       where channel_id = $1 and author_staff_member_id = $2 and created_at > now()`,
      [kanalId, STAFF.anna],
    );

  it('lässt geplantes Senden auf ein Archivieren warten - danach nimmt das Gespräch nichts an', async () => {
    const vertretungen = await kanal(users.therapist, 'Vertretungen');
    const fehler = await gleichzeitig(
      { konto: users.teamLead, sql: ARCHIVIEREN, params: [vertretungen.id] },
      geplant(vertretungen.id, await inZweiStunden()),
    );
    expect(fehler?.code).toBe('22023');
    expect(await vonAnnaGeplant(vertretungen.id)).toBe(0);
  });

  it('lässt ein Archivieren auf geplantes Senden warten - und die Nachricht mit Journal fallen', async () => {
    const vertretungen = await kanal(users.therapist, 'Vertretungen');
    const fehler = await gleichzeitig(geplant(vertretungen.id, await inZweiStunden()), {
      konto: users.teamLead,
      sql: ARCHIVIEREN,
      params: [vertretungen.id],
    });
    expect(fehler).toBeNull();
    expect(await vonAnnaGeplant(vertretungen.id)).toBe(0);
    expect(
      await anzahl(
        `select count(*) n from public.deletion_journal
         where target_table = 'team_messages' and organization_id = $1`,
        [organizationId],
      ),
    ).toBe(1);
  });

  it('lässt geplantes Senden auf ein Herausnehmen warten - danach liest Anna nicht mehr', async () => {
    const leitung = await privaterKanal(users.teamLead, 'Leitung', [STAFF.anna]);
    const fehler = await gleichzeitig(
      { konto: users.teamLead, sql: HERAUSNEHMEN, params: [leitung, STAFF.anna] },
      geplant(leitung, await inZweiStunden()),
    );
    expect(fehler?.code).toBe('P0002');
    expect(await vonAnnaGeplant(leitung)).toBe(0);
  });

  it('prüft zwei Verwaltende, die sich gegenseitig herausnehmen, nacheinander (N3)', async () => {
    const leitung = await privaterKanal(users.teamLead, 'Leitung', [STAFF.jannes]);
    const fehler = await gleichzeitig(
      { konto: users.teamLead, sql: HERAUSNEHMEN, params: [leitung, STAFF.jannes] },
      { konto: users.ownerTherapist, sql: HERAUSNEHMEN, params: [leitung, STAFF.tim] },
    );
    expect(fehler?.code).toBe('P0002');
    const { rows } = await asPostgres<{ id: string }>(
      'select staff_member_id as id from public.team_channel_members where channel_id = $1',
      [leitung],
    );
    expect(rows.map((r) => r.id)).toEqual([STAFF.tim]);
  });

  it('lässt eine Reaktion auf ein Entfernen warten - am leeren Anker hängt danach nichts', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const wurzel = await senden(users.therapist, allgemein.id, 'Wer hat Rad 2?');
    await senden(users.office, allgemein.id, 'Ich', { parent: wurzel });
    const fehler = await gleichzeitig(
      {
        konto: users.therapist,
        sql: 'select public.delete_team_message($1::uuid)',
        params: [wurzel],
      },
      { konto: users.office, sql: REAKTION, params: [wurzel, 'daumen'] },
    );
    expect(fehler?.code).toBe('P0002');
    expect(
      await anzahl('select count(*) n from public.team_message_reactions where message_id = $1', [
        wurzel,
      ]),
    ).toBe(0);
  });

  it('zieht auch mit „Jetzt senden“ keinen Lesestand vor (ANN-640)', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const spaeter = await senden(users.therapist, allgemein.id, 'Teamtreffen 8 Uhr', {
      um: await inZweiStunden(),
    });
    await asUserCommitted(users.therapist, 'select public.mark_team_channel_read($1, null)', [
      allgemein.id,
    ]);
    await senden(users.office, allgemein.id, 'Ich komme später.');
    await asUserCommitted(users.therapist, 'select public.reschedule_team_message($1)', [spaeter]);
    expect((await kanal(users.therapist, 'Allgemein')).unread).toBe(1);
  });
});

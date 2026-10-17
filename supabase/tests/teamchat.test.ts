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

/**
 * Teamchat (TEAM-001, PROJECT_PRINCIPLES.md §10 „Intern“, §20).
 *
 * Geprüft werden die Rechte (ADR-013 Punkt 9 Nr. 1: andere Organisation,
 * Konto ohne Praxisrolle, Plattformkonto, ohne Sitzung, Tabellenrechte,
 * Ausgeschiedene), dass Direktnachrichten nur die zwei Beteiligten lesen -
 * auch owner nicht -, dass der Lesestand nur die eigene Zählung ändert
 * (ANN-609), Erwähnungen, Bearbeiten und Löschen samt Anker, die Moderation
 * durch owner nur in offenen Kanälen, Archivieren, der Löschlauf nach zwölf
 * Monaten mit Anker und Wiederanwendung nach einem Restore (ANN-610) und dass
 * kein Auditeintrag entsteht (ADR-010 Punkt 17).
 */

const { users, organizationId } = SEED;

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
  tom: '55555555-5555-4555-8555-000000000006',
} as const;

const KANAELE = 'select * from public.list_team_channels()';
const NACHRICHTEN = 'select * from public.list_team_messages($1::uuid, $2::uuid)';
const SENDEN = 'select public.post_team_message($1::uuid, $2::uuid, $3, $4::uuid[]) as id';
const DIREKT = 'select public.open_team_direct($1::uuid) as id';

interface Kanal {
  id: string;
  kind: 'channel' | 'direct';
  name: string | null;
  archived: boolean;
  partner_staff_member_id: string | null;
  partner_name: string | null;
  unread: number;
  mentions: number;
}

interface Nachricht {
  id: string;
  parent_id: string | null;
  author_staff_member_id: string | null;
  author_name: string | null;
  body: string | null;
  edited: boolean;
  removed_kind: string | null;
  reply_count: number;
  mentions: string[];
  own: boolean;
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
  return (await asUser<Kanal>(konto, KANAELE)).rows;
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
  parent: string | null = null,
  erwaehnt: string[] = [],
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, SENDEN, [
    kanalId,
    parent,
    text,
    erwaehnt,
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

async function direkt(konto: string, mit: string): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, DIREKT, [mit]);
  return rows[0]!.id;
}

async function anzahl(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await asPostgres<{ n: string }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

beforeEach(async () => {
  await resetDatabase();
}, 120_000);

describe('Teamchat: wer teilnimmt', () => {
  it('zeigt jeder Praxisrolle die drei Startkanäle', async () => {
    for (const konto of [
      users.ownerTherapist,
      users.therapist,
      users.office,
      users.teamLead,
      users.trainer,
    ]) {
      const namen = (await kanaele(konto)).map((k) => k.name).sort();
      expect(namen).toEqual(['Allgemein', 'Flotte', 'Vertretungen']);
    }
  });

  it('weist Konten ohne Praxisrolle, Plattformkonten und Anfragen ohne Sitzung ab', async () => {
    for (const konto of [users.patientMax, users.plattformTina]) {
      expect((await fehler(konto, KANAELE))?.code).toBe('42501');
      expect((await fehler(konto, 'select * from public.list_team_people()'))?.code).toBe('42501');
    }
    expect((await fehler(null, KANAELE))?.code).toBe('42501');
    await expect(asAnon(KANAELE)).rejects.toThrow();
  });

  it('gibt keiner Anwendungsrolle ein Recht an den Tabellen', async () => {
    for (const tabelle of [
      'team_channels',
      'team_channel_members',
      'team_messages',
      'team_message_mentions',
      'team_read_states',
    ]) {
      expect((await fehler(users.ownerTherapist, `select * from public.${tabelle}`))?.code).toBe(
        '42501',
      );
      // Auch TRUNCATE, das RLS nicht erfasst (Zweitreview TEAM-001). Die
      // Testdatenbank vergibt neuen Tabellen keine Rechte von selbst; die
      // Migration entzieht sie ausdrücklich für Supabase.
      const { rows } = await asPostgres<{ recht: boolean }>(
        `select bool_or(has_table_privilege(r, $1, p)) as recht
         from unnest(array['anon', 'authenticated']) r,
              unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p`,
        [`public.${tabelle}`],
      );
      expect(rows[0]!.recht).toBe(false);
    }
  });

  it('weist Bearbeiten, Löschen und Lesen über fremde Praxen und fremde Gespräche ab', async () => {
    const fremd = await fremdeOrganisation();
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.therapist, allgemein.id, 'Unser Text');
    const fremdAllgemein = (await kanaele(fremd.owner)).find((k) => k.name === 'Allgemein')!;
    for (const [sql, params] of [
      ['select public.edit_team_message($1, $2, $3::uuid[])', [n, 'Fremd', []]],
      ['select public.delete_team_message($1)', [n]],
      ['select public.mark_team_channel_read($1)', [allgemein.id]],
      [NACHRICHTEN, [fremdAllgemein.id, n]],
    ] as const) {
      expect((await fehler(fremd.owner, sql, [...params]))?.code).toBe('P0002');
    }
    // Eine Ausgangsnachricht aus einem anderen Kanal ist kein Thread hier.
    const flotte = await kanal(users.therapist, 'Flotte');
    expect((await fehler(users.therapist, NACHRICHTEN, [flotte.id, n]))?.code).toBe('P0002');
    expect((await fehler(users.therapist, SENDEN, [flotte.id, n, 'x', []]))?.code).toBe('P0002');
  });

  it('nimmt Ausgeschiedene heraus: kein Zugang, keine Erwähnung, keine Direktnachricht', async () => {
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.olivia],
    );
    expect((await fehler(users.office, KANAELE))?.code).toBe('42501');
    const leute = (
      await asUser<{ staff_member_id: string }>(
        users.therapist,
        'select * from public.list_team_people()',
      )
    ).rows.map((r) => r.staff_member_id);
    expect(leute).not.toContain(STAFF.olivia);
    expect(leute).not.toContain(STAFF.anna);
    expect((await fehler(users.therapist, DIREKT, [STAFF.olivia]))?.code).toBe('22023');
  });

  it('legt einer neuen Praxis die Startkanäle an und hält Praxen getrennt', async () => {
    const fremd = await fremdeOrganisation();
    const allgemein = await kanal(users.therapist, 'Allgemein');
    await senden(users.therapist, allgemein.id, 'Nur für unsere Praxis');

    const namen = (await kanaele(fremd.owner)).map((k) => k.name).sort();
    expect(namen).toEqual(['Allgemein', 'Flotte', 'Vertretungen']);
    expect((await kanaele(fremd.owner)).map((k) => k.id)).not.toContain(allgemein.id);
    expect((await fehler(fremd.owner, NACHRICHTEN, [allgemein.id, null]))?.code).toBe('P0002');
    expect((await fehler(fremd.owner, SENDEN, [allgemein.id, null, 'x', []]))?.code).toBe('P0002');
    const treffer = await asUser(fremd.owner, 'select * from public.search_team_messages($1)', [
      'unsere Praxis',
    ]);
    expect(treffer.rows).toEqual([]);
    // Personen der anderen Praxis lassen sich weder erwähnen noch anschreiben.
    expect((await fehler(users.therapist, DIREKT, [fremd.staffMember]))?.code).toBe('22023');
  });
});

describe('Teamchat: Kanäle, Threads und Erwähnungen', () => {
  it('zeigt eine Nachricht allen im Kanal, die Antwort im Thread', async () => {
    const flotte = await kanal(users.therapist, 'Flotte');
    const frage = await senden(users.therapist, flotte.id, 'Kette an Rad 4 springt ab.');
    await senden(users.teamLead, flotte.id, 'Ich schaue morgen drauf.', frage);

    const imKanal = await nachrichten(users.trainer, flotte.id);
    expect(imKanal).toHaveLength(1);
    expect(imKanal[0]).toMatchObject({
      id: frage,
      author_name: 'Anna Beispiel',
      body: 'Kette an Rad 4 springt ab.',
      reply_count: 1,
      own: false,
    });
    const thread = await nachrichten(users.office, flotte.id, frage);
    expect(thread.map((n) => n.body)).toEqual([
      'Kette an Rad 4 springt ab.',
      'Ich schaue morgen drauf.',
    ]);
    // Eine Antwort auf eine Antwort gibt es nicht.
    expect((await fehler(users.office, SENDEN, [flotte.id, thread[1]!.id, 'x', []]))?.code).toBe(
      'P0002',
    );
  });

  it('zählt Ungelesenes und Erwähnungen nur für die Person selbst', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    await senden(users.therapist, allgemein.id, 'Tim, hast du den Schlüssel?', null, [
      STAFF.tim,
      STAFF.anna,
      '55555555-5555-4555-8555-0000000000ff',
    ]);

    expect(await kanal(users.therapist, 'Allgemein')).toMatchObject({ unread: 0, mentions: 0 });
    expect(await kanal(users.teamLead, 'Allgemein')).toMatchObject({ unread: 1, mentions: 1 });
    expect(await kanal(users.office, 'Allgemein')).toMatchObject({ unread: 1, mentions: 0 });
    const n = await nachrichten(users.teamLead, allgemein.id);
    expect(n[0]!.mentions).toEqual([STAFF.tim]);

    await asUserCommitted(users.teamLead, 'select public.mark_team_channel_read($1)', [
      allgemein.id,
    ]);
    expect(await kanal(users.teamLead, 'Allgemein')).toMatchObject({ unread: 0, mentions: 0 });
    // Olivias Stand bleibt, wie er ist - es gibt keine gemeinsame Lesemarke.
    expect(await kanal(users.office, 'Allgemein')).toMatchObject({ unread: 1 });
    await asUserCommitted(users.office, 'select public.mark_all_team_channels_read()');
    expect((await kanaele(users.office)).every((k) => k.unread === 0)).toBe(true);
  });

  it('speichert als Lesestand die Zeit der Nachricht, nicht die des Lesens', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    await senden(users.therapist, allgemein.id, 'Hallo');
    await asPostgres(
      `update public.team_messages set created_at = now() - interval '3 days' where channel_id = $1`,
      [allgemein.id],
    );
    await asUserCommitted(users.office, 'select public.mark_team_channel_read($1)', [allgemein.id]);
    const { rows } = await asPostgres<{ abstand: boolean }>(
      `select r.read_up_to < now() - interval '2 days' as abstand
       from public.team_read_states r where r.channel_id = $1 and r.staff_member_id = $2`,
      [allgemein.id, STAFF.olivia],
    );
    expect(rows[0]!.abstand).toBe(true);
  });

  it('prüft den Text vor dem Schreiben und nennt ihn nie im Fehler', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    expect((await fehler(users.therapist, SENDEN, [allgemein.id, null, '   ', []]))?.code).toBe(
      '22023',
    );
    const lang = 'Geheimnis'.repeat(500);
    const f = await fehler(users.therapist, SENDEN, [allgemein.id, null, lang, []]);
    expect(f?.code).toBe('22023');
    expect(f?.message).not.toContain('Geheimnis');
  });

  it('findet Text in lesbaren Gesprächen und verlangt zwei Zeichen', async () => {
    const vertretungen = await kanal(users.therapist, 'Vertretungen');
    await senden(users.therapist, vertretungen.id, 'Wer übernimmt Dienstag Nachmittag?');
    const { rows } = await asUser<{ body: string; channel_id: string }>(
      users.trainer,
      'select * from public.search_team_messages($1)',
      ['dienstag'],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        channel_id: vertretungen.id,
        body: 'Wer übernimmt Dienstag Nachmittag?',
      }),
    ]);
    expect(
      (await fehler(users.trainer, 'select * from public.search_team_messages($1)', ['d']))?.code,
    ).toBe('22023');
  });
});

describe('Teamchat: Direktnachrichten', () => {
  it('lesen nur die zwei Beteiligten - auch owner nicht', async () => {
    const id = await direkt(users.therapist, STAFF.olivia);
    expect(await direkt(users.office, STAFF.anna)).toBe(id);
    await senden(users.office, id, 'Kannst du mich zurückrufen?', null, [STAFF.tim, STAFF.anna]);

    const beiAnna = (await kanaele(users.therapist)).find((k) => k.id === id);
    expect(beiAnna).toMatchObject({
      kind: 'direct',
      partner_staff_member_id: STAFF.olivia,
      partner_name: 'Olivia Office',
      unread: 1,
      mentions: 1,
    });

    for (const konto of [users.ownerTherapist, users.teamLead, users.trainer]) {
      expect((await kanaele(konto)).map((k) => k.id)).not.toContain(id);
      expect((await fehler(konto, NACHRICHTEN, [id, null]))?.code).toBe('P0002');
      expect((await fehler(konto, SENDEN, [id, null, 'x', []]))?.code).toBe('P0002');
      const treffer = await asUser(konto, 'select * from public.search_team_messages($1)', [
        'zurückrufen',
      ]);
      expect(treffer.rows).toEqual([]);
    }
    // Tim war nicht beteiligt: Seine Erwähnung fällt weg.
    expect(await anzahl(`select count(*) n from public.team_message_mentions`)).toBe(1);
  });

  it('lässt owner fremde Direktnachrichten nicht entfernen', async () => {
    const id = await direkt(users.therapist, STAFF.olivia);
    const n = await senden(users.therapist, id, 'Privat');
    expect(
      (await fehler(users.ownerTherapist, 'select public.delete_team_message($1)', [n]))?.code,
    ).toBe('P0002');
  });

  it('nimmt keine Nachricht mehr an, wenn die andere Person ausgeschieden ist', async () => {
    const id = await direkt(users.therapist, STAFF.olivia);
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.olivia],
    );
    expect((await kanaele(users.therapist)).find((k) => k.id === id)?.partner_name).toBe(
      'Olivia Office',
    );
    expect((await fehler(users.therapist, SENDEN, [id, null, 'Hallo?', []]))?.code).toBe('22023');
  });

  it('weist eine Direktnachricht an sich selbst ab', async () => {
    expect((await fehler(users.therapist, DIREKT, [STAFF.anna]))?.code).toBe('22023');
  });
});

describe('Teamchat: bearbeiten, löschen, entfernen, archivieren', () => {
  it('bearbeitet nur Eigenes, ohne Verlauf, mit Marke', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.therapist, allgemein.id, 'Treffen um 9');
    await asUserCommitted(users.therapist, 'select public.edit_team_message($1, $2, $3::uuid[])', [
      n,
      'Treffen um 10',
      [],
    ]);
    expect((await nachrichten(users.office, allgemein.id))[0]).toMatchObject({
      body: 'Treffen um 10',
      edited: true,
    });
    expect(
      (
        await fehler(users.office, 'select public.edit_team_message($1, $2, $3::uuid[])', [
          n,
          'Fremd',
          [],
        ])
      )?.code,
    ).toBe('P0002');
  });

  it('löscht Eigenes endgültig, mit Antworten bleibt ein Anker ohne Inhalt', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const allein = await senden(users.therapist, allgemein.id, 'Vertippt');
    const mitAntwort = await senden(users.therapist, allgemein.id, 'Frage', null, [STAFF.tim]);
    await senden(users.office, allgemein.id, 'Antwort', mitAntwort);

    await asUserCommitted(users.therapist, 'select public.delete_team_message($1)', [allein]);
    await asUserCommitted(users.therapist, 'select public.delete_team_message($1)', [mitAntwort]);

    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1', [allein]),
    ).toBe(0);
    const anker = (await nachrichten(users.office, allgemein.id)).find((n) => n.id === mitAntwort);
    expect(anker).toMatchObject({
      body: null,
      removed_kind: 'author',
      reply_count: 1,
      mentions: [],
    });
    expect(
      (await fehler(users.office, 'select public.delete_team_message($1)', [mitAntwort]))?.code,
    ).toBe('P0002');
  });

  it('lässt nur owner fremde Nachrichten in offenen Kanälen entfernen', async () => {
    const flotte = await kanal(users.therapist, 'Flotte');
    const n = await senden(users.therapist, flotte.id, 'Versehentlich ein Name');
    for (const konto of [users.teamLead, users.office, users.trainer]) {
      expect((await fehler(konto, 'select public.delete_team_message($1)', [n]))?.code).toBe(
        '42501',
      );
    }
    await asUserCommitted(users.ownerTherapist, 'select public.delete_team_message($1)', [n]);
    const { rows } = await asPostgres<{
      body: string | null;
      removed_kind: string;
      removed_by_staff_member_id: string;
    }>(
      'select body, removed_kind, removed_by_staff_member_id from public.team_messages where id = $1',
      [n],
    );
    expect(rows[0]).toEqual({
      body: null,
      removed_kind: 'owner',
      removed_by_staff_member_id: STAFF.jannes,
    });
  });

  it('archiviert durch owner und Teamleitung; danach nur noch lesbar', async () => {
    const flotte = await kanal(users.therapist, 'Flotte');
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const archivieren = 'select public.set_team_channel_archived($1, $2)';
    expect((await fehler(users.therapist, archivieren, [flotte.id, true]))?.code).toBe('42501');
    expect((await fehler(users.teamLead, archivieren, [allgemein.id, true]))?.code).toBe('P0002');
    await asUserCommitted(users.teamLead, archivieren, [flotte.id, true]);
    expect(await kanal(users.trainer, 'Flotte')).toMatchObject({ archived: true });
    expect((await fehler(users.trainer, SENDEN, [flotte.id, null, 'x', []]))?.code).toBe('22023');
    await asUserCommitted(users.ownerTherapist, archivieren, [flotte.id, false]);
    expect(await kanal(users.trainer, 'Flotte')).toMatchObject({ archived: false });
  });

  it('legt Kanäle nur durch owner und Teamleitung an, Namen einmalig', async () => {
    const anlegen = 'select public.create_team_channel($1, $2) as id';
    expect((await fehler(users.therapist, anlegen, ['Fortbildung', null]))?.code).toBe('42501');
    await asUserCommitted(users.teamLead, anlegen, ['Fortbildung', 'Kurse und Termine']);
    expect((await kanaele(users.therapist)).map((k) => k.name)).toContain('Fortbildung');
    expect((await fehler(users.ownerTherapist, anlegen, ['fortbildung', null]))?.code).toBe(
      '23505',
    );
  });

  it('schreibt keinen Auditeintrag', async () => {
    const vorher = await anzahl('select count(*) n from public.audit_log');
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const n = await senden(users.therapist, allgemein.id, 'Hallo');
    await asUserCommitted(users.therapist, 'select public.delete_team_message($1)', [n]);
    await direkt(users.therapist, STAFF.tim);
    expect(await anzahl('select count(*) n from public.audit_log')).toBe(vorher);
  });
});

describe('Teamchat: Restore nach eigenem Löschen und Entfernen (ADR-008 Punkt 8)', () => {
  it('bringt gelöschte und entfernte Texte nach einem Restore nicht zurück', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const allein = await senden(users.therapist, allgemein.id, 'Vertippt');
    const versehentlich = await senden(users.office, allgemein.id, 'Name einer Patientin');
    await senden(users.teamLead, allgemein.id, 'Antwort', versehentlich);
    await asUserCommitted(users.therapist, 'select public.delete_team_message($1)', [allein]);
    await asUserCommitted(users.ownerTherapist, 'select public.delete_team_message($1)', [
      versehentlich,
    ]);

    const journal = await asPostgres<{ target_table: string; target_id: string }>(
      `select target_table, target_id from public.deletion_journal
       where retention_class = 'teamchat' order by target_table`,
    );
    expect(journal.rows).toEqual([
      { target_table: 'team_message_contents', target_id: versehentlich },
      { target_table: 'team_messages', target_id: allein },
    ]);

    // Restore: beide Stände kommen zurück.
    await asPostgres(
      `insert into public.team_messages (id, organization_id, channel_id, author_staff_member_id, body)
       values ($1, $2, $3, $4, 'Vertippt')`,
      [allein, organizationId, allgemein.id, STAFF.anna],
    );
    await asPostgres(
      `update public.team_messages
         set body = 'Name einer Patientin', removed_at = null, removed_kind = null,
             removed_by_staff_member_id = null
       where id = $1`,
      [versehentlich],
    );
    await asPostgres('select public.reapply_deletion_journal()');

    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1', [allein]),
    ).toBe(0);
    const { rows } = await asPostgres<{ body: string | null; antworten: string }>(
      `select m.body, (select count(*) from public.team_messages r where r.parent_id = m.id) as antworten
       from public.team_messages m where m.id = $1`,
      [versehentlich],
    );
    expect(rows[0]).toEqual({ body: null, antworten: '1' });
  });
});

describe('Teamchat: Löschlauf (ANN-610)', () => {
  async function alt(id: string, monate: number): Promise<void> {
    await asPostgres(
      `update public.team_messages set created_at = now() - make_interval(months => $2::int, days => 2) where id = $1`,
      [id, monate],
    );
  }

  it('löscht nach zwölf Monaten, lässt den Anker mit laufender Antwort und journalisiert', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const alleinAlt = await senden(users.therapist, allgemein.id, 'Alt allein');
    const wurzel = await senden(users.therapist, allgemein.id, 'Alte Frage', null, [STAFF.tim]);
    const antwortAlt = await senden(users.office, allgemein.id, 'Alte Antwort', wurzel);
    const antwortNeu = await senden(users.teamLead, allgemein.id, 'Neue Antwort', wurzel);
    const frisch = await senden(users.therapist, allgemein.id, 'Frisch');
    await alt(alleinAlt, 12);
    await alt(wurzel, 13);
    await alt(antwortAlt, 12);
    await alt(antwortNeu, 11);

    const dmLeer = await direkt(users.therapist, STAFF.tom);
    await asPostgres(
      `update public.team_channels set created_at = now() - interval '13 months' where id = $1`,
      [dmLeer],
    );

    await asPostgres('select public.apply_retention()');

    const uebrig = await asPostgres<{
      id: string;
      body: string | null;
      author_staff_member_id: string | null;
      removed_kind: string | null;
    }>(
      `select id, body, author_staff_member_id, removed_kind from public.team_messages
       where channel_id = $1 order by created_at`,
      [allgemein.id],
    );
    expect(uebrig.rows.map((r) => r.id)).toEqual([wurzel, antwortNeu, frisch]);
    expect(uebrig.rows[0]).toMatchObject({
      body: null,
      author_staff_member_id: null,
      removed_kind: 'retention',
    });
    expect(await anzahl('select count(*) n from public.team_message_mentions')).toBe(0);
    expect(
      await anzahl('select count(*) n from public.team_channels where id = $1', [dmLeer]),
    ).toBe(0);

    const journal = await asPostgres<{ target_table: string; target_id: string }>(
      `select target_table, target_id from public.deletion_journal
       where retention_class = 'teamchat' order by target_table, target_id`,
    );
    expect(journal.rows).toEqual(
      expect.arrayContaining([
        { target_table: 'team_messages', target_id: alleinAlt },
        { target_table: 'team_messages', target_id: antwortAlt },
        { target_table: 'team_channels', target_id: dmLeer },
      ]),
    );
    expect(journal.rows).toHaveLength(3);

    const { rows } = await asPostgres<{ teamchat: number }>(
      `select (context->>'teamchat')::int as teamchat from public.audit_log
       where action = 'retention.applied' order by occurred_at desc limit 1`,
    );
    expect(rows[0]!.teamchat).toBe(3);

    // Fällt auch die letzte Antwort, geht der Anker mit.
    await alt(antwortNeu, 13);
    await asPostgres('select public.apply_retention()');
    expect(
      await anzahl('select count(*) n from public.team_messages where id = any($1::uuid[])', [
        [wurzel, antwortNeu],
      ]),
    ).toBe(0);
  });

  it('räumt verwaiste Anker und den Lesestand Ausgeschiedener ab', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const wurzel = await senden(users.therapist, allgemein.id, 'Frage');
    const antwort = await senden(users.office, allgemein.id, 'Antwort', wurzel);
    await asUserCommitted(users.therapist, 'select public.delete_team_message($1)', [wurzel]);
    await asUserCommitted(users.office, 'select public.delete_team_message($1)', [antwort]);
    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1', [wurzel]),
    ).toBe(1);

    await asUserCommitted(users.teamLead, 'select public.mark_team_channel_read($1)', [
      allgemein.id,
    ]);
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.tim],
    );
    await asPostgres('select public.apply_retention()');

    expect(
      await anzahl('select count(*) n from public.team_messages where id = $1', [wurzel]),
    ).toBe(0);
    expect(
      await anzahl('select count(*) n from public.team_read_states where staff_member_id = $1', [
        STAFF.tim,
      ]),
    ).toBe(0);
    expect(
      await anzahl('select count(*) n from public.team_read_states where staff_member_id = $1', [
        STAFF.anna,
      ]),
    ).toBe(1);
  });

  it('wendet nach einem Restore die Löschung und den Anker erneut an', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const wurzel = await senden(users.therapist, allgemein.id, 'Alte Frage');
    const weg = await senden(users.office, allgemein.id, 'Alte Antwort', wurzel);
    await senden(users.teamLead, allgemein.id, 'Neue Antwort', wurzel);
    await alt(wurzel, 13);
    await alt(weg, 13);
    await asPostgres('select public.apply_retention()');

    // Restore: die alten Stände kommen zurück.
    await asPostgres(
      `insert into public.team_messages (id, organization_id, channel_id, parent_id, author_staff_member_id, body, created_at)
       values ($1, $2, $3, $4, $5, 'Alte Antwort', now() - interval '13 months')`,
      [weg, organizationId, allgemein.id, wurzel, STAFF.olivia],
    );
    await asPostgres(
      `update public.team_messages
         set body = 'Alte Frage', author_staff_member_id = $2, removed_at = null, removed_kind = null
       where id = $1`,
      [wurzel, STAFF.anna],
    );

    await asPostgres('select public.reapply_deletion_journal()');
    expect(await anzahl('select count(*) n from public.team_messages where id = $1', [weg])).toBe(
      0,
    );
    const { rows } = await asPostgres<{
      body: string | null;
      author_staff_member_id: string | null;
    }>('select body, author_staff_member_id from public.team_messages where id = $1', [wurzel]);
    expect(rows[0]).toEqual({ body: null, author_staff_member_id: null });
  });
});

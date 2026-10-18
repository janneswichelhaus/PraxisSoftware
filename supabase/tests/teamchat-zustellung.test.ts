import { beforeEach, describe, expect, it } from 'vitest';
import { nachrichtKennung } from '@/features/teamchat/kennung';
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
 * Teamchat, Teil 1 von TEAM-002: Lesen und Zustellen ohne Verlust (ANN-640,
 * ANN-641).
 *
 * Geprüft wird, dass das Öffnen eines Threads nur dessen Stand vorzieht und
 * nie den des Gesprächs, dass gelesen nur bis zur gezeigten Nachricht gilt,
 * dass zweimal Gesendetes einmal gespeichert ist (ADR-024 Punkt 7), dass
 * Blättern bei gleicher Zeit weder Nachrichten verliert noch verdoppelt, wie
 * Folgen, Entfolgen und „ab hier ungelesen“ wirken - und die Rechte daran
 * (ADR-013 Punkt 9 Nr. 1): andere Praxis, Konto ohne Praxisrolle,
 * Plattformkonto, ohne Sitzung, fremde Direktnachricht, Trainingsbetreuung
 * an der Radflotte, Tabellenrechte, Ausgeschiedene.
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
  'select public.post_team_message($1::uuid, $2::uuid, $3, $4::uuid[], $5::uuid) as id';
const NACHRICHTEN =
  'select * from public.list_team_messages($1::uuid, $2::uuid, $3::timestamptz, $4::uuid, $5::timestamptz, $6::uuid, $7::uuid, $8::int)';
const THREAD_GELESEN = 'select public.mark_team_thread_read($1::uuid, $2::timestamptz)';
const KANAL_GELESEN = 'select public.mark_team_channel_read($1::uuid, $2::timestamptz)';
const FOLGEN = 'select public.set_team_thread_following($1::uuid, $2::boolean)';
const UNGELESEN = 'select public.mark_team_unread($1::uuid)';

interface Kanal {
  id: string;
  kind: string;
  name: string | null;
  unread: number;
  mentions: number;
}

interface Nachricht {
  id: string;
  parent_id: string | null;
  body: string | null;
  own: boolean | null;
  unread: boolean;
  new_replies: number;
  mentioned_in_new_replies: boolean;
  following: boolean;
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
  id: string | null = null,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, SENDEN, [
    kanalId,
    parent,
    text,
    erwaehnt,
    id,
  ]);
  return rows[0]!.id;
}

interface Blatt {
  parent?: string | null;
  vorAt?: string | null;
  vorId?: string | null;
  nachAt?: string | null;
  nachId?: string | null;
  um?: string | null;
  grenze?: number | null;
}

async function nachrichten(
  konto: string,
  kanalId: string,
  blatt: Blatt = {},
): Promise<Nachricht[]> {
  return (
    await asUser<Nachricht>(konto, NACHRICHTEN, [
      kanalId,
      blatt.parent ?? null,
      blatt.vorAt ?? null,
      blatt.vorId ?? null,
      blatt.nachAt ?? null,
      blatt.nachId ?? null,
      blatt.um ?? null,
      blatt.grenze ?? null,
    ])
  ).rows;
}

/** Die genaue Zeit einer Nachricht als Text - `pg` kürzt Date auf Millisekunden. */
async function zeit(id: string): Promise<string> {
  const { rows } = await asPostgres<{ t: string }>(
    'select created_at::text as t from public.team_messages where id = $1',
    [id],
  );
  return rows[0]!.t;
}

async function wurzel(konto: string, kanalId: string, id: string): Promise<Nachricht> {
  const treffer = (await nachrichten(konto, kanalId)).find((n) => n.id === id);
  if (!treffer) throw new Error(`Nachricht ${id} fehlt`);
  return treffer;
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

describe('Teamchat: Lesestand je Thread (ANN-640)', () => {
  it('zieht beim Öffnen eines Threads nur dessen Stand vor, nie den des Gesprächs', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(users.therapist, allgemein.id, 'Wer hat Rad 2?');
    await senden(users.office, allgemein.id, 'Ich', frage);
    await senden(users.teamLead, allgemein.id, 'Neue Frage ohne Thread');

    expect(await kanal(users.therapist, 'Allgemein')).toMatchObject({ unread: 1 });
    expect(await wurzel(users.therapist, allgemein.id, frage)).toMatchObject({ new_replies: 1 });

    // Anna öffnet nur den Thread: Die neue Ausgangsnachricht bleibt neu.
    await asUserCommitted(users.therapist, THREAD_GELESEN, [frage, null]);
    expect(await kanal(users.therapist, 'Allgemein')).toMatchObject({ unread: 1 });
    expect(await wurzel(users.therapist, allgemein.id, frage)).toMatchObject({ new_replies: 0 });

    // Umgekehrt: Das Gespräch zu lesen lässt neue Antworten im Thread neu.
    await senden(users.teamLead, allgemein.id, 'Und Rad 3?', frage);
    await asUserCommitted(users.therapist, KANAL_GELESEN, [allgemein.id, null]);
    expect(await kanal(users.therapist, 'Allgemein')).toMatchObject({ unread: 0 });
    expect(await wurzel(users.therapist, allgemein.id, frage)).toMatchObject({ new_replies: 1 });
    const { rows } = await asUser<{ new_replies: number }>(
      users.therapist,
      'select * from public.list_team_threads()',
    );
    expect(rows).toEqual([expect.objectContaining({ id: frage, new_replies: 1 })]);
  });

  it('zählt Antworten nicht als ungelesen im Gespräch, Erwähnungen darin aber schon', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(users.therapist, allgemein.id, 'Schlüssel Depot Nord?');
    await senden(users.office, allgemein.id, 'Hängt am Brett', frage);
    await senden(users.teamLead, allgemein.id, 'Olivia, danke', frage, [STAFF.olivia]);

    expect(await kanal(users.therapist, 'Allgemein')).toMatchObject({ unread: 0, mentions: 0 });
    // Olivia ist in einer Antwort erwähnt: „für dich“ am Gespräch.
    expect(await kanal(users.office, 'Allgemein')).toMatchObject({ mentions: 1 });
    await asUserCommitted(users.office, THREAD_GELESEN, [frage, null]);
    expect(await kanal(users.office, 'Allgemein')).toMatchObject({ mentions: 0 });
  });

  it('markiert nur bis zur gezeigten Nachricht als gelesen', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const erste = await senden(users.office, allgemein.id, 'Erste');
    const gezeigt = await zeit(erste);
    // Zwischen Laden und Markieren kommt eine weitere Nachricht.
    await senden(users.teamLead, allgemein.id, 'Zweite');

    await asUserCommitted(users.therapist, KANAL_GELESEN, [allgemein.id, gezeigt]);
    expect(await kanal(users.therapist, 'Allgemein')).toMatchObject({ unread: 1 });
    const liste = await nachrichten(users.therapist, allgemein.id);
    expect(liste.map((n) => [n.body, n.unread])).toEqual([
      ['Erste', false],
      ['Zweite', true],
    ]);

    // Im Thread genauso.
    const frage = await senden(users.therapist, allgemein.id, 'Frage');
    const antwort = await senden(users.office, allgemein.id, 'Antwort 1', frage);
    const bisAntwort = await zeit(antwort);
    await senden(users.teamLead, allgemein.id, 'Antwort 2', frage);
    await asUserCommitted(users.therapist, THREAD_GELESEN, [frage, bisAntwort]);
    expect(await wurzel(users.therapist, allgemein.id, frage)).toMatchObject({ new_replies: 1 });
  });

  it('lässt einen späteren Stand nie zurückfallen', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const erste = await senden(users.office, allgemein.id, 'Erste');
    const frueh = await zeit(erste);
    await senden(users.office, allgemein.id, 'Zweite');
    await asUserCommitted(users.therapist, KANAL_GELESEN, [allgemein.id, null]);
    await asUserCommitted(users.therapist, KANAL_GELESEN, [allgemein.id, frueh]);
    expect(await kanal(users.therapist, 'Allgemein')).toMatchObject({ unread: 0 });
  });

  it('macht ab einer Nachricht wieder ungelesen - im Gespräch und am Thread', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    await senden(users.office, allgemein.id, 'Eins');
    const zwei = await senden(users.office, allgemein.id, 'Zwei');
    await senden(users.office, allgemein.id, 'Drei');
    await asUserCommitted(users.therapist, KANAL_GELESEN, [allgemein.id, null]);

    await asUserCommitted(users.therapist, UNGELESEN, [zwei]);
    expect(await kanal(users.therapist, 'Allgemein')).toMatchObject({ unread: 2 });
    expect((await nachrichten(users.therapist, allgemein.id)).map((n) => n.unread)).toEqual([
      false,
      true,
      true,
    ]);
    // Andere bleiben unberührt (§20).
    await asUserCommitted(users.teamLead, KANAL_GELESEN, [allgemein.id, null]);
    expect(await kanal(users.teamLead, 'Allgemein')).toMatchObject({ unread: 0 });

    const frage = await senden(users.teamLead, allgemein.id, 'Frage');
    const a1 = await senden(users.office, allgemein.id, 'A1', frage);
    await senden(users.office, allgemein.id, 'A2', frage);
    // Anna folgte nicht - ab hier ungelesen lässt sie folgen.
    await asUserCommitted(users.therapist, UNGELESEN, [a1]);
    expect(await wurzel(users.therapist, allgemein.id, frage)).toMatchObject({
      following: true,
      new_replies: 2,
    });
  });
});

describe('Teamchat: Folgen (ANN-640)', () => {
  it('folgt beim Beginnen, Antworten und Erwähnen; Entfolgen nimmt den Thread heraus', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(users.therapist, allgemein.id, 'Wer übernimmt Dienstag?');
    await senden(users.office, allgemein.id, 'Ich nicht', frage);
    await senden(users.teamLead, allgemein.id, 'Tom?', frage, [STAFF.tom]);

    const beiTom = await wurzel(users.trainer, allgemein.id, frage);
    expect(beiTom).toMatchObject({ following: true, mentioned_in_new_replies: true });
    // Erwähnt: Was vor der Erwähnung kam, gilt als gesehen.
    expect(beiTom.new_replies).toBe(1);

    await asUserCommitted(users.office, FOLGEN, [frage, false]);
    await senden(users.therapist, allgemein.id, 'Dann ich', frage);
    expect(await wurzel(users.office, allgemein.id, frage)).toMatchObject({
      following: false,
      new_replies: 0,
    });
    expect((await asUser(users.office, 'select * from public.list_team_threads()')).rows).toEqual(
      [],
    );
    const aktivitaet = await asUser<{ body: string }>(
      users.office,
      'select * from public.list_team_activity()',
    );
    expect(aktivitaet.rows).toEqual([]);

    // Eine neue Erwähnung lässt wieder folgen.
    await senden(users.teamLead, allgemein.id, 'Olivia, doch?', frage, [STAFF.olivia]);
    expect(await wurzel(users.office, allgemein.id, frage)).toMatchObject({ following: true });
  });

  it('lässt jemanden ausdrücklich folgen; bis dahin gilt alles als gesehen', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(users.therapist, allgemein.id, 'Kette Rad 4');
    await senden(users.office, allgemein.id, 'Schon gemeldet', frage);
    await asUserCommitted(users.trainer, FOLGEN, [frage, true]);
    expect(await wurzel(users.trainer, allgemein.id, frage)).toMatchObject({
      following: true,
      new_replies: 0,
    });
    await senden(users.office, allgemein.id, 'Werkstatt kommt', frage);
    expect(await wurzel(users.trainer, allgemein.id, frage)).toMatchObject({ new_replies: 1 });
  });

  it('lässt in einer Direktnachricht beide jedem Thread folgen', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.open_team_direct($1) as id',
      [STAFF.olivia],
    );
    const dm = rows[0]!.id;
    const frage = await senden(users.therapist, dm, 'Kurze Frage');
    await senden(users.therapist, dm, 'Nachtrag dazu', frage);
    expect(await wurzel(users.office, dm, frage)).toMatchObject({
      following: true,
      new_replies: 1,
    });
  });
});

describe('Teamchat: Zustellung ohne Doppel (ANN-641, ADR-024 Punkt 7)', () => {
  const KENNUNG = 'c0ffee00-0000-4000-8000-000000000001';

  it('speichert zweimal Gesendetes einmal - unter der Kennung, die auch das Gerät ableitet', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const erst = await senden(users.therapist, allgemein.id, 'Rad 2 ist frei', null, [], KENNUNG);
    const nochmal = await senden(
      users.therapist,
      allgemein.id,
      'Rad 2 ist frei',
      null,
      [],
      KENNUNG,
    );
    expect(nochmal).toBe(erst);
    // Server und Gerät leiten gleich ab (`kennung.ts`, `app.team_message_key`).
    expect(erst).toBe(await nachrichtKennung(STAFF.anna, KENNUNG));
    expect(
      await anzahl('select count(*) n from public.team_messages where channel_id = $1', [
        allgemein.id,
      ]),
    ).toBe(1);
  });

  it('lässt eine fremde Kennung nichts treffen und verrät nicht, ob es sie gibt', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const original = await senden(users.therapist, allgemein.id, 'Original', null, [], KENNUNG);
    const UNBEKANNT = 'c0ffee00-0000-4000-8000-0000000000aa';
    const fremd = await fremdeOrganisation();
    const fremdesGespraech = (await kanaele(fremd.owner)).find((k) => k.kind === 'fleet')!;
    // Dieselbe Gerätekennung, die Kennung der Nachricht selbst und eine
    // unbekannte - bei einer anderen Person und in einer anderen Praxis
    // entsteht jedes Mal eine eigene Nachricht, gleich wie bei der unbekannten
    // (ADR-024 Punkt 7, Zweitreview TEAM-002 Befund 2).
    for (const [konto, kanalId, staff] of [
      [users.office, allgemein.id, STAFF.olivia],
      [fremd.owner, fremdesGespraech.id, null],
    ] as const) {
      for (const kennung of [KENNUNG, original, UNBEKANNT]) {
        const id = await senden(konto, kanalId, 'Eigene', null, [], kennung);
        expect(id).not.toBe(original);
        if (staff) expect(id).toBe(await nachrichtKennung(staff, kennung));
      }
    }
    // In ein Gespräch, das er nicht liest, dieselbe Antwort für alle drei.
    const leitung = (
      await asUserCommitted<{ id: string }>(
        users.teamLead,
        "select public.create_team_channel('Leitung', null, true, '{}') as id",
      )
    ).rows[0]!.id;
    const antworten = new Set<string>();
    for (const kennung of [KENNUNG, original, UNBEKANNT]) {
      const f = await fehler(users.trainer, SENDEN, [leitung, null, 'x', [], kennung]);
      antworten.add(`${f?.code} ${f?.message}`);
    }
    expect([...antworten]).toEqual(['P0002 team channel not found']);
    const { rows } = await asPostgres<{ body: string }>(
      'select body from public.team_messages where id = $1',
      [original],
    );
    expect(rows).toEqual([{ body: 'Original' }]);
    // Die eigene Kennung an anderer Stelle: abgelehnt, ohne Text.
    const vertretungen = await kanal(users.therapist, 'Vertretungen');
    const f = await fehler(users.therapist, SENDEN, [vertretungen.id, null, 'Fremd', [], KENNUNG]);
    expect(f?.code).toBe('22023');
    expect(f?.message).not.toContain('Original');
  });

  it('bringt eine schon gelöschte Nachricht durch eine Wiederholung nicht zurück, auch nicht als Anker', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const id = await senden(users.therapist, allgemein.id, 'Versehen', null, [], KENNUNG);
    await asUserCommitted(users.therapist, 'select public.delete_team_message($1)', [id]);
    expect(await senden(users.therapist, allgemein.id, 'Versehen', null, [], KENNUNG)).toBe(id);
    expect(await anzahl('select count(*) n from public.team_messages where id = $1', [id])).toBe(0);

    // Mit Antwort bleibt ein Anker ohne Verfasser:in - die Wiederholung bleibt still.
    const ZWEITE = 'c0ffee00-0000-4000-8000-000000000002';
    const frage = await senden(users.therapist, allgemein.id, 'Mit Antwort', null, [], ZWEITE);
    await senden(users.office, allgemein.id, 'Antwort', frage);
    await asUserCommitted(users.therapist, 'select public.delete_team_message($1)', [frage]);
    expect(await senden(users.therapist, allgemein.id, 'Mit Antwort', null, [], ZWEITE)).toBe(
      frage,
    );
    expect(
      await anzahl(
        `select count(*) n from public.team_messages where id = $1 and body is null
           and author_staff_member_id is null`,
        [frage],
      ),
    ).toBe(1);
    expect(
      await anzahl("select count(*) n from public.team_messages where body = 'Mit Antwort'"),
    ).toBe(0);
  });
});

describe('Teamchat: Blättern ohne Lücke und Doppel (ANN-641)', () => {
  it('liefert bei gleicher Zeit jede Nachricht genau einmal, rückwärts und vorwärts', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const ids: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      ids.push(await senden(users.office, allgemein.id, `Nachricht ${i}`));
    }
    // Sieben teilen sich dieselbe Zeit, drei liegen davor.
    await asPostgres(
      `update public.team_messages set created_at = date_trunc('second', now()) - interval '1 hour'
       where id = any($1::uuid[])`,
      [ids.slice(3)],
    );
    await asPostgres(
      `update public.team_messages
         set created_at = date_trunc('second', now()) - interval '3 hours' + make_interval(mins => x.n)
       from (select unnest($1::uuid[]) as id, generate_series(1, 3) as n) x
       where team_messages.id = x.id`,
      [ids.slice(0, 3)],
    );
    const { rows: erwartet } = await asPostgres<{ id: string; t: string }>(
      `select id, created_at::text t from public.team_messages
       where channel_id = $1 order by created_at, id`,
      [allgemein.id],
    );

    // Rückwärts in Seiten zu drei, wie „Ältere laden“.
    const rueckwaerts: string[] = [];
    let cursor: { at: string; id: string } | null = null;
    for (let runde = 0; runde < 10; runde += 1) {
      const seite = await nachrichten(users.therapist, allgemein.id, {
        vorAt: cursor?.at ?? null,
        vorId: cursor?.id ?? null,
        grenze: 3,
      });
      if (seite.length === 0) break;
      rueckwaerts.unshift(...seite.map((n) => n.id));
      const aelteste = seite[0]!.id;
      cursor = { at: erwartet.find((e) => e.id === aelteste)!.t, id: aelteste };
    }
    expect(rueckwaerts).toEqual(erwartet.map((e) => e.id));

    // Vorwärts ab der ältesten, wie das Nachholen nach einem Funkloch.
    const vorwaerts: string[] = [erwartet[0]!.id];
    cursor = { at: erwartet[0]!.t, id: erwartet[0]!.id };
    for (let runde = 0; runde < 10; runde += 1) {
      const seite = await nachrichten(users.therapist, allgemein.id, {
        nachAt: cursor.at,
        nachId: cursor.id,
        grenze: 3,
      });
      if (seite.length === 0) break;
      vorwaerts.push(...seite.map((n) => n.id));
      const neueste = seite.at(-1)!.id;
      cursor = { at: erwartet.find((e) => e.id === neueste)!.t, id: neueste };
    }
    expect(vorwaerts).toEqual(erwartet.map((e) => e.id));

    // Um eine Stelle herum: die Stelle mit ihrer Umgebung, in Reihenfolge.
    const mitte = erwartet[5]!.id;
    const um = await nachrichten(users.therapist, allgemein.id, { um: mitte, grenze: 4 });
    expect(um.map((n) => n.id)).toEqual(erwartet.slice(3, 8).map((e) => e.id));
  });

  it('blättert im Thread über die Antworten und zeigt die Ausgangsnachricht immer oben', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(users.therapist, allgemein.id, 'Frage');
    for (let i = 0; i < 5; i += 1) {
      await senden(users.office, allgemein.id, `Antwort ${i}`, frage);
    }
    const neueste = await nachrichten(users.therapist, allgemein.id, { parent: frage, grenze: 2 });
    expect(neueste.map((n) => n.body)).toEqual(['Frage', 'Antwort 3', 'Antwort 4']);
  });

  it('weist eine Stelle aus einem anderen Gespräch ab', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const vertretungen = await kanal(users.therapist, 'Vertretungen');
    const dort = await senden(users.office, vertretungen.id, 'Anderswo');
    expect(
      (
        await fehler(users.therapist, NACHRICHTEN, [
          allgemein.id,
          null,
          null,
          null,
          null,
          null,
          dort,
          null,
        ])
      )?.code,
    ).toBe('P0002');
  });
});

describe('Teamchat: Anker ohne Verfasser:in', () => {
  it('liefert am Anker „nicht eigen“ statt eines leeren Werts', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(users.therapist, allgemein.id, 'Versehentlich ein Name');
    await senden(users.office, allgemein.id, 'Antwort', frage);
    await asUserCommitted(users.therapist, 'select public.delete_team_message($1)', [frage]);
    for (const konto of [users.therapist, users.office]) {
      expect(await wurzel(konto, allgemein.id, frage)).toMatchObject({ body: null, own: false });
    }
  });
});

describe('Teamchat: Rechte an Lesestand, Folgen und Ungelesen (ADR-013 Punkt 9 Nr. 1)', () => {
  it('weist Konten ohne Praxisrolle, Plattformkonten und Anfragen ohne Sitzung ab', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(users.therapist, allgemein.id, 'Frage');
    for (const [sql, params] of [
      [THREAD_GELESEN, [frage, null]],
      [FOLGEN, [frage, true]],
      [UNGELESEN, [frage]],
      [KANAL_GELESEN, [allgemein.id, null]],
    ] as const) {
      for (const konto of [users.patientMax, users.plattformTina]) {
        expect((await fehler(konto, sql, [...params]))?.code).toBe('42501');
      }
      expect((await fehler(null, sql, [...params]))?.code).toBe('42501');
      await expect(asAnon(sql, [...params])).rejects.toThrow();
    }
  });

  it('antwortet einer fremden Praxis, wer nicht beteiligt ist, und der Trainingsbetreuung an der Flotte wie bei Unbekanntem', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(users.therapist, allgemein.id, 'Frage');
    const { rows } = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.open_team_direct($1) as id',
      [STAFF.olivia],
    );
    const privat = await senden(users.therapist, rows[0]!.id, 'Privat');
    const flotte = (await kanaele(users.therapist)).find((k) => k.kind === 'fleet')!;
    const rad = await senden(users.therapist, flotte.id, 'Rad 3?');
    const fremd = await fremdeOrganisation();

    for (const [konto, ziel] of [
      [fremd.owner, frage],
      [users.ownerTherapist, privat],
      [users.trainer, rad],
    ] as const) {
      for (const [sql, params] of [
        [THREAD_GELESEN, [ziel, null]],
        [FOLGEN, [ziel, true]],
        [UNGELESEN, [ziel]],
      ] as const) {
        expect((await fehler(konto, sql, [...params]))?.code).toBe('P0002');
      }
    }
    // Nichts angelegt: owner folgt der fremden Direktnachricht nicht.
    expect(
      await anzahl(
        'select count(*) n from public.team_thread_states where root_message_id = $1 and staff_member_id = $2',
        [privat, STAFF.jannes],
      ),
    ).toBe(0);
  });

  it('gibt keiner Anwendungsrolle ein Recht an der Tabelle', async () => {
    expect(
      (await fehler(users.ownerTherapist, 'select * from public.team_thread_states'))?.code,
    ).toBe('42501');
    const { rows } = await asPostgres<{ recht: boolean }>(
      `select bool_or(has_table_privilege(r, 'public.team_thread_states', p)) as recht
       from unnest(array['anon', 'authenticated']) r,
            unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p`,
    );
    expect(rows[0]!.recht).toBe(false);
  });

  it('schreibt keinen Auditeintrag (ADR-010 Punkt 17)', async () => {
    const vorher = await anzahl('select count(*) n from public.audit_log');
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(
      users.therapist,
      allgemein.id,
      'Frage',
      null,
      [],
      'c0ffee00-0000-4000-8000-000000000002',
    );
    await senden(users.office, allgemein.id, 'Antwort', frage);
    await asUserCommitted(users.office, THREAD_GELESEN, [frage, null]);
    await asUserCommitted(users.office, FOLGEN, [frage, false]);
    await asUserCommitted(users.office, UNGELESEN, [frage]);
    await asUserCommitted(users.office, KANAL_GELESEN, [allgemein.id, null]);
    expect(await anzahl('select count(*) n from public.audit_log')).toBe(vorher);
  });
});

describe('Teamchat: Löschlauf am Stand je Thread (ANN-640)', () => {
  it('räumt den Stand Ausgeschiedener ab und lässt ihn mit der Ausgangsnachricht fallen', async () => {
    const allgemein = await kanal(users.therapist, 'Allgemein');
    const frage = await senden(users.therapist, allgemein.id, 'Alte Frage');
    await senden(users.teamLead, allgemein.id, 'Antwort von Tim', frage);
    expect(
      await anzahl('select count(*) n from public.team_thread_states where root_message_id = $1', [
        frage,
      ]),
    ).toBe(2);

    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.tim],
    );
    await asPostgres('select public.apply_retention()');
    expect(
      await anzahl('select count(*) n from public.team_thread_states where staff_member_id = $1', [
        STAFF.tim,
      ]),
    ).toBe(0);
    expect(
      await anzahl('select count(*) n from public.team_thread_states where staff_member_id = $1', [
        STAFF.anna,
      ]),
    ).toBe(1);

    await asPostgres(
      `update public.team_messages set created_at = now() - interval '13 months'
       where id = $1 or parent_id = $1`,
      [frage],
    );
    await asPostgres('select public.apply_retention()');
    expect(
      await anzahl('select count(*) n from public.team_thread_states where root_message_id = $1', [
        frage,
      ]),
    ).toBe(0);
  });
});

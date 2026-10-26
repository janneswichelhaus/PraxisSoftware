import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
 * Rückmeldungen von Beschäftigten (§20.2): das Barometer immer mit Namen (ANN-607), die Rückmeldung
 * an die Praxisleitung mit oder ohne, anonym nur als Summe ab 3/5 (ANN-608). Rechte je Rolle nach
 * ADR-013 Punkt 9 Nr. 1, Löschlauf nach ADR-008 Fassung 4, kein Auditeintrag (ADR-010 Punkt 17).
 */

const { users, organizationId } = SEED;

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
  tom: '55555555-5555-4555-8555-000000000006',
} as const;

const STATUS = 'select public.get_my_staff_feedback_status() as daten';
const BAROMETER =
  'select public.submit_staff_barometer($1::integer, $2::integer, $3::integer, $4, $5) as daten';
const NACHRICHT = 'select public.submit_staff_feedback_message($1::boolean, $2) as daten';
const NAMENTLICH = 'select public.list_staff_feedback_named() as daten';
const SUMME = 'select public.get_staff_feedback_summary() as daten';

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

async function daten<T>(konto: string, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await asUser<{ daten: T }>(konto, sql, params);
  return rows[0]!.daten;
}

async function abgeben(konto: string, params: unknown[]): Promise<void> {
  await asUserCommitted(konto, BAROMETER, params);
}

async function anzahl(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await asPostgres<{ n: string }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

/** Der laufende Monat der Praxis und Monate davor, als `YYYY-MM-01`. */
let MONAT = '';
async function monatVor(n: number): Promise<string> {
  const { rows } = await asPostgres<{ m: string }>(
    `select to_char((date_trunc('month', now() at time zone 'Europe/Berlin')
                     - make_interval(months => $1::int))::date, 'YYYY-MM-DD') as m`,
    [n],
  );
  return rows[0]!.m;
}

/** Drei Beschäftigte in der fremden Praxis, damit ihre Summe überhaupt rechnet. */
async function fremdeBeschaeftigte(org: string): Promise<void> {
  for (const n of ['c1', 'c2', 'c3']) {
    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('11111111-1111-4111-8111-0000000000${n}', '${n}@fremd.invalid', 'authenticated', 'authenticated')
        on conflict (id) do nothing;
      insert into public.persons (id, organization_id, given_name, family_name)
        values ('44444444-4444-4444-8444-0000000000${n}', '${org}', 'Fremd', '${n}')
        on conflict (id) do nothing;
      insert into public.staff_members (id, organization_id, person_id)
        values ('55555555-5555-4555-8555-0000000000${n}', '${org}', '44444444-4444-4444-8444-0000000000${n}')
        on conflict (id) do nothing;
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('11111111-1111-4111-8111-0000000000${n}', '${org}', '44444444-4444-4444-8444-0000000000${n}', 'Fremd ${n}')
        on conflict (id) do nothing;
      insert into public.user_roles (user_id, organization_id, role_key)
        values ('11111111-1111-4111-8111-0000000000${n}', '${org}', 'therapist')
        on conflict do nothing;
    `);
  }
}

/** Anonyme Rückmeldungen direkt in einem Monat - Vorbereitung, nicht der Weg. */
async function anonymeNachrichten(
  monat: string,
  texte: string[],
  org: string = organizationId,
): Promise<void> {
  for (const text of texte) {
    await asPostgres(
      `insert into public.staff_feedback (organization_id, kind, month, message_text)
       values ($1, 'message', $2::date, $3)`,
      [org, monat, text],
    );
  }
}

interface Summe {
  messages: {
    status: 'ready' | 'too_few';
    from_month?: string;
    to_month?: string;
    answers?: number;
    texts?: string[];
  };
}

beforeAll(async () => {
  await resetDatabase();
  MONAT = await monatVor(0);
}, 120_000);

describe('Rückmeldungen: wer abgibt', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('nennt Beschäftigten ihren Stand, owner nimmt nicht teil', async () => {
    const anna = await daten<Record<string, unknown>>(users.therapist, STATUS);
    expect(anna).toEqual({
      can_take_part: true,
      can_read: false,
      month: MONAT,
      barometer_submitted: false,
    });
    for (const konto of [users.office, users.teamLead, users.trainer]) {
      expect((await daten<{ can_take_part: boolean }>(konto, STATUS)).can_take_part).toBe(true);
    }
    // owner (zugleich therapist) liest und nimmt nicht teil.
    const owner = await daten<Record<string, unknown>>(users.ownerTherapist, STATUS);
    expect(owner).toMatchObject({ can_take_part: false, can_read: true });
  });

  it('weist Konten ohne Praxisrolle, Plattform und ohne Sitzung ab', async () => {
    for (const sql of [STATUS, NAMENTLICH, SUMME]) {
      expect((await fehler(users.patientMax, sql))?.code).toBe('42501');
      expect((await fehler(users.plattformTina, sql))?.code).toBe('42501');
      expect((await fehler(null, sql))?.code).toBe('42501');
    }
    const args = [5, null, null, null, null];
    expect((await fehler(users.patientMax, BAROMETER, args))?.code).toBe('42501');
    expect((await fehler(users.plattformTina, BAROMETER, args))?.code).toBe('42501');
    expect((await fehler(null, BAROMETER, args))?.code).toBe('42501');
    expect((await fehler(users.patientMax, NACHRICHT, [false, 'Hallo']))?.code).toBe('42501');
    await expect(asAnon(BAROMETER, args)).rejects.toMatchObject({ code: '42501' });
    await expect(asAnon(NACHRICHT, [false, 'Hallo'])).rejects.toMatchObject({ code: '42501' });
  });

  it('lässt owner weder Barometer noch Rückmeldung abgeben', async () => {
    expect((await fehler(users.ownerTherapist, BAROMETER, [5, null, null, null, null]))?.code).toBe(
      '42501',
    );
    expect((await fehler(users.ownerTherapist, NACHRICHT, [true, 'An mich selbst']))?.code).toBe(
      '42501',
    );
    const fremd = await fremdeOrganisation();
    expect((await fehler(fremd.owner, NACHRICHT, [false, 'Fremd']))?.code).toBe('42501');
  });

  it('speichert das Barometer immer mit Person und Zeitpunkt', async () => {
    const { rows: antwort } = await asUserCommitted<{ daten: unknown }>(
      users.therapist,
      BAROMETER,
      [7, null, 3, '  Weniger Wege  ', null],
    );
    expect(antwort[0]!.daten).toEqual({ month: MONAT });
    const { rows } = await asPostgres<Record<string, unknown>>(
      `select *, to_char(month, 'YYYY-MM-DD') as m from public.staff_feedback`,
    );
    expect(rows).toHaveLength(1);
    const zeile = rows[0]!;
    expect(zeile.staff_member_id).toBe(STAFF.anna);
    expect(zeile.submitted_at).not.toBeNull();
    expect(zeile).toMatchObject({ kind: 'barometer', m: MONAT, mood: 7, tours: null, team: 3 });
    expect(zeile.easier_text).toBe('Weniger Wege');

    const stand = await daten<{ barometer_submitted: boolean }>(users.therapist, STATUS);
    expect(stand.barometer_submitted).toBe(true);
    // Die anderen sehen davon nichts.
    expect(
      (await daten<{ barometer_submitted: boolean }>(users.office, STATUS)).barometer_submitted,
    ).toBe(false);
    // owner liest die Antwort einzeln, mit Namen - schon bei der ersten Person.
    const liste = await daten<{ kind: string; name: string }[]>(users.ownerTherapist, NAMENTLICH);
    expect(liste).toMatchObject([{ kind: 'barometer', name: 'Anna Beispiel', mood: 7 }]);
  });

  it('nimmt kein Barometer ohne Namen an - weder über einen Weg noch direkt', async () => {
    const { rows } = await asPostgres<{ alt: string | null; marke: string | null }>(
      `select to_regprocedure('public.submit_staff_barometer(boolean, integer, integer, integer, text, text)')::text as alt,
              to_regclass('public.staff_feedback_participations')::text as marke`,
    );
    expect(rows).toEqual([{ alt: null, marke: null }]);
    await expect(
      asPostgres(
        `insert into public.staff_feedback (organization_id, kind, month, mood)
         values ($1, 'barometer', $2::date, 5)`,
        [organizationId, await monatVor(1)],
      ),
    ).rejects.toThrow(/staff_feedback_barometer_named/);
    await expect(
      asPostgres(
        `insert into public.staff_feedback_blocks (organization_id, kind, from_month, to_month, answers)
         values ($1, 'barometer', $2::date, $2::date, 5)`,
        [organizationId, await monatVor(1)],
      ),
    ).rejects.toThrow(/staff_feedback_blocks_kind_check/);
  });

  it('hält anonyme Rückmeldungen ohne Zeit, Sequenz und Person', async () => {
    // Eine Uhrzeit trägt nur der Zeitpunkt der namentlichen Abgabe.
    const { rows: spalten } = await asPostgres<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'staff_feedback'
         and (data_type like 'timestamp%' or data_type like 'time%'
              or column_default is not null and column_default not like '%gen_random_uuid%')
       order by table_name, column_name`,
    );
    expect(spalten).toEqual([{ table_name: 'staff_feedback', column_name: 'submitted_at' }]);
    expect(
      await anzahl(
        `select count(*) as n from pg_depend d
         join pg_class s on s.oid = d.objid and s.relkind = 'S'
         where d.refobjid = 'public.staff_feedback'::regclass`,
      ),
    ).toBe(0);
    // Die Kennung ist zufällig (Version 4), nicht zeitgeordnet.
    await asUserCommitted(users.therapist, NACHRICHT, [false, 'Ohne Namen']);
    const { rows } = await asPostgres<{ v: string; staff_member_id: string | null }>(
      `select substr(id::text, 15, 1) as v, staff_member_id from public.staff_feedback`,
    );
    expect(rows).toEqual([{ v: '4', staff_member_id: null }]);
    // Auch owner liest anonyme Zeilen nie einzeln.
    expect(await daten<unknown[]>(users.ownerTherapist, NAMENTLICH)).toEqual([]);
  });

  it('lässt das Barometer einmal je Person und Monat zu', async () => {
    await abgeben(users.therapist, [5, 5, 5, null, null]);
    const f = await fehler(users.therapist, BAROMETER, [6, null, null, null, null]);
    expect(f?.code).toBe('23505');
    expect(f?.message).toBe('barometer already submitted');
    // Eine andere Person ist davon nicht betroffen; die Rückmeldung an die
    // Praxisleitung geht jederzeit.
    await abgeben(users.office, [4, null, null, null, null]);
    await asUserCommitted(users.therapist, NACHRICHT, [false, 'Erste']);
    await asUserCommitted(users.therapist, NACHRICHT, [false, 'Zweite']);
    expect(await anzahl('select count(*) as n from public.staff_feedback')).toBe(4);
  });

  it('lässt von zwei gleichzeitigen Abgaben derselben Person nur eine zu', async () => {
    const erste = { konto: users.therapist, sql: BAROMETER, params: [5, null, null, null, null] };
    const zweite = { ...erste, params: [6, null, null, null, null] };
    // Die zweite wartet auf den eindeutigen Index der ersten und schreibt dann nichts.
    expect(await gleichzeitig(erste, zweite)).toMatchObject({
      code: '23505',
      message: 'barometer already submitted',
    });
    const { rows } = await asPostgres<{ mood: number }>(
      `select mood from public.staff_feedback where kind = 'barometer'`,
    );
    expect(rows).toEqual([{ mood: 5 }]);
  });

  it('weist leere, unzulässige und zu lange Abgaben ab, ohne den Text zu nennen', async () => {
    expect((await fehler(users.therapist, BAROMETER, [null, null, null, ' ', null]))?.message).toBe(
      'feedback is empty',
    );
    expect((await fehler(users.therapist, BAROMETER, [10, null, null, null, null]))?.code).toBe(
      '22023',
    );
    // Bei der Rückmeldung bleibt die Wahl Pflicht.
    expect((await fehler(users.therapist, NACHRICHT, [null, 'Hallo']))?.code).toBe('22023');
    const lang = `GEHEIM${'x'.repeat(2000)}`;
    const zuLang = await fehler(users.therapist, NACHRICHT, [false, lang]);
    expect(zuLang?.code).toBe('22023');
    expect(zuLang?.message).not.toContain('GEHEIM');
    const zuLangBaro = await fehler(users.therapist, BAROMETER, [null, null, null, lang, null]);
    expect(zuLangBaro?.message).not.toContain('GEHEIM');
    expect((await fehler(users.therapist, NACHRICHT, [true, '   ']))?.message).toBe(
      'feedback is empty',
    );
    // Nichts geschrieben.
    expect(await anzahl('select count(*) as n from public.staff_feedback')).toBe(0);
  });

  it('nimmt nichts von ausgeschiedenen Beschäftigten an', async () => {
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.anna],
    );
    expect((await fehler(users.therapist, BAROMETER, [5, null, null, null, null]))?.code).toBe(
      '42501',
    );
    expect((await fehler(users.therapist, NACHRICHT, [false, 'Hallo']))?.code).toBe('42501');
    await asPostgres(`update public.staff_members set employment_status = 'active' where id = $1`, [
      STAFF.anna,
    ]);
  });

  it('schreibt keinen Auditeintrag', async () => {
    const vorher = await anzahl('select count(*) as n from public.audit_log');
    await abgeben(users.therapist, [5, null, null, 'Text', null]);
    await abgeben(users.teamLead, [5, null, null, null, null]);
    await asUserCommitted(users.office, NACHRICHT, [true, 'Hallo']);
    await asUser(users.ownerTherapist, NAMENTLICH);
    await asUser(users.ownerTherapist, SUMME);
    expect(await anzahl('select count(*) as n from public.audit_log')).toBe(vorher);
  });
});

describe('Rückmeldungen: wer liest', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt owner namentliche Rückmeldungen einzeln, die neueste zuerst', async () => {
    await abgeben(users.teamLead, [8, 2, null, 'Mehr Pausen', null]);
    await asUserCommitted(users.office, NACHRICHT, [true, 'Der Drucker klemmt']);
    await asUserCommitted(users.therapist, NACHRICHT, [false, 'Anonym bleibt draußen']);

    const liste = await daten<Record<string, unknown>[]>(users.ownerTherapist, NAMENTLICH);
    expect(liste).toHaveLength(2);
    expect(liste[0]).toMatchObject({
      kind: 'message',
      month: MONAT,
      name: 'Olivia Office',
      message_text: 'Der Drucker klemmt',
    });
    expect(liste[1]).toMatchObject({
      kind: 'barometer',
      month: MONAT,
      name: 'Tim Teamleitung',
      mood: 8,
      tours: 2,
      team: null,
      easier_text: 'Mehr Pausen',
    });
    // Kein Zeitpunkt, keine Kennung der Person in der Antwort.
    expect(Object.keys(liste[0]!).sort()).toEqual(
      [
        'easier_text',
        'id',
        'kind',
        'message_text',
        'month',
        'mood',
        'more_text',
        'name',
        'team',
        'tours',
      ].sort(),
    );
  });

  it('lässt Teamleitung, Büro, Behandlung und Training nichts lesen', async () => {
    await asUserCommitted(users.office, NACHRICHT, [true, 'Nur für owner']);
    for (const konto of [users.teamLead, users.office, users.therapist, users.trainer]) {
      expect((await fehler(konto, NAMENTLICH))?.code).toBe('42501');
      expect((await fehler(konto, SUMME))?.code).toBe('42501');
    }
  });

  it('gibt keiner Anwendungsrolle ein Tabellenrecht', async () => {
    for (const tabelle of ['staff_feedback', 'staff_feedback_blocks']) {
      for (const konto of [users.ownerTherapist, users.therapist]) {
        await expect(asUser(konto, `select * from public.${tabelle}`)).rejects.toThrow(
          /permission denied/i,
        );
      }
      await expect(asAnon(`select * from public.${tabelle}`)).rejects.toThrow(/permission denied/i);
      await expect(
        asUser(
          users.therapist,
          `insert into public.staff_feedback (organization_id, kind, month, message_text)
           values ($1, 'message', date_trunc('month', now())::date, 'Direkt')`,
          [organizationId],
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('zeigt der fremden Praxis nichts von dieser', async () => {
    await abgeben(users.therapist, [5, null, null, 'Nur hier', null]);
    await asUserCommitted(users.office, NACHRICHT, [true, 'Hier']);
    await anonymeNachrichten(await monatVor(1), ['a', 'b', 'c', 'd', 'e']);
    const fremd = await fremdeOrganisation();
    expect(await daten<unknown[]>(fremd.owner, NAMENTLICH)).toEqual([]);
    // Mit drei Beschäftigten rechnet die fremde Praxis - aber nur mit ihren eigenen Antworten.
    await fremdeBeschaeftigte(fremd.organizationId);
    expect(await daten<Summe>(fremd.owner, SUMME)).toEqual({ messages: { status: 'too_few' } });
    await anonymeNachrichten(
      await monatVor(1),
      ['f1', 'f2', 'f3', 'f4', 'f5'],
      fremd.organizationId,
    );
    const eigene = await daten<Summe>(fremd.owner, SUMME);
    expect(eigene.messages).toMatchObject({ status: 'ready', answers: 5 });
    expect(eigene.messages.texts).toEqual(['f1', 'f2', 'f3', 'f4', 'f5']);
  });
});

describe('Rückmeldungen: Schwelle 3/5 und Zusammenfassen über Monate (ANN-608)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function summe(): Promise<Summe> {
    return daten<Summe>(users.ownerTherapist, SUMME);
  }

  it('sagt bei vier anonymen Rückmeldungen nur „zu wenige“', async () => {
    await anonymeNachrichten(await monatVor(1), ['a', 'b', 'c', 'd']);
    expect(await summe()).toEqual({ messages: { status: 'too_few' } });
  });

  it('zeigt anonyme Rückmeldungen erst ab fünf, gemischt; namentliche zählen nicht', async () => {
    const letzter = await monatVor(1);
    await anonymeNachrichten(letzter, ['Delta', 'Alpha', 'Charlie', 'Bravo']);
    await asPostgres(
      `insert into public.staff_feedback
         (organization_id, kind, month, staff_member_id, submitted_at, message_text)
       values ($1, 'message', $2::date, $3, now(), 'Mit Namen')`,
      [organizationId, letzter, STAFF.tim],
    );
    expect((await summe()).messages).toEqual({ status: 'too_few' });
    await anonymeNachrichten(await monatVor(3), ['Echo']);
    expect(await summe()).toEqual({
      messages: {
        status: 'ready',
        from_month: await monatVor(3),
        to_month: letzter,
        answers: 5,
        texts: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'],
      },
    });
  });

  it('fasst Monate rückwärts zusammen, bis die Schwelle erreicht ist', async () => {
    await anonymeNachrichten(await monatVor(1), ['a', 'b']);
    await anonymeNachrichten(await monatVor(2), ['c']);
    await anonymeNachrichten(await monatVor(4), ['d', 'e']);
    expect((await summe()).messages).toMatchObject({
      status: 'ready',
      from_month: await monatVor(4),
      to_month: await monatVor(1),
      answers: 5,
    });
  });

  it('schließt feste Blöcke, die sich nie überlappen (Zweitreview ORG-006, Befund 2)', async () => {
    // Wie in der Anwendung: Der Abruf speichert geschlossene Blöcke.
    async function summeGespeichert(): Promise<Summe> {
      const { rows } = await asUserCommitted<{ daten: Summe }>(users.ownerTherapist, SUMME);
      return rows[0]!.daten;
    }
    // Vier im ältesten, eine im nächsten Monat: der erste Block.
    await anonymeNachrichten(await monatVor(3), ['a', 'b', 'c', 'd']);
    await anonymeNachrichten(await monatVor(2), ['e']);
    expect((await summeGespeichert()).messages).toMatchObject({
      status: 'ready',
      from_month: await monatVor(3),
      to_month: await monatVor(2),
      answers: 5,
    });
    // Vier im Monat danach: Der Block bleibt. Ein gleitendes Fenster zeigte jetzt die Monate -2
    // und -1, und die Differenz verriete die einzelne Rückmeldung aus Monat -2.
    await anonymeNachrichten(await monatVor(1), ['f', 'g', 'h', 'i']);
    expect((await summeGespeichert()).messages).toMatchObject({
      from_month: await monatVor(3),
      to_month: await monatVor(2),
      answers: 5,
    });
    // Eine fünfte: ein neuer Block nur aus Monat -1.
    await anonymeNachrichten(await monatVor(1), ['j']);
    expect((await summeGespeichert()).messages).toMatchObject({
      from_month: await monatVor(1),
      to_month: await monatVor(1),
      answers: 5,
    });
    const { rows } = await asPostgres<{ von: string; bis: string }>(
      `select to_char(from_month, 'YYYY-MM-DD') as von, to_char(to_month, 'YYYY-MM-DD') as bis
       from public.staff_feedback_blocks where kind = 'message' order by from_month`,
    );
    expect(rows).toEqual([
      { von: await monatVor(3), bis: await monatVor(2) },
      { von: await monatVor(1), bis: await monatVor(1) },
    ]);
  });

  it('zeigt einen Block nicht mehr, sobald ihm Antworten fehlen (Nachprüfung N1)', async () => {
    const { rows: geschlossen } = await asUserCommitted<{ daten: Summe }>(
      users.ownerTherapist,
      SUMME,
    );
    expect(geschlossen[0]!.daten.messages.status).toBe('too_few');
    await anonymeNachrichten(await monatVor(3), ['a']);
    await anonymeNachrichten(await monatVor(2), ['b', 'c', 'd', 'e', 'f']);
    const { rows } = await asUserCommitted<{ daten: Summe }>(users.ownerTherapist, SUMME);
    expect(rows[0]!.daten.messages).toMatchObject({ status: 'ready', answers: 6 });
    // Der älteste Monat fällt (wie nach der Frist): Die Summe aus fünf
    // verriete per Differenz die eine Rückmeldung - sie zeigt nichts.
    await asPostgres(`delete from public.staff_feedback where month = $1::date`, [
      await monatVor(3),
    ]);
    expect((await summe()).messages).toEqual({ status: 'too_few' });
  });

  it('nimmt höchstens zwölf Monate und nie den laufenden', async () => {
    // Fünf im laufenden Monat: Ein Abruf je Tag läse jede neue Rückmeldung als
    // Differenz - sie zählen erst nach dem Monat.
    await anonymeNachrichten(MONAT, ['a', 'b', 'c', 'd', 'e']);
    expect((await summe()).messages.status).toBe('too_few');
    // Vier in den zwölf Monaten, eine im dreizehnten: zu wenige.
    await anonymeNachrichten(await monatVor(12), ['f', 'g', 'h', 'i']);
    await anonymeNachrichten(await monatVor(13), ['j']);
    expect((await summe()).messages.status).toBe('too_few');
    await anonymeNachrichten(await monatVor(12), ['k']);
    expect((await summe()).messages).toMatchObject({
      status: 'ready',
      from_month: await monatVor(12),
      answers: 5,
    });
  });

  it('verlangt drei Beschäftigte, die teilnehmen können', async () => {
    await anonymeNachrichten(await monatVor(1), ['a', 'b', 'c', 'd', 'e']);
    expect((await summe()).messages.status).toBe('ready');
    // Büro und Training ausgeschieden: bleiben Anna und Tim - zu wenige.
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id in ($1, $2)`,
      [STAFF.olivia, STAFF.tom],
    );
    expect(await summe()).toEqual({ messages: { status: 'too_few' } });
  });

  it('kennt beim Barometer keine Schwelle: owner liest es ab der ersten Person einzeln', async () => {
    // Nur Anna kann noch teilnehmen.
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id in ($1, $2, $3)`,
      [STAFF.olivia, STAFF.tom, STAFF.tim],
    );
    await abgeben(users.therapist, [3, null, null, null, null]);
    expect(await daten<unknown[]>(users.ownerTherapist, NAMENTLICH)).toMatchObject([
      { kind: 'barometer', name: 'Anna Beispiel', mood: 3 },
    ]);
    // Die Summe kennt nur Rückmeldungen.
    expect(Object.keys(await summe())).toEqual(['messages']);
  });
});

describe('Rückmeldungen: Löschlauf (ADR-008 Fassung 4, ANN-607)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('löscht zwölf Monate nach Ende des Monats endgültig, mit Journal und ohne Auditzähler', async () => {
    const alt = await monatVor(13);
    const grenze = await monatVor(12);
    const jung = await monatVor(11);
    await asPostgres(
      `insert into public.staff_feedback
         (organization_id, kind, month, staff_member_id, submitted_at, mood)
       values ($1, 'barometer', $2::date, $3, now(), 5)`,
      [organizationId, alt, STAFF.anna],
    );
    await anonymeNachrichten(alt, ['Alt']);
    await asPostgres(
      `insert into public.staff_feedback
         (organization_id, kind, month, staff_member_id, submitted_at, message_text)
       values ($1, 'message', $2::date, $3, now(), 'Alt mit Namen')`,
      [organizationId, alt, STAFF.anna],
    );
    // Der Monat vor zwölf Monaten endet erst in diesem Monat + zwölf: Er
    // fällt am Ersten des nächsten Monats, nicht jetzt.
    await anonymeNachrichten(grenze, ['Grenze']);
    await anonymeNachrichten(jung, ['Jung']);
    const geloeschteIds = (
      await asPostgres<{ id: string }>(
        `select id from public.staff_feedback where month = $1::date order by id`,
        [alt],
      )
    ).rows.map((r) => r.id);
    expect(geloeschteIds).toHaveLength(3);

    await asPostgres('select public.apply_retention()');

    const { rows: rest } = await asPostgres<{ m: string }>(
      `select to_char(month, 'YYYY-MM-DD') as m from public.staff_feedback order by month`,
    );
    expect(rest.map((r) => r.m)).toEqual([grenze, jung]);

    const { rows: journal } = await asPostgres<{ target_id: string; retention_class: string }>(
      `select target_id, retention_class from public.deletion_journal
       where target_table = 'staff_feedback' order by target_id`,
    );
    expect(journal.map((r) => r.target_id)).toEqual(geloeschteIds);
    expect(new Set(journal.map((r) => r.retention_class))).toEqual(new Set(['rueckmeldung']));

    // Die Zusammenfassung des Laufs nennt die Rückmeldungen nicht.
    const { rows: audit } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log where action = 'retention.applied'`,
    );
    for (const eintrag of audit) {
      expect(Object.keys(eintrag.context).some((k) => k.startsWith('rueckmeldung'))).toBe(false);
    }

    // Nach einem Restore löscht das Journal sie erneut.
    await asPostgres(
      `insert into public.staff_feedback (id, organization_id, kind, month, message_text)
       values ($1, $2, 'message', $3::date, 'Wieder da')`,
      [geloeschteIds[0], organizationId, alt],
    );
    await asPostgres('select public.reapply_deletion_journal()');
    expect(
      await anzahl('select count(*) as n from public.staff_feedback where id = $1', [
        geloeschteIds[0],
      ]),
    ).toBe(0);
  });

  it('schreibt anonyme Rückmeldungen abgeschlossener Monate neu, den laufenden nicht', async () => {
    await anonymeNachrichten(await monatVor(1), ['Vormonat']);
    await anonymeNachrichten(MONAT, ['Laufend']);
    const vorher = (
      await asPostgres<{ id: string; x: string; t: string }>(
        `select id, xmin::text as x, message_text as t from public.staff_feedback order by t`,
      )
    ).rows;

    await asPostgres('select public.apply_retention()');

    const nachher = (
      await asPostgres<{ id: string; x: string; t: string }>(
        `select id, xmin::text as x, message_text as t from public.staff_feedback order by t`,
      )
    ).rows;
    expect(nachher.map((r) => r.t)).toEqual(['Laufend', 'Vormonat']);
    // Der laufende Monat bleibt, wie er ist.
    expect(nachher[0]).toEqual(vorher[0]);
    // Der abgeschlossene trägt neue Kennung und neue Transaktion.
    expect(nachher[1]!.id).not.toBe(vorher[1]!.id);
    expect(nachher[1]!.x).not.toBe(vorher[1]!.x);
  });

  it('löscht Blöcke mit ihrem letzten Monat und nach einem Restore auch neu geschriebene Antworten (N2, N3)', async () => {
    await asPostgres(
      `insert into public.staff_feedback_blocks (organization_id, kind, from_month, to_month, answers)
       values ($1, 'message', $2::date, $2::date, 5), ($1, 'message', $3::date, $3::date, 5)`,
      [organizationId, await monatVor(14), await monatVor(11)],
    );
    await asPostgres('select public.apply_retention()');
    const { rows } = await asPostgres<{ m: string }>(
      `select to_char(from_month, 'YYYY-MM-DD') as m from public.staff_feedback_blocks`,
    );
    expect(rows.map((r) => r.m)).toEqual([await monatVor(11)]);
    // Ein Backup mit einer anonymen Rückmeldung, die der Lauf seitdem unter neuer Kennung
    // schrieb und dann löschte: Das Journal kennt ihre Kennung nicht, die Regel greift trotzdem.
    await anonymeNachrichten(await monatVor(14), ['Aus dem Backup']);
    await asPostgres('select public.reapply_deletion_journal()');
    expect(
      await anzahl(`select count(*) as n from public.staff_feedback where month = $1::date`, [
        await monatVor(14),
      ]),
    ).toBe(0);
  });
});

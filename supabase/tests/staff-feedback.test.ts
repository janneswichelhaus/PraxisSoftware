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

/**
 * Rückmeldungen von Beschäftigten (ORG-006, PROJECT_PRINCIPLES.md §20.2):
 * Barometer und Rückmeldung an die Praxisleitung.
 *
 * Geprüft werden die Rechte je Rolle (ADR-013 Punkt 9 Nr. 1: andere
 * Organisation, Rolle ohne Recht, Konto ohne Praxisrolle, Plattformkonto, ohne
 * Sitzung), dass eine Abgabe ohne Namen weder Person noch Zeit trägt und mit
 * der Teilnahme nicht verknüpfbar ist, die Schwelle 3/5 samt Zusammenfassen
 * über Monate (ANN-607), einmal je Person und Monat, dass owner nicht
 * teilnimmt, dass Teamleitung und Büro nichts lesen, und der Löschlauf nach
 * zwölf Monaten (ADR-008 Fassung 4). Kein Auditeintrag (ADR-010 Punkt 17).
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
  'select public.submit_staff_barometer($1::boolean, $2::integer, $3::integer, $4::integer, $5, $6) as daten';
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

/** Anonyme Barometer direkt in einem Monat - Vorbereitung, nicht der Weg. */
async function anonymeBarometer(monat: string, werte: number[], text?: string): Promise<void> {
  for (const wert of werte) {
    await asPostgres(
      `insert into public.staff_feedback (organization_id, kind, month, mood, easier_text)
       values ($1, 'barometer', $2::date, $3, $4)`,
      [organizationId, monat, wert, text ?? null],
    );
  }
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

async function anonymeNachrichten(monat: string, texte: string[]): Promise<void> {
  for (const text of texte) {
    await asPostgres(
      `insert into public.staff_feedback (organization_id, kind, month, message_text)
       values ($1, 'message', $2::date, $3)`,
      [organizationId, monat, text],
    );
  }
}

interface Skala {
  enough: boolean;
  answered?: number;
  median?: number;
  distribution?: number[];
}

interface Summe {
  barometer: {
    status: 'ready' | 'too_few';
    from_month?: string;
    to_month?: string;
    answers?: number;
    mood?: Skala;
    tours?: Skala;
    team?: Skala;
    easier_texts?: string[];
    more_texts?: string[];
  };
  messages: { status: 'ready' | 'too_few'; from_month?: string; texts?: string[] };
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
    const args = [false, 5, null, null, null, null];
    expect((await fehler(users.patientMax, BAROMETER, args))?.code).toBe('42501');
    expect((await fehler(users.plattformTina, BAROMETER, args))?.code).toBe('42501');
    expect((await fehler(null, BAROMETER, args))?.code).toBe('42501');
    expect((await fehler(users.patientMax, NACHRICHT, [false, 'Hallo']))?.code).toBe('42501');
    await expect(asAnon(BAROMETER, args)).rejects.toMatchObject({ code: '42501' });
    await expect(asAnon(NACHRICHT, [false, 'Hallo'])).rejects.toMatchObject({ code: '42501' });
  });

  it('lässt owner weder Barometer noch Rückmeldung abgeben', async () => {
    expect(
      (await fehler(users.ownerTherapist, BAROMETER, [false, 5, null, null, null, null]))?.code,
    ).toBe('42501');
    expect((await fehler(users.ownerTherapist, NACHRICHT, [true, 'An mich selbst']))?.code).toBe(
      '42501',
    );
    const fremd = await fremdeOrganisation();
    expect((await fehler(fremd.owner, NACHRICHT, [false, 'Fremd']))?.code).toBe('42501');
  });

  it('speichert ein Barometer ohne Namen ohne Person und ohne Zeit', async () => {
    await abgeben(users.therapist, [false, 7, null, 3, '  Weniger Wege  ', null]);
    const { rows } = await asPostgres<Record<string, unknown>>(
      'select * from public.staff_feedback',
    );
    expect(rows).toHaveLength(1);
    const zeile = rows[0]!;
    expect(zeile.staff_member_id).toBeNull();
    expect(zeile.submitted_at).toBeNull();
    expect(zeile.kind).toBe('barometer');
    expect(zeile.mood).toBe(7);
    expect(zeile.tours).toBeNull();
    expect(zeile.team).toBe(3);
    expect(zeile.easier_text).toBe('Weniger Wege');
    // Der Monat als einzige Zeitangabe.
    const { rows: monat } = await asPostgres<{ m: string }>(
      `select to_char(month, 'YYYY-MM-DD') as m from public.staff_feedback`,
    );
    expect(monat[0]!.m).toBe(MONAT);

    // Die Teilnahme ist eine eigene Marke: Person und Monat, sonst nichts.
    const { rows: marken } = await asPostgres<Record<string, unknown>>(
      'select * from public.staff_feedback_participations',
    );
    expect(marken).toHaveLength(1);
    expect(marken[0]!.staff_member_id).toBe(STAFF.anna);
    expect(marken[0]!.id).not.toBe(zeile.id);

    const stand = await daten<{ barometer_submitted: boolean }>(users.therapist, STATUS);
    expect(stand.barometer_submitted).toBe(true);
    // Die anderen sehen davon nichts.
    expect(
      (await daten<{ barometer_submitted: boolean }>(users.office, STATUS)).barometer_submitted,
    ).toBe(false);
  });

  it('hält anonyme Antwort und Teilnahme unverknüpfbar: keine Zeit, keine Sequenz, keine Person', async () => {
    // Spalten, die eine Uhrzeit tragen: nur der Zeitpunkt der namentlichen
    // Abgabe; die Marke hat gar keine.
    const { rows: spalten } = await asPostgres<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public'
         and table_name in ('staff_feedback', 'staff_feedback_participations')
         and (data_type like 'timestamp%' or data_type like 'time%'
              or column_default is not null and column_default not like '%gen_random_uuid%')
       order by table_name, column_name`,
    );
    expect(spalten).toEqual([{ table_name: 'staff_feedback', column_name: 'submitted_at' }]);
    // Keine Sequenz an einer der Tabellen.
    expect(
      await anzahl(
        `select count(*) as n from pg_depend d
         join pg_class s on s.oid = d.objid and s.relkind = 'S'
         where d.refobjid in ('public.staff_feedback'::regclass,
                              'public.staff_feedback_participations'::regclass)`,
      ),
    ).toBe(0);
    // Die Kennungen sind zufällig (Version 4), keine zeitgeordneten.
    await abgeben(users.therapist, [false, 5, null, null, null, null]);
    const { rows } = await asPostgres<{ v: string }>(
      `select substr(id::text, 15, 1) as v from public.staff_feedback
       union all select substr(id::text, 15, 1) from public.staff_feedback_participations`,
    );
    expect(rows.map((r) => r.v)).toEqual(['4', '4']);
    // Auch owner liest anonyme Zeilen nie einzeln.
    expect(await daten<unknown[]>(users.ownerTherapist, NAMENTLICH)).toEqual([]);
  });

  it('schreibt bei jeder anonymen Abgabe alle anonymen Antworten des Monats neu (Nachprüfung zu Befund 1)', async () => {
    await abgeben(users.therapist, [false, 5, null, null, null, null]);
    await abgeben(users.teamLead, [false, 6, null, null, null, null]);
    const { rows } = await asPostgres<{ x: string }>(
      `select distinct xmin::text as x from public.staff_feedback
       where staff_member_id is null and month = $1::date`,
      [MONAT],
    );
    // Beide Antworten tragen die Transaktion der zweiten Abgabe - die erste
    // Marke führt zu keiner von ihnen.
    expect(rows).toHaveLength(1);
    expect(
      await anzahl(
        `select count(*) as n from public.staff_feedback f
         join public.staff_feedback_participations p on p.xmin = f.xmin
         where p.staff_member_id = $1`,
        [STAFF.anna],
      ),
    ).toBe(0);
  });

  it('lässt das Barometer einmal je Person und Monat zu, mit oder ohne Namen', async () => {
    await abgeben(users.therapist, [true, 5, 5, 5, null, null]);
    for (const named of [true, false]) {
      const f = await fehler(users.therapist, BAROMETER, [named, 6, null, null, null, null]);
      expect(f?.code).toBe('23505');
      expect(f?.message).toBe('barometer already submitted');
    }
    // Eine andere Person ist davon nicht betroffen; die Rückmeldung an die
    // Praxisleitung geht jederzeit.
    await abgeben(users.office, [false, 4, null, null, null, null]);
    await asUserCommitted(users.therapist, NACHRICHT, [false, 'Erste']);
    await asUserCommitted(users.therapist, NACHRICHT, [false, 'Zweite']);
    expect(await anzahl('select count(*) as n from public.staff_feedback')).toBe(4);
  });

  it('weist leere, unzulässige und zu lange Abgaben ab, ohne den Text zu nennen', async () => {
    expect(
      (await fehler(users.therapist, BAROMETER, [false, null, null, null, ' ', null]))?.message,
    ).toBe('feedback is empty');
    expect(
      (await fehler(users.therapist, BAROMETER, [false, 10, null, null, null, null]))?.code,
    ).toBe('22023');
    expect(
      (await fehler(users.therapist, BAROMETER, [null, 5, null, null, null, null]))?.code,
    ).toBe('22023');
    const lang = `GEHEIM${'x'.repeat(2000)}`;
    const zuLang = await fehler(users.therapist, NACHRICHT, [false, lang]);
    expect(zuLang?.code).toBe('22023');
    expect(zuLang?.message).not.toContain('GEHEIM');
    const zuLangBaro = await fehler(users.therapist, BAROMETER, [
      false,
      null,
      null,
      null,
      lang,
      null,
    ]);
    expect(zuLangBaro?.message).not.toContain('GEHEIM');
    expect((await fehler(users.therapist, NACHRICHT, [true, '   ']))?.message).toBe(
      'feedback is empty',
    );
    // Nichts geschrieben, auch keine Marke.
    expect(await anzahl('select count(*) as n from public.staff_feedback')).toBe(0);
    expect(await anzahl('select count(*) as n from public.staff_feedback_participations')).toBe(0);
  });

  it('nimmt nichts von ausgeschiedenen Beschäftigten an', async () => {
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.anna],
    );
    expect(
      (await fehler(users.therapist, BAROMETER, [false, 5, null, null, null, null]))?.code,
    ).toBe('42501');
    expect((await fehler(users.therapist, NACHRICHT, [false, 'Hallo']))?.code).toBe('42501');
    await asPostgres(`update public.staff_members set employment_status = 'active' where id = $1`, [
      STAFF.anna,
    ]);
  });

  it('schreibt keinen Auditeintrag', async () => {
    const vorher = await anzahl('select count(*) as n from public.audit_log');
    await abgeben(users.therapist, [false, 5, null, null, 'Text', null]);
    await abgeben(users.teamLead, [true, 5, null, null, null, null]);
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
    await abgeben(users.teamLead, [true, 8, 2, null, 'Mehr Pausen', null]);
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
    for (const tabelle of [
      'staff_feedback',
      'staff_feedback_participations',
      'staff_feedback_blocks',
    ]) {
      for (const konto of [users.ownerTherapist, users.therapist]) {
        await expect(asUser(konto, `select * from public.${tabelle}`)).rejects.toThrow(
          /permission denied/i,
        );
      }
      await expect(asAnon(`select * from public.${tabelle}`)).rejects.toThrow(/permission denied/i);
      await expect(
        asUser(
          users.therapist,
          `insert into public.staff_feedback_participations (organization_id, staff_member_id, month)
           values ($1, $2, date_trunc('month', now())::date)`,
          [organizationId, STAFF.anna],
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('zeigt der fremden Praxis nichts von dieser', async () => {
    await asUserCommitted(users.office, NACHRICHT, [true, 'Hier']);
    await anonymeBarometer(await monatVor(1), [5, 5, 5, 5, 5]);
    const fremd = await fremdeOrganisation();
    expect(await daten<unknown[]>(fremd.owner, NAMENTLICH)).toEqual([]);
    // Mit drei Beschäftigten rechnet die fremde Praxis - aber nur mit ihren
    // eigenen Antworten (Zweitreview ORG-006, Befund 5).
    await fremdeBeschaeftigte(fremd.organizationId);
    const leer = await daten<Summe>(fremd.owner, SUMME);
    expect(leer.barometer.status).toBe('too_few');
    expect(leer.messages.status).toBe('too_few');
    for (let i = 0; i < 5; i += 1) {
      await asPostgres(
        `insert into public.staff_feedback (organization_id, kind, month, mood)
         values ($1, 'barometer', $2::date, 1)`,
        [fremd.organizationId, await monatVor(1)],
      );
    }
    const eigene = await daten<Summe>(fremd.owner, SUMME);
    expect(eigene.barometer).toMatchObject({ status: 'ready', answers: 5 });
    expect(eigene.barometer.mood?.distribution).toEqual([5, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('Rückmeldungen: Schwelle 3/5 und Zusammenfassen über Monate (ANN-607)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function summe(): Promise<Summe> {
    return daten<Summe>(users.ownerTherapist, SUMME);
  }

  it('sagt bei vier anonymen Antworten nur „zu wenige“', async () => {
    await anonymeBarometer(await monatVor(1), [1, 2, 3, 4]);
    expect(await summe()).toEqual({
      barometer: { status: 'too_few' },
      messages: { status: 'too_few' },
    });
  });

  it('wertet ab fünf anonymen Antworten aus - Median, Verteilung, Texte gemischt', async () => {
    const letzter = await monatVor(1);
    await anonymeBarometer(letzter, [1, 2, 3, 9], 'Zebra');
    await anonymeBarometer(letzter, [9], 'Apfel');
    // Namentliche zählen nicht zur Summe.
    await asPostgres(
      `insert into public.staff_feedback
         (organization_id, kind, month, staff_member_id, submitted_at, mood)
       values ($1, 'barometer', $2::date, $3, now(), 1)`,
      [organizationId, letzter, STAFF.tim],
    );
    const s = await summe();
    expect(s.barometer).toMatchObject({
      status: 'ready',
      from_month: letzter,
      to_month: letzter,
      answers: 5,
    });
    expect(s.barometer.mood).toEqual({
      enough: true,
      answered: 5,
      median: 3,
      distribution: [1, 1, 1, 0, 0, 0, 0, 0, 2],
    });
    // Unter fünf Antworten auf eine Frage: keine Zahl.
    expect(s.barometer.tours).toEqual({ enough: false });
    // Gemischt: nach dem Text geordnet, nicht nach Abgabe.
    expect(s.barometer.easier_texts).toEqual(['Apfel', 'Zebra', 'Zebra', 'Zebra', 'Zebra']);
    expect(s.barometer.more_texts).toEqual([]);
  });

  it('fasst Monate rückwärts zusammen, bis die Schwelle erreicht ist', async () => {
    await anonymeBarometer(await monatVor(1), [5, 5]);
    await anonymeBarometer(await monatVor(2), [6]);
    await anonymeBarometer(await monatVor(4), [7, 7]);
    const s = await summe();
    expect(s.barometer).toMatchObject({
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
    await anonymeBarometer(await monatVor(3), [1, 1, 1, 1]);
    await anonymeBarometer(await monatVor(2), [2]);
    expect((await summeGespeichert()).barometer).toMatchObject({
      status: 'ready',
      from_month: await monatVor(3),
      to_month: await monatVor(2),
      answers: 5,
    });
    // Vier im Monat danach: Der Block bleibt, wie er war - ein gleitendes
    // Fenster zeigte jetzt die Monate -2 und -1, und die Differenz verriete
    // die einzelne Antwort aus Monat -2.
    await anonymeBarometer(await monatVor(1), [3, 3, 3, 3]);
    expect((await summeGespeichert()).barometer).toMatchObject({
      from_month: await monatVor(3),
      to_month: await monatVor(2),
      answers: 5,
    });
    // Eine fünfte: ein neuer Block nur aus Monat -1.
    await anonymeBarometer(await monatVor(1), [3]);
    expect((await summeGespeichert()).barometer).toMatchObject({
      from_month: await monatVor(1),
      to_month: await monatVor(1),
      answers: 5,
    });
    const { rows } = await asPostgres<{ von: string; bis: string }>(
      `select to_char(from_month, 'YYYY-MM-DD') as von, to_char(to_month, 'YYYY-MM-DD') as bis
       from public.staff_feedback_blocks where kind = 'barometer' order by from_month`,
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
    expect(geschlossen[0]!.daten.barometer.status).toBe('too_few');
    await anonymeBarometer(await monatVor(3), [1]);
    await anonymeBarometer(await monatVor(2), [5, 5, 5, 5, 5]);
    const { rows } = await asUserCommitted<{ daten: Summe }>(users.ownerTherapist, SUMME);
    expect(rows[0]!.daten.barometer).toMatchObject({ status: 'ready', answers: 6 });
    // Der älteste Monat fällt (wie nach der Frist): Die Summe aus fünf
    // verriete per Differenz die eine Antwort - sie zeigt nichts.
    await asPostgres(`delete from public.staff_feedback where month = $1::date`, [
      await monatVor(3),
    ]);
    expect((await summe()).barometer).toEqual({ status: 'too_few' });
  });

  it('nimmt höchstens zwölf Monate und nie den laufenden', async () => {
    // Fünf im laufenden Monat: ein Abruf je Tag läse jede neue Antwort als
    // Differenz - sie zählen erst nach dem Monat.
    await anonymeBarometer(MONAT, [5, 5, 5, 5, 5]);
    expect((await summe()).barometer.status).toBe('too_few');
    // Vier in den zwölf Monaten, eine im dreizehnten: zu wenige.
    await anonymeBarometer(await monatVor(12), [5, 5, 5, 5]);
    await anonymeBarometer(await monatVor(13), [5]);
    expect((await summe()).barometer.status).toBe('too_few');
    await anonymeBarometer(await monatVor(12), [5]);
    expect((await summe()).barometer).toMatchObject({
      status: 'ready',
      from_month: await monatVor(12),
      answers: 5,
    });
  });

  it('verlangt drei Beschäftigte, die teilnehmen können', async () => {
    await anonymeBarometer(await monatVor(1), [5, 5, 5, 5, 5]);
    await anonymeNachrichten(await monatVor(1), ['a', 'b', 'c', 'd', 'e']);
    expect((await summe()).barometer.status).toBe('ready');
    // Büro und Training ausgeschieden: bleiben Anna und Tim - zu wenige.
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id in ($1, $2)`,
      [STAFF.olivia, STAFF.tom],
    );
    expect(await summe()).toEqual({
      barometer: { status: 'too_few' },
      messages: { status: 'too_few' },
    });
  });

  it('zeigt anonyme Rückmeldungen an die Praxisleitung erst ab fünf, gemischt', async () => {
    await anonymeNachrichten(await monatVor(1), ['Delta', 'Alpha', 'Charlie', 'Bravo']);
    expect((await summe()).messages).toEqual({ status: 'too_few' });
    await anonymeNachrichten(await monatVor(3), ['Echo']);
    expect((await summe()).messages).toEqual({
      status: 'ready',
      from_month: await monatVor(3),
      to_month: await monatVor(1),
      answers: 5,
      texts: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'],
    });
    // Barometer zählen nicht zu den Rückmeldungen und umgekehrt.
    expect((await summe()).barometer).toEqual({ status: 'too_few' });
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
    await anonymeBarometer(alt, [5]);
    await anonymeNachrichten(alt, ['Alt']);
    await asPostgres(
      `insert into public.staff_feedback
         (organization_id, kind, month, staff_member_id, submitted_at, message_text)
       values ($1, 'message', $2::date, $3, now(), 'Alt mit Namen')`,
      [organizationId, alt, STAFF.anna],
    );
    // Der Monat vor zwölf Monaten endet erst in diesem Monat + zwölf: Er
    // fällt am Ersten des nächsten Monats, nicht jetzt.
    await anonymeBarometer(grenze, [6]);
    await anonymeBarometer(jung, [7]);
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

  it('schreibt anonyme Antworten abgeschlossener Monate neu - keine Spur zur Marke (Zweitreview, Befund 1)', async () => {
    // Marke und Antwort in einer Transaktion, wie beim Abgeben: dasselbe xmin.
    await asPostgres(
      `with marke as (
         insert into public.staff_feedback_participations (organization_id, staff_member_id, month)
         values ($1, $2, $3::date) returning 1
       )
       insert into public.staff_feedback (organization_id, kind, month, mood)
       select $1, 'barometer', $3::date, 5 from marke`,
      [organizationId, STAFF.anna, await monatVor(1)],
    );
    const vorher = (
      await asPostgres<{ id: string; x: string }>(
        `select id, xmin::text as x from public.staff_feedback where staff_member_id is null`,
      )
    ).rows[0]!;
    expect(
      await anzahl(
        `select count(*) as n from public.staff_feedback_participations where xmin::text = $1`,
        [vorher.x],
      ),
    ).toBe(1);

    await asPostgres('select public.apply_retention()');

    const nachher = (
      await asPostgres<{ id: string; x: string; mood: number }>(
        `select id, xmin::text as x, mood from public.staff_feedback where staff_member_id is null`,
      )
    ).rows;
    expect(nachher).toHaveLength(1);
    expect(nachher[0]!.mood).toBe(5);
    expect(nachher[0]!.id).not.toBe(vorher.id);
    expect(nachher[0]!.x).not.toBe(vorher.x);
    expect(
      await anzahl(
        `select count(*) as n from public.staff_feedback f
         join public.staff_feedback_participations p on p.xmin = f.xmin`,
      ),
    ).toBe(0);
  });

  it('löscht Blöcke mit ihrem letzten Monat und nach einem Restore auch neu geschriebene Antworten (N2, N3)', async () => {
    await asPostgres(
      `insert into public.staff_feedback_blocks (organization_id, kind, from_month, to_month, answers)
       values ($1, 'barometer', $2::date, $2::date, 5), ($1, 'barometer', $3::date, $3::date, 5)`,
      [organizationId, await monatVor(14), await monatVor(11)],
    );
    await asPostgres('select public.apply_retention()');
    const { rows } = await asPostgres<{ m: string }>(
      `select to_char(from_month, 'YYYY-MM-DD') as m from public.staff_feedback_blocks`,
    );
    expect(rows.map((r) => r.m)).toEqual([await monatVor(11)]);
    // Ein Backup mit einer anonymen Antwort, die der Lauf seitdem unter neuer
    // Kennung schrieb und dann löschte: Das Journal kennt ihre Kennung nicht,
    // die Regel greift trotzdem beim Wiederanwenden.
    await anonymeBarometer(await monatVor(14), [5]);
    await asPostgres('select public.reapply_deletion_journal()');
    expect(
      await anzahl(`select count(*) as n from public.staff_feedback where month = $1::date`, [
        await monatVor(14),
      ]),
    ).toBe(0);
  });

  it('lässt Teilnahmemarken mit dem Monat fallen, ohne Journal', async () => {
    await abgeben(users.therapist, [false, 5, null, null, null, null]);
    await asPostgres(
      `insert into public.staff_feedback_participations (organization_id, staff_member_id, month)
       values ($1, $2, $3::date), ($1, $4, $3::date)`,
      [organizationId, STAFF.olivia, await monatVor(2), STAFF.tim],
    );
    await asPostgres('select public.apply_retention()');
    const { rows } = await asPostgres<{ staff_member_id: string; m: string }>(
      `select staff_member_id, to_char(month, 'YYYY-MM-DD') as m
       from public.staff_feedback_participations`,
    );
    expect(rows).toEqual([{ staff_member_id: STAFF.anna, m: MONAT }]);
    expect(
      await anzahl(
        `select count(*) as n from public.deletion_journal
         where target_table = 'staff_feedback_participations'`,
      ),
    ).toBe(0);
  });
});

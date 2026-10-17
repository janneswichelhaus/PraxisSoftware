import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Zeitkonto: Mehrarbeit und Freizeitausgleich mit Beginn und Ende (ZK-001,
 * Überholung 9).
 *
 * Geprüft werden das Eintragen mit sofortiger Wirkung im Saldo (ANN-593),
 * Zurücknehmen, Zurückweisen und das Buchen für andere (ANN-594), die Wirkung
 * des Freizeitausgleichs auf die Arbeitszeiten und ihr Schutz (ANN-595), die
 * Sichtbarkeit nach BEF-066 Option 2 mit Büro (ANN-596), die Negativfälle aus
 * ADR-013 Punkt 9 Nr. 1 (andere Organisation, Rolle ohne Recht, Patienten- und
 * Plattformkonto, fremde Person, ohne Sitzung) und der Löschlauf mit Journal
 * (ANN-597, ADR-013 Nr. 4). Kein Auditeintrag (ADR-010 Punkt 15).
 *
 * Die Tage hängen am heutigen Datum der Praxis (Europe/Berlin), nie an festen
 * Daten: Anna arbeitet im Seed Montag bis Freitag 08:00-12:00 und 13:00-18:00.
 */

const { users, organizationId, patients } = SEED;

const PRAXIS = '33333333-3333-4333-8333-000000000001';

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
  tom: '55555555-5555-4555-8555-000000000006',
} as const;

const EINTRAGEN =
  'select public.record_time_account_entry($1::uuid, $2, $3::date, $4::time, $5::time, $6::integer, $7) as daten';
const VORSCHAU =
  'select public.preview_time_account_entry($1::uuid, $2, $3::date, $4::time, $5::time, $6::integer) as daten';
const ZURUECKNEHMEN = 'select public.withdraw_time_account_entry($1::uuid)';
const ZURUECKWEISEN = 'select public.reject_time_account_entry($1::uuid, $2) as daten';
const KONTO = 'select public.list_time_account($1::uuid) as daten';
const ABGEDECKT =
  'select app.is_within_working_hours($1::uuid, $2::uuid, $3::date, $4::time, $5::time) as ja';
const AENDERUNG_BEANTRAGEN =
  'select public.request_working_time_change($1, $2::date, $3::jsonb, $4) as id';
const AENDERUNG_ENTSCHEIDEN =
  'select public.decide_working_time_request($1::uuid, $2::boolean, $3) as daten';
const WOCHENTAG_PFLEGEN = 'select public.set_staff_working_hours($1, $2::smallint, $3::jsonb)';

interface Block {
  von: string;
  bis: string;
}

/** Annas Tag im Seed: 08:00-12:00 und 13:00-18:00. */
const ANNAS_TAG: Block[] = [
  { von: '08:00', bis: '12:00' },
  { von: '13:00', bis: '18:00' },
];

/** Gleich lang, mit späterer Pause. */
const SPAETE_PAUSE: Block[] = [
  { von: '08:00', bis: '12:30' },
  { von: '13:30', bis: '18:00' },
];

/** Annas Woche (Montag bis Freitag), ein Tag ersetzt. */
function woche(tag: number, bloecke: Block[]): Record<string, Block[]> {
  const ergebnis: Record<string, Block[]> = {};
  for (let t = 1; t <= 7; t += 1) {
    ergebnis[String(t)] = t === tag ? bloecke : t <= 5 ? ANNAS_TAG : [];
  }
  return ergebnis;
}

interface Fehler {
  code?: string;
  message: string;
}

interface Eintrag {
  id: string;
  kind: string;
  on_date: string;
  starts_at: string | null;
  ends_at: string | null;
  minutes: number;
  note: string | null;
  status: string;
  entered_by_name: string | null;
  rejected_by_name: string | null;
  rejection_note: string | null;
  can_withdraw: boolean;
  can_reject: boolean;
}

interface Konto {
  my_staff_member_id: string | null;
  can_book_others: boolean;
  can_reject: boolean;
  account: {
    staff_member_id: string;
    name: string;
    balance_minutes: number;
    entries: Eintrag[];
  } | null;
  accounts: { staff_member_id: string; name: string; balance_minutes: number }[];
}

let HEUTE = '';

function plusTage(tag: string, tage: number): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** ISO-Wochentag: 1 Montag bis 7 Sonntag. */
function wochentag(tag: string): number {
  return new Date(`${tag}T00:00:00Z`).getUTCDay() || 7;
}

/** Der letzte Werktag vor heute (ein bis drei Tage zurück). */
function werktagVorHeute(): string {
  let tag = plusTage(HEUTE, -1);
  while (wochentag(tag) > 5) tag = plusTage(tag, -1);
  return tag;
}

/** Der letzte Sonntag vor heute. */
function sonntagVorHeute(): string {
  let tag = plusTage(HEUTE, -1);
  while (wochentag(tag) !== 7) tag = plusTage(tag, -1);
  return tag;
}

/** Der erste Werktag mindestens `tage` nach heute. */
function werktagNach(tage: number): string {
  let tag = plusTage(HEUTE, tage);
  while (wochentag(tag) > 5) tag = plusTage(tag, 1);
  return tag;
}

/** Der erste Tag ab `tag` (einschließlich) mit diesem Wochentag. */
function naechster(tag: string, gesucht: number): string {
  let d = tag;
  while (wochentag(d) !== gesucht) d = plusTage(d, 1);
  return d;
}

/** Ein Samstag in der Zukunft - Anna hat dort keine Arbeitszeit. */
function samstagNach(tage: number): string {
  let tag = plusTage(HEUTE, tage);
  while (wochentag(tag) !== 6) tag = plusTage(tag, 1);
  return tag;
}

async function fehler(konto: string | null, sql: string, params: unknown[] = []) {
  try {
    await asUser(konto, sql, params);
    return null;
  } catch (f) {
    return f as Fehler;
  }
}

async function daten<T>(konto: string, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await asUser<{ daten: T }>(konto, sql, params);
  return rows[0]!.daten;
}

/** Trägt ein und bestätigt; liefert die Antwort der Funktion. */
async function eingetragen(
  konto: string,
  fuer: string | null,
  art: 'overtime' | 'time_off' | 'correction',
  tag: string,
  von: string | null,
  bis: string | null,
  minuten: number | null = null,
  grund: string | null = null,
) {
  const { rows } = await asUserCommitted<{
    daten: { id: string; minutes: number; balance_minutes: number; appointments: number };
  }>(konto, EINTRAGEN, [fuer, art, tag, von, bis, minuten, grund]);
  return rows[0]!.daten;
}

async function konto(kontoId: string, fuer: string | null = null): Promise<Konto> {
  return daten<Konto>(kontoId, KONTO, [fuer]);
}

async function abweichungen(staff: string, tag: string) {
  const { rows } = await asPostgres<{ kind: string; von: string | null; bis: string | null }>(
    `select kind, to_char(starts_at, 'HH24:MI') as von, to_char(ends_at, 'HH24:MI') as bis
       from public.staff_working_hour_exceptions
      where staff_member_id = $1 and on_date = $2
      order by kind, starts_at nulls first`,
    [staff, tag],
  );
  return rows;
}

async function abgedeckt(staff: string, tag: string, von: string, bis: string) {
  const { rows } = await asPostgres<{ ja: boolean }>(ABGEDECKT, [
    staff,
    organizationId,
    tag,
    von,
    bis,
  ]);
  return rows[0]!.ja;
}

beforeAll(async () => {
  const { rows } = await asPostgres<{ heute: string }>(
    `select to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD') as heute`,
  );
  HEUTE = rows[0]!.heute;
});

beforeEach(resetDatabase);

describe('Eintragen (ANN-593)', () => {
  it('zählt Mehrarbeit nach Dienstende sofort im Saldo - ohne Auditeintrag', async () => {
    const tag = werktagVorHeute();
    const { rows: vorher } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.audit_log',
    );
    const antwort = await eingetragen(
      users.therapist,
      null,
      'overtime',
      tag,
      '18:00',
      '18:45',
      null,
      'Besuch dauerte länger',
    );
    expect(antwort.minutes).toBe(45);
    expect(antwort.balance_minutes).toBe(45);

    const stand = await konto(users.therapist);
    expect(stand.account?.staff_member_id).toBe(STAFF.anna);
    expect(stand.account?.balance_minutes).toBe(45);
    expect(stand.account?.entries).toEqual([
      expect.objectContaining({
        kind: 'overtime',
        on_date: tag,
        starts_at: '18:00',
        ends_at: '18:45',
        minutes: 45,
        note: 'Besuch dauerte länger',
        status: 'valid',
        entered_by_name: null,
        can_withdraw: true,
        can_reject: false,
      }),
    ]);
    // Mehrarbeit ändert die Arbeitszeiten nicht.
    expect(await abweichungen(STAFF.anna, tag)).toEqual([]);
    const { rows: nachher } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.audit_log',
    );
    expect(nachher[0]!.n).toBe(vorher[0]!.n);
  });

  it('nimmt Mehrarbeit in der Arbeitszeit nicht an; an einem freien Tag zählt sie ganz', async () => {
    const f = await fehler(users.therapist, EINTRAGEN, [
      null,
      'overtime',
      werktagVorHeute(),
      '17:30',
      '18:30',
      null,
      null,
    ]);
    expect(f?.code).toBe('22023');
    expect(f?.message).toBe('time account rule: overlaps_working_hours');

    const sonntag = await eingetragen(
      users.therapist,
      null,
      'overtime',
      sonntagVorHeute(),
      '10:00',
      '12:00',
    );
    expect(sonntag.minutes).toBe(120);
  });

  it('hält die Fristen: Mehrarbeit nie voraus und höchstens 31 Tage zurück, Freizeitausgleich bis ein Jahr voraus', async () => {
    const regel = async (art: string, tag: string) =>
      (await fehler(users.therapist, EINTRAGEN, [null, art, tag, '19:00', '20:00', null, null]))
        ?.message;
    expect(await regel('overtime', plusTage(HEUTE, 1))).toBe(
      'time account rule: date_out_of_range',
    );
    expect(await regel('overtime', plusTage(HEUTE, -32))).toBe(
      'time account rule: date_out_of_range',
    );
    expect(await regel('time_off', plusTage(HEUTE, 366))).toBe(
      'time account rule: date_out_of_range',
    );
    expect(await regel('time_off', plusTage(HEUTE, -32))).toBe(
      'time account rule: date_out_of_range',
    );
  });

  it('verlangt Beginn vor Ende in ganzen Minuten', async () => {
    const tag = werktagVorHeute();
    for (const [von, bis] of [
      ['19:00', '18:30'],
      ['19:00', '19:00'],
      ['19:00:30', '20:00'],
      [null, '20:00'],
    ] as const) {
      const f = await fehler(users.therapist, EINTRAGEN, [
        null,
        'overtime',
        tag,
        von,
        bis,
        null,
        null,
      ]);
      expect(f?.code, `${von}-${bis}`).toBe('22023');
      expect(f?.message).toBe('time account rule: times_invalid');
    }
    const art = await fehler(users.therapist, EINTRAGEN, [
      null,
      'urlaub',
      tag,
      '19:00',
      '20:00',
      null,
      null,
    ]);
    expect(art?.code).toBe('22023');
  });

  it('lässt zwei Einträge derselben Zeit nicht zu', async () => {
    const tag = werktagVorHeute();
    await eingetragen(users.therapist, null, 'overtime', tag, '18:00', '19:00');
    const f = await fehler(users.therapist, EINTRAGEN, [
      null,
      'overtime',
      tag,
      '18:30',
      '19:30',
      null,
      null,
    ]);
    expect(f?.code).toBe('23P01');
    expect(f?.message).toBe('time account rule: overlaps_entry');
    // Danach schließt sich ein weiterer an.
    const weiter = await eingetragen(users.therapist, null, 'overtime', tag, '19:00', '19:30');
    expect(weiter.balance_minutes).toBe(90);
  });

  it('zeigt in der Vorschau Tag, Saldo danach und Gründe, ohne zu schreiben', async () => {
    const tag = werktagNach(8);
    const nurTag = await daten<{
      day: { kind: string; blocks: unknown[] };
      balance_minutes: number;
    }>(users.therapist, VORSCHAU, [null, 'time_off', tag, null, null, null]);
    expect(nurTag.day.kind).toBe('plan');
    expect(nurTag.day.blocks).toEqual([
      { von: '08:00', bis: '12:00' },
      { von: '13:00', bis: '18:00' },
    ]);
    const mitZeiten = await daten<{ minutes: number; balance_after: number; problems: string[] }>(
      users.therapist,
      VORSCHAU,
      [null, 'time_off', tag, '16:00', '18:00', null],
    );
    expect(mitZeiten).toEqual(
      expect.objectContaining({ minutes: -120, balance_after: -120, problems: [] }),
    );
    const daneben = await daten<{ problems: string[] }>(users.therapist, VORSCHAU, [
      null,
      'time_off',
      tag,
      '18:00',
      '19:00',
      null,
    ]);
    expect(daneben.problems).toEqual(['outside_working_hours']);
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.staff_time_account_entries',
    );
    expect(rows[0]!.n).toBe(0);
  });
});

describe('Freizeitausgleich in den Arbeitszeiten (ANN-595)', () => {
  it('gibt die freie Zeit aus den Arbeitszeiten, die übrigen Blöcke bleiben', async () => {
    const tag = werktagNach(8);
    const antwort = await eingetragen(users.therapist, null, 'time_off', tag, '16:00', '18:00');
    expect(antwort.minutes).toBe(-120);
    expect(antwort.balance_minutes).toBe(-120);
    expect(await abweichungen(STAFF.anna, tag)).toEqual([
      { kind: 'block', von: '08:00', bis: '12:00' },
      { kind: 'block', von: '13:00', bis: '16:00' },
    ]);
    expect(await abgedeckt(STAFF.anna, tag, '16:30', '17:00')).toBe(false);
    expect(await abgedeckt(STAFF.anna, tag, '13:00', '15:00')).toBe(true);
  });

  it('zählt über die Pause nur die Arbeitszeit', async () => {
    const tag = werktagNach(8);
    const antwort = await eingetragen(users.therapist, null, 'time_off', tag, '11:00', '14:00');
    expect(antwort.minutes).toBe(-120);
    expect(await abweichungen(STAFF.anna, tag)).toEqual([
      { kind: 'block', von: '08:00', bis: '11:00' },
      { kind: 'block', von: '14:00', bis: '18:00' },
    ]);
  });

  it('nimmt einen ganzen Tag als Abwesenheit', async () => {
    const tag = werktagNach(8);
    const antwort = await eingetragen(users.therapist, null, 'time_off', tag, '08:00', '18:00');
    expect(antwort.minutes).toBe(-540);
    expect(await abweichungen(STAFF.anna, tag)).toEqual([
      { kind: 'unavailable', von: null, bis: null },
    ]);
  });

  it('nur an Tagen nach Wochenplan und innerhalb der Arbeitszeit', async () => {
    const regel = async (tag: string, von = '16:00', bis = '18:00') =>
      await fehler(users.therapist, EINTRAGEN, [null, 'time_off', tag, von, bis, null, null]);

    // Ein Tag mit geänderten Zeiten.
    const geaendert = werktagNach(8);
    await asPostgres(
      `insert into public.staff_working_hour_exceptions
         (organization_id, staff_member_id, on_date, kind, starts_at, ends_at)
       values ($1, $2, $3, 'block', '07:00', '15:00')`,
      [organizationId, STAFF.anna, geaendert],
    );
    expect(await regel(geaendert)).toMatchObject({
      code: '55000',
      message: 'time account rule: changed_day',
    });

    // Ein Urlaubstag.
    const urlaub = werktagNach(15);
    await asPostgres(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by, decided_by, decided_at)
       values ($1, $2, $3, $3, 1, 'approved', $4, $5, now())`,
      [organizationId, STAFF.anna, urlaub, users.therapist, users.ownerTherapist],
    );
    expect(await regel(urlaub)).toMatchObject({
      code: '55000',
      message: 'time account rule: leave',
    });

    // Ein Tag ohne Arbeitszeit und eine Zeit außerhalb.
    expect(await regel(samstagNach(8))).toMatchObject({
      code: '22023',
      message: 'time account rule: no_working_time',
    });
    expect(await regel(werktagNach(22), '18:00', '19:00')).toMatchObject({
      code: '22023',
      message: 'time account rule: outside_working_hours',
    });
  });

  it('nennt die Termine in der freien Zeit und lässt sie stehen', async () => {
    const tag = werktagNach(8);
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
         starts_at, ends_at, kind
       ) values ($1, $2, $3, $4, 'practice', 'confirmed',
         ($5::date + time '16:30') at time zone 'Europe/Berlin',
         ($5::date + time '17:15') at time zone 'Europe/Berlin', 'therapy')
       returning id`,
      [organizationId, patients.erika, STAFF.anna, PRAXIS, tag],
    );
    const antwort = await eingetragen(users.therapist, null, 'time_off', tag, '16:00', '18:00');
    expect(antwort.appointments).toBe(1);
    const { rows: termin } = await asPostgres<{ status: string }>(
      'select status from public.appointments where id = $1',
      [rows[0]!.id],
    );
    expect(termin[0]!.status).toBe('confirmed');
  });

  it('schützt den Tag: Planung, Arbeitszeitänderung und Urlaub ändern ihn nicht still', async () => {
    const tag = werktagNach(8);
    await eingetragen(users.therapist, null, 'time_off', tag, '16:00', '18:00');

    const planung = await fehler(
      users.office,
      'select public.set_staff_working_hour_exception($1, $2::date, false, $3::jsonb)',
      [STAFF.anna, tag, JSON.stringify([{ von: '08:00', bis: '12:00' }])],
    );
    expect(planung).toMatchObject({ code: '55000', message: 'day has time off in lieu' });
    // Unverändert Gespeichertes geht durch und verrät nichts (Zweitreview Runde 2).
    expect(
      await fehler(
        users.teamLead,
        'select public.set_staff_working_hour_exception($1, $2::date, false, $3::jsonb)',
        [
          STAFF.anna,
          tag,
          JSON.stringify([
            { von: '08:00', bis: '12:00' },
            { von: '13:00', bis: '16:00' },
          ]),
        ],
      ),
    ).toBeNull();

    const aenderung = await fehler(
      users.therapist,
      'select public.request_working_time_change($1, $2::date, $3::jsonb, $4) as id',
      [
        'once',
        tag,
        JSON.stringify([
          { von: '07:00', bis: '12:00' },
          { von: '13:00', bis: '17:00' },
        ]),
        null,
      ],
    );
    expect(aenderung).toMatchObject({ code: '55000', message: 'day has time off in lieu' });

    // Auch ein ganztägiger Freizeitausgleich hält eine Urlaubsgenehmigung an.
    const ganz = werktagNach(15);
    await eingetragen(users.therapist, null, 'time_off', ganz, '08:00', '18:00');
    const { rows } = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.request_leave($1::date, $2::date, $3) as id',
      [ganz, ganz, null],
    );
    // Die Entscheidungsseite nennt den Tag schon vorher (URL-001 Runde 2).
    const offen = await daten<{ to_decide: { id: string; exception_days: string[] }[] }>(
      users.ownerTherapist,
      'select public.list_leave($1::date, $2::date) as daten',
      [HEUTE, plusTage(HEUTE, 60)],
    );
    expect(offen.to_decide.find((a) => a.id === rows[0]!.id)?.exception_days).toEqual([ganz]);
    const urlaub = await fehler(
      users.ownerTherapist,
      'select public.decide_leave_request($1::uuid, $2::boolean, $3) as daten',
      [rows[0]!.id, true, null],
    );
    expect(urlaub).toMatchObject({ code: '55000', message: 'working hours exception in period' });
  });

  it('hält eine einmalige Änderung an, die vor dem Freizeitausgleich beantragt war', async () => {
    const tag = werktagNach(8);
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, AENDERUNG_BEANTRAGEN, [
      'once',
      tag,
      JSON.stringify([
        { von: '07:00', bis: '12:00' },
        { von: '13:00', bis: '17:00' },
      ]),
      null,
    ]);
    // Solange beantragt, gilt der Wochenplan - der Freizeitausgleich geht.
    await eingetragen(users.therapist, null, 'time_off', tag, '16:00', '18:00');
    expect(
      await fehler(users.ownerTherapist, AENDERUNG_ENTSCHEIDEN, [rows[0]!.id, true, null]),
    ).toMatchObject({ code: '55000', message: 'day has time off in lieu' });
    expect(await abweichungen(STAFF.anna, tag)).toEqual([
      { kind: 'block', von: '08:00', bis: '12:00' },
      { kind: 'block', von: '13:00', bis: '16:00' },
    ]);
  });

  it('schützt den Tag vor einem neuen Wochenplan - in der Planung und beantragt (Zweitreview B4)', async () => {
    const tag = werktagNach(8);
    const tagWoche = wochentag(tag);
    const andererWochentag = tagWoche === 5 ? 1 : tagWoche + 1;
    await eingetragen(users.therapist, null, 'time_off', tag, '16:00', '18:00');

    // In der Planung: nicht der Wochentag des Freizeitausgleichs, ein anderer schon.
    const pflegen = (wtag: number) =>
      fehler(users.office, WOCHENTAG_PFLEGEN, [STAFF.anna, wtag, JSON.stringify(SPAETE_PAUSE)]);
    expect(await pflegen(tagWoche)).toMatchObject({
      code: '55000',
      message: 'day has time off in lieu',
    });
    expect(await pflegen(andererWochentag)).toBeNull();

    // Beantragt ab morgen: ebenso.
    const morgen = plusTage(HEUTE, 1);
    const beantragen = (wtag: number) =>
      fehler(users.therapist, AENDERUNG_BEANTRAGEN, [
        'permanent',
        morgen,
        JSON.stringify(woche(wtag, SPAETE_PAUSE)),
        null,
      ]);
    expect(await beantragen(tagWoche)).toMatchObject({
      code: '55000',
      message: 'day has time off in lieu',
    });
    expect(await beantragen(andererWochentag)).toBeNull();
    // Die Vorschau nennt den Grund schon vorher (Zweitreview Runde 2).
    const vorschau = (wtag: number) =>
      daten<{ problems: string[] }>(
        users.therapist,
        'select public.preview_working_time_change($1, $2::date, $3::jsonb) as daten',
        ['permanent', morgen, JSON.stringify(woche(wtag, SPAETE_PAUSE))],
      );
    expect((await vorschau(tagWoche)).problems).toContain('time_off_in_lieu');
    expect((await vorschau(andererWochentag)).problems).not.toContain('time_off_in_lieu');

    // Vor dem Freizeitausgleich beantragt, danach genehmigt: hält an.
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, AENDERUNG_BEANTRAGEN, [
      'permanent',
      morgen,
      JSON.stringify(woche(andererWochentag, SPAETE_PAUSE)),
      null,
    ]);
    await eingetragen(
      users.therapist,
      null,
      'time_off',
      naechster(plusTage(tag, 1), andererWochentag),
      '16:00',
      '18:00',
    );
    expect(
      await fehler(users.ownerTherapist, AENDERUNG_ENTSCHEIDEN, [rows[0]!.id, true, null]),
    ).toMatchObject({ code: '55000', message: 'day has time off in lieu' });
  });
});

describe('Zurücknehmen und zurückweisen (ANN-594)', () => {
  it('nimmt die eigene Eingabe zurück; einen Freizeitausgleich nur vor seinem Tag', async () => {
    const mehr = await eingetragen(
      users.therapist,
      null,
      'overtime',
      werktagVorHeute(),
      '18:00',
      '19:00',
    );
    await asUserCommitted(users.therapist, ZURUECKNEHMEN, [mehr.id]);

    const tag = werktagNach(8);
    const frei = await eingetragen(users.therapist, null, 'time_off', tag, '16:00', '18:00');
    await asUserCommitted(users.therapist, ZURUECKNEHMEN, [frei.id]);
    expect(await abweichungen(STAFF.anna, tag)).toEqual([]);
    expect(await abgedeckt(STAFF.anna, tag, '16:30', '17:00')).toBe(true);

    const stand = await konto(users.therapist);
    expect(stand.account?.balance_minutes).toBe(0);
    expect(stand.account?.entries.map((e) => e.status)).toEqual(['withdrawn', 'withdrawn']);

    // Genommene Zeit holt niemand zurück: ein Freizeitausgleich von gestern
    // bleibt stehen.
    const gestern = werktagVorHeute();
    const genommen = await eingetragen(
      users.therapist,
      null,
      'time_off',
      gestern,
      '16:00',
      '18:00',
    );
    expect((await fehler(users.therapist, ZURUECKNEHMEN, [genommen.id]))?.code).toBe('P0002');
  });

  it('lässt fremde Eingaben nicht zurücknehmen', async () => {
    const mehr = await eingetragen(
      users.therapist,
      null,
      'overtime',
      werktagVorHeute(),
      '18:00',
      '19:00',
    );
    for (const k of [users.office, users.ownerTherapist, users.teamLead]) {
      expect((await fehler(k, ZURUECKNEHMEN, [mehr.id]))?.code, k).toBe('P0002');
    }
  });

  it('owner weist mit Grund zurück: Der Eintrag bleibt sichtbar, zählt nicht und gibt die Zeit frei', async () => {
    const tag = werktagNach(8);
    const frei = await eingetragen(users.therapist, null, 'time_off', tag, '16:00', '18:00');
    const mehr = await eingetragen(
      users.therapist,
      null,
      'overtime',
      werktagVorHeute(),
      '18:00',
      '19:00',
    );

    const antwort = await asUserCommitted<{ daten: { status: string; freed: boolean } }>(
      users.ownerTherapist,
      ZURUECKWEISEN,
      [frei.id, 'An dem Tag ist Teamsitzung.'],
    );
    expect(antwort.rows[0]!.daten).toEqual({ status: 'rejected', freed: true });
    expect(await abweichungen(STAFF.anna, tag)).toEqual([]);
    expect(await abgedeckt(STAFF.anna, tag, '16:30', '17:00')).toBe(true);

    const stand = await konto(users.therapist);
    expect(stand.account?.balance_minutes).toBe(60);
    const zurueck = stand.account!.entries.find((e) => e.id === frei.id)!;
    expect(zurueck).toEqual(
      expect.objectContaining({
        status: 'rejected',
        rejection_note: 'An dem Tag ist Teamsitzung.',
        rejected_by_name: 'Jannes Test',
        can_withdraw: false,
      }),
    );
    expect(stand.account!.entries.find((e) => e.id === mehr.id)?.status).toBe('valid');
  });

  it('weist nur owner zurück, nur mit Grund und nie im eigenen Konto', async () => {
    const mehr = await eingetragen(
      users.therapist,
      null,
      'overtime',
      werktagVorHeute(),
      '18:00',
      '19:00',
    );
    for (const k of [users.office, users.teamLead, users.therapist, users.trainer]) {
      expect((await fehler(k, ZURUECKWEISEN, [mehr.id, 'Nein']))?.code, k).toBe('42501');
    }
    expect((await fehler(users.ownerTherapist, ZURUECKWEISEN, [mehr.id, '  ']))?.code).toBe(
      '22023',
    );

    const eigen = await eingetragen(
      users.ownerTherapist,
      null,
      'overtime',
      werktagVorHeute(),
      '18:00',
      '19:00',
    );
    expect((await fehler(users.ownerTherapist, ZURUECKWEISEN, [eigen.id, 'Nein']))?.code).toBe(
      '42501',
    );

    await asUserCommitted(users.ownerTherapist, ZURUECKWEISEN, [mehr.id, 'Nein']);
    expect((await fehler(users.ownerTherapist, ZURUECKWEISEN, [mehr.id, 'Nein']))?.code).toBe(
      'P0002',
    );
  });
});

describe('Für andere eintragen (ANN-594)', () => {
  it('owner und Büro tragen für andere ein; die Person sieht, wer', async () => {
    const tag = werktagVorHeute();
    const durchBuero = await eingetragen(
      users.office,
      STAFF.tim,
      'overtime',
      tag,
      '18:00',
      '19:30',
    );
    expect(durchBuero.balance_minutes).toBe(90);
    const tim = await konto(users.teamLead);
    expect(tim.account?.entries[0]).toEqual(
      expect.objectContaining({ entered_by_name: 'Olivia Office', can_withdraw: false }),
    );
    // Tim nimmt die Eingabe des Büros nicht zurück, das Büro schon.
    expect((await fehler(users.teamLead, ZURUECKNEHMEN, [durchBuero.id]))?.code).toBe('P0002');
    await asUserCommitted(users.office, ZURUECKNEHMEN, [durchBuero.id]);

    const durchOwner = await eingetragen(
      users.ownerTherapist,
      STAFF.anna,
      'time_off',
      werktagNach(8),
      '16:00',
      '18:00',
    );
    expect(durchOwner.minutes).toBe(-120);
  });

  it('bucht Minusstunden mit Grund - owner und Büro, das Büro nie im eigenen Konto', async () => {
    const tag = HEUTE;
    const korrektur = await eingetragen(
      users.office,
      STAFF.tim,
      'correction',
      tag,
      null,
      null,
      -750,
      'Übertrag aus der Stundenliste',
    );
    expect(korrektur.balance_minutes).toBe(-750);
    const minus = await eingetragen(
      users.ownerTherapist,
      STAFF.tim,
      'correction',
      tag,
      null,
      null,
      -30,
      'Doppelt eingetragen',
    );
    expect(minus.balance_minutes).toBe(-780);

    const ohneGrund = await fehler(users.office, EINTRAGEN, [
      STAFF.tim,
      'correction',
      tag,
      null,
      null,
      -60,
      null,
    ]);
    expect(ohneGrund).toMatchObject({
      code: '22023',
      message: 'time account rule: correction_invalid',
    });
    const null0 = await fehler(users.office, EINTRAGEN, [
      STAFF.tim,
      'correction',
      tag,
      null,
      null,
      0,
      'x',
    ]);
    expect(null0).toMatchObject({
      code: '22023',
      message: 'time account rule: correction_invalid',
    });

    for (const [k, fuer] of [
      [users.therapist, null],
      [users.teamLead, null],
      [users.office, null],
      [users.office, STAFF.olivia],
    ] as const) {
      expect(
        (await fehler(k, EINTRAGEN, [fuer, 'correction', tag, null, null, -60, 'Ich']))?.code,
        k,
      ).toBe('42501');
    }
    const eigen = await eingetragen(
      users.ownerTherapist,
      null,
      'correction',
      tag,
      null,
      null,
      -60,
      'Übertrag',
    );
    expect(eigen.balance_minutes).toBe(-60);
  });

  it('weist Minusstunden mit Plus ab - Plus-Zeit nur als Überstunden mit Lage (ANN-606)', async () => {
    const tag = HEUTE;
    for (const k of [users.office, users.ownerTherapist]) {
      expect(
        await fehler(k, EINTRAGEN, [STAFF.tim, 'correction', tag, null, null, 45, 'Plus']),
        k,
      ).toMatchObject({ code: '22023', message: 'time account rule: correction_invalid' });
    }
    // Die Vorschau nennt denselben Grund, bevor eingetragen wird.
    const vorschau = await daten<{ minutes: number | null; problems: string[] }>(
      users.office,
      VORSCHAU,
      [STAFF.tim, 'correction', tag, null, null, 45],
    );
    expect(vorschau).toMatchObject({ minutes: null, problems: ['correction_invalid'] });
    expect(
      (
        await daten<{ minutes: number | null; problems: string[] }>(users.office, VORSCHAU, [
          STAFF.tim,
          'correction',
          tag,
          null,
          null,
          -45,
        ])
      ).minutes,
    ).toBe(-45);
    expect((await konto(users.office, STAFF.tim)).account?.balance_minutes).toBe(0);
  });

  it('lässt die anderen Rollen nicht für andere eintragen', async () => {
    const tag = werktagVorHeute();
    for (const [k, fuer] of [
      [users.therapist, STAFF.tim],
      [users.teamLead, STAFF.anna],
      [users.trainer, STAFF.anna],
    ] as const) {
      expect(
        (await fehler(k, EINTRAGEN, [fuer, 'overtime', tag, '18:00', '19:00', null, null]))?.code,
        k,
      ).toBe('P0002');
    }
  });

  it('nimmt eine Buchung für andere nur zurück, solange das Recht dazu besteht (Zweitreview B5)', async () => {
    const fuerTim = await eingetragen(
      users.office,
      STAFF.tim,
      'overtime',
      werktagVorHeute(),
      '18:00',
      '19:00',
    );
    const korrektur = await eingetragen(
      users.office,
      STAFF.tim,
      'correction',
      HEUTE,
      null,
      null,
      -30,
      'Übertrag',
    );
    // Olivia wechselt vom Büro in die Therapie: Ihr Konto bleibt, das Recht
    // für andere nicht.
    await asPostgres(
      `update public.user_roles set role_key = 'therapist'
        where user_id = $1 and organization_id = $2 and role_key = 'office'`,
      [users.office, organizationId],
    );
    for (const id of [fuerTim.id, korrektur.id]) {
      expect((await fehler(users.office, ZURUECKNEHMEN, [id]))?.code, id).toBe('P0002');
    }
    const olivia = await konto(users.office);
    expect(olivia.can_book_others).toBe(false);
    expect((await konto(users.ownerTherapist, STAFF.tim)).account?.balance_minutes).toBe(30);
  });
});

describe('Sichtbarkeit (ANN-596, BEF-066 Option 2 mit Büro)', () => {
  it('zeigt der Person ihr Konto, owner und Büro die Konten aller je Person - ohne Summe', async () => {
    await eingetragen(
      users.therapist,
      null,
      'overtime',
      werktagVorHeute(),
      '18:00',
      '19:00',
      null,
      'Hausbesuch',
    );
    await eingetragen(users.teamLead, null, 'overtime', werktagVorHeute(), '18:00', '18:30');

    const anna = await konto(users.therapist);
    expect(anna.can_book_others).toBe(false);
    expect(anna.can_reject).toBe(false);
    expect(anna.accounts).toEqual([]);

    for (const k of [users.office, users.ownerTherapist]) {
      const stand = await konto(k);
      expect(stand.can_book_others, k).toBe(true);
      const salden = Object.fromEntries(
        stand.accounts.map((a) => [a.staff_member_id, a.balance_minutes]),
      );
      expect(salden[STAFF.anna]).toBe(60);
      expect(salden[STAFF.tim]).toBe(30);
      expect(Object.keys(stand).sort()).toEqual(
        ['account', 'accounts', 'can_book_others', 'can_reject', 'my_staff_member_id'].sort(),
      );
      const fremd = await konto(k, STAFF.anna);
      expect(fremd.account?.entries[0]?.note).toBe('Hausbesuch');
    }
    expect((await konto(users.ownerTherapist)).can_reject).toBe(true);
    expect((await konto(users.office)).can_reject).toBe(false);
  });

  it('zeigt fremde Konten sonst niemandem; die Trainingsbetreuung sieht ihr eigenes', async () => {
    await eingetragen(users.teamLead, null, 'overtime', werktagVorHeute(), '18:00', '18:30');
    for (const [k, fuer] of [
      [users.therapist, STAFF.tim],
      [users.teamLead, STAFF.anna],
      [users.trainer, STAFF.anna],
    ] as const) {
      expect((await fehler(k, KONTO, [fuer]))?.code, k).toBe('P0002');
      // Auch die Vorschau verrät über eine andere Person nichts (Zweitreview B3).
      expect(
        (await fehler(k, VORSCHAU, [fuer, 'time_off', werktagNach(8), null, null, null]))?.code,
        k,
      ).toBe('P0002');
    }
    const tom = await konto(users.trainer);
    expect(tom.account?.staff_member_id).toBe(STAFF.tom);
  });

  it('nennt in der Vorschau fremder Konten keinen Urlaub und keine früheren Zeiten (Zweitreview B1)', async () => {
    const urlaub = werktagVorHeute();
    let frueher = plusTage(urlaub, -1);
    while (wochentag(frueher) > 5) frueher = plusTage(frueher, -1);
    await asPostgres(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by, decided_by, decided_at)
       values ($1, $2, $3, $3, 1, 'approved', $4, $5, now())`,
      [organizationId, STAFF.anna, urlaub, users.therapist, users.ownerTherapist],
    );
    type Vorschau = { day: { kind: string; blocks: unknown[] | null } | null; problems: string[] };
    const vorschau = (k: string, fuer: string | null, art: string, tag: string) =>
      daten<Vorschau>(k, VORSCHAU, [fuer, art, tag, null, null, null]);

    // Das Büro sieht den Urlaub einer anderen Person wie im Kalender als
    // Abwesenheit, owner als Urlaub, Anna selbst ebenso.
    expect(await vorschau(users.office, STAFF.anna, 'time_off', urlaub)).toMatchObject({
      day: { kind: 'unavailable', blocks: null },
      problems: ['absent'],
    });
    expect(await vorschau(users.ownerTherapist, STAFF.anna, 'time_off', urlaub)).toMatchObject({
      day: { kind: 'leave', blocks: null },
      problems: ['leave'],
    });
    expect(await vorschau(users.therapist, null, 'time_off', urlaub)).toMatchObject({
      day: { kind: 'leave', blocks: [] },
      problems: ['leave'],
    });

    // Frühere Zeiten liest nur der Server - für andere vor heute ohne Blöcke.
    expect((await vorschau(users.office, STAFF.anna, 'overtime', frueher)).day).toEqual({
      kind: 'plan',
      blocks: null,
    });
    expect((await vorschau(users.therapist, null, 'overtime', frueher)).day?.blocks).toEqual(
      ANNAS_TAG,
    );
    expect((await vorschau(users.office, STAFF.anna, 'time_off', werktagNach(8))).day).toEqual({
      kind: 'plan',
      blocks: ANNAS_TAG,
    });

    // Außerhalb des Fensters und bei einer Korrektur gibt es keinen Tag.
    expect(
      await vorschau(users.office, STAFF.anna, 'overtime', plusTage(HEUTE, -60)),
    ).toMatchObject({ day: null, problems: ['date_out_of_range'] });
    expect((await vorschau(users.office, STAFF.anna, 'correction', urlaub)).day).toBeNull();
  });

  it('gibt kein Tabellenrecht; den Bezug der Abweichung liest niemand', async () => {
    const tag = werktagNach(8);
    await eingetragen(users.therapist, null, 'time_off', tag, '16:00', '18:00');
    for (const k of [users.therapist, users.office, users.ownerTherapist]) {
      expect((await fehler(k, 'select * from public.staff_time_account_entries'))?.code, k).toBe(
        '42501',
      );
      expect(
        (await fehler(k, 'select time_account_entry_id from public.staff_working_hour_exceptions'))
          ?.code,
        k,
      ).toBe('42501');
    }
    // Der Kalender liest die Abweichung wie jede andere.
    const { rows } = await asUser<{ n: number }>(
      users.office,
      `select count(*)::int as n from public.staff_working_hour_exceptions
        where staff_member_id = $1 and on_date = $2`,
      [STAFF.anna, tag],
    );
    expect(rows[0]!.n).toBe(2);
  });
});

describe('Negativfälle (ADR-013 Punkt 9 Nr. 1)', () => {
  const AUFRUFE: [string, unknown[]][] = [
    [EINTRAGEN, [null, 'overtime', '2026-01-05', '18:00', '19:00', null, null]],
    [VORSCHAU, [null, 'overtime', '2026-01-05', null, null, null]],
    [ZURUECKNEHMEN, ['00000000-0000-4000-8000-000000000000']],
    [ZURUECKWEISEN, ['00000000-0000-4000-8000-000000000000', 'Nein']],
    [KONTO, [null]],
  ];

  it('weist Patienten-, Plattformkonten und Anonyme überall ab', async () => {
    for (const k of [users.patientMax, users.plattformTina, null]) {
      for (const [sql, params] of AUFRUFE) {
        expect((await fehler(k, sql, params))?.code, `${k} ${sql}`).toBe('42501');
      }
    }
  });

  it('trennt Organisationen: fremde owner sehen, buchen und weisen nichts zurück', async () => {
    const mehr = await eingetragen(
      users.therapist,
      null,
      'overtime',
      werktagVorHeute(),
      '18:00',
      '19:00',
    );
    const fremd = await fremdeOrganisation();
    expect((await fehler(fremd.owner, KONTO, [STAFF.anna]))?.code).toBe('P0002');
    expect(
      (
        await fehler(fremd.owner, VORSCHAU, [
          STAFF.anna,
          'overtime',
          werktagVorHeute(),
          null,
          null,
          null,
        ])
      )?.code,
    ).toBe('P0002');
    expect(
      (
        await fehler(fremd.owner, EINTRAGEN, [
          STAFF.anna,
          'overtime',
          werktagVorHeute(),
          '19:00',
          '20:00',
          null,
          null,
        ])
      )?.code,
    ).toBe('P0002');
    expect((await fehler(fremd.owner, ZURUECKWEISEN, [mehr.id, 'Nein']))?.code).toBe('P0002');
    const eigen = await konto(fremd.owner);
    expect(eigen.accounts.some((a) => a.staff_member_id === STAFF.anna)).toBe(false);
  });
});

describe('Fristen (ANN-597, ADR-008)', () => {
  /** Annas Einträge nach Datum: Art, Datum, Minuten, Zustand. */
  async function eintraege() {
    const { rows } = await asPostgres<{
      kind: string;
      tag: string;
      minutes: number;
      status: string;
    }>(
      `select kind, to_char(on_date, 'YYYY-MM-DD') as tag, minutes, status
         from public.staff_time_account_entries where staff_member_id = $1
        order by on_date, kind`,
      [STAFF.anna],
    );
    return rows;
  }

  async function saldo() {
    const { rows } = await asPostgres<{ n: number }>(
      'select app.time_account_balance($1, $2) as n',
      [organizationId, STAFF.anna],
    );
    return rows[0]!.n;
  }

  it('löscht gültige drei Jahre ab Jahresende - ihr Saldo bleibt als Übertrag', async () => {
    const vorjahr = `${Number(HEUTE.slice(0, 4)) - 1}-06-04`;
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.staff_time_account_entries
         (organization_id, staff_member_id, kind, on_date, starts_at, ends_at, minutes, note,
          status, entered_by, entered_at)
       values
         ($1, $2, 'overtime', '2019-06-04', '18:00', '19:00', 60, null, 'valid', $3, '2019-06-04'),
         ($1, $2, 'time_off', '2019-06-11', '16:00', '18:00', -120, null, 'valid', $3, '2019-06-11'),
         ($1, $2, 'correction', '2019-12-20', null, null, 45, 'Stundenliste', 'valid', $3, '2019-12-20'),
         ($1, $2, 'overtime', $4::date, '18:00', '19:00', 60, null, 'valid', $3, $4::date)
       returning id`,
      [organizationId, STAFF.anna, users.therapist, vorjahr],
    );
    // Der Freizeitausgleich von damals mit seiner Abweichung.
    await asPostgres(
      `insert into public.staff_working_hour_exceptions
         (organization_id, staff_member_id, on_date, kind, starts_at, ends_at, time_account_entry_id)
       values ($1, $2, '2019-06-11', 'block', '08:00', '16:00', $3)`,
      [organizationId, STAFF.anna, rows[1]!.id],
    );
    expect(await saldo()).toBe(45);

    await asPostgres('select public.apply_retention()');
    expect(await eintraege()).toEqual([
      { kind: 'carryover', tag: '2019-12-31', minutes: -15, status: 'valid' },
      { kind: 'overtime', tag: vorjahr, minutes: 60, status: 'valid' },
    ]);
    expect(await saldo()).toBe(45);
    expect(await abweichungen(STAFF.anna, '2019-06-11')).toEqual([]);
    const { rows: journal } = await asPostgres<{ retention_class: string; n: number }>(
      `select retention_class, count(*)::int as n from public.deletion_journal
        where target_table = 'staff_time_account_entries' group by retention_class`,
    );
    expect(journal).toEqual([{ retention_class: 'zeitkonto', n: 3 }]);

    // Ein zweiter Lauf ändert nichts; den Übertrag weist niemand zurück und
    // nimmt niemand zurück.
    await asPostgres('select public.apply_retention()');
    expect(await saldo()).toBe(45);
    const stand = await konto(users.ownerTherapist, STAFF.anna);
    const uebertrag = stand.account?.entries.find((e) => e.kind === 'carryover');
    expect(uebertrag).toEqual(
      expect.objectContaining({
        on_date: '2019-12-31',
        minutes: -15,
        starts_at: null,
        note: null,
        entered_by_name: null,
        can_withdraw: false,
        can_reject: false,
      }),
    );
    expect((await fehler(users.ownerTherapist, ZURUECKWEISEN, [uebertrag!.id, 'Nein']))?.code).toBe(
      'P0002',
    );
    for (const k of [users.therapist, users.office, users.ownerTherapist]) {
      expect((await fehler(k, ZURUECKNEHMEN, [uebertrag!.id]))?.code, k).toBe('P0002');
    }
  });

  it('löscht zurückgewiesene und zurückgenommene nach einem Jahr', async () => {
    await asPostgres(
      `insert into public.staff_time_account_entries
         (organization_id, staff_member_id, kind, on_date, starts_at, ends_at, minutes, status,
          entered_by, entered_at, rejected_by, rejected_at, rejection_note, withdrawn_at)
       values
         ($1, $2, 'overtime', '2019-06-05', '18:00', '19:00', 60, 'rejected', $3, '2019-06-05', $4,
          now() - interval '400 days', 'Nein', null),
         ($1, $2, 'overtime', '2019-06-06', '18:00', '19:00', 60, 'withdrawn', $3, '2019-06-06', null, null,
          null, now() - interval '400 days'),
         ($1, $2, 'overtime', '2019-06-07', '18:00', '19:00', 60, 'rejected', $3, '2019-06-07', $4,
          now() - interval '10 days', 'Nein', null)`,
      [organizationId, STAFF.anna, users.therapist, users.ownerTherapist],
    );
    await asPostgres('select public.apply_retention()');
    // Nicht gezählte Einträge hinterlassen keinen Übertrag.
    expect(await eintraege()).toEqual([
      { kind: 'overtime', tag: '2019-06-07', minutes: 60, status: 'rejected' },
    ]);
    const { rows: journal } = await asPostgres<{ retention_class: string; n: number }>(
      `select retention_class, count(*)::int as n from public.deletion_journal
        where target_table = 'staff_time_account_entries' group by retention_class`,
    );
    expect(journal).toEqual([{ retention_class: 'zeitkonto_kurz', n: 2 }]);
  });

  it('löscht nach einer Wiederherstellung erneut (ADR-012)', async () => {
    const { rows } = await asPostgres<{ id: string; zeile: unknown }>(
      `insert into public.staff_time_account_entries
         (organization_id, staff_member_id, kind, on_date, starts_at, ends_at, minutes, status,
          entered_by, entered_at, withdrawn_at)
       values ($1, $2, 'overtime', '2019-06-06', '18:00', '19:00', 60, 'withdrawn', $3, '2019-06-06',
               now() - interval '400 days'),
              ($1, $2, 'overtime', '2019-06-04', '18:00', '19:30', 90, 'valid', $3, '2019-06-04', null)
       returning id, to_jsonb(staff_time_account_entries.*) as zeile`,
      [organizationId, STAFF.anna, users.therapist],
    );
    await asPostgres('select public.apply_retention()');
    const zaehle = async () =>
      (
        await asPostgres<{ n: number }>(
          'select count(*)::int as n from public.staff_time_account_entries where id = any($1::uuid[])',
          [rows.map((r) => r.id)],
        )
      ).rows[0]!.n;
    expect(await zaehle()).toBe(0);
    expect(await saldo()).toBe(90);

    // Der Stand vor dem Lauf kommt zurück: beide Einträge, noch kein Übertrag.
    await asPostgres(`delete from public.staff_time_account_entries where kind = 'carryover'`);
    for (const r of rows) {
      await asPostgres(
        `insert into public.staff_time_account_entries
         select * from jsonb_populate_record(null::public.staff_time_account_entries, $1::jsonb)`,
        [JSON.stringify(r.zeile)],
      );
    }
    expect(await zaehle()).toBe(2);
    await asPostgres('select public.reapply_deletion_journal()');
    expect(await zaehle()).toBe(0);
    // Der Übertrag entsteht dabei neu und genau einmal.
    expect(await eintraege()).toEqual([
      { kind: 'carryover', tag: '2019-12-31', minutes: 90, status: 'valid' },
    ]);
    expect(await saldo()).toBe(90);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Arbeitszeitänderung mit der Antragsmechanik aus URL-001 (AZ-001,
 * Überholung 8).
 *
 * Geprüft werden die Fassungen des Wochenplans (ANN-589) mit ihren Lesern,
 * die Prüfungen am Server - keine Reduktion, ArbZG, nicht rückwirkend
 * (ANN-588) -, Zustände, Rechte und Wirkung (ANN-590), die Sichtbarkeit, die
 * Negativfälle aus ADR-013 Punkt 9 Nr. 1 (andere Organisation, Rolle ohne
 * Recht, Patienten- und Plattformkonto, fremde Person, ohne Sitzung) und der
 * Löschlauf mit Journal (ANN-591, ADR-013 Nr. 4). Kein Auditeintrag (ADR-010
 * Punkt 15).
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

const VORSCHAU = 'select public.preview_working_time_change($1, $2::date, $3::jsonb) as daten';
const BEANTRAGEN = 'select public.request_working_time_change($1, $2::date, $3::jsonb, $4) as id';
const ZURUECKZIEHEN = 'select public.withdraw_working_time_request($1::uuid)';
const ENTSCHEIDEN = 'select public.decide_working_time_request($1::uuid, $2::boolean, $3) as daten';
const LISTE = 'select public.list_working_time() as daten';
const ABGEDECKT =
  'select app.is_within_working_hours($1::uuid, $2::uuid, $3::date, $4::time, $5::time) as ja';

function plusTage(tag: string, tage: number): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Der erste Montag, der mindestens acht Tage entfernt ist - weit genug von „heute“. */
function naechsterMontag(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 8);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const MONTAG = naechsterMontag();
const DIENSTAG = plusTage(MONTAG, 1);
const HEUTE = new Date().toISOString().slice(0, 10);

interface Block {
  von: string;
  bis: string;
}

/** Annas Tag im Seed: 08:00-12:00 und 13:00-18:00, neun Stunden mit einer Stunde Pause. */
const ANNAS_TAG: Block[] = [
  { von: '08:00', bis: '12:00' },
  { von: '13:00', bis: '18:00' },
];

/** Annas Woche (Montag bis Freitag), einzelne Tage ersetzt. */
function woche(tage: Partial<Record<number, Block[]>> = {}): Record<string, Block[]> {
  const ergebnis: Record<string, Block[]> = {};
  for (let tag = 1; tag <= 7; tag += 1) {
    ergebnis[String(tag)] = tage[tag] ?? (tag <= 5 ? ANNAS_TAG : []);
  }
  return ergebnis;
}

/** Ein Tag mit späterer Pause, gleich lang: 08:00-12:30 und 13:30-18:00. */
const SPAETE_PAUSE: Block[] = [
  { von: '08:00', bis: '12:30' },
  { von: '13:30', bis: '18:00' },
];

interface Fehler {
  code?: string;
  message: string;
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

async function beantragt(
  konto: string,
  art: 'once' | 'permanent',
  datum: string,
  bloecke: unknown,
  grund: string | null = null,
) {
  const { rows } = await asUserCommitted<{ id: string }>(konto, BEANTRAGEN, [
    art,
    datum,
    JSON.stringify(bloecke),
    grund,
  ]);
  return rows[0]!.id;
}

async function antrag(id: string) {
  const { rows } = await asPostgres<{
    status: string;
    previous_minutes: number;
    new_minutes: number;
    decided_by: string | null;
    decision_note: string | null;
    self_entered: boolean;
    message: string | null;
  }>(
    `select status, previous_minutes, new_minutes, decided_by, decision_note, self_entered, message
       from public.staff_working_time_requests where id = $1`,
    [id],
  );
  return rows[0]!;
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

async function fassungen(staff: string) {
  const { rows } = await asPostgres<{ ab: string | null; bis: string | null; n: number }>(
    `select to_char(valid_from, 'YYYY-MM-DD') as ab, to_char(valid_until, 'YYYY-MM-DD') as bis,
            count(*)::int as n
       from public.staff_working_hours where staff_member_id = $1
      group by valid_from, valid_until order by valid_from nulls first`,
    [staff],
  );
  return rows;
}

beforeEach(resetDatabase);

describe('Fassungen des Wochenplans (ANN-589)', () => {
  it('beendet den Plan am Vortag und lässt den neuen am Datum beginnen', async () => {
    const id = await beantragt(users.therapist, 'permanent', MONTAG, woche({ 2: SPAETE_PAUSE }));
    expect((await antrag(id)).status).toBe('requested');
    // Vor der Genehmigung gilt der bisherige Plan auch nach dem Datum.
    expect(await abgedeckt(STAFF.anna, DIENSTAG, '12:00', '12:30')).toBe(false);

    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
    expect(await fassungen(STAFF.anna)).toEqual([
      { ab: null, bis: plusTage(MONTAG, -1), n: 10 },
      { ab: MONTAG, bis: null, n: 10 },
    ]);
    // Ab dem Datum die neue Pause (12:30-13:30), davor die alte (12:00-13:00).
    expect(await abgedeckt(STAFF.anna, DIENSTAG, '12:00', '12:30')).toBe(true);
    expect(await abgedeckt(STAFF.anna, DIENSTAG, '13:00', '13:30')).toBe(false);
    expect(await abgedeckt(STAFF.anna, plusTage(DIENSTAG, -7), '12:00', '12:30')).toBe(false);
    expect(await abgedeckt(STAFF.anna, plusTage(DIENSTAG, -7), '13:00', '13:30')).toBe(true);
    // Dieselbe Regel in der Slotsuche.
    const { rows } = await asPostgres<{ bereiche: string }>(
      'select app.working_ranges($1, $2, $3::date)::text as bereiche',
      [STAFF.anna, organizationId, DIENSTAG],
    );
    expect(rows[0]!.bereiche).toBe('{[08:00:00,12:30:00),[13:30:00,18:00:00)}');
  });

  it('zählt Urlaubstage nach der Fassung jedes Tages', async () => {
    // Feste Tage ohne Feiertag (Februar 2030): bis zum 17. Montag bis Freitag,
    // ab dem 18. auch samstags, dafür freitags kürzer.
    await asPostgres(
      `update public.staff_working_hours set valid_until = '2030-02-17' where staff_member_id = $1`,
      [STAFF.anna],
    );
    await asPostgres(
      `insert into public.staff_working_hours
         (organization_id, staff_member_id, weekday, starts_at, ends_at, valid_from)
       select $1::uuid, $2::uuid, t.tag, b.von, b.bis, date '2030-02-18'
       from (values (1), (2), (3), (4)) as t (tag)
       cross join (values (time '08:00', time '12:00'), (time '13:00', time '18:00')) as b (von, bis)
       union all
       select $1::uuid, $2::uuid, 5, time '08:00', time '12:00', date '2030-02-18'
       union all
       select $1::uuid, $2::uuid, 6, time '08:00', time '13:00', date '2030-02-18'`,
      [organizationId, STAFF.anna],
    );
    const { rows } = await asPostgres<{ vorher: number; nachher: number }>(
      `select app.leave_days($1, $2, '2030-02-11', '2030-02-17') as vorher,
              app.leave_days($1, $2, '2030-02-18', '2030-02-24') as nachher`,
      [organizationId, STAFF.anna],
    );
    expect(rows[0]).toEqual({ vorher: 5, nachher: 6 });
  });

  it('pflegt in der Planung die heute gültige Fassung, die künftige bleibt', async () => {
    const id = await beantragt(users.therapist, 'permanent', MONTAG, woche({ 2: SPAETE_PAUSE }));
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
    // Office gibt Anna mittwochs bis heute nur noch den Vormittag.
    await asUserCommitted(
      users.office,
      'select public.set_staff_working_hours($1, 3::smallint, $2::jsonb)',
      [STAFF.anna, JSON.stringify([{ von: '08:00', bis: '12:00' }])],
    );
    const mittwochVorher = plusTage(MONTAG, -5);
    const mittwochNachher = plusTage(MONTAG, 2);
    expect(await abgedeckt(STAFF.anna, mittwochVorher, '14:00', '15:00')).toBe(false);
    expect(await abgedeckt(STAFF.anna, mittwochNachher, '14:00', '15:00')).toBe(true);
    expect(await fassungen(STAFF.anna)).toEqual([
      { ab: null, bis: plusTage(MONTAG, -1), n: 9 },
      { ab: MONTAG, bis: null, n: 10 },
    ]);
  });

  it('ersetzt eine noch nicht begonnene Fassung vom selben Datum', async () => {
    const erste = await beantragt(users.therapist, 'permanent', MONTAG, woche({ 2: SPAETE_PAUSE }));
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [erste, true, null]);
    const zweite = await beantragt(
      users.therapist,
      'permanent',
      MONTAG,
      woche({
        2: SPAETE_PAUSE,
        4: [
          { von: '07:30', bis: '12:00' },
          { von: '13:00', bis: '17:30' },
        ],
      }),
    );
    // Bisher ist jetzt die Fassung, die am Datum gelten soll.
    expect((await antrag(zweite)).previous_minutes).toBe(45 * 60);
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [zweite, true, null]);
    expect(await fassungen(STAFF.anna)).toEqual([
      { ab: null, bis: plusTage(MONTAG, -1), n: 10 },
      { ab: MONTAG, bis: null, n: 10 },
    ]);
    expect(await abgedeckt(STAFF.anna, plusTage(MONTAG, 3), '07:30', '08:00')).toBe(true);
  });

  it('hält an, wenn nach dem Datum schon ein späterer Plan gilt', async () => {
    const spaeter = await beantragt(
      users.therapist,
      'permanent',
      plusTage(MONTAG, 7),
      woche({ 2: SPAETE_PAUSE }),
    );
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [spaeter, true, null]);
    const f = await fehler(users.therapist, BEANTRAGEN, [
      'permanent',
      MONTAG,
      JSON.stringify(woche({ 3: SPAETE_PAUSE })),
      null,
    ]);
    expect(f?.code).toBe('55000');
    expect(f?.message).toContain('later working plan exists');
  });

  it('zeigt laufende und künftige Fassungen, keine fremde Praxis und nichts, was gestern endete', async () => {
    const id = await beantragt(users.therapist, 'permanent', MONTAG, woche({ 2: SPAETE_PAUSE }));
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
    const sichtbar = async (konto: string) =>
      (
        await asUser<{ n: number }>(
          konto,
          'select count(*)::int as n from public.staff_working_hours where staff_member_id = $1',
          [STAFF.anna],
        )
      ).rows[0]!.n;
    expect(await sichtbar(users.therapist)).toBe(20);
    expect(await sichtbar(users.office)).toBe(20);
    const fremd = await fremdeOrganisation();
    expect(await sichtbar(fremd.owner)).toBe(0);
    // Eine Fassung, die heute endet, steht noch da; eine, die gestern endete, nicht.
    await asPostgres(
      `update public.staff_working_hours set valid_until = (now() at time zone 'Europe/Berlin')::date
        where staff_member_id = $1 and valid_until is not null`,
      [STAFF.anna],
    );
    expect(await sichtbar(users.therapist)).toBe(20);
    await asPostgres(
      `update public.staff_working_hours set valid_until = (now() at time zone 'Europe/Berlin')::date - 1
        where staff_member_id = $1 and valid_until is not null`,
      [STAFF.anna],
    );
    expect(await sichtbar(users.therapist)).toBe(10);
  });

  it('lässt je Person und Tag nur eine Fassung zu (Zweitreview B5)', async () => {
    const f = await asPostgres(
      `insert into public.staff_working_hours
         (organization_id, staff_member_id, weekday, starts_at, ends_at, valid_from)
       values ($1, $2, 6, '09:00', '12:00', (now() at time zone 'Europe/Berlin')::date + 30)`,
      [organizationId, STAFF.anna],
    ).catch((fehler: Fehler) => fehler);
    expect((f as Fehler).code).toBe('23P01');
    expect((f as Fehler).message).toContain('working plan versions overlap');
  });

  it('füllt in der Planung die Lücke, wenn heute keine Fassung gilt', async () => {
    await asPostgres('delete from public.staff_working_hours where staff_member_id = $1', [
      STAFF.anna,
    ]);
    await asPostgres(
      `insert into public.staff_working_hours
         (organization_id, staff_member_id, weekday, starts_at, ends_at, valid_from, valid_until)
       values ($1, $2, 1, '08:00', '12:00', '2019-01-01', (now() at time zone 'Europe/Berlin')::date - 3),
              ($1, $2, 1, '08:00', '12:00', (now() at time zone 'Europe/Berlin')::date + 10, null)`,
      [organizationId, STAFF.anna],
    );
    await asUserCommitted(
      users.office,
      'select public.set_staff_working_hours($1, 3::smallint, $2::jsonb)',
      [STAFF.anna, JSON.stringify([{ von: '08:00', bis: '12:00' }])],
    );
    const { rows } = await asPostgres<{ passt: boolean }>(
      `select valid_from = (now() at time zone 'Europe/Berlin')::date - 2
          and valid_until = (now() at time zone 'Europe/Berlin')::date + 9 as passt
         from public.staff_working_hours where staff_member_id = $1 and weekday = 3`,
      [STAFF.anna],
    );
    expect(rows).toEqual([{ passt: true }]);
  });

  it('zeigt frühere Fassungen niemandem mehr über die Tabelle', async () => {
    await asPostgres(
      `update public.staff_working_hours set valid_from = '2020-01-01' where staff_member_id = $1`,
      [STAFF.anna],
    );
    await asPostgres(
      `insert into public.staff_working_hours
         (organization_id, staff_member_id, weekday, starts_at, ends_at, valid_from, valid_until)
       values ($1, $2, 6, '09:00', '12:00', '2019-01-01', '2019-12-31')`,
      [organizationId, STAFF.anna],
    );
    for (const konto of [users.ownerTherapist, users.office, users.therapist, users.teamLead]) {
      const { rows } = await asUser<{ n: number }>(
        konto,
        `select count(*)::int as n from public.staff_working_hours
          where staff_member_id = $1 and valid_until is not null`,
        [STAFF.anna],
      );
      expect(rows[0]!.n, konto).toBe(0);
    }
    // Der Server liest sie weiter: für den Tag damals gilt der Samstag.
    expect(await abgedeckt(STAFF.anna, '2019-06-01', '09:00', '10:00')).toBe(true);
  });
});

describe('Beantragen und entscheiden (ANN-590)', () => {
  it('beantragt einmalig, owner genehmigt: die Abweichung gilt für den Tag', async () => {
    const neu = [
      { von: '07:00', bis: '12:00' },
      { von: '13:00', bis: '17:00' },
    ];
    const id = await beantragt(users.therapist, 'once', DIENSTAG, neu, 'Elternabend um 17:30');
    expect(await antrag(id)).toMatchObject({
      status: 'requested',
      previous_minutes: 540,
      new_minutes: 540,
      message: 'Elternabend um 17:30',
    });
    const { rows } = await asUserCommitted<{ daten: { status: string } }>(
      users.ownerTherapist,
      ENTSCHEIDEN,
      [id, true, null],
    );
    expect(rows[0]!.daten.status).toBe('approved');
    const { rows: tag } = await asPostgres<{
      von: string;
      bis: string;
      created_by: string;
      antrag: string;
    }>(
      `select to_char(starts_at, 'HH24:MI') as von, to_char(ends_at, 'HH24:MI') as bis, created_by,
              working_time_request_id as antrag
         from public.staff_working_hour_exceptions
        where staff_member_id = $1 and on_date = $2 order by starts_at`,
      [STAFF.anna, DIENSTAG],
    );
    expect(tag.map(({ von, bis }) => ({ von, bis }))).toEqual(neu);
    expect(tag[0]!.created_by).toBe(users.ownerTherapist);
    // Der Tag kennt seinen Antrag und fällt mit dessen Frist (ANN-591).
    expect(tag.every((zeile) => zeile.antrag === id)).toBe(true);
    expect(await abgedeckt(STAFF.anna, DIENSTAG, '07:00', '08:00')).toBe(true);
    expect(await abgedeckt(STAFF.anna, DIENSTAG, '17:00', '18:00')).toBe(false);
  });

  it('lehnt nur mit Grund ab; die Person sieht ihn', async () => {
    const id = await beantragt(users.therapist, 'once', DIENSTAG, [
      { von: '07:00', bis: '12:00' },
      { von: '13:00', bis: '17:00' },
    ]);
    expect((await fehler(users.ownerTherapist, ENTSCHEIDEN, [id, false, ' ']))?.code).toBe('22023');
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [
      id,
      false,
      'Dienstags fehlt sonst die Frühschicht',
    ]);
    expect(await antrag(id)).toMatchObject({
      status: 'rejected',
      decided_by: users.ownerTherapist,
      decision_note: 'Dienstags fehlt sonst die Frühschicht',
    });
    const liste = await daten<{ own: { id: string; status: string; decision_note: string }[] }>(
      users.therapist,
      LISTE,
    );
    expect(liste.own[0]).toMatchObject({ id, status: 'rejected' });
    expect(liste.own[0]!.decision_note).toBe('Dienstags fehlt sonst die Frühschicht');
    // Keine Abweichung, der Plan gilt.
    expect(await abgedeckt(STAFF.anna, DIENSTAG, '07:00', '08:00')).toBe(false);
  });

  it('zieht den eigenen offenen Antrag zurück - fremde und entschiedene nicht', async () => {
    const id = await beantragt(users.therapist, 'permanent', MONTAG, woche({ 2: SPAETE_PAUSE }));
    expect((await fehler(users.teamLead, ZURUECKZIEHEN, [id]))?.code).toBe('P0002');
    await asUserCommitted(users.therapist, ZURUECKZIEHEN, [id]);
    expect((await antrag(id)).status).toBe('withdrawn');
    expect((await fehler(users.therapist, ZURUECKZIEHEN, [id]))?.code).toBe('P0002');
  });

  it('owner trägt die eigene Änderung direkt ein', async () => {
    const id = await beantragt(
      users.ownerTherapist,
      'permanent',
      MONTAG,
      woche({ 2: SPAETE_PAUSE }),
    );
    expect(await antrag(id)).toMatchObject({
      status: 'approved',
      self_entered: true,
      decided_by: users.ownerTherapist,
    });
    expect(await fassungen(STAFF.jannes)).toEqual([
      { ab: null, bis: plusTage(MONTAG, -1), n: 10 },
      { ab: MONTAG, bis: null, n: 10 },
    ]);
  });

  it('entscheidet nur owner und nie über den eigenen Antrag', async () => {
    const id = await beantragt(users.therapist, 'permanent', MONTAG, woche({ 2: SPAETE_PAUSE }));
    for (const konto of [users.teamLead, users.office, users.therapist, users.trainer]) {
      expect((await fehler(konto, ENTSCHEIDEN, [id, true, null]))?.code, konto).toBe('42501');
    }
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.staff_working_time_requests
         (organization_id, staff_member_id, kind, on_date, blocks, previous_blocks,
          previous_minutes, new_minutes, requested_by)
       values ($1, $2, 'once', $3, $4::jsonb, $5::jsonb, 540, 540, $6) returning id`,
      [
        organizationId,
        STAFF.jannes,
        DIENSTAG,
        JSON.stringify(SPAETE_PAUSE),
        JSON.stringify(ANNAS_TAG),
        users.ownerTherapist,
      ],
    );
    const eigen = await fehler(users.ownerTherapist, ENTSCHEIDEN, [rows[0]!.id, true, null]);
    expect(eigen?.code).toBe('42501');
    expect(eigen?.message).toContain('own request');
  });

  it('nennt nach der Genehmigung die Tage mit Terminen außerhalb, ohne sie zu verschieben', async () => {
    const { rows: termin } = await asPostgres<{ id: string }>(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
         starts_at, ends_at, kind
       ) values ($1, $2, $3, $4, 'practice', 'confirmed',
         ($5::date + time '17:15') at time zone 'Europe/Berlin',
         ($5::date + time '18:00') at time zone 'Europe/Berlin', 'therapy')
       returning id`,
      [organizationId, patients.erika, STAFF.anna, PRAXIS, DIENSTAG],
    );
    const neu = [
      { von: '07:00', bis: '12:00' },
      { von: '13:00', bis: '17:00' },
    ];
    const vorschau = await daten<{ appointment_days: { on_date: string; appointments: number }[] }>(
      users.therapist,
      VORSCHAU,
      ['once', DIENSTAG, JSON.stringify(neu)],
    );
    expect(vorschau.appointment_days).toEqual([{ on_date: DIENSTAG, appointments: 1 }]);
    const id = await beantragt(users.therapist, 'once', DIENSTAG, neu);
    const owner = await daten<{ to_decide: { id: string; appointment_days: unknown[] }[] }>(
      users.ownerTherapist,
      LISTE,
    );
    expect(owner.to_decide.find((a) => a.id === id)?.appointment_days).toEqual([
      { on_date: DIENSTAG, appointments: 1 },
    ]);
    const { rows } = await asUserCommitted<{
      daten: { appointment_days: { on_date: string; appointments: number }[] };
    }>(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
    expect(rows[0]!.daten.appointment_days).toEqual([{ on_date: DIENSTAG, appointments: 1 }]);
    const { rows: stand } = await asPostgres<{ status: string }>(
      'select status from public.appointments where id = $1',
      [termin[0]!.id],
    );
    expect(stand[0]!.status).toBe('confirmed');
  });

  it('nennt bei dauerhafter Änderung die Termine an Tagen ohne Abweichung ab dem Datum', async () => {
    for (const tag of [plusTage(DIENSTAG, -7), DIENSTAG, plusTage(DIENSTAG, 7)]) {
      await asPostgres(
        `insert into public.appointments (
           organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
           starts_at, ends_at, kind
         ) values ($1, $2, $3, $4, 'practice', 'confirmed',
           ($5::date + time '12:00') at time zone 'Europe/Berlin',
           ($5::date + time '12:30') at time zone 'Europe/Berlin', 'therapy')`,
        [organizationId, patients.erika, STAFF.anna, PRAXIS, tag],
      );
    }
    // Am zweiten Dienstag steht eine Abweichung - der Termin bleibt dort, wie er ist.
    await asPostgres(
      `insert into public.staff_working_hour_exceptions
         (organization_id, staff_member_id, on_date, kind, starts_at, ends_at)
       values ($1, $2, $3, 'block', '08:00', '14:00')`,
      [organizationId, STAFF.anna, plusTage(DIENSTAG, 7)],
    );
    const vorschau = await daten<{ appointment_days: { on_date: string; appointments: number }[] }>(
      users.therapist,
      VORSCHAU,
      [
        'permanent',
        MONTAG,
        JSON.stringify(
          woche({
            2: [
              { von: '08:00', bis: '11:30' },
              { von: '12:30', bis: '18:00' },
            ],
          }),
        ),
      ],
    );
    expect(vorschau.appointment_days).toEqual([{ on_date: DIENSTAG, appointments: 1 }]);
  });
});

describe('Prüfungen am Server (ANN-588)', () => {
  it('lässt weniger Stunden nicht zu - einmalig am Tag, dauerhaft in der Woche', async () => {
    const tag = await fehler(users.therapist, BEANTRAGEN, [
      'once',
      DIENSTAG,
      JSON.stringify([
        { von: '08:00', bis: '12:00' },
        { von: '13:00', bis: '17:00' },
      ]),
      null,
    ]);
    expect(tag?.code).toBe('22023');
    expect(tag?.message).toContain('reduced');
    const woch = await fehler(users.therapist, BEANTRAGEN, [
      'permanent',
      MONTAG,
      JSON.stringify(woche({ 5: [{ von: '08:00', bis: '12:00' }] })),
      null,
    ]);
    expect(woch?.message).toContain('reduced');
    // Stunden dürfen zwischen den Tagen wandern, solange die Woche bleibt.
    await beantragt(
      users.therapist,
      'permanent',
      MONTAG,
      woche({
        1: [
          { von: '08:00', bis: '12:00' },
          { von: '13:00', bis: '19:00' },
        ],
        5: [
          { von: '08:00', bis: '12:00' },
          { von: '13:00', bis: '17:00' },
        ],
      }),
    );
  });

  it('prüft Tageshöchstzeit, Pausen und Arbeit am Stück (§§ 3, 4 ArbZG)', async () => {
    const faelle: [Block[], string][] = [
      [
        [
          { von: '07:00', bis: '12:00' },
          { von: '12:45', bis: '18:30' },
        ],
        'more_than_ten_hours',
      ],
      [
        [
          { von: '08:00', bis: '12:00' },
          { von: '12:20', bis: '17:20' },
        ],
        'break_too_short',
      ],
      [
        [
          { von: '07:00', bis: '13:30' },
          { von: '14:00', bis: '16:30' },
        ],
        'more_than_six_hours_in_a_row',
      ],
    ];
    for (const [bloecke, problem] of faelle) {
      const f = await fehler(users.therapist, BEANTRAGEN, [
        'once',
        DIENSTAG,
        JSON.stringify(bloecke),
        null,
      ]);
      expect(f?.code, problem).toBe('22023');
      expect(f?.message, problem).toBe(`working time rule: ${problem}`);
      const vorschau = await daten<{ problems: string[] }>(users.therapist, VORSCHAU, [
        'once',
        DIENSTAG,
        JSON.stringify(bloecke),
      ]);
      expect(vorschau.problems).toContain(problem);
    }
  });

  it('verlangt elf Stunden Ruhe zu den Nachbartagen (§ 5 ArbZG)', async () => {
    // Montag endet um 18:00 - ein Dienstag ab 04:30 ließe 10,5 Stunden Ruhe.
    const einmalig = await fehler(users.therapist, BEANTRAGEN, [
      'once',
      DIENSTAG,
      JSON.stringify([
        { von: '04:30', bis: '10:30' },
        { von: '11:00', bis: '14:00' },
      ]),
      null,
    ]);
    expect(einmalig?.code).toBe('22023');
    expect(einmalig?.message).toBe('working time rule: rest_shorter_than_eleven_hours');
    // Dauerhaft: Montag bis 21:00, Dienstag ab 07:00.
    const dauerhaft = await fehler(users.therapist, BEANTRAGEN, [
      'permanent',
      MONTAG,
      JSON.stringify(
        woche({
          1: [
            { von: '11:00', bis: '15:00' },
            { von: '16:00', bis: '21:00' },
          ],
          2: [
            { von: '07:00', bis: '12:00' },
            { von: '13:00', bis: '17:00' },
          ],
        }),
      ),
      null,
    ]);
    expect(dauerhaft?.code).toBe('22023');
    expect(dauerhaft?.message).toBe('working time rule: rest_shorter_than_eleven_hours');
  });

  it('weist Unverändertes, Vergangenes, Unbrauchbares und Doppeltes ab', async () => {
    const versuche: [unknown[], string][] = [
      [['once', DIENSTAG, JSON.stringify(ANNAS_TAG), null], '22023'],
      [['once', HEUTE, JSON.stringify(SPAETE_PAUSE), null], '22023'],
      [['once', plusTage(HEUTE, 402), JSON.stringify(SPAETE_PAUSE), null], '22023'],
      [['weekly', DIENSTAG, JSON.stringify(SPAETE_PAUSE), null], '22023'],
      [['once', DIENSTAG, JSON.stringify([{ von: '12:00', bis: '08:00' }]), null], '22023'],
      [['once', DIENSTAG, JSON.stringify([{ von: '08:00:30', bis: '12:00' }]), null], '22023'],
      [
        [
          'once',
          DIENSTAG,
          JSON.stringify([
            { von: '08:00', bis: '12:00' },
            { von: '11:00', bis: '18:00' },
          ]),
          null,
        ],
        '23P01',
      ],
      [['permanent', MONTAG, JSON.stringify(SPAETE_PAUSE), null], '22023'],
      [['permanent', MONTAG, JSON.stringify({ ...woche(), 8: [] }), null], '22023'],
      [['once', DIENSTAG, JSON.stringify(SPAETE_PAUSE), 'x'.repeat(501)], '22023'],
    ];
    for (const [params, code] of versuche) {
      expect(
        (await fehler(users.therapist, BEANTRAGEN, params))?.code,
        JSON.stringify(params),
      ).toBe(code);
    }
    await beantragt(users.therapist, 'once', DIENSTAG, SPAETE_PAUSE);
    const doppelt = await fehler(users.therapist, BEANTRAGEN, [
      'once',
      DIENSTAG,
      JSON.stringify(SPAETE_PAUSE),
      null,
    ]);
    expect(doppelt?.code).toBe('55000');
  });

  it('schreibt beim Genehmigen keine Pflege zurück, die nach dem Antrag kam (Zweitreview B1)', async () => {
    const id = await beantragt(users.therapist, 'permanent', MONTAG, woche({ 2: SPAETE_PAUSE }));
    // Danach verlegt das Büro Annas Donnerstag - gleich viele Stunden.
    await asUserCommitted(
      users.office,
      'select public.set_staff_working_hours($1, 4::smallint, $2::jsonb)',
      [
        STAFF.anna,
        JSON.stringify([
          { von: '07:00', bis: '12:00' },
          { von: '13:00', bis: '17:00' },
        ]),
      ],
    );
    const f = await fehler(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
    expect(f?.code).toBe('55000');
    expect(f?.message).toContain('working plan changed since request');
    expect((await antrag(id)).status).toBe('requested');
  });

  it('prüft dauerhaft auch die Ruhe an Tagen mit Abweichung (Zweitreview B3)', async () => {
    // Mittwoch nach dem Datum steht als Abweichung ab 05:00 - nach Dienstag
    // bis 18:00 genau elf Stunden Ruhe.
    await asPostgres(
      `insert into public.staff_working_hour_exceptions
         (organization_id, staff_member_id, on_date, kind, starts_at, ends_at)
       values ($1, $2, $3, 'block', '05:00', '11:00'), ($1, $2, $3, 'block', '11:30', '14:30')`,
      [organizationId, STAFF.anna, plusTage(MONTAG, 2)],
    );
    // Der neue Plan endet dienstags um 19:00 - dann bleiben nur zehn Stunden.
    const f = await fehler(users.therapist, BEANTRAGEN, [
      'permanent',
      MONTAG,
      JSON.stringify(
        woche({
          2: [
            { von: '10:00', bis: '14:00' },
            { von: '15:00', bis: '19:00' },
          ],
          5: [
            { von: '08:00', bis: '12:00' },
            { von: '13:00', bis: '19:00' },
          ],
        }),
      ),
      null,
    ]);
    expect(f?.code).toBe('22023');
    expect(f?.message).toBe('working time rule: rest_shorter_than_eleven_hours');
  });

  it('ändert keinen Urlaubstag und keinen Tag mit Abwesenheit', async () => {
    await asPostgres(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by,
          decided_by, decided_at)
       values ($1, $2, $3, $3, 1, 'approved', $4, $5, now())`,
      [organizationId, STAFF.anna, DIENSTAG, users.therapist, users.ownerTherapist],
    );
    const urlaub = await fehler(users.therapist, BEANTRAGEN, [
      'once',
      DIENSTAG,
      JSON.stringify(SPAETE_PAUSE),
      null,
    ]);
    expect(urlaub?.code).toBe('55000');
    expect(urlaub?.message).toContain('approved leave');
    const mittwoch = plusTage(DIENSTAG, 1);
    await asPostgres(
      `insert into public.staff_working_hour_exceptions
         (organization_id, staff_member_id, on_date, kind) values ($1, $2, $3, 'unavailable')`,
      [organizationId, STAFF.anna, mittwoch],
    );
    const abwesend = await fehler(users.therapist, BEANTRAGEN, [
      'once',
      mittwoch,
      JSON.stringify(SPAETE_PAUSE),
      null,
    ]);
    expect(abwesend?.code).toBe('55000');
  });

  it('ohne Wochenplan gibt es nichts zu ändern', async () => {
    const f = await fehler(users.office, BEANTRAGEN, [
      'once',
      DIENSTAG,
      JSON.stringify(SPAETE_PAUSE),
      null,
    ]);
    expect(f?.code).toBe('22023');
    expect(f?.message).toContain('no working plan');
  });

  it('prüft beim Genehmigen gegen den jetzigen Plan und nie rückwirkend', async () => {
    const id = await beantragt(users.therapist, 'once', DIENSTAG, SPAETE_PAUSE);
    // Inzwischen arbeitet Anna dienstags länger (Planung, von Hand).
    await asUserCommitted(
      users.office,
      'select public.set_staff_working_hours($1, 2::smallint, $2::jsonb)',
      [
        STAFF.anna,
        JSON.stringify([
          { von: '08:00', bis: '12:00' },
          { von: '13:00', bis: '18:30' },
        ]),
      ],
    );
    const geaendert = await fehler(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
    expect(geaendert?.code).toBe('55000');
    expect(geaendert?.message).toContain('working plan changed since request');

    const zweiter = await beantragt(users.therapist, 'once', plusTage(DIENSTAG, 2), SPAETE_PAUSE);
    await asPostgres('update public.staff_working_time_requests set on_date = $2 where id = $1', [
      zweiter,
      HEUTE,
    ]);
    expect((await fehler(users.ownerTherapist, ENTSCHEIDEN, [zweiter, true, null]))?.code).toBe(
      '55000',
    );
    // Ablehnen geht immer.
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [zweiter, false, 'Datum vorbei']);
  });
});

describe('Sichtbarkeit und Negativfälle (ADR-013 Punkt 9 Nr. 1)', () => {
  it('zeigt der Person alles, owner die offenen Anträge anderer, sonst niemandem etwas', async () => {
    const id = await beantragt(
      users.therapist,
      'once',
      DIENSTAG,
      SPAETE_PAUSE,
      'Kita schließt früher',
    );
    const anna = await daten<{
      my_staff_member_id: string;
      can_decide: boolean;
      plan: { has_plan: boolean; current: Record<string, Block[]> };
      own: { id: string; message: string }[];
      to_decide: unknown[];
    }>(users.therapist, LISTE);
    expect(anna.my_staff_member_id).toBe(STAFF.anna);
    expect(anna.can_decide).toBe(false);
    expect(anna.plan.has_plan).toBe(true);
    expect(anna.plan.current['2']).toEqual(ANNAS_TAG);
    expect(anna.own).toEqual([expect.objectContaining({ id, message: 'Kita schließt früher' })]);
    expect(anna.to_decide).toEqual([]);

    const owner = await daten<{ to_decide: { id: string; name: string; message: string }[] }>(
      users.ownerTherapist,
      LISTE,
    );
    expect(owner.to_decide).toEqual([
      expect.objectContaining({ id, name: 'Anna Beispiel', message: 'Kita schließt früher' }),
    ]);

    for (const konto of [users.teamLead, users.office, users.trainer]) {
      const andere = await daten<{ own: unknown[]; to_decide: unknown[] }>(konto, LISTE);
      expect(andere.own, konto).toEqual([]);
      expect(andere.to_decide, konto).toEqual([]);
    }
  });

  it('zeigt der Trainingsbetreuung den eigenen Plan, obwohl sie die Tabelle nicht liest', async () => {
    const tom = await daten<{ plan: { has_plan: boolean; current: Record<string, Block[]> } }>(
      users.trainer,
      LISTE,
    );
    expect(tom.plan.has_plan).toBe(true);
    expect(tom.plan.current['6']).toEqual([{ von: '09:00', bis: '19:00' }]);
    const { rows } = await asUser<{ n: number }>(
      users.trainer,
      'select count(*)::int as n from public.staff_working_hours',
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('weist Patienten-, Plattformkonten und Anonyme überall ab', async () => {
    for (const konto of [users.patientMax, users.plattformTina, null]) {
      for (const [sql, params] of [
        [LISTE, []],
        [VORSCHAU, ['once', DIENSTAG, null]],
        [BEANTRAGEN, ['once', DIENSTAG, JSON.stringify(SPAETE_PAUSE), null]],
        [ZURUECKZIEHEN, ['00000000-0000-4000-8000-000000000000']],
        [ENTSCHEIDEN, ['00000000-0000-4000-8000-000000000000', true, null]],
      ] as const) {
        expect((await fehler(konto, sql, [...params]))?.code, `${konto} ${sql}`).toBe('42501');
      }
    }
  });

  it('trennt Organisationen: fremde owner sehen und entscheiden nichts', async () => {
    const id = await beantragt(users.therapist, 'once', DIENSTAG, SPAETE_PAUSE);
    const fremd = await fremdeOrganisation();
    expect((await fehler(fremd.owner, ENTSCHEIDEN, [id, true, null]))?.code).toBe('P0002');
    const liste = await daten<{ to_decide: unknown[]; own: unknown[] }>(fremd.owner, LISTE);
    expect(liste.to_decide).toEqual([]);
    expect(liste.own).toEqual([]);
    // Ohne Wochenplan in der fremden Praxis gibt es auch dort nichts zu beantragen.
    expect((await fehler(fremd.owner, VORSCHAU, ['once', DIENSTAG, null]))?.code).toBe('22023');
  });

  it('gibt kein Tabellenrecht auf die Anträge', async () => {
    await beantragt(users.therapist, 'once', DIENSTAG, SPAETE_PAUSE);
    for (const konto of [users.ownerTherapist, users.therapist, users.office]) {
      expect(
        (await fehler(konto, 'select count(*) from public.staff_working_time_requests'))?.code,
        konto,
      ).toBe('42501');
    }
    const { rows } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from information_schema.role_table_grants
        where table_name = 'staff_working_time_requests' and grantee in ('anon', 'authenticated')`,
    );
    expect(rows[0]!.n).toBe(0);
  });
});

describe('Fristen (ANN-591, ADR-008)', () => {
  it('löscht genehmigte nach drei Jahren, abgelehnte nach einem; offene nie', async () => {
    await asPostgres(
      `insert into public.staff_working_time_requests
         (organization_id, staff_member_id, kind, on_date, blocks, previous_blocks,
          previous_minutes, new_minutes, status, requested_by, requested_at, decided_by,
          decided_at, decision_note, withdrawn_at)
       values
         ($1, $2, 'once', '2019-06-04', '[]', '[]', 0, 0, 'approved', $3, '2019-05-01', $4, '2019-05-02', null, null),
         ($1, $2, 'once', '2019-06-05', '[]', '[]', 0, 0, 'requested', $3, '2019-05-01', null, null, null, null),
         ($1, $2, 'once', $5, '[]', '[]', 0, 0, 'rejected', $3, now() - interval '400 days', $4,
          now() - interval '399 days', 'Nein', null),
         ($1, $2, 'once', $5, '[]', '[]', 0, 0, 'withdrawn', $3, now() - interval '10 days', null,
          null, null, now() - interval '9 days')`,
      [organizationId, STAFF.anna, users.therapist, users.ownerTherapist, plusTage(MONTAG, 30)],
    );
    await asPostgres('select public.apply_retention()');
    const { rows } = await asPostgres<{ status: string }>(
      `select status from public.staff_working_time_requests where staff_member_id = $1 order by status`,
      [STAFF.anna],
    );
    expect(rows.map((r) => r.status)).toEqual(['requested', 'withdrawn']);
    const { rows: journal } = await asPostgres<{ retention_class: string }>(
      `select retention_class from public.deletion_journal
        where target_table = 'staff_working_time_requests' order by retention_class`,
    );
    expect(journal.map((j) => j.retention_class)).toEqual(['arbeitszeit', 'arbeitszeit_kurz']);
  });

  it('nimmt die Abweichung einer fälligen einmaligen Änderung mit (cascade, Zweitreview B2)', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.staff_working_time_requests
         (organization_id, staff_member_id, kind, on_date, blocks, previous_blocks,
          previous_minutes, new_minutes, status, requested_by, requested_at, decided_by, decided_at)
       values ($1, $2, 'once', '2019-06-04', '[]', '[]', 0, 0, 'approved', $3, '2019-05-01', $3, '2019-05-02')
       returning id`,
      [organizationId, STAFF.anna, users.ownerTherapist],
    );
    await asPostgres(
      `insert into public.staff_working_hour_exceptions
         (organization_id, staff_member_id, on_date, kind, starts_at, ends_at, working_time_request_id)
       values ($1, $2, '2019-06-04', 'block', '07:00', '12:00', $3),
              ($1, $2, '2019-06-05', 'block', '07:00', '12:00', null)`,
      [organizationId, STAFF.anna, rows[0]!.id],
    );
    await asPostgres('select public.apply_retention()');
    const { rows: tage } = await asPostgres<{ on_date: string }>(
      `select to_char(on_date, 'YYYY-MM-DD') as on_date from public.staff_working_hour_exceptions
        where staff_member_id = $1 and on_date < '2020-01-01'`,
      [STAFF.anna],
    );
    // Die von Hand eingetragene bleibt, die aus dem Antrag fällt mit.
    expect(tage.map((t) => t.on_date)).toEqual(['2019-06-05']);
  });

  it('löscht nach einer Wiederherstellung erneut (ADR-012)', async () => {
    const { rows } = await asPostgres<{ id: string; zeile: unknown }>(
      `insert into public.staff_working_time_requests
         (organization_id, staff_member_id, kind, on_date, blocks, previous_blocks,
          previous_minutes, new_minutes, status, requested_by, requested_at, decided_by, decided_at)
       values ($1, $2, 'once', '2019-06-04', '[]', '[]', 0, 0, 'approved', $3, '2019-05-01', $3, '2019-05-02')
       returning id, to_jsonb(staff_working_time_requests.*) as zeile`,
      [organizationId, STAFF.anna, users.ownerTherapist],
    );
    await asPostgres('select public.apply_retention()');
    const zaehle = async () =>
      (
        await asPostgres<{ n: number }>(
          'select count(*)::int as n from public.staff_working_time_requests where id = $1',
          [rows[0]!.id],
        )
      ).rows[0]!.n;
    expect(await zaehle()).toBe(0);
    await asPostgres(
      `insert into public.staff_working_time_requests
       select * from jsonb_populate_record(null::public.staff_working_time_requests, $1::jsonb)`,
      [JSON.stringify(rows[0]!.zeile)],
    );
    expect(await zaehle()).toBe(1);
    await asPostgres('select public.reapply_deletion_journal()');
    expect(await zaehle()).toBe(0);
  });
});

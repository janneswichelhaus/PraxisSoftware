import { beforeEach, describe, expect, it } from 'vitest';
import { feiertage, ostersonntag } from '@/features/vacation/feiertage';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Urlaub mit der gemeinsamen Antragsmechanik (URL-001, Überholung 7).
 *
 * Geprüft werden Zustände und Rechte (ANN-576), das Zählen der Tage mit den
 * Feiertagen (ANN-577, dieselben wie `src/features/vacation/feiertage.ts`),
 * die Wirkung auf die Arbeitszeiten (ANN-578), die Sichtbarkeit nach BEF-066
 * (ANN-580),
 * die Negativfälle aus ADR-013 Punkt 9 Nr. 1 (andere Organisation, Rolle ohne
 * Recht, Patientenkonto, Plattformkonto, fremde Person, ohne Sitzung) und der
 * Löschlauf mit Journal (ANN-579, ADR-013 Nr. 4). Kein Auditeintrag (ADR-010
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

const VORSCHAU = 'select public.preview_leave($1::date, $2::date) as daten';
const BEANTRAGEN = 'select public.request_leave($1::date, $2::date, $3) as id';
const ZURUECKZIEHEN = 'select public.withdraw_leave_request($1::uuid)';
const STORNIEREN = 'select public.request_leave_cancellation($1::uuid, $2) as id';
const ENTSCHEIDEN = 'select public.decide_leave_request($1::uuid, $2::boolean, $3) as daten';
const ANSPRUCH = 'select public.set_leave_entitlement($1::uuid, $2::int, $3::int, $4::int)';
const LISTE = 'select public.list_leave($1::date, $2::date) as daten';

function plusTage(tag: string, tage: number): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Die Woche um Christi Himmelfahrt im nächsten Jahr: Montag bis Freitag, der Donnerstag ist frei. */
const JAHR = new Date().getUTCFullYear() + 1;
const HIMMELFAHRT = plusTage(ostersonntag(JAHR), 39);
const MONTAG = plusTage(HIMMELFAHRT, -3);
const FREITAG = plusTage(HIMMELFAHRT, 1);

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
  von = MONTAG,
  bis = FREITAG,
  nachricht: string | null = null,
) {
  const { rows } = await asUserCommitted<{ id: string }>(konto, BEANTRAGEN, [von, bis, nachricht]);
  return rows[0]!.id;
}

async function antrag(id: string) {
  const { rows } = await asPostgres<{
    status: string;
    days: number;
    decided_by: string | null;
    self_entered: boolean;
    message: string | null;
  }>(
    'select status, days, decided_by, self_entered, message from public.staff_leave_requests where id = $1',
    [id],
  );
  return rows[0]!;
}

async function abwesenheiten(staff: string) {
  const { rows } = await asPostgres<{ on_date: string; leave_request_id: string | null }>(
    `select to_char(on_date, 'YYYY-MM-DD') as on_date, leave_request_id
       from public.staff_working_hour_exceptions
      where staff_member_id = $1 and on_date between $2 and $3 order by on_date`,
    [staff, MONTAG, FREITAG],
  );
  return rows;
}

interface Liste {
  my_staff_member_id: string | null;
  can_decide: boolean;
  balance: { entitlement: number | null; approved: number; requested: number; rest: number | null };
  own: { id: string; status: string; message: string | null }[];
  to_decide: { id: string; balance: Record<string, unknown>; appointments: number }[];
  team: Record<string, unknown>[];
  balances: { staff_member_id: string }[];
}

beforeEach(resetDatabase);

describe('Feiertage und Urlaubstage (ANN-577)', () => {
  it('rechnet Ostern und die Feiertage wie die Oberfläche', async () => {
    for (const jahr of [2026, 2027, JAHR]) {
      const { rows } = await asPostgres<{ ostern: string }>(
        `select to_char(app.easter_sunday($1), 'YYYY-MM-DD') as ostern`,
        [jahr],
      );
      expect(rows[0]!.ostern).toBe(ostersonntag(jahr));
      for (const land of ['BW', 'NW'] as const) {
        const { rows: tage } = await asPostgres<{ tag: string }>(
          `select to_char(d, 'YYYY-MM-DD') as tag
             from generate_series(make_date($1, 1, 1), make_date($1, 12, 31), interval '1 day') d
            where app.is_public_holiday(d::date, $2) order by d`,
          [jahr, land],
        );
        expect(tage.map((t) => t.tag)).toEqual(feiertage(jahr, land).map((f) => f.tag));
      }
    }
  });

  it('zählt Arbeitstage nach Wochenplan ohne Feiertag; ohne Plan Montag bis Freitag', async () => {
    const vorschau = await daten<{ days: number; balance: { year: number } }>(
      users.therapist,
      VORSCHAU,
      [MONTAG, plusTage(FREITAG, 2)],
    );
    // Mo, Di, Mi, Fr - Donnerstag ist Himmelfahrt, das Wochenende frei.
    expect(vorschau.days).toBe(4);
    expect(vorschau.balance.year).toBe(JAHR);
    // Olivia hat keinen Wochenplan: Montag bis Freitag.
    const buero = await daten<{ days: number }>(users.office, VORSCHAU, [MONTAG, FREITAG]);
    expect(buero.days).toBe(4);
    // Ein Wochenplan nur montags zählt nur den Montag.
    await asPostgres(
      `delete from public.staff_working_hours where staff_member_id = $1 and weekday > 1`,
      [STAFF.anna],
    );
    const montags = await daten<{ days: number }>(users.therapist, VORSCHAU, [MONTAG, FREITAG]);
    expect(montags.days).toBe(1);
    // Tom arbeitet montags bis samstags: der Samstag zählt mit.
    const training = await daten<{ days: number }>(users.trainer, VORSCHAU, [
      MONTAG,
      plusTage(FREITAG, 2),
    ]);
    expect(training.days).toBe(5);
  });

  it('teilt einen Urlaub über den Jahreswechsel auf beide Jahre', async () => {
    const vorschau = await daten<{ days: number; days_following_year: number }>(
      users.therapist,
      VORSCHAU,
      [`${JAHR}-12-28`, `${JAHR + 1}-01-08`],
    );
    // Folgejahr: 1.1. Feiertag, 6.1. Feiertag in BW; die Wochentage dazwischen zählen.
    const folgejahr = await asPostgres<{ n: number }>(
      `select count(*)::int as n from generate_series(make_date($1, 1, 1), make_date($1, 1, 8), interval '1 day') d
        where extract(isodow from d) <= 5 and not app.is_public_holiday(d::date, 'BW')`,
      [JAHR + 1],
    );
    expect(vorschau.days_following_year).toBe(folgejahr.rows[0]!.n);
    expect(vorschau.days).toBeGreaterThan(vorschau.days_following_year);
  });
});

describe('Beantragen, zurückziehen, entscheiden (ANN-576)', () => {
  it('beantragt mit am Server gezählten Tagen und lehnt eine Überschneidung ab', async () => {
    const id = await beantragt(users.therapist, MONTAG, FREITAG, 'Familienfeier');
    expect(await antrag(id)).toMatchObject({ status: 'requested', days: 4, decided_by: null });
    expect((await fehler(users.therapist, BEANTRAGEN, [FREITAG, FREITAG, null]))?.code).toBe(
      '23P01',
    );
    // Nicht in der Vergangenheit, nicht rückwärts, nicht ohne Arbeitstag.
    const gestern = plusTage(new Date().toISOString().slice(0, 10), -2);
    expect((await fehler(users.therapist, BEANTRAGEN, [gestern, gestern, null]))?.code).toBe(
      '22023',
    );
    expect((await fehler(users.therapist, BEANTRAGEN, [FREITAG, MONTAG, null]))?.code).toBe(
      '22023',
    );
    expect(
      (await fehler(users.office, BEANTRAGEN, [HIMMELFAHRT, HIMMELFAHRT, null]))?.message,
    ).toMatch(/no working days/);
  });

  it('lässt nur die Person ihren offenen Antrag zurückziehen', async () => {
    const id = await beantragt(users.therapist);
    expect((await fehler(users.office, ZURUECKZIEHEN, [id]))?.code).toBe('P0002');
    // Und stornieren lässt sich nur der eigene genehmigte Urlaub.
    const genehmigt = await beantragt(users.therapist, plusTage(FREITAG, 3), plusTage(FREITAG, 3));
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [genehmigt, true, null]);
    for (const konto of [users.office, users.teamLead]) {
      expect((await fehler(konto, STORNIEREN, [genehmigt, null]))?.code, konto).toBe('P0002');
    }
    await asUserCommitted(users.therapist, ZURUECKZIEHEN, [id]);
    expect((await antrag(id)).status).toBe('withdrawn');
    expect((await fehler(users.therapist, ZURUECKZIEHEN, [id]))?.code).toBe('P0002');
  });

  it('genehmigt und sperrt die Tage in den Arbeitszeiten - ohne Auditeintrag', async () => {
    const id = await beantragt(users.therapist);
    const { rows: vorher } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.audit_log',
    );
    const { rows } = await asUserCommitted<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      ENTSCHEIDEN,
      [id, true, null],
    );
    expect(rows[0]!.daten).toEqual({ status: 'approved', appointments: 0, appointment_days: [] });
    expect((await antrag(id)).status).toBe('approved');
    // Jeder Tag des Zeitraums, auch der Feiertag (abwesend ist abwesend).
    const tage = await abwesenheiten(STAFF.anna);
    expect(tage.map((t) => t.on_date)).toEqual([0, 1, 2, 3, 4].map((n) => plusTage(MONTAG, n)));
    expect(tage.every((t) => t.leave_request_id === id)).toBe(true);
    const { rows: nachher } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.audit_log',
    );
    expect(nachher[0]!.n).toBe(vorher[0]!.n);
  });

  it('lehnt nur mit Grund ab und zeigt ihn der Person', async () => {
    const id = await beantragt(users.therapist);
    expect((await fehler(users.ownerTherapist, ENTSCHEIDEN, [id, false, '  ']))?.message).toMatch(
      /needs a reason/,
    );
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, false, 'Zu viele zugleich weg']);
    const liste = await daten<Liste>(users.therapist, LISTE, [MONTAG, FREITAG]);
    expect(liste.own[0]).toMatchObject({
      id,
      status: 'rejected',
      decision_note: 'Zu viele zugleich weg',
    });
    expect(await abwesenheiten(STAFF.anna)).toEqual([]);
  });

  it('entscheidet nie über den eigenen Antrag; owner trägt den eigenen ein', async () => {
    const tim = await beantragt(users.teamLead);
    // Die Teamleitung entscheidet nicht - auch nicht den eigenen (BEF-066 Option 2).
    expect((await fehler(users.teamLead, ENTSCHEIDEN, [tim, true, null]))?.code).toBe('42501');
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [tim, true, null]);
    expect((await antrag(tim)).status).toBe('approved');

    // Ein offener Antrag von owner - etwa aus der Zeit vor der Rolle - bleibt
    // für owner selbst gesperrt.
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by)
       values ($1, $2, $3, $3, 1, 'requested', $4) returning id`,
      [organizationId, STAFF.jannes, plusTage(FREITAG, 21), users.ownerTherapist],
    );
    expect(
      (await fehler(users.ownerTherapist, ENTSCHEIDEN, [rows[0]!.id, true, null]))?.message,
    ).toMatch(/own request/);

    const eigener = await beantragt(users.ownerTherapist);
    expect(await antrag(eigener)).toMatchObject({
      status: 'approved',
      self_entered: true,
      decided_by: users.ownerTherapist,
    });
    expect((await abwesenheiten(STAFF.jannes)).length).toBe(5);
  });

  it('storniert genehmigten Urlaub über einen neuen Antrag und gibt die Tage frei', async () => {
    const id = await beantragt(users.therapist);
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
    // Eine von Hand eingetragene Abwesenheit am Folgetag bleibt stehen.
    await asPostgres(
      `insert into public.staff_working_hour_exceptions (organization_id, staff_member_id, on_date, kind)
       values ($1, $2, $3, 'unavailable')`,
      [organizationId, STAFF.anna, plusTage(FREITAG, 3)],
    );
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, STORNIEREN, [
      id,
      'Reise fällt aus',
    ]);
    const storno = rows[0]!.id;
    expect((await antrag(id)).status).toBe('approved');
    expect((await fehler(users.therapist, STORNIEREN, [id, null]))?.code).toBe('55000');
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [storno, true, null]);
    expect((await antrag(id)).status).toBe('cancelled');
    expect((await antrag(storno)).status).toBe('approved');
    expect(await abwesenheiten(STAFF.anna)).toEqual([]);
    const { rows: hand } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.staff_working_hour_exceptions
        where staff_member_id = $1 and on_date = $2`,
      [STAFF.anna, plusTage(FREITAG, 3)],
    );
    expect(hand[0]!.n).toBe(1);
  });

  it('storniert nur, was noch nicht begonnen hat', async () => {
    // Ein laufender Urlaub (seit gestern) gäbe sonst Tage frei, die genommen sind.
    const gestern = plusTage(new Date().toISOString().slice(0, 10), -1);
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by,
          decided_by, decided_at)
       values ($1, $2, $3, ($3::date + 7), 5, 'approved', $4, $5, now()) returning id`,
      [organizationId, STAFF.anna, gestern, users.therapist, users.ownerTherapist],
    );
    expect((await fehler(users.therapist, STORNIEREN, [rows[0]!.id, null]))?.message).toMatch(
      /already started/,
    );
    // Ein Storno, der vor Beginn beantragt und erst danach entschieden wird,
    // lässt sich nur noch ablehnen.
    const { rows: storno } = await asPostgres<{ id: string }>(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, kind, refers_to, starts_on, ends_on, days, status,
          requested_by)
       values ($1, $2, 'cancellation', $3, $4, ($4::date + 7), 5, 'requested', $5) returning id`,
      [organizationId, STAFF.anna, rows[0]!.id, gestern, users.therapist],
    );
    expect(
      (await fehler(users.ownerTherapist, ENTSCHEIDEN, [storno[0]!.id, true, null]))?.code,
    ).toBe('55000');
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [
      storno[0]!.id,
      false,
      'Hat begonnen',
    ]);
    expect((await antrag(rows[0]!.id)).status).toBe('approved');
  });

  it('hält die Genehmigung an, wenn im Zeitraum abweichende Arbeitszeiten stehen', async () => {
    const id = await beantragt(users.therapist);
    await asPostgres(
      `insert into public.staff_working_hour_exceptions
         (organization_id, staff_member_id, on_date, kind, starts_at, ends_at)
       values ($1, $2, $3, 'block', '09:00', '12:00')`,
      [organizationId, STAFF.anna, plusTage(MONTAG, 1)],
    );
    expect((await fehler(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]))?.message).toMatch(
      /working hours exception in period/,
    );
    expect((await antrag(id)).status).toBe('requested');
  });
});

describe('Wirkung auf Arbeitszeiten und Termine (ANN-578)', () => {
  it('sperrt auch die Tage einer Trainingsbetreuung für Trainingstermine', async () => {
    const id = await beantragt(users.trainer);
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
    expect((await abwesenheiten(STAFF.tom)).map((t) => t.leave_request_id)).toEqual(
      Array(5).fill(id),
    );
    const termin = await fehler(
      users.trainer,
      `select public.create_training_appointment($1::uuid, $2::uuid, 'video', $3::date,
         '10:00', '11:00', null, false, null, false)`,
      [SEED.trainingRelationships.tina, STAFF.tom, plusTage(MONTAG, 2)],
    );
    expect(termin?.message).toMatch(/outside_working_hours/);
  });

  it('lässt einen Urlaubstag in den Arbeitszeiten nicht überschreiben, bis storniert ist', async () => {
    const id = await beantragt(users.therapist);
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
    const SETZEN = `select public.set_staff_working_hour_exception($1::uuid, $2::date, $3, $4::jsonb)`;
    for (const [abwesend, bloecke] of [
      [false, '[]'],
      [false, '[{"von":"09:00","bis":"12:00"}]'],
      [true, '[]'],
    ] as const) {
      const f = await fehler(users.office, SETZEN, [
        STAFF.anna,
        plusTage(MONTAG, 1),
        abwesend,
        bloecke,
      ]);
      expect(f?.code).toBe('55000');
      expect(f?.message).toMatch(/approved leave/);
    }
    // Ein Tag außerhalb des Urlaubs bleibt frei pflegbar.
    await asUserCommitted(users.office, SETZEN, [STAFF.anna, plusTage(FREITAG, 3), true, '[]']);
    expect((await abwesenheiten(STAFF.anna)).length).toBe(5);
  });

  it('nennt nach der Genehmigung die Tage mit Terminen, ohne sie abzusagen', async () => {
    const termin = await asPostgres<{ id: string }>(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
         starts_at, ends_at, kind
       ) values ($1, $2, $3, $4, 'practice', 'confirmed',
         ($5::date + time '10:00') at time zone 'Europe/Berlin',
         ($5::date + time '11:00') at time zone 'Europe/Berlin', 'therapy')
       returning id`,
      [organizationId, patients.erika, STAFF.anna, PRAXIS, plusTage(MONTAG, 1)],
    );
    const id = await beantragt(users.therapist);
    const { rows } = await asUserCommitted<{
      daten: {
        appointments: number;
        appointment_days: { on_date: string; appointments: number }[];
      };
    }>(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
    expect(rows[0]!.daten.appointments).toBe(1);
    expect(rows[0]!.daten.appointment_days).toEqual([
      { on_date: plusTage(MONTAG, 1), appointments: 1 },
    ]);
    const { rows: stand } = await asPostgres<{ status: string }>(
      'select status from public.appointments where id = $1',
      [termin.rows[0]!.id],
    );
    expect(stand[0]!.status).toBe('confirmed');
  });

  it('schreibt die Abwesenheit ohne das Konto der entscheidenden Person', async () => {
    const id = await beantragt(users.therapist);
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
    const { rows } = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.staff_working_hour_exceptions
        where leave_request_id = $1 and created_by is not null`,
      [id],
    );
    expect(rows[0]!.n).toBe(0);
  });
});

describe('Sichtbarkeit nach BEF-066 (ANN-580)', () => {
  it('zeigt die Notiz nur der Person, anderen nur Name und Zeitraum genehmigten Urlaubs', async () => {
    const offen = await beantragt(users.therapist, MONTAG, MONTAG, 'Hochzeit der Schwester');
    const tim = await beantragt(users.teamLead, plusTage(MONTAG, 1), plusTage(MONTAG, 2), 'Umzug');
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [tim, true, null]);

    // Wer entscheidet (owner), sieht den offenen Antrag mit Konto und
    // Terminen, aber nie die Notiz („nie den Grund“).
    const inhaber = await daten<Liste>(users.ownerTherapist, LISTE, [MONTAG, FREITAG]);
    expect(inhaber.to_decide.map((a) => a.id)).toEqual([offen]);
    expect(inhaber.to_decide[0]).not.toHaveProperty('message');
    expect(inhaber.to_decide[0]).toMatchObject({ appointments: 0 });
    expect(inhaber.to_decide[0]!.balance).toMatchObject({ requested: 1 });
    expect(JSON.stringify(inhaber)).not.toMatch(/Hochzeit|Umzug/);
    // Die Teamleitung entscheidet nicht und sieht keine offenen Anträge anderer.
    const leitung = await daten<Liste>(users.teamLead, LISTE, [MONTAG, FREITAG]);
    expect(leitung.can_decide).toBe(false);
    expect(leitung.to_decide).toEqual([]);
    expect(JSON.stringify(leitung)).not.toMatch(/Hochzeit/);

    const buero = await daten<Liste>(users.office, LISTE, [MONTAG, FREITAG]);
    expect(buero.can_decide).toBe(false);
    expect(buero.to_decide).toEqual([]);
    // Genehmigter Urlaub anderer: nur Name und Zeitraum, nie die Nachricht.
    expect(buero.team).toEqual([
      {
        staff_member_id: STAFF.tim,
        name: 'Tim Teamleitung',
        starts_on: plusTage(MONTAG, 1),
        ends_on: plusTage(MONTAG, 2),
      },
    ]);
    expect(JSON.stringify(buero)).not.toMatch(/Umzug|Hochzeit/);
    // Fremde Urlaubskonten je Person (ohne Summe) sieht nur owner - weder
    // das Büro noch die Teamleitung außerhalb eines offenen Antrags.
    expect(inhaber.balances.map((b) => b.staff_member_id)).toContain(STAFF.anna);
    expect(buero.balances).toEqual([]);
    expect(leitung.balances).toEqual([]);
    const anna = await daten<Liste>(users.therapist, LISTE, [MONTAG, FREITAG]);
    expect(anna.balances).toEqual([]);
    expect(JSON.stringify(anna.team)).not.toMatch(/Umzug/);
    expect(anna.own.map((a) => a.message)).toEqual(['Hochzeit der Schwester']);
    // Die Vorschau zeigt, wer zugleich fehlt - ebenso nur Name und Zeitraum.
    const vorschau = await daten<{ team: Record<string, unknown>[] }>(users.trainer, VORSCHAU, [
      MONTAG,
      FREITAG,
    ]);
    expect(vorschau.team.map((t) => Object.keys(t).sort())).toEqual([
      ['ends_on', 'name', 'staff_member_id', 'starts_on'],
    ]);
  });

  it('liefert das eigene Konto mit Anspruch, Genehmigtem und Beantragtem getrennt', async () => {
    await asUserCommitted(users.ownerTherapist, ANSPRUCH, [STAFF.anna, JAHR, 30, 2]);
    const genehmigt = await beantragt(users.therapist, MONTAG, MONTAG);
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [genehmigt, true, null]);
    await beantragt(users.therapist, plusTage(MONTAG, 1), plusTage(MONTAG, 2));
    const liste = await daten<Liste>(users.therapist, LISTE, [MONTAG, FREITAG]);
    expect(liste.balance).toMatchObject({ entitlement: 30, approved: 1, requested: 2, rest: 31 });
  });

  it('zeigt Urlaub anderer nur ab heute - kein Verlauf über die Kolleg:innen', async () => {
    const vorJahr = new Date().getUTCFullYear() - 1;
    await asPostgres(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by,
          decided_by, decided_at)
       values ($1, $2, $3, $3, 1, 'approved', $4, $5, now())`,
      [organizationId, STAFF.tim, `${vorJahr}-07-01`, users.teamLead, users.ownerTherapist],
    );
    const fenster = [`${vorJahr}-01-01`, `${vorJahr}-12-31`];
    for (const konto of [users.therapist, users.office, users.teamLead, users.trainer]) {
      expect((await daten<Liste>(konto, LISTE, fenster)).team, konto).toEqual([]);
    }
    // owner pflegt die Konten und sieht auch Vergangenes.
    const inhaber = await daten<Liste>(users.ownerTherapist, LISTE, fenster);
    expect(inhaber.team.map((t) => t.staff_member_id)).toEqual([STAFF.tim]);
  });
});

describe('Negativfälle (ADR-013 Punkt 9 Nr. 1)', () => {
  it('weist Patientenkonto, Plattformkonto und Anonyme überall ab', async () => {
    const id = await beantragt(users.therapist);
    for (const konto of [users.patientMax, users.plattformTina, null]) {
      for (const [sql, params] of [
        [VORSCHAU, [MONTAG, FREITAG]],
        [BEANTRAGEN, [MONTAG, FREITAG, null]],
        [LISTE, [MONTAG, FREITAG]],
        [ZURUECKZIEHEN, [id]],
        [STORNIEREN, [id, null]],
        [ENTSCHEIDEN, [id, true, null]],
        [ANSPRUCH, [STAFF.anna, JAHR, 30, 0]],
      ] as const) {
        expect((await fehler(konto, sql, [...params]))?.code, `${konto} ${sql}`).toBe('42501');
      }
    }
  });

  it('lässt Rollen ohne Recht weder entscheiden noch Ansprüche eintragen', async () => {
    const id = await beantragt(users.therapist);
    for (const konto of [users.teamLead, users.office, users.trainer]) {
      expect((await fehler(konto, ENTSCHEIDEN, [id, true, null]))?.code, konto).toBe('42501');
    }
    for (const konto of [users.therapist, users.office, users.teamLead, users.trainer]) {
      expect((await fehler(konto, ANSPRUCH, [STAFF.anna, JAHR, 30, 0]))?.code, konto).toBe('42501');
    }
  });

  it('zeigt der fremden Organisation nichts und lässt sie nichts entscheiden (ADR-003)', async () => {
    const id = await beantragt(users.therapist, MONTAG, FREITAG, 'Privat');
    const genehmigt = await beantragt(users.teamLead, plusTage(FREITAG, 3), plusTage(FREITAG, 3));
    await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [genehmigt, true, null]);
    const fremd = await fremdeOrganisation();
    expect((await fehler(fremd.owner, ENTSCHEIDEN, [id, true, null]))?.code).toBe('P0002');
    expect((await fehler(fremd.owner, ZURUECKZIEHEN, [id]))?.code).toBe('P0002');
    expect((await fehler(fremd.owner, STORNIEREN, [genehmigt, null]))?.code).toBe('P0002');
    // Die Vorschau der fremden Praxis kennt unseren Urlaub nicht.
    const vorschau = await daten<{ team: unknown[] }>(fremd.owner, VORSCHAU, [
      MONTAG,
      plusTage(FREITAG, 3),
    ]);
    expect(vorschau.team).toEqual([]);
    const liste = await daten<Liste>(fremd.owner, LISTE, [MONTAG, FREITAG]);
    expect(liste.to_decide).toEqual([]);
    expect(liste.team).toEqual([]);
    expect(JSON.stringify(liste)).not.toMatch(/Privat|Anna/);
    // Kein Anspruch für eine fremde Mitarbeiterin, keiner der fremden für unsere.
    expect(
      (await fehler(users.ownerTherapist, ANSPRUCH, [fremd.staffMember, JAHR, 30, 0]))?.code,
    ).toBe('P0002');
    expect((await fehler(fremd.owner, ANSPRUCH, [STAFF.anna, JAHR, 30, 0]))?.code).toBe('P0002');
  });

  it('gibt keiner Rolle Tabellenrecht - nur die Funktionen (ADR-004)', async () => {
    for (const tabelle of ['staff_leave_requests', 'staff_leave_entitlements']) {
      const { rows } = await asPostgres<{ recht: boolean }>(
        `select has_table_privilege('authenticated', $1, 'select')
             or has_table_privilege('authenticated', $1, 'insert') as recht`,
        [`public.${tabelle}`],
      );
      expect(rows[0]!.recht, tabelle).toBe(false);
    }
  });
});

describe('Löschlauf (ANN-579, ADR-013 Nr. 4)', () => {
  it('löscht fällige Anträge und Ansprüche mit Journal, offene nie', async () => {
    const alt = '2019-06-03';
    await asPostgres(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by,
          requested_at, decided_by, decided_at)
       values
         ($1, $2, $3, $3, 1, 'approved', $4, '2019-05-01', $4, '2019-05-02'),
         ($1, $2, $3, $3, 1, 'requested', $4, '2019-05-01', null, null)`,
      [organizationId, STAFF.anna, alt, users.ownerTherapist],
    );
    // Ein alter genehmigter Urlaub mit offenem Storno bleibt, bis entschieden ist.
    const { rows: gehalten } = await asPostgres<{ id: string }>(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by,
          requested_at, decided_by, decided_at)
       values ($1, $2, '2019-07-01', '2019-07-01', 1, 'approved', $3, '2019-05-01', $3, '2019-05-02')
       returning id`,
      [organizationId, STAFF.tim, users.ownerTherapist],
    );
    await asPostgres(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, kind, refers_to, starts_on, ends_on, days, status,
          requested_by, requested_at)
       values ($1, $2, 'cancellation', $3, '2019-07-01', '2019-07-01', 1, 'requested', $4, '2019-06-01')`,
      [organizationId, STAFF.tim, gehalten[0]!.id, users.teamLead],
    );
    await asPostgres(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by,
          requested_at, withdrawn_at)
       values ($1, $2, $3, $3, 1, 'withdrawn', $4, now() - interval '400 days', now() - interval '399 days'),
              ($1, $2, $3, $3, 1, 'withdrawn', $4, now() - interval '10 days', now() - interval '9 days')`,
      [organizationId, STAFF.anna, plusTage(MONTAG, 30), users.ownerTherapist],
    );
    await asPostgres(
      `insert into public.staff_leave_entitlements (organization_id, staff_member_id, year, days, updated_by)
       values ($1, $2, 2019, 30, $3), ($1, $2, $4, 30, $3)`,
      [organizationId, STAFF.anna, users.ownerTherapist, JAHR],
    );

    await asPostgres('select public.apply_retention()');

    const { rows: bleibt } = await asPostgres<{ status: string }>(
      `select status from public.staff_leave_requests where staff_member_id = $1 order by requested_at`,
      [STAFF.anna],
    );
    // Der offene von 2019 bleibt, der vor neun Tagen zurückgezogene auch.
    expect(bleibt.map((r) => r.status).sort()).toEqual(['requested', 'withdrawn']);
    const { rows: tim } = await asPostgres<{ kind: string; status: string }>(
      `select kind, status from public.staff_leave_requests where staff_member_id = $1 order by kind`,
      [STAFF.tim],
    );
    expect(tim).toEqual([
      { kind: 'cancellation', status: 'requested' },
      { kind: 'leave', status: 'approved' },
    ]);
    const { rows: ansprueche } = await asPostgres<{ year: number }>(
      `select year from public.staff_leave_entitlements where staff_member_id = $1`,
      [STAFF.anna],
    );
    expect(ansprueche.map((a) => a.year)).toEqual([JAHR]);
    const { rows: journal } = await asPostgres<{ target_table: string; retention_class: string }>(
      `select target_table, retention_class from public.deletion_journal
        where target_table in ('staff_leave_requests', 'staff_leave_entitlements')
        order by target_table, retention_class`,
    );
    expect(journal).toEqual([
      { target_table: 'staff_leave_entitlements', retention_class: 'urlaub' },
      { target_table: 'staff_leave_requests', retention_class: 'urlaub' },
      { target_table: 'staff_leave_requests', retention_class: 'urlaub_kurz' },
    ]);
  });

  it('nimmt Storno und Abwesenheiten eines fälligen Urlaubs mit (cascade)', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by,
          requested_at, decided_by, decided_at)
       values ($1, $2, '2019-06-03', '2019-06-04', 2, 'cancelled', $3, '2019-05-01', $4, '2019-05-02')
       returning id`,
      [organizationId, STAFF.anna, users.therapist, users.ownerTherapist],
    );
    const urlaub = rows[0]!.id;
    await asPostgres(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, kind, refers_to, starts_on, ends_on, days, status,
          requested_by, requested_at, decided_by, decided_at)
       values ($1, $2, 'cancellation', $3, '2019-06-03', '2019-06-04', 2, 'approved', $4,
               '2019-05-10', $5, '2019-05-11')`,
      [organizationId, STAFF.anna, urlaub, users.therapist, users.ownerTherapist],
    );
    await asPostgres(
      `insert into public.staff_working_hour_exceptions
         (organization_id, staff_member_id, on_date, kind, leave_request_id)
       values ($1, $2, '2019-06-03', 'unavailable', $3), ($1, $2, '2019-06-05', 'unavailable', null)`,
      [organizationId, STAFF.anna, urlaub],
    );

    await asPostgres('select public.apply_retention()');

    const { rows: rest } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.staff_leave_requests where staff_member_id = $1',
      [STAFF.anna],
    );
    expect(rest[0]!.n).toBe(0);
    const { rows: tage } = await asPostgres<{ on_date: string }>(
      `select to_char(on_date, 'YYYY-MM-DD') as on_date from public.staff_working_hour_exceptions
        where staff_member_id = $1 and on_date < '2020-01-01'`,
      [STAFF.anna],
    );
    // Die von Hand eingetragene Abwesenheit bleibt, die aus dem Urlaub fällt mit.
    expect(tage.map((t) => t.on_date)).toEqual(['2019-06-05']);
  });

  it('löscht nach einer Wiederherstellung erneut (ADR-012)', async () => {
    const { rows } = await asPostgres<{ id: string; zeile: unknown }>(
      `insert into public.staff_leave_requests
         (organization_id, staff_member_id, starts_on, ends_on, days, status, requested_by,
          requested_at, decided_by, decided_at)
       values ($1, $2, '2019-06-03', '2019-06-03', 1, 'approved', $3, '2019-05-01', $3, '2019-05-02')
       returning id, to_jsonb(staff_leave_requests.*) as zeile`,
      [organizationId, STAFF.anna, users.ownerTherapist],
    );
    await asPostgres('select public.apply_retention()');
    const zaehle = async () =>
      (
        await asPostgres<{ n: number }>(
          'select count(*)::int as n from public.staff_leave_requests where id = $1',
          [rows[0]!.id],
        )
      ).rows[0]!.n;
    expect(await zaehle()).toBe(0);

    // Ein Restore bringt die Zeile zurück; das Journal zieht nach.
    await asPostgres(
      `insert into public.staff_leave_requests
       select * from jsonb_populate_record(null::public.staff_leave_requests, $1::jsonb)`,
      [JSON.stringify(rows[0]!.zeile)],
    );
    expect(await zaehle()).toBe(1);
    await asPostgres('select public.reapply_deletion_journal()');
    expect(await zaehle()).toBe(0);
  });
});

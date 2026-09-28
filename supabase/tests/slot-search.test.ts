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
 * Terminsuche als Vorschlagsliste (PRX-003, ANN-136).
 *
 * Die Suche schlägt vor, sie reserviert nichts. Geprüft werden Arbeitszeit,
 * Abweichungen, Belegung der Therapeut:in UND der Patient:in, Raster, Dauer,
 * Wunschzeiten, Gebietstag zuerst, Grenzen der Eingabe, Rollen und die
 * Fahrzeitbewertung mit der Rundungsregel aus §8.1.
 */

const { users, patients, organizationId, trainingRelationships } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';
const JANNES = '55555555-5555-4555-8555-000000000001';
const TIM = '55555555-5555-4555-8555-000000000004';

/** Ein Wochentag (ISO 1-7) mindestens acht Tage in der Zukunft, `YYYY-MM-DD`. */
function naechster(isoWochentag: number, abTagen = 8): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + abTagen);
  while (((d.getUTCDay() + 6) % 7) + 1 !== isoWochentag) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const MONTAG = naechster(1);
const DIENSTAG = naechster(2, 9);

const SUCHE = `select staff_member_id, staff_name, slot_date::text as slot_date,
                      to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time,
                      territory_status, prev_appointment_id, next_appointment_id
                 from public.find_free_slots($1::uuid, $2::uuid, $3, $4::int, $5::date, $6::date, $7::jsonb, $8::int)`;
const BEWERTEN = `select item_index, status, shortfall_minutes from public.rate_slot_travel($1::jsonb) order by item_index`;

interface Vorschlag {
  staff_member_id: string;
  staff_name: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  territory_status: string;
  prev_appointment_id: string | null;
  next_appointment_id: string | null;
}

async function suchen(
  over: Partial<{
    konto: string;
    patient: string;
    staff: string | null;
    typ: string;
    dauer: number;
    von: string;
    bis: string;
    fenster: unknown;
    limit: number;
  }> = {},
) {
  const p = {
    konto: users.office,
    patient: patients.max,
    staff: ANNA,
    typ: 'home_visit',
    dauer: 60,
    von: MONTAG,
    bis: MONTAG,
    fenster: [],
    limit: 20,
    ...over,
  };
  const { rows } = await asUser<Vorschlag>(p.konto, SUCHE, [
    p.patient,
    p.staff,
    p.typ,
    p.dauer,
    p.von,
    p.bis,
    JSON.stringify(p.fenster),
    p.limit,
  ]);
  return rows;
}

async function termin(
  staff: string,
  patient: string | null,
  tag: string,
  von: string,
  bis: string,
) {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments
       (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at,
        visit_street, visit_house_number, visit_postal_code, visit_city)
     values ($1::uuid, $2::uuid, $3::uuid, 'home_visit', 'confirmed',
             ($4::date + $5::time) at time zone 'Europe/Berlin',
             ($4::date + $6::time) at time zone 'Europe/Berlin',
             'Teststrasse', '1', '72070', 'Tuebingen')
     returning id`,
    [organizationId, patient, staff, tag, von, bis],
  );
  return rows[0]!.id;
}

async function fehler(konto: string, sql: string, params: unknown[]) {
  try {
    await asUser(konto, sql, params);
    return null;
  } catch (f) {
    return f as { code?: string; message: string };
  }
}

const zeiten = (rows: Vorschlag[]) =>
  rows.map((r) => `${r.slot_date} ${r.start_time}-${r.end_time}`);

describe('Terminsuche (PRX-003)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('schlaegt dicht gepackte Plaetze in der Arbeitszeit vor', async () => {
    const rows = await suchen();
    expect(zeiten(rows)).toEqual([
      `${MONTAG} 08:00-09:00`,
      `${MONTAG} 09:00-10:00`,
      `${MONTAG} 10:00-11:00`,
      `${MONTAG} 11:00-12:00`,
      `${MONTAG} 13:00-14:00`,
      `${MONTAG} 14:00-15:00`,
      `${MONTAG} 15:00-16:00`,
      `${MONTAG} 16:00-17:00`,
      `${MONTAG} 17:00-18:00`,
    ]);
    expect(rows[0]!.staff_name).toBe('Anna Beispiel');
  });

  it('laesst belegte Zeiten der Therapeut:in UND der Patient:in aus, abgesagte nicht', async () => {
    await termin(ANNA, patients.erika, MONTAG, '09:00', '10:00');
    // Max hat um 10:00 schon einen Termin bei Jannes - ihn kann Anna dann nicht sehen.
    await termin(JANNES, patients.max, MONTAG, '10:00', '10:30');
    const abgesagt = await termin(ANNA, patients.petra, MONTAG, '13:00', '14:00');
    await asPostgres(
      `update public.appointments
          set status = 'cancelled', cancelled_at = now(), cancelled_by = $2::uuid
        where id = $1`,
      [abgesagt, users.office],
    );

    const rows = await suchen({ fenster: [{ weekday: 1, from: '08:00', to: '14:00' }] });
    expect(zeiten(rows)).toEqual([
      `${MONTAG} 08:00-09:00`,
      `${MONTAG} 10:30-11:30`,
      `${MONTAG} 13:00-14:00`,
    ]);
  });

  it('haelt sich an die Wunschzeiten und die Dauer', async () => {
    const rows = await suchen({
      dauer: 45,
      fenster: [{ weekday: 1, from: '14:00', to: '16:00' }],
    });
    expect(zeiten(rows)).toEqual([`${MONTAG} 14:00-14:45`, `${MONTAG} 14:45-15:30`]);
    // Ein Wunschfenster an einem anderen Tag ergibt nichts.
    expect(await suchen({ fenster: [{ weekday: 2, from: '08:00', to: '12:00' }] })).toEqual([]);
  });

  it('ersetzt den Wochenplan durch eine Abweichung und kennt Abwesenheit', async () => {
    await asPostgres(
      `insert into public.staff_working_hour_exceptions
         (organization_id, staff_member_id, on_date, kind, starts_at, ends_at)
       values ($1::uuid, $2::uuid, $3::date, 'block', '15:00', '17:00')`,
      [organizationId, ANNA, MONTAG],
    );
    expect(zeiten(await suchen())).toEqual([`${MONTAG} 15:00-16:00`, `${MONTAG} 16:00-17:00`]);

    await asPostgres(
      `insert into public.staff_working_hour_exceptions
         (organization_id, staff_member_id, on_date, kind)
       values ($1::uuid, $2::uuid, $3::date, 'unavailable')`,
      [organizationId, ANNA, DIENSTAG],
    );
    expect(await suchen({ von: DIENSTAG, bis: DIENSTAG })).toEqual([]);
  });

  it('sucht ohne Vorgabe bei allen zuordenbaren Therapeut:innen, nie bei Office', async () => {
    const rows = await suchen({
      staff: null,
      fenster: [{ weekday: 1, from: '08:00', to: '09:00' }],
    });
    expect(rows.map((r) => r.staff_name).sort()).toEqual([
      'Anna Beispiel',
      'Jannes Test',
      'Tim Teamleitung',
    ]);
  });

  it('stellt Vorschlaege im Gebietstag nach vorn und kennzeichnet die uebrigen (PRX-002)', async () => {
    await asUserCommitted(
      users.office,
      `select public.save_territory(null, null, 'Nord', array['72070'], $1::jsonb)`,
      [JSON.stringify([{ weekday: 2, part: 'am' }])],
    );
    const rows = await suchen({ von: MONTAG, bis: DIENSTAG, limit: 3 });
    expect(zeiten(rows)).toEqual([
      `${DIENSTAG} 08:00-09:00`,
      `${DIENSTAG} 09:00-10:00`,
      `${DIENSTAG} 10:00-11:00`,
    ]);
    expect(rows.every((r) => r.territory_status === 'match')).toBe(true);

    const alle = await suchen({ von: MONTAG, bis: DIENSTAG, limit: 50 });
    expect(alle.at(-1)).toMatchObject({ slot_date: DIENSTAG, territory_status: 'outside' });
    // In der Praxis gibt es keinen Gebietstag.
    expect((await suchen({ typ: 'practice' })).every((r) => r.territory_status === 'none')).toBe(
      true,
    );
  });

  it('nennt beim Hausbesuch die Nachbartermine derselben Person', async () => {
    const vor = await termin(ANNA, patients.erika, MONTAG, '08:00', '09:00');
    const nach = await termin(ANNA, patients.petra, MONTAG, '11:00', '12:00');
    const rows = await suchen({ fenster: [{ weekday: 1, from: '09:00', to: '11:00' }] });
    expect(rows).toEqual([
      expect.objectContaining({
        start_time: '09:00',
        prev_appointment_id: vor,
        next_appointment_id: nach,
      }),
      expect.objectContaining({
        start_time: '10:00',
        prev_appointment_id: vor,
        next_appointment_id: nach,
      }),
    ]);
    const praxis = await suchen({
      typ: 'practice',
      fenster: [{ weekday: 1, from: '09:00', to: '10:00' }],
    });
    expect(praxis[0]).toMatchObject({ prev_appointment_id: null, next_appointment_id: null });
  });

  it('nennt keinen Trainingstermin als Nachbarn, zählt ihn aber als belegt (Zweitreview 1)', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments
         (organization_id, training_relationship_id, staff_member_id, appointment_type, kind, status,
          starts_at, ends_at, visit_street, visit_house_number, visit_postal_code, visit_city)
       values ($1::uuid, $2::uuid, $3::uuid, 'home_visit', 'training', 'confirmed',
               ($4::date + time '08:00') at time zone 'Europe/Berlin',
               ($4::date + time '09:00') at time zone 'Europe/Berlin',
               'Beispielstrasse', '1', '72070', 'Tuebingen')
       returning id`,
      [organizationId, trainingRelationships.tina, ANNA, MONTAG],
    );
    const training = rows[0]!.id;
    // Therapeut:innen lesen keine Trainingstermine; office darf es (LEI-003).
    const vorschlaege = await suchen({
      konto: users.therapist,
      fenster: [{ weekday: 1, from: '08:00', to: '10:00' }],
    });
    // 08:00 ist belegt; 09:00 bekommt keinen Nachbarn aus dem Training.
    expect(zeiten(vorschlaege)).toEqual([`${MONTAG} 09:00-10:00`]);
    expect(vorschlaege[0]!.prev_appointment_id).toBeNull();
    expect(JSON.stringify(vorschlaege)).not.toContain(training);

    const { rows: bewertung } = await asUser<{ status: string }>(users.therapist, BEWERTEN, [
      JSON.stringify([
        {
          index: 0,
          staff_member_id: ANNA,
          date: MONTAG,
          start: '09:00',
          end: '10:00',
          prev_appointment_id: training,
          travel_to_seconds: 3600,
        },
      ]),
    ]);
    expect(bewertung).toEqual([
      expect.objectContaining({ status: 'unknown', shortfall_minutes: 0 }),
    ]);
  });

  it('weist eine Therapeut:in einer fremden Praxis ab', async () => {
    const fremd = await fremdeOrganisation();
    expect(
      (
        await fehler(users.office, SUCHE, [
          patients.max,
          fremd.staffMember,
          'home_visit',
          60,
          MONTAG,
          MONTAG,
          '[]',
          20,
        ])
      )?.code,
    ).toBe('P0002');
  });

  it('begrenzt Zeitraum, Menge und Dauer', async () => {
    const weit = new Date(`${MONTAG}T00:00:00Z`);
    weit.setUTCDate(weit.getUTCDate() + 42);
    const params = (over: Record<string, unknown>) => {
      const p = { dauer: 60, von: MONTAG, bis: MONTAG, limit: 20, ...over };
      return [patients.max, ANNA, 'home_visit', p.dauer, p.von, p.bis, '[]', p.limit];
    };
    expect(
      (await fehler(users.office, SUCHE, params({ bis: weit.toISOString().slice(0, 10) })))?.code,
    ).toBe('22023');
    expect((await fehler(users.office, SUCHE, params({ limit: 51 })))?.code).toBe('22023');
    expect((await fehler(users.office, SUCHE, params({ dauer: 62 })))?.code).toBe('22023');
    expect(
      (await fehler(users.office, SUCHE, params({ bis: '2020-01-01', von: '2020-01-01' })))?.code,
    ).toBe('22023');
  });

  it('gibt der Trainingsbetreuung nichts und haelt die Mandantengrenze', async () => {
    expect(await suchen({ konto: users.trainer })).toEqual([]);
    const fremd = await fremdeOrganisation();
    expect(
      (
        await fehler(fremd.owner, SUCHE, [
          patients.max,
          null,
          'home_visit',
          60,
          MONTAG,
          MONTAG,
          '[]',
          20,
        ])
      )?.code,
    ).toBe('P0002');
  });

  it('reserviert nichts und schreibt nichts', async () => {
    const vorher = await asPostgres<{ n: string }>('select count(*) as n from public.appointments');
    await suchen();
    const nachher = await asPostgres<{ n: string }>(
      'select count(*) as n from public.appointments',
    );
    expect(nachher.rows[0]!.n).toBe(vorher.rows[0]!.n);
  });
});

describe('Fahrzeit der Vorschlaege (ANN-136)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('rundet mit §8.1 und nennt die fehlenden Minuten', async () => {
    const vor = await termin(ANNA, patients.erika, MONTAG, '08:00', '09:00');
    const nach = await termin(ANNA, patients.petra, MONTAG, '11:00', '12:00');
    const basis = { staff_member_id: ANNA, date: MONTAG, start: '09:00', end: '10:00' };
    const { rows } = await asUser<{
      item_index: number;
      status: string;
      shortfall_minutes: number;
    }>(users.office, BEWERTEN, [
      JSON.stringify([
        // 10 Minuten Fahrt, Ende 09:00: frühestens 09:10 - zu knapp.
        { index: 0, ...basis, prev_appointment_id: vor, travel_to_seconds: 600 },
        // Ohne Fahrt passt es genau.
        { index: 1, ...basis, prev_appointment_id: vor, travel_to_seconds: 0 },
        // Fahrzeit fehlt: unbekannt, nie „passt".
        { index: 2, ...basis, prev_appointment_id: vor, travel_to_seconds: null },
        // Zum Nachfolger um 11:00: 62 Minuten ab 10:00 ergeben 11:05 - fünf zu spät.
        { index: 3, ...basis, next_appointment_id: nach, travel_from_seconds: 3720 },
        // Ohne Nachbarn nichts zu prüfen.
        { index: 4, ...basis },
      ]),
    ]);
    expect(rows).toEqual([
      { item_index: 0, status: 'tight', shortfall_minutes: 10 },
      { item_index: 1, status: 'ok', shortfall_minutes: 0 },
      { item_index: 2, status: 'unknown', shortfall_minutes: 0 },
      { item_index: 3, status: 'tight', shortfall_minutes: 5 },
      { item_index: 4, status: 'ok', shortfall_minutes: 0 },
    ]);
  });

  it('weist fremde Termine und unsinnige Fahrzeiten ab', async () => {
    const fremd = await fremdeOrganisation();
    const vor = await termin(ANNA, patients.erika, MONTAG, '08:00', '09:00');
    const item = { index: 0, staff_member_id: ANNA, date: MONTAG, start: '09:00', end: '10:00' };
    // Eine fremde Kennung ist „nicht geprüft" - ohne zu verraten, ob es sie gibt.
    const { rows: fremdeBewertung } = await asUser<{ status: string }>(fremd.owner, BEWERTEN, [
      JSON.stringify([{ ...item, prev_appointment_id: vor, travel_to_seconds: 1 }]),
    ]);
    expect(fremdeBewertung).toEqual([expect.objectContaining({ status: 'unknown' })]);
    // Ebenso ein Termin einer anderen Person desselben Tages.
    const { rows: andere } = await asUser<{ status: string }>(users.office, BEWERTEN, [
      JSON.stringify([
        { ...item, staff_member_id: TIM, prev_appointment_id: vor, travel_to_seconds: 1 },
      ]),
    ]);
    expect(andere).toEqual([expect.objectContaining({ status: 'unknown' })]);
    expect(
      (
        await fehler(users.office, BEWERTEN, [
          JSON.stringify([{ ...item, prev_appointment_id: vor, travel_to_seconds: -5 }]),
        ])
      )?.code,
    ).toBe('22023');
    expect(
      (
        await fehler(users.office, BEWERTEN, [
          JSON.stringify(Array.from({ length: 26 }, () => item)),
        ])
      )?.code,
    ).toBe('22023');
  });
});

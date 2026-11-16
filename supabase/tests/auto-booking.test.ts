import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  jwtClaims,
  resetDatabaseOhneTermine,
  testDatabaseUrl,
} from './helpers/db';

/**
 * „Nächsten passenden Termin buchen“ (ANN-865): `plan_auto_booking` nennt die Wege,
 * `book_next_appointment` prüft unter Sperre und bucht. Anna, Jannes und Tim arbeiten im Seed
 * werktags 08-12 und 13-18; das Raster ist 5 Minuten, der Fahrzeitfaktor 1,5.
 */

const { users, organizationId, patients } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';
const JANNES = '55555555-5555-4555-8555-000000000001';
const TIM = '55555555-5555-4555-8555-000000000004';
const STANDORT = '33333333-3333-4333-8333-000000000001';
const GRUNDLAGE_MAX = '88888888-8888-4888-8888-000000000002';

interface Punkt {
  lat: number;
  lon: number;
}
const ORT = {
  praxis: { lat: 48.5216, lon: 9.0576 },
  max: { lat: 48.5305, lon: 9.049 },
  erika: { lat: 48.5164, lon: 9.0349 },
} as const;
const ANSCHRIFT = {
  [patients.erika]: ['Testweg', '7', '72072', 'Tuebingen'],
  [patients.petra]: ['Fiktivgasse', '9', '72074', 'Tuebingen'],
  [patients.max]: ['Beispielstrasse', '12', '72070', 'Tuebingen'],
} as const;

/** Ein Wochentag (ISO 1-7) mindestens `abTagen` Tage in der Zukunft, `YYYY-MM-DD`. */
function naechster(isoWochentag: number, abTagen = 8): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + abTagen);
  while (((d.getUTCDay() + 6) % 7) + 1 !== isoWochentag) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function plusTage(tag: string, tage: number): string {
  const d = new Date(`${tag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

const MONTAG = naechster(1);
const DIENSTAG = plusTage(MONTAG, 1);
const MITTWOCH = plusTage(MONTAG, 2);
const DONNERSTAG = plusTage(MONTAG, 3);

const PLAN =
  'select public.plan_auto_booking($1::uuid, $2::uuid, $3::integer, $4::date, $5::date, $6::jsonb, $7::integer) as plan';
const BUCHEN =
  'select public.book_next_appointment($1::uuid, $2::uuid, $3::integer, $4::date, $5::date, $6::jsonb, $7::integer, $8::jsonb, $9::uuid, $10::uuid) as ergebnis';
const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid) as id';

interface Weg {
  key: string;
  from: Punkt;
  to: Punkt;
}
interface Plan {
  days: number;
  page_size: number;
  target: Punkt;
  legs: Weg[];
}
interface Gebucht {
  outcome: 'booked';
  appointment_id: string;
  staff_member_id: string;
  staff_name: string;
  date: string;
  start: string;
  end: string;
  territory_status: string;
}
interface Nichts {
  outcome: 'none';
  days: number;
  unverified: number;
  tight: number;
  page_size: number;
}
type Ergebnis = Gebucht | Nichts | { outcome: 'retry' };
type Fahrzeit = (von: Punkt, nach: Punkt) => number | null;

interface Anfrage {
  konto: string;
  patient: string;
  staff: string | null;
  dauer: number;
  von: string;
  bis: string;
  fenster: unknown[];
  grundlage: string | null;
  eintrag: string | null;
}
function anfrage(over: Partial<Anfrage> = {}): Anfrage {
  return {
    konto: users.office,
    patient: patients.max,
    staff: ANNA,
    dauer: 60,
    von: MITTWOCH,
    bis: MITTWOCH,
    fenster: [],
    grundlage: null,
    eintrag: null,
    ...over,
  };
}
const planArgs = (a: Anfrage, offset: number) => [
  a.patient,
  a.staff,
  a.dauer,
  a.von,
  a.bis,
  JSON.stringify(a.fenster),
  offset,
];
const buchArgs = (a: Anfrage, offset: number, legs: unknown) => [
  ...planArgs(a, offset),
  JSON.stringify(legs),
  a.grundlage,
  a.eintrag,
];

async function planen(a: Anfrage, offset = 0): Promise<Plan | null> {
  const { rows } = await asUser<{ plan: Plan | null }>(a.konto, PLAN, planArgs(a, offset));
  return rows[0]!.plan;
}

/** Derselbe Ablauf wie die Serverfunktion: Wege planen, Fahrzeiten einsetzen, buchen, blättern. */
async function naechstenBuchen(over: Partial<Anfrage>, fahrzeit: Fahrzeit): Promise<Ergebnis> {
  const a = anfrage(over);
  let letztes: Ergebnis = { outcome: 'none', days: 0, unverified: 0, tight: 0, page_size: 7 };
  for (let offset = 0; offset <= 200;) {
    const plan = await planen(a, offset);
    if (!plan || plan.days === 0) return letztes;
    const legs = plan.legs.map((w) => ({ key: w.key, seconds: fahrzeit(w.from, w.to) }));
    const { rows } = await asUserCommitted<{ ergebnis: Ergebnis }>(
      a.konto,
      BUCHEN,
      buchArgs(a, offset, legs),
    );
    letztes = rows[0]!.ergebnis;
    if (letztes.outcome === 'booked') return letztes;
    if (letztes.outcome === 'retry') continue;
    if (plan.days < plan.page_size) return letztes;
    offset += plan.page_size;
  }
  return letztes;
}

const gleich = (a: Punkt, b: Punkt) =>
  Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;
/** Jede Fahrt dauert beim Kartendienst gleich lang; mit Faktor 1,5 plant die Praxis. */
const ueberall =
  (minuten: number): Fahrzeit =>
  () =>
    minuten * 60;
/** Fahrzeiten je Paar in Minuten; was nicht genannt ist, dauert `sonst`. */
function wege(paare: [Punkt, Punkt, number | null][], sonst: number | null = 10): Fahrzeit {
  return (von, nach) => {
    const treffer = paare.find(([a, b]) => gleich(a, von) && gleich(b, nach));
    const minuten = treffer ? treffer[2] : sonst;
    return minuten === null ? null : minuten * 60;
  };
}

async function termin(
  patient: string,
  tag: string,
  von: string,
  bis: string,
  opts: { staff?: string; art?: 'home_visit' | 'video' | 'practice' } = {},
): Promise<string> {
  const art = opts.art ?? 'home_visit';
  const { rows } = await asUserCommitted<{ id: string }>(users.office, ANLEGEN, [
    patient,
    opts.staff ?? ANNA,
    art,
    tag,
    von,
    bis,
    art === 'practice' ? STANDORT : null,
  ]);
  return rows[0]!.id;
}

async function termine(patient: string = patients.max) {
  const { rows } = await asPostgres<{
    id: string;
    staff: string;
    tag: string;
    von: string;
    bis: string;
    status: string;
    art: string;
    grundlage: string | null;
    created_by: string;
  }>(
    `select a.id, a.staff_member_id as staff,
            to_char(a.starts_at at time zone 'Europe/Berlin', 'YYYY-MM-DD') as tag,
            to_char(a.starts_at at time zone 'Europe/Berlin', 'HH24:MI') as von,
            to_char(a.ends_at at time zone 'Europe/Berlin', 'HH24:MI') as bis,
            a.status, a.appointment_type as art, a.treatment_basis_id as grundlage, a.created_by
       from public.appointments a where a.patient_id = $1::uuid order by a.starts_at`,
    [patient],
  );
  return rows;
}

function erwarteGebucht(e: Ergebnis): Gebucht {
  expect(e.outcome, JSON.stringify(e)).toBe('booked');
  return e as Gebucht;
}

describe('book_next_appointment: Regeln', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('bucht am leeren Tag den ersten Beginn, den die Anfahrt vom Tagesort zulässt', async () => {
    // 10 Minuten beim Kartendienst sind mit Faktor 1,5 eine Viertelstunde ab Arbeitsbeginn 08:00.
    const e = erwarteGebucht(await naechstenBuchen({}, ueberall(10)));
    expect(e).toMatchObject({
      staff_member_id: ANNA,
      staff_name: 'Anna Beispiel',
      date: MITTWOCH,
      start: '08:15',
      end: '09:15',
      territory_status: 'none',
    });
    expect(await termine()).toEqual([
      {
        id: e.appointment_id,
        staff: ANNA,
        tag: MITTWOCH,
        von: '08:15',
        bis: '09:15',
        status: 'confirmed',
        art: 'home_visit',
        grundlage: null,
        created_by: users.office,
      },
    ]);
  });

  it('rundet die Fahrzeit auf den nächsten Rasterpunkt auf, nie ab (§8.1)', async () => {
    // 601 s mal 1,5 sind 902 s: zwei Sekunden über der Viertelstunde, also 08:20.
    const e = erwarteGebucht(await naechstenBuchen({}, () => 601));
    expect(e.start).toBe('08:20');
  });

  it('bucht ohne Fahrzeit nicht: fehlende Wege sind nicht geprüft, nie passend', async () => {
    const e = await naechstenBuchen({}, () => null);
    expect(e).toMatchObject({ outcome: 'none', days: 1, tight: 0 });
    expect((e as Nichts).unverified).toBeGreaterThan(0);
    expect(await termine()).toEqual([]);
  });

  it('bucht auch nicht, wenn nur ein Weg fehlt', async () => {
    const e = await naechstenBuchen({}, wege([[ORT.max, ORT.praxis, null]]));
    expect(e.outcome).toBe('none');
    expect(await termine()).toEqual([]);
  });

  it('hält die Anfahrt vom Termin davor ein', async () => {
    await termin(patients.erika, MITTWOCH, '09:00', '10:00');
    // Vor 09:00 passt nichts (Anfahrt vom Tagesort); nach Erika 20 Minuten mal 1,5.
    const e = erwarteGebucht(await naechstenBuchen({}, wege([[ORT.erika, ORT.max, 20]])));
    expect(e).toMatchObject({ date: MITTWOCH, start: '10:30', end: '11:30' });
  });

  it('hält die Weiterfahrt zum Termin danach ein', async () => {
    await termin(patients.erika, MITTWOCH, '10:00', '11:00');
    // 08:15 bis 09:15, dann 20 Minuten mal 1,5 bis 09:45: Das reicht bis 10:00.
    const passt = erwarteGebucht(await naechstenBuchen({}, wege([[ORT.max, ORT.erika, 20]])));
    expect(passt.start).toBe('08:15');
  });

  it('weicht aus, wenn die Weiterfahrt zu lang ist, und rechnet die Pause nicht als Fahrzeit', async () => {
    await termin(patients.erika, MITTWOCH, '10:00', '11:00');
    // 40 Minuten mal 1,5 sind eine Stunde: vor Erika passt nichts mehr. Nach ihr (11:00) bräuchte es
    // 11:15, das Fenster endet um 11:00; nach der Pause passt 13:00.
    const e = erwarteGebucht(await naechstenBuchen({}, wege([[ORT.max, ORT.erika, 40]])));
    expect(e).toMatchObject({ start: '13:00', end: '14:00' });
  });

  it('zählt die Pause zwischen Nachbar und Termin zur Fahrzeit hinzu', async () => {
    await termin(patients.erika, MITTWOCH, '11:00', '12:00');
    const e = erwarteGebucht(
      await naechstenBuchen(
        { fenster: [{ weekday: 3, from: '13:00', to: '18:00' }] },
        wege([[ORT.erika, ORT.max, 10]]),
      ),
    );
    // Ende 12:00, Pause bis 13:00, dann erst 15 Minuten Fahrt.
    expect(e.start).toBe('13:15');
  });

  it('bucht direkt nach der Pause, wenn davor Zeit für die Fahrt war', async () => {
    await termin(patients.erika, MITTWOCH, '10:00', '11:00');
    const e = erwarteGebucht(
      await naechstenBuchen(
        { fenster: [{ weekday: 3, from: '13:00', to: '18:00' }] },
        wege([[ORT.erika, ORT.max, 10]]),
      ),
    );
    expect(e.start).toBe('13:00');
  });

  it('folgt der verschobenen Pause des Tages (ANN-863)', async () => {
    await asUserCommitted(
      users.therapist,
      'select public.set_break_placement($1::uuid, $2::date, $3::time, $4::time, false)',
      [ANNA, MITTWOCH, '12:00', '11:00'],
    );
    await termin(patients.erika, MITTWOCH, '10:00', '11:00');
    const e = erwarteGebucht(
      await naechstenBuchen(
        { fenster: [{ weekday: 3, from: '10:00', to: '14:00' }] },
        wege([[ORT.erika, ORT.max, 10]]),
      ),
    );
    // Pause jetzt 11:00 bis 12:00: Ende 11:00, Pause, 15 Minuten Fahrt.
    expect(e.start).toBe('12:15');
  });

  it('zählt einen Termin ohne Ort dazwischen als gesperrte Zeit', async () => {
    await termin(patients.erika, MITTWOCH, '13:00', '14:00');
    await termin(patients.petra, MITTWOCH, '14:00', '15:00', { art: 'video' });
    const e = erwarteGebucht(
      await naechstenBuchen(
        { fenster: [{ weekday: 3, from: '15:00', to: '18:00' }] },
        wege([[ORT.erika, ORT.max, 10]]),
      ),
    );
    expect(e.start).toBe('15:15');
  });

  it('nimmt einen Praxistermin als Nachbarn am Standort', async () => {
    await termin(patients.erika, MITTWOCH, '09:00', '10:00', { art: 'practice' });
    const e = erwarteGebucht(await naechstenBuchen({}, wege([[ORT.praxis, ORT.max, 20]])));
    // Vom Standort 30 Minuten: als Tagesrand nicht vor 08:30 (zu spät für 09:00), danach 10:30.
    expect(e.start).toBe('10:30');
  });

  it('überspringt Plätze neben einem Termin ohne verortete Anschrift', async () => {
    const id = await termin(patients.erika, MITTWOCH, '10:00', '11:00');
    await asPostgres(
      'update public.appointments set visit_lat = null, visit_lon = null, visit_geocode_precision = null where id = $1::uuid',
      [id],
    );
    const nur = await naechstenBuchen({}, ueberall(10));
    expect(nur).toMatchObject({ outcome: 'none', days: 1 });
    expect((nur as Nichts).unverified).toBeGreaterThanOrEqual(3);

    const e = erwarteGebucht(await naechstenBuchen({ bis: DONNERSTAG }, ueberall(10)));
    expect(e).toMatchObject({ date: DONNERSTAG, start: '08:15' });
  });

  it('überspringt Plätze neben einem Hausbesuch, dessen Anschrift nicht mehr die der Akte ist (ANN-236)', async () => {
    await termin(patients.erika, MITTWOCH, '10:00', '11:00');
    await asPostgres(
      `update public.patient_contact_details set street = 'Neuweg' where patient_id = $1::uuid`,
      [patients.erika],
    );
    const e = await naechstenBuchen({}, ueberall(10));
    expect(e.outcome).toBe('none');
  });

  it('nennt einer Therapeutin den Ort eines Trainingstermins nicht und bucht nicht daneben (ADR-022 Punkt 11)', async () => {
    const ort = { lat: 48.6, lon: 9.1 };
    // Erst anlegen, dann verorten: Beim Einfügen leert der Auslöser die Koordinate.
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments
         (organization_id, training_relationship_id, staff_member_id, appointment_type, kind, status,
          starts_at, ends_at, visit_street, visit_house_number, visit_postal_code, visit_city)
       values ($1::uuid, $2::uuid, $3::uuid, 'home_visit', 'training', 'confirmed',
               ($4::date + time '10:00') at time zone 'Europe/Berlin',
               ($4::date + time '11:00') at time zone 'Europe/Berlin',
               'Trainingsweg', '5', '72076', 'Tuebingen')
       returning id`,
      [organizationId, SEED.trainingRelationships.tina, ANNA, MITTWOCH],
    );
    await asPostgres(
      `update public.appointments set visit_lat = $2, visit_lon = $3, visit_geocode_precision = 'address'
        where id = $1::uuid`,
      [rows[0]!.id, ort.lat, ort.lon],
    );
    const beruehrt = (plan: Plan | null) =>
      plan!.legs.some((w) => gleich(w.from, ort) || gleich(w.to, ort));

    // Das Büro liest das Training und plant mit dem Ort; die Therapeutin erfährt ihn nicht.
    expect(beruehrt(await planen(anfrage()))).toBe(true);
    expect(beruehrt(await planen(anfrage({ konto: users.therapist })))).toBe(false);

    const therapeutin = await naechstenBuchen({ konto: users.therapist }, ueberall(10));
    expect(therapeutin).toMatchObject({ outcome: 'none', days: 1 });
    expect((therapeutin as Nichts).unverified).toBeGreaterThanOrEqual(2);
    expect(await termine()).toEqual([]);

    const buero = erwarteGebucht(await naechstenBuchen({}, ueberall(10)));
    expect(buero.start).toBe('08:15');
  });

  it('belegt die Zeiten der Patient:in bei anderen Personen', async () => {
    await termin(patients.max, MITTWOCH, '08:00', '09:30', { staff: JANNES, art: 'video' });
    const e = erwarteGebucht(await naechstenBuchen({}, ueberall(10)));
    expect(e).toMatchObject({ staff_member_id: ANNA, start: '09:30' });
  });

  it('bleibt in den Wunschzeiten', async () => {
    const e = erwarteGebucht(
      await naechstenBuchen(
        { fenster: [{ weekday: 3, from: '14:00', to: '16:00' }] },
        ueberall(10),
      ),
    );
    expect(e).toMatchObject({ start: '14:00', end: '15:00' });
  });

  it('nimmt den Gebietstag zuerst, auch wenn ein anderer Tag früher frei wäre (PRX-002)', async () => {
    await asUserCommitted(
      users.office,
      `select public.save_territory(null, null, 'Nord', array['72070'], $1::jsonb)`,
      [JSON.stringify([{ weekday: 4, part: 'pm' }])],
    );
    const e = erwarteGebucht(await naechstenBuchen({ bis: DONNERSTAG }, ueberall(10)));
    expect(e).toMatchObject({ date: DONNERSTAG, start: '13:00', territory_status: 'match' });
  });

  it('nimmt bei gleichem Beginn zuerst, wer zuletzt behandelt hat, sonst nach Namen', async () => {
    const ohne = erwarteGebucht(await naechstenBuchen({ staff: null }, ueberall(10)));
    expect(ohne).toMatchObject({ staff_name: 'Anna Beispiel', start: '08:15' });
    await asPostgres('delete from public.appointments');

    await termin(patients.max, DIENSTAG, '16:00', '17:00', { staff: TIM });
    const mit = erwarteGebucht(await naechstenBuchen({ staff: null }, ueberall(10)));
    expect(mit).toMatchObject({ staff_member_id: TIM, start: '08:15' });
  });

  it('nimmt über alle Personen den frühesten Beginn des Tages', async () => {
    await termin(patients.erika, MITTWOCH, '08:00', '11:00');
    const e = erwarteGebucht(await naechstenBuchen({ staff: null }, ueberall(10)));
    // Anna stünde im Namen vorn, kann aber erst 11:15; Jannes ist ab 08:15 frei.
    expect(e).toMatchObject({ staff_member_id: JANNES, start: '08:15' });
  });

  it('trägt die Behandlungsgrundlage ein', async () => {
    const e = erwarteGebucht(await naechstenBuchen({ grundlage: GRUNDLAGE_MAX }, ueberall(10)));
    expect((await termine())[0]).toMatchObject({ id: e.appointment_id, grundlage: GRUNDLAGE_MAX });
  });

  it('schließt den Eintrag der Warteliste in derselben Buchung', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(
      users.office,
      `select public.create_waitlist_entry($1::uuid, null, null, 'home_visit', 60, '[]'::jsonb, null, null, 'patient_wish', null) as id`,
      [patients.max],
    );
    const eintrag = rows[0]!.id;
    const e = erwarteGebucht(await naechstenBuchen({ eintrag }, ueberall(10)));
    const stand = await asPostgres<{ status: string; placed_appointment_id: string }>(
      'select status, placed_appointment_id from public.waitlist_entries where id = $1::uuid',
      [eintrag],
    );
    expect(stand.rows[0]).toEqual({ status: 'placed', placed_appointment_id: e.appointment_id });

    // Ein zweiter Lauf mit demselben Eintrag bucht nichts mehr.
    const a = anfrage({ eintrag });
    const plan = (await planen(a))!;
    const fehler = await abgefangen(
      asUserCommitted(
        users.office,
        BUCHEN,
        buchArgs(
          a,
          0,
          plan.legs.map((w) => ({ key: w.key, seconds: 600 })),
        ),
      ),
    );
    expect(fehler?.message).toMatch(/waitlist entry closed/);
    expect(await termine()).toHaveLength(1);
  });

  it('nennt nur die Wege, die es braucht: Koordinatenpaare ohne Namen, Kennung und Uhrzeit', async () => {
    await termin(patients.erika, MITTWOCH, '10:00', '11:00');
    const plan = (await planen(anfrage()))!;
    expect(Object.keys(plan).sort()).toEqual(['days', 'legs', 'page_size', 'target']);
    expect(plan).toMatchObject({ days: 1, page_size: 7, target: ORT.max });
    const paare = plan.legs.map((w) => `${w.from.lat},${w.from.lon}>${w.to.lat},${w.to.lon}`);
    const p = (o: Punkt) => `${o.lat},${o.lon}`;
    expect(paare.sort()).toEqual(
      [
        `${p(ORT.praxis)}>${p(ORT.max)}`,
        `${p(ORT.erika)}>${p(ORT.max)}`,
        `${p(ORT.max)}>${p(ORT.erika)}`,
        `${p(ORT.max)}>${p(ORT.praxis)}`,
      ].sort(),
    );
    for (const w of plan.legs) {
      expect(Object.keys(w).sort()).toEqual(['from', 'key', 'to']);
      expect(w.key).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('blättert über die Tage: nach sieben Tagen ohne Platz geht es auf der nächsten Seite weiter', async () => {
    // Acht Tage Urlaub ab Montag, danach ist der neunte Tag frei.
    const letzter = plusTage(MONTAG, 8);
    for (let i = 0; i < 8; i += 1) {
      await asPostgres(
        `insert into public.staff_working_hour_exceptions (organization_id, staff_member_id, on_date, kind)
         values ($1::uuid, $2::uuid, $3::date, 'unavailable')`,
        [organizationId, ANNA, plusTage(MONTAG, i)],
      );
    }
    const a = anfrage({ von: MONTAG, bis: plusTage(MONTAG, 20) });
    expect((await planen(a, 0))!.days).toBe(7);
    const e = erwarteGebucht(
      await naechstenBuchen({ von: MONTAG, bis: plusTage(MONTAG, 20) }, ueberall(10)),
    );
    expect(e.date).toBe(letzter);
  });
});

describe('book_next_appointment: Eingaben und Rechte', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  const versuch = (over: Partial<Anfrage>, legs: unknown = []) => {
    const a = anfrage(over);
    return abgefangen(asUser(a.konto, BUCHEN, buchArgs(a, 0, legs)));
  };
  const planversuch = (over: Partial<Anfrage>, offset = 0) => {
    const a = anfrage(over);
    return abgefangen(asUser(a.konto, PLAN, planArgs(a, offset)));
  };

  it('weist anonyme Aufrufe ab', async () => {
    const a = anfrage();
    await expect(asAnon(PLAN, planArgs(a, 0))).rejects.toThrow(/permission denied/);
    await expect(asAnon(BUCHEN, buchArgs(a, 0, []))).rejects.toThrow(/permission denied/);
  });

  it.each([
    ['Patientenkonto', users.patientMax],
    ['Plattformkonto', users.plattformErika],
    ['Trainingsbetreuung', users.trainer],
  ])('weist %s ab und nennt ihm keine Wege', async (_name, konto) => {
    expect((await versuch({ konto }))?.message).toMatch(/not allowed to create appointments/);
    // Mit Profil kommt nichts zurück, ohne Organisation weist schon der Vermerk ab.
    const plan = await planen(anfrage({ konto })).catch((fehler: Error) => fehler);
    if (plan instanceof Error) expect(plan.message).toMatch(/not allowed to create appointments/);
    else expect(plan).toBeNull();
  });

  it('vermerkt den abgewiesenen Lesezugriff auf die Wege (ADR-010)', async () => {
    const zaehler = async () => {
      const { rows } = await asPostgres<{ n: string | null }>(
        `select sum((context ->> 'count')::integer) as n from public.audit_log
          where action = 'access.denied' and actor_user_id = $1::uuid
            and context ->> 'operation' = 'appointments.read'`,
        [users.trainer],
      );
      return Number(rows[0]!.n ?? 0);
    };
    const vorher = await zaehler();
    await asUserCommitted(users.trainer, PLAN, planArgs(anfrage(), 0));
    expect(await zaehler()).toBe(vorher + 1);
  });

  it('kennt keine Akte und keine Person einer anderen Organisation', async () => {
    const fremd = await fremdeOrganisation();
    expect((await versuch({ konto: fremd.owner }))?.message).toMatch(/patient not found/);
    expect((await planversuch({ konto: fremd.owner }))?.message).toMatch(/patient not found/);
    expect((await versuch({ patient: fremd.patient }))?.message).toMatch(/patient not found/);
    expect((await versuch({ staff: fremd.staffMember }))?.message).toMatch(
      /staff member not assignable/,
    );
    expect((await planversuch({ staff: fremd.staffMember }))?.message).toMatch(
      /staff member not assignable/,
    );
  });

  it('nimmt keine Grundlage einer anderen Person', async () => {
    const a = anfrage({ grundlage: '88888888-8888-4888-8888-000000000003' });
    const plan = (await planen(a))!;
    const legs = plan.legs.map((w) => ({ key: w.key, seconds: 600 }));
    const fehler = await abgefangen(asUser(a.konto, BUCHEN, buchArgs(a, 0, legs)));
    expect(fehler?.message).toMatch(/treatment basis not found/);
  });

  it('prüft Dauer, Zeitraum, Wunschzeiten, Seite und Wege', async () => {
    expect((await versuch({ dauer: 7 }))?.message).toMatch(/invalid duration/);
    expect((await versuch({ dauer: 300 }))?.message).toMatch(/invalid duration/);
    expect((await versuch({ bis: plusTage(MITTWOCH, 60) }))?.message).toMatch(/date range/);
    expect((await versuch({ von: MITTWOCH, bis: MONTAG }))?.message).toMatch(/date range/);
    expect((await versuch({ fenster: [{ weekday: 9 }] }))?.message).toMatch(/invalid time windows/);
    expect((await planversuch({}, -1))?.message).toMatch(/invalid offset/);
    expect((await planversuch({}, 201))?.message).toMatch(/invalid offset/);
    for (const legs of [
      'nein',
      [{ key: 'x' }],
      [{ key: 1, seconds: 5 }],
      [{ key: 'x', seconds: -1 }],
      [{ key: 'x', seconds: 86401 }],
      [{ key: 'x', seconds: 'schnell' }],
      Array.from({ length: 401 }, () => ({ key: 'x', seconds: 1 })),
    ]) {
      expect((await versuch({}, legs))?.message, JSON.stringify(legs).slice(0, 40)).toMatch(
        /invalid legs/,
      );
    }
  });

  it('bucht nicht ohne vollständige und verortete Anschrift', async () => {
    await asPostgres(
      'update public.patient_contact_details set lat = null, lon = null, geocode_precision = null where patient_id = $1::uuid',
      [patients.max],
    );
    expect((await versuch({}))?.message).toMatch(/patient address is not located/);
    expect((await planversuch({}))?.message).toMatch(/patient address is not located/);
    await asPostgres(
      'update public.patient_contact_details set house_number = null where patient_id = $1::uuid',
      [patients.max],
    );
    expect((await versuch({}))?.message).toMatch(/complete patient address/);
  });

  it('lässt die Hilfsfunktionen niemanden von außen aufrufen', async () => {
    const { rows } = await asPostgres<{ name: string; rollen: string }>(
      `select p.proname as name,
              coalesce(string_agg(r.rolname, ',' order by r.rolname) filter (
                where has_function_privilege(r.oid, p.oid, 'execute')), '') as rollen
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join (select oid, rolname from pg_roles
                      where rolname in ('anon', 'authenticated', 'service_role')) r
        where (n.nspname = 'app' and (p.proname like 'auto_booking%' or p.proname = 'appointment_position'))
           or (n.nspname = 'public' and p.proname in ('plan_auto_booking', 'book_next_appointment'))
        group by p.proname order by p.proname`,
    );
    const rechte = Object.fromEntries(rows.map((r) => [r.name, r.rollen]));
    expect(rechte).toEqual({
      appointment_position: '',
      auto_booking_fits: '',
      auto_booking_free_seconds: '',
      auto_booking_leg_key: '',
      auto_booking_leg_seconds: '',
      auto_booking_page_size: '',
      auto_booking_request: '',
      auto_booking_sides: '',
      auto_booking_windows: '',
      book_next_appointment: 'authenticated',
      plan_auto_booking: 'authenticated',
    });
  });
});

describe('book_next_appointment: gleichzeitig', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  async function sitzung(konto: string): Promise<Client> {
    const c = new Client({ connectionString: testDatabaseUrl() });
    await c.connect();
    await c.query('begin');
    await c.query("select set_config('role', 'authenticated', true)");
    await c.query("select set_config('request.jwt.claims', $1, true)", [jwtClaims(konto)]);
    return c;
  }

  /** Alle Wege zwischen den drei Orten, je zehn Minuten beim Kartendienst. */
  async function alleWege(): Promise<{ key: string; seconds: number }[]> {
    const punkte = [ORT.praxis, ORT.max, ORT.erika];
    const legs: { key: string; seconds: number }[] = [];
    for (const a of punkte) {
      for (const b of punkte) {
        if (a === b) continue;
        const { rows } = await asPostgres<{ key: string }>(
          'select app.auto_booking_leg_key($1::float8, $2::float8, $3::float8, $4::float8) as key',
          [a.lat, a.lon, b.lat, b.lon],
        );
        legs.push({ key: rows[0]!.key, seconds: 600 });
      }
    }
    return legs;
  }

  it('gibt bei zwei Buchungen auf denselben Platz nur einer ihn; die zweite plant mit der ersten', async () => {
    const legs = await alleWege();
    const a = await sitzung(users.office);
    const b = await sitzung(users.therapist);
    try {
      const fuerMax = anfrage();
      const fuerErika = anfrage({ patient: patients.erika });
      const erste = await a.query<{ ergebnis: Gebucht }>(BUCHEN, buchArgs(fuerMax, 0, legs));
      expect(erste.rows[0]!.ergebnis).toMatchObject({ outcome: 'booked', start: '08:15' });

      // Die zweite wartet an der Sperre der Person, bis die erste entschieden ist.
      let fertig = false;
      const zweite = b
        .query<{ ergebnis: Ergebnis }>(BUCHEN, buchArgs(fuerErika, 0, legs))
        .finally(() => {
          fertig = true;
        });
      await new Promise((r) => setTimeout(r, 400));
      expect(fertig, 'die zweite Buchung darf nicht an der Sperre vorbei').toBe(false);

      await a.query('commit');
      const e = (await zweite).rows[0]!.ergebnis;
      await b.query('commit');
      // Ohne die Sperre hätte auch sie 08:15 gewählt. So folgt sie auf Max: Ende 09:15 plus 15 Minuten.
      expect(e).toMatchObject({ outcome: 'booked', staff_member_id: ANNA, start: '09:30' });
    } finally {
      await a.query('rollback').catch(() => undefined);
      await b.query('rollback').catch(() => undefined);
      await a.end();
      await b.end();
    }
    const { rows } = await asPostgres<{ n: string }>(
      `select count(*) as n from public.appointments a join public.appointments b
          on a.staff_member_id = b.staff_member_id and a.id < b.id
         and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)`,
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('bucht für dieselbe Person nicht zweimal denselben Platz', async () => {
    const legs = await alleWege();
    const a = await sitzung(users.office);
    const b = await sitzung(users.therapist);
    try {
      const args = buchArgs(anfrage({ staff: null }), 0, legs);
      await a.query(BUCHEN, args);
      const zweite = b.query<{ ergebnis: Ergebnis }>(BUCHEN, args);
      await a.query('commit');
      await zweite;
      await b.query('commit');
    } finally {
      await a.query('rollback').catch(() => undefined);
      await b.query('rollback').catch(() => undefined);
      await a.end();
      await b.end();
    }
    const gebucht = await termine();
    expect(gebucht).toHaveLength(2);
    // Die Zeiten der Patient:in überschneiden sich nicht, auch nicht bei zwei Personen.
    expect(gebucht[0]!.bis <= gebucht[1]!.von).toBe(true);
  });

  it('wartet mit dem Anlegen von Hand, bis die Pause verschoben ist, und landet nicht in ihr', async () => {
    const a = await sitzung(users.therapist);
    const b = await sitzung(users.office);
    try {
      await a.query(
        'select public.set_break_placement($1::uuid, $2::date, $3::time, $4::time, false)',
        [ANNA, MITTWOCH, '12:00', '11:00'],
      );
      const anlegen = abgefangen(
        b.query(ANLEGEN, [patients.max, ANNA, 'video', MITTWOCH, '11:00', '12:00', null]),
      );
      await new Promise((r) => setTimeout(r, 300));
      await a.query('commit');
      const fehler = await anlegen;
      expect(fehler?.message).toMatch(/outside_working_hours/);
    } finally {
      await a.query('rollback').catch(() => undefined);
      await b.query('rollback').catch(() => undefined);
      await a.end();
      await b.end();
    }
  });
});

// -----------------------------------------------------------------------------
// Erfundene Wochen: Ein eigener Nachrechner in TypeScript geht jeden Rasterpunkt
// durch und sagt, welcher Beginn der erste passende ist. Die Datenbank muss
// genau diesen buchen - oder ebenfalls keinen finden.
// -----------------------------------------------------------------------------

const RASTER = 5;
const FAKTOR = 1.5;
const PERSONEN = [
  { id: ANNA, name: 'Anna Beispiel' },
  { id: JANNES, name: 'Jannes Test' },
  { id: TIM, name: 'Tim Teamleitung' },
];

function zufall(saat: number): () => number {
  let a = saat >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const zeit = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

interface Bereich {
  von: number;
  bis: number;
}
interface Bestand {
  staff: string;
  patient: string | null;
  tag: string;
  von: number;
  bis: number;
  ort: Punkt | null;
  mitOrt: boolean;
}

/** `{[08:00:00,12:00:00),[13:00:00,18:00:00)}` als Sekundenbereiche. */
function bereiche(text: string | null): Bereich[] {
  if (!text) return [];
  return [...text.matchAll(/\[(\d\d):(\d\d):(\d\d),(\d\d):(\d\d):(\d\d)\)/g)].map((m) => ({
    von: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]),
    bis: Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6]),
  }));
}

/** Freie Arbeitszeit in Sekunden zwischen `von` und `bis`, ohne die Termine der Person. */
function freieSekunden(arbeit: Bereich[], belegt: Bereich[], von: number, bis: number): number {
  let frei = 0;
  for (let s = von; s < bis; s += 60) {
    const inArbeit = arbeit.some((b) => b.von <= s && s < b.bis);
    const besetzt = belegt.some((b) => b.von <= s && s < b.bis);
    if (inArbeit && !besetzt) frei += 60;
  }
  return frei;
}

function aufRaster(sekunden: number): number {
  return Math.ceil(sekunden / (RASTER * 60)) * RASTER * 60;
}

interface Lage {
  arbeit: Map<string, Bereich[]>;
  bestand: Bestand[];
  stamm: string | null;
}

/** Der erste passende Beginn nach Tag, Uhrzeit und Person - oder `null`. */
function nachrechnen(
  lage: Lage,
  tage: string[],
  personen: string[],
  dauer: number,
  fenster: { weekday: number; from: number; to: number }[],
  fahrzeit: Fahrzeit,
): { tag: string; start: number; staff: string } | null {
  const reihenfolge = PERSONEN.filter((p) => personen.includes(p.id)).sort(
    (a, b) =>
      Number(b.id === lage.stamm) - Number(a.id === lage.stamm) || a.name.localeCompare(b.name),
  );
  for (const tag of tage) {
    const wochentag = ((new Date(`${tag}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const wunsch = fenster.filter((f) => f.weekday === wochentag);
    if (fenster.length > 0 && wunsch.length === 0) continue;
    for (let start = 0; start + dauer <= 24 * 60 - 1; start += RASTER) {
      const s = start * 60;
      const e = (start + dauer) * 60;
      if (fenster.length > 0 && !wunsch.some((f) => f.from * 60 <= s && e <= f.to * 60)) continue;
      for (const person of reihenfolge) {
        const arbeit = lage.arbeit.get(`${person.id}|${tag}`) ?? [];
        if (!arbeit.some((b) => b.von <= s && e <= b.bis)) continue;
        const eigene = lage.bestand.filter((t) => t.staff === person.id && t.tag === tag);
        const belegt = eigene.map((t) => ({ von: t.von * 60, bis: t.bis * 60 }));
        if (belegt.some((b) => b.von < e && s < b.bis)) continue;
        const patient = lage.bestand.filter((t) => t.patient === patients.max && t.tag === tag);
        if (patient.some((t) => t.von * 60 < e && s < t.bis * 60)) continue;

        const seite = (richtung: 'an' | 'weiter'): boolean => {
          const stopps = eigene.filter((t) => t.mitOrt);
          let rand: number;
          let ort: Punkt | null;
          if (richtung === 'an') {
            const davor = stopps.filter((t) => t.bis * 60 <= s).sort((a, b) => b.bis - a.bis)[0];
            if (davor) {
              rand = davor.bis * 60;
              ort = davor.ort;
            } else {
              rand = Math.min(...arbeit.map((b) => b.von));
              ort = ORT.praxis;
            }
            if (!ort) return false;
            const fahrt = gleich(ort, ORT.max) ? 0 : fahrzeit(ort, ORT.max);
            if (fahrt === null) return false;
            const gesperrt = s - rand - freieSekunden(arbeit, belegt, rand, s);
            return aufRaster(rand + gesperrt + Math.round(fahrt * FAKTOR)) <= s;
          }
          const danach = stopps.filter((t) => t.von * 60 >= e).sort((a, b) => a.von - b.von)[0];
          if (danach) {
            rand = danach.von * 60;
            ort = danach.ort;
          } else {
            rand = Math.max(...arbeit.map((b) => b.bis));
            ort = ORT.praxis;
          }
          if (!ort) return false;
          const fahrt = gleich(ort, ORT.max) ? 0 : fahrzeit(ORT.max, ort);
          if (fahrt === null) return false;
          const gesperrt = rand - e - freieSekunden(arbeit, belegt, e, rand);
          return aufRaster(e + gesperrt + Math.round(fahrt * FAKTOR)) <= rand;
        };
        if (seite('an') && seite('weiter')) return { tag, start, staff: person.id };
      }
    }
  }
  return null;
}

async function lageLesen(db: Client, tage: string[]): Promise<Lage> {
  const arbeit = new Map<string, Bereich[]>();
  const zeiten = await db.query<{ staff: string; tag: string; r: string | null }>(
    `select p.id as staff, t.tag::text as tag, app.working_ranges(p.id, $1::uuid, t.tag)::text as r
       from unnest($2::uuid[]) as p(id) cross join unnest($3::date[]) as t(tag)`,
    [organizationId, PERSONEN.map((p) => p.id), tage],
  );
  for (const z of zeiten.rows) arbeit.set(`${z.staff}|${z.tag}`, bereiche(z.r));
  const { rows } = await db.query<{
    staff: string;
    patient: string | null;
    tag: string;
    von: number;
    bis: number;
    art: string;
    lat: number | null;
    lon: number | null;
    veraltet: boolean;
  }>(
    `select a.staff_member_id as staff, a.patient_id as patient,
            to_char(a.starts_at at time zone 'Europe/Berlin', 'YYYY-MM-DD') as tag,
            (extract(epoch from (a.starts_at at time zone 'Europe/Berlin')::time) / 60)::int as von,
            (extract(epoch from (a.ends_at at time zone 'Europe/Berlin')::time) / 60)::int as bis,
            a.appointment_type as art,
            case when a.appointment_type = 'home_visit' then a.visit_lat else l.lat end as lat,
            case when a.appointment_type = 'home_visit' then a.visit_lon else l.lon end as lon,
            a.appointment_type = 'home_visit'
              and (a.visit_street, a.visit_house_number) is distinct from (c.street, c.house_number) as veraltet
       from public.appointments a
       left join public.locations l on l.id = a.location_id
       left join public.patient_contact_details c on c.patient_id = a.patient_id
      where a.status <> 'cancelled'`,
  );
  const stamm = await db.query<{ staff: string }>(
    `select staff_member_id as staff from public.appointments
      where patient_id = $1::uuid and kind = 'therapy' and status <> 'cancelled'
      order by starts_at desc limit 1`,
    [patients.max],
  );
  return {
    arbeit,
    stamm: stamm.rows[0]?.staff ?? null,
    bestand: rows.map((r) => ({
      staff: r.staff,
      patient: r.patient,
      tag: r.tag,
      von: r.von,
      bis: r.bis,
      mitOrt: r.art !== 'video',
      ort:
        r.art === 'video' || r.veraltet || r.lat === null || r.lon === null
          ? null
          : { lat: r.lat, lon: r.lon },
    })),
  };
}

describe('book_next_appointment: erfundene Wochen', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  const WOCHE = [0, 1, 2, 3, 4].map((i) => plusTage(MONTAG, i));
  const RUNDEN = 120;

  async function einfuegen(
    db: Client,
    w: () => number,
    staff: string,
    tag: string,
    von: number,
    bis: number,
  ): Promise<void> {
    const wurf = w();
    const patient = wurf < 0.15 ? patients.max : w() < 0.5 ? patients.erika : patients.petra;
    const art =
      wurf < 0.15 ? 'video' : wurf < 0.3 ? 'video' : wurf < 0.4 ? 'practice' : 'home_visit';
    // Die Anschrift der Akte oder eine andere: Die andere gilt als veraltet und hat keinen Ort.
    const anschrift =
      art === 'home_visit'
        ? w() < 0.12
          ? ['Altweg', '1', '72070', 'Tuebingen']
          : ANSCHRIFT[patient]
        : null;
    const { rows } = await db.query<{ id: string }>(
      `insert into public.appointments
         (organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
          starts_at, ends_at, visit_street, visit_house_number, visit_postal_code, visit_city)
       values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'confirmed',
               ($6::date + $7::time) at time zone 'Europe/Berlin',
               ($6::date + $8::time) at time zone 'Europe/Berlin', $9, $10, $11, $12)
       returning id`,
      [
        organizationId,
        patient,
        staff,
        art === 'practice' ? STANDORT : null,
        art,
        tag,
        zeit(von),
        zeit(bis),
        ...(anschrift ?? [null, null, null, null]),
      ],
    );
    if (art !== 'home_visit') return;
    // Jeder Hausbesuch an einem eigenen Punkt, jeder zehnte ohne Verortung.
    const ohne = w() < 0.1;
    await db.query(
      `update public.appointments set visit_lat = $2, visit_lon = $3, visit_geocode_precision = $4
        where id = $1::uuid`,
      ohne
        ? [rows[0]!.id, null, null, null]
        : [
            rows[0]!.id,
            Math.round((48.5 + w() * 0.05) * 1e6) / 1e6,
            Math.round((9.03 + w() * 0.05) * 1e6) / 1e6,
            'address',
          ],
    );
  }

  it(`bucht in ${RUNDEN} Wochen immer den Beginn, den der Nachrechner als ersten passenden findet`, async () => {
    let gebucht = 0;
    let ohnePlatz = 0;
    const db = new Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    try {
      for (let runde = 0; runde < RUNDEN; runde += 1) {
        const w = zufall(20261115 + runde);
        await db.query('delete from public.appointments');
        await db.query('delete from public.staff_break_placements');

        // Bestand: je Person und Tag null bis fünf Termine, ohne Überschneidung.
        const voll = w() < 0.25;
        for (const person of PERSONEN) {
          for (const tag of WOCHE) {
            const belegt: Bereich[] = [];
            const anzahl = voll ? 4 + Math.floor(w() * 3) : Math.floor(w() * 4);
            for (let i = 0; i < anzahl; i += 1) {
              const von = 8 * 60 + Math.floor((w() * 9 * 60) / RASTER) * RASTER;
              const bis = von + [30, 45, 60, 90][Math.floor(w() * 4)]!;
              if (bis > 18 * 60 + 30 || belegt.some((b) => b.von < bis && von < b.bis)) continue;
              belegt.push({ von, bis });
              await einfuegen(db, w, person.id, tag, von, bis);
            }
            // Jeder fünfte Tag mit verschobener Pause (ANN-863).
            if (w() < 0.2) {
              const beginn = 9 * 60 + Math.floor((w() * 7 * 60) / RASTER) * RASTER;
              if (beginn !== 12 * 60) {
                await db.query(
                  `insert into public.staff_break_placements
                   (organization_id, staff_member_id, on_date, plan_starts_at, starts_at, ends_at)
                 values ($1::uuid, $2::uuid, $3::date, '12:00', $4::time, $5::time)`,
                  [organizationId, person.id, tag, zeit(beginn), zeit(beginn + 60)],
                );
              }
            }
          }
        }

        const dauer = [30, 45, 60][Math.floor(w() * 3)]!;
        const staff = w() < 0.5 ? null : PERSONEN[Math.floor(w() * 3)]!.id;
        const fenster =
          w() < 0.3
            ? [1, 2, 3, 4, 5]
                .filter(() => w() < 0.6)
                .map((weekday) => {
                  const from = 8 * 60 + Math.floor(w() * 6) * 60;
                  return { weekday, from, to: from + 120 + Math.floor(w() * 3) * 60 };
                })
            : [];
        // Fahrzeit aus den Koordinaten: 2 bis 40 Minuten, jeder zwölfte Weg ohne Antwort.
        const saat = Math.floor(w() * 1e9);
        const fahrzeit: Fahrzeit = (von, nach) => {
          const z = zufall(
            saat ^
              Math.round(von.lat * 1e6) ^
              (Math.round(von.lon * 1e6) << 3) ^
              (Math.round(nach.lat * 1e6) << 7) ^
              (Math.round(nach.lon * 1e6) << 11),
          );
          return z() < 1 / 12 ? null : 120 + Math.floor(z() * 2280);
        };

        const lage = await lageLesen(db, WOCHE);
        const erwartet = nachrechnen(
          lage,
          WOCHE,
          staff === null ? PERSONEN.map((p) => p.id) : [staff],
          dauer,
          fenster,
          fahrzeit,
        );
        const ergebnis = await naechstenBuchen(
          {
            staff,
            dauer,
            von: WOCHE[0]!,
            bis: WOCHE[4]!,
            fenster: fenster.map((f) => ({
              weekday: f.weekday,
              from: zeit(f.from),
              to: zeit(f.to),
            })),
          },
          fahrzeit,
        );
        const lagebild = `Runde ${runde}, Dauer ${dauer}, Person ${staff ?? 'alle'}, Fenster ${JSON.stringify(fenster)}`;
        if (erwartet === null) {
          expect(ergebnis.outcome, lagebild).toBe('none');
          ohnePlatz += 1;
        } else {
          expect(ergebnis, lagebild).toMatchObject({
            outcome: 'booked',
            date: erwartet.tag,
            start: zeit(erwartet.start),
            end: zeit(erwartet.start + dauer),
            staff_member_id: erwartet.staff,
          });
          gebucht += 1;
        }
      }
    } finally {
      await db.end();
    }
    // Die Wochen sollen beides zeigen: gebuchte Plätze und Wochen ohne passenden Platz.
    expect(gebucht).toBeGreaterThan(RUNDEN / 3);
    expect(ohnePlatz).toBeGreaterThan(0);
  }, 600_000);
});

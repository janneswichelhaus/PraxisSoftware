import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Ereignisse des Praxisbetriebs (CAL-015b, PROJECT_PRINCIPLES.md 0.9
 * Abschnitt 8.1).
 *
 * Eine Besprechung ist ein Termin ohne Patient:in: Sie belegt Zeit in einem
 * oder mehreren Kalendern, sie hat einen Titel, und sie ist ausdruecklich
 * keine Behandlung. Geprueft wird beides - dass sie den Kalender wirklich
 * belegt, und dass sie in keinen Zustand kommt, aus dem spaeter eine Leistung
 * entstehen koennte (19).
 *
 * Die Datei prueft ausserdem die zweite Terminlaenge: 45 Minuten sind seit
 * derselben Festlegung zulaessig, eine dritte Laenge weiterhin nicht.
 */

const { users, patients, organizationId } = SEED;

const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const EREIGNIS =
  'select public.create_appointment_event($1, $2::uuid[], $3, $4::date, $5::time, $6::time, $7::uuid, $8::boolean) as anzahl';
const AENDERN =
  'select public.update_appointment($1::uuid, $2::timestamptz, $3::uuid, $4, $5::date, $6::time, $7::time, $8::uuid, true) as id';
const ABSCHLIESSEN = 'select public.complete_appointment($1::uuid, $2::timestamptz) as id';
const NICHT_ANGETROFFEN = 'select public.record_no_show($1::uuid, $2::timestamptz) as id';
const DOKUMENTIEREN = 'select public.create_treatment_note($1::uuid, $2) as id';
const TAG_UMPLANEN = 'select public.cancel_staff_day($1::uuid, $2::date, $3) as anzahl';
const LESEN =
  "select * from public.list_appointments($1::date, $2::date, null, null, 'all') order by starts_at";

const ANNA = '55555555-5555-4555-8555-000000000002';
const OLIVIA = '55555555-5555-4555-8555-000000000003';
const TIM = '55555555-5555-4555-8555-000000000004';
const STANDORT = '33333333-3333-4333-8333-000000000001';

/** Ein Kalendertag weit voraus - die Seed-Termine liegen heute. */
function tagInTagen(tage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

const TAG = tagInTagen(95);

async function ereignis(
  optionen: {
    titel?: string;
    personen?: string[];
    art?: 'practice' | 'video';
    tag?: string;
    von?: string;
    bis?: string;
    ort?: string | null;
    ausserhalbErlaubt?: boolean;
    user?: string;
  } = {},
): Promise<number> {
  const art = optionen.art ?? 'video';
  const { rows } = await asUserCommitted<{ anzahl: number }>(
    optionen.user ?? users.office,
    EREIGNIS,
    [
      optionen.titel ?? 'Teambesprechung',
      optionen.personen ?? [ANNA],
      art,
      optionen.tag ?? TAG,
      optionen.von ?? '08:00',
      optionen.bis ?? '08:30',
      optionen.ort === undefined ? (art === 'practice' ? STANDORT : null) : optionen.ort,
      optionen.ausserhalbErlaubt ?? true,
    ],
  );
  return rows[0]!.anzahl;
}

/**
 * Die Ereignisse dieser Datei - erkennbar am Tag. Der Seed bringt seit
 * CAL-015b selbst eine Teambesprechung von heute mit; sie gehoert nicht in
 * diese Zaehlungen.
 */
async function zeilen(): Promise<Record<string, unknown>[]> {
  const { rows } = await asPostgres<Record<string, unknown>>(
    `select * from public.appointments
      where kind = 'event'
        and (starts_at at time zone 'Europe/Berlin')::date = $1::date
      order by staff_member_id`,
    [TAG],
  );
  return rows;
}

async function stand(id: string): Promise<{ id: string; updated_at: string }> {
  const { rows } = await asPostgres<{ id: string; updated_at: string }>(
    'select id, to_char(updated_at at time zone \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"+00"\') as updated_at from public.appointments where id = $1',
    [id],
  );
  return rows[0]!;
}

describe('Ereignis anlegen', () => {
  beforeEach(resetDatabase);

  it('legt je beteiligter Person einen Termin an', async () => {
    const anzahl = await ereignis({ personen: [ANNA, OLIVIA, TIM] });

    expect(anzahl).toBe(3);
    const rows = await zeilen();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      kind: 'event',
      title: 'Teambesprechung',
      status: 'confirmed',
      patient_id: null,
      prescription_id: null,
    });
  });

  /**
   * Das Buero nimmt an einer Teambesprechung teil. `is_assignable_therapist`
   * waere hier die falsche Frage - sie gilt fuer Behandlungen.
   */
  it('laesst auch Beteiligte ohne therapeutische Rolle zu', async () => {
    const anzahl = await ereignis({ personen: [OLIVIA] });
    expect(anzahl).toBe(1);
  });

  it('belegt den Zeitraum wie jeder andere Termin', async () => {
    await ereignis({ personen: [ANNA], von: '08:00', bis: '08:30' });

    await expect(
      asUser(users.office, ANLEGEN, [patients.max, ANNA, 'video', TAG, '08:00', '09:00', null]),
    ).rejects.toThrow(/overlaps/);
  });

  /**
   * Alles oder nichts: Wenn eine der beteiligten Personen zu dieser Zeit schon
   * etwas hat, entsteht die Besprechung gar nicht - auch nicht halb.
   */
  it('legt gar nichts an, wenn eine Person nicht kann', async () => {
    await asUserCommitted(users.office, ANLEGEN, [
      patients.max,
      ANNA,
      'video',
      TAG,
      '08:00',
      '09:00',
      null,
    ]);

    await expect(
      asUser(users.office, EREIGNIS, [
        'Teambesprechung',
        [OLIVIA, ANNA],
        'video',
        TAG,
        '08:15',
        '08:45',
        null,
        true,
      ]),
    ).rejects.toThrow(/overlaps/);

    expect(await zeilen()).toHaveLength(0);
  });

  it('verlangt einen Titel', async () => {
    await expect(
      asUser(users.office, EREIGNIS, ['   ', [ANNA], 'video', TAG, '08:00', '08:30', null, true]),
    ).rejects.toThrow(/event title is required/);
  });

  it('verlangt mindestens eine beteiligte Person', async () => {
    await expect(
      asUser(users.office, EREIGNIS, [
        'Teambesprechung',
        [],
        'video',
        TAG,
        '08:00',
        '08:30',
        null,
        true,
      ]),
    ).rejects.toThrow(/at least one participant/);
  });

  it('kennt keinen Hausbesuch ohne Patient:in', async () => {
    await expect(
      asUser(users.office, EREIGNIS, [
        'Teambesprechung',
        [ANNA],
        'home_visit',
        TAG,
        '08:00',
        '08:30',
        null,
        true,
      ]),
    ).rejects.toThrow(/unknown appointment type/);
  });

  it('weist ein Patientenkonto ab', async () => {
    await expect(
      asUser(users.patientMax, EREIGNIS, [
        'Teambesprechung',
        [ANNA],
        'video',
        TAG,
        '08:00',
        '08:30',
        null,
        true,
      ]),
    ).rejects.toThrow(/not allowed to create appointments/);
  });

  it('protokolliert je Zeile ein appointment.created mit der Art', async () => {
    await ereignis({ personen: [ANNA, OLIVIA] });

    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log
        where action = 'appointment.created' and context->>'kind' = 'event'`,
    );
    expect(rows).toHaveLength(2);
    // Kein Personenbezug ueber die Beteiligten hinaus, kein Titel im Log.
    expect(rows[0]?.context).not.toHaveProperty('patient_id');
    expect(rows[0]?.context).not.toHaveProperty('title');
  });
});

describe('Ereignis: Laenge frei, aber im Raster', () => {
  beforeEach(resetDatabase);

  it('laesst eine freie Laenge zu', async () => {
    // 25 Minuten - fuer eine Behandlung unzulaessig, fuer eine Besprechung
    // genau richtig.
    expect(await ereignis({ von: '08:00', bis: '08:25' })).toBe(1);
  });

  it('verlangt den Beginn auf dem Praxisraster', async () => {
    await expect(
      asUser(users.office, EREIGNIS, [
        'Teambesprechung',
        [ANNA],
        'video',
        TAG,
        '08:02',
        '08:30',
        null,
        true,
      ]),
    ).rejects.toThrow(/start time is not on the appointment grid/);
  });

  /**
   * Beim Behandlungstermin genuegt der Beginn, weil die Laenge fest ist. Hier
   * ist sie es nicht - also gehoert auch das Ende auf einen Rasterpunkt.
   */
  it('verlangt auch das Ende auf dem Praxisraster', async () => {
    await expect(
      asUser(users.office, EREIGNIS, [
        'Teambesprechung',
        [ANNA],
        'video',
        TAG,
        '08:00',
        '08:22',
        null,
        true,
      ]),
    ).rejects.toThrow(/end time is not on the appointment grid/);
  });

  it('achtet auf die Arbeitszeit und laesst sich ausdruecklich uebergehen', async () => {
    // 05:00 liegt ausserhalb jeder Arbeitszeit des Seeds.
    await expect(
      asUser(users.office, EREIGNIS, [
        'Teambesprechung',
        [ANNA],
        'video',
        TAG,
        '05:00',
        '05:30',
        null,
        false,
      ]),
    ).rejects.toThrow(/outside_working_hours/);

    expect(await ereignis({ von: '05:00', bis: '05:30', ausserhalbErlaubt: true })).toBe(1);
  });
});

describe('Ereignis: keine Behandlung', () => {
  beforeEach(resetDatabase);

  async function eineZeile(): Promise<{ id: string; updated_at: string }> {
    await ereignis({ personen: [ANNA] });
    const rows = await zeilen();
    return stand(rows[0]!.id as string);
  }

  it('laesst sich nicht abschliessen', async () => {
    const e = await eineZeile();
    await expect(asUser(users.office, ABSCHLIESSEN, [e.id, e.updated_at])).rejects.toThrow(
      /event cannot be completed/,
    );
  });

  it('laesst sich nicht als nicht angetroffen vermerken', async () => {
    const e = await eineZeile();
    await expect(asUser(users.office, NICHT_ANGETROFFEN, [e.id, e.updated_at])).rejects.toThrow(
      /event cannot be recorded as no-show/,
    );
  });

  it('laesst sich nicht dokumentieren', async () => {
    const e = await eineZeile();
    await expect(
      asUser(users.therapist, DOKUMENTIEREN, [e.id, 'Synthetischer Text']),
    ).rejects.toThrow(/event cannot be documented/);
  });

  it('bleibt beim Umplanen eines Tages stehen', async () => {
    await ereignis({ personen: [ANNA], von: '08:00', bis: '08:30' });
    await asUserCommitted(users.office, ANLEGEN, [
      patients.max,
      ANNA,
      'video',
      TAG,
      '09:00',
      '10:00',
      null,
    ]);

    const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, TAG_UMPLANEN, [
      ANNA,
      TAG,
      'practice_request',
    ]);

    // Nur der Behandlungstermin faellt - die Besprechung ist kein Anruf wert.
    expect(rows[0]!.anzahl).toBe(1);
    const rowsDanach = await zeilen();
    expect(rowsDanach[0]).toMatchObject({ status: 'confirmed' });
  });
});

describe('Ereignis: aendern', () => {
  beforeEach(resetDatabase);

  it('laesst sich verschieben, ohne an der Laengenregel zu scheitern', async () => {
    await ereignis({ personen: [ANNA], von: '08:00', bis: '08:25' });
    const rows = await zeilen();
    const e = await stand(rows[0]!.id as string);

    await asUserCommitted(users.office, AENDERN, [
      e.id,
      e.updated_at,
      ANNA,
      'video',
      TAG,
      '10:00',
      '10:25',
      null,
    ]);

    const { rows: danach } = await asPostgres<{ starts_at: string }>(
      "select to_char(starts_at at time zone 'Europe/Berlin', 'HH24:MI') as starts_at from public.appointments where id = $1",
      [e.id],
    );
    expect(danach[0]?.starts_at).toBe('10:00');
  });

  it('laesst ein Ereignis nicht zum Hausbesuch werden', async () => {
    await ereignis({ personen: [ANNA] });
    const rows = await zeilen();
    const e = await stand(rows[0]!.id as string);

    await expect(
      asUser(users.office, AENDERN, [
        e.id,
        e.updated_at,
        ANNA,
        'home_visit',
        TAG,
        '08:00',
        '08:30',
        null,
      ]),
    ).rejects.toThrow(/unknown appointment type/);
  });
});

describe('Ereignis im Lesepfad des Kalenders', () => {
  beforeEach(resetDatabase);

  it('steht mit Titel und ohne Patientennamen in der Liste', async () => {
    await ereignis({ personen: [ANNA], von: '08:00', bis: '08:30' });

    const { rows } = await asUser<Record<string, unknown>>(users.office, LESEN, [
      TAG,
      tagInTagen(96),
    ]);

    const gefunden = rows.find((r) => r.kind === 'event');
    expect(gefunden).toMatchObject({
      kind: 'event',
      title: 'Teambesprechung',
      patient_id: null,
      patient_given_name: null,
      patient_family_name: null,
    });
    // Die behandelnde Person steht weiterhin da - es ist ihr Kalender.
    expect(gefunden?.staff_family_name).toBe('Beispiel');
  });

  it('steht in den offenen Terminen der Person', async () => {
    await ereignis({ personen: [ANNA], von: '08:00', bis: '08:30' });

    const { rows } = await asUser<Record<string, unknown>>(
      users.ownerTherapist,
      'select * from public.list_staff_future_appointments($1::uuid)',
      [ANNA],
    );

    expect(rows.some((r) => r.kind === 'event' && r.title === 'Teambesprechung')).toBe(true);
  });

  it('steht in der Terminsicht der Anwendung', async () => {
    await ereignis({ personen: [ANNA] });

    const { rows } = await asUser<Record<string, unknown>>(
      users.office,
      `select id, kind, title, patient_id from public.appointment_directory
        where kind = 'event' and (starts_at at time zone 'Europe/Berlin')::date = $1::date`,
      [TAG],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'event', title: 'Teambesprechung', patient_id: null });
  });
});

describe('Zwei Terminlaengen (CAL-015b)', () => {
  beforeEach(resetDatabase);

  it('legt einen Termin mit 45 Minuten an', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ANLEGEN, [
      patients.max,
      ANNA,
      'video',
      TAG,
      '13:00',
      '13:45',
      null,
    ]);
    expect(rows[0]?.id).toBeTruthy();
  });

  it('weist eine dritte Laenge weiterhin ab', async () => {
    await expect(
      asUser(users.office, ANLEGEN, [patients.max, ANNA, 'video', TAG, '13:00', '13:30', null]),
    ).rejects.toThrow(/appointment window must be/);
  });

  it('nennt in der Meldung beide zulaessigen Laengen', async () => {
    await expect(
      asUser(users.office, ANLEGEN, [patients.max, ANNA, 'video', TAG, '13:00', '13:30', null]),
    ).rejects.toThrow(/60 or 45/);
  });

  it('laesst einen Bestandstermin mit anderer Laenge organisatorisch aendern', async () => {
    // Direkt eingefuegt: eine Laenge, die der Schreibpfad nicht mehr anlegen
    // wuerde - der Bestandsschutz aus ANN-037 gilt unveraendert.
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, appointment_type, status,
         starts_at, ends_at
       )
       values ($1::uuid, $2::uuid, $3::uuid, 'video', 'confirmed',
               ($4::date + time '15:00') at time zone 'Europe/Berlin',
               ($4::date + time '15:30') at time zone 'Europe/Berlin')
       returning id::text as id`,
      [organizationId, patients.max, ANNA, TAG],
    );
    const bestand = await stand(rows[0]!.id);

    await asUserCommitted(users.office, AENDERN, [
      bestand.id,
      bestand.updated_at,
      TIM,
      'video',
      TAG,
      '15:00',
      '15:30',
      null,
    ]);

    const { rows: danach } = await asPostgres<{ staff_member_id: string }>(
      'select staff_member_id from public.appointments where id = $1',
      [bestand.id],
    );
    expect(danach[0]?.staff_member_id).toBe(TIM);
  });
});

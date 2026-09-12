import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabase,
  testDatabaseUrl,
} from './helpers/db';

const { users, organizationId, patients } = SEED;

// Bewusst MIT Arbeitszeitbestaetigung: diese Datei prueft andere Zusagen und
// benutzt Zeiten ueber den ganzen Tag sowie Kalendertage, die auch auf ein
// Wochenende fallen koennen. Die Arbeitszeitpruefung hat eigene Tests in
// scheduling-rules.test.ts; hier waere sie nur Rauschen (CAL-005).
const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const AENDERN =
  'select public.update_appointment($1::uuid, $2::timestamptz, $3::uuid, $4, $5::date, $6::time, $7::time, $8::uuid, true) as id';
const ABSAGEN = 'select public.cancel_appointment($1::uuid, $2::timestamptz, $3) as id';

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

const LOCATION = '33333333-3333-4333-8333-000000000001';

function tagInTagen(tage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

const TAG = tagInTagen(40);

interface Termin {
  id: string;
  updated_at: string;
}

async function anlegen(opts: {
  patient?: string;
  staff?: string;
  typ?: 'home_visit' | 'practice' | 'video';
  tag?: string;
  von?: string;
  bis?: string;
  ort?: string | null;
  user?: string;
}): Promise<Termin> {
  const typ = opts.typ ?? 'video';
  const { rows } = await asUserCommitted<{ id: string }>(opts.user ?? users.office, ANLEGEN, [
    opts.patient ?? patients.max,
    opts.staff ?? STAFF.anna,
    typ,
    opts.tag ?? TAG,
    opts.von ?? '09:00',
    opts.bis ?? '10:00',
    typ === 'practice' ? (opts.ort ?? LOCATION) : null,
  ]);
  return stand(rows[0]!.id);
}

/** Aktueller Datenbankstand eines Termins, inklusive updated_at als Rohwert. */
async function stand(id: string): Promise<Termin> {
  const { rows } = await asPostgres<{ id: string; updated_at: string }>(
    'select id, to_char(updated_at at time zone \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"+00"\') as updated_at from public.appointments where id = $1',
    [id],
  );
  return rows[0]!;
}

async function zeile(id: string) {
  const { rows } = await asPostgres<Record<string, unknown>>(
    'select * from public.appointments where id = $1',
    [id],
  );
  return rows[0];
}

interface Aenderung {
  staff?: string;
  typ?: 'home_visit' | 'practice' | 'video';
  tag?: string;
  von?: string;
  bis?: string;
  ort?: string | null;
  erwartet?: string;
}

function aendernArgs(termin: Termin, a: Aenderung = {}) {
  const typ = a.typ ?? 'video';
  // 'ort' muss sich ausdruecklich auf null setzen lassen - ein ??-Fallback
  // wuerde genau den Fall verschlucken, der geprueft werden soll.
  const ort = 'ort' in a ? a.ort : typ === 'practice' ? LOCATION : null;
  return [
    termin.id,
    a.erwartet ?? termin.updated_at,
    a.staff ?? STAFF.anna,
    typ,
    a.tag ?? TAG,
    a.von ?? '09:00',
    a.bis ?? '10:00',
    ort,
  ];
}

function aendern(userId: string | null, termin: Termin, a: Aenderung = {}) {
  return asUser<{ id: string }>(userId, AENDERN, aendernArgs(termin, a));
}

function aendernCommitted(userId: string, termin: Termin, a: Aenderung = {}) {
  return asUserCommitted<{ id: string }>(userId, AENDERN, aendernArgs(termin, a));
}

// =============================================================================
// Bearbeitung
// =============================================================================

describe('update_appointment: berechtigte Rollen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('erlaubt %s das Bearbeiten', async (_rolle, userId) => {
    const t = await anlegen({});
    await aendernCommitted(userId, t, { von: '11:00', bis: '12:00' });

    const { rows } = await asPostgres<{ lokal: string }>(
      "select to_char(starts_at at time zone 'Europe/Berlin', 'HH24:MI') as lokal from public.appointments where id = $1",
      [t.id],
    );
    expect(rows[0]?.lokal).toBe('11:00');
  });

  it('weist ein Patientenkonto ab', async () => {
    const t = await anlegen({});
    await expect(aendern(users.patientMax, t, { von: '11:00', bis: '12:00' })).rejects.toThrow(
      /not allowed/,
    );
  });

  it('weist einen Aufruf ohne Sitzung ab', async () => {
    const t = await anlegen({});
    await expect(aendern(null, t, { von: '11:00', bis: '12:00' })).rejects.toThrow(
      /not authenticated|not allowed/,
    );
  });

  it('weist anon ab', async () => {
    const t = await anlegen({});
    await expect(asAnon(AENDERN, aendernArgs(t, { von: '11:00' }))).rejects.toThrow(
      /permission denied|not authenticated/i,
    );
  });

  it('gibt authenticated weiterhin kein direktes UPDATE auf die Tabelle', async () => {
    const t = await anlegen({});
    await expect(
      asUser(users.office, "update public.appointments set status = 'cancelled' where id = $1", [
        t.id,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('update_appointment: Vorgaenge', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('verschiebt einen Termin zeitlich', async () => {
    const t = await anlegen({});
    await aendernCommitted(users.office, t, { tag: tagInTagen(41), von: '14:00', bis: '15:00' });

    const { rows } = await asPostgres<{ tag: string; von: string }>(
      `select to_char(starts_at at time zone 'Europe/Berlin', 'YYYY-MM-DD') as tag,
              to_char(starts_at at time zone 'Europe/Berlin', 'HH24:MI') as von
         from public.appointments where id = $1`,
      [t.id],
    );
    expect(rows[0]).toEqual({ tag: tagInTagen(41), von: '14:00' });
  });

  it('wechselt die behandelnde Person', async () => {
    const t = await anlegen({});
    await aendernCommitted(users.office, t, { staff: STAFF.tim });
    expect((await zeile(t.id))?.staff_member_id).toBe(STAFF.tim);
  });

  it('wechselt von Hausbesuch zu Praxis und entfernt den Adress-Snapshot', async () => {
    const t = await anlegen({ typ: 'home_visit' });
    expect((await zeile(t.id))?.visit_street).toBe('Beispielstrasse');

    await aendernCommitted(users.office, t, { typ: 'practice', ort: LOCATION });

    expect(await zeile(t.id)).toMatchObject({
      appointment_type: 'practice',
      location_id: LOCATION,
      visit_street: null,
      visit_house_number: null,
      visit_postal_code: null,
      visit_city: null,
    });
  });

  it('wechselt von Praxis zu Video und entfernt den Standort', async () => {
    const t = await anlegen({ typ: 'practice' });
    await aendernCommitted(users.office, t, { typ: 'video' });

    expect(await zeile(t.id)).toMatchObject({
      appointment_type: 'video',
      location_id: null,
      visit_street: null,
    });
  });

  it('uebernimmt beim Wechsel zu Hausbesuch die aktuelle Adresse', async () => {
    const t = await anlegen({ typ: 'video' });
    await aendernCommitted(users.office, t, { typ: 'home_visit' });

    expect(await zeile(t.id)).toMatchObject({
      appointment_type: 'home_visit',
      visit_street: 'Beispielstrasse',
      visit_house_number: '12',
      visit_postal_code: '72070',
      visit_city: 'Tuebingen',
      location_id: null,
    });
  });

  it('laesst den Snapshot unveraendert, wenn es ein Hausbesuch bleibt', async () => {
    const t = await anlegen({ typ: 'home_visit' });

    await asUserCommitted(
      users.office,
      'select public.update_patient($1::uuid, $2, $3, $4::date, $5, $6, $7, $8, $9, $10)',
      [
        patients.max,
        'Max',
        'Mustermann',
        '1957-04-30',
        null,
        null,
        'Neuestrasse',
        '99',
        '10115',
        'Berlin',
      ],
    );

    const aktuell = await stand(t.id);
    await aendernCommitted(users.office, aktuell, {
      typ: 'home_visit',
      von: '15:00',
      bis: '16:00',
    });

    // Der Snapshot haelt fest, wohin an diesem Tag gefahren wird.
    expect(await zeile(t.id)).toMatchObject({
      visit_street: 'Beispielstrasse',
      visit_house_number: '12',
    });
  });

  it('weist einen Wechsel zu Hausbesuch ohne vollstaendige Adresse ab', async () => {
    const t = await anlegen({ typ: 'video' });
    await asPostgres(
      'update public.patient_contact_details set house_number = null where patient_id = $1',
      [patients.max],
    );
    try {
      await expect(aendern(users.office, t, { typ: 'home_visit' })).rejects.toThrow(
        /complete patient address/,
      );
    } finally {
      await asPostgres(
        "update public.patient_contact_details set house_number = '12' where patient_id = $1",
        [patients.max],
      );
    }
  });

  it('nimmt weder Patient noch Organisation entgegen', async () => {
    const { rows } = await asPostgres<{ argumente: string }>(
      "select pg_get_function_arguments(oid) as argumente from pg_proc where proname = 'update_appointment'",
    );
    expect(rows[0]?.argumente).not.toMatch(/patient/i);
    expect(rows[0]?.argumente).not.toMatch(/organization/i);
  });

  it('laesst Patient und Organisation unveraendert', async () => {
    const t = await anlegen({});
    await aendernCommitted(users.office, t, { von: '13:00', bis: '14:00' });

    expect(await zeile(t.id)).toMatchObject({
      patient_id: patients.max,
      organization_id: organizationId,
    });
  });

  it('validiert die neuen Werte erneut', async () => {
    const t = await anlegen({});
    await expect(aendern(users.office, t, { von: '10:00', bis: '09:00' })).rejects.toThrow(
      /end time must be after start time/,
    );
    await expect(aendern(users.office, t, { tag: tagInTagen(-1) })).rejects.toThrow(/in the past/);
    await expect(aendern(users.office, t, { staff: STAFF.olivia })).rejects.toThrow(
      /not assignable/,
    );
    await expect(aendern(users.office, t, { typ: 'practice', ort: null })).rejects.toThrow(
      /requires a location/,
    );
    await expect(
      asUser(users.office, AENDERN, [
        t.id,
        t.updated_at,
        STAFF.anna,
        'surgery',
        TAG,
        '09:00',
        '10:00',
        null,
      ]),
    ).rejects.toThrow(/unknown appointment type/);
  });
});

describe('update_appointment: Ueberschneidungen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('verhindert eine Ueberschneidung beim Verschieben', async () => {
    await anlegen({ von: '09:00', bis: '10:00' });
    const zweiter = await anlegen({ patient: patients.erika, von: '11:00', bis: '12:00' });

    await expect(aendern(users.office, zweiter, { von: '09:30', bis: '10:30' })).rejects.toThrow(
      /overlap/,
    );
  });

  it('verhindert eine Ueberschneidung beim Wechsel der behandelnden Person', async () => {
    await anlegen({ staff: STAFF.tim, von: '09:00', bis: '10:00' });
    const zweiter = await anlegen({
      patient: patients.erika,
      staff: STAFF.anna,
      von: '09:00',
      bis: '10:00',
    });

    await expect(aendern(users.office, zweiter, { staff: STAFF.tim })).rejects.toThrow(/overlap/);
  });

  it('schliesst den Termin selbst von der Konfliktpruefung aus', async () => {
    const t = await anlegen({ von: '09:00', bis: '10:00' });
    // Nur die Terminart aendern - die Zeiten bleiben gleich.
    await aendernCommitted(users.office, t, { typ: 'practice', ort: LOCATION });
    expect((await zeile(t.id))?.appointment_type).toBe('practice');
  });

  it('erlaubt das Verschieben direkt an einen fremden Termin heran', async () => {
    await anlegen({ von: '09:00', bis: '10:00' });
    const zweiter = await anlegen({ patient: patients.erika, von: '14:00', bis: '15:00' });

    await aendernCommitted(users.office, zweiter, { von: '10:00', bis: '11:00' });
    const { rows } = await asPostgres<{ lokal: string }>(
      "select to_char(starts_at at time zone 'Europe/Berlin', 'HH24:MI') as lokal from public.appointments where id = $1",
      [zweiter.id],
    );
    expect(rows[0]?.lokal).toBe('10:00');
  });

  it('laesst einen abgesagten Termin den Zeitraum freigeben', async () => {
    const erster = await anlegen({ von: '09:00', bis: '10:00' });
    await asUserCommitted(users.office, ABSAGEN, [erster.id, erster.updated_at, 'other']);

    // Derselbe Zeitraum ist jetzt wieder belegbar.
    const neuer = await anlegen({ patient: patients.erika, von: '09:00', bis: '10:00' });
    expect(await zeile(neuer.id)).toBeDefined();
  });
});

describe('update_appointment: konkurrierende Bearbeitung', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('weist ein Speichern auf veraltetem Stand ab', async () => {
    const t = await anlegen({});
    await aendernCommitted(users.office, t, { von: '11:00', bis: '12:00' });

    // Zweite Person speichert noch mit dem alten updated_at.
    await expect(aendern(users.teamLead, t, { von: '13:00', bis: '14:00' })).rejects.toThrow(
      /changed meanwhile/,
    );
  });

  it('hinterlaesst bei einem Konflikt weder Teilaenderung noch Erfolgsaudit', async () => {
    const t = await anlegen({});
    await aendernCommitted(users.office, t, { staff: STAFF.tim });
    await asPostgres("delete from public.audit_log where action like 'appointment.%'");

    await expect(
      aendern(users.teamLead, t, { staff: STAFF.jannes, von: '16:00', bis: '17:00' }),
    ).rejects.toThrow(/changed meanwhile/);

    // Der Stand der ersten Bearbeitung bleibt unangetastet.
    const { rows } = await asPostgres<{ staff_member_id: string; lokal: string }>(
      `select staff_member_id,
              to_char(starts_at at time zone 'Europe/Berlin', 'HH24:MI') as lokal
         from public.appointments where id = $1`,
      [t.id],
    );
    expect(rows[0]?.staff_member_id).toBe(STAFF.tim);
    expect(rows[0]?.lokal).toBe('09:00');

    const { rows: audits } = await asPostgres<{ anzahl: string }>(
      "select count(*)::text as anzahl from public.audit_log where action like 'appointment.%'",
    );
    expect(audits[0]?.anzahl).toBe('0');
  });

  it('erzeugt bei zwei gleichzeitigen Bearbeitungen kein verlorenes Update', async () => {
    const t = await anlegen({});

    const a = new Client({ connectionString: testDatabaseUrl() });
    const b = new Client({ connectionString: testDatabaseUrl() });
    await a.connect();
    await b.connect();

    async function beginne(c: Client, userId: string) {
      await c.query('begin');
      await c.query("select set_config('role', 'authenticated', true)");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
    }

    try {
      await beginne(a, users.office);
      await beginne(b, users.teamLead);

      // Beide lesen denselben Stand und schreiben darauf.
      await a.query(AENDERN, aendernArgs(t, { staff: STAFF.tim }));
      const zweite = abgefangen(b.query(AENDERN, aendernArgs(t, { staff: STAFF.jannes })));

      await a.query('commit');

      // Die zweite Bearbeitung darf die erste nicht stillschweigend ueberschreiben.
      const fehler = await zweite;
      expect(fehler, 'die zweite Bearbeitung darf nicht gelingen').not.toBeNull();
      expect(fehler?.message).toMatch(/changed meanwhile|could not serialize/i);
      await b.query('rollback').catch(() => undefined);

      expect((await zeile(t.id))?.staff_member_id).toBe(STAFF.tim);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('laesst eine gleichzeitige Absage die Bearbeitung nicht ueberholen', async () => {
    const t = await anlegen({});

    const a = new Client({ connectionString: testDatabaseUrl() });
    const b = new Client({ connectionString: testDatabaseUrl() });
    await a.connect();
    await b.connect();

    async function beginne(c: Client, userId: string) {
      await c.query('begin');
      await c.query("select set_config('role', 'authenticated', true)");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
    }

    try {
      await beginne(a, users.office);
      await beginne(b, users.teamLead);

      // Eine Person sagt ab, die andere bearbeitet - beide auf demselben Stand.
      await a.query(ABSAGEN, [t.id, t.updated_at, 'other']);
      const bearbeitung = abgefangen(
        b.query(AENDERN, aendernArgs(t, { von: '15:00', bis: '16:00' })),
      );

      await a.query('commit');

      const fehler = await bearbeitung;
      expect(fehler, 'die Bearbeitung darf die Absage nicht ueberholen').not.toBeNull();
      expect(fehler?.message).toMatch(/changed meanwhile|cancelled appointment cannot be changed/);
      await b.query('rollback').catch(() => undefined);

      // Die Absage bleibt bestehen, die verworfene Bearbeitung wirkt nicht.
      const z = await zeile(t.id);
      expect(z?.status).toBe('cancelled');
      const { rows } = await asPostgres<{ lokal: string }>(
        "select to_char(starts_at at time zone 'Europe/Berlin', 'HH24:MI') as lokal from public.appointments where id = $1",
        [t.id],
      );
      expect(rows[0]?.lokal).toBe('09:00');
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('laesst zwei gleichzeitige Absagen nicht beide gelingen', async () => {
    const t = await anlegen({});

    const a = new Client({ connectionString: testDatabaseUrl() });
    const b = new Client({ connectionString: testDatabaseUrl() });
    await a.connect();
    await b.connect();

    async function beginne(c: Client, userId: string) {
      await c.query('begin');
      await c.query("select set_config('role', 'authenticated', true)");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
    }

    try {
      await beginne(a, users.office);
      await beginne(b, users.teamLead);

      await a.query(ABSAGEN, [t.id, t.updated_at, 'other']);
      const zweite = abgefangen(b.query(ABSAGEN, [t.id, t.updated_at, 'other']));

      await a.query('commit');

      const fehler = await zweite;
      expect(fehler, 'die zweite Absage darf nicht gelingen').not.toBeNull();
      expect(fehler?.message).toMatch(/changed meanwhile|already cancelled/);
      await b.query('rollback').catch(() => undefined);

      const { rows } = await asPostgres<{ anzahl: string }>(
        "select count(*)::text as anzahl from public.audit_log where action = 'appointment.cancelled' and subject_id = $1",
        [t.id],
      );
      expect(rows[0]?.anzahl).toBe('1');
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('verlangt einen erwarteten Stand', async () => {
    const t = await anlegen({});
    await expect(
      asUser(users.office, AENDERN, [t.id, null, STAFF.anna, 'video', TAG, '09:00', '10:00', null]),
    ).rejects.toThrow(/expected updated_at is required/);
    await expect(asUser(users.office, ABSAGEN, [t.id, null, 'other'])).rejects.toThrow(
      /expected updated_at is required/,
    );
  });
});

describe('update_appointment: Audit', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    await asPostgres('delete from public.audit_log');
  });

  async function ereignisse() {
    const { rows } = await asPostgres<{
      action: string;
      subject_id: string;
      outcome: string;
      context: Record<string, unknown>;
    }>(
      "select * from public.audit_log where action like 'appointment.%' and action <> 'appointment.created' order by occurred_at",
    );
    return rows;
  }

  it('protokolliert eine reine Zeitverschiebung als appointment.rescheduled', async () => {
    const t = await anlegen({});
    await aendernCommitted(users.office, t, { von: '11:00', bis: '12:00' });

    const rows = await ereignisse();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('appointment.rescheduled');
    expect((rows[0]?.context.changed_fields as string[]).sort()).toEqual(['ends_at', 'starts_at']);
  });

  it('protokolliert eine reine organisatorische Aenderung als appointment.updated', async () => {
    const t = await anlegen({});
    await aendernCommitted(users.office, t, { staff: STAFF.tim });

    const rows = await ereignisse();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('appointment.updated');
    expect(rows[0]?.context.changed_fields).toEqual(['staff_member_id']);
  });

  it('erzeugt bei Zeit UND organisatorischer Aenderung genau ein appointment.updated', async () => {
    const t = await anlegen({});
    await aendernCommitted(users.office, t, {
      staff: STAFF.tim,
      typ: 'practice',
      ort: LOCATION,
      von: '11:00',
      bis: '12:00',
    });

    const rows = await ereignisse();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('appointment.updated');
    // Die Zeitfelder sind ueber changed_fields gekennzeichnet.
    expect((rows[0]?.context.changed_fields as string[]).sort()).toEqual(
      ['appointment_type', 'ends_at', 'location_id', 'staff_member_id', 'starts_at'].sort(),
    );
  });

  it('nennt changed_fields exakt und reihenfolgeunabhaengig', async () => {
    const t = await anlegen({ typ: 'practice' });
    await aendernCommitted(users.office, t, { typ: 'video' });

    const felder = (await ereignisse())[0]?.context.changed_fields as string[];
    // appointment_type und der daraus abgeleitete Standort - sonst nichts.
    expect([...felder].sort()).toEqual(['appointment_type', 'location_id']);
    expect(felder).not.toContain('starts_at');
    expect(felder).not.toContain('patient_id');
  });

  it('schreibt bei einem Speichern ohne Aenderung weder Daten noch Audit', async () => {
    const t = await anlegen({ typ: 'practice' });
    const vorher = await zeile(t.id);

    await aendernCommitted(users.office, t, { typ: 'practice', ort: LOCATION });

    expect(await zeile(t.id)).toEqual(vorher);
    expect(await ereignisse()).toHaveLength(0);
  });

  it('kopiert keine Stammdaten und keine konkreten Zeiten in den Kontext', async () => {
    const t = await anlegen({ typ: 'home_visit' });
    await aendernCommitted(users.office, t, { typ: 'home_visit', von: '11:00', bis: '12:00' });

    const kontext = JSON.stringify((await ereignisse())[0]?.context);
    for (const verboten of ['Max', 'Mustermann', 'Beispielstrasse', '72070', '11:00', TAG]) {
      expect(kontext).not.toContain(verboten);
    }
  });

  it('enthaelt ausschliesslich zugelassene Kontextschluessel', async () => {
    const t = await anlegen({});
    await aendernCommitted(users.office, t, { staff: STAFF.tim });

    expect(Object.keys((await ereignisse())[0]!.context).sort()).toEqual(
      [
        'changed_fields',
        'patient_id',
        'staff_member_id',
        'surface',
        'outside_working_hours',
      ].sort(),
    );
  });

  it('haelt den Ereigniskatalog deckungsgleich mit der Anwendung', async () => {
    const { rows } = await asPostgres<{ definition: string }>(
      "select pg_get_constraintdef(oid) as definition from pg_constraint where conname = 'audit_log_action_check'",
    );
    for (const aktion of [
      'appointment.updated',
      'appointment.rescheduled',
      'appointment.cancelled',
    ]) {
      expect(rows[0]?.definition).toContain(aktion);
    }
  });
});

// =============================================================================
// Absage
// =============================================================================

describe('cancel_appointment', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    await asPostgres('delete from public.audit_log');
  });

  function absagen(userId: string | null, t: Termin, erwartet?: string) {
    return asUser<{ id: string }>(userId, ABSAGEN, [t.id, erwartet ?? t.updated_at, 'other']);
  }

  function absagenCommitted(userId: string, t: Termin) {
    return asUserCommitted<{ id: string }>(userId, ABSAGEN, [t.id, t.updated_at, 'other']);
  }

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('erlaubt %s das Absagen', async (_rolle, userId) => {
    const t = await anlegen({});
    await absagenCommitted(userId, t);
    expect((await zeile(t.id))?.status).toBe('cancelled');
  });

  it('haelt Status, Zeitpunkt und Akteur fest', async () => {
    const t = await anlegen({});
    await absagenCommitted(users.teamLead, t);

    const z = await zeile(t.id);
    expect(z?.status).toBe('cancelled');
    expect(z?.cancelled_at).not.toBeNull();
    expect(z?.cancelled_by).toBe(users.teamLead);
  });

  it('loescht nichts', async () => {
    const t = await anlegen({ typ: 'home_visit' });
    await absagenCommitted(users.office, t);

    const z = await zeile(t.id);
    expect(z).toBeDefined();
    // Alle fachlichen Angaben bleiben nachvollziehbar erhalten.
    expect(z).toMatchObject({
      patient_id: patients.max,
      appointment_type: 'home_visit',
      visit_street: 'Beispielstrasse',
    });
  });

  it('protokolliert appointment.cancelled', async () => {
    const t = await anlegen({});
    await absagenCommitted(users.office, t);

    const { rows } = await asPostgres<{
      action: string;
      actor_user_id: string;
      subject_type: string;
      subject_id: string;
      outcome: string;
      context: Record<string, unknown>;
    }>("select * from public.audit_log where action = 'appointment.cancelled'");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: users.office,
      subject_type: 'appointment',
      subject_id: t.id,
      outcome: 'success',
    });
    expect(Object.keys(rows[0]!.context).sort()).toEqual(
      ['patient_id', 'staff_member_id', 'surface'].sort(),
    );
  });

  it('weist eine erneute Absage ab und erzeugt kein Erfolgsaudit', async () => {
    const t = await anlegen({});
    await absagenCommitted(users.office, t);
    await asPostgres("delete from public.audit_log where action = 'appointment.cancelled'");

    const aktuell = await stand(t.id);
    await expect(absagen(users.office, aktuell)).rejects.toThrow(/already cancelled/);

    const { rows } = await asPostgres<{ anzahl: string }>(
      "select count(*)::text as anzahl from public.audit_log where action = 'appointment.cancelled'",
    );
    expect(rows[0]?.anzahl).toBe('0');
  });

  it('laesst einen abgesagten Termin nicht mehr bearbeiten', async () => {
    const t = await anlegen({});
    await absagenCommitted(users.office, t);

    const aktuell = await stand(t.id);
    await expect(aendern(users.office, aktuell, { von: '15:00', bis: '16:00' })).rejects.toThrow(
      /cancelled appointment cannot be changed/,
    );
  });

  it('weist ein Absagen auf veraltetem Stand ab', async () => {
    const t = await anlegen({});
    await aendernCommitted(users.office, t, { von: '11:00', bis: '12:00' });

    await expect(absagen(users.teamLead, t)).rejects.toThrow(/changed meanwhile/);
    expect((await zeile(t.id))?.status).toBe('confirmed');
  });

  it('weist ein Patientenkonto ab', async () => {
    const t = await anlegen({});
    await expect(absagen(users.patientMax, t)).rejects.toThrow(/not allowed/);
  });

  it('weist einen Aufruf ohne Sitzung ab', async () => {
    const t = await anlegen({});
    await expect(absagen(null, t)).rejects.toThrow(/not authenticated|not allowed/);
  });

  it('weist anon ab', async () => {
    const t = await anlegen({});
    await expect(asAnon(ABSAGEN, [t.id, t.updated_at, 'other'])).rejects.toThrow(
      /permission denied|not authenticated/i,
    );
  });

  // Seit CAL-008b traegt die Absage einen Grund (ADR-018 Punkt 6). Die Zusage
  // von CAL-003 bleibt dabei erhalten und wird hier weiter geprueft: Es ist
  // eine codierte Auswahl und kein Freitextfeld, in dem eine
  // Gesundheitsangabe landen koennte (ANN-034).
  it('nimmt nur codierte Absagegruende entgegen, keinen Freitext', async () => {
    const t = await anlegen({ von: '15:00', bis: '16:00' });

    await expect(
      asUser(users.office, ABSAGEN, [t.id, t.updated_at, 'Ruecken war wieder schlimmer']),
    ).rejects.toThrow(/cancellation reason is required/);

    const { rows } = await asPostgres<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint where conname = 'appointments_cancellation_reason_values'`,
    );
    for (const wert of ['patient_request', 'practice_request', 'moved', 'other']) {
      expect(rows[0]?.definition).toContain(`'${wert}'`);
    }
  });

  it('verlangt den Grund und schreibt ohne ihn nichts', async () => {
    const t = await anlegen({ von: '16:00', bis: '17:00' });

    await expect(asUser(users.office, ABSAGEN, [t.id, t.updated_at, null])).rejects.toThrow(
      /cancellation reason is required/,
    );
    expect((await zeile(t.id))?.status).toBe('confirmed');
  });

  it('haelt den Grund an der Zeile fest', async () => {
    const t = await anlegen({ von: '17:00', bis: '18:00' });
    await asUserCommitted(users.office, ABSAGEN, [t.id, t.updated_at, 'patient_request']);

    expect(await zeile(t.id)).toMatchObject({
      status: 'cancelled',
      cancellation_reason: 'patient_request',
    });
  });

  it('schreibt den Grund NICHT ins Auditlog - er laeuft mit der Zeile, nicht mit dem Ereignis', async () => {
    const t = await anlegen({ von: '18:00', bis: '19:00' });
    await asUserCommitted(users.office, ABSAGEN, [t.id, t.updated_at, 'patient_request']);

    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log
        where action = 'appointment.cancelled' and subject_id = $1`,
      [t.id],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]?.context)).not.toContain('patient_request');
  });
});

describe('CAL-003: Mandantentrennung', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000d1';
  const fremderOwner = '11111111-1111-4111-8111-0000000000d1';
  const fremdePerson = '44444444-4444-4444-8444-0000000000d1';
  const fremdePatientPerson = '44444444-4444-4444-8444-0000000000d2';
  const fremderStaff = '55555555-5555-4555-8555-0000000000d1';
  const fremderPatient = '66666666-6666-4666-8666-0000000000d1';

  let fremder: Termin;

  beforeAll(async () => {
    await resetDatabase();

    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderOwner}', 'frida.aendert@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name, time_zone)
        values ('${fremdeOrg}', 'Test Praxis Woanders', 'Europe/Berlin');
      insert into public.persons (id, organization_id, given_name, family_name) values
        ('${fremdePerson}',        '${fremdeOrg}', 'Frida', 'Fremd'),
        ('${fremdePatientPerson}', '${fremdeOrg}', 'Fritz', 'Fremdpatient');
      insert into public.staff_members (id, organization_id, person_id)
        values ('${fremderStaff}', '${fremdeOrg}', '${fremdePerson}');
      insert into public.patients (id, organization_id, person_id, status)
        values ('${fremderPatient}', '${fremdeOrg}', '${fremdePatientPerson}', 'active');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('${fremderOwner}', '${fremdeOrg}', '${fremdePerson}', 'Frida Fremd');
      insert into public.user_roles (user_id, organization_id, role_key) values
        ('${fremderOwner}', '${fremdeOrg}', 'owner'),
        ('${fremderOwner}', '${fremdeOrg}', 'therapist');
    `);

    fremder = await anlegen({
      patient: fremderPatient,
      staff: fremderStaff,
      user: fremderOwner,
    });
  }, 120_000);

  it('laesst den Termin einer fremden Praxis nicht bearbeiten', async () => {
    await expect(aendern(users.office, fremder, { von: '16:00', bis: '17:00' })).rejects.toThrow(
      /appointment not found/,
    );
  });

  it('laesst den Termin einer fremden Praxis nicht absagen', async () => {
    await expect(
      asUser(users.office, ABSAGEN, [fremder.id, fremder.updated_at, 'other']),
    ).rejects.toThrow(/appointment not found/);
  });

  it('erzeugt fuer eine unbekannte und eine fremde Termin-ID dieselbe Meldung', async () => {
    const unbekannt = await aendern(users.office, {
      id: '77777777-7777-4777-8777-00000000ffff',
      updated_at: fremder.updated_at,
    }).catch((e: Error) => e.message);
    const fremd = await aendern(users.office, fremder).catch((e: Error) => e.message);
    expect(unbekannt).toBe(fremd);
  });

  it('laesst den fremden Termin tatsaechlich unveraendert', async () => {
    await aendern(users.office, fremder, { von: '16:00', bis: '17:00' }).catch(() => undefined);
    expect(await zeile(fremder.id)).toMatchObject({
      organization_id: fremdeOrg,
      status: 'confirmed',
    });
  });
});

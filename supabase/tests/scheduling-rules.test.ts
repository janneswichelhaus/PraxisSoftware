import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Praxisraster und Arbeitszeiten (CAL-005).
 *
 * Zwei Pruefungen mit bewusst unterschiedlicher Haerte: das Raster ist eine
 * Grenze, die Arbeitszeit eine Rueckfrage. Beide sind serverseitig - die
 * Oberflaeche kann sie nicht umgehen.
 *
 * Zeiten sind durchgehend Ortszeiten der Praxis. Die Testtage sind bewusst
 * feste Wochentage: ein zufaellig gewaehlter Kalendertag koennte auf ein
 * Wochenende fallen und die Aussage der Tests von der Uhr abhaengig machen.
 */

const { users, organizationId, patients } = SEED;

const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, $8::boolean) as id';
const AENDERN =
  'select public.update_appointment($1::uuid, $2::timestamptz, $3::uuid, $4, $5::date, $6::time, $7::time, $8::uuid, $9::boolean) as id';
const RASTER = 'select public.set_appointment_grid($1::smallint) as minuten';
const WOCHE = 'select public.set_staff_working_hours($1::uuid, $2::smallint, $3::jsonb) as anzahl';
const AUSNAHME =
  'select public.set_staff_working_hour_exception($1::uuid, $2::date, $3::boolean, $4::jsonb) as anzahl';

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

/**
 * Naechster Kalendertag mit dem gewuenschten ISO-Wochentag, mindestens 30 Tage
 * in der Zukunft. Damit liegt jeder Test auf einem bekannten Wochentag.
 */
function naechster(isoWochentag: number, mindestens = 30): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + mindestens);
  while (((d.getUTCDay() + 6) % 7) + 1 !== isoWochentag) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/** Folgetag als `YYYY-MM-DD` - fuer halboffene Abfragefenster. */
function tagNach(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Mittwoch und Samstag - im Seed ein Arbeitstag und ein freier Tag. */
const MITTWOCH = naechster(3);
const SAMSTAG = naechster(6);

interface Termin {
  id: string;
  updated_at: string;
}

async function stand(id: string): Promise<Termin> {
  const { rows } = await asPostgres<{ id: string; updated_at: string }>(
    'select id, to_char(updated_at at time zone \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"+00"\') as updated_at from public.appointments where id = $1',
    [id],
  );
  return rows[0]!;
}

async function anlegen(opts: {
  staff?: string;
  tag?: string;
  von?: string;
  bis?: string;
  bestaetigt?: boolean;
  user?: string;
}): Promise<Termin> {
  const { rows } = await asUserCommitted<{ id: string }>(opts.user ?? users.office, ANLEGEN, [
    patients.max,
    opts.staff ?? STAFF.anna,
    'video',
    opts.tag ?? MITTWOCH,
    opts.von ?? '09:00',
    opts.bis ?? '10:00',
    null,
    opts.bestaetigt ?? false,
  ]);
  return stand(rows[0]!.id);
}

function anlegenVersuch(opts: Parameters<typeof anlegen>[0]) {
  return asUser<{ id: string }>(opts.user ?? users.office, ANLEGEN, [
    patients.max,
    opts.staff ?? STAFF.anna,
    'video',
    opts.tag ?? MITTWOCH,
    opts.von ?? '09:00',
    opts.bis ?? '10:00',
    null,
    opts.bestaetigt ?? false,
  ]);
}

function aendernVersuch(
  termin: Termin,
  opts: {
    staff?: string;
    tag?: string;
    von?: string;
    bis?: string;
    bestaetigt?: boolean;
    user?: string;
  } = {},
) {
  return asUser<{ id: string }>(opts.user ?? users.office, AENDERN, [
    termin.id,
    termin.updated_at,
    opts.staff ?? STAFF.anna,
    'video',
    opts.tag ?? MITTWOCH,
    opts.von ?? '09:00',
    opts.bis ?? '10:00',
    null,
    opts.bestaetigt ?? false,
  ]);
}

async function zeile(id: string) {
  const { rows } = await asPostgres<Record<string, unknown>>(
    'select * from public.appointments where id = $1',
    [id],
  );
  return rows[0];
}

// =============================================================================
// Praxisraster
// =============================================================================

describe('set_appointment_grid', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.audit_log');
    await asPostgres(`update public.organizations set appointment_grid_minutes = 5 where id = $1`, [
      organizationId,
    ]);
  });

  it('startet fuer die bestehende Organisation bei 5 Minuten', async () => {
    // Der Wert kommt aus der Migration, nicht aus dem Seed.
    await resetDatabase();
    const { rows } = await asPostgres<{ appointment_grid_minutes: number }>(
      'select appointment_grid_minutes from public.organizations where id = $1',
      [organizationId],
    );
    expect(rows[0]?.appointment_grid_minutes).toBe(5);
  });

  it.each([[5], [10], [15]])('erlaubt owner den Wert %s', async (minuten) => {
    await asUserCommitted(users.ownerTherapist, RASTER, [minuten]);
    const { rows } = await asPostgres<{ appointment_grid_minutes: number }>(
      'select appointment_grid_minutes from public.organizations where id = $1',
      [organizationId],
    );
    expect(rows[0]?.appointment_grid_minutes).toBe(minuten);
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
    ['Patientenkonto', users.patientMax],
  ])('weist %s ab', async (_wer, userId) => {
    await expect(asUser(userId, RASTER, [15])).rejects.toThrow(
      /not allowed to change the appointment grid/,
    );
  });

  it('weist einen anonymen Zugriff ab', async () => {
    await expect(asAnon(RASTER, [15])).rejects.toThrow(/permission denied|not authenticated/i);
  });

  it.each([[0], [1], [7], [20], [30], [60]])('weist den unzulaessigen Wert %s ab', async (wert) => {
    await expect(asUser(users.ownerTherapist, RASTER, [wert])).rejects.toThrow(
      /unsupported appointment grid/,
    );
  });

  it('haelt die Datenbank-Constraint als zweite Verteidigungslinie', async () => {
    await expect(
      asPostgres('update public.organizations set appointment_grid_minutes = 7 where id = $1', [
        organizationId,
      ]),
    ).rejects.toThrow(/appointment_grid_minutes/);
  });

  it('protokolliert alten und neuen Wert', async () => {
    await asUserCommitted(users.ownerTherapist, RASTER, [15]);

    const { rows } = await asPostgres<{
      action: string;
      subject_type: string;
      context: Record<string, unknown>;
    }>(
      `select action, subject_type, context from public.audit_log
        where action = 'organization.appointment_grid_changed'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject_type).toBe('organization');
    // Ein Minutenraster ist eine organisatorische Einstellung und ausdruecklich
    // kein Gesundheits- oder Stammdatenwert (ADR-010).
    expect(rows[0]?.context).toMatchObject({ previous_minutes: 5, minutes: 15 });
  });

  it('schreibt bei unveraendertem Wert weder Daten noch Audit', async () => {
    await asUserCommitted(users.ownerTherapist, RASTER, [5]);
    const { rows } = await asPostgres(
      `select 1 from public.audit_log where action = 'organization.appointment_grid_changed'`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe('CAL-005: Rasterpruefung beim Schreiben', () => {
  beforeAll(async () => {
    await resetDatabase();
    await asPostgres(
      'update public.organizations set appointment_grid_minutes = 15 where id = $1',
      [organizationId],
    );
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it.each([['09:00'], ['09:15'], ['09:30'], ['09:45']])(
    'nimmt den Beginn %s auf einem 15er-Raster an',
    async (von) => {
      const t = await anlegen({ von, bis: '17:00', bestaetigt: true });
      expect(await zeile(t.id)).toBeDefined();
    },
  );

  it.each([['09:05'], ['09:07'], ['09:10'], ['09:20'], ['09:59']])(
    'weist den Beginn %s ab',
    async (von) => {
      await expect(anlegenVersuch({ von, bis: '17:00', bestaetigt: true })).rejects.toThrow(
        /start time is not on the appointment grid/,
      );
    },
  );

  it('laesst die Dauer frei - nur der Beginn liegt auf dem Raster', async () => {
    // 45 Minuten auf einem 15er-Raster: das Ende faellt hier zufaellig auch
    // aufs Raster, 50 Minuten aber nicht - und muessen trotzdem gehen.
    const t = await anlegen({ von: '09:00', bis: '09:50', bestaetigt: true });
    expect(await zeile(t.id)).toBeDefined();
  });

  it('rechnet gegen Mitternacht der Praxiszeitzone, nicht gegen UTC', async () => {
    // Die meisten Zeitzonen haben einen Versatz, der durch 5, 10 und 15
    // teilbar ist - dort faellt eine UTC-Rechnung gar nicht auf. Asia/Kathmandu
    // liegt 5:45 vor UTC, also 345 Minuten: teilbar durch 15, NICHT durch 10.
    // Auf einem 10er-Raster gehen beide Rechnungen damit auseinander.
    await asPostgres(
      'update public.organizations set appointment_grid_minutes = 10 where id = $1',
      [organizationId],
    );
    await asPostgres("update public.organizations set time_zone = 'Asia/Kathmandu' where id = $1", [
      organizationId,
    ]);

    // 09:00 Ortszeit = 540 Minuten nach Mitternacht -> auf dem Raster.
    // Derselbe Zeitpunkt ist 03:15 UTC = 195 Minuten -> waere abgewiesen.
    const angenommen = await anlegen({ von: '09:00', bis: '10:00', bestaetigt: true });
    expect(await zeile(angenommen.id)).toBeDefined();

    // Und die Gegenprobe: 09:05 Ortszeit = 545 Minuten -> nicht auf dem
    // Raster. In UTC waere es 03:20 = 200 Minuten und damit zulaessig.
    await expect(anlegenVersuch({ von: '09:05', bis: '10:05', bestaetigt: true })).rejects.toThrow(
      /start time is not on the appointment grid/,
    );

    await asPostgres("update public.organizations set time_zone = 'Europe/Berlin' where id = $1", [
      organizationId,
    ]);
    await asPostgres(
      'update public.organizations set appointment_grid_minutes = 15 where id = $1',
      [organizationId],
    );
  });

  it('laesst einen bestehenden Termin ausserhalb des Rasters bestehen', async () => {
    // Angelegt auf einem feinen Raster, danach wird das Raster verschaerft.
    await asPostgres('update public.organizations set appointment_grid_minutes = 5 where id = $1', [
      organizationId,
    ]);
    const t = await anlegen({ von: '09:05', bis: '09:50', bestaetigt: true });
    await asPostgres(
      'update public.organizations set appointment_grid_minutes = 15 where id = $1',
      [organizationId],
    );

    // Sichtbar bleibt er ...
    const { rows } = await asUser<{ id: string }>(
      users.office,
      'select id from public.list_appointments($1::date, $2::date)',
      [MITTWOCH, tagNach(MITTWOCH)],
    );
    expect(rows.map((r) => r.id)).toContain(t.id);

    // ... und organisatorisch aenderbar, solange der Beginn bleibt.
    await asUserCommitted(users.office, AENDERN, [
      t.id,
      t.updated_at,
      STAFF.tim,
      'video',
      MITTWOCH,
      '09:05',
      '09:50',
      null,
      true,
    ]);
    expect(await zeile(t.id)).toMatchObject({ staff_member_id: STAFF.tim });
  });

  it('verlangt fuer einen GEAENDERTEN Beginn das aktuelle Raster', async () => {
    const t = await anlegen({ von: '09:00', bis: '10:00', bestaetigt: true });
    await expect(
      aendernVersuch(t, { von: '09:05', bis: '10:05', bestaetigt: true }),
    ).rejects.toThrow(/start time is not on the appointment grid/);
  });

  it('laesst sich durch die Arbeitszeitbestaetigung nicht umgehen', async () => {
    // Die Bestaetigung gilt ausschliesslich der Arbeitszeit.
    await expect(anlegenVersuch({ von: '09:07', bis: '10:00', bestaetigt: true })).rejects.toThrow(
      /start time is not on the appointment grid/,
    );
  });
});

// =============================================================================
// Arbeitszeiten pflegen
// =============================================================================

describe('set_staff_working_hours', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.staff_working_hours');
  });

  async function bloecke(staff: string, weekday: number) {
    const { rows } = await asPostgres<{ starts_at: string; ends_at: string }>(
      `select to_char(starts_at, 'HH24:MI') as starts_at, to_char(ends_at, 'HH24:MI') as ends_at
         from public.staff_working_hours
        where staff_member_id = $1 and weekday = $2
        order by starts_at`,
      [staff, weekday],
    );
    return rows.map((r) => `${r.starts_at}-${r.ends_at}`);
  }

  it.each([
    ['owner', users.ownerTherapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('erlaubt %s die Pflege', async (_rolle, userId) => {
    await asUserCommitted(userId, WOCHE, [
      STAFF.anna,
      1,
      JSON.stringify([{ von: '08:00', bis: '12:00' }]),
    ]);
    expect(await bloecke(STAFF.anna, 1)).toEqual(['08:00-12:00']);
  });

  it('weist therapist ab - Lesen ja, Pflegen nein', async () => {
    await expect(
      asUser(users.therapist, WOCHE, [
        STAFF.anna,
        1,
        JSON.stringify([{ von: '08:00', bis: '12:00' }]),
      ]),
    ).rejects.toThrow(/not allowed to manage working hours/);
  });

  it('weist ein Patientenkonto ab', async () => {
    await expect(
      asUser(users.patientMax, WOCHE, [STAFF.anna, 1, JSON.stringify([])]),
    ).rejects.toThrow(/not allowed to manage working hours/);
  });

  it('weist einen anonymen Zugriff ab', async () => {
    await expect(asAnon(WOCHE, [STAFF.anna, 1, JSON.stringify([])])).rejects.toThrow(
      /permission denied|not authenticated/i,
    );
  });

  it('erlaubt mehrere Bloecke am selben Wochentag', async () => {
    await asUserCommitted(users.office, WOCHE, [
      STAFF.anna,
      2,
      JSON.stringify([
        { von: '08:00', bis: '12:00' },
        { von: '13:00', bis: '17:00' },
      ]),
    ]);
    expect(await bloecke(STAFF.anna, 2)).toEqual(['08:00-12:00', '13:00-17:00']);
  });

  it('erlaubt angrenzende Bloecke', async () => {
    await asUserCommitted(users.office, WOCHE, [
      STAFF.anna,
      2,
      JSON.stringify([
        { von: '08:00', bis: '12:00' },
        { von: '12:00', bis: '16:00' },
      ]),
    ]);
    expect(await bloecke(STAFF.anna, 2)).toHaveLength(2);
  });

  it('weist ueberschneidende Bloecke derselben Person ab', async () => {
    await expect(
      asUser(users.office, WOCHE, [
        STAFF.anna,
        2,
        JSON.stringify([
          { von: '08:00', bis: '12:00' },
          { von: '11:00', bis: '16:00' },
        ]),
      ]),
    ).rejects.toThrow(/working hours overlap/);
  });

  it('weist ein Ende vor dem Beginn ab', async () => {
    await expect(
      asUser(users.office, WOCHE, [
        STAFF.anna,
        2,
        JSON.stringify([{ von: '12:00', bis: '08:00' }]),
      ]),
    ).rejects.toThrow(/working hour block is invalid/);
  });

  it.each([[0], [8], [-1]])('weist den Wochentag %s ab', async (tag) => {
    await expect(
      asUser(users.office, WOCHE, [STAFF.anna, tag, JSON.stringify([])]),
    ).rejects.toThrow(/weekday must be between 1 and 7/);
  });

  it.each([
    ['kaputte Uhrzeit', [{ von: 'morgens', bis: '12:00' }]],
    ['fehlender Schluessel', [{ von: '08:00' }]],
    ['kein Objekt', ['08:00-12:00']],
  ])('weist %s als Eingabefehler ab', async (_was, bloeckeRoh) => {
    await expect(
      asUser(users.office, WOCHE, [STAFF.anna, 2, JSON.stringify(bloeckeRoh)]),
    ).rejects.toThrow(/working hour block is invalid/);
  });

  it('weist etwas anderes als ein Array ab', async () => {
    await expect(
      asUser(users.office, WOCHE, [STAFF.anna, 2, JSON.stringify({ von: '08:00' })]),
    ).rejects.toThrow(/blocks must be an array/);
  });

  it('ersetzt den Wochentag vollstaendig', async () => {
    await asUserCommitted(users.office, WOCHE, [
      STAFF.anna,
      3,
      JSON.stringify([
        { von: '08:00', bis: '12:00' },
        { von: '13:00', bis: '17:00' },
      ]),
    ]);
    await asUserCommitted(users.office, WOCHE, [
      STAFF.anna,
      3,
      JSON.stringify([{ von: '10:00', bis: '14:00' }]),
    ]);
    expect(await bloecke(STAFF.anna, 3)).toEqual(['10:00-14:00']);
  });

  it('loescht den Wochentag bei einem leeren Array', async () => {
    await asUserCommitted(users.office, WOCHE, [
      STAFF.anna,
      3,
      JSON.stringify([{ von: '08:00', bis: '12:00' }]),
    ]);
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 3, JSON.stringify([])]);
    expect(await bloecke(STAFF.anna, 3)).toEqual([]);
  });

  it('laesst eine Person ausserhalb der eigenen Praxis nicht pflegen', async () => {
    await expect(
      asUser(users.office, WOCHE, [
        '55555555-5555-4555-8555-0000000000ff',
        1,
        JSON.stringify([{ von: '08:00', bis: '12:00' }]),
      ]),
    ).rejects.toThrow(/staff member not assignable/);
  });

  it('laesst eine nicht behandelnde Person nicht pflegen', async () => {
    // Olivia ist office und behandelt nicht - fuer sie gibt es keinen
    // Behandlungsplan.
    await expect(
      asUser(users.office, WOCHE, [
        STAFF.olivia,
        1,
        JSON.stringify([{ von: '08:00', bis: '12:00' }]),
      ]),
    ).rejects.toThrow(/staff member not assignable/);
  });
});

describe('set_staff_working_hour_exception', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.staff_working_hour_exceptions');
  });

  async function tag(staff: string, datum: string) {
    const { rows } = await asPostgres<{ kind: string; starts_at: string | null }>(
      `select kind, to_char(starts_at, 'HH24:MI') as starts_at
         from public.staff_working_hour_exceptions
        where staff_member_id = $1 and on_date = $2
        order by starts_at nulls first`,
      [staff, datum],
    );
    return rows.map((r) => `${r.kind}${r.starts_at ? `:${r.starts_at}` : ''}`);
  }

  it('haelt eine vollstaendige Nichtverfuegbarkeit fest', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, MITTWOCH, true, JSON.stringify([])]);
    expect(await tag(STAFF.anna, MITTWOCH)).toEqual(['unavailable']);
  });

  it('haelt abweichende Bloecke fest', async () => {
    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      MITTWOCH,
      false,
      JSON.stringify([
        { von: '07:00', bis: '09:00' },
        { von: '18:00', bis: '20:00' },
      ]),
    ]);
    expect(await tag(STAFF.anna, MITTWOCH)).toEqual(['block:07:00', 'block:18:00']);
  });

  it('laesst Nichtverfuegbarkeit und Bloecke am selben Tag nicht zu', async () => {
    await expect(
      asUser(users.office, AUSNAHME, [
        STAFF.anna,
        MITTWOCH,
        true,
        JSON.stringify([{ von: '10:00', bis: '12:00' }]),
      ]),
    ).rejects.toThrow(/an unavailable day cannot have blocks/);
  });

  it('haelt die Constraint als zweite Verteidigungslinie', async () => {
    // Direkt an der RPC vorbei: die Datenbank selbst verhindert die Mischung.
    await asPostgres(
      `insert into public.staff_working_hour_exceptions
         (organization_id, staff_member_id, on_date, kind)
       values ($1, $2, $3, 'unavailable')`,
      [organizationId, STAFF.anna, MITTWOCH],
    );
    await expect(
      asPostgres(
        `insert into public.staff_working_hour_exceptions
           (organization_id, staff_member_id, on_date, kind, starts_at, ends_at)
         values ($1, $2, $3, 'block', '10:00', '12:00')`,
        [organizationId, STAFF.anna, MITTWOCH],
      ),
    ).rejects.toThrow(/staff_working_hour_exceptions_no_overlap/);
  });

  it('weist ueberschneidende Bloecke am selben Tag ab', async () => {
    await expect(
      asUser(users.office, AUSNAHME, [
        STAFF.anna,
        MITTWOCH,
        false,
        JSON.stringify([
          { von: '07:00', bis: '10:00' },
          { von: '09:00', bis: '11:00' },
        ]),
      ]),
    ).rejects.toThrow(/working hours overlap/);
  });

  it('entfernt die Abweichung, wenn weder Abwesenheit noch Bloecke kommen', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, MITTWOCH, true, JSON.stringify([])]);
    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      MITTWOCH,
      false,
      JSON.stringify([]),
    ]);
    expect(await tag(STAFF.anna, MITTWOCH)).toEqual([]);
  });

  it('weist therapist ab', async () => {
    await expect(
      asUser(users.therapist, AUSNAHME, [STAFF.anna, MITTWOCH, true, JSON.stringify([])]),
    ).rejects.toThrow(/not allowed to manage working hours/);
  });
});

// =============================================================================
// Lesepfad und Mandantentrennung
// =============================================================================

describe('CAL-005: Lesepfad der Arbeitszeiten', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('laesst Praxisrollen den Wochenplan lesen', async () => {
    for (const userId of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
      const { rows } = await asUser<{ anzahl: string }>(
        userId,
        'select count(*) as anzahl from public.staff_working_hours',
      );
      expect(Number(rows[0]?.anzahl), `Rolle ${userId}`).toBeGreaterThan(0);
    }
  });

  it('gibt einem Patientenkonto keine Arbeitszeiten', async () => {
    const { rows } = await asUser<{ anzahl: string }>(
      users.patientMax,
      'select count(*) as anzahl from public.staff_working_hours',
    );
    expect(Number(rows[0]?.anzahl)).toBe(0);
  });

  it('gibt anon keinen Zugriff', async () => {
    await expect(asAnon('select count(*) from public.staff_working_hours')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('gibt authenticated auf beiden Tabellen nur SELECT', async () => {
    const { rows } = await asPostgres<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('staff_working_hours', 'staff_working_hour_exceptions')
          and grantee = 'authenticated'
        order by table_name, privilege_type`,
    );
    expect(rows.map((r) => `${r.table_name}:${r.privilege_type}`)).toEqual([
      'staff_working_hour_exceptions:SELECT',
      'staff_working_hours:SELECT',
    ]);
  });

  it('gibt authenticated kein EXECUTE auf die Abdeckungspruefung', async () => {
    // Die Funktion nimmt Organisation und Person entgegen und waere sonst ein
    // Orakel ueber fremde Praxen.
    const { rows } = await asPostgres<{ erlaubt: boolean }>(
      `select has_function_privilege('authenticated',
                'app.is_within_working_hours(uuid, uuid, date, time, time)', 'EXECUTE') as erlaubt`,
    );
    expect(rows[0]?.erlaubt).toBe(false);
  });
});

// =============================================================================
// Arbeitszeitpruefung beim Planen
// =============================================================================

describe('CAL-005: Warnung ausserhalb der Arbeitszeit', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    await asPostgres('delete from public.staff_working_hour_exceptions');
    await asPostgres('delete from public.audit_log');
  });

  it('nimmt einen Termin innerhalb der Arbeitszeit ohne Bestaetigung an', async () => {
    // Seed: Montag bis Freitag 08:00-12:00 und 13:00-18:00.
    const t = await anlegen({ von: '09:00', bis: '10:00' });
    expect(await zeile(t.id)).toBeDefined();
  });

  it('weist einen Termin ausserhalb der Arbeitszeit zunaechst ab', async () => {
    await expect(anlegenVersuch({ von: '19:00', bis: '20:00' })).rejects.toThrow(
      /outside_working_hours/,
    );
  });

  it('legt denselben Termin mit ausdruecklicher Bestaetigung an', async () => {
    const t = await anlegen({ von: '19:00', bis: '20:00', bestaetigt: true });
    expect(await zeile(t.id)).toMatchObject({ status: 'scheduled' });
  });

  it('behandelt einen Tag ohne hinterlegte Arbeitszeit als ausserhalb', async () => {
    // Samstag steht im Seed nicht - das ist keine Zusage, dass Zeit ist.
    await expect(anlegenVersuch({ tag: SAMSTAG, von: '09:00', bis: '10:00' })).rejects.toThrow(
      /outside_working_hours/,
    );
  });

  it('behandelt eine Person ganz ohne Arbeitszeiten als ausserhalb', async () => {
    await asPostgres('delete from public.staff_working_hours where staff_member_id = $1', [
      STAFF.tim,
    ]);
    await expect(anlegenVersuch({ staff: STAFF.tim, von: '09:00', bis: '10:00' })).rejects.toThrow(
      /outside_working_hours/,
    );
  });

  it('weist einen Termin ab, der nur teilweise in der Arbeitszeit liegt', async () => {
    // 11:00-13:00 ragt in die Mittagspause hinein.
    await expect(anlegenVersuch({ von: '11:00', bis: '13:00' })).rejects.toThrow(
      /outside_working_hours/,
    );
  });

  it('nimmt einen Termin ueber zwei angrenzende Bloecke hinweg an', async () => {
    await asUserCommitted(users.office, WOCHE, [
      STAFF.anna,
      3,
      JSON.stringify([
        { von: '08:00', bis: '12:00' },
        { von: '12:00', bis: '18:00' },
      ]),
    ]);
    const t = await anlegen({ von: '11:30', bis: '12:30' });
    expect(await zeile(t.id)).toBeDefined();
  });

  it('nimmt einen Termin genau an den Blockgrenzen an', async () => {
    const t = await anlegen({ von: '08:00', bis: '12:00' });
    expect(await zeile(t.id)).toBeDefined();
  });

  it('beachtet eine datumsbezogene Abwesenheit vor dem Wochenplan', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, MITTWOCH, true, JSON.stringify([])]);
    await expect(anlegenVersuch({ von: '09:00', bis: '10:00' })).rejects.toThrow(
      /outside_working_hours/,
    );
  });

  it('ersetzt den Wochenplan durch abweichende Bloecke, statt sie zu ergaenzen', async () => {
    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      MITTWOCH,
      false,
      JSON.stringify([{ von: '18:00', bis: '20:00' }]),
    ]);

    // Der abweichende Block gilt ...
    const t = await anlegen({ von: '18:00', bis: '19:00' });
    expect(await zeile(t.id)).toBeDefined();

    // ... und der Wochenplan gilt an diesem Tag NICHT mehr.
    await expect(anlegenVersuch({ von: '09:00', bis: '10:00' })).rejects.toThrow(
      /outside_working_hours/,
    );
  });

  it('warnt auch beim Verschieben in eine Randzeit', async () => {
    const t = await anlegen({ von: '09:00', bis: '10:00' });
    await expect(aendernVersuch(t, { von: '19:00', bis: '20:00' })).rejects.toThrow(
      /outside_working_hours/,
    );
    expect(await zeile(t.id)).toMatchObject({ staff_member_id: STAFF.anna });
  });

  it('warnt beim Wechsel auf eine Person ohne passende Arbeitszeit', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.tim, 3, JSON.stringify([])]);
    const t = await anlegen({ von: '09:00', bis: '10:00' });

    await expect(aendernVersuch(t, { staff: STAFF.tim })).rejects.toThrow(/outside_working_hours/);
  });

  it('warnt NICHT bei einer rein organisatorischen Aenderung', async () => {
    // Ein Bestandstermin ausserhalb der Arbeitszeit soll nicht bei jeder
    // Kleinigkeit erneut zur Rueckfrage zwingen.
    const t = await anlegen({ von: '19:00', bis: '20:00', bestaetigt: true });
    await asUserCommitted(users.office, AENDERN, [
      t.id,
      t.updated_at,
      STAFF.anna,
      'practice',
      MITTWOCH,
      '19:00',
      '20:00',
      '33333333-3333-4333-8333-000000000001',
      false,
    ]);
    expect(await zeile(t.id)).toMatchObject({ appointment_type: 'practice' });
  });
});

describe('CAL-005: Grenzen der Bestaetigung', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    await asPostgres('delete from public.audit_log');
  });

  it('umgeht den Ueberschneidungsschutz nicht', async () => {
    await anlegen({ von: '19:00', bis: '20:00', bestaetigt: true });
    await expect(anlegenVersuch({ von: '19:30', bis: '20:30', bestaetigt: true })).rejects.toThrow(
      /appointment overlaps an existing one/,
    );
  });

  it('umgeht die Rollenpruefung nicht', async () => {
    await expect(
      anlegenVersuch({ von: '19:00', bis: '20:00', bestaetigt: true, user: users.patientMax }),
    ).rejects.toThrow(/not allowed to create appointments/);
  });

  it('umgeht die Organisationsgrenze nicht', async () => {
    await expect(
      anlegenVersuch({
        staff: '55555555-5555-4555-8555-0000000000ff',
        von: '19:00',
        bis: '20:00',
        bestaetigt: true,
      }),
    ).rejects.toThrow(/staff member not assignable/);
  });

  it('umgeht Optimistic Concurrency nicht', async () => {
    const t = await anlegen({ von: '09:00', bis: '10:00' });
    await expect(
      asUser(users.office, AENDERN, [
        t.id,
        '2020-01-01T00:00:00+00',
        STAFF.anna,
        'video',
        MITTWOCH,
        '19:00',
        '20:00',
        null,
        true,
      ]),
    ).rejects.toThrow(/appointment was changed meanwhile/);
  });

  it('umgeht einen vergangenen Kalendertag nicht', async () => {
    await expect(
      anlegenVersuch({ tag: '2020-01-01', von: '19:00', bis: '20:00', bestaetigt: true }),
    ).rejects.toThrow(/appointment date is in the past/);
  });

  it('erzeugt bei der ersten, abgewiesenen Anfrage weder Termin noch Audit', async () => {
    await anlegenVersuch({ von: '19:00', bis: '20:00' }).catch(() => undefined);

    const termine = await asPostgres('select 1 from public.appointments');
    const audit = await asPostgres(
      `select 1 from public.audit_log where action = 'appointment.created'`,
    );
    expect(termine.rows).toHaveLength(0);
    expect(audit.rows).toHaveLength(0);
  });

  it('vermerkt die Bestaetigung im Audit', async () => {
    await anlegen({ von: '19:00', bis: '20:00', bestaetigt: true });

    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log where action = 'appointment.created'`,
    );
    expect(rows[0]?.context).toMatchObject({ outside_working_hours: true });
    // Weiterhin keine konkrete Terminzeit im Kontext (ADR-010).
    expect(JSON.stringify(rows[0]?.context)).not.toMatch(/\d{2}:\d{2}/);
  });

  it('vermerkt einen Termin innerhalb der Arbeitszeit als nicht bestaetigt', async () => {
    await anlegen({ von: '09:00', bis: '10:00' });

    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log where action = 'appointment.created'`,
    );
    expect(rows[0]?.context).toMatchObject({ outside_working_hours: false });
  });
});

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Arbeitszeiten und das Auditlog (CAL-005, Nachtrag; LOG-EPIC-001, ANN-230).
 *
 * Seit LOG-EPIC-001 gilt: Das Datenmodell ist der Nachweis, das Auditlog
 * haelt nur, was das Datenmodell nicht zeigt. Wochenarbeitszeit und
 * Abweichungen schreiben deshalb keinen Auditeintrag mehr; wer sie angelegt
 * hat, steht am Datensatz (created_by/created_at). Wer eine Arbeitszeit
 * aendert oder leert, zeigt das Datenmodell nicht - eine bewusst
 * hingenommene Luecke.
 *
 * Geprueft wird: kein Erfolgsaudit in keinem Fall, die Ereignisnamen sind
 * aus dem Katalog verschwunden, und die fachlichen Zusagen bleiben - ein
 * No-op schreibt nichts, ein abgewiesener Aufruf hinterlaesst keine halbe
 * Fachaenderung, fremde Praxen bleiben getrennt.
 */

const { users, organizationId } = SEED;

const WOCHE = 'select public.set_staff_working_hours($1::uuid, $2::smallint, $3::jsonb) as anzahl';
const AUSNAHME =
  'select public.set_staff_working_hour_exception($1::uuid, $2::date, $3::boolean, $4::jsonb) as anzahl';

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

/** Fester Kalendertag - die Abweichungen haengen nicht an der Uhr. */
const TAG = '2027-06-01';

/** Die mit LOG-EPIC-001 entfallenen Arbeitszeitereignisse. */
const ENTFALLEN = [
  'staff_working_hours.created',
  'staff_working_hours.updated',
  'staff_working_hours.removed',
  'staff_working_hour_exception.created',
  'staff_working_hour_exception.updated',
  'staff_working_hour_exception.removed',
] as const;

/** Alle erfolgreichen Auditeintraege seit dem letzten Leeren des Auditlogs. */
async function erfolge(): Promise<string[]> {
  const { rows } = await asPostgres<{ action: string }>(
    `select action from public.audit_log where outcome = 'success' order by occurred_at, action`,
  );
  return rows.map((r) => r.action);
}

interface Wochenzeile {
  id: string;
  organization_id: string;
  created_by: string | null;
  created_at: Date | null;
}

async function woche(staffId: string, weekday: number): Promise<Wochenzeile[]> {
  const { rows } = await asPostgres<Wochenzeile>(
    `select id, organization_id, created_by, created_at from public.staff_working_hours
      where staff_member_id = $1 and weekday = $2 order by starts_at`,
    [staffId, weekday],
  );
  return rows;
}

interface Abweichung {
  kind: string;
  organization_id: string;
  created_by: string | null;
  created_at: Date | null;
}

async function abweichungen(staffId: string): Promise<Abweichung[]> {
  const { rows } = await asPostgres<Abweichung>(
    `select kind, organization_id, created_by, created_at
       from public.staff_working_hour_exceptions
      where staff_member_id = $1 and on_date = $2 order by starts_at nulls first`,
    [staffId, TAG],
  );
  return rows;
}

function bloecke(...paare: [string, string][]): string {
  return JSON.stringify(paare.map(([von, bis]) => ({ von, bis })));
}

// =============================================================================
// Wochenarbeitszeit
// =============================================================================

describe('Wochenarbeitszeit: Nachweis am Datensatz (LOG-EPIC-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.staff_working_hours');
    await asPostgres('delete from public.audit_log');
  });

  it('schreibt beim Anlegen keinen Auditeintrag', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    expect(await woche(STAFF.anna, 1)).toHaveLength(1);
    expect(await erfolge()).toEqual([]);
  });

  it('schreibt beim Aendern keinen Auditeintrag', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    await asUserCommitted(users.office, WOCHE, [
      STAFF.anna,
      1,
      bloecke(['08:00', '12:00'], ['13:00', '18:00']),
    ]);
    expect(await woche(STAFF.anna, 1)).toHaveLength(2);
    expect(await erfolge()).toEqual([]);
  });

  it('schreibt beim Leeren keinen Auditeintrag', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, '[]']);
    expect(await woche(STAFF.anna, 1)).toEqual([]);
    expect(await erfolge()).toEqual([]);
  });

  it('haelt Akteur und Organisation am Datensatz fest', async () => {
    await asUserCommitted(users.teamLead, WOCHE, [STAFF.tim, 3, bloecke(['09:00', '15:00'])]);

    const zeilen = await woche(STAFF.tim, 3);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({
      organization_id: organizationId,
      created_by: users.teamLead,
    });
    expect(zeilen[0]!.created_at).not.toBeNull();
  });

  it('laesst bei einem No-op die Datensaetze unberuehrt', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    const vorher = await woche(STAFF.anna, 1);

    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    // Nicht einmal neu geschrieben: dieselben Datensaetze.
    expect((await woche(STAFF.anna, 1)).map((r) => r.id)).toEqual(vorher.map((r) => r.id));
    expect(await erfolge()).toEqual([]);
  });

  it('schreibt bei einem leeren No-op nichts', async () => {
    // Nichts entfernen, wo nichts ist.
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 5, '[]']);
    expect(await woche(STAFF.anna, 5)).toEqual([]);
    expect(await erfolge()).toEqual([]);
  });
});

// =============================================================================
// Datumsbezogene Abweichung
// =============================================================================

describe('Arbeitszeitabweichung: Nachweis am Datensatz (LOG-EPIC-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.staff_working_hour_exceptions');
    await asPostgres('delete from public.audit_log');
  });

  it('schreibt beim Anlegen abweichender Bloecke keinen Auditeintrag', async () => {
    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      TAG,
      false,
      bloecke(['18:00', '20:00']),
    ]);
    expect((await abweichungen(STAFF.anna)).map((a) => a.kind)).toEqual(['block']);
    expect(await erfolge()).toEqual([]);
  });

  it('schreibt bei einer vollstaendigen Nichtverfuegbarkeit keinen Auditeintrag', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, true, '[]']);
    expect((await abweichungen(STAFF.anna)).map((a) => a.kind)).toEqual(['unavailable']);
    expect(await erfolge()).toEqual([]);
  });

  it('schreibt beim Wechsel von Bloecken zu Abwesenheit keinen Auditeintrag', async () => {
    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      TAG,
      false,
      bloecke(['18:00', '20:00']),
    ]);
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, true, '[]']);
    expect((await abweichungen(STAFF.anna)).map((a) => a.kind)).toEqual(['unavailable']);
    expect(await erfolge()).toEqual([]);
  });

  it('schreibt bei geaenderten Bloecken keinen Auditeintrag', async () => {
    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      TAG,
      false,
      bloecke(['18:00', '20:00']),
    ]);
    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      TAG,
      false,
      bloecke(['07:00', '09:00'], ['18:00', '20:00']),
    ]);
    expect((await abweichungen(STAFF.anna)).map((a) => a.kind)).toEqual(['block', 'block']);
    expect(await erfolge()).toEqual([]);
  });

  it('schreibt bei der wirksamen Aufhebung keinen Auditeintrag', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, true, '[]']);

    // Weder Abwesenheit noch Bloecke: ab jetzt gilt wieder der Wochenplan.
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, false, '[]']);
    expect(await abweichungen(STAFF.anna)).toEqual([]);
    expect(await erfolge()).toEqual([]);
  });

  it('haelt Akteur und Organisation am Datensatz fest', async () => {
    await asUserCommitted(users.ownerTherapist, AUSNAHME, [STAFF.tim, TAG, true, '[]']);

    const zeilen = await abweichungen(STAFF.tim);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({
      organization_id: organizationId,
      created_by: users.ownerTherapist,
    });
    expect(zeilen[0]!.created_at).not.toBeNull();
  });

  it('schreibt bei unveraendertem Stand nichts', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, true, '[]']);
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, true, '[]']);
    expect(await abweichungen(STAFF.anna)).toHaveLength(1);
    expect(await erfolge()).toEqual([]);
  });

  it('schreibt beim Aufheben einer nicht vorhandenen Abweichung nichts', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, false, '[]']);
    expect(await abweichungen(STAFF.anna)).toEqual([]);
    expect(await erfolge()).toEqual([]);
  });
});

// =============================================================================
// Abgewiesene Vorgaenge
// =============================================================================

describe('Abgewiesene Arbeitszeitvorgaenge', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.staff_working_hours');
    await asPostgres('delete from public.staff_working_hour_exceptions');
    await asPostgres('delete from public.audit_log');
  });

  it.each([
    ['therapist', users.therapist],
    ['Patientenkonto', users.patientMax],
  ])('erzeugt fuer %s kein Erfolgsaudit', async (_wer, userId) => {
    await asUser(userId, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]).catch(
      () => undefined,
    );
    expect(await erfolge()).toEqual([]);
  });

  it('hinterlaesst bei ueberschneidenden Bloecken weder Daten noch Erfolgsaudit', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    await asPostgres('delete from public.audit_log');

    await asUser(users.office, WOCHE, [
      STAFF.anna,
      1,
      bloecke(['08:00', '12:00'], ['11:00', '16:00']),
    ]).catch(() => undefined);

    // Der bestehende Stand ist unberuehrt - keine halbe Fachaenderung.
    const { rows } = await asPostgres<{ anzahl: string }>(
      'select count(*)::text as anzahl from public.staff_working_hours where staff_member_id = $1 and weekday = 1',
      [STAFF.anna],
    );
    expect(rows[0]?.anzahl).toBe('1');
    expect(await erfolge()).toEqual([]);
  });

  it('hinterlaesst bei einer unbrauchbaren Zeitangabe kein Erfolgsaudit', async () => {
    await asUser(users.office, WOCHE, [
      STAFF.anna,
      1,
      JSON.stringify([{ von: 'morgens', bis: '12:00' }]),
    ]).catch(() => undefined);

    expect(await erfolge()).toEqual([]);
    const { rows } = await asPostgres('select 1 from public.staff_working_hours');
    expect(rows).toHaveLength(0);
  });

  it('hinterlaesst bei einer nicht behandelnden Person kein Erfolgsaudit', async () => {
    await asUser(users.office, WOCHE, [STAFF.olivia, 1, bloecke(['08:00', '12:00'])]).catch(
      () => undefined,
    );
    expect(await erfolge()).toEqual([]);
  });

  it('laesst Abwesenheit und Bloecke am selben Tag nicht zu und auditiert nichts', async () => {
    await asUser(users.office, AUSNAHME, [
      STAFF.anna,
      TAG,
      true,
      bloecke(['10:00', '12:00']),
    ]).catch(() => undefined);
    expect(await abweichungen(STAFF.anna)).toEqual([]);
    expect(await erfolge()).toEqual([]);
  });
});

// =============================================================================
// Mandantentrennung
// =============================================================================

describe('Arbeitszeiten fremder Praxen', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000b1';
  const fremderOwner = '11111111-1111-4111-8111-0000000000b1';
  const fremdePerson = '44444444-4444-4444-8444-0000000000b1';
  const fremderStaff = '55555555-5555-4555-8555-0000000000b1';

  beforeAll(async () => {
    await resetDatabase();

    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderOwner}', 'frida.plant@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name, time_zone)
        values ('${fremdeOrg}', 'Test Praxis Anderswo', 'Europe/Berlin');
      insert into public.persons (id, organization_id, given_name, family_name)
        values ('${fremdePerson}', '${fremdeOrg}', 'Frida', 'Fremd');
      insert into public.staff_members (id, organization_id, person_id)
        values ('${fremderStaff}', '${fremdeOrg}', '${fremdePerson}');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('${fremderOwner}', '${fremdeOrg}', '${fremdePerson}', 'Frida Fremd');
      insert into public.user_roles (user_id, organization_id, role_key) values
        ('${fremderOwner}', '${fremdeOrg}', 'owner'),
        ('${fremderOwner}', '${fremdeOrg}', 'therapist');
    `);
    await asPostgres('delete from public.audit_log');
  }, 120_000);

  it('erzeugt fuer eine fremde Person kein Ereignis', async () => {
    await asUser(users.office, WOCHE, [fremderStaff, 1, bloecke(['08:00', '12:00'])]).catch(
      () => undefined,
    );

    expect(await erfolge()).toEqual([]);
    const { rows } = await asPostgres(
      'select 1 from public.staff_working_hours where staff_member_id = $1',
      [fremderStaff],
    );
    expect(rows).toHaveLength(0);
  });

  it('erzeugt fuer eine fremde Abweichung kein Ereignis', async () => {
    await asUser(users.office, AUSNAHME, [fremderStaff, TAG, true, '[]']).catch(() => undefined);

    expect(await erfolge()).toEqual([]);
    expect(await abweichungen(fremderStaff)).toEqual([]);
  });

  it('schreibt die Arbeitszeit der fremden Praxis in IHRE Organisation, ohne Auditeintrag', async () => {
    await asUserCommitted(fremderOwner, WOCHE, [fremderStaff, 1, bloecke(['08:00', '12:00'])]);

    const zeilen = await woche(fremderStaff, 1);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ organization_id: fremdeOrg, created_by: fremderOwner });
    expect(zeilen[0]!.organization_id).not.toBe(organizationId);
    expect(await erfolge()).toEqual([]);
  });
});

// =============================================================================
// Ereigniskatalog
// =============================================================================

describe('Ereigniskatalog der Arbeitszeiten (LOG-EPIC-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it.each(ENTFALLEN)('weist das entfallene Ereignis %s ab', async (aktion) => {
    const { rows } = await asPostgres<{ definition: string }>(
      "select pg_get_constraintdef(oid) as definition from pg_constraint where conname = 'audit_log_action_check'",
    );
    expect(rows[0]?.definition).not.toContain(aktion);
    await expect(
      asPostgres(
        `insert into public.audit_log (organization_id, actor_user_id, action, subject_type, subject_id, outcome)
         values ($1, $2, $3, 'staff_member', $4, 'success')`,
        [organizationId, users.office, aktion, STAFF.anna],
      ),
    ).rejects.toThrow(/audit_log_action_check/);
  });

  it('laesst ein unbekanntes Arbeitszeitereignis nicht zu', async () => {
    await expect(
      asPostgres(
        `insert into public.audit_log (organization_id, actor_user_id, action, subject_type, subject_id, outcome)
         values ($1, $2, 'staff_working_hours.geaendert', 'staff_working_hours', $3, 'success')`,
        [organizationId, users.office, STAFF.anna],
      ),
    ).rejects.toThrow(/audit_log_action_check/);
  });
});

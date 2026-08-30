import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Auditierung der Arbeitszeitaenderungen (CAL-005, Nachtrag).
 *
 * Geprueft wird nicht nur, DASS ein Ereignis entsteht, sondern auch welches -
 * beide RPCs ersetzen eine ganze organisatorische Einheit, die Art des
 * Vorgangs ergibt sich also aus dem Vergleich von vorher und nachher.
 *
 * Ausserdem: dass der Kontext datensparsam bleibt, dass ein No-op nichts
 * schreibt und dass ein abgewiesener Aufruf weder eine halbe Fachaenderung
 * noch ein isoliertes Erfolgsaudit hinterlaesst.
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

interface Ereignis {
  action: string;
  subject_type: string;
  subject_id: string;
  actor_user_id: string;
  organization_id: string;
  outcome: string;
  context: Record<string, unknown>;
}

/** Alle Arbeitszeitereignisse in Reihenfolge ihres Auftretens. */
async function ereignisse(): Promise<Ereignis[]> {
  const { rows } = await asPostgres<Ereignis>(
    `select action, subject_type, subject_id, actor_user_id, organization_id, outcome, context
       from public.audit_log
      where action like 'staff_working_hour%'
      order by occurred_at, action`,
  );
  return rows;
}

async function aktionen(): Promise<string[]> {
  return (await ereignisse()).map((e) => e.action);
}

function bloecke(...paare: [string, string][]): string {
  return JSON.stringify(paare.map(([von, bis]) => ({ von, bis })));
}

// =============================================================================
// Wochenarbeitszeit
// =============================================================================

describe('Audit: Wochenarbeitszeit', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.staff_working_hours');
    await asPostgres('delete from public.audit_log');
  });

  it('protokolliert das Anlegen', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    expect(await aktionen()).toEqual(['staff_working_hours.created']);
  });

  it('protokolliert eine Aenderung als updated, nicht als created', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    await asPostgres('delete from public.audit_log');

    await asUserCommitted(users.office, WOCHE, [
      STAFF.anna,
      1,
      bloecke(['08:00', '12:00'], ['13:00', '18:00']),
    ]);
    expect(await aktionen()).toEqual(['staff_working_hours.updated']);
  });

  it('protokolliert das Leeren als removed', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    await asPostgres('delete from public.audit_log');

    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, '[]']);
    expect(await aktionen()).toEqual(['staff_working_hours.removed']);
  });

  it('haelt Akteur, Organisation und Personenbezug fest', async () => {
    await asUserCommitted(users.teamLead, WOCHE, [STAFF.tim, 3, bloecke(['09:00', '15:00'])]);

    const [e] = await ereignisse();
    expect(e).toMatchObject({
      subject_type: 'staff_working_hours',
      subject_id: STAFF.tim,
      actor_user_id: users.teamLead,
      organization_id: organizationId,
      outcome: 'success',
    });
    expect(e?.context).toMatchObject({ surface: 'web', staff_member_id: STAFF.tim });
  });

  it('nennt die betroffenen Datensaetze', async () => {
    await asUserCommitted(users.office, WOCHE, [
      STAFF.anna,
      2,
      bloecke(['08:00', '12:00'], ['13:00', '18:00']),
    ]);

    const { rows } = await asPostgres<{ id: string }>(
      'select id from public.staff_working_hours where staff_member_id = $1 and weekday = 2',
      [STAFF.anna],
    );
    const [e] = await ereignisse();
    expect(e?.context.record_ids).toEqual(expect.arrayContaining(rows.map((r) => r.id)));
    expect(e?.context.record_ids).toHaveLength(2);
  });

  it('nennt beim Entfernen die aufgehobenen Datensaetze', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 4, bloecke(['08:00', '12:00'])]);
    const { rows } = await asPostgres<{ id: string }>(
      'select id from public.staff_working_hours where staff_member_id = $1 and weekday = 4',
      [STAFF.anna],
    );
    await asPostgres('delete from public.audit_log');

    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 4, '[]']);
    const [e] = await ereignisse();
    expect(e?.context.record_ids).toEqual([rows[0]?.id]);
  });

  it('kopiert weder Namen noch konkrete Arbeitszeiten in den Kontext', async () => {
    await asUserCommitted(users.office, WOCHE, [
      STAFF.anna,
      1,
      bloecke(['08:00', '12:00'], ['13:00', '18:00']),
    ]);

    const serialisiert = JSON.stringify((await ereignisse())[0]?.context);
    for (const verboten of ['Anna', 'Beispiel', '08:00', '12:00', '13:00', '18:00']) {
      expect(serialisiert, `"${verboten}" gehoert nicht in den Auditkontext`).not.toContain(
        verboten,
      );
    }
    // Auch keine Uhrzeit in irgendeiner Schreibweise.
    expect(serialisiert).not.toMatch(/\d{2}:\d{2}/);
  });

  it('enthaelt ausschliesslich zugelassene Kontextschluessel', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    expect(Object.keys((await ereignisse())[0]!.context).sort()).toEqual(
      ['record_ids', 'staff_member_id', 'surface'].sort(),
    );
  });

  it('erzeugt bei unveraendertem Stand kein Ereignis', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    await asPostgres('delete from public.audit_log');

    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    expect(await aktionen()).toEqual([]);
  });

  it('erzeugt bei einem leeren No-op kein Ereignis', async () => {
    // Nichts entfernen, wo nichts ist.
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 5, '[]']);
    expect(await aktionen()).toEqual([]);
  });

  it('laesst bei einem No-op die Datensaetze unberuehrt', async () => {
    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    const vorher = await asPostgres<{ id: string }>(
      'select id from public.staff_working_hours where staff_member_id = $1 and weekday = 1',
      [STAFF.anna],
    );

    await asUserCommitted(users.office, WOCHE, [STAFF.anna, 1, bloecke(['08:00', '12:00'])]);
    const nachher = await asPostgres<{ id: string }>(
      'select id from public.staff_working_hours where staff_member_id = $1 and weekday = 1',
      [STAFF.anna],
    );
    // Nicht einmal neu geschrieben: dieselben Datensaetze.
    expect(nachher.rows.map((r) => r.id)).toEqual(vorher.rows.map((r) => r.id));
  });
});

// =============================================================================
// Datumsbezogene Abweichung
// =============================================================================

describe('Audit: Arbeitszeitabweichung', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.staff_working_hour_exceptions');
    await asPostgres('delete from public.audit_log');
  });

  it('protokolliert das Anlegen abweichender Bloecke', async () => {
    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      TAG,
      false,
      bloecke(['18:00', '20:00']),
    ]);

    const [e] = await ereignisse();
    expect(e?.action).toBe('staff_working_hour_exception.created');
    expect(e?.context).toMatchObject({ kind: 'block' });
  });

  it('protokolliert eine vollstaendige Nichtverfuegbarkeit als solche', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, true, '[]']);

    const [e] = await ereignisse();
    expect(e?.action).toBe('staff_working_hour_exception.created');
    expect(e?.context).toMatchObject({ kind: 'unavailable' });
  });

  it('protokolliert den Wechsel von Bloecken zu Abwesenheit als updated', async () => {
    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      TAG,
      false,
      bloecke(['18:00', '20:00']),
    ]);
    await asPostgres('delete from public.audit_log');

    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, true, '[]']);
    const [e] = await ereignisse();
    expect(e?.action).toBe('staff_working_hour_exception.updated');
    expect(e?.context).toMatchObject({ kind: 'unavailable' });
  });

  it('protokolliert geaenderte Bloecke als updated', async () => {
    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      TAG,
      false,
      bloecke(['18:00', '20:00']),
    ]);
    await asPostgres('delete from public.audit_log');

    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      TAG,
      false,
      bloecke(['07:00', '09:00'], ['18:00', '20:00']),
    ]);
    expect(await aktionen()).toEqual(['staff_working_hour_exception.updated']);
  });

  it('protokolliert die wirksame Aufhebung als removed', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, true, '[]']);
    await asPostgres('delete from public.audit_log');

    // Weder Abwesenheit noch Bloecke: ab jetzt gilt wieder der Wochenplan.
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, false, '[]']);

    const [e] = await ereignisse();
    expect(e?.action).toBe('staff_working_hour_exception.removed');
    // Bei einer Aufhebung sagt der Ereignisname alles; eine Art gibt es nicht.
    expect(e?.context).not.toHaveProperty('kind');
  });

  it('haelt Akteur, Organisation und Personenbezug fest', async () => {
    await asUserCommitted(users.ownerTherapist, AUSNAHME, [STAFF.tim, TAG, true, '[]']);

    expect((await ereignisse())[0]).toMatchObject({
      subject_type: 'staff_working_hour_exception',
      subject_id: STAFF.tim,
      actor_user_id: users.ownerTherapist,
      organization_id: organizationId,
      outcome: 'success',
    });
  });

  it('kopiert weder Namen, Datum noch konkrete Zeiten in den Kontext', async () => {
    await asUserCommitted(users.office, AUSNAHME, [
      STAFF.anna,
      TAG,
      false,
      bloecke(['18:00', '20:00']),
    ]);

    const serialisiert = JSON.stringify((await ereignisse())[0]?.context);
    for (const verboten of ['Anna', 'Beispiel', '18:00', '20:00', TAG]) {
      expect(serialisiert, `"${verboten}" gehoert nicht in den Auditkontext`).not.toContain(
        verboten,
      );
    }
    expect(serialisiert).not.toMatch(/\d{2}:\d{2}/);
  });

  it('enthaelt ausschliesslich zugelassene Kontextschluessel', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, true, '[]']);
    expect(Object.keys((await ereignisse())[0]!.context).sort()).toEqual(
      ['kind', 'record_ids', 'staff_member_id', 'surface'].sort(),
    );
  });

  it('erzeugt bei unveraendertem Stand kein Ereignis', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, true, '[]']);
    await asPostgres('delete from public.audit_log');

    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, true, '[]']);
    expect(await aktionen()).toEqual([]);
  });

  it('erzeugt beim Aufheben einer nicht vorhandenen Abweichung kein Ereignis', async () => {
    await asUserCommitted(users.office, AUSNAHME, [STAFF.anna, TAG, false, '[]']);
    expect(await aktionen()).toEqual([]);
  });
});

// =============================================================================
// Abgewiesene Vorgaenge
// =============================================================================

describe('Audit: abgewiesene Arbeitszeitvorgaenge', () => {
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
    expect(await aktionen()).toEqual([]);
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
    expect(await aktionen()).toEqual([]);
  });

  it('hinterlaesst bei einer unbrauchbaren Zeitangabe kein Erfolgsaudit', async () => {
    await asUser(users.office, WOCHE, [
      STAFF.anna,
      1,
      JSON.stringify([{ von: 'morgens', bis: '12:00' }]),
    ]).catch(() => undefined);

    expect(await aktionen()).toEqual([]);
    const { rows } = await asPostgres('select 1 from public.staff_working_hours');
    expect(rows).toHaveLength(0);
  });

  it('hinterlaesst bei einer nicht behandelnden Person kein Erfolgsaudit', async () => {
    await asUser(users.office, WOCHE, [STAFF.olivia, 1, bloecke(['08:00', '12:00'])]).catch(
      () => undefined,
    );
    expect(await aktionen()).toEqual([]);
  });

  it('laesst Abwesenheit und Bloecke am selben Tag nicht zu und auditiert nichts', async () => {
    await asUser(users.office, AUSNAHME, [
      STAFF.anna,
      TAG,
      true,
      bloecke(['10:00', '12:00']),
    ]).catch(() => undefined);
    expect(await aktionen()).toEqual([]);
  });
});

// =============================================================================
// Mandantentrennung
// =============================================================================

describe('Audit: Arbeitszeiten fremder Praxen', () => {
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

    expect(await aktionen()).toEqual([]);
    const { rows } = await asPostgres(
      'select 1 from public.staff_working_hours where staff_member_id = $1',
      [fremderStaff],
    );
    expect(rows).toHaveLength(0);
  });

  it('erzeugt fuer eine fremde Abweichung kein Ereignis', async () => {
    await asUser(users.office, AUSNAHME, [fremderStaff, TAG, true, '[]']).catch(() => undefined);

    expect(await aktionen()).toEqual([]);
  });

  it('schreibt das Ereignis der fremden Praxis in IHRE Organisation', async () => {
    await asUserCommitted(fremderOwner, WOCHE, [fremderStaff, 1, bloecke(['08:00', '12:00'])]);

    const [e] = await ereignisse();
    expect(e?.organization_id).toBe(fremdeOrg);
    expect(e?.organization_id).not.toBe(organizationId);
  });
});

// =============================================================================
// Ereigniskatalog
// =============================================================================

describe('Audit: Ereigniskatalog der Arbeitszeiten', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('kennt alle sechs Arbeitszeitereignisse', async () => {
    const { rows } = await asPostgres<{ definition: string }>(
      "select pg_get_constraintdef(oid) as definition from pg_constraint where conname = 'audit_log_action_check'",
    );
    for (const aktion of [
      'staff_working_hours.created',
      'staff_working_hours.updated',
      'staff_working_hours.removed',
      'staff_working_hour_exception.created',
      'staff_working_hour_exception.updated',
      'staff_working_hour_exception.removed',
    ]) {
      expect(rows[0]?.definition, `${aktion} fehlt in der Constraint`).toContain(aktion);
    }
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

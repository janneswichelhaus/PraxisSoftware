import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabase,
  tagInTagen,
} from './helpers/db';

/**
 * Termine abschliessen und wieder oeffnen (CAL-004).
 *
 * Der Abschluss ist die dritte Auspraegung des Status. Fachlich ist er etwas
 * anderes als eine Absage: der Termin hat stattgefunden, sein Zeitraum bleibt
 * belegt, und er ist umkehrbar. Genau diese drei Unterschiede werden hier
 * geprueft - zusammen mit den Grenzen, die auch fuer die uebrigen
 * Schreibpfade gelten (Rollen, Organisation, Nebenlaeufigkeit).
 */

const { users, organizationId, patients } = SEED;

// Bewusst MIT Arbeitszeitbestaetigung: diese Datei prueft andere Zusagen und
// benutzt Zeiten ueber den ganzen Tag sowie Kalendertage, die auch auf ein
// Wochenende fallen koennen. Die Arbeitszeitpruefung hat eigene Tests in
// scheduling-rules.test.ts; hier waere sie nur Rauschen (CAL-005).
const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const AENDERN =
  'select public.update_appointment($1::uuid, $2::timestamptz, $3::uuid, $4, $5::date, $6::time, $7::time, $8::uuid, true) as id';
const ABSAGEN =
  'select public.cancel_appointment($1::uuid, $2::timestamptz, $3, null::date, null::time) as id';
const ABSCHLIESSEN = 'select public.complete_appointment($1::uuid, $2::timestamptz) as id';
const OEFFNEN = 'select public.reopen_appointment($1::uuid, $2::timestamptz) as id';

const STAFF = {
  anna: '55555555-5555-4555-8555-000000000002',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

const TAG = tagInTagen(60);

interface Termin {
  id: string;
  updated_at: string;
}

/** Aktueller Stand inklusive updated_at als Rohwert - Bruchteile inbegriffen. */
async function stand(id: string): Promise<Termin> {
  const { rows } = await asPostgres<{ id: string; updated_at: string }>(
    'select id, to_char(updated_at at time zone \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"+00"\') as updated_at from public.appointments where id = $1',
    [id],
  );
  return rows[0]!;
}

async function anlegen(
  opts: {
    patient?: string;
    staff?: string;
    tag?: string;
    von?: string;
    bis?: string;
    user?: string;
  } = {},
): Promise<Termin> {
  const { rows } = await asUserCommitted<{ id: string }>(opts.user ?? users.office, ANLEGEN, [
    opts.patient ?? patients.max,
    opts.staff ?? STAFF.anna,
    'video',
    opts.tag ?? TAG,
    opts.von ?? '09:00',
    opts.bis ?? '10:00',
    null,
  ]);
  return stand(rows[0]!.id);
}

async function zeile(id: string) {
  const { rows } = await asPostgres<Record<string, unknown>>(
    'select * from public.appointments where id = $1',
    [id],
  );
  return rows[0];
}

/** Legt einen Termin an und schliesst ihn ab; liefert den Stand danach. */
async function abgeschlossen(opts: Parameters<typeof anlegen>[0] = {}): Promise<Termin> {
  const t = await anlegen(opts);
  await asUserCommitted(opts.user ?? users.office, ABSCHLIESSEN, [t.id, t.updated_at]);
  return stand(t.id);
}

// =============================================================================
// Abschliessen
// =============================================================================

describe('complete_appointment: Rollen', () => {
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
  ])('erlaubt %s das Abschliessen', async (_rolle, userId) => {
    const t = await anlegen();
    await asUserCommitted(userId, ABSCHLIESSEN, [t.id, t.updated_at]);
    expect(await zeile(t.id)).toMatchObject({ status: 'completed', completed_by: userId });
  });

  it.each([
    ['Patientenkonto Max', users.patientMax],
    ['Patientenkonto Erika', users.patientErika],
  ])('weist %s ab', async (_wer, userId) => {
    const t = await anlegen();
    await expect(asUser(userId, ABSCHLIESSEN, [t.id, t.updated_at])).rejects.toThrow(
      /not allowed to complete appointments/,
    );
    expect(await zeile(t.id)).toMatchObject({ status: 'confirmed' });
  });

  it('weist einen anonymen Zugriff ab', async () => {
    const t = await anlegen();
    await expect(asAnon(ABSCHLIESSEN, [t.id, t.updated_at])).rejects.toThrow(
      /permission denied|not authenticated/i,
    );
  });
});

describe('complete_appointment: Vorgang', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    await asPostgres('delete from public.audit_log');
  });

  it('setzt Status, Zeitpunkt und Akteur gemeinsam', async () => {
    const t = await anlegen();
    await asUserCommitted(users.office, ABSCHLIESSEN, [t.id, t.updated_at]);

    const z = await zeile(t.id);
    expect(z).toMatchObject({ status: 'completed', completed_by: users.office });
    expect(z?.completed_at).toBeInstanceOf(Date);
  });

  it('verlangt keine Behandlungsdokumentation', async () => {
    // Es gibt in diesem Stand keine Dokumentation, und der Abschluss darf sie
    // auch nicht voraussetzen: er ist eine organisatorische Feststellung.
    const t = await anlegen();
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [t.id, t.updated_at]);
    expect(await zeile(t.id)).toMatchObject({ status: 'completed' });
  });

  it('laesst einen abgesagten Termin nicht abschliessen', async () => {
    const t = await anlegen();
    await asUserCommitted(users.office, ABSAGEN, [t.id, t.updated_at, 'other']);
    const abgesagt = await stand(t.id);

    await expect(
      asUser(users.office, ABSCHLIESSEN, [abgesagt.id, abgesagt.updated_at]),
    ).rejects.toThrow(/cancelled appointment cannot be completed/);
    expect(await zeile(t.id)).toMatchObject({ status: 'cancelled' });
  });

  it('laesst einen bereits abgeschlossenen Termin nicht erneut abschliessen', async () => {
    const t = await abgeschlossen();
    await expect(asUser(users.office, ABSCHLIESSEN, [t.id, t.updated_at])).rejects.toThrow(
      /appointment is already completed/,
    );
  });

  it('verlangt den erwarteten Stand', async () => {
    const t = await anlegen();
    await expect(asUser(users.office, ABSCHLIESSEN, [t.id, null])).rejects.toThrow(
      /expected updated_at is required/,
    );
    await expect(
      asUser(users.office, ABSCHLIESSEN, [t.id, '2020-01-01T00:00:00+00']),
    ).rejects.toThrow(/appointment was changed meanwhile/);
    expect(await zeile(t.id)).toMatchObject({ status: 'confirmed' });
  });

  it('protokolliert appointment.completed ohne Terminzeit', async () => {
    const t = await anlegen();
    await asUserCommitted(users.office, ABSCHLIESSEN, [t.id, t.updated_at]);

    const { rows } = await asPostgres<{
      action: string;
      outcome: string;
      subject_id: string;
      context: Record<string, unknown>;
    }>(
      `select action, outcome, subject_id, context from public.audit_log
        where action = 'appointment.completed' and organization_id = $1`,
      [organizationId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'success', subject_id: t.id });
    // ADR-010: Metadaten, niemals die konkrete Terminzeit.
    expect(JSON.stringify(rows[0]?.context)).not.toMatch(/\d{2}:\d{2}/);
  });

  it('erzeugt bei einem abgewiesenen Abschluss kein Erfolgsaudit', async () => {
    const t = await anlegen();
    await asUser(users.patientMax, ABSCHLIESSEN, [t.id, t.updated_at]).catch(() => undefined);

    const { rows } = await asPostgres(
      `select 1 from public.audit_log where action = 'appointment.completed'`,
    );
    expect(rows).toHaveLength(0);
  });
});

// =============================================================================
// Belegter Zeitraum
// =============================================================================

describe('CAL-004: abgeschlossene Termine belegen ihren Zeitraum weiter', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('verhindert eine Doppelbuchung ueber einen abgeschlossenen Termin hinweg', async () => {
    await abgeschlossen({ von: '09:00', bis: '10:00' });

    await expect(anlegen({ von: '09:30', bis: '10:30' })).rejects.toThrow(
      /appointment overlaps an existing one/,
    );
  });

  it('verhindert das Verschieben eines Termins auf einen abgeschlossenen', async () => {
    await abgeschlossen({ von: '09:00', bis: '10:00' });
    const zweiter = await anlegen({ von: '14:00', bis: '15:00' });

    await expect(
      asUser(users.office, AENDERN, [
        zweiter.id,
        zweiter.updated_at,
        STAFF.anna,
        'video',
        TAG,
        '09:30',
        '10:30',
        null,
      ]),
    ).rejects.toThrow(/appointment overlaps an existing one/);
  });

  it('gibt den Zeitraum weiterhin frei, wenn der Termin abgesagt wird', async () => {
    const t = await anlegen({ von: '09:00', bis: '10:00' });
    await asUserCommitted(users.office, ABSAGEN, [t.id, t.updated_at, 'other']);

    const neuer = await anlegen({ von: '09:00', bis: '10:00' });
    expect(await zeile(neuer.id)).toMatchObject({ status: 'confirmed' });
  });

  it('haelt den Schutz als Constraint mit beiden belegenden Status', async () => {
    const { rows } = await asPostgres<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint where conname = 'appointments_no_overlap'`,
    );
    expect(rows[0]?.definition).toMatch(/EXCLUDE USING gist/i);
    expect(rows[0]?.definition).toMatch(/WHERE \(+status <> 'cancelled'/);
  });
});

// =============================================================================
// Abgeschlossene Termine sind nicht direkt aenderbar
// =============================================================================

describe('CAL-004: abgeschlossene Termine erst wieder oeffnen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('laesst einen abgeschlossenen Termin nicht bearbeiten', async () => {
    const t = await abgeschlossen();

    await expect(
      asUser(users.office, AENDERN, [
        t.id,
        t.updated_at,
        STAFF.tim,
        'video',
        TAG,
        '09:00',
        '10:00',
        null,
      ]),
    ).rejects.toThrow(/completed appointment must be reopened first/);
    expect(await zeile(t.id)).toMatchObject({ status: 'completed', staff_member_id: STAFF.anna });
  });

  it('laesst einen abgeschlossenen Termin nicht verschieben', async () => {
    const t = await abgeschlossen();

    await expect(
      asUser(users.office, AENDERN, [
        t.id,
        t.updated_at,
        STAFF.anna,
        'video',
        TAG,
        '15:00',
        '16:00',
        null,
      ]),
    ).rejects.toThrow(/completed appointment must be reopened first/);
  });

  it('laesst einen abgeschlossenen Termin nicht absagen', async () => {
    const t = await abgeschlossen();

    // Und zwar mit einer fachlichen Meldung, nicht als Nebenlaeufigkeitsfehler:
    // hier hat gar nichts zwischenzeitlich zugegriffen.
    const fehler = await asUser(users.office, ABSAGEN, [t.id, t.updated_at, 'other']).catch(
      (e: Error) => e.message,
    );
    expect(fehler).toMatch(/completed appointment must be reopened first/);
    expect(await zeile(t.id)).toMatchObject({ status: 'completed' });
  });

  it('unterscheidet die Meldung fuer abgesagte und abgeschlossene Termine', async () => {
    const abzusagen = await anlegen({ von: '11:00', bis: '12:00' });
    await asUserCommitted(users.office, ABSAGEN, [abzusagen.id, abzusagen.updated_at, 'other']);
    const abgesagt = await stand(abzusagen.id);

    const meldung = await asUser(users.office, AENDERN, [
      abgesagt.id,
      abgesagt.updated_at,
      STAFF.anna,
      'video',
      TAG,
      '11:00',
      '12:00',
      null,
    ]).catch((e: Error) => e.message);
    expect(meldung).toMatch(/cancelled appointment cannot be changed/);
  });

  it('erlaubt die Bearbeitung nach dem Wiederoeffnen', async () => {
    const t = await abgeschlossen();
    await asUserCommitted(users.office, OEFFNEN, [t.id, t.updated_at]);
    const offen = await stand(t.id);

    await asUserCommitted(users.office, AENDERN, [
      offen.id,
      offen.updated_at,
      STAFF.anna,
      'video',
      TAG,
      '15:00',
      '16:00',
      null,
    ]);
    expect(await zeile(t.id)).toMatchObject({ status: 'confirmed' });
  });
});

// =============================================================================
// Wieder oeffnen
// =============================================================================

describe('reopen_appointment', () => {
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
  ])('erlaubt %s das Wiederoeffnen', async (_rolle, userId) => {
    const t = await abgeschlossen();
    await asUserCommitted(userId, OEFFNEN, [t.id, t.updated_at]);
    expect(await zeile(t.id)).toMatchObject({ status: 'confirmed' });
  });

  it('weist ein Patientenkonto ab', async () => {
    const t = await abgeschlossen();
    await expect(asUser(users.patientMax, OEFFNEN, [t.id, t.updated_at])).rejects.toThrow(
      /not allowed to reopen appointments/,
    );
    expect(await zeile(t.id)).toMatchObject({ status: 'completed' });
  });

  it('weist einen anonymen Zugriff ab', async () => {
    const t = await abgeschlossen();
    await expect(asAnon(OEFFNEN, [t.id, t.updated_at])).rejects.toThrow(
      /permission denied|not authenticated/i,
    );
  });

  it('leert Abschlusszeitpunkt und Akteur', async () => {
    const t = await abgeschlossen();
    await asUserCommitted(users.office, OEFFNEN, [t.id, t.updated_at]);

    expect(await zeile(t.id)).toMatchObject({
      status: 'confirmed',
      completed_at: null,
      completed_by: null,
    });
  });

  it('laesst einen geplanten Termin nicht wieder oeffnen', async () => {
    const t = await anlegen();
    await expect(asUser(users.office, OEFFNEN, [t.id, t.updated_at])).rejects.toThrow(
      /appointment is not completed/,
    );
  });

  it('laesst einen abgesagten Termin nicht wieder oeffnen', async () => {
    const t = await anlegen();
    await asUserCommitted(users.office, ABSAGEN, [t.id, t.updated_at, 'other']);
    const abgesagt = await stand(t.id);

    await expect(asUser(users.office, OEFFNEN, [abgesagt.id, abgesagt.updated_at])).rejects.toThrow(
      /cancelled appointment cannot be reopened/,
    );
    expect(await zeile(t.id)).toMatchObject({ status: 'cancelled' });
  });

  it('verlangt den erwarteten Stand', async () => {
    const t = await abgeschlossen();
    await expect(asUser(users.office, OEFFNEN, [t.id, '2020-01-01T00:00:00+00'])).rejects.toThrow(
      /appointment was changed meanwhile/,
    );
    expect(await zeile(t.id)).toMatchObject({ status: 'completed' });
  });

  it('haelt die Historie im Auditlog vollstaendig', async () => {
    const t = await abgeschlossen();
    await asUserCommitted(users.office, OEFFNEN, [t.id, t.updated_at]);
    const offen = await stand(t.id);
    await asUserCommitted(users.office, ABSCHLIESSEN, [offen.id, offen.updated_at]);

    const { rows } = await asPostgres<{ action: string }>(
      `select action from public.audit_log
        where subject_id = $1 and action in ('appointment.completed', 'appointment.reopened')
        order by occurred_at, action`,
      [t.id],
    );
    // Nichts wird still entfernt: beide Abschluesse und die Oeffnung bleiben.
    expect(rows.map((r) => r.action)).toEqual([
      'appointment.completed',
      'appointment.reopened',
      'appointment.completed',
    ]);
  });
});

// =============================================================================
// Rechteflaeche der neuen Schreibpfade
// =============================================================================

describe('CAL-004: Rechte der neuen Funktionen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it.each([['complete_appointment(uuid, timestamptz)'], ['reopen_appointment(uuid, timestamptz)']])(
    'gibt anon kein EXECUTE auf public.%s',
    async (signatur) => {
      const { rows } = await asPostgres<{ erlaubt: boolean }>(
        `select has_function_privilege('anon', 'public.${signatur}', 'EXECUTE') as erlaubt`,
      );
      expect(rows[0]?.erlaubt).toBe(false);
    },
  );

  it.each([['complete_appointment'], ['reopen_appointment']])(
    'laesst public.%s mit leerem search_path laufen',
    async (name) => {
      const { rows } = await asPostgres<{ proconfig: string[] | null; prosecdef: boolean }>(
        `select p.proconfig, p.prosecdef
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
        [name],
      );
      expect(rows[0]?.prosecdef).toBe(true);
      expect(rows[0]?.proconfig).toContain('search_path=""');
    },
  );

  it('gibt authenticated auf appointments weiterhin nur SELECT', async () => {
    // Geschrieben wird ausschliesslich ueber die RPCs; der Abschluss aendert
    // daran nichts (ADR-004).
    const { rows } = await asPostgres<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'appointments'
          and grantee = 'authenticated'
        order by privilege_type`,
    );
    expect(rows.map((r) => r.privilege_type)).toEqual(['SELECT']);
  });
});

// =============================================================================
// Kalenderlesepfad
// =============================================================================

describe('list_appointments: abgeschlossene Termine', () => {
  const LISTE = 'select * from public.list_appointments($1::date, $2::date, null, null, $3)';

  beforeAll(async () => {
    await resetDatabase();
    await asPostgres('delete from public.appointments');
    await abgeschlossen({ von: '09:00', bis: '10:00' });
    const geplant = await anlegen({ von: '11:00', bis: '12:00' });
    const abzusagen = await anlegen({ von: '13:00', bis: '14:00' });
    await asUserCommitted(users.office, ABSAGEN, [abzusagen.id, abzusagen.updated_at, 'other']);
    expect(geplant.id).toBeDefined();
  }, 120_000);

  const bis = tagInTagen(61);

  async function status(filter: string): Promise<string[]> {
    const { rows } = await asUser<{ status: string }>(users.office, LISTE, [TAG, bis, filter]);
    return rows.map((r) => r.status).sort();
  }

  it('zeigt geplante und abgeschlossene Termine im Standardfilter', async () => {
    expect(await status('active')).toEqual(['completed', 'confirmed']);
  });

  it('nutzt active auch dann, wenn kein Filter uebergeben wird', async () => {
    const { rows } = await asUser<{ status: string }>(
      users.office,
      'select * from public.list_appointments($1::date, $2::date)',
      [TAG, bis],
    );
    expect(rows.map((r) => r.status).sort()).toEqual(['completed', 'confirmed']);
  });

  it('filtert gezielt auf abgeschlossene Termine', async () => {
    expect(await status('completed')).toEqual(['completed']);
  });

  it('blendet abgeschlossene Termine bei "nur geplante" aus', async () => {
    expect(await status('confirmed')).toEqual(['confirmed']);
  });

  it('zeigt mit all auch die Absage', async () => {
    expect(await status('all')).toEqual(['cancelled', 'completed', 'confirmed']);
  });

  it('weist einen unbekannten Filter ab', async () => {
    await expect(asUser(users.office, LISTE, [TAG, bis, 'erledigt'])).rejects.toThrow(
      /unknown status filter/,
    );
  });
});

// =============================================================================
// Mandantentrennung
// =============================================================================

describe('CAL-004: Mandantentrennung', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000c1';
  const fremderOwner = '11111111-1111-4111-8111-0000000000c1';
  const fremdePerson = '44444444-4444-4444-8444-0000000000c1';
  const fremdePatientPerson = '44444444-4444-4444-8444-0000000000c2';
  const fremderStaff = '55555555-5555-4555-8555-0000000000c1';
  const fremderPatient = '66666666-6666-4666-8666-0000000000c1';

  let fremder: Termin;

  beforeAll(async () => {
    await resetDatabase();

    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderOwner}', 'frida.schliesst@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name, time_zone)
        values ('${fremdeOrg}', 'Test Praxis Andernorts', 'Europe/Berlin');
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

  it('laesst den Termin einer fremden Praxis nicht abschliessen', async () => {
    await expect(
      asUser(users.office, ABSCHLIESSEN, [fremder.id, fremder.updated_at]),
    ).rejects.toThrow(/appointment not found/);
    expect(await zeile(fremder.id)).toMatchObject({ status: 'confirmed' });
  });

  it('laesst den Termin einer fremden Praxis nicht wieder oeffnen', async () => {
    await asUserCommitted(fremderOwner, ABSCHLIESSEN, [fremder.id, fremder.updated_at]);
    const abgeschlossenerFremder = await stand(fremder.id);

    await expect(
      asUser(users.office, OEFFNEN, [abgeschlossenerFremder.id, abgeschlossenerFremder.updated_at]),
    ).rejects.toThrow(/appointment not found/);
    expect(await zeile(fremder.id)).toMatchObject({ status: 'completed' });
  });

  it('erzeugt fuer eine unbekannte und eine fremde Termin-ID dieselbe Meldung', async () => {
    const aktuell = await stand(fremder.id);
    const unbekannt = await asUser(users.office, ABSCHLIESSEN, [
      '77777777-7777-4777-8777-00000000eeee',
      aktuell.updated_at,
    ]).catch((e: Error) => e.message);
    const fremd = await asUser(users.office, ABSCHLIESSEN, [aktuell.id, aktuell.updated_at]).catch(
      (e: Error) => e.message,
    );
    expect(unbekannt).toBe(fremd);
  });
});

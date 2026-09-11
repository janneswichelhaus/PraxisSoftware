import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabaseOhneTermine,
} from './helpers/db';

/**
 * Zugang einladen und annehmen (STAFF-002b).
 *
 * Geprüft wird die tragende Zusage des Entwurfs: Die Berechtigung hängt
 * ausschließlich an der Einladung, die eine Praxisinhaberin gesetzt hat - nicht
 * daran, wer sich beim Provider anmelden konnte. Ein Konto ohne passende
 * offene Einladung bleibt dauerhaft zugriffslos (ANN-023).
 */
const { users, organizationId } = SEED;

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
} as const;

const EINLADEN = 'select public.invite_staff_account($1::uuid, $2, $3::text[]) as id';
const WIDERRUFEN = 'select public.revoke_staff_invitation($1::uuid)';
const ANNEHMEN = 'select public.claim_staff_invitation() as id';
const SPERREN = 'select public.set_staff_account_active($1::uuid, $2)';

/** Ein Konto, das der Provider angelegt hat - ohne jede Zuordnung zur Praxis. */
const NEUES_KONTO = '11111111-1111-4111-8111-0000000000aa';
const NEUE_MAIL = 'nina.neu@praxis.invalid';

async function kontoAnlegen(id = NEUES_KONTO, email = NEUE_MAIL): Promise<void> {
  await asPostgres(
    `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now())`,
    [id, email],
  );
}

/** Ein neuer Mitarbeiterdatensatz ohne Zugang - der Normalfall vor der Einladung. */
async function mitarbeiterAnlegen(vorname = 'Nina', nachname = 'Neu'): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(
    users.ownerTherapist,
    'select public.create_staff_member($1, $2) as id',
    [vorname, nachname],
  );
  return rows[0]!.id;
}

async function einladen(
  staffId: string,
  email = NEUE_MAIL,
  rollen: string[] = ['therapist'],
  akteur = users.ownerTherapist,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(akteur, EINLADEN, [
    staffId,
    email,
    rollen,
  ]);
  return rows[0]!.id;
}

async function einladung(id: string) {
  const { rows } = await asPostgres<{
    status: string;
    email: string;
    role_keys: string[];
    accepted_at: string | null;
    accepted_user_id: string | null;
    revoked_at: string | null;
  }>(
    `select status, email, role_keys, accepted_at, accepted_user_id, revoked_at
       from public.staff_account_invitations where id = $1`,
    [id],
  );
  return rows[0]!;
}

async function auditEintraege(action?: string) {
  const { rows } = await asPostgres<{
    action: string;
    actor_user_id: string;
    subject_type: string;
    subject_id: string;
    context: Record<string, unknown>;
  }>(
    `select action, actor_user_id, subject_type, subject_id, context
       from public.audit_log
      where action like 'staff_account.%' ${action ? 'and action = $1' : ''}
      order by occurred_at, id`,
    action ? [action] : [],
  );
  return rows;
}

// -----------------------------------------------------------------------------
// Einladen
// -----------------------------------------------------------------------------
describe('invite_staff_account', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('legt die Einladung an, ohne Konto, Profil oder Rolle zu erzeugen', async () => {
    const staffId = await mitarbeiterAnlegen();
    const id = await einladen(staffId, NEUE_MAIL, ['therapist', 'office']);

    const e = await einladung(id);
    expect(e.status).toBe('pending');
    expect(e.role_keys).toEqual(['therapist', 'office']);

    // Der eigentliche Punkt: die Einladung erzeugt nichts von dem, was Zugriff
    // gibt. Das entsteht erst bei der Annahme.
    const { rows: konten } = await asPostgres('select 1 from auth.users where email = $1', [
      NEUE_MAIL,
    ]);
    expect(konten).toHaveLength(0);
    const { rows: profile } = await asPostgres(
      `select 1 from public.user_profiles up
         join public.staff_members sm on sm.person_id = up.person_id
        where sm.id = $1`,
      [staffId],
    );
    expect(profile).toHaveLength(0);
  });

  it('normalisiert die Adresse', async () => {
    const staffId = await mitarbeiterAnlegen();
    const id = await einladen(staffId, '  Nina.NEU@Praxis.Invalid ');
    expect((await einladung(id)).email).toBe('nina.neu@praxis.invalid');
  });

  it('protokolliert die Rollen, aber nicht die Adresse (ADR-010)', async () => {
    const staffId = await mitarbeiterAnlegen();
    await einladen(staffId, NEUE_MAIL, ['team_lead']);

    const eintraege = await auditEintraege('staff_account.invited');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]?.subject_type).toBe('staff_member');
    expect(eintraege[0]?.subject_id).toBe(staffId);
    expect(eintraege[0]?.context).toEqual({ surface: 'web', roles: ['team_lead'] });
    expect(JSON.stringify(eintraege[0])).not.toContain('nina.neu');
  });

  it.each([
    ['office', users.office],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['patient', users.patientMax],
  ])('verweigert %s das Einladen (E10, ADR-004)', async (_rolle, userId) => {
    const staffId = await mitarbeiterAnlegen();
    await expect(asUser(userId, EINLADEN, [staffId, NEUE_MAIL, ['therapist']])).rejects.toThrow(
      /not allowed to manage accounts/,
    );
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(EINLADEN, [STAFF.anna, NEUE_MAIL, ['therapist']])).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('laesst nur eine offene Einladung je Datensatz zu', async () => {
    const staffId = await mitarbeiterAnlegen();
    await einladen(staffId);
    await expect(
      asUser(users.ownerTherapist, EINLADEN, [staffId, 'zweite@praxis.invalid', ['office']]),
    ).rejects.toThrow(/staff_account_invitations_one_open_per_staff/);
  });

  it('laesst dieselbe Adresse nicht zweimal offen stehen', async () => {
    const a = await mitarbeiterAnlegen('Nina', 'Neu');
    const b = await mitarbeiterAnlegen('Nora', 'Neu');
    await einladen(a, NEUE_MAIL);
    await expect(
      asUser(users.ownerTherapist, EINLADEN, [b, NEUE_MAIL, ['office']]),
    ).rejects.toThrow(/staff_account_invitations_one_open_per_email/);
  });

  it('weist eine Person mit bestehendem Zugang ab (4.2: ein Konto je Person)', async () => {
    await expect(
      asUser(users.ownerTherapist, EINLADEN, [STAFF.anna, NEUE_MAIL, ['therapist']]),
    ).rejects.toThrow(/account_already_exists/);
  });

  it('weist eine Adresse ab, die schon an einem Zugang der Praxis haengt', async () => {
    const staffId = await mitarbeiterAnlegen();
    await expect(
      asUser(users.ownerTherapist, EINLADEN, [staffId, 'ANNA.beispiel@praxis.invalid', ['office']]),
    ).rejects.toThrow(/email_already_in_use/);
  });

  it('weist einen ausgeschiedenen Datensatz ab', async () => {
    const staffId = await mitarbeiterAnlegen();
    await asUserCommitted(
      users.ownerTherapist,
      'select public.set_staff_employment_status($1::uuid, $2, $3)',
      [staffId, 'inactive', false],
    );
    await expect(
      asUser(users.ownerTherapist, EINLADEN, [staffId, NEUE_MAIL, ['therapist']]),
    ).rejects.toThrow(/staff member not found/);
  });

  it('weist einen fremden Datensatz wie einen unbekannten ab', async () => {
    await expect(
      asUser(users.ownerTherapist, EINLADEN, [
        '55555555-5555-4555-8555-0000000000ff',
        NEUE_MAIL,
        ['therapist'],
      ]),
    ).rejects.toThrow(/staff member not found/);
  });

  it.each([
    ['leer', []],
    ['unbekannt', ['chef']],
    ['patient', ['patient']],
    ['doppelt', ['office', 'office']],
  ])('weist eine Rollenliste ab, die %s ist', async (_fall, rollen) => {
    const staffId = await mitarbeiterAnlegen();
    await expect(
      asUser(users.ownerTherapist, EINLADEN, [staffId, NEUE_MAIL, rollen]),
    ).rejects.toThrow(/at least one role is required|unknown role|duplicate role/);
  });

  it('weist eine unbrauchbare Adresse ab', async () => {
    const staffId = await mitarbeiterAnlegen();
    await expect(
      asUser(users.ownerTherapist, EINLADEN, [staffId, 'kein-at-zeichen', ['office']]),
    ).rejects.toThrow(/invalid email/);
  });

  it('schreibt bei einem abgewiesenen Aufruf keinen Auditeintrag', async () => {
    const staffId = await mitarbeiterAnlegen();
    await expect(
      asUser(users.office, EINLADEN, [staffId, NEUE_MAIL, ['office']]),
    ).rejects.toThrow();
    expect(await auditEintraege()).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Widerrufen
// -----------------------------------------------------------------------------
describe('revoke_staff_invitation', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('nimmt eine offene Einladung zurueck und laesst die Zeile als Nachweis stehen', async () => {
    const staffId = await mitarbeiterAnlegen();
    const id = await einladen(staffId);

    await asUserCommitted(users.ownerTherapist, WIDERRUFEN, [id]);

    const e = await einladung(id);
    expect(e.status).toBe('revoked');
    expect(e.revoked_at).not.toBeNull();

    const eintraege = await auditEintraege('staff_account.invitation_revoked');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]?.subject_id).toBe(staffId);
  });

  it('gibt den Platz fuer eine neue Einladung frei', async () => {
    const staffId = await mitarbeiterAnlegen();
    const id = await einladen(staffId);
    await asUserCommitted(users.ownerTherapist, WIDERRUFEN, [id]);
    await expect(einladen(staffId, 'nora.neu@praxis.invalid', ['office'])).resolves.toBeTruthy();
  });

  it('laesst sich nicht zweimal ausfuehren', async () => {
    const staffId = await mitarbeiterAnlegen();
    const id = await einladen(staffId);
    await asUserCommitted(users.ownerTherapist, WIDERRUFEN, [id]);
    await expect(asUser(users.ownerTherapist, WIDERRUFEN, [id])).rejects.toThrow(
      /invitation not found/,
    );
  });

  it.each([
    ['office', users.office],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('verweigert %s den Widerruf', async (_rolle, userId) => {
    const staffId = await mitarbeiterAnlegen();
    const id = await einladen(staffId);
    await expect(asUser(userId, WIDERRUFEN, [id])).rejects.toThrow(
      /not allowed to manage accounts/,
    );
  });
});

// -----------------------------------------------------------------------------
// Annehmen
// -----------------------------------------------------------------------------
describe('claim_staff_invitation', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('laesst ein Konto ohne passende Einladung vollstaendig zugriffslos (ANN-023)', async () => {
    await kontoAnlegen();

    await expect(asUser(NEUES_KONTO, ANNEHMEN)).rejects.toThrow(/no_open_invitation/);

    // Und zwar wirklich zugriffslos: keine Organisation, keine Patientenkartei,
    // keine Mitarbeiterliste.
    const { rows: org } = await asUser<{ id: string | null }>(
      NEUES_KONTO,
      'select app.current_organization_id() as id',
    );
    expect(org[0]?.id).toBeNull();
    const { rows: patienten } = await asUser(NEUES_KONTO, 'select id from public.patients');
    expect(patienten).toHaveLength(0);
    const { rows: team } = await asUser(NEUES_KONTO, 'select id from public.staff_members');
    expect(team).toHaveLength(0);
  });

  it('bindet das Konto an Organisation, Person und Rollen', async () => {
    const staffId = await mitarbeiterAnlegen();
    const id = await einladen(staffId, NEUE_MAIL, ['therapist', 'team_lead']);
    await kontoAnlegen();

    const { rows } = await asUserCommitted<{ id: string }>(NEUES_KONTO, ANNEHMEN);
    expect(rows[0]?.id).toBe(NEUES_KONTO);

    const { rows: profil } = await asPostgres<{
      organization_id: string;
      person_id: string;
      display_name: string;
      is_active: boolean;
    }>(
      'select organization_id, person_id, display_name, is_active from public.user_profiles where id = $1',
      [NEUES_KONTO],
    );
    expect(profil[0]?.organization_id).toBe(organizationId);
    expect(profil[0]?.display_name).toBe('Nina Neu');
    expect(profil[0]?.is_active).toBe(true);

    const { rows: rollen } = await asPostgres<{ role_key: string }>(
      'select role_key from public.user_roles where user_id = $1 order by role_key',
      [NEUES_KONTO],
    );
    expect(rollen.map((r) => r.role_key)).toEqual(['team_lead', 'therapist']);

    const e = await einladung(id);
    expect(e.status).toBe('accepted');
    expect(e.accepted_user_id).toBe(NEUES_KONTO);
  });

  it('macht die Person damit fuer Termine zuordenbar (E11)', async () => {
    const staffId = await mitarbeiterAnlegen();
    await einladen(staffId, NEUE_MAIL, ['therapist']);
    await kontoAnlegen();
    await asUserCommitted(NEUES_KONTO, ANNEHMEN);

    const { rows } = await asUser<{ staff_member_id: string }>(
      users.ownerTherapist,
      'select staff_member_id from public.list_assignable_therapists()',
    );
    expect(rows.map((r) => r.staff_member_id)).toContain(staffId);
  });

  it('protokolliert die Annahme mit dem annehmenden Konto als Akteur', async () => {
    const staffId = await mitarbeiterAnlegen();
    await einladen(staffId, NEUE_MAIL, ['office']);
    await kontoAnlegen();
    await asUserCommitted(NEUES_KONTO, ANNEHMEN);

    const eintraege = await auditEintraege('staff_account.invitation_accepted');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]?.actor_user_id).toBe(NEUES_KONTO);
    expect(eintraege[0]?.subject_id).toBe(staffId);
    expect(eintraege[0]?.context).toEqual({ surface: 'web', roles: ['office'] });
  });

  it('ist wiederholbar, ohne ein zweites Mal zu schreiben', async () => {
    const staffId = await mitarbeiterAnlegen();
    await einladen(staffId);
    await kontoAnlegen();
    await asUserCommitted(NEUES_KONTO, ANNEHMEN);
    await asUserCommitted(NEUES_KONTO, ANNEHMEN);

    const { rows } = await asPostgres<{ anzahl: string }>(
      'select count(*) as anzahl from public.user_roles where user_id = $1',
      [NEUES_KONTO],
    );
    expect(rows[0]?.anzahl).toBe('1');
    expect(await auditEintraege('staff_account.invitation_accepted')).toHaveLength(1);
  });

  it('weist eine abgelaufene Einladung ab', async () => {
    const staffId = await mitarbeiterAnlegen();
    const id = await einladen(staffId);
    await asPostgres(
      "update public.staff_account_invitations set expires_at = now() - interval '1 day' where id = $1",
      [id],
    );
    await kontoAnlegen();

    await expect(asUser(NEUES_KONTO, ANNEHMEN)).rejects.toThrow(/no_open_invitation/);
    expect((await einladung(id)).status).toBe('pending');
  });

  it('weist eine widerrufene Einladung ab', async () => {
    const staffId = await mitarbeiterAnlegen();
    const id = await einladen(staffId);
    await asUserCommitted(users.ownerTherapist, WIDERRUFEN, [id]);
    await kontoAnlegen();

    await expect(asUser(NEUES_KONTO, ANNEHMEN)).rejects.toThrow(/no_open_invitation/);
  });

  it('weist ab, wenn die Person zwischenzeitlich ausgeschieden ist', async () => {
    const staffId = await mitarbeiterAnlegen();
    await einladen(staffId);
    await asUserCommitted(
      users.ownerTherapist,
      'select public.set_staff_employment_status($1::uuid, $2, $3)',
      [staffId, 'inactive', false],
    );
    await kontoAnlegen();

    await expect(asUser(NEUES_KONTO, ANNEHMEN)).rejects.toThrow(/no_open_invitation/);
  });

  it('bindet ausschliesslich an die eigene Adresse', async () => {
    const staffId = await mitarbeiterAnlegen();
    await einladen(staffId, NEUE_MAIL);
    // Ein anderes Konto meldet sich an - die Einladung gilt nicht fuer es.
    await kontoAnlegen('11111111-1111-4111-8111-0000000000bb', 'fremd@praxis.invalid');

    await expect(asUser('11111111-1111-4111-8111-0000000000bb', ANNEHMEN)).rejects.toThrow(
      /no_open_invitation/,
    );
  });

  it('vergleicht die Adresse ohne Ruecksicht auf Gross- und Kleinschreibung', async () => {
    const staffId = await mitarbeiterAnlegen();
    await einladen(staffId, NEUE_MAIL);
    await kontoAnlegen(NEUES_KONTO, 'Nina.Neu@Praxis.Invalid');

    await expect(asUserCommitted(NEUES_KONTO, ANNEHMEN)).resolves.toBeTruthy();
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(ANNEHMEN)).rejects.toThrow(/permission denied/i);
  });
});

// -----------------------------------------------------------------------------
// Lesepfade
// -----------------------------------------------------------------------------
describe('Lesepfade der Zugangsverwaltung', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('zeigt Einladungen nur der Praxisinhaberin', async () => {
    const staffId = await mitarbeiterAnlegen();
    await einladen(staffId);

    const { rows: alsOwner } = await asUser(
      users.ownerTherapist,
      'select id from public.staff_account_invitations',
    );
    expect(alsOwner).toHaveLength(1);

    for (const userId of [users.office, users.therapist, users.teamLead, users.patientMax]) {
      const { rows } = await asUser(userId, 'select id from public.staff_account_invitations');
      expect(rows).toHaveLength(0);
    }
  });

  it('haelt die Einladungstabelle fuer authenticated schreibgeschuetzt', async () => {
    await expect(
      asUser(users.ownerTherapist, 'delete from public.staff_account_invitations'),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(
        users.ownerTherapist,
        `update public.staff_account_invitations set status = 'accepted'`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('zeigt owner den Zugangsstand je Datensatz', async () => {
    const { rows } = await asUser<{
      staff_member_id: string;
      user_id: string | null;
      role_keys: string[] | null;
    }>(
      users.ownerTherapist,
      'select staff_member_id, user_id, role_keys from public.staff_account_directory order by staff_member_id',
    );
    const olivia = rows.find((r) => r.staff_member_id === STAFF.olivia);
    expect(olivia?.user_id).toBe(users.office);
    expect(olivia?.role_keys).toEqual(['office']);
  });

  it('liefert anderen Rollen nur den eigenen Zugang, nicht die der Kolleg:innen (4.7)', async () => {
    const { rows } = await asUser<{
      staff_member_id: string;
      user_id: string | null;
      role_keys: string[] | null;
    }>(
      users.therapist,
      'select staff_member_id, user_id, role_keys from public.staff_account_directory',
    );
    // Die Zeilen kommen (die Mitarbeiterliste ist fuer Praxisrollen lesbar),
    // aber der Zugangsteil bleibt leer - er wird nicht geliefert und im Client
    // ausgeblendet.
    expect(rows.find((r) => r.staff_member_id === STAFF.anna)?.user_id).toBe(users.therapist);
    expect(rows.find((r) => r.staff_member_id === STAFF.olivia)?.user_id).toBeNull();
    expect(rows.find((r) => r.staff_member_id === STAFF.olivia)?.role_keys).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Rollen aendern (STAFF-002c)
// -----------------------------------------------------------------------------
const ROLLEN = 'select public.set_staff_account_roles($1::uuid, $2::text[])';

async function rollen(userId: string): Promise<string[]> {
  const { rows } = await asPostgres<{ role_key: string }>(
    'select role_key from public.user_roles where user_id = $1 order by role_key',
    [userId],
  );
  return rows.map((r) => r.role_key);
}

describe('set_staff_account_roles', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('setzt die Rollen auf genau die uebergebene Liste', async () => {
    await asUserCommitted(users.ownerTherapist, ROLLEN, [STAFF.anna, ['office', 'team_lead']]);
    expect(await rollen(users.therapist)).toEqual(['office', 'team_lead']);
  });

  it('protokolliert hinzugekommene und weggefallene Rollen, nicht die ganze Liste', async () => {
    // Anna hat 'therapist'. Danach 'therapist' und 'office'.
    await asUserCommitted(users.ownerTherapist, ROLLEN, [STAFF.anna, ['therapist', 'office']]);

    const eintraege = await auditEintraege('staff_account.roles_changed');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]?.subject_id).toBe(STAFF.anna);
    expect(eintraege[0]?.context).toEqual({
      surface: 'web',
      added: ['office'],
      removed: [],
    });
  });

  it('schreibt bei wertgleichem Aufruf weder Rollen noch Auditeintrag', async () => {
    await asUserCommitted(users.ownerTherapist, ROLLEN, [STAFF.anna, ['therapist']]);
    expect(await rollen(users.therapist)).toEqual(['therapist']);
    expect(await auditEintraege('staff_account.roles_changed')).toHaveLength(0);
  });

  it('haelt die letzte aktive Praxisinhaberin in ihrer Rolle (ADR-012)', async () => {
    // Jannes ist owner und therapist und der einzige owner der Praxis.
    await expect(
      asUser(users.ownerTherapist, ROLLEN, [STAFF.jannes, ['therapist']]),
    ).rejects.toThrow(/last_owner_required/);
    expect(await rollen(users.ownerTherapist)).toEqual(['owner', 'therapist']);
  });

  it('laesst die Abberufung zu, sobald es eine zweite aktive Inhaberin gibt', async () => {
    await asUserCommitted(users.ownerTherapist, ROLLEN, [STAFF.anna, ['therapist', 'owner']]);
    await asUserCommitted(users.ownerTherapist, ROLLEN, [STAFF.jannes, ['therapist']]);
    expect(await rollen(users.ownerTherapist)).toEqual(['therapist']);
  });

  it('zaehlt eine gesperrte zweite Inhaberin nicht mit', async () => {
    await asUserCommitted(users.ownerTherapist, ROLLEN, [STAFF.anna, ['owner']]);
    await asUserCommitted(users.ownerTherapist, SPERREN, [STAFF.anna, false]);
    await expect(
      asUser(users.ownerTherapist, ROLLEN, [STAFF.jannes, ['therapist']]),
    ).rejects.toThrow(/last_owner_required/);
  });

  it.each([
    ['office', users.office],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('verweigert %s den Rollenwechsel (E10, ADR-004)', async (_rolle, userId) => {
    await expect(asUser(userId, ROLLEN, [STAFF.anna, ['office']])).rejects.toThrow(
      /not allowed to manage accounts/,
    );
  });

  it.each([
    ['leer', []],
    ['unbekannt', ['chef']],
    ['patient', ['patient']],
  ])('weist eine Rollenliste ab, die %s ist', async (_fall, liste) => {
    await expect(asUser(users.ownerTherapist, ROLLEN, [STAFF.anna, liste])).rejects.toThrow(
      /at least one role is required|unknown role/,
    );
  });

  it('weist einen Datensatz ohne Zugang ab', async () => {
    const staffId = await mitarbeiterAnlegen();
    await expect(asUser(users.ownerTherapist, ROLLEN, [staffId, ['office']])).rejects.toThrow(
      /account not found/,
    );
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(ROLLEN, [STAFF.anna, ['office']])).rejects.toThrow(/permission denied/i);
  });
});

// -----------------------------------------------------------------------------
// Sperren (STAFF-003)
// -----------------------------------------------------------------------------
describe('set_staff_account_active', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  async function istAktiv(userId: string): Promise<boolean> {
    const { rows } = await asPostgres<{ is_active: boolean }>(
      'select is_active from public.user_profiles where id = $1',
      [userId],
    );
    return rows[0]!.is_active;
  }

  it('sperrt den Zugang und nimmt damit jeden Datenzugriff', async () => {
    await asUserCommitted(users.ownerTherapist, SPERREN, [STAFF.anna, false]);
    expect(await istAktiv(users.therapist)).toBe(false);

    const { rows: org } = await asUser<{ id: string | null }>(
      users.therapist,
      'select app.current_organization_id() as id',
    );
    expect(org[0]?.id).toBeNull();
    const { rows: patienten } = await asUser(users.therapist, 'select id from public.patients');
    expect(patienten).toHaveLength(0);
  });

  it('laesst das gesperrte Konto sein eigenes Profil weiter lesen', async () => {
    // Sonst koennte die Anwendung "gesperrt" nicht von "nie eingerichtet"
    // unterscheiden und wuerde eine irrefuehrende Seite zeigen (13).
    await asUserCommitted(users.ownerTherapist, SPERREN, [STAFF.anna, false]);
    const { rows } = await asUser<{ is_active: boolean }>(
      users.therapist,
      'select is_active from public.user_profiles where id = $1',
      [users.therapist],
    );
    expect(rows[0]?.is_active).toBe(false);
  });

  it('laesst den Beschaeftigungsstatus unberuehrt', async () => {
    await asUserCommitted(users.ownerTherapist, SPERREN, [STAFF.anna, false]);
    const { rows } = await asPostgres<{ employment_status: string }>(
      'select employment_status from public.staff_members where id = $1',
      [STAFF.anna],
    );
    expect(rows[0]?.employment_status).toBe('active');
  });

  it('entsperrt wieder und protokolliert beides getrennt', async () => {
    await asUserCommitted(users.ownerTherapist, SPERREN, [STAFF.anna, false]);
    await asUserCommitted(users.ownerTherapist, SPERREN, [STAFF.anna, true]);
    expect(await istAktiv(users.therapist)).toBe(true);

    expect(await auditEintraege('staff_account.locked')).toHaveLength(1);
    expect(await auditEintraege('staff_account.unlocked')).toHaveLength(1);
  });

  it('schreibt bei wertgleichem Aufruf keinen Auditeintrag', async () => {
    await asUserCommitted(users.ownerTherapist, SPERREN, [STAFF.anna, true]);
    expect(await auditEintraege()).toEqual([]);
  });

  it('laesst niemanden sich selbst aussperren (ADR-012)', async () => {
    await expect(asUser(users.ownerTherapist, SPERREN, [STAFF.jannes, false])).rejects.toThrow(
      /cannot_lock_own_account/,
    );
  });

  it('haelt die letzte aktive Praxisinhaberin entsperrt - auch als sie selbst', async () => {
    // Anna wird zweite Inhaberin, Jannes legt seine Rolle ab. Anna ist damit
    // die letzte; der Versuch scheitert an der Selbstsperre, die hier zuerst
    // greift. Dass die Regel "letzte Inhaberin" ueber die Selbstsperre hinaus
    // nicht erreichbar ist, steht als Anmerkung in der Migration - sie bleibt
    // als zweite Linie stehen, falls das Sperren spaeter geoeffnet wird.
    await asUserCommitted(users.ownerTherapist, ROLLEN, [STAFF.anna, ['owner']]);
    await asUserCommitted(users.ownerTherapist, ROLLEN, [STAFF.jannes, ['therapist']]);
    await expect(asUser(users.therapist, SPERREN, [STAFF.anna, false])).rejects.toThrow(
      /cannot_lock_own_account/,
    );
  });

  it('laesst eine Inhaberin sperren, solange eine zweite aktiv bleibt', async () => {
    await asUserCommitted(users.ownerTherapist, ROLLEN, [STAFF.anna, ['owner']]);
    await asUserCommitted(users.ownerTherapist, SPERREN, [STAFF.anna, false]);
    expect(await istAktiv(users.therapist)).toBe(false);
  });

  it.each([
    ['office', users.office],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('verweigert %s das Sperren', async (_rolle, userId) => {
    await expect(asUser(userId, SPERREN, [STAFF.olivia, false])).rejects.toThrow(
      /not allowed to manage accounts/,
    );
  });

  it('weist einen Datensatz ohne Zugang ab', async () => {
    const staffId = await mitarbeiterAnlegen();
    await expect(asUser(users.ownerTherapist, SPERREN, [staffId, false])).rejects.toThrow(
      /account not found/,
    );
  });
});

// -----------------------------------------------------------------------------
// Kennwort zuruecksetzen anstossen (STAFF-003)
// -----------------------------------------------------------------------------
describe('request_staff_password_reset', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('liefert die Anmeldeadresse und protokolliert den Anstoss', async () => {
    const { rows } = await asUserCommitted<{ email: string }>(
      users.ownerTherapist,
      'select public.request_staff_password_reset($1::uuid) as email',
      [STAFF.anna],
    );
    expect(rows[0]?.email).toBe('anna.beispiel@praxis.invalid');

    const eintraege = await auditEintraege('staff_account.password_reset_requested');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]?.subject_id).toBe(STAFF.anna);
    // Kein Kennwort, kein Token, keine Adresse im Nachweis (ADR-010).
    expect(JSON.stringify(eintraege[0])).not.toContain('anna.beispiel@');
  });

  it.each([
    ['office', users.office],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('verweigert %s den Anstoss', async (_rolle, userId) => {
    await expect(
      asUser(userId, 'select public.request_staff_password_reset($1::uuid)', [STAFF.anna]),
    ).rejects.toThrow(/not allowed to manage accounts/);
  });

  it('weist einen Datensatz ohne Zugang ab', async () => {
    const staffId = await mitarbeiterAnlegen();
    await expect(
      asUser(users.ownerTherapist, 'select public.request_staff_password_reset($1::uuid)', [
        staffId,
      ]),
    ).rejects.toThrow(/account not found/);
  });
});

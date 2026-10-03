import { zugangsdienstLoescht } from './helpers/zugangsdienst';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asServiceRole,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenSchreibversuch } from './helpers/abgewiesen';

/**
 * Zugang und Einladung zur Plattform (POR-002, ADR-023 Punkte 3 bis 11, 15).
 *
 * Die Praxis lädt aus dem Verhältnis ein, sperrt, entsperrt und entzieht; der
 * Zugangsdienst (hier als `service_role`) löst die Einladung ein. Geprüft
 * werden die Rollen je Verhältnis, die Zustände, der Code (nur als Hash
 * gespeichert, einmalig), die Riegel zwischen Praxis- und Plattformkonto und
 * zwischen Personen, und der Nachzug im Löschlauf.
 */

const { users, patients, trainingRelationships, platformAccesses, organizationId } = SEED;

const EINLADEN = 'select * from public.invite_platform_access($1, $2::uuid, $3, $4::boolean)';
const SPERREN = 'select public.set_platform_access_locked($1::uuid, $2::boolean) as status';
const ENTZIEHEN = 'select public.revoke_platform_access($1::uuid) as status';
const ZUSTAND = 'select * from public.get_platform_access($1, $2::uuid)';
const NACHSCHLAGEN = 'select * from public.platform_invitation_lookup($1)';
const EINLOESEN = 'select public.redeem_platform_invitation($1, $2::uuid) as access_id';
const MAIL = 'select * from public.platform_invitation_mail($1::uuid, $2)';

interface Einladung {
  access_id: string;
  invitation_id: string;
  purpose: string;
  code: string;
  expires_at: string;
}

async function einladen(
  konto: string,
  art: 'treatment' | 'training',
  verhaeltnis: string,
  weg: 'on_site' | 'email' = 'on_site',
  bestaetigt = false,
): Promise<Einladung> {
  const { rows } = await asUserCommitted<Einladung>(konto, EINLADEN, [
    art,
    verhaeltnis,
    weg,
    bestaetigt,
  ]);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

/** Ein Konto beim Anmeldedienst, wie es der Zugangsdienst anlegt. */
async function neuesKonto(id: string, email: string): Promise<string> {
  await asPostgres(
    `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)`,
    [id, email],
  );
  return id;
}

async function zugang(id: string) {
  const { rows } = await asPostgres<{
    status: string;
    account_user_id: string | null;
    revoked_reason: string | null;
    patient_id: string | null;
    relationship_id: string;
  }>(
    'select status, account_user_id, revoked_reason, patient_id, relationship_id from public.platform_accesses where id = $1',
    [id],
  );
  return rows[0];
}

/** Nur der SHA-256 des Codes erreicht die Datenbank (Zweitreview, ADR-011). */
function h(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

const KONTO_MAX = '99999999-9999-4999-8999-0000000000a1';
const KONTO_FREMD = '99999999-9999-4999-8999-0000000000a2';

describe('Plattformzugang: einladen (ADR-023 Punkte 6 bis 8)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('laedt vor Ort ein und liefert den Code einmal; gespeichert ist nur sein Hash', async () => {
    const einladung = await einladen(users.therapist, 'treatment', patients.max);
    expect(einladung.purpose).toBe('activate');
    expect(einladung.code).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const { rows } = await asPostgres<{ code_hash: string; email: string | null; channel: string }>(
      'select code_hash, email, channel from public.platform_access_invitations where id = $1',
      [einladung.invitation_id],
    );
    expect(rows[0]?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.code_hash).not.toContain(einladung.code);
    expect(rows[0]?.email).toBeNull();
    expect(rows[0]?.channel).toBe('on_site');

    expect((await zugang(einladung.access_id))?.status).toBe('invited');

    // Der Code steht in keinem Auditeintrag (ADR-011).
    const audit = await asPostgres<{ context: unknown }>(
      `select context from public.audit_log where action = 'platform_access.invited'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows)).not.toContain(einladung.code);
    expect(audit.rows[0]?.context).toMatchObject({ channel: 'on_site', purpose: 'activate' });
  });

  it('laesst die Rollen einladen, die das Verhaeltnis schreiben (Punkt 6)', async () => {
    for (const konto of [users.ownerTherapist, users.teamLead, users.office]) {
      await resetDatabase();
      await einladen(konto, 'treatment', patients.max);
    }
    for (const konto of [users.ownerTherapist, users.trainer, users.office]) {
      await resetDatabase();
      // Erikas Training: Tina hat schon einen Zugang, und ohne Geburtsdatum
      // gibt es keinen (siehe unten).
      await asPostgres(
        `insert into public.training_contact_details (training_relationship_id, organization_id, date_of_birth)
         values ($1, $2, '1963-09-17')
         on conflict (training_relationship_id) do update set date_of_birth = excluded.date_of_birth`,
        [trainingRelationships.erika, organizationId],
      );
      await asPostgres(
        `update public.platform_accesses set status = 'revoked', revoked_at = now(), revoked_reason = 'practice'
         where id = $1`,
        [platformAccesses.erikaTraining],
      );
      await einladen(konto, 'training', trainingRelationships.erika);
    }
  });

  it('weist die Trainingsbetreuung an der Akte ab und die Behandlung am Training (§4.8)', async () => {
    await erwarteAbgewiesenenSchreibversuch(
      users.trainer,
      EINLADEN,
      ['treatment', patients.max, 'on_site', false],
      'platform_access.invited',
    );
    await erwarteAbgewiesenenSchreibversuch(
      users.therapist,
      EINLADEN,
      ['training', trainingRelationships.tina, 'on_site', false],
      'platform_access.invited',
    );
    await erwarteAbgewiesenenSchreibversuch(
      users.patientMax,
      EINLADEN,
      ['treatment', patients.max, 'on_site', false],
      'platform_access.invited',
    );
    // Max hat seit POR-EPIC-001b eine Begleitung im Seed, aber keinen eigenen Zugang.
    const { rows } = await asPostgres(
      "select 1 from public.platform_accesses where relationship_id = $1 and access_kind = 'self'",
      [patients.max],
    );
    expect(rows).toEqual([]);
  });

  it('findet kein Verhaeltnis einer anderen Organisation', async () => {
    const fremd = await fremdeOrganisation();
    await expect(
      asUser(fremd.owner, EINLADEN, ['treatment', patients.max, 'on_site', false]),
    ).rejects.toThrow(/relationship not found/);
  });

  // BEF-121: Der Tag der Praxis (Europe/Berlin, wie die Einladung rechnet),
  // nicht current_date in UTC - sonst ist der Test zwischen 22 und 24 Uhr UTC rot.
  it('verlangt ein Geburtsdatum und mindestens 18 Jahre (Punkt 15, ANN-190)', async () => {
    await asPostgres(
      `update public.patient_contact_details set date_of_birth = null where patient_id = $1`,
      [patients.max],
    );
    await expect(
      asUser(users.therapist, EINLADEN, ['treatment', patients.max, 'on_site', false]),
    ).rejects.toThrow(/date of birth required/);

    await asPostgres(
      `update public.patient_contact_details
          set date_of_birth = ((now() at time zone 'Europe/Berlin')::date - interval '18 years' + interval '1 day')::date
        where patient_id = $1`,
      [patients.max],
    );
    await expect(
      asUser(users.therapist, EINLADEN, ['treatment', patients.max, 'on_site', false]),
    ).rejects.toThrow(/under age/);

    await asPostgres(
      `update public.patient_contact_details
          set date_of_birth = ((now() at time zone 'Europe/Berlin')::date - interval '18 years')::date
        where patient_id = $1`,
      [patients.max],
    );
    await einladen(users.therapist, 'treatment', patients.max);
  });

  it('schickt per Mail nur an die Adresse im Verhaeltnis und nur bestaetigt (Punkt 11, ANN-188)', async () => {
    await expect(
      asUser(users.office, EINLADEN, ['treatment', patients.max, 'email', false]),
    ).rejects.toThrow(/address must be confirmed/);

    const einladung = await einladen(users.office, 'treatment', patients.max, 'email', true);
    const { rows } = await asPostgres<{
      email: string;
      address_confirmed_by: string;
      address_confirmed_at: string | null;
    }>(
      'select email, address_confirmed_by, address_confirmed_at from public.platform_access_invitations where id = $1',
      [einladung.invitation_id],
    );
    expect(rows[0]?.email).toBe('max.mustermann@patient.invalid');
    expect(rows[0]?.address_confirmed_by).toBe(users.office);
    expect(rows[0]?.address_confirmed_at).not.toBeNull();

    // Petra hat keine Adresse.
    await expect(
      asUser(users.office, EINLADEN, ['treatment', patients.petra, 'email', true]),
    ).rejects.toThrow(/no email address/);
  });

  it('nimmt eine offene Einladung zurueck, wenn eine neue kommt', async () => {
    const erste = await einladen(users.therapist, 'treatment', patients.max);
    const zweite = await einladen(users.therapist, 'treatment', patients.max);
    expect(zweite.access_id).toBe(erste.access_id);

    const { rows } = await asServiceRole(NACHSCHLAGEN, [h(erste.code)]);
    expect(rows).toEqual([]);
    expect((await asServiceRole(NACHSCHLAGEN, [h(zweite.code)])).rows).toHaveLength(1);
  });
});

describe('Plattformzugang: einloesen durch den Zugangsdienst (Punkte 7, 9, 10)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('bindet das Konto und schreibt den Vorgang auf das Plattformkonto', async () => {
    const einladung = await einladen(users.therapist, 'treatment', patients.max);
    const nachgeschlagen = await asServiceRole<{
      purpose: string;
      account_user_id: string | null;
      organization_name: string;
    }>(NACHSCHLAGEN, [h(einladung.code)]);
    expect(nachgeschlagen.rows).toEqual([
      { purpose: 'activate', account_user_id: null, organization_name: 'Test Praxis Tuebingen' },
    ]);

    await neuesKonto(KONTO_MAX, 'max.plattform@patient.invalid');
    const { rows } = await asServiceRole<{ access_id: string }>(EINLOESEN, [
      h(einladung.code),
      KONTO_MAX,
    ]);
    expect(rows[0]?.access_id).toBe(einladung.access_id);
    expect(await zugang(einladung.access_id)).toMatchObject({
      status: 'active',
      account_user_id: KONTO_MAX,
    });

    const audit = await asPostgres<{ actor_user_id: string; actor_kind: string }>(
      `select actor_user_id, actor_kind from public.audit_log where action = 'platform_access.activated'`,
    );
    expect(audit.rows).toEqual([{ actor_user_id: KONTO_MAX, actor_kind: 'platform' }]);

    // Kein Profil, keine Rolle (Punkte 2 und 3).
    const profil = await asPostgres('select 1 from public.user_profiles where id = $1', [
      KONTO_MAX,
    ]);
    expect(profil.rows).toEqual([]);
  });

  it('gibt fuer benutzte, abgelaufene und unbekannte Codes dieselbe Auskunft (§13)', async () => {
    const einladung = await einladen(users.therapist, 'treatment', patients.max);
    await neuesKonto(KONTO_MAX, 'max.plattform@patient.invalid');
    await asServiceRole(EINLOESEN, [h(einladung.code), KONTO_MAX]);

    // benutzt
    expect((await asServiceRole(NACHSCHLAGEN, [h(einladung.code)])).rows).toEqual([]);
    await expect(asServiceRole(EINLOESEN, [h(einladung.code), KONTO_MAX])).rejects.toThrow(
      /invitation not valid/,
    );
    // unbekannt
    expect((await asServiceRole(NACHSCHLAGEN, [h('erfunden')])).rows).toEqual([]);
    await expect(asServiceRole(EINLOESEN, [h('erfunden'), KONTO_MAX])).rejects.toThrow(
      /invitation not valid/,
    );
    // abgelaufen
    const zweite = await einladen(users.therapist, 'treatment', patients.petra);
    await asPostgres(
      `update public.platform_access_invitations set expires_at = now() - interval '1 minute'
       where id = $1`,
      [zweite.invitation_id],
    );
    expect((await asServiceRole(NACHSCHLAGEN, [h(zweite.code)])).rows).toEqual([]);
    await expect(asServiceRole(EINLOESEN, [h(zweite.code), KONTO_FREMD])).rejects.toThrow(
      /invitation not valid/,
    );
  });

  it('ist fuer angemeldete Konten nicht aufrufbar, nur fuer den Zugangsdienst', async () => {
    const einladung = await einladen(users.therapist, 'treatment', patients.max);
    for (const konto of [users.ownerTherapist, users.plattformTina]) {
      await expect(asUser(konto, NACHSCHLAGEN, [h(einladung.code)])).rejects.toThrow(
        /permission denied/,
      );
      await expect(asUser(konto, EINLOESEN, [einladung.code, konto])).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it('bindet kein Praxiskonto (Punkt 2, W1)', async () => {
    const einladung = await einladen(users.therapist, 'treatment', patients.max);
    await expect(asServiceRole(EINLOESEN, [h(einladung.code), users.therapist])).rejects.toThrow(
      /practice account cannot hold platform access/,
    );
    // Auch ein Konto mit Profil ohne Rolle nicht.
    await expect(asServiceRole(EINLOESEN, [h(einladung.code), users.patientMax])).rejects.toThrow(
      /practice account cannot hold platform access/,
    );
  });

  it('bindet kein Konto einer anderen Person, wohl aber ein zweites Verhaeltnis derselben (Punkt 4)', async () => {
    const einladung = await einladen(users.therapist, 'treatment', patients.max);
    // Tinas Plattformkonto gehoert Tina.
    await expect(
      asServiceRole(EINLOESEN, [h(einladung.code), users.plattformTina]),
    ).rejects.toThrow(/account belongs to another person/);

    // Erikas Konto hat zwei Zugaenge zu Erika - der Seed laeuft genau durch
    // diesen Riegel.
    const { rows } = await asPostgres<{ n: string }>(
      `select count(*)::text as n from public.platform_accesses where account_user_id = $1 and status = 'active'`,
      [users.plattformErika],
    );
    expect(rows[0]?.n).toBe('2');
  });

  it('gibt einem Plattformkonto nie ein Profil (Punkt 2, Gegenrichtung)', async () => {
    await expect(
      asPostgres(
        `insert into public.user_profiles (id, organization_id, person_id, display_name)
         values ($1, $2, $3, 'Tina')`,
        [users.plattformTina, organizationId, SEED.persons.tina],
      ),
    ).rejects.toThrow(/platform account cannot be a practice account/);
  });

  it('setzt fuer einen aktiven Zugang ein neues Kennwort statt eines zweiten Kontos (Punkt 10)', async () => {
    const einladung = await einladen(users.office, 'treatment', patients.erika);
    expect(einladung.purpose).toBe('reset');
    expect(einladung.access_id).toBe(platformAccesses.erikaBehandlung);

    const { rows } = await asServiceRole<{ purpose: string; account_user_id: string }>(
      NACHSCHLAGEN,
      [h(einladung.code)],
    );
    expect(rows[0]).toMatchObject({ purpose: 'reset', account_user_id: users.plattformErika });

    // Ein anderes Konto kann eine Einladung zum neuen Kennwort nicht nutzen.
    await expect(
      asServiceRole(EINLOESEN, [h(einladung.code), users.plattformTina]),
    ).rejects.toThrow(/invitation not valid/);

    const auditVorher = await asPostgres('select 1 from public.audit_log where subject_id = $1', [
      platformAccesses.erikaBehandlung,
    ]);
    await asServiceRole(EINLOESEN, [h(einladung.code), users.plattformErika]);

    // Das neue Kennwort weist die Einladung selbst nach - wer sie ausgestellt
    // hat und wann sie eingeloest wurde; das Auditlog fuehrt es nicht mehr
    // (LOG-EPIC-001).
    const { rows: einloesung } = await asPostgres<{
      purpose: string;
      status: string;
      created_by: string;
      eingeloest: boolean;
    }>(
      `select purpose, status, created_by, redeemed_at is not null as eingeloest
         from public.platform_access_invitations where id = $1`,
      [einladung.invitation_id],
    );
    expect(einloesung).toEqual([
      { purpose: 'reset', status: 'redeemed', created_by: users.office, eingeloest: true },
    ]);
    expect(await zugang(platformAccesses.erikaBehandlung)).toMatchObject({
      status: 'active',
      account_user_id: users.plattformErika,
    });
    const auditNachher = await asPostgres('select 1 from public.audit_log where subject_id = $1', [
      platformAccesses.erikaBehandlung,
    ]);
    expect(auditNachher.rows).toHaveLength(auditVorher.rows.length);
  });
});

describe('Plattformzugang: sperren, entsperren, entziehen (Punkte 4 bis 6)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('sperrt, entsperrt und entzieht; jeder Schritt steht im Protokoll', async () => {
    const id = platformAccesses.erikaBehandlung;
    expect((await asUserCommitted(users.therapist, SPERREN, [id, true])).rows[0]).toEqual({
      status: 'locked',
    });
    expect((await zugang(id))?.status).toBe('locked');

    // Gesperrt gibt es keine Einladung, auch keine zum neuen Kennwort.
    await expect(
      asUser(users.therapist, EINLADEN, ['treatment', patients.erika, 'on_site', false]),
    ).rejects.toThrow(/locked/);

    await asUserCommitted(users.therapist, SPERREN, [id, false]);
    expect((await zugang(id))?.status).toBe('active');

    await asUserCommitted(users.office, ENTZIEHEN, [id]);
    expect(await zugang(id)).toMatchObject({ status: 'revoked', revoked_reason: 'practice' });

    const audit = await asPostgres<{ action: string }>(
      `select action from public.audit_log where subject_type = 'platform_access' order by occurred_at, id`,
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'platform_access.locked',
      'platform_access.unlocked',
      'platform_access.revoked',
    ]);
  });

  it('beruehrt das Verhaeltnis nicht, und eine Sperre im Training nicht die Behandlung (§4.8)', async () => {
    const vorher = await asPostgres('select * from public.patients where id = $1', [
      patients.erika,
    ]);
    await asUserCommitted(users.trainer, SPERREN, [platformAccesses.erikaTraining, true]);
    await asUserCommitted(users.office, ENTZIEHEN, [platformAccesses.erikaTraining]);
    expect((await zugang(platformAccesses.erikaBehandlung))?.status).toBe('active');
    const nachher = await asPostgres('select * from public.patients where id = $1', [
      patients.erika,
    ]);
    expect(nachher.rows).toEqual(vorher.rows);
  });

  it('weist fremde Rollen und unbekannte Zugaenge mit Protokoll ab', async () => {
    await erwarteAbgewiesenenSchreibversuch(
      users.therapist,
      SPERREN,
      [platformAccesses.tinaTraining, true],
      'platform_access.locked',
    );
    await erwarteAbgewiesenenSchreibversuch(
      users.trainer,
      ENTZIEHEN,
      [platformAccesses.erikaBehandlung],
      'platform_access.revoked',
    );
    await erwarteAbgewiesenenSchreibversuch(
      users.office,
      ENTZIEHEN,
      ['99999999-9999-4999-8999-0000000000ff'],
      'platform_access.revoked',
    );
    const fremd = await fremdeOrganisation();
    await erwarteAbgewiesenenSchreibversuch(
      fremd.owner,
      ENTZIEHEN,
      [platformAccesses.erikaBehandlung],
      'platform_access.revoked',
    );
    expect((await zugang(platformAccesses.erikaBehandlung))?.status).toBe('active');
    expect((await zugang(platformAccesses.tinaTraining))?.status).toBe('active');
  });

  it('nimmt mit dem Entziehen die offene Einladung zurueck', async () => {
    const einladung = await einladen(users.therapist, 'treatment', patients.max);
    await asUserCommitted(users.therapist, ENTZIEHEN, [einladung.access_id]);
    expect((await asServiceRole(NACHSCHLAGEN, [h(einladung.code)])).rows).toEqual([]);
    // Ein neuer Zugang ist eine neue Einladung (Punkt 3).
    const neu = await einladen(users.therapist, 'treatment', patients.max);
    expect(neu.access_id).not.toBe(einladung.access_id);
  });
});

describe('Plattformzugang: Abschnitt "Plattform" und Mail (Punkte 6, 10, 11)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt den Zustand ohne Code und ohne Konto', async () => {
    const { rows } = await asUser<Record<string, unknown>>(users.office, ZUSTAND, [
      'treatment',
      patients.erika,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: platformAccesses.erikaBehandlung, status: 'active' });
    expect(Object.keys(rows[0]!)).not.toContain('account_user_id');
    expect(Object.keys(rows[0]!)).not.toContain('code');
    expect(Object.keys(rows[0]!)).not.toContain('code_hash');

    // Ohne Zugang: eine leere Zeile, damit der Abschnitt "Einladen" zeigen kann.
    const leer = await asUser<{ id: string | null }>(users.office, ZUSTAND, [
      'treatment',
      patients.max,
    ]);
    expect(leer.rows).toHaveLength(1);
    expect(leer.rows[0]?.id).toBeNull();
  });

  it('zeigt den Zustand nur den Rollen, die das Verhaeltnis lesen', async () => {
    const { rows } = await asUserCommitted(users.trainer, ZUSTAND, ['treatment', patients.erika]);
    expect(rows).toEqual([]);
    const denied = await asPostgres(
      `select 1 from public.audit_log where action = 'access.denied' and context ->> 'operation' = 'platform_accesses.read' and outcome = 'denied' and actor_user_id = $1`,
      [users.trainer],
    );
    expect(denied.rows).toHaveLength(1);

    const fremd = await fremdeOrganisation();
    expect((await asUser(fremd.owner, ZUSTAND, ['treatment', patients.erika])).rows).toEqual([]);
  });

  it('liefert dem Zugangsdienst die Adresse nur mit Einladung, Code und Rolle', async () => {
    const einladung = await einladen(users.office, 'treatment', patients.max, 'email', true);
    const { rows } = await asUserCommitted<{ email: string; organization_name: string }>(
      users.office,
      MAIL,
      [einladung.invitation_id, h(einladung.code)],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        email: 'max.mustermann@patient.invalid',
        organization_name: 'Test Praxis Tuebingen',
      }),
    ]);

    await expect(
      asUser(users.office, MAIL, [einladung.invitation_id, h('falsch')]),
    ).rejects.toThrow(/cannot be sent/);
    await erwarteAbgewiesenenSchreibversuch(
      users.trainer,
      MAIL,
      [einladung.invitation_id, h(einladung.code)],
      'platform_access.invitation_sent',
    );

    // Adresse geaendert: neue Einladung noetig (Punkt 11).
    await asPostgres(
      `update public.patient_contact_details set email = 'neu@patient.invalid' where patient_id = $1`,
      [patients.max],
    );
    await expect(
      asUser(users.office, MAIL, [einladung.invitation_id, h(einladung.code)]),
    ).rejects.toThrow(/address changed/);
  });

  it('versendet keine Einladung, die vor Ort uebergeben wird', async () => {
    const einladung = await einladen(users.office, 'treatment', patients.max);
    await expect(
      asUser(users.office, MAIL, [einladung.invitation_id, h(einladung.code)]),
    ).rejects.toThrow(/cannot be sent/);
  });
});

describe('Plattformzugang im Loeschlauf (ADR-023 Punkt 5, ANN-189)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('beendet den Zugang, wenn das Verhaeltnis faellt, und loest den Nachweis davon', async () => {
    // Tinas Training faellt (derselbe Weg wie im Lauf und bei einer Loeschung
    // auf Antrag). Eine offene Einladung per Mail haengt noch daran.
    await asPostgres(
      `update public.training_contact_details set date_of_birth = '1990-01-01'
        where training_relationship_id = $1`,
      [trainingRelationships.tina],
    );
    const einladung = await einladen(
      users.office,
      'training',
      trainingRelationships.tina,
      'email',
      true,
    );
    expect(einladung.purpose).toBe('reset');

    await asPostgres(
      'select app.delete_training_relationship($1::uuid, extensions.gen_random_uuid(), now())',
      [trainingRelationships.tina],
    );

    expect(await zugang(platformAccesses.tinaTraining)).toMatchObject({
      status: 'revoked',
      revoked_reason: 'relationship_deleted',
      patient_id: null,
      relationship_id: trainingRelationships.tina,
    });
    // Der Nachweis traegt keinen Inhalt aus dem Verhaeltnis mehr (Punkt 5).
    const einladungen = await asPostgres<{ email: string | null; status: string }>(
      'select email, status from public.platform_access_invitations where platform_access_id = $1',
      [platformAccesses.tinaTraining],
    );
    expect(einladungen.rows).toEqual([{ email: null, status: 'revoked' }]);
    // Und er haelt die Person nicht fest: Tina hatte nur das Training.
    const person = await asPostgres('select 1 from public.persons where id = $1', [
      SEED.persons.tina,
    ]);
    expect(person.rows).toEqual([]);
  });

  it('raeumt mit der Akte nach zehn Jahren auch Konto und Nachweis ab', async () => {
    const einladung = await einladen(users.office, 'treatment', patients.max);
    await neuesKonto(KONTO_MAX, 'max.plattform@patient.invalid');
    await asServiceRole(EINLOESEN, [h(einladung.code), KONTO_MAX]);

    // Elf Jahre nach Abschluss, ohne Rechnung: Die Akte faellt. Der Zugang
    // endete 30 Tage nach dem Abschluss (Lesefrist, D2), das Konto 30 Tage
    // spaeter, der Nachweis drei Jahre danach - alles laengst faellig.
    await asPostgres(
      `update public.patients
          set care_started_on = (current_date - interval '12 years')::date,
              care_concluded_on = (current_date - interval '11 years')::date,
              care_concluded_at = now(), care_concluded_by = $2::uuid
        where id = $1`,
      [patients.max, users.therapist],
    );
    await asPostgres('select public.apply_retention()');
    await zugangsdienstLoescht();

    expect(
      (await asPostgres('select 1 from public.patients where id = $1', [patients.max])).rows,
    ).toEqual([]);
    expect((await asPostgres('select 1 from auth.users where id = $1', [KONTO_MAX])).rows).toEqual(
      [],
    );
    expect(await zugang(einladung.access_id)).toBeUndefined();

    const journal = await asPostgres<{ target_table: string }>(
      `select target_table from public.deletion_journal where target_id in ($1, $2) order by 1`,
      [KONTO_MAX, einladung.access_id],
    );
    expect(journal.rows.map((r) => r.target_table)).toEqual(['auth_users', 'platform_accesses']);
  });

  it('loescht das Konto 30 Tage nach dem Ende, den Nachweis nach drei Jahren', async () => {
    const id = platformAccesses.tinaTraining;
    await asUserCommitted(users.office, ENTZIEHEN, [id]);

    // Gerade entzogen: nichts faellt.
    await asPostgres('select public.apply_retention()');
    expect(
      (await asPostgres('select 1 from auth.users where id = $1', [users.plattformTina])).rows,
    ).toHaveLength(1);

    // 31 Tage her: das Konto faellt, der Zugang bleibt als Nachweis.
    await asPostgres(
      `update public.platform_accesses set revoked_at = now() - interval '31 days' where id = $1`,
      [id],
    );
    await asPostgres('select public.apply_retention()');
    // ABN-011: Der Lauf gibt nur den Auftrag; das Konto steht noch, bis der
    // Zugangsdienst es ueber die Admin-API entfernt und bestaetigt.
    expect(
      (await asPostgres('select 1 from auth.users where id = $1', [users.plattformTina])).rows,
    ).toHaveLength(1);
    expect(
      (
        await asPostgres(`select 1 from public.deletion_journal where target_id = $1`, [
          users.plattformTina,
        ])
      ).rows,
    ).toEqual([]);
    expect(await zugangsdienstLoescht()).toEqual([users.plattformTina]);
    expect(
      (await asPostgres('select 1 from auth.users where id = $1', [users.plattformTina])).rows,
    ).toEqual([]);
    expect((await zugang(id))?.status).toBe('revoked');
    const journal = await asPostgres<{ target_table: string }>(
      `select target_table from public.deletion_journal where target_id = $1`,
      [users.plattformTina],
    );
    expect(journal.rows).toEqual([{ target_table: 'auth_users' }]);

    // Drei Jahre und einen Tag her: der Nachweis faellt mit seinen Einladungen.
    await asPostgres(
      `update public.platform_accesses set revoked_at = now() - interval '3 years 1 day' where id = $1`,
      [id],
    );
    await asPostgres('select public.apply_retention()');
    expect(await zugang(id)).toBeUndefined();

    // Nach einem Restore zieht das Journal beides erneut nach.
    await asPostgres(
      `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', 'tina.plattform@patient.invalid')`,
      [users.plattformTina],
    );
    await asPostgres('select public.reapply_deletion_journal()');
    expect(await zugangsdienstLoescht()).toEqual([users.plattformTina]);
    expect(
      (await asPostgres('select 1 from auth.users where id = $1', [users.plattformTina])).rows,
    ).toEqual([]);
  });

  /**
   * ABN-011 (BEF-115): Das Konto faellt 30 Tage nach dem Ende ALLER seiner
   * Zugaenge - auch wenn einer frueher endet.
   */
  it('loescht ein Konto mit zwei Zugaengen erst 30 Tage nach dem spaeteren Ende', async () => {
    await asUserCommitted(users.office, ENTZIEHEN, [platformAccesses.erikaTraining]);
    await asUserCommitted(users.office, ENTZIEHEN, [platformAccesses.erikaBehandlung]);
    await asPostgres(
      `update public.platform_accesses set revoked_at = now() - interval '90 days' where id = $1`,
      [platformAccesses.erikaTraining],
    );
    await asPostgres(
      `update public.platform_accesses set revoked_at = now() - interval '10 days' where id = $1`,
      [platformAccesses.erikaBehandlung],
    );
    await asPostgres('select public.apply_retention()');
    expect(await zugangsdienstLoescht()).toEqual([]);

    await asPostgres(
      `update public.platform_accesses set revoked_at = now() - interval '31 days' where id = $1`,
      [platformAccesses.erikaBehandlung],
    );
    await asPostgres('select public.apply_retention()');
    expect(await zugangsdienstLoescht()).toEqual([users.plattformErika]);
  });

  it('beendet mit einer abgelaufenen Einladung zum neuen Kennwort keinen aktiven Zugang', async () => {
    const einladung = await einladen(users.office, 'treatment', patients.erika);
    expect(einladung.purpose).toBe('reset');
    await asPostgres(
      `update public.platform_access_invitations set expires_at = now() - interval '60 days'
        where id = $1`,
      [einladung.invitation_id],
    );
    await asPostgres('select public.apply_retention()');
    expect(await zugangsdienstLoescht()).toEqual([]);
    expect((await zugang(platformAccesses.erikaBehandlung))?.status).toBe('active');
  });

  it('bestaetigt eine Loeschung nur, wenn das Konto beim Anmeldedienst fort ist', async () => {
    await asUserCommitted(users.office, ENTZIEHEN, [platformAccesses.tinaTraining]);
    await asPostgres(
      `update public.platform_accesses set revoked_at = now() - interval '31 days' where id = $1`,
      [platformAccesses.tinaTraining],
    );
    await asPostgres('select public.apply_retention()');
    await expect(
      asServiceRole('select public.confirm_platform_account_deletion($1::uuid)', [
        users.plattformTina,
      ]),
    ).rejects.toThrow(/account still exists/);
  });

  it('nimmt einen Auftrag zurueck, wenn das Konto wieder einen laufenden Zugang hat', async () => {
    await asUserCommitted(users.office, ENTZIEHEN, [platformAccesses.tinaTraining]);
    await asPostgres(
      `update public.platform_accesses set revoked_at = now() - interval '31 days' where id = $1`,
      [platformAccesses.tinaTraining],
    );
    await asPostgres('select public.apply_retention()');
    // Inzwischen bindet die Praxis das Konto an einen neuen Zugang.
    await asPostgres(
      `insert into public.platform_accesses
         (organization_id, relationship_kind, relationship_id, training_relationship_id,
          account_user_id, status, created_by, activated_at)
       values ($1, 'training', $2, $2, $3, 'active', $4, now())`,
      [organizationId, trainingRelationships.tina, users.plattformTina, users.office],
    );
    expect(await zugangsdienstLoescht()).toEqual([]);
    expect((await asPostgres('select 1 from public.platform_account_deletions')).rows).toEqual([]);
  });

  it('laesst nur den Zugangsdienst Auftraege abholen und bestaetigen', async () => {
    await expect(
      asUser(users.ownerTherapist, 'select * from public.claim_platform_account_deletions(10)'),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(users.ownerTherapist, 'select public.confirm_platform_account_deletion($1::uuid)', [
        users.plattformTina,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  /** Zweitreview B1: Ein Restore mit aktivem Zugang belebt das Konto nicht wieder. */
  it('loescht nach einem Restore auch ein Konto, dessen Zugang wieder aktiv ist', async () => {
    const id = platformAccesses.tinaTraining;
    await asUserCommitted(users.office, ENTZIEHEN, [id]);
    await asPostgres(
      `update public.platform_accesses set revoked_at = now() - interval '31 days' where id = $1`,
      [id],
    );
    await asPostgres('select public.apply_retention()');
    expect(await zugangsdienstLoescht()).toEqual([users.plattformTina]);

    // Restore aus einem Stand, in dem Konto und Zugang aktiv waren.
    await asPostgres(
      `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', 'tina.plattform@patient.invalid')`,
      [users.plattformTina],
    );
    await asPostgres(
      'alter table public.platform_accesses disable trigger platform_accesses_guard',
    );
    await asPostgres(
      `update public.platform_accesses
          set status = 'active', revoked_at = null, revoked_by = null, revoked_reason = null
        where id = $1`,
      [id],
    );
    await asPostgres('alter table public.platform_accesses enable trigger platform_accesses_guard');

    await asPostgres('select public.reapply_deletion_journal()');
    expect((await zugang(id))?.status).toBe('revoked');
    const vorher = await asPostgres<{ reapplied_at: Date | null }>(
      `select reapplied_at from public.deletion_journal where target_id = $1`,
      [users.plattformTina],
    );
    // Erneut angewandt erst mit der Bestätigung.
    expect(vorher.rows[0]!.reapplied_at).toBeNull();
    expect(await zugangsdienstLoescht()).toEqual([users.plattformTina]);
    const nachher = await asPostgres<{ reapplied_at: Date | null }>(
      `select reapplied_at from public.deletion_journal where target_id = $1`,
      [users.plattformTina],
    );
    expect(nachher.rows[0]!.reapplied_at).not.toBeNull();
  });

  it('zaehlt ein Konto mit offenem Auftrag nicht bei jedem Lauf neu (Zweitreview B2)', async () => {
    await asUserCommitted(users.office, ENTZIEHEN, [platformAccesses.tinaTraining]);
    await asPostgres(
      `update public.platform_accesses set revoked_at = now() - interval '31 days' where id = $1`,
      [platformAccesses.tinaTraining],
    );
    await asPostgres('select public.apply_retention()');
    // Der zweite Lauf findet nichts Neues: Der Auftrag steht schon.
    const { rows } = await asPostgres<{ n: number }>('select public.apply_retention() as n');
    expect(rows[0]!.n).toBe(0);
  });

  it('laesst ein Konto mit einem laufenden Zugang stehen', async () => {
    // Erikas Training endet, die Behandlung laeuft: Das Konto bleibt.
    await asUserCommitted(users.office, ENTZIEHEN, [platformAccesses.erikaTraining]);
    await asPostgres(
      `update public.platform_accesses set revoked_at = now() - interval '60 days' where id = $1`,
      [platformAccesses.erikaTraining],
    );
    await asPostgres('select public.apply_retention()');
    expect(
      (await asPostgres('select 1 from auth.users where id = $1', [users.plattformErika])).rows,
    ).toHaveLength(1);
    expect((await zugang(platformAccesses.erikaBehandlung))?.status).toBe('active');
  });
});

describe('Plattformzugang: Befunde aus dem Zweitreview', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('laesst ein neues Kennwort nur ausstellen, wer alle Bereiche des Kontos verwaltet (§4.8)', async () => {
    // Erikas Konto traegt Behandlung und Training. Die Trainingsbetreuung
    // verwaltet nur das Training, die Therapeutin nur die Behandlung.
    await asPostgres(
      `insert into public.training_contact_details (training_relationship_id, organization_id, date_of_birth)
       values ($1, $2, '1963-09-17')
       on conflict (training_relationship_id) do update set date_of_birth = excluded.date_of_birth`,
      [trainingRelationships.erika, organizationId],
    );
    await expect(
      asUser(users.trainer, EINLADEN, ['training', trainingRelationships.erika, 'on_site', false]),
    ).rejects.toThrow(/reset needs every area/);
    await expect(
      asUser(users.therapist, EINLADEN, ['treatment', patients.erika, 'on_site', false]),
    ).rejects.toThrow(/reset needs every area/);
    // Tina hat nur das Training: Dort darf die Trainingsbetreuung.
    await asPostgres(
      `update public.training_contact_details set date_of_birth = '1990-01-01'
        where training_relationship_id = $1`,
      [trainingRelationships.tina],
    );
    const tina = await einladen(users.trainer, 'training', trainingRelationships.tina);
    expect(tina.purpose).toBe('reset');
  });

  it('beendet beim neuen Kennwort die Einladung, bevor sich etwas am Konto aendert', async () => {
    const einladung = await einladen(users.office, 'treatment', patients.erika);
    await asServiceRole(EINLOESEN, [h(einladung.code), users.plattformErika]);
    // Ein zweiter Aufruf mit demselben Code scheitert: kein zweites Kennwort.
    await expect(
      asServiceRole(EINLOESEN, [h(einladung.code), users.plattformErika]),
    ).rejects.toThrow(/invitation not valid/);
  });

  it('nimmt beim Sperren die offene Einladung zurueck', async () => {
    const einladung = await einladen(users.office, 'treatment', patients.erika);
    await asUserCommitted(users.office, SPERREN, [platformAccesses.erikaBehandlung, true]);
    await asUserCommitted(users.office, SPERREN, [platformAccesses.erikaBehandlung, false]);
    expect((await asServiceRole(NACHSCHLAGEN, [h(einladung.code)])).rows).toEqual([]);
  });

  it('verbraucht eine Einladung nach fuenf Fehlversuchen', async () => {
    const einladung = await einladen(users.therapist, 'treatment', patients.max);
    for (let versuch = 1; versuch <= 4; versuch += 1) {
      const { rows } = await asServiceRole<{ gilt: boolean }>(
        'select public.platform_invitation_failed($1) as gilt',
        [h(einladung.code)],
      );
      expect(rows[0]?.gilt).toBe(true);
    }
    const { rows } = await asServiceRole<{ gilt: boolean }>(
      'select public.platform_invitation_failed($1) as gilt',
      [h(einladung.code)],
    );
    expect(rows[0]?.gilt).toBe(false);
    expect((await asServiceRole(NACHSCHLAGEN, [h(einladung.code)])).rows).toEqual([]);
    await expect(
      asUser(users.ownerTherapist, 'select public.platform_invitation_failed($1)', [
        h(einladung.code),
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it('gibt einer Person mit Praxiskonto keinen Zugang, auch nicht ueber eine zweite Adresse (W1)', async () => {
    // Tom (Trainingsbetreuung) bekommt ein Trainingsverhaeltnis als Kunde.
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.training_relationships (organization_id, person_id, status, contract_started_on)
       values ($1, '44444444-4444-4444-8444-000000000010', 'active', current_date) returning id`,
      [organizationId],
    );
    await asPostgres(
      `insert into public.training_contact_details (training_relationship_id, organization_id, date_of_birth)
       values ($1, $2, '1990-01-01')`,
      [rows[0]!.id, organizationId],
    );
    await expect(
      asUser(users.office, EINLADEN, ['training', rows[0]!.id, 'on_site', false]),
    ).rejects.toThrow(/person has a practice account/);
    // Auch am Einladen vorbei haelt der Riegel am Zugang.
    await neuesKonto(KONTO_FREMD, 'tom.privat@patient.invalid');
    await expect(
      asPostgres(
        `insert into public.platform_accesses
           (organization_id, relationship_kind, relationship_id, training_relationship_id,
            account_user_id, status, created_by, activated_at)
         values ($1, 'training', $2, $2, $3, 'active', $4, now())`,
        [organizationId, rows[0]!.id, KONTO_FREMD, users.office],
      ),
    ).rejects.toThrow(/person has a practice account/);
  });

  it('haengt die Zugaenge einer Person an genau ein Konto (Punkt 4)', async () => {
    await asPostgres(
      `update public.platform_accesses
          set status = 'revoked', revoked_at = now(), revoked_reason = 'practice'
        where id = $1`,
      [platformAccesses.erikaTraining],
    );
    await asPostgres(
      `insert into public.training_contact_details (training_relationship_id, organization_id, date_of_birth)
       values ($1, $2, '1963-09-17')
       on conflict (training_relationship_id) do update set date_of_birth = excluded.date_of_birth`,
      [trainingRelationships.erika, organizationId],
    );
    const einladung = await einladen(users.office, 'training', trainingRelationships.erika);
    await neuesKonto(KONTO_FREMD, 'erika.zweitkonto@patient.invalid');
    await expect(asServiceRole(EINLOESEN, [h(einladung.code), KONTO_FREMD])).rejects.toThrow(
      /person already has another account/,
    );
    // Mit ihrem Konto geht es.
    await asServiceRole(EINLOESEN, [h(einladung.code), users.plattformErika]);
  });

  it('protokolliert das Ende eines Zugangs auch, wenn das Verhaeltnis faellt (ADR-010)', async () => {
    await asPostgres(
      'select app.delete_training_relationship($1::uuid, extensions.gen_random_uuid(), now())',
      [trainingRelationships.tina],
    );
    const { rows } = await asPostgres<{ actor_kind: string; context: Record<string, unknown> }>(
      `select actor_kind, context from public.audit_log
        where action = 'platform_access.revoked' and subject_id = $1`,
      [platformAccesses.tinaTraining],
    );
    expect(rows).toEqual([
      { actor_kind: 'system', context: { surface: 'system', reason: 'relationship_deleted' } },
    ]);
  });

  it('beendet den Zugang, wenn der Loeschlauf das Konto entfernt - ohne eigenen Auditeintrag (LOG-EPIC-001)', async () => {
    await asPostgres(
      `update public.training_relationships set contract_ended_on = current_date - 90 where id = $1`,
      [trainingRelationships.tina],
    );
    await asPostgres('select public.apply_retention()');
    expect(await zugang(platformAccesses.tinaTraining)).toMatchObject({
      status: 'revoked',
      revoked_reason: 'account_deleted',
    });
    // Wann und dass es der Lauf war (kein Mensch), steht am Zugang; den Entzug
    // zaehlt retention.applied, ein eigener Eintrag entsteht nicht.
    const { rows: amZugang } = await asPostgres<{ revoked_by: string | null; beendet: boolean }>(
      `select revoked_by, revoked_at is not null as beendet
         from public.platform_accesses where id = $1`,
      [platformAccesses.tinaTraining],
    );
    expect(amZugang).toEqual([{ revoked_by: null, beendet: true }]);
    const { rows } = await asPostgres(
      `select 1 from public.audit_log
        where action = 'platform_access.revoked' and subject_id = $1`,
      [platformAccesses.tinaTraining],
    );
    expect(rows).toEqual([]);
    const { rows: lauf } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log
        where action = 'retention.applied' order by occurred_at desc, id desc limit 1`,
    );
    expect(Number(lauf[0]?.context['plattformkonto'])).toBeGreaterThan(0);
  });

  it('raeumt ein nie gebundenes Konto des Zugangsdienstes nach 30 Tagen ab', async () => {
    await asPostgres(
      `insert into auth.users (id, aud, role, email, raw_app_meta_data, created_at)
       values ($1, 'authenticated', 'authenticated', 'verwaist@patient.invalid',
               '{"platform_account": true}', now() - interval '31 days'),
              ($2, 'authenticated', 'authenticated', 'frisch@patient.invalid',
               '{"platform_account": true}', now() - interval '2 days')`,
      [KONTO_MAX, KONTO_FREMD],
    );
    await asPostgres('select public.apply_retention()');
    await zugangsdienstLoescht();
    const { rows } = await asPostgres<{ id: string }>(
      'select id from auth.users where id in ($1, $2)',
      [KONTO_MAX, KONTO_FREMD],
    );
    expect(rows.map((r) => r.id)).toEqual([KONTO_FREMD]);
    // Ein Praxiskonto ohne die Marke bleibt unberuehrt.
    expect(
      (await asPostgres('select 1 from auth.users where id = $1', [users.ownerTherapist])).rows,
    ).toHaveLength(1);
  });

  it('weist Sperren und Versand fuer eine andere Organisation ab', async () => {
    const einladung = await einladen(users.office, 'treatment', patients.max, 'email', true);
    const fremd = await fremdeOrganisation();
    await erwarteAbgewiesenenSchreibversuch(
      fremd.owner,
      SPERREN,
      [platformAccesses.erikaBehandlung, true],
      'platform_access.locked',
    );
    await erwarteAbgewiesenenSchreibversuch(
      fremd.owner,
      MAIL,
      [einladung.invitation_id, h(einladung.code)],
      'platform_access.invitation_sent',
    );
    expect((await zugang(platformAccesses.erikaBehandlung))?.status).toBe('active');
  });
});

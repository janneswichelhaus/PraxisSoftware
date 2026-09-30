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
    const { rows } = await asPostgres(
      'select 1 from public.platform_accesses where relationship_id = $1',
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
          set date_of_birth = (current_date - interval '18 years' + interval '1 day')::date
        where patient_id = $1`,
      [patients.max],
    );
    await expect(
      asUser(users.therapist, EINLADEN, ['treatment', patients.max, 'on_site', false]),
    ).rejects.toThrow(/under age/);

    await asPostgres(
      `update public.patient_contact_details
          set date_of_birth = (current_date - interval '18 years')::date
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

    const { rows } = await asServiceRole(NACHSCHLAGEN, [erste.code]);
    expect(rows).toEqual([]);
    expect((await asServiceRole(NACHSCHLAGEN, [zweite.code])).rows).toHaveLength(1);
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
    }>(NACHSCHLAGEN, [einladung.code]);
    expect(nachgeschlagen.rows).toEqual([
      { purpose: 'activate', account_user_id: null, organization_name: 'Test Praxis Tuebingen' },
    ]);

    await neuesKonto(KONTO_MAX, 'max.plattform@patient.invalid');
    const { rows } = await asServiceRole<{ access_id: string }>(EINLOESEN, [
      einladung.code,
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
    await asServiceRole(EINLOESEN, [einladung.code, KONTO_MAX]);

    // benutzt
    expect((await asServiceRole(NACHSCHLAGEN, [einladung.code])).rows).toEqual([]);
    await expect(asServiceRole(EINLOESEN, [einladung.code, KONTO_MAX])).rejects.toThrow(
      /invitation not valid/,
    );
    // unbekannt
    expect((await asServiceRole(NACHSCHLAGEN, ['erfunden'])).rows).toEqual([]);
    await expect(asServiceRole(EINLOESEN, ['erfunden', KONTO_MAX])).rejects.toThrow(
      /invitation not valid/,
    );
    // abgelaufen
    const zweite = await einladen(users.therapist, 'treatment', patients.erika);
    await asPostgres(
      `update public.platform_access_invitations set expires_at = now() - interval '1 minute'
       where id = $1`,
      [zweite.invitation_id],
    );
    expect((await asServiceRole(NACHSCHLAGEN, [zweite.code])).rows).toEqual([]);
    await expect(asServiceRole(EINLOESEN, [zweite.code, KONTO_FREMD])).rejects.toThrow(
      /invitation not valid/,
    );
  });

  it('ist fuer angemeldete Konten nicht aufrufbar, nur fuer den Zugangsdienst', async () => {
    const einladung = await einladen(users.therapist, 'treatment', patients.max);
    for (const konto of [users.ownerTherapist, users.plattformTina]) {
      await expect(asUser(konto, NACHSCHLAGEN, [einladung.code])).rejects.toThrow(
        /permission denied/,
      );
      await expect(asUser(konto, EINLOESEN, [einladung.code, konto])).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it('bindet kein Praxiskonto (Punkt 2, W1)', async () => {
    const einladung = await einladen(users.therapist, 'treatment', patients.max);
    await expect(asServiceRole(EINLOESEN, [einladung.code, users.therapist])).rejects.toThrow(
      /practice account cannot hold platform access/,
    );
    // Auch ein Konto mit Profil ohne Rolle nicht.
    await expect(asServiceRole(EINLOESEN, [einladung.code, users.patientMax])).rejects.toThrow(
      /practice account cannot hold platform access/,
    );
  });

  it('bindet kein Konto einer anderen Person, wohl aber ein zweites Verhaeltnis derselben (Punkt 4)', async () => {
    const einladung = await einladen(users.therapist, 'treatment', patients.max);
    // Tinas Plattformkonto gehoert Tina.
    await expect(asServiceRole(EINLOESEN, [einladung.code, users.plattformTina])).rejects.toThrow(
      /account belongs to another person/,
    );

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
      [einladung.code],
    );
    expect(rows[0]).toMatchObject({ purpose: 'reset', account_user_id: users.plattformErika });

    // Ein anderes Konto kann eine Einladung zum neuen Kennwort nicht nutzen.
    await expect(asServiceRole(EINLOESEN, [einladung.code, users.plattformTina])).rejects.toThrow(
      /invitation not valid/,
    );

    await asServiceRole(EINLOESEN, [einladung.code, users.plattformErika]);
    const audit = await asPostgres<{ actor_kind: string }>(
      `select actor_kind from public.audit_log where action = 'platform_access.password_reset'`,
    );
    expect(audit.rows).toEqual([{ actor_kind: 'platform' }]);
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
    expect((await asServiceRole(NACHSCHLAGEN, [einladung.code])).rows).toEqual([]);
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
      `select 1 from public.audit_log where action = 'platform_accesses.read' and outcome = 'denied' and actor_user_id = $1`,
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
      [einladung.invitation_id, einladung.code],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        email: 'max.mustermann@patient.invalid',
        organization_name: 'Test Praxis Tuebingen',
      }),
    ]);

    await expect(asUser(users.office, MAIL, [einladung.invitation_id, 'falsch'])).rejects.toThrow(
      /cannot be sent/,
    );
    await erwarteAbgewiesenenSchreibversuch(
      users.trainer,
      MAIL,
      [einladung.invitation_id, einladung.code],
      'platform_access.invitation_sent',
    );

    // Adresse geaendert: neue Einladung noetig (Punkt 11).
    await asPostgres(
      `update public.patient_contact_details set email = 'neu@patient.invalid' where patient_id = $1`,
      [patients.max],
    );
    await expect(
      asUser(users.office, MAIL, [einladung.invitation_id, einladung.code]),
    ).rejects.toThrow(/address changed/);
  });

  it('versendet keine Einladung, die vor Ort uebergeben wird', async () => {
    const einladung = await einladen(users.office, 'treatment', patients.max);
    await expect(
      asUser(users.office, MAIL, [einladung.invitation_id, einladung.code]),
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
    await asServiceRole(EINLOESEN, [einladung.code, KONTO_MAX]);

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
    expect(
      (await asPostgres('select 1 from auth.users where id = $1', [users.plattformTina])).rows,
    ).toEqual([]);
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

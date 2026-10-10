import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asServiceRole, asUser, resetDatabase } from './helpers/db';

/**
 * ABN-012 (BEF-118, ANN-218), seit SEC-009 (ADR-025 Fassung 2, ANN-331):
 * Der Anmeldedienst verschickt keinen Wiederherstellungslink mehr, für kein
 * Konto - es gibt kein Kennwort. Plattformkonten bekommen gar keine Mail des
 * Anmeldedienstes. Ein Praxiskonto bekommt einen Anmeldelink nur zu einer
 * offenen Einladung oder zu einem frisch angestoßenen Anmeldelink. Das
 * Merkmal des bestätigten Postfachs folgt weiter der Adresse. Gefragt wird
 * vom Anmeldedienst über den Mail-Hook des Zugangsdienstes.
 */

const { users } = SEED;
const ERLAUBT = 'select public.auth_email_allowed($1::uuid, $2) as ja';

async function erlaubt(konto: string, aktion: string): Promise<boolean> {
  const { rows } = await asServiceRole<{ ja: boolean }>(ERLAUBT, [konto, aktion]);
  return rows[0]!.ja;
}

async function bestaetige(konto: string, adresse: string): Promise<void> {
  await asPostgres(
    `insert into public.platform_mailbox_confirmations (account_user_id, email, confirmed_via)
     values ($1, $2, 'link')`,
    [konto, adresse],
  );
}

describe('Mails des Anmeldedienstes (ABN-012, SEC-009)', () => {
  beforeEach(resetDatabase);

  it('schickt keinem Konto einen Wiederherstellungslink (ADR-025 Punkt 9)', async () => {
    expect(await erlaubt(users.office, 'recovery')).toBe(false);
    expect(await erlaubt(users.ownerTherapist, 'recovery')).toBe(false);
  });

  it('schickt einem Praxiskonto einen Anmeldelink nur mit Anlass (ANN-331)', async () => {
    expect(await erlaubt(users.office, 'magiclink')).toBe(false);
    // Die Inhaberin stößt einen neuen Anmeldelink an (ANN-328).
    await asPostgres(
      `insert into public.audit_log (organization_id, actor_user_id, action, subject_type, subject_id)
       select sm.organization_id, $2, 'staff_account.password_reset_requested', 'staff_member', sm.id
       from public.staff_members sm
       join public.user_profiles up on up.person_id = sm.person_id
       where up.id = $1`,
      [users.office, users.ownerTherapist],
    );
    expect(await erlaubt(users.office, 'magiclink')).toBe(true);
    // Nach einer Stunde nicht mehr.
    await asPostgres(
      `update public.audit_log set occurred_at = now() - interval '61 minutes'
       where action = 'staff_account.password_reset_requested'`,
    );
    expect(await erlaubt(users.office, 'magiclink')).toBe(false);
    // Andere Mails an Praxiskonten bleiben wie bisher.
    expect(await erlaubt(users.office, 'email_change')).toBe(true);
  });

  it('schickt einem eingeladenen, noch nicht gebundenen Konto den Anmeldelink', async () => {
    const konto = '99999999-9999-4999-8999-0000000000d3';
    await asPostgres(
      `insert into auth.users (id, aud, role, email)
       values ($1, 'authenticated', 'authenticated', 'neu.kraft@praxis.invalid')`,
      [konto],
    );
    expect(await erlaubt(konto, 'magiclink')).toBe(false);
    await asPostgres(
      `insert into public.staff_account_invitations
         (organization_id, staff_member_id, email, role_keys, expires_at, invited_by)
       select sm.organization_id, sm.id, 'neu.kraft@praxis.invalid', array['therapist'],
              now() + interval '7 days', $1
       from public.staff_members sm limit 1`,
      [users.ownerTherapist],
    );
    expect(await erlaubt(konto, 'magiclink')).toBe(true);
  });

  it('schickt einem Plattformkonto ohne bestätigtes Postfach keinen Wiederherstellungslink', async () => {
    // Der Anmeldedienst hält die Adresse für bestätigt - das zählt nicht.
    await asPostgres('update auth.users set email_confirmed_at = now() where id = $1', [
      users.plattformErika,
    ]);
    expect(await erlaubt(users.plattformErika, 'recovery')).toBe(false);
  });

  it('schickt auch mit bestätigtem Postfach keinen Wiederherstellungslink; das Merkmal folgt der Adresse', async () => {
    const { rows } = await asPostgres<{ email: string }>(
      'select email from auth.users where id = $1',
      [users.plattformErika],
    );
    await bestaetige(users.plattformErika, rows[0]!.email.toLowerCase());
    // Bestätigt, aber ohne Kennwort gibt es nichts wiederherzustellen (SEC-009).
    expect(await erlaubt(users.plattformErika, 'recovery')).toBe(false);
    const merkmal =
      'select 1 from public.platform_mailbox_confirmations where account_user_id = $1';
    expect((await asPostgres(merkmal, [users.plattformErika])).rows).toHaveLength(1);

    // Neue Adresse: neue Bestätigung nötig.
    await asPostgres(`update auth.users set email = 'neu.erika@patient.invalid' where id = $1`, [
      users.plattformErika,
    ]);
    expect((await asPostgres(merkmal, [users.plattformErika])).rows).toEqual([]);

    // Zurück zur alten Adresse: Auch das verlangt eine neue Bestätigung
    // (Zweitreview B4) - das Merkmal ist mit der Änderung gefallen.
    await asPostgres('update auth.users set email = $2 where id = $1', [
      users.plattformErika,
      rows[0]!.email,
    ]);
    expect(await erlaubt(users.plattformErika, 'recovery')).toBe(false);
  });

  it('schickt einem Plattformkonto keinen Anmeldelink, auch mit bestätigtem Postfach', async () => {
    const { rows } = await asPostgres<{ email: string }>(
      'select email from auth.users where id = $1',
      [users.plattformTina],
    );
    await bestaetige(users.plattformTina, rows[0]!.email.toLowerCase());
    expect(await erlaubt(users.plattformTina, 'magiclink')).toBe(false);
    expect(await erlaubt(users.plattformTina, 'email_change')).toBe(false);
  });

  it('kennt auch ein nie gebundenes Konto des Zugangsdienstes als Plattformkonto', async () => {
    const konto = '99999999-9999-4999-8999-0000000000d1';
    await asPostgres(
      `insert into auth.users (id, aud, role, email, raw_app_meta_data)
       values ($1, 'authenticated', 'authenticated', 'verwaist@patient.invalid',
               '{"platform_account": true}')`,
      [konto],
    );
    expect(await erlaubt(konto, 'recovery')).toBe(false);
  });

  it('fällt mit dem Konto und ist nur für den Anmeldedienst zu fragen', async () => {
    const konto = '99999999-9999-4999-8999-0000000000d2';
    await asPostgres(
      `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', 'weg@patient.invalid')`,
      [konto],
    );
    await bestaetige(konto, 'weg@patient.invalid');
    await asPostgres('delete from auth.users where id = $1', [konto]);
    expect(
      (
        await asPostgres(
          'select 1 from public.platform_mailbox_confirmations where account_user_id = $1',
          [konto],
        )
      ).rows,
    ).toEqual([]);

    await expect(
      asUser(users.ownerTherapist, ERLAUBT, [users.plattformErika, 'recovery']),
    ).rejects.toThrow(/permission denied/);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asServiceRole, asUser, resetDatabase } from './helpers/db';

/**
 * ABN-012 (BEF-118, ANN-218): Wiederherstellung per Mail für ein
 * Plattformkonto nur mit tatsächlich per Link bestätigtem Postfach. Der
 * Bestätigungsstatus des Anmeldedienstes zählt nicht; eine neue Adresse
 * braucht eine neue Bestätigung. Gefragt wird vom Anmeldedienst über den
 * Mail-Hook des Zugangsdienstes.
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

describe('Wiederherstellung per Mail (ABN-012)', () => {
  beforeEach(resetDatabase);

  it('lässt Praxiskonten unverändert Mails bekommen', async () => {
    expect(await erlaubt(users.office, 'recovery')).toBe(true);
    expect(await erlaubt(users.office, 'magiclink')).toBe(true);
  });

  it('schickt einem Plattformkonto ohne bestätigtes Postfach keinen Wiederherstellungslink', async () => {
    // Der Anmeldedienst hält die Adresse für bestätigt - das zählt nicht.
    await asPostgres('update auth.users set email_confirmed_at = now() where id = $1', [
      users.plattformErika,
    ]);
    expect(await erlaubt(users.plattformErika, 'recovery')).toBe(false);
  });

  it('erlaubt ihn mit per Link bestätigtem Postfach für genau diese Adresse', async () => {
    const { rows } = await asPostgres<{ email: string }>(
      'select email from auth.users where id = $1',
      [users.plattformErika],
    );
    await bestaetige(users.plattformErika, rows[0]!.email.toLowerCase());
    expect(await erlaubt(users.plattformErika, 'recovery')).toBe(true);

    // Neue Adresse: neue Bestätigung nötig.
    await asPostgres(`update auth.users set email = 'neu.erika@patient.invalid' where id = $1`, [
      users.plattformErika,
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

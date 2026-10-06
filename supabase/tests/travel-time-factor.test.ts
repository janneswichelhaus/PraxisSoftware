import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * UBK-010: Fahrzeitfaktor als Praxiseinstellung (ANN-237).
 *
 * Der Wert steht an der Organisation, Voreinstellung 1,5, erlaubt 1,0 bis
 * 2,5 in Schritten von 0,1. Ändern darf nur owner und nur die eigene Praxis;
 * ein Auditeintrag entsteht nicht (ADR-010 Fassung 3). Angewendet wird der
 * Faktor im Browser (`planungsfahrzeit`), nicht hier.
 */

const { users, organizationId } = SEED;

const SETZEN = 'select public.set_travel_time_factor($1::numeric)';

async function faktorVon(org: string): Promise<string> {
  const { rows } = await asPostgres<{ travel_time_factor: string }>(
    'select travel_time_factor from public.organizations where id = $1',
    [org],
  );
  return rows[0]!.travel_time_factor;
}

describe('travel_time_factor', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 60_000);

  it('steht ohne Zutun auf 1,5', async () => {
    expect(await faktorVon(organizationId)).toBe('1.5');
  });

  it('setzt der owner und schreibt keinen Auditeintrag', async () => {
    await asUserCommitted(users.ownerTherapist, SETZEN, ['2.0']);
    expect(await faktorVon(organizationId)).toBe('2.0');

    const audit = await asPostgres<{ action: string }>(
      'select action from public.audit_log where actor_user_id = $1',
      [users.ownerTherapist],
    );
    expect(audit.rows).toEqual([]);
  });

  it.each(['1.0', '2.5', '1.3'])('nimmt %s an', async (wert) => {
    await asUserCommitted(users.ownerTherapist, SETZEN, [wert]);
    expect(await faktorVon(organizationId)).toBe(wert);
  });

  it.each([['0.9'], ['2.6'], ['1.55'], [null]])('weist %s ab', async (wert) => {
    await expect(asUser(users.ownerTherapist, SETZEN, [wert])).rejects.toMatchObject({
      code: '22023',
    });
  });

  it('haelt die Grenze auch am direkten Schreibweg (Check-Constraint)', async () => {
    await expect(
      asPostgres('update public.organizations set travel_time_factor = 3.0 where id = $1', [
        organizationId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it.each([
    ['therapist', users.therapist],
    ['office', users.office],
    ['team_lead', users.teamLead],
    ['trainer', users.trainer],
    ['das Patientenkonto', users.patientMax],
    ['ein Plattformkonto', users.plattformTina],
  ])('weist %s ab', async (_, konto) => {
    await expect(asUser(konto, SETZEN, ['2.0'])).rejects.toMatchObject({ code: '42501' });
    expect(await faktorVon(organizationId)).toBe('1.5');
  });

  it('weist ohne Sitzung ab', async () => {
    await expect(asUser(null, SETZEN, ['2.0'])).rejects.toMatchObject({ code: '42501' });
  });

  it('aendert nur die eigene Praxis', async () => {
    const fremd = await fremdeOrganisation();
    await asUserCommitted(fremd.owner, SETZEN, ['2.2']);
    expect(await faktorVon(fremd.organizationId)).toBe('2.2');
    expect(await faktorVon(organizationId)).toBe('1.5');
  });

  it('zeigt den Wert nur Praxiskonten der eigenen Praxis', async () => {
    const fremd = await fremdeOrganisation();
    const LESEN = 'select id, travel_time_factor from public.organizations';

    const eigene = await asUser<{ id: string }>(users.office, LESEN);
    expect(eigene.rows.map((r) => r.id)).toEqual([organizationId]);

    const fremde = await asUser<{ id: string }>(fremd.owner, LESEN);
    expect(fremde.rows.map((r) => r.id)).toEqual([fremd.organizationId]);

    for (const konto of [users.patientMax, users.plattformTina]) {
      const { rows } = await asUser(konto, LESEN);
      expect(rows).toEqual([]);
    }
  });
});

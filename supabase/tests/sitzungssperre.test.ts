import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, jwtClaims, resetDatabase, testDatabaseUrl } from './helpers/db';

/**
 * Die Sitzungssperre im Server (SEC-001, ADR-025 Punkt 6).
 *
 * Ein Konto mit abgelaufener Frist meldet sich an und bekommt, wie in
 * `plattform-abschottung.test.ts`: keine Zeile, jeder Aufruf abgewiesen. Die
 * Fristen: 60 Minuten nach der letzten Anmeldung (`amr`), 30 Minuten nach der
 * letzten Bedienung (Vermerk je `session_id`). Ein gesperrtes Token hebt
 * die Sperre nicht selbst wieder auf.
 */

const { users, platformAccesses } = SEED;
const SITZUNG = 'abababab-abab-4bab-8bab-000000000001';

/** Unix-Sekunden vor `minuten` Minuten. */
function vor(minuten: number): number {
  return Math.floor(Date.now() / 1000) - minuten * 60;
}

/** Claims mit eigener Anmeldung und Sitzung; `null` lässt einen Claim weg. */
function claims(
  konto: string,
  {
    angemeldetVor = 1,
    sitzung = SITZUNG,
  }: { angemeldetVor?: number | null; sitzung?: string | null },
): string {
  const basis = JSON.parse(jwtClaims(konto)) as Record<string, unknown>;
  if (angemeldetVor === null) delete basis.amr;
  else basis.amr = [{ method: 'password', timestamp: vor(angemeldetVor) }];
  if (sitzung === null) delete basis.session_id;
  else basis.session_id = sitzung;
  return JSON.stringify(basis);
}

async function alsToken<T>(
  claimsJson: string,
  sql: string,
  params: unknown[] = [],
  bestaetigen = false,
): Promise<T[]> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [claimsJson]);
    const { rows } = await client.query(sql, params as never[]);
    await client.query(bestaetigen ? 'commit' : 'rollback');
    return rows as T[];
  } catch (fehler) {
    await client.query('rollback').catch(() => undefined);
    throw fehler;
  } finally {
    await client.end();
  }
}

async function fehlerVon(versprechen: Promise<unknown>): Promise<string | null> {
  try {
    await versprechen;
    return null;
  } catch (fehler) {
    return (fehler as { code?: string }).code ?? 'unbekannt';
  }
}

async function bedienungVor(minuten: number, konto: string = users.therapist): Promise<void> {
  await asPostgres(
    `insert into public.session_activity (session_id, user_id, last_activity_at)
     values ($1, $2, now() - make_interval(mins => $3))
     on conflict (session_id) do update set last_activity_at = excluded.last_activity_at`,
    [SITZUNG, konto, minuten],
  );
}

interface Stand {
  locked: boolean;
  reason: string | null;
  seconds_until_idle: number;
  seconds_until_max: number;
}

const PATIENTEN = 'select count(*)::int as n from public.patients';
const ORGANISATION = 'select app.current_organization_id() as org';

describe('Sitzungssperre im Server (SEC-001, ADR-025)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.session_activity');
  });

  it('lässt eine frische Sitzung lesen', async () => {
    const [zeile] = await alsToken<{ n: number }>(claims(users.therapist, {}), PATIENTEN);
    expect(zeile!.n).toBeGreaterThan(0);
  });

  describe('Höchstdauer: 60 Minuten nach der Anmeldung (Punkt 1)', () => {
    it('sperrt nach 61 Minuten - keine Zeile, keine Organisation, keine Rolle', async () => {
      const token = claims(users.therapist, { angemeldetVor: 61 });
      expect((await alsToken<{ n: number }>(token, PATIENTEN))[0]!.n).toBe(0);
      expect((await alsToken<{ org: string | null }>(token, ORGANISATION))[0]!.org).toBeNull();
      const [rolle] = await alsToken<{ ok: boolean }>(
        token,
        `select app.has_any_role('therapist') as ok, app.current_person_id() is null as ohne_person`,
      );
      expect(rolle!.ok).toBe(false);
    });

    it('sperrt auch, wenn gerade bedient wurde', async () => {
      await bedienungVor(1);
      const token = claims(users.therapist, { angemeldetVor: 61 });
      expect((await alsToken<{ n: number }>(token, PATIENTEN))[0]!.n).toBe(0);
    });

    it('lässt nach 59 Minuten mit Bedienung noch lesen', async () => {
      await bedienungVor(2);
      const token = claims(users.therapist, { angemeldetVor: 59 });
      expect((await alsToken<{ n: number }>(token, PATIENTEN))[0]!.n).toBeGreaterThan(0);
    });
  });

  describe('Inaktivität: 30 Minuten ohne Bedienung (Punkt 2, W1)', () => {
    it('sperrt 31 Minuten nach der Anmeldung ohne jede Bedienung', async () => {
      const token = claims(users.therapist, { angemeldetVor: 31 });
      expect((await alsToken<{ n: number }>(token, PATIENTEN))[0]!.n).toBe(0);
    });

    it('sperrt 31 Minuten nach der letzten Bedienung', async () => {
      await bedienungVor(31);
      const token = claims(users.therapist, { angemeldetVor: 45 });
      expect((await alsToken<{ n: number }>(token, PATIENTEN))[0]!.n).toBe(0);
    });

    it('lässt 29 Minuten nach der letzten Bedienung lesen', async () => {
      await bedienungVor(29);
      const token = claims(users.therapist, { angemeldetVor: 45 });
      expect((await alsToken<{ n: number }>(token, PATIENTEN))[0]!.n).toBeGreaterThan(0);
    });

    it('nimmt den Vermerk eines anderen Kontos mit derselben Sitzungskennung nicht an', async () => {
      await bedienungVor(1, users.office);
      const token = claims(users.therapist, { angemeldetVor: 45 });
      expect((await alsToken<{ n: number }>(token, PATIENTEN))[0]!.n).toBe(0);
    });
  });

  describe('Jeder Aufruf abgewiesen', () => {
    it('weist eine RPC mit Rollenprüfung ab, die offen gelingt', async () => {
      const anlegen = `select public.create_patient(
         p_given_name => 'Gesperrt', p_family_name => 'Test',
         p_date_of_birth => '1980-01-01'::date)`;
      expect(await fehlerVon(alsToken(claims(users.office, {}), anlegen))).toBeNull();
      const code = await fehlerVon(alsToken(claims(users.office, { angemeldetVor: 61 }), anlegen));
      expect(code).toBe('42501');
    });

    it('schreibt nicht an der Policy vorbei', async () => {
      const token = claims(users.office, { angemeldetVor: 61 });
      const code = await fehlerVon(
        alsToken(token, `update public.organizations set name = 'Gesperrt' returning id`),
      );
      // Entweder fehlt das Recht, oder die Policy lässt keine Zeile zu.
      if (code === null) {
        const rows = await alsToken<{ id: string }>(
          token,
          `update public.organizations set name = 'Gesperrt' returning id`,
        );
        expect(rows).toEqual([]);
      }
      const {
        rows: [org],
      } = await asPostgres<{ name: string }>(
        'select name from public.organizations where id = $1',
        [SEED.organizationId],
      );
      expect(org!.name).not.toBe('Gesperrt');
    });

    it('sperrt Plattformkonten ebenso (Punkt 8, ADR-023 Punkt 19)', async () => {
      const offen = claims(users.plattformTina, {});
      const gesperrt = claims(users.plattformTina, { angemeldetVor: 61 });
      const sql = `select count(*)::int as n from public.platform_context()`;
      expect((await alsToken<{ n: number }>(offen, sql))[0]!.n).toBeGreaterThan(0);
      const zugang = `select count(*)::int as n from public.platform_context() where readable`;
      expect((await alsToken<{ n: number }>(gesperrt, zugang))[0]!.n).toBe(0);
      const code = await fehlerVon(
        alsToken(
          gesperrt,
          `select public.request_platform_appointment($1::uuid, array[current_date + 3], array['morning'], null)`,
          [platformAccesses.tinaTraining],
        ),
      );
      expect(code).toBe('42501');
    });

    it('sperrt ein Token ohne amr oder ohne session_id', async () => {
      const ohneAmr = claims(users.therapist, { angemeldetVor: null });
      const ohneSitzung = claims(users.therapist, { sitzung: null });
      expect((await alsToken<{ n: number }>(ohneAmr, PATIENTEN))[0]!.n).toBe(0);
      expect((await alsToken<{ n: number }>(ohneSitzung, PATIENTEN))[0]!.n).toBe(0);
    });

    it('öffnet nichts mit einer Anmeldung aus der Zukunft', async () => {
      const token = claims(users.therapist, { angemeldetVor: -120 });
      expect((await alsToken<{ n: number }>(token, PATIENTEN))[0]!.n).toBe(0);
    });
  });

  describe('session_status', () => {
    it('nennt einer offenen Sitzung die Sekunden bis zu beiden Fristen', async () => {
      const [stand] = await alsToken<Stand>(
        claims(users.therapist, { angemeldetVor: 10 }),
        'select * from public.session_status()',
      );
      expect(stand!.locked).toBe(false);
      expect(stand!.reason).toBeNull();
      // 30 Minuten ab der Anmeldung (ohne Vermerk), 60 ab der Anmeldung.
      expect(stand!.seconds_until_idle).toBeGreaterThan(19 * 60);
      expect(stand!.seconds_until_idle).toBeLessThanOrEqual(20 * 60);
      expect(stand!.seconds_until_max).toBeGreaterThan(49 * 60);
      expect(stand!.seconds_until_max).toBeLessThanOrEqual(50 * 60);
    });

    it('vermerkt eine Bedienung und verlängert damit nur die Inaktivitätsfrist', async () => {
      const token = claims(users.therapist, { angemeldetVor: 20 });
      const [stand] = await alsToken<Stand>(
        token,
        'select * from public.session_status(true)',
        [],
        true,
      );
      expect(stand!.seconds_until_idle).toBeGreaterThan(29 * 60);
      expect(stand!.seconds_until_max).toBeLessThanOrEqual(40 * 60);
      const {
        rows: [vermerk],
      } = await asPostgres<{ user_id: string }>(
        'select user_id from public.session_activity where session_id = $1',
        [SITZUNG],
      );
      expect(vermerk!.user_id).toBe(users.therapist);
    });

    it('hebt eine Sperre nicht wieder auf - kein Vermerk, weiter gesperrt', async () => {
      const token = claims(users.therapist, { angemeldetVor: 40 });
      const [stand] = await alsToken<Stand>(
        token,
        'select * from public.session_status(true)',
        [],
        true,
      );
      expect(stand).toEqual({
        locked: true,
        reason: 'inaktiv',
        seconds_until_idle: 0,
        seconds_until_max: 0,
      });
      const vermerke = await asPostgres('select 1 from public.session_activity');
      expect(vermerke.rows).toEqual([]);
      expect((await alsToken<{ n: number }>(token, PATIENTEN))[0]!.n).toBe(0);
    });

    it('nennt die Höchstdauer als Grund', async () => {
      const [stand] = await alsToken<Stand>(
        claims(users.therapist, { angemeldetVor: 61 }),
        'select * from public.session_status()',
      );
      expect(stand!.reason).toBe('hoechstdauer');
    });

    it('entfernt Vermerke, die älter als einen Tag sind (Datenklasse sitzungsvermerk)', async () => {
      await asPostgres(
        `insert into public.session_activity (session_id, user_id, last_activity_at)
         values ('abababab-abab-4bab-8bab-000000000099', $1, now() - interval '25 hours')`,
        [users.office],
      );
      await alsToken(
        claims(users.therapist, {}),
        'select * from public.session_status(true)',
        [],
        true,
      );
      const { rows } = await asPostgres<{ session_id: string }>(
        'select session_id from public.session_activity order by session_id',
      );
      expect(rows.map((r) => r.session_id)).toEqual([SITZUNG]);
    });

    it('ist ohne Anmeldung nicht aufrufbar', async () => {
      const code = await fehlerVon(alsToken('{}', 'select * from public.session_status()'));
      expect(code).toBe('42501');
    });

    it('gibt den Vermerk keinem Konto zu lesen', async () => {
      const code = await fehlerVon(
        alsToken(claims(users.ownerTherapist, {}), 'select * from public.session_activity'),
      );
      expect(code).toBe('42501');
    });
  });
});

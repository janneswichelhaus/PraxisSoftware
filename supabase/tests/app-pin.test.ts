import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, jwtClaims, resetDatabase, testDatabaseUrl } from './helpers/db';

/**
 * App-PIN und Passkey in der Sitzungssperre (SEC-004, ADR-025 Fassung 2,
 * Punkte 10 und 11).
 *
 * Die PIN gibt eine bestehende, gesperrte Sitzung frei und meldet nie an.
 * Nach fünf Fehlversuchen in Folge ist die Sitzung verbraucht. Festlegen geht
 * nur in offener Sitzung und kurz nach einer Anmeldung (ANN-325). Der Passkey
 * zählt als Anmeldung.
 */

const { users } = SEED;
const SITZUNG = 'bcbcbcbc-bcbc-4cbc-8cbc-000000000001';
const ANDERE_SITZUNG = 'bcbcbcbc-bcbc-4cbc-8cbc-000000000002';
const PIN = '483920';

function vor(minuten: number): number {
  return Math.floor(Date.now() / 1000) - minuten * 60;
}

function claims(
  konto: string,
  {
    angemeldetVor = 1,
    sitzung = SITZUNG,
    methode = 'password',
  }: { angemeldetVor?: number | null; sitzung?: string | null; methode?: string },
): string {
  const basis = JSON.parse(jwtClaims(konto)) as Record<string, unknown>;
  if (angemeldetVor === null) delete basis.amr;
  else basis.amr = [{ method: methode, timestamp: vor(angemeldetVor) }];
  if (sitzung === null) delete basis.session_id;
  else basis.session_id = sitzung;
  return JSON.stringify(basis);
}

/** Ein Aufruf mit Token; bestätigt, damit Zähler und Freigabe stehen bleiben. */
async function alsToken<T>(claimsJson: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [claimsJson]);
    const { rows } = await client.query(sql, params as never[]);
    await client.query('commit');
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

interface Versuch {
  unlocked: boolean;
  attempts_left: number;
  consumed: boolean;
}

const PATIENTEN = 'select count(*)::int as n from public.patients';
const SETZEN = 'select public.set_own_pin($1)';
const FREIGEBEN = 'select * from public.unlock_with_pin($1)';
const STAND = 'select * from public.session_status(false)';

async function pinSetzen(konto: string = users.therapist, pin: string = PIN): Promise<void> {
  await alsToken(claims(konto, { sitzung: ANDERE_SITZUNG }), SETZEN, [pin]);
}

async function patienten(token: string): Promise<number> {
  return (await alsToken<{ n: number }>(token, PATIENTEN))[0]!.n;
}

describe('App-PIN und Passkey (SEC-004, ADR-025 Fassung 2)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.session_unlocks');
    await asPostgres('delete from public.account_pins');
    await asPostgres('delete from public.session_activity');
  });

  describe('Der Passkey zählt als Anmeldung (Punkt 10)', () => {
    it('öffnet die Sitzung mit einer frischen Passkey-Anmeldung', async () => {
      expect(await patienten(claims(users.therapist, { methode: 'passkey' }))).toBeGreaterThan(0);
    });

    it('sperrt 61 Minuten nach der Passkey-Anmeldung', async () => {
      expect(
        await patienten(claims(users.therapist, { methode: 'passkey', angemeldetVor: 61 })),
      ).toBe(0);
    });

    it('zählt den zweiten Faktor `webauthn` weiterhin nicht', async () => {
      expect(await patienten(claims(users.therapist, { methode: 'webauthn' }))).toBe(0);
    });
  });

  describe('Regel für die PIN', () => {
    it.each([
      ['483920', null],
      ['000000', 'trivial'],
      ['777777', 'trivial'],
      ['123456', 'trivial'],
      ['456789', 'trivial'],
      ['654321', 'trivial'],
      ['12345', 'format'],
      ['1234567', 'format'],
      ['12a456', 'format'],
      [null, 'format'],
    ])('%s ergibt %s', async (pin, erwartet) => {
      const { rows } = await asPostgres<{ problem: string | null }>(
        'select app.pin_problem($1) as problem',
        [pin],
      );
      expect(rows[0]!.problem).toBe(erwartet);
    });
  });

  describe('PIN festlegen', () => {
    it('speichert nur einen bcrypt-Hash', async () => {
      await pinSetzen();
      const { rows } = await asPostgres<{ pin_hash: string }>(
        'select pin_hash from public.account_pins where user_id = $1',
        [users.therapist],
      );
      expect(rows[0]!.pin_hash).not.toContain(PIN);
      expect(rows[0]!.pin_hash).toMatch(/^\$2[aby]\$10\$/);
    });

    it('ersetzt eine bestehende PIN', async () => {
      await pinSetzen();
      await pinSetzen(users.therapist, '590284');
      const { rows } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.account_pins where user_id = $1',
        [users.therapist],
      );
      expect(rows[0]!.n).toBe(1);
      // Die alte PIN gibt nicht mehr frei.
      const gesperrt = claims(users.therapist, { angemeldetVor: 61 });
      const [alt] = await alsToken<Versuch>(gesperrt, FREIGEBEN, [PIN]);
      expect(alt!.unlocked).toBe(false);
      const [neu] = await alsToken<Versuch>(gesperrt, FREIGEBEN, ['590284']);
      expect(neu!.unlocked).toBe(true);
    });

    it('verlangt eine Anmeldung, die höchstens zehn Minuten zurückliegt (ANN-325)', async () => {
      // Offen durch Bedienung, aber die Anmeldung ist elf Minuten alt.
      await asPostgres(
        `insert into public.session_activity (session_id, user_id, last_activity_at)
         values ($1, $2, now())`,
        [SITZUNG, users.therapist],
      );
      const token = claims(users.therapist, { angemeldetVor: 11 });
      expect(await patienten(token)).toBeGreaterThan(0);
      expect(await fehlerVon(alsToken(token, SETZEN, [PIN]))).toBe('P0001');
    });

    it('zählt eine Freigabe per PIN nicht als frische Anmeldung', async () => {
      await pinSetzen();
      const gesperrt = claims(users.therapist, { angemeldetVor: 61 });
      const [frei] = await alsToken<Versuch>(gesperrt, FREIGEBEN, [PIN]);
      expect(frei!.unlocked).toBe(true);
      expect(await fehlerVon(alsToken(gesperrt, SETZEN, ['590284']))).toBe('P0001');
    });

    it('weist eine gesperrte Sitzung ab', async () => {
      const gesperrt = claims(users.therapist, { angemeldetVor: 61 });
      expect(await fehlerVon(alsToken(gesperrt, SETZEN, [PIN]))).toBe('42501');
    });

    it('weist eine triviale oder falsch geformte PIN ab', async () => {
      const token = claims(users.therapist, {});
      expect(await fehlerVon(alsToken(token, SETZEN, ['123456']))).toBe('22023');
      expect(await fehlerVon(alsToken(token, SETZEN, ['12345']))).toBe('22023');
    });

    it('nennt, ob das eigene Konto eine PIN hat - auch gesperrt', async () => {
      const gesperrt = claims(users.therapist, { angemeldetVor: 61 });
      const vorher = await alsToken<{ hat: boolean }>(
        gesperrt,
        'select public.own_pin_status() as hat',
      );
      expect(vorher[0]!.hat).toBe(false);
      await pinSetzen();
      const nachher = await alsToken<{ hat: boolean }>(
        gesperrt,
        'select public.own_pin_status() as hat',
      );
      expect(nachher[0]!.hat).toBe(true);
      // Die PIN eines anderen Kontos zählt nicht.
      const fremd = await alsToken<{ hat: boolean }>(
        claims(users.office, {}),
        'select public.own_pin_status() as hat',
      );
      expect(fremd[0]!.hat).toBe(false);
    });
  });

  describe('Mit der PIN freigeben (Punkt 11)', () => {
    it('gibt eine gesperrte Sitzung frei und startet die Höchstdauer neu', async () => {
      await pinSetzen();
      const gesperrt = claims(users.therapist, { angemeldetVor: 61 });
      expect(await patienten(gesperrt)).toBe(0);

      const [versuch] = await alsToken<Versuch>(gesperrt, FREIGEBEN, [PIN]);
      expect(versuch).toEqual({ unlocked: true, attempts_left: 5, consumed: false });

      expect(await patienten(gesperrt)).toBeGreaterThan(0);
      const [stand] = await alsToken<{ locked: boolean; seconds_until_max: number }>(
        gesperrt,
        STAND,
      );
      expect(stand!.locked).toBe(false);
      expect(stand!.seconds_until_max).toBeGreaterThan(59 * 60);
    });

    it('gibt keine andere Sitzung desselben Kontos frei', async () => {
      await pinSetzen();
      await alsToken<Versuch>(claims(users.therapist, { angemeldetVor: 61 }), FREIGEBEN, [PIN]);
      const andere = claims(users.therapist, { angemeldetVor: 61, sitzung: ANDERE_SITZUNG });
      expect(await patienten(andere)).toBe(0);
    });

    it('zählt Fehlversuche und verbraucht die Sitzung nach dem fünften', async () => {
      await pinSetzen();
      const gesperrt = claims(users.therapist, { angemeldetVor: 61 });
      const rest: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const [v] = await alsToken<Versuch>(gesperrt, FREIGEBEN, ['111222']);
        expect(v!.unlocked).toBe(false);
        expect(v!.consumed).toBe(false);
        rest.push(v!.attempts_left);
      }
      expect(rest).toEqual([4, 3, 2, 1]);

      const [fuenfter] = await alsToken<Versuch>(gesperrt, FREIGEBEN, ['111222']);
      expect(fuenfter).toEqual({ unlocked: false, attempts_left: 0, consumed: true });

      // Auch die richtige PIN öffnet sie nicht mehr.
      const [richtig] = await alsToken<Versuch>(gesperrt, FREIGEBEN, [PIN]);
      expect(richtig).toEqual({ unlocked: false, attempts_left: 0, consumed: true });
      expect(await patienten(gesperrt)).toBe(0);

      const [stand] = await alsToken<{ locked: boolean; reason: string }>(gesperrt, STAND);
      expect(stand).toMatchObject({ locked: true, reason: 'verbraucht' });
    });

    it('hält eine verbrauchte Sitzung zu, auch wenn das Token eine frische Anmeldung trägt', async () => {
      // Dieselbe Sitzungskennung bleibt verbraucht, auch wenn der Claim eine
      // frische Anmeldung behauptet: Eine neue Anmeldung ist eine neue Sitzung.
      await pinSetzen();
      const gesperrt = claims(users.therapist, { angemeldetVor: 61 });
      for (let i = 0; i < 5; i += 1) await alsToken(gesperrt, FREIGEBEN, ['111222']);
      expect(await patienten(claims(users.therapist, { angemeldetVor: 1 }))).toBe(0);
      expect(
        await patienten(claims(users.therapist, { angemeldetVor: 1, sitzung: ANDERE_SITZUNG })),
      ).toBeGreaterThan(0);
    });

    it('setzt den Zähler mit der richtigen PIN zurück', async () => {
      await pinSetzen();
      const gesperrt = claims(users.therapist, { angemeldetVor: 61 });
      for (let i = 0; i < 4; i += 1) await alsToken(gesperrt, FREIGEBEN, ['111222']);
      await alsToken(gesperrt, FREIGEBEN, [PIN]);
      const [v] = await alsToken<Versuch>(gesperrt, FREIGEBEN, ['111222']);
      expect(v!.attempts_left).toBe(4);
    });

    it('meldet nie an: ohne Sitzung oder ohne Anmeldung kein Versuch', async () => {
      await pinSetzen();
      expect(
        await fehlerVon(alsToken(claims(users.therapist, { sitzung: null }), FREIGEBEN, [PIN])),
      ).toBe('42501');
      expect(
        await fehlerVon(
          alsToken(claims(users.therapist, { angemeldetVor: null }), FREIGEBEN, [PIN]),
        ),
      ).toBe('42501');
    });

    it('weist ein Konto ohne PIN ab', async () => {
      const gesperrt = claims(users.therapist, { angemeldetVor: 61 });
      expect(await fehlerVon(alsToken(gesperrt, FREIGEBEN, [PIN]))).toBe('P0002');
    });

    it('nimmt die Sitzungszeile eines anderen Kontos nicht an', async () => {
      await pinSetzen();
      await pinSetzen(users.office, '590284');
      await alsToken<Versuch>(claims(users.therapist, { angemeldetVor: 61 }), FREIGEBEN, [PIN]);
      // Dieselbe Sitzungskennung mit einem anderen Konto: abgewiesen, und die
      // Freigabe des ersten Kontos öffnet dem zweiten nichts.
      const fremd = claims(users.office, { angemeldetVor: 61 });
      expect(await fehlerVon(alsToken(fremd, FREIGEBEN, ['590284']))).toBe('42501');
      expect(await patienten(fremd)).toBe(0);
    });

    it('gilt für Plattformkonten ebenso (Punkt 8)', async () => {
      await pinSetzen(users.plattformErika);
      const gesperrt = claims(users.plattformErika, { angemeldetVor: 61 });
      const [v] = await alsToken<Versuch>(gesperrt, FREIGEBEN, [PIN]);
      expect(v!.unlocked).toBe(true);
      const [stand] = await alsToken<{ locked: boolean }>(gesperrt, STAND);
      expect(stand!.locked).toBe(false);
    });

    it('entfernt erledigte Zeilen nach einem Tag, offene Fehlversuche nicht', async () => {
      await pinSetzen();
      await asPostgres(
        `insert into public.session_unlocks (session_id, user_id, failed_attempts, changed_at)
         values ('bcbcbcbc-bcbc-4cbc-8cbc-00000000000a', $1, 0, now() - interval '25 hours'),
                ('bcbcbcbc-bcbc-4cbc-8cbc-00000000000b', $1, 2, now() - interval '25 hours'),
                ('bcbcbcbc-bcbc-4cbc-8cbc-00000000000c', $1, 5, now() - interval '25 hours')`,
        [users.therapist],
      );
      await asPostgres(
        `update public.session_unlocks set consumed_at = changed_at
         where session_id = 'bcbcbcbc-bcbc-4cbc-8cbc-00000000000c'`,
      );
      await alsToken(claims(users.therapist, { angemeldetVor: 61 }), FREIGEBEN, [PIN]);
      const { rows } = await asPostgres<{ session_id: string }>(
        'select session_id from public.session_unlocks order by session_id',
      );
      expect(rows.map((r) => r.session_id)).toEqual([
        SITZUNG,
        'bcbcbcbc-bcbc-4cbc-8cbc-00000000000b',
      ]);
    });
  });

  describe('Kein direkter Zugriff', () => {
    it('gibt PIN und Sitzungsstand keinem Konto zu lesen oder zu schreiben', async () => {
      await pinSetzen();
      for (const tabelle of ['account_pins', 'session_unlocks']) {
        expect(
          await fehlerVon(
            alsToken(claims(users.ownerTherapist, {}), `select * from public.${tabelle}`),
          ),
        ).toBe('42501');
      }
      expect(
        await fehlerVon(
          alsToken(
            claims(users.therapist, {}),
            `update public.session_unlocks set failed_attempts = 0`,
          ),
        ),
      ).toBe('42501');
    });

    it('lässt die Hilfsfunktionen für keine Anwendungsrolle ausführen', async () => {
      const { rows } = await asPostgres<{ fn: string }>(
        `select f.fn
         from unnest(array['app.pin_problem(text)', 'app.pin_max_attempts()',
                           'app.pin_fresh_authentication()', 'app.session_consumed()']) as f(fn)
         where has_function_privilege('authenticated', f.fn, 'execute')
            or has_function_privilege('anon', f.fn, 'execute')`,
      );
      expect(rows).toEqual([]);
    });

    it('lässt die drei Aufrufe ohne Anmeldung nicht zu', async () => {
      const { rows } = await asPostgres<{ fn: string }>(
        `select f.fn
         from unnest(array['public.set_own_pin(text)', 'public.unlock_with_pin(text)',
                           'public.own_pin_status()']) as f(fn)
         where has_function_privilege('anon', f.fn, 'execute')`,
      );
      expect(rows).toEqual([]);
    });
  });
});

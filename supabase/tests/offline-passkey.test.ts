import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, jwtClaims, resetDatabase, testDatabaseUrl } from './helpers/db';

/**
 * Die Schlüssel für die Freigabe ohne Netz (TRK-009, ADR-025 Punkt 16,
 * ANN-359): Mit der Freigabe eines Passkeys gibt das Gerät seinen
 * öffentlichen Schlüssel ab; in offener Sitzung holt die Anwendung ihn auf
 * das Gerät. Nur eigene, freigegebene, noch vorhandene Passkeys.
 */

const { users } = SEED;
const SITZUNG = 'bcbcbcbc-bcbc-4cbc-8cbc-000000000011';
const FREIGEBEN = 'select public.approve_own_passkey($1, $2, $3, $4)';
const SCHLUESSEL = 'select * from public.own_offline_passkeys()';

// Synthetisch: Form wie ein SPKI eines P-256-Schlüssels, kein echter.
const SPKI = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE' + 'A'.repeat(84) + '==';
const RAW_ID = 'q2Vy-ZXRfaWRfZm9yX3Rlc3Rz';

function claims(konto: string, angemeldetVor = 1): string {
  const basis = JSON.parse(jwtClaims(konto)) as Record<string, unknown>;
  basis.amr = [
    { method: 'password', timestamp: Math.floor(Date.now() / 1000) - angemeldetVor * 60 },
  ];
  basis.session_id = SITZUNG;
  return JSON.stringify(basis);
}

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

async function passkeyAngelegt(konto: string): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into auth.webauthn_credentials (user_id, created_at) values ($1, now()) returning id`,
    [konto],
  );
  return rows[0]!.id;
}

interface Schluessel {
  webauthn_id: string;
  public_key: string;
  public_key_alg: number;
}

describe('Schlüssel für die Freigabe ohne Netz (TRK-009)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.session_unlocks');
    await asPostgres('delete from public.session_activity');
    await asPostgres('delete from public.passkey_approvals');
    await asPostgres('delete from auth.webauthn_credentials');
  });

  it('nimmt den Schlüssel mit der Freigabe an und gibt ihn in offener Sitzung heraus', async () => {
    const passkey = await passkeyAngelegt(users.plattformErika);
    await alsToken(claims(users.plattformErika), FREIGEBEN, [passkey, RAW_ID, SPKI, -7]);
    expect(await alsToken<Schluessel>(claims(users.plattformErika), SCHLUESSEL)).toEqual([
      { webauthn_id: RAW_ID, public_key: SPKI, public_key_alg: -7 },
    ]);
  });

  it('ohne Schlüssel bleibt die Freigabe wie bisher - und ohne Netz öffnet er nichts', async () => {
    const passkey = await passkeyAngelegt(users.plattformErika);
    await alsToken(claims(users.plattformErika), 'select public.approve_own_passkey($1)', [
      passkey,
    ]);
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.passkey_approvals where credential_id = $1',
      [passkey],
    );
    expect(rows[0]!.n).toBe(1);
    expect(await alsToken(claims(users.plattformErika), SCHLUESSEL)).toEqual([]);
  });

  it('nur in offener Sitzung, nur für das eigene Konto (ADR-025 Punkt 16)', async () => {
    const passkey = await passkeyAngelegt(users.plattformErika);
    await alsToken(claims(users.plattformErika), FREIGEBEN, [passkey, RAW_ID, SPKI, -7]);
    // Gesperrt (Höchstdauer um): keine Schlüssel, keine Freigabe.
    expect(await fehlerVon(alsToken(claims(users.plattformErika, 61), SCHLUESSEL))).toBe('42501');
    const zweiter = await passkeyAngelegt(users.plattformErika);
    expect(
      await fehlerVon(
        alsToken(claims(users.plattformErika, 61), FREIGEBEN, [zweiter, RAW_ID, SPKI, -7]),
      ),
    ).toBe('42501');
    // Ein anderes Konto sieht Erikas Schlüssel nicht.
    expect(await alsToken(claims(users.plattformTina), SCHLUESSEL)).toEqual([]);
    expect(await alsToken(claims(users.therapist), SCHLUESSEL)).toEqual([]);
    // Ohne Anmeldung nichts.
    expect(await fehlerVon(alsToken('{}', SCHLUESSEL))).toBe('42501');
  });

  it('ein beim Anmeldedienst entfernter Passkey öffnet nach dem nächsten Laden nichts mehr', async () => {
    const passkey = await passkeyAngelegt(users.plattformErika);
    await alsToken(claims(users.plattformErika), FREIGEBEN, [passkey, RAW_ID, SPKI, -7]);
    await asPostgres('delete from auth.webauthn_credentials where id = $1', [passkey]);
    expect(await alsToken(claims(users.plattformErika), SCHLUESSEL)).toEqual([]);
  });

  it('prüft die Form des Schlüssels, bevor er irgendwo steht', async () => {
    const passkey = await passkeyAngelegt(users.plattformErika);
    for (const falsch of [
      [passkey, RAW_ID, null, -7],
      [passkey, null, SPKI, -7],
      [passkey, RAW_ID, SPKI, null],
      [passkey, RAW_ID, SPKI, -35],
      [passkey, 'kurz', SPKI, -7],
      [passkey, RAW_ID, 'kein<base64>', -7],
      [passkey, RAW_ID, 'A'.repeat(5000), -7],
    ]) {
      expect(await fehlerVon(alsToken(claims(users.plattformErika), FREIGEBEN, falsch))).toBe(
        '22023',
      );
    }
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.passkey_approvals',
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('kein Tabellenrecht auf die Freigaben (ADR-004)', async () => {
    expect(
      await fehlerVon(
        alsToken(claims(users.plattformErika), 'select * from public.passkey_approvals'),
      ),
    ).toBe('42501');
  });
});

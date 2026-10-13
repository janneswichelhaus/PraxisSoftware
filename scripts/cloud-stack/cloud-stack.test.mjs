import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MANAGED_KEYS, mergeEnvLocal, parseEnv } from './env.mjs';
import { readConfigToml } from './gateway.mjs';
import { apiKeys, signJwt, verifyJwt } from './jwt.mjs';

/**
 * Die reinen Teile des Cloud-Stacks (scripts/cloud-stack.sh): Tokens, die
 * Umgebungsdatei und das, was das Gateway aus supabase/config.toml liest. Den
 * Stack selbst prueft `pnpm test:e2e --project authenticated` gegen ihn.
 */

const SECRET = 'nur-ein-testwert-fuer-diesen-test-mit-genug-laenge';

describe('jwt.mjs', () => {
  it('prueft, was es selbst signiert hat', () => {
    const token = signJwt({ role: 'authenticated', sub: 'a', exp: 2_000_000_000 }, SECRET);
    expect(verifyJwt(token, SECRET, 1_900_000_000)).toMatchObject({ role: 'authenticated' });
  });

  it('weist ein fremdes Secret, eine veraenderte Nutzlast und den Ablauf ab', () => {
    const token = signJwt({ role: 'anon', exp: 2_000_000_000 }, SECRET);
    expect(verifyJwt(token, `${SECRET}-anders`, 1_900_000_000)).toBeNull();

    const [kopf, , signatur] = token.split('.');
    const nutzlast = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    expect(verifyJwt(`${kopf}.${nutzlast}.${signatur}`, SECRET, 1_900_000_000)).toBeNull();

    expect(verifyJwt(token, SECRET, 2_000_000_001)).toBeNull();
  });

  it('nimmt kein Token ohne Signaturverfahren HS256 an', () => {
    const kopf = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const nutzlast = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    expect(verifyJwt(`${kopf}.${nutzlast}.`, SECRET)).toBeNull();
    expect(verifyJwt('kein-token', SECRET)).toBeNull();
  });

  it('leitet anon und service_role aus dem Secret ab', () => {
    const { anon, serviceRole } = apiKeys(SECRET, 1_900_000_000);
    expect(verifyJwt(anon, SECRET, 1_900_000_001)).toMatchObject({ role: 'anon' });
    expect(verifyJwt(serviceRole, SECRET, 1_900_000_001)).toMatchObject({ role: 'service_role' });
  });
});

describe('env.mjs', () => {
  const werte = new Map(MANAGED_KEYS.map((key) => [key, `wert-${key}`]));

  it('ersetzt nur die eigenen Zeilen und laesst alle anderen stehen', () => {
    const vorher = [
      '# eigener Kommentar',
      'VITE_PTV_TILE_API_KEY=abc',
      'VITE_SUPABASE_URL=http://anders.invalid',
      'E2E_BASE_URL=http://127.0.0.1:5174',
      '',
    ].join('\n');
    const nachher = mergeEnvLocal(vorher, werte);
    const gelesen = parseEnv(nachher);

    expect(gelesen.get('VITE_PTV_TILE_API_KEY')).toBe('abc');
    expect(gelesen.get('E2E_BASE_URL')).toBe('http://127.0.0.1:5174');
    expect(gelesen.get('VITE_SUPABASE_URL')).toBe('wert-VITE_SUPABASE_URL');
    expect(nachher).toContain('# eigener Kommentar');
    expect(nachher.match(/^VITE_SUPABASE_URL=/gm)).toHaveLength(1);
  });

  it('bleibt beim zweiten Lauf gleich', () => {
    const einmal = mergeEnvLocal('', werte);
    expect(mergeEnvLocal(einmal, werte)).toBe(einmal);
  });

  it('schreibt den service_role-Schluessel nie in die Umgebungsdatei', () => {
    expect(MANAGED_KEYS.some((key) => /service/i.test(key))).toBe(false);
  });
});

describe('gateway.mjs: supabase/config.toml', () => {
  const konfiguration = readConfigToml(readFileSync('supabase/config.toml', 'utf8'));

  it('kennt verify_jwt jeder Edge Function', () => {
    expect(konfiguration.verifyJwtByFunction.get('location-provider')).toBe(true);
    expect(konfiguration.verifyJwtByFunction.get('platform-access')).toBe(false);
  });

  it('liest die Groessengrenze der Storage-API', () => {
    expect(konfiguration.fileSizeLimit).toBe(50 * 1024 * 1024);
  });
});

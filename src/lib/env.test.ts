import { describe, expect, it } from 'vitest';
import { readEnv } from './env';

describe('readEnv', () => {
  it('akzeptiert eine vollstaendige Konfiguration', () => {
    const env = readEnv({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'anon-platzhalter',
    });
    expect(env.supabaseUrl).toBe('http://127.0.0.1:54321');
  });

  it('bricht mit verstaendlicher Meldung ab, statt halb konfiguriert zu starten', () => {
    expect(() => readEnv({ VITE_SUPABASE_ANON_KEY: 'x' })).toThrow(/VITE_SUPABASE_URL fehlt/);
    expect(() => readEnv({ VITE_SUPABASE_URL: 'kein-url', VITE_SUPABASE_ANON_KEY: 'x' })).toThrow(
      /keine gültige URL/,
    );
  });
});

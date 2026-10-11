import { describe, expect, it } from 'vitest';
import { readEnv, readMapTileApiKey } from './env';

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

describe('readMapTileApiKey', () => {
  it('liefert den konfigurierten Schluessel', () => {
    expect(readMapTileApiKey({ VITE_PTV_TILE_API_KEY: 'schluessel' })).toBe('schluessel');
  });

  it('liefert ohne Schluessel null, statt zu werfen', () => {
    // Die Anwendung laeuft ohne Kartenkacheln vollstaendig; nur die Karte
    // zeigt einen Hinweis (ADR-019 Punkt 24).
    expect(readMapTileApiKey({})).toBeNull();
    expect(readMapTileApiKey({ VITE_PTV_TILE_API_KEY: '' })).toBeNull();
    expect(readMapTileApiKey({ VITE_PTV_TILE_API_KEY: '   ' })).toBeNull();
  });
});

describe('readAppUmgebung (ADR-025 Punkt 15, ANN-326)', () => {
  it('nimmt einen bekannten Wert', async () => {
    const { readAppUmgebung } = await import('./env');
    expect(readAppUmgebung({ VITE_APP_ENVIRONMENT: 'test' })).toBe('test');
    expect(readAppUmgebung({ VITE_APP_ENVIRONMENT: ' production ', DEV: true })).toBe('production');
  });

  it('gilt ohne Wert als Produktion - außer im Entwicklungsserver', async () => {
    const { readAppUmgebung } = await import('./env');
    expect(readAppUmgebung({})).toBe('production');
    expect(readAppUmgebung({ VITE_APP_ENVIRONMENT: 'staging' })).toBe('production');
    expect(readAppUmgebung({ DEV: true })).toBe('development');
  });

  it('zeigt den Kennwortweg für Testkonten nie in Produktion', async () => {
    const { kennwortTestzugang } = await import('./env');
    expect(kennwortTestzugang({})).toBe(false);
    expect(kennwortTestzugang({ VITE_APP_ENVIRONMENT: 'production', DEV: true })).toBe(false);
    expect(kennwortTestzugang({ VITE_APP_ENVIRONMENT: 'test' })).toBe(true);
    expect(kennwortTestzugang({ DEV: true })).toBe(true);
  });
});

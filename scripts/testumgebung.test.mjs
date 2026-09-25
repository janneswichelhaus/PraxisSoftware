import { describe, expect, it } from 'vitest';
import {
  TIEFE_ROUTE,
  htaccess,
  inhaltsrichtlinie,
  projektRef,
  pruefeAuslieferung,
  pruefeKonfiguration,
  robotsTxt,
} from './testumgebung.mjs';

/**
 * Auslieferung in die Test-Umgebung (OPS-002a). Alle Werte sind erfunden;
 * die Schlüssel entstehen erst zur Laufzeit, damit der Secret-Scan keine
 * Attrappe für einen echten Schlüssel hält.
 */

const REF = 'abcdefghijklmnopqrst';
const SUPABASE_URL = `https://${REF}.supabase.co`;
const POOLER = `postgresql://postgres.${REF}:kennwort@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;

function jwt(nutzlast) {
  const teil = (wert) => Buffer.from(JSON.stringify(wert)).toString('base64url');
  return `${teil({ alg: 'HS256', typ: 'JWT' })}.${teil(nutzlast)}.signatur-attrappe`;
}

const ANON = jwt({ iss: 'supabase', ref: REF, role: 'anon' });

function konfiguration(abweichung = {}) {
  return pruefeKonfiguration({
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON,
    databaseUrl: POOLER,
    ...abweichung,
  });
}

describe('pruefeKonfiguration', () => {
  it('lässt eine stimmige Konfiguration durch - anon-JWT oder publishable-Schlüssel', () => {
    expect(konfiguration()).toEqual([]);
    expect(konfiguration({ anonKey: 'sb_publishable_attrappe' })).toEqual([]);
    expect(
      konfiguration({
        databaseUrl: `postgresql://postgres:kennwort@db.${REF}.supabase.co:5432/postgres`,
      }),
    ).toEqual([]);
  });

  it('weist den service_role-Schlüssel ab - er darf nie ins Browser-Bundle (ADR-015)', () => {
    const fehler = konfiguration({ anonKey: jwt({ ref: REF, role: 'service_role' }) });
    expect(fehler).toEqual(['TESTENV_SUPABASE_ANON_KEY ist nicht der anon-Schlüssel.']);
  });

  it('weist einen geheimen Schlüssel neuer Bauart ab', () => {
    const fehler = konfiguration({ anonKey: `sb_secret_${'x'.repeat(20)}` });
    expect(fehler).toEqual(['TESTENV_SUPABASE_ANON_KEY ist ein geheimer Schlüssel (sb_secret_…).']);
  });

  it('weist einen leeren oder unbekannten Schlüssel ab', () => {
    expect(konfiguration({ anonKey: '' })).toHaveLength(1);
    expect(konfiguration({ anonKey: 'irgendwas' })).toHaveLength(1);
  });

  it('weist eine Datenbank eines anderen Projekts ab', () => {
    const fremd = POOLER.replace(REF, 'zzzzzzzzzzzzzzzzzzzz');
    expect(konfiguration({ databaseUrl: fremd })).toEqual([
      'TESTENV_DATABASE_URL gehört nicht zum Projekt aus TESTENV_SUPABASE_URL.',
    ]);
  });

  it('weist die lokale Wegwerf-Datenbank ab', () => {
    const fehler = konfiguration({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54329/postgres',
    });
    expect(fehler).toContain('TESTENV_DATABASE_URL zeigt auf einen lokalen Rechner.');
  });

  it('weist eine Projekt-URL ohne HTTPS oder außerhalb von supabase.co ab', () => {
    expect(konfiguration({ supabaseUrl: `http://${REF}.supabase.co` })[0]).toContain(
      'TESTENV_SUPABASE_URL',
    );
    expect(konfiguration({ supabaseUrl: 'https://beispiel.invalid' })[0]).toContain(
      'TESTENV_SUPABASE_URL',
    );
  });

  it('nennt in keiner Meldung einen Wert', () => {
    const fehler = konfiguration({
      anonKey: jwt({ role: 'service_role' }),
      databaseUrl: 'postgresql://postgres:geheim@127.0.0.1:5432/postgres',
    });
    expect(fehler.join(' ')).not.toMatch(/geheim|service_role"|eyJ/);
  });
});

describe('projektRef', () => {
  it('liest den Projektschlüssel nur aus einer HTTPS-Adresse unter supabase.co', () => {
    expect(projektRef(SUPABASE_URL)).toBe(REF);
    expect(projektRef(`${SUPABASE_URL}/`)).toBe(REF);
    expect(projektRef(`https://${REF}.supabase.co.beispiel.invalid`)).toBeNull();
    expect(projektRef('kein-url')).toBeNull();
  });

  it('weist eine Adresse mit Pfad ab - etwa die REST-Adresse aus dem Dashboard', () => {
    expect(projektRef(`${SUPABASE_URL}/rest/v1/`)).toBeNull();
    expect(projektRef(`${SUPABASE_URL}/rest/v1`)).toBeNull();
    expect(projektRef(`${SUPABASE_URL}/?x=1`)).toBeNull();
    expect(konfiguration({ supabaseUrl: `${SUPABASE_URL}/rest/v1/` })[0]).toContain(
      'TESTENV_SUPABASE_URL',
    );
  });
});

describe('htaccess', () => {
  it('leitet Routen auf index.html um und setzt noindex und Sicherheitskopfzeilen', () => {
    const datei = htaccess({ supabaseUrl: SUPABASE_URL, tuerDatei: null });
    expect(datei).toContain('RewriteRule ^ index.html [L]');
    expect(datei).toContain('X-Robots-Tag "noindex, nofollow"');
    expect(datei).toContain('X-Content-Type-Options "nosniff"');
    expect(datei).toContain('Content-Security-Policy');
    expect(datei).toContain('Options -Indexes');
  });

  it('ohne Kennwortdatei keine zweite Tür', () => {
    expect(htaccess({ supabaseUrl: SUPABASE_URL, tuerDatei: null })).not.toContain('AuthType');
  });

  it('mit Kennwortdatei die zweite Tür, Datei neben dem ausgelieferten Ordner', () => {
    const datei = htaccess({
      supabaseUrl: SUPABASE_URL,
      tuerDatei: '/var/www/virtual/prtest/praxis-test/tuer.htpasswd',
    });
    expect(datei).toContain('AuthType Basic');
    expect(datei).toContain('AuthUserFile "/var/www/virtual/prtest/praxis-test/tuer.htpasswd"');
    expect(datei).toContain('Require valid-user');
  });
});

describe('inhaltsrichtlinie', () => {
  it('erlaubt Skripte nur vom eigenen Ursprung und Verbindungen nur zum Projekt', () => {
    const csp = inhaltsrichtlinie(SUPABASE_URL);
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain(`connect-src 'self' ${SUPABASE_URL} wss://${REF}.supabase.co;`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('"');
  });
});

describe('robotsTxt', () => {
  it('sperrt die ganze Seite', () => {
    expect(robotsTxt()).toBe('User-agent: *\nDisallow: /\n');
  });
});

/** Ein Ersatz für fetch: Antworten je Pfad und je Anmeldung. */
function server({ kopfzeilen, tuer = null, umleitung = true }) {
  const aufrufe = [];
  const abrufen = async (url, optionen = {}) => {
    const adresse = new URL(url);
    const pfad = adresse.pathname;
    const anmeldung = optionen.headers?.authorization ?? null;
    if (adresse.protocol === 'http:') {
      return umleitung
        ? new Response('', { status: 308, headers: { location: `https://${adresse.host}/` } })
        : new Response('', { status: 200 });
    }
    aufrufe.push({ pfad, anmeldung });
    if (tuer && anmeldung !== tuer) return new Response('', { status: 401 });
    if (pfad !== '/' && !umleitung) return new Response('nicht da', { status: 404 });
    return new Response('<html><body><div id="root"></div></body></html>', {
      status: 200,
      headers: kopfzeilen,
    });
  };
  return { abrufen, aufrufe };
}

const GUTE_KOPFZEILEN = {
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'self'",
  'x-content-type-options': 'nosniff',
};

describe('pruefeAuslieferung', () => {
  it('besteht, wenn Startseite und tiefe Route die Anwendung mit Kopfzeilen liefern', async () => {
    const { abrufen, aufrufe } = server({ kopfzeilen: GUTE_KOPFZEILEN });
    expect(await pruefeAuslieferung({ adresse: 'https://prtest.uber.space', abrufen })).toEqual([]);
    expect(aufrufe.map((aufruf) => aufruf.pfad)).toEqual(['/', TIEFE_ROUTE]);
  });

  it('meldet, wenn die .htaccess nicht ausgewertet wird: keine Umleitung, keine Kopfzeilen', async () => {
    const { abrufen } = server({ kopfzeilen: {}, umleitung: false });
    const fehler = await pruefeAuslieferung({ adresse: 'https://prtest.uber.space', abrufen });
    expect(fehler).toContain(`${TIEFE_ROUTE}: Status 404 statt 200.`);
    expect(fehler).toContain('/: Kopfzeile X-Robots-Tag fehlt.');
    expect(fehler).toContain('/: Kopfzeile Content-Security-Policy fehlt.');
    expect(fehler).toContain('HTTP leitet nicht auf HTTPS um (Status 200).');
  });

  it('mit zweiter Tür: meldet sich an und prüft, dass es ohne Kennwort nicht geht', async () => {
    const erwartet = `Basic ${Buffer.from('praxis:tuer-kennwort').toString('base64')}`;
    const { abrufen, aufrufe } = server({ kopfzeilen: GUTE_KOPFZEILEN, tuer: erwartet });
    const fehler = await pruefeAuslieferung({
      adresse: 'https://prtest.uber.space',
      tuerKennwort: 'tuer-kennwort',
      abrufen,
    });
    expect(fehler).toEqual([]);
    expect(aufrufe.at(-1)).toEqual({ pfad: '/', anmeldung: null });
  });

  it('mit zweiter Tür: meldet eine offene Tür', async () => {
    const { abrufen } = server({ kopfzeilen: GUTE_KOPFZEILEN });
    const fehler = await pruefeAuslieferung({
      adresse: 'https://prtest.uber.space',
      tuerKennwort: 'tuer-kennwort',
      abrufen,
    });
    expect(fehler).toEqual(['Zweite Tür: ohne Kennwort Status 200 statt 401.']);
  });
});

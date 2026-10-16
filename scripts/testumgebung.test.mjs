import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  KARTENDIENST_HOSTS,
  SSH_PAUSEN,
  TIEFE_ROUTE,
  htaccess,
  inhaltsrichtlinie,
  projektRef,
  pruefeAuslieferung,
  pruefeKonfiguration,
  robotsTxt,
  sshNeuVersuchen,
  sshVersuch,
  verbinde,
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

  it('gibt die Kamera nur der eigenen Herkunft frei und sonst nichts (ADR-017 Punkt 33)', () => {
    const datei = htaccess({ supabaseUrl: SUPABASE_URL, tuerDatei: null });
    // Der ganze Wert, nicht nur ein Teil: Eine weitere Freigabe - Mikrofon,
    // ein fremder Ursprung, ein Stern - soll hier auffallen.
    expect(datei).toContain(
      'Header always set Permissions-Policy "camera=(self), microphone=(), payment=(), usb=()"',
    );
    expect(datei.match(/Permissions-Policy/g)).toHaveLength(1);
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
    // ADR-017 Punkt 58: Rahmen nur aus einer Objekt-URL (PDF), sonst keiner.
    expect(csp).toContain('frame-src blob:;');
    expect(csp).not.toMatch(/frame-src[^;]*(https?:|\*|'self')/);
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('"');
  });
});

describe('inhaltsrichtlinie mit Kartendienst', () => {
  it('nennt den Kartendienst nur, wenn er eingerichtet ist', () => {
    const ohne = inhaltsrichtlinie(SUPABASE_URL);
    expect(ohne).not.toContain('myptv');

    const mit = inhaltsrichtlinie(SUPABASE_URL, { kartendienst: true });
    const hosts = KARTENDIENST_HOSTS.join(' ');
    expect(mit).toContain(`connect-src 'self' ${SUPABASE_URL} wss://${REF}.supabase.co ${hosts};`);
    expect(mit).toContain(`img-src 'self' data: blob: ${SUPABASE_URL} ${hosts};`);
    // Skripte bleiben beim eigenen Ursprung, auch mit Karte.
    expect(mit).toContain("script-src 'self';");
    expect(htaccess({ supabaseUrl: SUPABASE_URL, kartendienst: true })).toContain(mit);
  });

  it('kennt genau die Hosts, die der Anzeigeadapter anspricht', () => {
    const adapter = readFileSync('src/lib/location/ptv-display.ts', 'utf8');
    const imAdapter = [...adapter.matchAll(/https:\/\/([a-z0-9.-]+\.myptv\.com)\//g)].map(
      (treffer) => treffer[1],
    );
    const kachelHosts = /KACHEL_HOSTS[^=]*= \[([^\]]*)\]/.exec(adapter)?.[1] ?? '';
    for (const host of kachelHosts.matchAll(/'([^']+)'/g)) imAdapter.push(host[1]);
    expect(new Set(imAdapter)).toEqual(
      new Set(KARTENDIENST_HOSTS.map((url) => new URL(url).hostname)),
    );
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

// Wörtlich aus dem gescheiterten Lauf vom 2026-10-16 (BEF-171), mit einer
// Adresse aus dem Dokumentationsbereich.
const ABBRUCH =
  'kex_exchange_identification: read: Connection reset by peer\nConnection reset by 192.0.2.10 port 22\n';
const ABGEWIESEN = 'konto@host.example: Permission denied (publickey).\n';

describe('sshNeuVersuchen', () => {
  it('versucht es neu, wenn die Verbindung vor der Anmeldung abbricht oder ausbleibt', () => {
    expect(sshNeuVersuchen(ABBRUCH)).toBe(true);
    expect(sshNeuVersuchen('kex_exchange_identification: Connection closed by remote host')).toBe(
      true,
    );
    expect(sshNeuVersuchen('ssh: connect to host 192.0.2.10 port 22: Connection timed out')).toBe(
      true,
    );
    expect(sshNeuVersuchen('ssh: connect to host 192.0.2.10 port 22: Connection refused')).toBe(
      true,
    );
  });

  it('nicht bei abgewiesenem Schlüssel, fremdem Serverschlüssel oder ohne Meldung', () => {
    expect(sshNeuVersuchen(ABGEWIESEN)).toBe(false);
    expect(sshNeuVersuchen('Host key verification failed.\n')).toBe(false);
    // Auch wenn der Server danach die Verbindung schließt: Die Anmeldung ist das Problem.
    expect(sshNeuVersuchen(`${ABGEWIESEN}Connection closed by 192.0.2.10 port 22\n`)).toBe(false);
    expect(sshNeuVersuchen('')).toBe(false);
  });
});

describe('verbinde', () => {
  function ablauf(...ergebnisse) {
    const pausen = [];
    const meldungen = [];
    let versuche = 0;
    const optionen = {
      versuchen: async () => ergebnisse[Math.min(versuche++, ergebnisse.length - 1)],
      warten: async (sekunden) => {
        pausen.push(sekunden);
      },
      melden: (meldung) => meldungen.push(meldung),
    };
    return { optionen, pausen, meldungen, versuche: () => versuche };
  }
  const GEHT = { ok: true, meldung: '' };
  const BRICHT_AB = { ok: false, meldung: ABBRUCH };

  it('verbindet beim ersten Versuch ohne Pause und ohne Meldung', async () => {
    const { optionen, pausen, meldungen, versuche } = ablauf(GEHT);
    expect(await verbinde(optionen)).toBe(true);
    expect([versuche(), pausen, meldungen]).toEqual([1, [], []]);
  });

  it('versucht es nach einem Abbruch mit wachsender Pause neu (BEF-171)', async () => {
    const { optionen, pausen, meldungen, versuche } = ablauf(BRICHT_AB, BRICHT_AB, GEHT);
    expect(await verbinde(optionen)).toBe(true);
    expect(versuche()).toBe(3);
    expect(pausen).toEqual([30, 60]);
    expect(meldungen).toEqual([
      '::warning::SSH-Verbindung im 1. Versuch abgebrochen (kex_exchange_identification: read: Connection reset by peer / Connection reset by 192.0.2.10 port 22), nächster Versuch in 30 s.',
      expect.stringMatching(/^::warning::SSH-Verbindung im 2\. Versuch abgebrochen .* in 60 s\.$/),
      'SSH-Verbindung im 3. Versuch aufgebaut.',
    ]);
  });

  it('gibt nach fünf Versuchen in gut sieben Minuten auf (ANN-559)', async () => {
    const { optionen, pausen, meldungen, versuche } = ablauf(BRICHT_AB);
    expect(await verbinde(optionen)).toBe(false);
    expect(versuche()).toBe(5);
    expect(pausen).toEqual(SSH_PAUSEN);
    expect(SSH_PAUSEN.reduce((summe, pause) => summe + pause, 0)).toBe(450);
    expect(meldungen.at(-1)).toMatch(/^::error::Keine SSH-Verbindung nach 5 Versuchen: /);
  });

  it('versucht es bei abgewiesenem Schlüssel nicht neu', async () => {
    const { optionen, pausen, meldungen, versuche } = ablauf({ ok: false, meldung: ABGEWIESEN });
    expect(await verbinde(optionen)).toBe(false);
    expect([versuche(), pausen]).toEqual([1, []]);
    expect(meldungen).toEqual([
      '::error::SSH-Verbindung abgewiesen, kein neuer Versuch: konto@host.example: Permission denied (publickey).',
    ]);
  });
});

describe('sshVersuch', () => {
  // Node steht für ssh: ein echter Prozess mit Rückgabewert und stderr.
  it('liefert den Erfolg und die Meldung auf stderr eines Prozesses', async () => {
    expect(await sshVersuch(process.execPath, ['-e', ''])).toEqual({ ok: true, meldung: '' });
    const skript = `process.stderr.write(${JSON.stringify(ABBRUCH)}); process.exit(255)`;
    expect(await sshVersuch(process.execPath, ['-e', skript])).toEqual({
      ok: false,
      meldung: ABBRUCH,
    });
  });

  it('meldet ein fehlendes Programm als Fehlschlag ohne neuen Versuch', async () => {
    const ergebnis = await sshVersuch('/gibt/es/nicht/ssh', []);
    expect(ergebnis.ok).toBe(false);
    expect(sshNeuVersuchen(ergebnis.meldung)).toBe(false);
  });
});

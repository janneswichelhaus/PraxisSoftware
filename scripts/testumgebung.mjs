#!/usr/bin/env node
/**
 * Auslieferung in die Test-Umgebung (OPS-002a).
 *
 * Drei Befehle für `.github/workflows/test-umgebung.yml`:
 *
 *   node scripts/testumgebung.mjs konfiguration
 *     Prüft die Secrets, bevor irgendetwas gebaut oder hochgeladen wird:
 *     kein geheimer Supabase-Schlüssel im Browser-Bundle, Datenbank und
 *     Projekt-URL gehören zum selben Projekt, nichts zeigt auf eine lokale
 *     Datenbank.
 *
 *   node scripts/testumgebung.mjs vorbereiten <dist>
 *     Legt `.htaccess` und `robots.txt` in den Auslieferungsordner.
 *
 *   node scripts/testumgebung.mjs pruefen <adresse>
 *     Prüft die ausgelieferte Seite: Startseite, tiefe Route, Kopfzeilen und
 *     - wenn die zweite Tür aktiv ist - die Abweisung ohne Kennwort.
 *
 * Die reinen Funktionen hält `scripts/testumgebung.test.mjs` fest. Kein
 * Befehl gibt einen Schlüssel oder ein Kennwort aus.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Benutzername der zweiten Tür. Kein Geheimnis - das Kennwort ist es. */
export const TUER_BENUTZER = 'praxis';

/** Eine Route der Anwendung, die es als Datei nicht gibt (Umleitung prüfen). */
export const TIEFE_ROUTE = '/praxis/instrumente';

const PROJEKT_HOST = /^([a-z0-9]{20})\.supabase\.co$/;

/** Der Projektschlüssel aus `https://<ref>.supabase.co`, sonst null. */
export function projektRef(supabaseUrl) {
  if (!URL.canParse(supabaseUrl)) return null;
  const url = new URL(supabaseUrl);
  if (url.protocol !== 'https:') return null;
  // Nur die Projekt-URL selbst: supabase-js haengt `/auth/v1`, `/rest/v1`
  // usw. an. Mit Pfad - etwa der REST-Adresse `…/rest/v1/` aus dem
  // Dashboard - ginge die Anmeldung an `/rest/v1/auth/v1/token` und
  // scheiterte mit 404 (erster Lauf der Test-Umgebung, 2026-09-25).
  if (url.pathname !== '/' || url.search || url.hash || url.username) return null;
  return PROJEKT_HOST.exec(url.hostname)?.[1] ?? null;
}

/** Die Rolle aus einem Supabase-JWT, ohne die Signatur zu prüfen. */
function jwtRolle(schluessel) {
  const teile = schluessel.split('.');
  if (teile.length !== 3) return null;
  try {
    const nutzlast = JSON.parse(Buffer.from(teile[1], 'base64url').toString('utf8'));
    return typeof nutzlast.role === 'string' ? nutzlast.role : null;
  } catch {
    return null;
  }
}

/**
 * Prüft die Secrets der Umgebung `test`. Liefert die Liste der Fehler; leer
 * heißt: alles passt. Die Meldungen nennen nie einen Wert.
 */
export function pruefeKonfiguration({ supabaseUrl, anonKey, databaseUrl }) {
  const fehler = [];

  const ref = projektRef(supabaseUrl ?? '');
  if (!ref) {
    fehler.push(
      'TESTENV_SUPABASE_URL ist keine Projekt-URL der Form https://<ref>.supabase.co (ohne Pfad wie /rest/v1).',
    );
  }

  // ADR-015: Der service_role-Schlüssel darf nie in den Browser. Alles, was
  // in VITE_SUPABASE_ANON_KEY steht, landet im Bundle.
  const schluessel = anonKey ?? '';
  if (schluessel.startsWith('sb_secret_')) {
    fehler.push('TESTENV_SUPABASE_ANON_KEY ist ein geheimer Schlüssel (sb_secret_…).');
  } else if (schluessel.startsWith('sb_publishable_')) {
    // Der neue öffentliche Schlüssel - in Ordnung.
  } else if (jwtRolle(schluessel) !== null) {
    if (jwtRolle(schluessel) !== 'anon') {
      fehler.push('TESTENV_SUPABASE_ANON_KEY ist nicht der anon-Schlüssel.');
    }
  } else {
    fehler.push('TESTENV_SUPABASE_ANON_KEY ist weder ein anon- noch ein publishable-Schlüssel.');
  }

  if (!URL.canParse(databaseUrl ?? '')) {
    fehler.push('TESTENV_DATABASE_URL ist kein Verbindungsstring.');
  } else {
    const db = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(db.protocol)) {
      fehler.push('TESTENV_DATABASE_URL ist kein PostgreSQL-Verbindungsstring.');
    }
    // Nie gegen die lokale Wegwerf-Datenbank von `pnpm test:db`.
    if (['localhost', '127.0.0.1', '[::1]'].includes(db.hostname)) {
      fehler.push('TESTENV_DATABASE_URL zeigt auf einen lokalen Rechner.');
    }
    // Direkte Verbindung: db.<ref>.supabase.co; Pooler: Benutzer postgres.<ref>.
    const gehoertZumProjekt =
      ref !== null &&
      (db.hostname === `db.${ref}.supabase.co` ||
        decodeURIComponent(db.username) === `postgres.${ref}`);
    if (ref !== null && !gehoertZumProjekt) {
      fehler.push('TESTENV_DATABASE_URL gehört nicht zum Projekt aus TESTENV_SUPABASE_URL.');
    }
  }

  return fehler;
}

/**
 * Content-Security-Policy der Test-Umgebung.
 *
 * Skripte nur vom eigenen Ursprung; Verbindungen nur dorthin und zum
 * Supabase-Projekt. `style-src 'unsafe-inline'`, weil MapLibre und einzelne
 * Bausteine Stilattribute setzen; `blob:` für den Worker von MapLibre.
 * Kartenkacheln sind in der Test-Umgebung nicht konfiguriert - kommt ein
 * Kachelschlüssel dazu, braucht die Policy den Kachelanbieter.
 */
export function inhaltsrichtlinie(supabaseUrl) {
  const supabase = new URL(supabaseUrl).origin;
  const websocket = supabase.replace(/^https:/, 'wss:');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    `media-src 'self' blob: ${supabase}`,
    "font-src 'self'",
    `connect-src 'self' ${supabase} ${websocket}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Permissions-Policy der Test-Umgebung (ADR-017 Punkt 33).
 *
 * `camera=(self)` statt `camera=()`: Der Kameradialog nimmt Fotos für die Akte
 * auf, damit sie nicht in der Mediathek des Handys landen (DOK-006). Nur die
 * eigene Herkunft - kein eingebetteter Rahmen, kein fremder Ursprung.
 */
export const BERECHTIGUNGSRICHTLINIE = 'camera=(self), microphone=(), payment=(), usb=()';

/**
 * Die `.htaccess` der Test-Umgebung.
 *
 * ANN-101: Umleitung aller Pfade ohne Datei auf `index.html` (die Anwendung
 * hat eigene Routen), `noindex`, Sicherheitskopfzeilen und - nur wenn
 * `tuerDatei` gesetzt ist - die zweite Tür per HTTP-Basic-Auth. Die Tür
 * schützt keine Daten (das tun Supabase Auth und RLS), sie hält Suchmaschinen
 * und Zufallsbesuche fern.
 */
export function htaccess({ supabaseUrl, tuerDatei }) {
  const zeilen = [
    '# Erzeugt von scripts/testumgebung.mjs (OPS-002a, ANN-101). Nicht von Hand ändern.',
    'Options -Indexes',
    'DirectoryIndex index.html',
    '',
    'RewriteEngine On',
    'RewriteCond %{REQUEST_FILENAME} !-f',
    'RewriteCond %{REQUEST_FILENAME} !-d',
    'RewriteRule ^ index.html [L]',
    '',
    'Header always set X-Robots-Tag "noindex, nofollow"',
    'Header always set X-Content-Type-Options "nosniff"',
    'Header always set Referrer-Policy "no-referrer"',
    'Header always set X-Frame-Options "DENY"',
    // ADR-017 Punkt 33 (Fassung 2): Die Kamera nur für die eigene Herkunft -
    // der Kameradialog aus DOK-006. Mikrofon, Zahlung und USB bleiben zu; ein
    // Test prüft den ganzen Wert, damit die Kopfzeile nicht weiter aufgeht.
    `Header always set Permissions-Policy "${BERECHTIGUNGSRICHTLINIE}"`,
    'Header always set Strict-Transport-Security "max-age=31536000"',
    `Header always set Content-Security-Policy "${inhaltsrichtlinie(supabaseUrl)}"`,
    '',
    '# index.html nie aus dem Zwischenspeicher: sonst sieht das Handy nach',
    '# einer Auslieferung den alten Stand. Die Dateien unter /assets/ tragen',
    '# einen Hash im Namen und dürfen bleiben.',
    '<Files "index.html">',
    '  Header always set Cache-Control "no-cache"',
    '</Files>',
  ];

  if (tuerDatei) {
    zeilen.push(
      '',
      '# Zweite Tür (OPS-002a). Die Kennwortdatei liegt neben html/, nicht darin.',
      'AuthType Basic',
      'AuthName "Praxis Test-Umgebung"',
      `AuthUserFile "${tuerDatei}"`,
      'Require valid-user',
    );
  }

  return `${zeilen.join('\n')}\n`;
}

/** Keine Suchmaschine soll die Test-Umgebung aufnehmen. */
export function robotsTxt() {
  return 'User-agent: *\nDisallow: /\n';
}

function basicAuth(kennwort) {
  return `Basic ${Buffer.from(`${TUER_BENUTZER}:${kennwort}`).toString('base64')}`;
}

/**
 * Prüft die ausgelieferte Seite. `abrufen` ist `fetch` oder im Test ein
 * Ersatz. Liefert die Liste der Fehler; leer heißt: bestanden.
 */
export async function pruefeAuslieferung({ adresse, tuerKennwort, abrufen = fetch }) {
  const fehler = [];
  const kopf = tuerKennwort ? { authorization: basicAuth(tuerKennwort) } : {};

  for (const pfad of ['/', TIEFE_ROUTE]) {
    const antwort = await abrufen(new URL(pfad, adresse), { headers: kopf, redirect: 'manual' });
    if (antwort.status !== 200) {
      fehler.push(`${pfad}: Status ${antwort.status} statt 200.`);
      continue;
    }
    const text = await antwort.text();
    if (!text.includes('<div id="root">')) {
      fehler.push(`${pfad}: liefert nicht die Anwendung (index.html).`);
    }
    const robots = antwort.headers.get('x-robots-tag') ?? '';
    if (!robots.includes('noindex')) fehler.push(`${pfad}: Kopfzeile X-Robots-Tag fehlt.`);
    if (!antwort.headers.get('content-security-policy')) {
      fehler.push(`${pfad}: Kopfzeile Content-Security-Policy fehlt.`);
    }
    if (antwort.headers.get('x-content-type-options') !== 'nosniff') {
      fehler.push(`${pfad}: Kopfzeile X-Content-Type-Options fehlt.`);
    }
  }

  if (tuerKennwort) {
    const ohne = await abrufen(new URL('/', adresse), { redirect: 'manual' });
    if (ohne.status !== 401)
      fehler.push(`Zweite Tür: ohne Kennwort Status ${ohne.status} statt 401.`);
  }

  // Über HTTP ginge das Kennwort der Tür im Klartext: HTTP muss auf HTTPS
  // umleiten, bevor irgendetwas anderes geschieht.
  const unsicher = new URL('/', adresse);
  unsicher.protocol = 'http:';
  const http = await abrufen(unsicher, { redirect: 'manual' });
  const ziel = http.headers.get('location') ?? '';
  if (![301, 302, 307, 308].includes(http.status) || !ziel.startsWith('https://')) {
    fehler.push(`HTTP leitet nicht auf HTTPS um (Status ${http.status}).`);
  }

  return fehler;
}

async function main([befehl, argument]) {
  const env = process.env;

  if (befehl === 'konfiguration') {
    const fehler = pruefeKonfiguration({
      supabaseUrl: env.TESTENV_SUPABASE_URL,
      anonKey: env.TESTENV_SUPABASE_ANON_KEY,
      databaseUrl: env.TESTENV_DATABASE_URL,
    });
    for (const meldung of fehler) console.error(`::error::${meldung}`);
    return fehler.length === 0 ? 0 : 1;
  }

  if (befehl === 'vorbereiten' && argument) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Auslieferungsordner aus dem Workflow, fester Dateiname.
    await writeFile(
      path.join(argument, '.htaccess'),
      htaccess({ supabaseUrl: env.TESTENV_SUPABASE_URL, tuerDatei: env.TUER_DATEI || null }),
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- wie oben.
    await writeFile(path.join(argument, 'robots.txt'), robotsTxt());
    return 0;
  }

  if (befehl === 'pruefen' && argument) {
    const fehler = await pruefeAuslieferung({
      adresse: argument,
      tuerKennwort: env.TESTENV_TUER_PASSWORD || null,
    });
    for (const meldung of fehler) console.error(`::error::${meldung}`);
    if (fehler.length === 0) console.log(`Test-Umgebung erreichbar: ${argument}`);
    return fehler.length === 0 ? 0 : 1;
  }

  console.error('Aufruf: testumgebung.mjs konfiguration | vorbereiten <dist> | pruefen <adresse>');
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}

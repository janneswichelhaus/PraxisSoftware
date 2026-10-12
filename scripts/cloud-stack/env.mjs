#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Schluessel und Umgebungsdatei fuer den Cloud-Stack (scripts/cloud-stack.sh).
//
//   node scripts/cloud-stack/env.mjs secrets <secrets-datei>
//     Legt beim ersten Aufruf ein zufaelliges JWT-Secret an und leitet daraus
//     den anon- und den service_role-Schluessel ab. Die Datei ist ein
//     Shell-Fragment (KEY=wert) mit Rechten 600 unter .tmp/stack/ - sie
//     bleibt bei jedem weiteren Start unveraendert, damit eine einmal
//     geschriebene Umgebungsdatei gueltig bleibt.
//
//   node scripts/cloud-stack/env.mjs env-local <secrets-datei> <env-datei> <api-url>
//     Traegt die Verbindungswerte in die ungetrackte Umgebungsdatei ein
//     (cloud-stack.sh: .env.development.local, die nur `pnpm dev` liest, nicht
//     Vitest). Andere Zeilen bleiben stehen; ersetzt werden nur die Schluessel
//     aus MANAGED_KEYS. Der service_role-Schluessel gehoert nie hinein
//     (.env.example, ADR-015).
//
// Nichts davon ist ein Secret im Sinne von PROJECT_PRINCIPLES.md 3.3: Das
// Secret oeffnet nur diese lokale Wegwerf-Instanz mit synthetischen Daten.
// Ins Repository gehoert es trotzdem nicht - der Secret-Scan erkennt JWTs.
// -----------------------------------------------------------------------------
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { apiKeys } from './jwt.mjs';

/** Die Zeilen, die dieses Skript in der Umgebungsdatei verantwortet. */
export const MANAGED_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_APP_ENVIRONMENT',
  'E2E_SUPABASE_URL',
  'E2E_SUPABASE_ANON_KEY',
];

const MARKER = '# --- Cloud-Stack (scripts/cloud-stack.sh) - diese Zeilen schreibt der Stack ---';

/** Liest ein Shell-Fragment KEY=wert in eine Map. */
export function parseEnv(text) {
  const values = new Map();
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2].trim());
  }
  return values;
}

/** Ersetzt die verantworteten Zeilen und laesst alle anderen stehen. */
export function mergeEnvLocal(existing, values) {
  const lines = existing === '' ? [] : existing.replace(/\n+$/, '').split('\n');
  const kept = lines.filter((line) => {
    if (line === MARKER) return false;
    const key = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
    return !key || !values.has(key);
  });
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  const block = [MARKER, ...[...values].map(([key, value]) => `${key}=${value}`)];
  return [...kept, ...(kept.length > 0 ? [''] : []), ...block, ''].join('\n');
}

function ensureSecrets(file) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt aus cloud-stack.sh
  if (existsSync(file)) return;
  const secret = randomBytes(32).toString('hex');
  const keys = apiKeys(secret);
  const content = [
    '# Cloud-Stack: lokales Wegwerf-Secret, erzeugt von scripts/cloud-stack/env.mjs.',
    '# Nur fuer diese Instanz mit synthetischen Daten. Nicht weitergeben, nicht committen.',
    `STACK_JWT_SECRET=${secret}`,
    `STACK_ANON_KEY=${keys.anon}`,
    `STACK_SERVICE_ROLE_KEY=${keys.serviceRole}`,
    '',
  ].join('\n');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt aus cloud-stack.sh
  writeFileSync(file, content, { mode: 0o600 });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt aus cloud-stack.sh
  chmodSync(file, 0o600);
}

function writeEnvLocal(secretsFile, envFile, apiUrl) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt aus cloud-stack.sh
  const anonKey = parseEnv(readFileSync(secretsFile, 'utf8')).get('STACK_ANON_KEY');
  if (!anonKey) throw new Error(`STACK_ANON_KEY fehlt in ${secretsFile}`);
  const values = new Map([
    ['VITE_SUPABASE_URL', apiUrl],
    ['VITE_SUPABASE_ANON_KEY', anonKey],
    // Zeigt auf der Anmeldeseite den Kennwortweg fuer Testkonten (ADR-025 Punkt 15).
    ['VITE_APP_ENVIRONMENT', 'development'],
    ['E2E_SUPABASE_URL', apiUrl],
    ['E2E_SUPABASE_ANON_KEY', anonKey],
  ]);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt aus cloud-stack.sh
  const existing = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt aus cloud-stack.sh
  writeFileSync(envFile, mergeEnvLocal(existing, values), { mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'secrets' && args.length === 1) {
    ensureSecrets(args[0]);
  } else if (command === 'env-local' && args.length === 3) {
    writeEnvLocal(args[0], args[1], args[2]);
  } else {
    console.error(
      'Aufruf: env.mjs secrets <secrets-datei> | env-local <secrets-datei> <env-datei> <api-url>',
    );
    process.exit(2);
  }
}

#!/usr/bin/env node
// -----------------------------------------------------------------------------
// API-Gateway des Cloud-Stacks (scripts/cloud-stack.sh) - die Rolle von Kong.
//
// Ein Port (54321) fuer die Anwendung, wie bei `supabase start`:
//
//   /auth/v1/*       -> GoTrue (Anmeldedienst)
//   /rest/v1/*       -> PostgREST
//   /storage/v1/*    -> Nachbildung der Storage-API (storage.mjs)
//   /functions/v1/*  -> Edge Functions in Deno (functions.mjs), sofern gestartet
//   /graphql/v1, /realtime/v1 -> 501 mit Meldung (gibt es im Stack nicht)
//
// Wie Kong im Stack der Supabase-CLI 2.116.0: CORS fuer jede Route, und
// fehlt der Kopf `Authorization`, setzt das Gateway ihn aus `apikey` (die
// CLI prueft den apikey selbst nicht - die Dienste pruefen das Token). Fuer
// jede Edge Function mit `verify_jwt = true` in supabase/config.toml prueft
// es wie die Edge Runtime die Sitzung. Nur node:http und das schon vorhandene
// `pg`, keine neue Abhaengigkeit.
//
// Protokolliert wird nur, was schiefging - ohne Pfad, Abfrage oder Inhalt
// einer Anfrage (ADR-011).
// -----------------------------------------------------------------------------
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { verifyJwt } from './jwt.mjs';
import { parseEnv } from './env.mjs';
import { createStorage } from './storage.mjs';

const ENVIRONMENT = new Map(Object.entries(process.env));

function required(name) {
  const value = ENVIRONMENT.get(name);
  if (!value) {
    console.error(`Gateway: Umgebungsvariable ${name} fehlt.`);
    process.exit(2);
  }
  return value;
}

/**
 * Die zwei Angaben aus supabase/config.toml, die das Gateway braucht: die
 * Groessengrenze der Storage-API und `verify_jwt` je Edge Function. Kein
 * vollstaendiger TOML-Leser - Abschnitte und `schluessel = wert` genuegen.
 */
export function readConfigToml(text) {
  const verifyJwtByFunction = new Map();
  let fileSizeLimit = 50 * 1024 * 1024;
  let section = '';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = header[1].trim();
      continue;
    }
    const entry = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!entry) continue;
    const [, key, value] = entry;
    if (section.startsWith('functions.') && key === 'verify_jwt') {
      verifyJwtByFunction.set(section.slice('functions.'.length), value.trim() !== 'false');
    }
    if (section === 'storage' && key === 'file_size_limit') {
      const size = /^"?(\d+)\s*(KiB|MiB|GiB|KB|MB|GB)?"?$/.exec(value.trim());
      if (size) {
        const factors = new Map([
          ['KiB', 1024],
          ['MiB', 1024 ** 2],
          ['GiB', 1024 ** 3],
          ['KB', 1000],
          ['MB', 1000 ** 2],
          ['GB', 1000 ** 3],
        ]);
        fileSizeLimit = Number(size[1]) * (factors.get(size[2]) ?? 1);
      }
    }
  }
  return { verifyJwtByFunction, fileSizeLimit };
}

const ALLOWED_METHODS = 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS';
const EXPOSED_HEADERS = [
  'Content-Range',
  'Content-Location',
  'Content-Type',
  'Content-Disposition',
  'Content-Length',
  'Location',
  'Range-Unit',
  'Preference-Applied',
  'ETag',
  'X-Supabase-Api-Version',
].join(', ');
const DEFAULT_ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, ' +
  'content-profile, x-upsert, cache-control, x-metadata, x-supabase-api-version';

function corsHeaders(request) {
  return {
    'access-control-allow-origin': request.headers.origin ?? '*',
    'access-control-expose-headers': EXPOSED_HEADERS,
    vary: 'Origin',
  };
}

function sendJson(request, response, status, payload) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(status, {
    ...corsHeaders(request),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function withoutUpstreamCors(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!key.startsWith('access-control-') && key !== 'vary') {
      // eslint-disable-next-line security/detect-object-injection -- Schluessel aus der Antwort des eigenen Dienstes
      result[key] = value;
    }
  }
  return result;
}

function bearerToken(request) {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

function apiKeyOf(request, url) {
  const header = request.headers.apikey;
  if (typeof header === 'string' && header !== '') return header;
  return url.searchParams.get('apikey');
}

/**
 * Leitet die Anfrage an einen Dienst weiter und reicht die Antwort durch. Wie
 * Kongs request-transformer in der CLI: ohne `Authorization` traegt die
 * Anfrage danach den `apikey` als Bearer-Token.
 */
function forward(request, response, upstream, upstreamPath, serviceName, apiKey) {
  const target = new URL(upstreamPath, upstream);
  const headers = { ...request.headers, host: target.host };
  if (!headers.authorization && apiKey) headers.authorization = `Bearer ${apiKey}`;
  headers['x-forwarded-for'] = request.socket.remoteAddress ?? '127.0.0.1';
  headers['x-forwarded-host'] = request.headers.host ?? '';
  headers['x-forwarded-proto'] = 'http';
  const outgoing = http.request(target, { method: request.method, headers }, (incoming) => {
    response.writeHead(incoming.statusCode ?? 502, {
      ...withoutUpstreamCors(incoming.headers),
      ...corsHeaders(request),
    });
    incoming.pipe(response);
  });
  outgoing.on('error', (cause) => {
    console.error(`Gateway: ${serviceName} nicht erreichbar (${cause.code ?? cause.message}).`);
    sendJson(request, response, 502, {
      code: 502,
      message: `Cloud-Stack: ${serviceName} antwortet nicht. Laeuft der Stack? (./scripts/cloud-stack.sh status)`,
    });
  });
  request.pipe(outgoing);
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('payload too large');
      error.code = 'PAYLOAD_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function main() {
  const port = Number(ENVIRONMENT.get('STACK_API_PORT') ?? 54321);
  const authUpstream = `http://127.0.0.1:${required('STACK_AUTH_PORT')}`;
  const restUpstream = `http://127.0.0.1:${required('STACK_REST_PORT')}`;
  const functionsUpstream = `http://127.0.0.1:${required('STACK_FUNCTIONS_PORT')}`;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad setzt cloud-stack.sh
  const secrets = parseEnv(readFileSync(required('STACK_SECRETS_FILE'), 'utf8'));
  const jwtSecret = secrets.get('STACK_JWT_SECRET');
  if (!jwtSecret) {
    console.error('Gateway: Schluesseldatei unvollstaendig.');
    process.exit(2);
  }
  const { verifyJwtByFunction, fileSizeLimit } = readConfigToml(
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad setzt cloud-stack.sh
    readFileSync(required('STACK_CONFIG_TOML'), 'utf8'),
  );
  const storage = createStorage({
    databaseUrl: required('STACK_DB_URL'),
    storageDir: required('STACK_STORAGE_DIR'),
    jwtSecret,
    globalFileSizeLimit: fileSizeLimit,
  });

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://gateway.invalid');
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      response.writeHead(200, {
        ...corsHeaders(request),
        'access-control-allow-methods': ALLOWED_METHODS,
        'access-control-allow-headers':
          request.headers['access-control-request-headers'] ?? DEFAULT_ALLOWED_HEADERS,
        'access-control-max-age': '3600',
        'content-length': '0',
      });
      response.end();
      return;
    }

    if (pathname === '/cloud-stack/health') {
      sendJson(request, response, 200, { gateway: 'ok' });
      return;
    }

    const route = /^\/(auth|rest|storage|functions|graphql|realtime)\/v1(?=\/|$)/.exec(pathname);
    if (!route) {
      sendJson(request, response, 404, { message: 'no Route matched with those values' });
      return;
    }
    const service = route[1];
    const rest = pathname.slice(route[0].length) || '/';
    const upstreamPath = rest + url.search;

    if (service === 'auth') {
      forward(request, response, authUpstream, upstreamPath, 'GoTrue', apiKeyOf(request, url));
      return;
    }
    if (service === 'rest') {
      forward(request, response, restUpstream, upstreamPath, 'PostgREST', apiKeyOf(request, url));
      return;
    }

    if (service === 'functions') {
      const name = rest.split('/')[1] ?? '';
      // Wie die Edge Runtime: ohne Eintrag in config.toml gilt verify_jwt = true.
      if (verifyJwtByFunction.get(name) !== false) {
        const token = bearerToken(request);
        if (!token) {
          sendJson(request, response, 401, { code: 401, message: 'Missing authorization header' });
          return;
        }
        if (!verifyJwt(token, jwtSecret)) {
          sendJson(request, response, 401, { code: 401, message: 'Invalid JWT' });
          return;
        }
      }
      forward(request, response, functionsUpstream, upstreamPath, 'Edge Functions (Deno)', null);
      return;
    }

    if (service === 'storage') {
      void (async () => {
        const token = bearerToken(request) ?? apiKeyOf(request, url);
        let claims = { role: 'anon' };
        if (token) {
          const payload = verifyJwt(token, jwtSecret);
          if (!payload) {
            sendJson(request, response, 400, {
              statusCode: '403',
              error: 'Unauthorized',
              message: 'invalid signature',
            });
            return;
          }
          claims = payload;
        }
        let body;
        try {
          body = await readBody(request, fileSizeLimit + 1024 * 1024);
        } catch (cause) {
          sendJson(request, response, cause.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, {
            statusCode: '413',
            error: 'Payload too large',
            message: 'The object exceeded the maximum allowed size',
          });
          return;
        }
        for (const [key, value] of Object.entries(corsHeaders(request))) {
          response.setHeader(key, value);
        }
        await storage.handle(request, response, new URL(rest + url.search, url), claims, body);
      })().catch((cause) => {
        console.error(
          `Gateway: Storage-Nachbildung fehlgeschlagen (${cause?.code ?? 'unbekannt'}).`,
        );
        sendJson(request, response, 500, {
          statusCode: '500',
          error: 'internal',
          message: 'Gateway',
        });
      });
      return;
    }

    sendJson(request, response, 501, {
      message: `Cloud-Stack: /${service}/v1 gibt es in diesem Stack nicht (nur Auth, REST, Storage-Nachbildung und Edge Functions).`,
    });
  });

  server.listen(port, '127.0.0.1');
  const stop = () => {
    server.close();
    void storage.close();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

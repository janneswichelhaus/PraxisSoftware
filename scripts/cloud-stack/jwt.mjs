// -----------------------------------------------------------------------------
// HS256-JWT fuer den Cloud-Stack (scripts/cloud-stack.sh) - nur node:crypto.
//
// Der Stack erzeugt sein JWT-Secret bei der ersten Einrichtung zufaellig und
// legt es unter .tmp/stack/ ab; es verlaesst den Rechner nie und steht in
// keiner versionierten Datei. Daraus entstehen der anon- und der
// service_role-Schluessel, mit demselben Secret pruefen GoTrue, PostgREST und
// das Gateway die Tokens.
// -----------------------------------------------------------------------------
import { createHmac, timingSafeEqual } from 'node:crypto';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

/** Signiert die Nutzlast mit HS256. */
export function signJwt(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Prueft Signatur und Ablauf. Liefert die Nutzlast oder null - nie eine
 * Ausnahme, damit kein Aufrufer eine abgelaufene Signatur aus Versehen
 * durchlaesst.
 */
export function verifyJwt(token, secret, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  let parsedHeader;
  let payload;
  try {
    parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (parsedHeader?.alg !== 'HS256') return null;
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (payload === null || typeof payload !== 'object') return null;
  if (typeof payload.exp === 'number' && payload.exp <= now) return null;
  return payload;
}

/** Der anon- und der service_role-Schluessel des Stacks, zehn Jahre gueltig. */
export function apiKeys(secret, now = Math.floor(Date.now() / 1000)) {
  const exp = now + 10 * 365 * 24 * 3600;
  return {
    anon: signJwt({ iss: 'supabase-cloud-stack', role: 'anon', iat: now, exp }, secret),
    serviceRole: signJwt(
      { iss: 'supabase-cloud-stack', role: 'service_role', iat: now, exp },
      secret,
    ),
  };
}

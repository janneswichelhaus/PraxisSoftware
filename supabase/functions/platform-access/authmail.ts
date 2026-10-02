/**
 * Mail-Hook des Anmeldedienstes (ABN-012, BEF-118, ANN-218).
 *
 * Ist der Hook eingeschaltet, verschickt der Anmeldedienst seine Mails nicht
 * mehr selbst, sondern ruft diese Function: mit dem Konto, der Art der Mail
 * und dem Einmal-Code. Bevor etwas hinausgeht, fragt sie die Datenbank
 * (`public.auth_email_allowed`). Einem Plattformkonto ohne per Link
 * bestätigtes Postfach geht kein Wiederherstellungslink zu — die Sperre sitzt
 * damit im Anmeldedienst und nicht in der Oberfläche. Abgewiesen wird
 * **stumm**: Der Anmeldedienst meldet dem Aufrufer Erfolg, wie bei einer
 * unbekannten Adresse; sonst verriete die Antwort, ob es ein Plattformkonto
 * ist.
 *
 * Der Aufruf ist nach dem Standard „Standard Webhooks“ signiert
 * (`webhook-id`, `webhook-timestamp`, `webhook-signature`); das Geheimnis
 * setzt der Betrieb (`SEND_EMAIL_HOOK_SECRET`). Eingeschaltet wird der Hook
 * mit dem Versanddienst aus B13 in OPS-001 — bis dahin verschickt der
 * Anmeldedienst selbst, und Mails an Patient:innen erreichen ohnehin niemanden
 * (BEF-026).
 */

import type { Nachricht } from './versand.ts';

/** Die Mails, die der Anmeldedienst in dieser Anwendung verschickt. */
export type AuthMailArt = 'recovery' | 'magiclink';

export interface AuthMail {
  readonly kontoId: string;
  readonly an: string;
  readonly art: AuthMailArt;
  readonly tokenHash: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fünf Minuten, wie der Standard empfiehlt: ältere Aufrufe sind Wiederholungen. */
const TOLERANZ_SEKUNDEN = 300;

function base64ZuBytes(text: string): Uint8Array<ArrayBuffer> {
  const roh = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(roh.length));
  for (let i = 0; i < roh.length; i += 1) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

function bytesZuBase64(bytes: Uint8Array): string {
  let roh = '';
  for (const b of bytes) roh += String.fromCharCode(b);
  return btoa(roh);
}

function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i += 1) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

/**
 * Prüft die Signatur nach „Standard Webhooks“: HMAC-SHA256 über
 * `id.zeitstempel.körper` mit dem Geheimnis `v1,whsec_…` (Base64).
 */
export async function pruefeSignatur(
  geheimnis: string,
  kopf: Headers,
  koerper: string,
  jetztSekunden: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const id = kopf.get('webhook-id');
  const zeit = kopf.get('webhook-timestamp');
  const signaturen = kopf.get('webhook-signature');
  if (id === null || zeit === null || signaturen === null) return false;
  if (!/^\d+$/.test(zeit) || Math.abs(jetztSekunden - Number(zeit)) > TOLERANZ_SEKUNDEN) {
    return false;
  }
  const schluesselText = geheimnis.replace(/^v1,/, '').replace(/^whsec_/, '');
  let schluessel: Uint8Array<ArrayBuffer>;
  try {
    schluessel = base64ZuBytes(schluesselText);
  } catch {
    return false;
  }
  if (schluessel.length === 0) return false;
  const krypto = await crypto.subtle.importKey(
    'raw',
    schluessel,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const erwartet = bytesZuBase64(
    new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        krypto,
        new TextEncoder().encode(`${id}.${zeit}.${koerper}`),
      ),
    ),
  );
  return signaturen
    .split(' ')
    .map((teil) => teil.replace(/^v1,/, ''))
    .some((signatur) => gleich(signatur, erwartet));
}

/** Liest den Aufruf des Anmeldedienstes; `null`, wenn er nicht passt. */
export function liesAuthMail(koerper: string): AuthMail | null {
  let daten: unknown;
  try {
    daten = JSON.parse(koerper);
  } catch {
    return null;
  }
  if (typeof daten !== 'object' || daten === null) return null;
  const d = daten as Record<string, unknown>;
  const konto = d['user'] as Record<string, unknown> | undefined;
  const mail = d['email_data'] as Record<string, unknown> | undefined;
  const kontoId = konto?.['id'];
  const an = konto?.['email'];
  const art = mail?.['email_action_type'];
  const tokenHash = mail?.['token_hash'];
  if (typeof kontoId !== 'string' || !UUID.test(kontoId)) return null;
  if (typeof an !== 'string' || an.length === 0) return null;
  if (art !== 'recovery' && art !== 'magiclink') return null;
  if (typeof tokenHash !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(tokenHash)) return null;
  return { kontoId, an, art, tokenHash };
}

/**
 * Der Inhalt — dieselben Ziele wie die Vorlagen in `supabase/templates/`:
 * Der Code steht im Fragment und geht an keinen Server (ANN-043).
 */
export function authMailInhalt(mail: AuthMail, appUrl: string): Omit<Nachricht, 'an'> {
  const basis = appUrl.trim().replace(/\/+$/, '');
  if (mail.art === 'recovery') {
    return {
      betreff: 'Neues Kennwort setzen',
      text: [
        'Guten Tag,',
        '',
        'für Ihren Zugang wurde ein neues Kennwort angefordert. Öffnen Sie diesen Link:',
        '',
        `${basis}/kennwort-neu#token_hash=${mail.tokenHash}&type=recovery`,
        '',
        'Der Link gilt eine Stunde und nur einmal. Wenn Sie nichts angefordert haben, können Sie diese Mail löschen.',
      ].join('\n'),
    };
  }
  return {
    betreff: 'Zugang zur Praxisanwendung',
    text: [
      'Guten Tag,',
      '',
      'öffnen Sie diesen Link, um sich anzumelden:',
      '',
      `${basis}/zugang#token_hash=${mail.tokenHash}&type=magiclink`,
      '',
      'Der Link gilt eine Stunde und nur einmal.',
    ].join('\n'),
  };
}

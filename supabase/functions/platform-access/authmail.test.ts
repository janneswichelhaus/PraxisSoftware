import { describe, expect, it, vi } from 'vitest';
import type { Anmeldedienst } from './anmeldedienst.ts';
import { authMailInhalt, liesAuthMail, pruefeSignatur } from './authmail.ts';
import { erstelleHandler } from './handler.ts';
import type { Ergebnis } from './typen.ts';
import type { Versandweg } from './versand.ts';

/**
 * Mail-Hook des Anmeldedienstes (ABN-012, BEF-118): Einem Plattformkonto ohne
 * per Link bestätigtes Postfach geht kein Wiederherstellungslink zu — die
 * Sperre sitzt im Anmeldedienst, nicht in der Oberfläche. Signatur nach
 * „Standard Webhooks“.
 */

const SCHLUESSEL = btoa('ein-geheimnis-nur-fuer-den-test');
const GEHEIMNIS = `v1,whsec_${SCHLUESSEL}`;
const KONTO = '99999999-9999-4999-8999-000000000001';

const AUFRUF = {
  user: { id: KONTO, email: 'erika@patient.invalid' },
  email_data: {
    email_action_type: 'recovery',
    token_hash: 'pkce_abcdef0123456789',
    site_url: 'https://app.invalid',
  },
};

async function signiert(koerper: string, zeit = Math.floor(Date.now() / 1000), id = 'msg_1') {
  const schluessel = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(SCHLUESSEL), (z) => z.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const roh = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      schluessel,
      new TextEncoder().encode(`${id}.${zeit}.${koerper}`),
    ),
  );
  const signatur = btoa(String.fromCharCode(...roh));
  return new Headers({
    'webhook-id': id,
    'webhook-timestamp': String(zeit),
    'webhook-signature': `v1,${signatur}`,
    'Content-Type': 'application/json',
  });
}

function dienst(erlaubt: boolean): Anmeldedienst {
  const ok = <T>(value: T): Promise<Ergebnis<T>> => Promise.resolve({ ok: true, value });
  return {
    nachschlagen: vi.fn(() => ok(null)),
    einloesen: vi.fn(() => ok('')),
    fehlversuch: vi.fn(() => ok(null)),
    kontoAnlegen: vi.fn(() => ok('')),
    kennwortPruefen: vi.fn(() => ok<string | null>(null)),
    kennwortSetzen: vi.fn(() => ok(null)),
    kontoEntfernen: vi.fn(() => ok(null)),
    loeschauftraege: vi.fn(() => ok<string[]>([])),
    loeschungBestaetigen: vi.fn(() => ok(null)),
    authMailErlaubt: vi.fn(() => ok(erlaubt)),
    istDienstaufruf: vi.fn(() => false),
    einladungsmail: vi.fn(() => ok({ email: '', organizationName: '', expiresAt: '' })),
  };
}

function versand(): Versandweg & { sende: ReturnType<typeof vi.fn> } {
  return { id: 'mock', sende: vi.fn(() => Promise.resolve({ ok: true as const, value: null })) };
}

async function rufe(
  handler: (anfrage: Request) => Promise<Response>,
  koerper: unknown,
  kopf?: Headers,
): Promise<Response> {
  const text = JSON.stringify(koerper);
  return handler(
    new Request('https://beispiel.invalid/platform-access', {
      method: 'POST',
      headers: kopf ?? (await signiert(text)),
      body: text,
    }),
  );
}

describe('Mail-Hook: Signatur', () => {
  it('nimmt eine gültige Signatur an und weist eine veränderte oder alte ab', async () => {
    const text = JSON.stringify(AUFRUF);
    expect(await pruefeSignatur(GEHEIMNIS, await signiert(text), text)).toBe(true);
    expect(await pruefeSignatur(GEHEIMNIS, await signiert(text), `${text} `)).toBe(false);
    const alt = Math.floor(Date.now() / 1000) - 3600;
    expect(await pruefeSignatur(GEHEIMNIS, await signiert(text, alt), text)).toBe(false);
    expect(await pruefeSignatur(`v1,whsec_${btoa('anderes')}`, await signiert(text), text)).toBe(
      false,
    );
  });
});

describe('Mail-Hook: verschicken oder stumm verwerfen (ABN-012)', () => {
  it('verwirft den Wiederherstellungslink eines Plattformkontos ohne bestätigtes Postfach stumm', async () => {
    const d = dienst(false);
    const v = versand();
    const handler = erstelleHandler({
      anmeldedienst: d,
      versand: v,
      appUrl: 'https://app.invalid',
      hookGeheimnis: GEHEIMNIS,
    });
    const antwort = await rufe(handler, AUFRUF);
    // Erfolg für den Anmeldedienst - wie bei einer unbekannten Adresse.
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({});
    expect(d.authMailErlaubt).toHaveBeenCalledWith(KONTO, 'recovery');
    expect(v.sende).not.toHaveBeenCalled();
  });

  it('verschickt eine erlaubte Mail mit dem Code im Fragment', async () => {
    const v = versand();
    const handler = erstelleHandler({
      anmeldedienst: dienst(true),
      versand: v,
      appUrl: 'https://app.invalid/',
      hookGeheimnis: GEHEIMNIS,
    });
    const antwort = await rufe(handler, AUFRUF);
    expect(antwort.status).toBe(200);
    expect(v.sende).toHaveBeenCalledTimes(1);
    const nachricht = v.sende.mock.calls[0]![0] as { an: string; text: string };
    expect(nachricht.an).toBe('erika@patient.invalid');
    expect(nachricht.text).toContain(
      'https://app.invalid/kennwort-neu#token_hash=pkce_abcdef0123456789&type=recovery',
    );
  });

  it('verschickt einen wiederholten Aufruf derselben Nachricht nicht ein zweites Mal', async () => {
    const v = versand();
    const handler = erstelleHandler({
      anmeldedienst: dienst(true),
      versand: v,
      appUrl: 'https://app.invalid',
      hookGeheimnis: GEHEIMNIS,
    });
    const text = JSON.stringify(AUFRUF);
    const kopf = await signiert(text);
    expect((await rufe(handler, AUFRUF, kopf)).status).toBe(200);
    expect((await rufe(handler, AUFRUF, kopf)).status).toBe(200);
    expect(v.sende).toHaveBeenCalledTimes(1);
  });

  it('weist einen unsignierten oder falsch signierten Aufruf ab und fragt nichts', async () => {
    const d = dienst(true);
    const handler = erstelleHandler({
      anmeldedienst: d,
      versand: versand(),
      appUrl: 'https://app.invalid',
      hookGeheimnis: GEHEIMNIS,
    });
    const falsch = new Headers({
      'webhook-id': 'msg_1',
      'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
      'webhook-signature': 'v1,AAAA',
    });
    expect((await rufe(handler, AUFRUF, falsch)).status).toBe(401);
    expect(d.authMailErlaubt).not.toHaveBeenCalled();
  });

  it('ist ohne Geheimnis nicht eingerichtet', async () => {
    const handler = erstelleHandler({
      anmeldedienst: dienst(true),
      versand: versand(),
      appUrl: 'https://app.invalid',
    });
    expect((await rufe(handler, AUFRUF)).status).toBe(503);
  });

  it('kennt nur Wiederherstellung und Anmeldelink', () => {
    expect(liesAuthMail(JSON.stringify(AUFRUF))?.art).toBe('recovery');
    expect(
      liesAuthMail(
        JSON.stringify({
          ...AUFRUF,
          email_data: { ...AUFRUF.email_data, email_action_type: 'signup' },
        }),
      ),
    ).toBeNull();
    expect(
      authMailInhalt(
        { kontoId: KONTO, an: 'x@praxis.invalid', art: 'magiclink', tokenHash: 'abcdef012345' },
        'https://app.invalid',
      ).text,
    ).toContain('https://app.invalid/zugang#token_hash=abcdef012345&type=magiclink');
  });
});

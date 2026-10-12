import { describe, expect, it, vi } from 'vitest';
import {
  ausBase64url,
  base64url,
  privaterSchluessel,
  sendePush,
  vapidKopf,
  verschluessele,
  type VapidSchluessel,
} from './webpush.ts';

/**
 * Web-Push (KOM-010): Verschlüsselung gegen den Testvektor aus RFC 8291
 * Anhang A, VAPID gegen eine eigene Prüfung der Signatur, und das Senden mit
 * seinen drei Ausgängen.
 */

// RFC 8291, Appendix A.
const RFC = {
  klartext: 'When I grow up, I want to be a watermelon',
  geraetOeffentlich:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  geraetPrivat: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  absenderOeffentlich:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  absenderPrivat: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salz: 'DGv6ra1nlYgDCS1FRnbzlw',
  koerper:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

async function neuesPaar(zweck: 'ECDH' | 'ECDSA') {
  const algo = { name: zweck, namedCurve: 'P-256' };
  const paar = (await crypto.subtle.generateKey(
    algo,
    true,
    zweck === 'ECDH' ? ['deriveBits'] : ['sign', 'verify'],
  )) as CryptoKeyPair;
  const roh = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', paar.privateKey);
  return { paar, oeffentlich: base64url(roh), privat: jwk.d! };
}

/** Entschlüsselt wie ein Browser (RFC 8291 auf der Seite des Geräts). */
async function entschluessele(
  koerper: Uint8Array,
  geraetOeffentlich: string,
  geraetPrivat: string,
  auth: string,
): Promise<string> {
  const salz = koerper.slice(0, 16);
  const laenge = koerper[20]!;
  const absender = koerper.slice(21, 21 + laenge);
  const geheim = koerper.slice(21 + laenge);
  const geraet = ausBase64url(geraetOeffentlich);
  const privat = await privaterSchluessel(geraet, ausBase64url(geraetPrivat), 'ECDH');
  const absenderSchluessel = await crypto.subtle.importKey(
    'raw',
    absender,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const gemeinsam = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: absenderSchluessel }, privat, 256),
  );
  const hk = async (
    s: Uint8Array<ArrayBuffer>,
    m: Uint8Array<ArrayBuffer>,
    i: Uint8Array<ArrayBuffer>,
    n: number,
  ) =>
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: s, info: i },
        await crypto.subtle.importKey('raw', m, 'HKDF', false, ['deriveBits']),
        n * 8,
      ),
    );
  const enc = new TextEncoder();
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...geraet, ...absender]);
  const ikm = await hk(ausBase64url(auth), gemeinsam, info, 32);
  const cek = await hk(salz, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hk(salz, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const klar = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, geheim),
  );
  expect(klar[klar.length - 1]).toBe(2);
  return new TextDecoder().decode(klar.slice(0, -1));
}

describe('Verschlüsselung (RFC 8291)', () => {
  it('ergibt Byte für Byte den Testvektor aus Anhang A', async () => {
    const oeffentlich = ausBase64url(RFC.absenderOeffentlich);
    const koerper = await verschluessele(
      { p256dh: RFC.geraetOeffentlich, auth: RFC.auth },
      new TextEncoder().encode(RFC.klartext),
      {
        salz: ausBase64url(RFC.salz),
        absender: {
          oeffentlich,
          privat: await privaterSchluessel(oeffentlich, ausBase64url(RFC.absenderPrivat), 'ECDH'),
        },
      },
    );
    expect(base64url(koerper)).toBe(RFC.koerper);
  });

  it('entschlüsselt das Gerät mit seinem Schlüssel, und jede Nachricht ist anders', async () => {
    const geraet = await neuesPaar('ECDH');
    const auth = base64url(crypto.getRandomValues(new Uint8Array(16)));
    const inhalt = new TextEncoder().encode('{"k":"plan_assigned"}');
    const eins = await verschluessele({ p256dh: geraet.oeffentlich, auth }, inhalt);
    const zwei = await verschluessele({ p256dh: geraet.oeffentlich, auth }, inhalt);
    expect(base64url(eins)).not.toBe(base64url(zwei));
    expect(await entschluessele(eins, geraet.oeffentlich, geraet.privat, auth)).toBe(
      '{"k":"plan_assigned"}',
    );
  });

  it('weist eine kaputte Registrierung ab', async () => {
    await expect(
      verschluessele({ p256dh: 'AAAA', auth: RFC.auth }, new Uint8Array(1)),
    ).rejects.toThrow();
  });
});

describe('VAPID (RFC 8292)', () => {
  it('signiert für die Herkunft des Endpunkts, prüfbar mit dem öffentlichen Schlüssel', async () => {
    const vapid = await neuesPaar('ECDSA');
    const schluessel: VapidSchluessel = {
      oeffentlich: vapid.oeffentlich,
      privat: vapid.privat,
      kontakt: 'mailto:praxis@praxis.invalid',
    };
    const jetzt = Date.UTC(2026, 9, 12, 10, 0, 0);
    const kopf = await vapidKopf('https://push.example.invalid/x/y?z=1', schluessel, jetzt);
    const treffer = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(kopf);
    expect(treffer).not.toBeNull();
    const [, h, p, s, k] = treffer!;
    expect(k).toBe(vapid.oeffentlich);
    expect(JSON.parse(new TextDecoder().decode(ausBase64url(p!)))).toEqual({
      aud: 'https://push.example.invalid',
      exp: jetzt / 1000 + 12 * 3600,
      sub: 'mailto:praxis@praxis.invalid',
    });
    const gueltig = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      vapid.paar.publicKey,
      ausBase64url(s!),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(gueltig).toBe(true);
  });
});

describe('sendePush', () => {
  const schluessel = async (): Promise<VapidSchluessel> => {
    const v = await neuesPaar('ECDSA');
    return { oeffentlich: v.oeffentlich, privat: v.privat, kontakt: 'mailto:a@b.invalid' };
  };
  const ziel = async () => {
    const g = await neuesPaar('ECDH');
    return {
      endpoint: 'https://push.example.invalid/geraet',
      p256dh: g.oeffentlich,
      auth: base64url(crypto.getRandomValues(new Uint8Array(16))),
    };
  };

  it('sendet verschlüsselt mit 24 Stunden Gültigkeit', async () => {
    const abrufen = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await sendePush(await ziel(), new Uint8Array([1]), await schluessel(), abrufen)).toBe(
      'sent',
    );
    const [, init] = abrufen.mock.calls[0] as unknown as [string, RequestInit];
    const kopf = init.headers as Record<string, string>;
    expect(kopf['TTL']).toBe('86400');
    expect(kopf['Content-Encoding']).toBe('aes128gcm');
    expect(kopf['Authorization']).toMatch(/^vapid t=/);
  });

  it('meldet 404 und 410 als nicht mehr vorhanden, anderes als Fehlschlag', async () => {
    const s = await schluessel();
    for (const [status, erwartet] of [
      [404, 'gone'],
      [410, 'gone'],
      [429, 'failed'],
      [500, 'failed'],
    ] as const) {
      const abrufen = vi.fn(async () => new Response(null, { status }));
      expect(await sendePush(await ziel(), new Uint8Array([1]), s, abrufen), String(status)).toBe(
        erwartet,
      );
    }
    const kaputt = vi.fn(async () => {
      throw new Error('netz');
    });
    expect(await sendePush(await ziel(), new Uint8Array([1]), s, kaputt)).toBe('failed');
  });

  it('schickt nie an einen Endpunkt ohne https', async () => {
    const abrufen = vi.fn(async () => new Response(null, { status: 201 }));
    const z = { ...(await ziel()), endpoint: 'http://push.example.invalid/x' };
    expect(await sendePush(z, new Uint8Array([1]), await schluessel(), abrufen)).toBe('gone');
    expect(abrufen).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fachAendern, speicherImSpeicher, speicherSetzen } from '@/lib/geraeteablage';
import {
  derZuRoh,
  freigebenOhneNetz,
  offlineschluesselAus,
  pruefeZusicherung,
  zuBase64url,
  type Offlineschluessel,
  type Zusicherung,
} from './freigabeOhneNetz';
import { PasskeyFehler } from './passkey';

/**
 * Die Prüfung der Freigabe ohne Netz (TRK-009, ADR-025 Punkt 16, ANN-359)
 * mit echten Schlüsseln aus Web Crypto: Nur unser Passkey, unsere
 * Herausforderung, unser Ursprung, die Person geprüft (UV), und die Signatur
 * stimmt. Alles andere heißt nein.
 */

const ORIGIN = 'https://app.example.test';
const RP_ID = 'app.example.test';
const KENNUNG = new Uint8Array(Array.from({ length: 16 }, (_, i) => i + 1));

function base64(bytes: ArrayBuffer): string {
  let t = '';
  for (const b of new Uint8Array(bytes)) t += String.fromCharCode(b);
  return btoa(t);
}

/** r ‖ s (Web Crypto) als DER, wie Authenticatoren ECDSA liefern. */
function rohZuDer(roh: Uint8Array): Uint8Array {
  const teil = (x: Uint8Array) => {
    let i = 0;
    while (i < x.length - 1 && x[i] === 0) i += 1;
    let v = x.subarray(i);
    if (v[0]! & 0x80) v = Uint8Array.from([0, ...v]);
    return [0x02, v.length, ...v];
  };
  const inhalt = [...teil(roh.subarray(0, 32)), ...teil(roh.subarray(32))];
  return Uint8Array.from([0x30, inhalt.length, ...inhalt]);
}

async function authDaten(rpId: string, flags: number): Promise<Uint8Array> {
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)),
  );
  return Uint8Array.from([...hash, flags, 0, 0, 0, 7]);
}

interface Geraet {
  schluessel: Offlineschluessel;
  unterschreiben: (
    challenge: Uint8Array,
    abweichend?: { origin?: string; rpId?: string; flags?: number; type?: string },
  ) => Promise<Zusicherung>;
}

async function geraetMitEs256(): Promise<Geraet> {
  const paar = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const spki = await crypto.subtle.exportKey('spki', paar.publicKey);
  return {
    schluessel: { webauthn_id: zuBase64url(KENNUNG), public_key: base64(spki), public_key_alg: -7 },
    unterschreiben: async (challenge, a = {}) => {
      const client = new TextEncoder().encode(
        JSON.stringify({
          type: a.type ?? 'webauthn.get',
          challenge: zuBase64url(challenge),
          origin: a.origin ?? ORIGIN,
          crossOrigin: false,
        }),
      );
      const auth = await authDaten(a.rpId ?? RP_ID, a.flags ?? 0x05);
      const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', client));
      const signiert = Uint8Array.from([...auth, ...clientHash]);
      const roh = new Uint8Array(
        await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, paar.privateKey, signiert),
      );
      return {
        rawId: kopie(KENNUNG),
        clientDataJSON: kopie(client),
        authenticatorData: kopie(auth),
        signature: kopie(rohZuDer(roh)),
      };
    },
  };
}

function kopie(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

const ERWARTET = (challenge: Uint8Array) => ({ challenge, origin: ORIGIN, rpId: RP_ID });

describe('Prüfung der Zusicherung (ES256)', () => {
  it('nimmt eine echte Zusicherung an', async () => {
    const g = await geraetMitEs256();
    const c = crypto.getRandomValues(new Uint8Array(32));
    expect(await pruefeZusicherung(g.schluessel, await g.unterschreiben(c), ERWARTET(c))).toBe(
      true,
    );
  });

  it('weist ab: andere Herausforderung, anderer Ursprung, andere Relying Party, Erstellung statt Abruf', async () => {
    const g = await geraetMitEs256();
    const c = crypto.getRandomValues(new Uint8Array(32));
    const andere = crypto.getRandomValues(new Uint8Array(32));
    expect(await pruefeZusicherung(g.schluessel, await g.unterschreiben(andere), ERWARTET(c))).toBe(
      false,
    );
    for (const abweichend of [
      { origin: 'https://fremd.example.test' },
      { rpId: 'fremd.example.test' },
      { type: 'webauthn.create' },
    ]) {
      expect(
        await pruefeZusicherung(g.schluessel, await g.unterschreiben(c, abweichend), ERWARTET(c)),
      ).toBe(false);
    }
  });

  it('weist ab, wenn die Person nicht geprüft wurde (UV fehlt) oder nicht anwesend war', async () => {
    const g = await geraetMitEs256();
    const c = crypto.getRandomValues(new Uint8Array(32));
    for (const flags of [0x01, 0x04, 0x00]) {
      expect(
        await pruefeZusicherung(g.schluessel, await g.unterschreiben(c, { flags }), ERWARTET(c)),
      ).toBe(false);
    }
  });

  it('weist eine veränderte Signatur, fremde Kennung und einen fremden Schlüssel ab', async () => {
    const g = await geraetMitEs256();
    const fremd = await geraetMitEs256();
    const c = crypto.getRandomValues(new Uint8Array(32));
    const z = await g.unterschreiben(c);
    const sig = new Uint8Array(z.signature.slice(0));
    sig[sig.length - 1] = sig[sig.length - 1]! ^ 0x01;
    expect(
      await pruefeZusicherung(g.schluessel, { ...z, signature: sig.buffer }, ERWARTET(c)),
    ).toBe(false);
    expect(
      await pruefeZusicherung(
        g.schluessel,
        { ...z, rawId: new Uint8Array(16).buffer },
        ERWARTET(c),
      ),
    ).toBe(false);
    expect(await pruefeZusicherung(fremd.schluessel, z, ERWARTET(c))).toBe(false);
    // Kaputte Eingaben: nein, kein Wurf.
    expect(
      await pruefeZusicherung(
        g.schluessel,
        { ...z, clientDataJSON: new TextEncoder().encode('kein json').buffer },
        ERWARTET(c),
      ),
    ).toBe(false);
    expect(
      await pruefeZusicherung(
        g.schluessel,
        { ...z, authenticatorData: new Uint8Array(10).buffer },
        ERWARTET(c),
      ),
    ).toBe(false);
  });
});

describe('Prüfung der Zusicherung (RS256)', () => {
  it('nimmt eine echte RSA-Zusicherung an und weist eine veränderte ab', async () => {
    const paar = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const schluessel: Offlineschluessel = {
      webauthn_id: zuBase64url(KENNUNG),
      public_key: base64(await crypto.subtle.exportKey('spki', paar.publicKey)),
      public_key_alg: -257,
    };
    const c = crypto.getRandomValues(new Uint8Array(32));
    const client = new TextEncoder().encode(
      JSON.stringify({ type: 'webauthn.get', challenge: zuBase64url(c), origin: ORIGIN }),
    );
    const auth = await authDaten(RP_ID, 0x05);
    const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', client));
    const sig = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      paar.privateKey,
      Uint8Array.from([...auth, ...clientHash]),
    );
    const z: Zusicherung = {
      rawId: kopie(KENNUNG),
      clientDataJSON: kopie(client),
      authenticatorData: kopie(auth),
      signature: sig,
    };
    expect(await pruefeZusicherung(schluessel, z, ERWARTET(c))).toBe(true);
    const anders = new Uint8Array(sig.slice(0));
    anders[0] = anders[0]! ^ 0xff;
    expect(
      await pruefeZusicherung(schluessel, { ...z, signature: anders.buffer }, ERWARTET(c)),
    ).toBe(false);
  });
});

describe('DER in r ‖ s', () => {
  it('füllt kurze Zahlen auf und streicht das Vorzeichenbyte', () => {
    const r = new Uint8Array(32).fill(0x80);
    const s = Uint8Array.from([...new Uint8Array(31), 0x05]);
    const roh = derZuRoh(rohZuDer(Uint8Array.from([...r, ...s])));
    expect(roh).toEqual(Uint8Array.from([...r, ...s]));
  });

  it('lehnt Kaputtes ab', () => {
    expect(derZuRoh(Uint8Array.from([0x31, 0x00]))).toBeNull();
    expect(derZuRoh(Uint8Array.from([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01]))).toBeNull();
  });
});

describe('Schlüssel beim Einrichten (ANN-359)', () => {
  it('liest Kennung, SPKI und Algorithmus aus der Antwort des Browsers', async () => {
    const g = await geraetMitEs256();
    const spki = Uint8Array.from(atob(g.schluessel.public_key), (c) => c.charCodeAt(0));
    expect(
      offlineschluesselAus({
        rawId: KENNUNG.buffer,
        response: { getPublicKey: () => spki.buffer, getPublicKeyAlgorithm: () => -7 },
      }),
    ).toEqual(g.schluessel);
  });

  it('ohne Schlüssel oder mit einem Algorithmus, den Web Crypto nicht prüft: nichts', () => {
    expect(offlineschluesselAus(null)).toBeNull();
    expect(offlineschluesselAus({ rawId: KENNUNG.buffer, response: {} })).toBeNull();
    expect(
      offlineschluesselAus({
        rawId: KENNUNG.buffer,
        response: {
          getPublicKey: () => new Uint8Array(64).buffer,
          getPublicKeyAlgorithm: () => -35,
        },
      }),
    ).toBeNull();
  });
});

describe('Freigabe ohne Netz am Gerät', () => {
  const BESITZER = 'konto-erika';

  beforeEach(() => {
    speicherSetzen(speicherImSpeicher());
    vi.restoreAllMocks();
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
  });

  it('ohne abgelegten Schlüssel: kein Versuch', async () => {
    await expect(freigebenOhneNetz(BESITZER)).rejects.toBeInstanceOf(PasskeyFehler);
  });

  it('fragt genau die abgelegten Passkeys mit Prüfung der Person an und nimmt die richtige Antwort', async () => {
    const g = await geraetMitEs256();
    await fachAendern(BESITZER, 'passkeys', () => [g.schluessel], true);
    const get = vi.fn(async (o: CredentialRequestOptions) => {
      const challenge = new Uint8Array(o.publicKey!.challenge as ArrayBuffer);
      const z = await g.unterschreiben(challenge, {
        origin: window.location.origin,
        rpId: window.location.hostname,
      });
      return { rawId: z.rawId, response: z } as unknown as Credential;
    });
    vi.stubGlobal('navigator', { ...navigator, credentials: { get } });
    await freigebenOhneNetz(BESITZER);
    const optionen = get.mock.calls[0]![0].publicKey!;
    expect(optionen.userVerification).toBe('required');
    expect(optionen.allowCredentials).toHaveLength(1);
  });

  it('eine Antwort mit falscher Herausforderung öffnet nichts', async () => {
    const g = await geraetMitEs256();
    await fachAendern(BESITZER, 'passkeys', () => [g.schluessel], true);
    const get = vi.fn(async () => {
      const z = await g.unterschreiben(new Uint8Array(32), {
        origin: window.location.origin,
        rpId: window.location.hostname,
      });
      return { rawId: z.rawId, response: z } as unknown as Credential;
    });
    vi.stubGlobal('navigator', { ...navigator, credentials: { get } });
    await expect(freigebenOhneNetz(BESITZER)).rejects.toThrow(/nicht angenommen/);
  });

  it('ein Schlüssel eines anderen Kontos auf demselben Gerät gilt nicht', async () => {
    const g = await geraetMitEs256();
    await fachAendern('konto-tina', 'passkeys', () => [g.schluessel], true);
    await expect(freigebenOhneNetz(BESITZER)).rejects.toThrow(/kein Passkey/);
  });
});

import { z } from 'zod';
import { fachAendern, fachLesen } from '@/lib/geraeteablage';
import { getSupabase } from '@/lib/supabase';
import { PASSKEY_SAETZE, PasskeyFehler, passkeyMoeglich } from './passkey';

/**
 * Die Freigabe ohne Netz per Passkey (TRK-009, ADR-025 Punkt 16, ADR-024
 * Punkt 9, §3.4 zweite Ausnahme; ANN-359).
 *
 * Ohne Verbindung kann der Anmeldedienst keinen Passkey prüfen. Die Anwendung
 * prüft dann selbst, gegen den öffentlichen Schlüssel eines Passkeys des
 * eigenen Kontos, den sie in offener Sitzung abgelegt hat
 * (`schluesselAblegen`). Die Zeremonie führt der Browser mit
 * `userVerification: 'required'`, die Signatur prüft Web Crypto; selbst gebaut
 * ist nur die Entscheidung, die lokale Ansicht zu öffnen, und das Lesen der
 * Antwort (Client-Daten, Authenticator-Daten, Signaturformat).
 *
 * Was die Freigabe öffnet: **nur die Ablage auf dem Gerät** - nie eine
 * Sitzung beim Server, kein Freigabevermerk. Die App-PIN gibt ohne Netz nie
 * frei (ADR-025 Punkt 11). So stark wie das Gerät: Wer das Telefon entsperrt
 * und Werkzeuge am Browser hat, liest die Ablage auch ohne die Anwendung.
 */

const FACH = 'passkeys';

const schluesselSchema = z.object({
  webauthn_id: z.string().min(1),
  public_key: z.string().min(1),
  public_key_alg: z.union([z.literal(-7), z.literal(-8), z.literal(-257)]),
});
export type Offlineschluessel = z.infer<typeof schluesselSchema>;

export const OHNE_NETZ_SAETZE = {
  keinSchluessel:
    'Auf diesem Gerät ist kein Passkey für die Freigabe ohne Verbindung abgelegt. Bitte mit Verbindung entsperren.',
  nichtAngenommen: 'Der Passkey wurde nicht angenommen. Bitte erneut versuchen.',
} as const;

// -----------------------------------------------------------------------------
// base64 und base64url
// -----------------------------------------------------------------------------

function zuBase64(bytes: Uint8Array): string {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

export function zuBase64url(bytes: ArrayBuffer | Uint8Array): string {
  return zuBase64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function ausBase64(text: string): Uint8Array<ArrayBuffer> {
  const normal = text.replace(/-/g, '+').replace(/_/g, '/');
  const roh = atob(normal + '='.repeat((4 - (normal.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(roh.length));
  for (let i = 0; i < roh.length; i += 1) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

// -----------------------------------------------------------------------------
// Beim Einrichten: den öffentlichen Schlüssel aus der Antwort des Browsers
// -----------------------------------------------------------------------------

interface AngelegterPasskey {
  rawId: ArrayBuffer;
  response: {
    getPublicKey?: () => ArrayBuffer | null;
    getPublicKeyAlgorithm?: () => number;
  };
}

/**
 * Kennung, Schlüssel und Algorithmus eines gerade angelegten Passkeys - oder
 * `null`, wenn der Browser sie nicht nennt oder Web Crypto den Algorithmus
 * nicht prüfen kann. Dann geht die Freigabe ohne Netz mit diesem Passkey
 * nicht; alles andere bleibt (ANN-359).
 */
export function offlineschluesselAus(angelegt: unknown): Offlineschluessel | null {
  try {
    const p = angelegt as AngelegterPasskey | null;
    const spki = p?.response.getPublicKey?.();
    const alg = p?.response.getPublicKeyAlgorithm?.();
    if (!p || !spki || alg === undefined) return null;
    const geprueft = schluesselSchema.safeParse({
      webauthn_id: zuBase64url(p.rawId),
      public_key: zuBase64(new Uint8Array(spki)),
      public_key_alg: alg,
    });
    return geprueft.success ? geprueft.data : null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// In offener Sitzung: die Schlüssel auf das Gerät
// -----------------------------------------------------------------------------

/**
 * Holt die Schlüssel der eigenen, freigegebenen Passkeys und legt sie ab -
 * „bei der letzten Freigabe mit Netz" (ADR-025 Punkt 16). Ein entfernter
 * Passkey fällt damit auch hier. Scheitert die Abfrage, bleibt der Stand.
 */
export async function schluesselAblegen(besitzer: string): Promise<void> {
  let daten: unknown;
  try {
    const { data, error } = (await getSupabase().rpc('own_offline_passkeys')) as {
      data: unknown;
      error: unknown;
    };
    if (error) return;
    daten = data ?? [];
  } catch {
    return;
  }
  const geprueft = z.array(schluesselSchema).safeParse(daten);
  if (!geprueft.success) return;
  await fachAendern(besitzer, FACH, () =>
    geprueft.data.length > 0 ? geprueft.data : undefined,
  ).catch(() => undefined);
}

async function abgelegteSchluessel(besitzer: string): Promise<Offlineschluessel[]> {
  const geprueft = z.array(schluesselSchema).safeParse(await fachLesen(besitzer, FACH));
  return geprueft.success ? geprueft.data : [];
}

/** Bietet dieses Gerät die Freigabe ohne Netz an? (Punkt 16: nur mit abgelegtem Schlüssel.) */
export async function freigabeOhneNetzMoeglich(besitzer: string): Promise<boolean> {
  if (!passkeyMoeglich()) return false;
  return (await abgelegteSchluessel(besitzer).catch(() => [])).length > 0;
}

// -----------------------------------------------------------------------------
// Die Prüfung
// -----------------------------------------------------------------------------

export interface Zusicherung {
  rawId: ArrayBuffer;
  clientDataJSON: ArrayBuffer;
  authenticatorData: ArrayBuffer;
  signature: ArrayBuffer;
}

export interface Erwartung {
  challenge: Uint8Array;
  origin: string;
  rpId: string;
}

/** ECDSA-Signatur aus WebAuthn (DER) in die Form, die Web Crypto prüft (r ‖ s). */
export function derZuRoh(der: Uint8Array, laenge = 32): Uint8Array<ArrayBuffer> | null {
  let i = 0;
  if (der[i++] !== 0x30) return null;
  let gesamt = der[i++]!;
  if (gesamt & 0x80) {
    const n = gesamt & 0x7f;
    gesamt = 0;
    for (let k = 0; k < n; k += 1) gesamt = (gesamt << 8) | der[i++]!;
  }
  if (i + gesamt !== der.length) return null;
  const roh = new Uint8Array(new ArrayBuffer(laenge * 2));
  for (const teil of [0, 1]) {
    if (der[i++] !== 0x02) return null;
    let n = der[i++]!;
    let start = i;
    i += n;
    if (i > der.length) return null;
    while (n > laenge && der[start] === 0) {
      start += 1;
      n -= 1;
    }
    if (n > laenge) return null;
    roh.set(der.subarray(start, start + n), teil * laenge + (laenge - n));
  }
  return i === der.length ? roh : null;
}

function gleich(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

async function sha256(daten: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', daten));
}

/**
 * Prüft eine Zusicherung gegen einen abgelegten Schlüssel: der richtige
 * Passkey, unsere Herausforderung, unser Ursprung, unsere Relying Party, die
 * Person anwesend **und geprüft** (UV), die Signatur stimmt. Jeder Fehler
 * heißt nein.
 */
export async function pruefeZusicherung(
  schluessel: Offlineschluessel,
  z: Zusicherung,
  erwartet: Erwartung,
): Promise<boolean> {
  try {
    if (zuBase64url(z.rawId) !== schluessel.webauthn_id) return false;

    const clientRoh = new Uint8Array(z.clientDataJSON);
    const client = JSON.parse(new TextDecoder().decode(clientRoh)) as Record<string, unknown>;
    if (client.type !== 'webauthn.get') return false;
    if (client.challenge !== zuBase64url(erwartet.challenge)) return false;
    if (client.origin !== erwartet.origin) return false;
    if (client.crossOrigin === true) return false;

    const auth = new Uint8Array(z.authenticatorData);
    if (auth.length < 37) return false;
    const rpHash = await sha256(new TextEncoder().encode(erwartet.rpId));
    if (!gleich(auth.subarray(0, 32), rpHash)) return false;
    const flags = auth[32]!;
    // UP (anwesend) und UV (geprüft) - ADR-025 Punkt 10: `required`.
    if ((flags & 0x01) === 0 || (flags & 0x04) === 0) return false;

    const signiert = new Uint8Array(new ArrayBuffer(auth.length + 32));
    signiert.set(auth, 0);
    signiert.set(await sha256(clientRoh), auth.length);

    const spki = ausBase64(schluessel.public_key);
    const signatur = new Uint8Array(z.signature);
    if (schluessel.public_key_alg === -7) {
      const roh = derZuRoh(signatur);
      if (!roh) return false;
      const key = await crypto.subtle.importKey(
        'spki',
        spki,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, roh, signiert);
    }
    if (schluessel.public_key_alg === -257) {
      const key = await crypto.subtle.importKey(
        'spki',
        spki,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signatur, signiert);
    }
    const key = await crypto.subtle.importKey('spki', spki, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signatur, signiert);
  } catch {
    return false;
  }
}

/**
 * Die Zeremonie ohne Netz. Wirft `PasskeyFehler`; gelingt sie, darf die
 * lokale Ansicht öffnen - nichts sonst.
 */
export async function freigebenOhneNetz(besitzer: string): Promise<void> {
  if (!passkeyMoeglich()) throw new PasskeyFehler(PASSKEY_SAETZE.nichtUnterstuetzt);
  const schluessel = await abgelegteSchluessel(besitzer);
  if (schluessel.length === 0) throw new PasskeyFehler(OHNE_NETZ_SAETZE.keinSchluessel);
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  // ANN-359: Relying Party ist der Name dieses Ursprungs - wie bei der
  // Einrichtung über den Anmeldedienst, der ihn je Umgebung als Domain führt.
  const rpId = window.location.hostname;
  let antwort: (Credential & { rawId?: ArrayBuffer; response?: unknown }) | null;
  try {
    antwort = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId,
        allowCredentials: schluessel.map((s) => ({
          type: 'public-key' as const,
          id: ausBase64(s.webauthn_id),
        })),
        userVerification: 'required',
        timeout: 120_000,
      },
    });
  } catch (fehler) {
    if ((fehler as { name?: string }).name === 'NotAllowedError') {
      throw new PasskeyFehler(PASSKEY_SAETZE.abgebrochen, true);
    }
    throw new PasskeyFehler(PASSKEY_SAETZE.geraet);
  }
  const p = antwort;
  const r = p?.response as Partial<Zusicherung> | undefined;
  if (!p?.rawId || !r?.clientDataJSON || !r.authenticatorData || !r.signature) {
    throw new PasskeyFehler(OHNE_NETZ_SAETZE.nichtAngenommen);
  }
  const zusicherung: Zusicherung = {
    rawId: p.rawId,
    clientDataJSON: r.clientDataJSON,
    authenticatorData: r.authenticatorData,
    signature: r.signature,
  };
  const passend = schluessel.find((s) => s.webauthn_id === zuBase64url(zusicherung.rawId));
  const ok =
    passend !== undefined &&
    (await pruefeZusicherung(passend, zusicherung, {
      challenge,
      origin: window.location.origin,
      rpId,
    }));
  if (!ok) throw new PasskeyFehler(OHNE_NETZ_SAETZE.nichtAngenommen);
}

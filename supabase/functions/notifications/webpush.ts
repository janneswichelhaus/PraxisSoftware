/**
 * Web-Push ohne Bibliothek (KOM-010, ADR-024 Punkte 11, 14, 18; W3).
 *
 * Zwei Standards, beide mit Web Crypto:
 *
 * - **RFC 8291** verschlüsselt den Inhalt Ende zu Ende für das Gerät
 *   (`aes128gcm`, RFC 8188). Der Push-Dienst des Browserherstellers sieht ihn
 *   nicht.
 * - **RFC 8292** (VAPID) weist den Absender mit einem eigenen Schlüsselpaar
 *   aus. Der private Schlüssel ist ein Secret der Function; der Browser sieht
 *   ihn nie (Punkt 16).
 *
 * Der Inhalt ist ohnehin klein und ohne Gesundheitsdatum: Katalogschlüssel und
 * höchstens ein Zeitpunkt (Punkt 14). Jede Nachricht gilt 24 Stunden (`TTL`,
 * Punkt 18). Scharf erst nach der Prüfung aus Punkt 18; bis dahin wählt
 * `versand.ts` diesen Weg nicht ohne ausdrückliche Einrichtung.
 */

export interface PushZiel {
  readonly endpoint: string;
  /** Öffentlicher Schlüssel des Geräts, 65 Byte, base64url. */
  readonly p256dh: string;
  /** Authentisierungsgeheimnis des Geräts, 16 Byte, base64url. */
  readonly auth: string;
}

export interface VapidSchluessel {
  /** 65 Byte (unkomprimierter Punkt), base64url. */
  readonly oeffentlich: string;
  /** 32 Byte (Skalar d), base64url. */
  readonly privat: string;
  /** `mailto:` oder `https:` - wer den Absender erreicht (RFC 8292 Abschnitt 2.1). */
  readonly kontakt: string;
}

/** Gültigkeit einer Push-Nachricht beim Push-Dienst (ADR-024 Punkt 18). */
export const PUSH_GUELTIGKEIT_SEKUNDEN = 24 * 60 * 60;
const RECORD_GROESSE = 4096;

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------
export function base64url(bytes: Uint8Array): string {
  let binaer = '';
  for (const b of bytes) binaer += String.fromCharCode(b);
  return btoa(binaer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function ausBase64url(text: string): Uint8Array<ArrayBuffer> {
  const normal = text.replace(/-/g, '+').replace(/_/g, '/');
  const binaer = atob(normal + '='.repeat((4 - (normal.length % 4)) % 4));
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i += 1) bytes[i] = binaer.charCodeAt(i);
  return bytes;
}

function verbinde(...teile: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const ergebnis = new Uint8Array(teile.reduce((summe, t) => summe + t.length, 0));
  let stelle = 0;
  for (const t of teile) {
    ergebnis.set(t, stelle);
    stelle += t.length;
  }
  return ergebnis;
}

const text = (s: string) => new TextEncoder().encode(s);

// ---------------------------------------------------------------------------
// Schlüssel
// ---------------------------------------------------------------------------
function jwkAusPunkt(punkt: Uint8Array, d?: Uint8Array): JsonWebKey {
  if (punkt.length !== 65 || punkt[0] !== 4) throw new Error('invalid P-256 point');
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(punkt.slice(1, 33)),
    y: base64url(punkt.slice(33, 65)),
    ...(d === undefined ? {} : { d: base64url(d) }),
    ext: true,
  };
}

async function oeffentlicherEcdh(punkt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', punkt, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

/** Ein Schlüsselpaar aus Rohform - für den Testvektor und für VAPID. */
export async function privaterSchluessel(
  oeffentlich: Uint8Array,
  privat: Uint8Array,
  zweck: 'ECDH' | 'ECDSA',
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwkAusPunkt(oeffentlich, privat),
    zweck === 'ECDH'
      ? { name: 'ECDH', namedCurve: 'P-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    zweck === 'ECDH' ? ['deriveBits'] : ['sign'],
  );
}

async function hkdf(
  salz: Uint8Array<ArrayBuffer>,
  material: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  laenge: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const schluessel = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salz, info },
    schluessel,
    laenge * 8,
  );
  return new Uint8Array(bits);
}

// ---------------------------------------------------------------------------
// RFC 8291: Inhalt verschlüsseln
// ---------------------------------------------------------------------------
export interface Absenderschluessel {
  readonly oeffentlich: Uint8Array<ArrayBuffer>;
  readonly privat: CryptoKey;
}

async function neuerAbsenderschluessel(): Promise<Absenderschluessel> {
  const paar = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const roh = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
  return { oeffentlich: roh, privat: paar.privateKey };
}

/**
 * Verschlüsselt `inhalt` für ein Gerät (RFC 8291 Abschnitt 3, ein Record).
 * Salz und Absenderschlüssel sind nur für den Testvektor von außen gesetzt;
 * im Betrieb entstehen sie je Nachricht neu.
 */
export async function verschluessele(
  ziel: Pick<PushZiel, 'p256dh' | 'auth'>,
  inhalt: Uint8Array,
  fest: { salz?: Uint8Array<ArrayBuffer>; absender?: Absenderschluessel } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const geraetPunkt = ausBase64url(ziel.p256dh);
  const geheimnis = ausBase64url(ziel.auth);
  if (geraetPunkt.length !== 65 || geheimnis.length !== 16) throw new Error('invalid subscription');
  if (inhalt.length > RECORD_GROESSE - 16 - 1 - 86) throw new Error('payload too large');

  const salz = fest.salz ?? crypto.getRandomValues(new Uint8Array(16));
  const absender = fest.absender ?? (await neuerAbsenderschluessel());

  const gemeinsam = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: await oeffentlicherEcdh(geraetPunkt) },
      absender.privat,
      256,
    ),
  );
  const ikm = await hkdf(
    geheimnis,
    gemeinsam,
    verbinde(text('WebPush: info\0'), geraetPunkt, absender.oeffentlich),
    32,
  );
  const cek = await hkdf(salz, ikm, text('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salz, ikm, text('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Ein Record, Trennzeichen 0x02 (letzter Record, RFC 8188 Abschnitt 2).
  const klar = verbinde(inhalt, new Uint8Array([2]));
  const geheim = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, klar),
  );

  const kopf = new Uint8Array(16 + 4 + 1);
  kopf.set(salz, 0);
  new DataView(kopf.buffer).setUint32(16, RECORD_GROESSE);
  kopf[20] = absender.oeffentlich.length;
  return verbinde(kopf, absender.oeffentlich, geheim);
}

// ---------------------------------------------------------------------------
// RFC 8292: VAPID
// ---------------------------------------------------------------------------
export async function vapidKopf(
  endpunkt: string,
  schluessel: VapidSchluessel,
  jetzt: number = Date.now(),
): Promise<string> {
  const herkunft = new URL(endpunkt).origin;
  const kopf = base64url(text(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const nutzlast = base64url(
    text(
      JSON.stringify({
        aud: herkunft,
        // Höchstens 24 Stunden (RFC 8292 Abschnitt 2); zwölf reichen.
        exp: Math.floor(jetzt / 1000) + 12 * 60 * 60,
        sub: schluessel.kontakt,
      }),
    ),
  );
  const signierbar = `${kopf}.${nutzlast}`;
  const privat = await privaterSchluessel(
    ausBase64url(schluessel.oeffentlich),
    ausBase64url(schluessel.privat),
    'ECDSA',
  );
  // Web Crypto liefert r||s (IEEE P1363) - genau die Form, die JWS verlangt.
  const signatur = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privat, text(signierbar)),
  );
  return `vapid t=${signierbar}.${base64url(signatur)}, k=${schluessel.oeffentlich}`;
}

// ---------------------------------------------------------------------------
// Senden
// ---------------------------------------------------------------------------
export type PushErgebnis = 'sent' | 'gone' | 'failed';

/**
 * Schickt eine verschlüsselte Nachricht an einen Endpunkt. 404 und 410
 * heißen „nicht mehr vorhanden" - die Registrierung fällt (Punkt 16).
 */
export async function sendePush(
  ziel: PushZiel,
  inhalt: Uint8Array,
  schluessel: VapidSchluessel,
  abrufen: typeof fetch = fetch,
  timeoutMs = 8_000,
): Promise<PushErgebnis> {
  if (!/^https:\/\//.test(ziel.endpoint)) return 'gone';
  try {
    const koerper = await verschluessele(ziel, inhalt);
    const antwort = await abrufen(ziel.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidKopf(ziel.endpoint, schluessel),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(PUSH_GUELTIGKEIT_SEKUNDEN),
        Urgency: 'normal',
      },
      body: koerper,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (antwort.status === 404 || antwort.status === 410) return 'gone';
    return antwort.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Die Wege der Benachrichtigungen hinter einem Adapter (KOM-010, ADR-024
 * Punkt 11, Grundsatz 5).
 *
 * | Weg   | Adapter            | Stand                                             |
 * | ----- | ------------------ | ------------------------------------------------- |
 * | Mail  | `mock`             | Postfach des lokalen Stacks (Mailpit); SMTP mit B13 |
 * | Push  | `mock`, `webpush`  | `webpush` erst nach der Prüfung aus Punkt 18       |
 *
 * **Alles andere ist „nicht eingerichtet", nie stillschweigend `mock`**
 * (dieselbe Regel wie beim Zugangsdienst und ANN-090). Den produktiven
 * Mailweg (`smtp`) gibt es erst mit der Anbieterprüfung aus Block 11 (B13);
 * bis dahin kommt außerhalb des Tests keine Mail an. `webpush` wählt nur, wer
 * die VAPID-Schlüssel bewusst als Secret setzt - das ist das Scharfschalten
 * nach Punkt 18 (§15.2).
 */

import { erstelleNachbildung } from '../platform-access/versand.ts';
import { sendePush, type PushErgebnis, type PushZiel, type VapidSchluessel } from './webpush.ts';

export interface Mail {
  readonly an: string;
  readonly betreff: string;
  readonly text: string;
}

export interface Mailweg {
  readonly id: 'mock';
  readonly sende: (mail: Mail) => Promise<'sent' | 'failed'>;
}

export interface Pushweg {
  readonly id: 'mock' | 'webpush';
  readonly sende: (ziel: PushZiel, inhalt: Uint8Array) => Promise<PushErgebnis>;
}

export interface Wege {
  readonly mail: Mailweg | null;
  readonly push: Pushweg | null;
}

export interface WegeUmgebung {
  readonly MAIL_PROVIDER?: string | undefined;
  readonly MAIL_MOCK_URL?: string | undefined;
  readonly PUSH_PROVIDER?: string | undefined;
  readonly PUSH_MOCK_URL?: string | undefined;
  readonly VAPID_PUBLIC_KEY?: string | undefined;
  readonly VAPID_PRIVATE_KEY?: string | undefined;
  readonly VAPID_SUBJECT?: string | undefined;
}

const TIMEOUT_MS = 8_000;
const sauber = (wert: string | undefined) => (wert ?? '').trim();

export function waehleWege(umgebung: WegeUmgebung, abrufen: typeof fetch = fetch): Wege {
  return { mail: waehleMail(umgebung, abrufen), push: waehlePush(umgebung, abrufen) };
}

function waehleMail(umgebung: WegeUmgebung, abrufen: typeof fetch): Mailweg | null {
  const postfach = sauber(umgebung.MAIL_MOCK_URL).replace(/\/+$/, '');
  if (sauber(umgebung.MAIL_PROVIDER).toLowerCase() !== 'mock' || postfach === '') return null;
  const nachbildung = erstelleNachbildung(postfach, abrufen);
  return {
    id: 'mock',
    async sende(mail) {
      const ergebnis = await nachbildung.sende(mail);
      return ergebnis.ok ? 'sent' : 'failed';
    },
  };
}

function waehlePush(umgebung: WegeUmgebung, abrufen: typeof fetch): Pushweg | null {
  const anbieter = sauber(umgebung.PUSH_PROVIDER).toLowerCase();
  if (anbieter === 'mock') {
    const liste = sauber(umgebung.PUSH_MOCK_URL).replace(/\/+$/, '');
    return liste === '' ? null : erstellePushNachbildung(liste, abrufen);
  }
  if (anbieter === 'webpush') {
    const schluessel: VapidSchluessel = {
      oeffentlich: sauber(umgebung.VAPID_PUBLIC_KEY),
      privat: sauber(umgebung.VAPID_PRIVATE_KEY),
      kontakt: sauber(umgebung.VAPID_SUBJECT),
    };
    if (
      !/^[A-Za-z0-9_-]{87}$/.test(schluessel.oeffentlich) ||
      !/^[A-Za-z0-9_-]{43}$/.test(schluessel.privat) ||
      !/^(mailto:|https:\/\/)/.test(schluessel.kontakt)
    ) {
      return null;
    }
    return { id: 'webpush', sende: (ziel, inhalt) => sendePush(ziel, inhalt, schluessel, abrufen) };
  }
  return null;
}

/**
 * Die Nachbildung des Push-Dienstes: Sie stellt den unverschlüsselten Inhalt
 * mit dem Endpunkt in eine Liste, die Tests und die lokale Sichtung lesen.
 * Ein Endpunkt, der auf `/weg` endet, spielt „nicht mehr vorhanden".
 */
export function erstellePushNachbildung(liste: string, abrufen: typeof fetch = fetch): Pushweg {
  return {
    id: 'mock',
    async sende(ziel, inhalt) {
      if (ziel.endpoint.endsWith('/weg')) return 'gone';
      try {
        const antwort = await abrufen(liste, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: ziel.endpoint,
            inhalt: JSON.parse(new TextDecoder().decode(inhalt)) as unknown,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return antwort.ok ? 'sent' : 'failed';
      } catch {
        return 'failed';
      }
    },
  };
}

/**
 * Mailversand hinter einem Adapter (ADR-023 Punkt 10, Roadmap R8).
 *
 * Es gibt heute genau einen Weg: `mock`. Er stellt in das Postfach des
 * lokalen Stacks zu (Mailpit, `POST /api/v1/send`) und nirgends sonst hin.
 * Der produktive Versanddienst ist B13 und kommt mit eigener
 * Anbieterprüfung in Block 11 (ADR-002) — dann als zweiter Adapter hier.
 *
 * **Alles andere ist „nicht eingerichtet", nie stillschweigend `mock`**
 * (dieselbe Regel wie ANN-090 beim Kartendienst). Die Plattform bleibt dann
 * trotzdem benutzbar: Die Einladung geht vor Ort als QR (Punkt 8).
 */

import type { Ergebnis } from './typen.ts';

export interface Nachricht {
  readonly an: string;
  readonly betreff: string;
  readonly text: string;
}

export interface Versandweg {
  readonly id: 'mock';
  readonly sende: (nachricht: Nachricht) => Promise<Ergebnis<null>>;
}

export interface VersandUmgebung {
  readonly MAIL_PROVIDER?: string | undefined;
  readonly MAIL_MOCK_URL?: string | undefined;
}

const ABSENDER = 'plattform@praxis.invalid';
const TIMEOUT_MS = 8_000;

export function waehleVersand(
  umgebung: VersandUmgebung,
  abrufen: typeof fetch = fetch,
): Versandweg | null {
  const anbieter = (umgebung.MAIL_PROVIDER ?? '').trim().toLowerCase();
  const postfach = (umgebung.MAIL_MOCK_URL ?? '').trim().replace(/\/+$/, '');
  if (anbieter === 'mock' && postfach !== '') return erstelleNachbildung(postfach, abrufen);
  return null;
}

export function erstelleNachbildung(postfach: string, abrufen: typeof fetch = fetch): Versandweg {
  return {
    id: 'mock',
    async sende(nachricht) {
      try {
        const antwort = await abrufen(`${postfach}/api/v1/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            From: { Email: ABSENDER, Name: 'Praxisplattform (lokal)' },
            To: [{ Email: nachricht.an }],
            Subject: nachricht.betreff,
            Text: nachricht.text,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return antwort.ok ? { ok: true, value: null } : { ok: false, error: 'unavailable' };
      } catch {
        return { ok: false, error: 'unavailable' };
      }
    },
  };
}

/**
 * Der Wortlaut der Einladungsmail. Anrede „Sie" (DSN-001 D6), kein
 * Gesundheitsbezug, kein Name der Person: Die Mail sagt nur, von welcher
 * Praxis sie kommt und wie lange der Link gilt.
 *
 * Der Code steht im Fragment der Adresse (`#code=…`): Er geht nicht an einen
 * Server und in kein Zugriffsprotokoll, auch nicht an das eigene (ANN-043).
 */
export function einladungstext(
  appUrl: string,
  praxis: string,
  code: string,
  gueltigBis: string,
): Omit<Nachricht, 'an'> {
  const basis = appUrl.trim().replace(/\/+$/, '');
  const bis = new Date(gueltigBis).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  });
  const absender = praxis.trim() === '' ? 'Ihre Praxis' : praxis.trim();
  return {
    betreff: `Ihr Zugang: Einladung von ${absender}`,
    text: [
      'Guten Tag,',
      '',
      `${absender} lädt Sie zu Ihrem persönlichen Zugang ein.`,
      'Öffnen Sie diesen Link und legen Sie dort Ihr Kennwort fest:',
      '',
      `${basis}/einladung#code=${code}`,
      '',
      `Der Link gilt bis zum ${bis} und nur einmal.`,
      'Geben Sie ihn nicht weiter. Wenn Sie diese Mail nicht erwartet haben, können Sie sie löschen.',
    ].join('\n'),
  };
}

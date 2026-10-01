/**
 * Die Verträge des Zugangsdienstes (POR-003, ADR-023 Punkte 7 bis 10).
 *
 * Der Dienst hat zwei Aufgaben und keine dritte:
 *
 * - `einloesen` — öffentlich, ohne Sitzung: Die eingeladene Person schickt
 *   Code, Adresse und Kennwort. Der Dienst legt das Konto beim Anmeldedienst
 *   an (oder setzt für ein bestehendes ein neues Kennwort) und bindet es an
 *   den Zugang. Den Admin-Schlüssel sieht der Browser nie (Punkt 9).
 * - `versenden` — mit der Sitzung der einladenden Person: Die Einladung
 *   geht per Mail an die Adresse, die der Server bestimmt (Punkt 10, 11).
 */

/** Was schiefgehen kann — für die Oberfläche, ohne interne Einzelheiten (§13). */
export type ZugangsFehler =
  /** Anfrage unvollständig oder falsch geformt. */
  | 'invalid_request'
  /** Code unbekannt, abgelaufen oder benutzt — immer dieselbe Auskunft (Punkt 8). */
  | 'invitation_invalid'
  /** Die Adresse hat schon ein Konto, und das Kennwort passt nicht dazu. */
  | 'email_taken'
  /** Das Kennwort erfüllt die Mindestlänge nicht (ANN-027). */
  | 'weak_password'
  /** Das Konto kann diesen Zugang nicht bekommen: Praxiskonto oder andere Person (Punkte 2, 4). */
  | 'account_conflict'
  /** Der Code ist verbraucht, das neue Kennwort ließ sich aber nicht setzen. */
  | 'password_not_set'
  /** Versenden ohne gültige Sitzung. */
  | 'session_invalid'
  /** Versenden ohne Recht oder für eine Einladung, die nicht per Mail geht. */
  | 'not_allowed'
  /** Die Adresse im Verhältnis hat sich seit der Einladung geändert (Punkt 11). */
  | 'address_changed'
  /** Kein Versandweg, oder dem Dienst fehlt eine Einrichtung. */
  | 'not_configured'
  /** Anmeldedienst oder Versand antworten nicht. */
  | 'unavailable';

export type Ergebnis<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ZugangsFehler };

/** Mindestlänge des Kennworts, wie beim Anmeldedienst eingestellt (ANN-027, Punkt 17). */
export const MIN_KENNWORT = 12;
export const MAX_KENNWORT = 128;

/** Der Code aus `invite_platform_access`: 32 Zeichen, URL-tauglich. */
export const CODE_MUSTER = /^[A-Za-z0-9_-]{20,64}$/;

/** Bewusst schlicht: Die eigentliche Prüfung macht der Anmeldedienst. */
export const ADRESS_MUSTER = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type Zweck = 'activate' | 'reset';

export interface Nachgeschlagen {
  readonly purpose: Zweck;
  readonly accountUserId: string | null;
  readonly organizationName: string;
}

export interface Einladungsmail {
  readonly email: string;
  readonly organizationName: string;
  readonly expiresAt: string;
}

/**
 * Der SHA-256 des Codes, hexadezimal - dieselbe Rechnung wie
 * `app.platform_code_hash` in der Datenbank. Nur er geht an die Datenbank:
 * Der Code selbst steht so in keinem Protokoll (Zweitreview, ADR-011).
 */
export async function codeHash(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

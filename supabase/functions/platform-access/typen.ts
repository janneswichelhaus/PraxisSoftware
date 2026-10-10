/**
 * Die Verträge des Zugangsdienstes (POR-003, ADR-023 Punkte 7 bis 10).
 *
 * Der Dienst hat drei Aufgaben und keine vierte:
 *
 * - `einloesen` — öffentlich: Die eingeladene Person schickt Code und
 *   Adresse. Der Dienst legt das Konto beim Anmeldedienst **ohne Kennwort** an
 *   und bindet es an den Zugang; zurück kommt eine Einmal-Anmeldung
 *   (`token_hash`), mit der die Seite anmeldet und Passkey und PIN einrichtet
 *   (ADR-025 Fassung 2, Punkt 13; ADR-023 Fassung 4). Wer schon ein Konto
 *   hat, ist vorher mit dem Passkey angemeldet und löst mit seiner Sitzung
 *   ein. Den Admin-Schlüssel sieht der Browser nie (Punkt 9).
 * - `versenden` — mit der Sitzung der einladenden Person: Die Einladung
 *   geht per Mail an die Adresse, die der Server bestimmt (Punkt 10, 11).
 * - `konten_loeschen` — nur mit dem Admin-Schlüssel, für den Zeitplan des
 *   Betriebs: Der Dienst holt die Löschaufträge des Löschlaufs ab, entfernt
 *   die Konten über die Admin-API des Anmeldedienstes und bestätigt jedes
 *   einzeln (ABN-011, BEF-115). Scharf erst mit OPS-001.
 */

/** Was schiefgehen kann — für die Oberfläche, ohne interne Einzelheiten (§13). */
export type ZugangsFehler =
  /** Anfrage unvollständig oder falsch geformt. */
  | 'invalid_request'
  /** Code unbekannt, abgelaufen oder benutzt — immer dieselbe Auskunft (Punkt 8). */
  | 'invitation_invalid'
  /** Die Adresse hat schon ein Konto: erst mit dem Passkey anmelden, dann einlösen. */
  | 'email_taken'
  /** Das Konto kann diesen Zugang nicht bekommen: Praxiskonto oder andere Person (Punkte 2, 4). */
  | 'account_conflict'
  /** Der Code ist verbraucht, die Einmal-Anmeldung ließ sich aber nicht erzeugen. */
  | 'sign_in_not_created'
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

import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Das Einlösen einer Einladung zur Plattform (POR-003, ADR-023 Punkte 7 bis 9).
 *
 * Die Seite schickt Code, Adresse und Kennwort an den Zugangsdienst (Edge
 * Function `platform-access`). Der legt das Konto an oder bestätigt ein
 * bestehendes und bindet es an den Zugang. Der Browser sieht den
 * Admin-Schlüssel nie. Danach meldet sich die Seite ganz gewöhnlich mit
 * Adresse und Kennwort an (Punkt 18).
 */

/** Der Pfad, auf den der QR-Code und die Mail führen. */
export const EINLADUNG_PFAD = '/einladung';

/** Der Code steht im Fragment (`#code=…`), nicht in der Suche: Er geht an keinen Server. */
export function codeAusFragment(fragment: string): string | null {
  const roh = new URLSearchParams(fragment.replace(/^#/, '')).get('code');
  if (roh === null) return null;
  const code = roh.trim();
  return /^[A-Za-z0-9_-]{20,64}$/.test(code) ? code : null;
}

export type Einloesefehler =
  | 'invitation_invalid'
  | 'email_taken'
  | 'weak_password'
  | 'account_conflict'
  | 'invalid_request'
  | 'password_not_set'
  | 'unavailable';

export class EinloeseError extends Error {
  readonly art: Einloesefehler;
  constructor(art: Einloesefehler) {
    super(art);
    this.name = 'EinloeseError';
    this.art = art;
  }
}

const antwortSchema = z.union([
  z.object({
    ok: z.literal(true),
    value: z.object({ purpose: z.enum(['activate', 'reset']), organizationName: z.string() }),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

const BEKANNT: readonly Einloesefehler[] = [
  'invitation_invalid',
  'email_taken',
  'weak_password',
  'account_conflict',
  'invalid_request',
  'password_not_set',
];

export async function loeseEinladungEin(
  code: string,
  email: string,
  kennwort: string,
): Promise<{ purpose: 'activate' | 'reset'; organizationName: string }> {
  const { data, error, response } = (await getSupabase().functions.invoke<unknown>(
    'platform-access',
    { body: { aufgabe: 'einloesen', code, email, kennwort } },
  )) as { data: unknown; error: unknown; response?: Response };

  let koerper: unknown = data;
  if (error !== null) {
    if (response === undefined) throw new EinloeseError('unavailable');
    try {
      koerper = await response.json();
    } catch {
      throw new EinloeseError('unavailable');
    }
  }
  const gelesen = antwortSchema.safeParse(koerper);
  if (!gelesen.success) throw new EinloeseError('unavailable');
  if (!gelesen.data.ok) {
    const art = gelesen.data.error as Einloesefehler;
    // Nicht eingerichtet, nicht erreichbar oder unbekannt: Für die Person ist
    // das dasselbe - der Code ist nicht verbraucht, später erneut versuchen.
    throw new EinloeseError(BEKANNT.includes(art) ? art : 'unavailable');
  }
  return gelesen.data.value;
}

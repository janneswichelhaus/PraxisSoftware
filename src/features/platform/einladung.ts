import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Das Einlösen einer Einladung zur Plattform (POR-003, ADR-023 Fassung 4,
 * Punkte 7 bis 10; ADR-025 Fassung 2, Punkt 13).
 *
 * Die Seite schickt Code und Adresse an den Zugangsdienst (Edge Function
 * `platform-access`). Der legt das Konto **ohne Kennwort** an, bindet es an
 * den Zugang und gibt eine Einmal-Anmeldung zurück; die Seite meldet damit
 * an und richtet Passkey und PIN ein. Wer schon ein Konto hat, meldet sich
 * vorher mit dem Passkey an - dann trägt der Aufruf die Sitzung, und es gibt
 * keine Einmal-Anmeldung. Der Browser sieht den Admin-Schlüssel nie.
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
  | 'account_conflict'
  | 'invalid_request'
  | 'sign_in_not_created'
  | 'session_invalid'
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
    value: z.object({
      purpose: z.enum(['activate', 'reset']),
      organizationName: z.string(),
      tokenHash: z.string().min(1).nullable(),
    }),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

const BEKANNT: readonly Einloesefehler[] = [
  'invitation_invalid',
  'email_taken',
  'account_conflict',
  'invalid_request',
  'sign_in_not_created',
  'session_invalid',
];

export interface Eingeloest {
  purpose: 'activate' | 'reset';
  organizationName: string;
  /** Die Einmal-Anmeldung; `null`, wenn mit bestehender Sitzung eingelöst wurde. */
  tokenHash: string | null;
}

/**
 * Löst die Einladung ein. Ohne Sitzung mit Adresse; mit Sitzung (`email`
 * leer) für das angemeldete Konto - `functions.invoke` trägt sie dann im Kopf.
 */
export async function loeseEinladungEin(code: string, email: string): Promise<Eingeloest> {
  const { data, error, response } = (await getSupabase().functions.invoke<unknown>(
    'platform-access',
    { body: { aufgabe: 'einloesen', code, email } },
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

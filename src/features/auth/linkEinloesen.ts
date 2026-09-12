import { getSupabase } from '@/lib/supabase';

/**
 * Einlösen eines Links aus einer Auth-Mail (FIX-001, ANN-042).
 *
 * Der Anmeldedienst verschickt zwei Sorten Links: einen zum Setzen eines neuen
 * Kennworts (`recovery`) und einen zum Anmelden ohne Kennwort (`magiclink`,
 * die Zugangsmail an eine offene Einladung). Beide tragen dieselbe Ware — den
 * einmaligen `token_hash` — und werden deshalb hier gemeinsam eingelöst.
 *
 * **Warum `verifyOtp` und nicht die Sitzung aus der Adresszeile.**
 * `src/lib/supabase.ts` setzt `detectSessionInUrl: false`. Diese Anwendung
 * nimmt also bewusst keine Sitzung entgegen, die im Adressfragment steht — dort
 * stünde ein vollwertiges Zugriffs- und Erneuerungstoken im Browserverlauf.
 * `verifyOtp` tauscht stattdessen den Hash gegen eine Sitzung, in einem Aufruf
 * des SDK. Selbst an der Sitzungsmechanik zu bauen — das Fragment zerlegen und
 * `setSession` rufen — wäre genau der Eigenbau, den `PROJECT_PRINCIPLES.md`
 * §3.4 ausschließt.
 *
 * Nebenbei ist es der einzige Weg, der **geräteübergreifend** funktioniert: Der
 * PKCE-Weg verlangt den Prüfschlüssel im selben Browserprofil und bricht
 * genau im häufigsten Fall — angefordert am Praxisrechner, geöffnet auf dem
 * Telefon.
 */
export type LinkTyp = 'recovery' | 'magiclink';

/**
 * Der Link trägt nicht mehr.
 *
 * Abgelaufen, schon benutzt und von einem Mailfilter im Voraus geöffnet sind
 * für den Anmeldedienst derselbe Fall — er antwortet auf alle drei mit
 * `otp_expired`. Diese Klasse unterscheidet sie deshalb auch nicht: Eine
 * feinere Auskunft wäre erfunden, und sie wäre zugleich eine Aussage darüber,
 * ob es zu dieser Adresse ein Konto gibt.
 */
export class LinkUngueltigError extends Error {
  constructor() {
    super('Dieser Link lässt sich nicht mehr verwenden.');
    this.name = 'LinkUngueltigError';
  }
}

export async function loeseLinkEin(tokenHash: string, typ: LinkTyp): Promise<void> {
  const { error } = await getSupabase().auth.verifyOtp({ token_hash: tokenHash, type: typ });
  if (error) throw new LinkUngueltigError();
}

/** Der Pfad, auf den die Mail „Kennwort zurücksetzen" führt. */
export const WIEDERHERSTELLUNG_PFAD = '/kennwort-neu';

/** Der Pfad, auf den die Zugangsmail an eine offene Einladung führt. */
export const ZUGANG_PFAD = '/zugang';

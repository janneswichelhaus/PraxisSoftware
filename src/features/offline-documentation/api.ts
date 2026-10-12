import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Der Weg eines Offline-Entwurfs zum Server (OFF-002, ADR-024 Punkte 7 und 8).
 *
 * `sync_offline_treatment_note` legt an oder erkennt wieder; zweimal gesendet
 * ist einmal gespeichert. Ein Nein des Servers kommt als `EntwurfAbgewiesen`
 * mit einem Satz für die Person; ein Funkloch und eine gesperrte Sitzung
 * (28000) kommen als gewöhnlicher Fehler - dann bleibt alles, wie es ist, und
 * es wird später erneut versucht.
 */

export class EntwurfAbgewiesen extends Error {
  constructor(satz: string) {
    super(satz);
    this.name = 'EntwurfAbgewiesen';
  }
}

/**
 * Ein Fehler an diesem einen Entwurf, der kein Urteil ist und kein Funkloch:
 * etwa ein unbekannter Code des Servers. Der Entwurf bleibt wartend, die
 * übrigen gehen trotzdem hinaus (Zweitreview S5).
 */
export class EntwurfNichtAngekommen extends Error {
  constructor() {
    super('Nicht übertragen.');
    this.name = 'EntwurfNichtAngekommen';
  }
}

/** Das Konto der laufenden Sitzung - `null` ohne Sitzung (Zweitreview B2). */
export async function sitzungskonto(): Promise<string | null> {
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

export const ENTWURF_ABWEISUNG = {
  recht: 'Nicht übertragen: Sie dürfen an diesem Termin nicht mehr dokumentieren.',
  termin: 'Nicht übertragen: Den Termin gibt es nicht mehr, oder er ist Ihnen nicht zugänglich.',
  abgesagt: 'Nicht übertragen: Der Termin wurde abgesagt.',
  nichtAngetroffen: 'Nicht übertragen: Der Termin ist als „nicht angetroffen“ vermerkt.',
  ereignis: 'Nicht übertragen: An diesem Eintrag gibt es keine Behandlungsdokumentation.',
  form: 'Nicht übertragen: Der Entwurf ließ sich nicht übertragen.',
} as const;

const antwortSchema = z.object({
  status: z.enum(['created', 'known', 'conflict']),
  note_id: z.string(),
  note_status: z.enum(['draft', 'final']).optional(),
});
export type EntwurfAntwort = z.infer<typeof antwortSchema>;

export async function entwurfUebertragen(entwurf: {
  id: string;
  terminId: string;
  text: string;
  geschriebenAm: string;
}): Promise<EntwurfAntwort> {
  const { data, error } = (await getSupabase().rpc('sync_offline_treatment_note', {
    p_offline_id: entwurf.id,
    p_appointment_id: entwurf.terminId,
    p_content: entwurf.text,
    p_written_at: entwurf.geschriebenAm,
  })) as { data: unknown; error: { code?: string; message?: string } | null };
  const code = error?.code;
  const meldung = error?.message ?? '';
  // Ein Urteil nur mit dem Satz der Funktion selbst: „permission denied for
  // function“ (ohne Sitzung, als anon) ist keins (Zweitreview B2).
  if (code === '42501' && meldung.includes('not allowed to write treatment documentation')) {
    throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.recht);
  }
  if (code === 'P0002' && meldung.includes('appointment not found')) {
    throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.termin);
  }
  if (code === '22023') {
    if (meldung.includes('cancelled')) throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.abgesagt);
    if (meldung.includes('no-show'))
      throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.nichtAngetroffen);
    if (meldung.includes('event')) throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.ereignis);
    if (
      meldung.includes('invalid offline draft') ||
      meldung.includes('must not be empty') ||
      meldung.includes('too long')
    ) {
      throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.form);
    }
  }
  // 28000 (gesperrt), ohne Code (Funkloch) und PGRST (Dienst): kein Urteil,
  // die Runde endet; jeder andere Code betrifft nur diesen Entwurf.
  if (error) {
    if (!code || code === '28000' || code.startsWith('PGRST') || code === '42501') {
      throw new Error('Nicht übertragen. Bitte die Verbindung prüfen.');
    }
    throw new EntwurfNichtAngekommen();
  }
  const g = antwortSchema.safeParse(data);
  if (!g.success) throw new Error('Nicht übertragen. Bitte die Verbindung prüfen.');
  return g.data;
}

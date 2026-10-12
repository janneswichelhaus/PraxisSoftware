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
  if (code === '42501') throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.recht);
  if (code === 'P0002') throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.termin);
  if (code === '22023' || code === '22P02') {
    if (meldung.includes('cancelled')) throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.abgesagt);
    if (meldung.includes('no-show'))
      throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.nichtAngetroffen);
    if (meldung.includes('event')) throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.ereignis);
    throw new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.form);
  }
  // 28000 (gesperrt) und alles Übrige: kein Urteil über den Entwurf.
  if (error) throw new Error('Nicht übertragen. Bitte die Verbindung prüfen.');
  const g = antwortSchema.safeParse(data);
  if (!g.success) throw new Error('Nicht übertragen. Bitte die Verbindung prüfen.');
  return g.data;
}

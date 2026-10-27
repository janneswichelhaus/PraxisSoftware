import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { istBenachrichtigungsart, type Benachrichtigungsart } from '@/lib/begriffe';
import { getSupabase } from '@/lib/supabase';

/**
 * Benachrichtigungen aus Sicht der Praxis (KOM-011, ADR-024 Punkt 15): owner
 * schaltet eine Art für alle ab oder wieder frei. Wer was gewählt hat, sieht
 * die Praxis nicht (ANN-344); verbindlich prüft der Server die Rolle.
 */

export const SCHALTER_SCHLUESSEL = ['notification-kind-switches'] as const;

const schalterSchema = z.array(z.object({ kind: z.string(), disabled_at: z.string() }));

export async function ladeAbgeschalteteArten(): Promise<Benachrichtigungsart[]> {
  const satz = 'Die Benachrichtigungen konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('notification_kind_switches')) as {
    data: unknown;
    error: unknown;
  };
  if (ergebnis.error) throw new Error(satz);
  return antwort(schalterSchema, ergebnis.data ?? [], satz)
    .map((z) => z.kind)
    .filter(istBenachrichtigungsart);
}

export async function schalteArt(art: Benachrichtigungsart, an: boolean): Promise<void> {
  const { error } = (await getSupabase().rpc('set_notification_kind_enabled', {
    p_kind: art,
    p_enabled: an,
  })) as { error: unknown };
  if (error) throw new Error('Die Einstellung wurde nicht gespeichert.');
}

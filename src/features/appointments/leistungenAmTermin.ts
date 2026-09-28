import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

// -----------------------------------------------------------------------------
// Was am Termin erfasst ist (PRX-009, ANN-140)
//
// `get_appointment_services` liefert die erfassten Positionen ohne Preise und
// die Mengen der Grundlage. `null` heißt: Die Rolle darf an diesem Termin
// weder lesen noch erfassen - die Serverfunktion weist mit null Zeilen ab.
// Erfasst wird über `recordLeistungen` aus der Abrechnung: ein Weg, nicht
// zwei.
// -----------------------------------------------------------------------------

const positionSchema = z.object({
  remedy: z.string(),
  prescribed_quantity: z.number(),
  used_quantity: z.number(),
});
export type Grundlagenposition = z.infer<typeof positionSchema>;

const leistungenAmTerminSchema = z.object({
  appointment_id: z.string(),
  can_record: z.boolean(),
  services: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      quantity: z.number(),
      status: z.enum(['billable', 'invoiced']),
    }),
  ),
  recorded_at: z.string().nullable(),
  recorded_by_name: z.string().nullable(),
  basis_items: z.array(positionSchema).nullable(),
});
export type LeistungenAmTermin = z.infer<typeof leistungenAmTerminSchema>;

export async function fetchLeistungenAmTermin(
  appointmentId: string,
): Promise<LeistungenAmTermin | null> {
  const { data, error } = (await getSupabase().rpc('get_appointment_services', {
    p_appointment_id: appointmentId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Heilmittel zu diesem Termin konnten nicht geladen werden.');
  return z.array(leistungenAmTerminSchema).parse(data ?? [])[0] ?? null;
}

/** Ist jede Position der Grundlage verbraucht? Ohne Grundlage: nein. */
export function kontingentErreicht(positionen: readonly Grundlagenposition[] | null): boolean {
  if (!positionen || positionen.length === 0) return false;
  return positionen.every((p) => p.used_quantity >= p.prescribed_quantity);
}

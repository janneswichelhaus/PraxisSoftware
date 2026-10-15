import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { BAUARTEN, grundlagenZustandSchema } from '@/features/treatment-bases/api';

// -----------------------------------------------------------------------------
// Verordnungszähler und Abrechnungslage am Termin (PRX-008, ANN-139)
//
// `get_appointment_billing_context` liefert die Position des Termins in seiner
// Grundlage für alle Rollen der Terminverwaltung; Empfänger und offene
// Rechnungen nur für owner und office - für alle anderen sind die Felder leer,
// und `billing_visible` sagt, warum. Die Oberfläche blendet nichts aus, was
// sie bekommen hat (ADR-004, Projektionen).
// -----------------------------------------------------------------------------

const abrechnungslageSchema = z.object({
  appointment_id: z.string(),
  treatment_basis_id: z.string().nullable(),
  treatment_basis_kind: z.enum(BAUARTEN).nullable(),
  treatment_basis_issued_on: z.string().nullable(),
  basis_position: z.number().nullable(),
  basis_appointment_count: z.number().nullable(),
  billing_visible: z.boolean(),
  recipient_kind: z.string().nullable(),
  open_invoice_count: z.number().nullable(),
  open_outstanding_cents: z.number().nullable(),
  open_overdue: z.boolean().nullable(),
  /** KND-001: einer der letzten Termine seiner Grundlage - Zeit für das Abschlussgespräch (ANN-286). */
  closing_talk_due: z.boolean(),
  /**
   * B4/B7 (ANN-514): der Haken des Termins und der Stand seiner Grundlage für
   * den Vorschlag „In die Abrechnung stellen“. Mit Vorgabe, damit ein älterer
   * Stand ohne die Spalten weiter gelesen wird.
   */
  checked_at: z.string().nullable().default(null),
  basis_performed: z.number().nullable().default(null),
  basis_open: z.number().nullable().default(null),
  basis_complete: z.boolean().nullable().default(null),
  basis_ready: z.boolean().nullable().default(null),
  basis_released_at: z.string().nullable().default(null),
  basis_invoiced: z.boolean().nullable().default(null),
  basis_state: grundlagenZustandSchema.nullable().default(null),
  can_release: z.boolean().default(false),
});
// Die Eingabeform: Die Felder aus B4/B7 sind dort optional, damit Prüfseiten
// und Tests aus der Zeit davor gültig bleiben (wie `CalendarEntry`).
export type Abrechnungslage = z.input<typeof abrechnungslageSchema>;

export async function fetchAbrechnungslage(appointmentId: string): Promise<Abrechnungslage | null> {
  const { data, error } = (await getSupabase().rpc('get_appointment_billing_context', {
    p_appointment_id: appointmentId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Abrechnungslage konnte nicht geladen werden.');
  return z.array(abrechnungslageSchema).parse(data ?? [])[0] ?? null;
}

/** „Termin 8 von 10" - oder `null` ohne Grundlage und an einer Absage. */
export function positionText(lage: Abrechnungslage): string | null {
  if (lage.basis_position === null || lage.basis_appointment_count === null) return null;
  return `Termin ${lage.basis_position} von ${lage.basis_appointment_count}`;
}

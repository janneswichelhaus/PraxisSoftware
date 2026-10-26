import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { telHref } from '@/lib/telefon';
import {
  appointmentKindSchema,
  appointmentStatusSchema,
  appointmentTypeSchema,
  terminAnlassSchema,
} from '@/lib/termin';

// Die Tagesliste einer Person: Mein Tag, Termine, Touren und die Ablage auf dem Gerät lesen sie.
// `list_day_plan` liefert Adresse, Rufnummer und Zugangshinweis, die der Kalender bewusst nicht
// liefert (ADR-004, Datenminimierung); die Zweckbindung steht in der Serverfunktion.

/** Dokumentationsstand eines Termins ohne Inhalt, wie ihn der Tagesplan liefert. */
export const documentationStatusSchema = z.enum(['none', 'draft', 'final']);

const dayPlanEntrySchema = z.object({
  id: z.string(),
  /** `null` an einem Ereignis des Praxisbetriebs: Es belegt den Tag, ist aber keine Behandlung. */
  patient_id: z.string().nullable(),
  staff_member_id: z.string(),
  appointment_type: appointmentTypeSchema,
  kind: appointmentKindSchema,
  title: z.string().nullable(),
  status: appointmentStatusSchema,
  starts_at: z.string(),
  ends_at: z.string(),
  patient_given_name: z.string().nullable(),
  patient_family_name: z.string().nullable(),
  location_name: z.string().nullable(),
  visit_street: z.string().nullable(),
  visit_house_number: z.string().nullable(),
  visit_postal_code: z.string().nullable(),
  visit_city: z.string().nullable(),
  patient_phone: z.string().nullable(),
  patient_phone_mobile: z.string().nullable(),
  home_visit_access_note: z.string().nullable(),
  special_note: z.string().nullable(),
  /**
   * Stand ohne Inhalt über `app.can_read_treatment_evidence()` (ADR-004; ANN-006 ist verworfen).
   * `null` heißt: nicht lesbar für die Rolle oder kein Behandlungstermin, nicht „keine Doku".
   */
  documentation_status: documentationStatusSchema.nullable(),
  /**
   * Der Haken, getrennt vom Zustand: Ein dokumentierter Termin kann noch ohne Haken sein. Optional
   * wie die übrigen späten Spalten, damit ein älterer Stand ohne sie weiter gelesen wird.
   */
  checked_at: z.string().nullable().optional(),
  organization_time_zone: z.string(),
  // Kartenposition des Hausbesuchs für den Handoff (ANN-018).
  visit_lat: z.number().nullable().optional(),
  visit_lon: z.number().nullable().optional(),
  /** Braucht die Person die Behandlungsliege (ANN-116)? Nur am Behandlungstermin gefüllt. */
  treatment_table_required: z.boolean().nullable().optional(),
  /** Was mitzunehmen ist (ANN-138); die Übersicht zeigt es nur zusammengezählt, ohne Person. */
  take_along_items: z.array(z.string()).nullable().optional(),
  /** Am Trainingstermin Verhältnis und Name aus dem Training, nie aus der Akte (ADR-021 Punkt 3). */
  training_relationship_id: z.string().nullable().optional(),
  training_given_name: z.string().nullable().optional(),
  training_family_name: z.string().nullable().optional(),
  /** Der Anlass, 'nutrition_counselling' an der Ernährungsberatung ohne Behandlungsdoku (ANN-665). */
  occasion: terminAnlassSchema.optional(),
});

export type DayPlanEntry = z.infer<typeof dayPlanEntrySchema>;

/** Die Tagesliste einer Person für einen Kalendertag; ein Aufruf legt höchstens einen Tag offen. */
export async function fetchDayPlan(datum: string, staffMemberId: string): Promise<DayPlanEntry[]> {
  const { data, error } = (await getSupabase().rpc('list_day_plan', {
    p_date: datum,
    p_staff_member_id: staffMemberId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Tagesliste konnte nicht geladen werden.');
  return z.array(dayPlanEntrySchema).parse(data ?? []);
}

export interface Rufnummer {
  label: string;
  anzeige: string;
  href: string;
}

export function rufnummern(termin: DayPlanEntry): Rufnummer[] {
  const felder: [string, string | null][] = [
    ['Mobil', termin.patient_phone_mobile],
    ['Telefon', termin.patient_phone],
  ];
  return felder
    .filter((eintrag): eintrag is [string, string] => Boolean(eintrag[1]?.trim()))
    .map(([label, nummer]) => ({ label, anzeige: nummer, href: telHref(nummer) }));
}

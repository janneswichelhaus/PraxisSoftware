import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import {
  appointmentStatusSchema,
  appointmentTypeSchema,
  type AppointmentStatus,
} from '@/features/appointments/api';
import { documentationStatusSchema } from '@/features/documentation/api';

// -----------------------------------------------------------------------------
// Tagesliste des Hausbesuchstags (UX-001)
//
// Eigener Lesepfad neben dem Kalender: `list_day_plan` liefert genau einen
// Kalendertag einer Person, dafür mit den Angaben, an denen ein Hausbesuch
// sonst scheitert - Adresse, Rufnummer, Zugangshinweis. Der Kalender liefert
// sie bewusst nicht (ADR-004, Datenminimierung); die Zweckbindung steht in der
// Serverfunktion, nicht hier.
// -----------------------------------------------------------------------------

const dayPlanEntrySchema = z.object({
  id: z.string(),
  patient_id: z.string(),
  staff_member_id: z.string(),
  appointment_type: appointmentTypeSchema,
  status: appointmentStatusSchema,
  starts_at: z.string(),
  ends_at: z.string(),
  patient_given_name: z.string(),
  patient_family_name: z.string(),
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
   * Dokumentationsstand ohne Inhalt (ANN-006). `null` heißt: die eigene Rolle
   * darf den Behandlungsnachweis nicht lesen - nicht, dass es keinen gibt.
   */
  documentation_status: documentationStatusSchema.nullable(),
  organization_time_zone: z.string(),
});

export type DayPlanEntry = z.infer<typeof dayPlanEntrySchema>;

/**
 * Die Tagesliste einer behandelnden Person für einen Kalendertag.
 *
 * Beide Angaben sind Pflicht - die Serverfunktion kennt weder „alle Personen"
 * noch einen Zeitraum. Ein Aufruf legt damit höchstens einen Arbeitstag offen.
 */
export async function fetchDayPlan(datum: string, staffMemberId: string): Promise<DayPlanEntry[]> {
  const { data, error } = (await getSupabase().rpc('list_day_plan', {
    p_date: datum,
    p_staff_member_id: staffMemberId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Tagesliste konnte nicht geladen werden.');
  return z.array(dayPlanEntrySchema).parse(data ?? []);
}

/**
 * Verlangt dieser Termin heute noch etwas?
 *
 * Zwei Fälle, und der zweite ist der, den die Praxis am Abend beschäftigt:
 *
 *   1. Der Besuch steht noch aus (`scheduled`).
 *   2. Der Besuch ist abgeschlossen, aber die Dokumentation ist noch nicht
 *      finalisiert - sichtbar nur für Rollen, die auch dokumentieren dürfen.
 *      Für alle anderen wäre es eine Aufgabe, die sie nicht erledigen können.
 *
 * Ein abgesagter Termin ist nie offen. Ist der Dokumentationsstand unbekannt
 * (`null`, weil die Rolle den Behandlungsnachweis nicht lesen darf), zählt
 * allein der Terminstatus - lieber nichts behaupten als etwas Falsches.
 */
export function istOffen(termin: DayPlanEntry, darfDokumentieren: boolean): boolean {
  if (termin.status === 'cancelled') return false;
  if (termin.status === 'scheduled') return true;
  if (!darfDokumentieren) return false;
  return termin.documentation_status !== null && termin.documentation_status !== 'final';
}

/** Warum ein abgeschlossener Termin noch offen steht - als Text, nicht als Farbe. */
export function offenGrund(termin: DayPlanEntry): string | null {
  if (termin.status !== 'completed') return null;
  if (termin.documentation_status === 'draft') return 'Dokumentation noch Entwurf';
  if (termin.documentation_status === 'none') return 'Dokumentation fehlt';
  return null;
}

/**
 * Die Besuchsadresse in zwei Zeilen - Straße mit Hausnummer, dann Ort.
 *
 * Leer, wenn es kein Hausbesuch ist: die Adressfelder sind dann serverseitig
 * gar nicht erst gefüllt.
 */
export function adressZeilen(termin: DayPlanEntry): string[] {
  const strasse = [termin.visit_street, termin.visit_house_number].filter(Boolean).join(' ');
  const ort = [termin.visit_postal_code, termin.visit_city].filter(Boolean).join(' ');
  return [strasse, ort].filter((zeile) => zeile.length > 0);
}

/**
 * Rufnummern als Wählziele.
 *
 * `tel:` verträgt keine Leerzeichen zuverlässig; die Anzeige bleibt die
 * eingegebene Schreibweise, gewählt wird die bereinigte Form. Ein führendes
 * Plus bleibt erhalten, alles andere außer Ziffern fällt weg.
 */
export function telHref(nummer: string): string {
  const bereinigt = nummer.trim().replace(/(?!^\+)[^0-9]/g, '');
  return `tel:${bereinigt}`;
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

/** Reihenfolge der Tagesliste: früheste zuerst, bei Gleichstand stabil über die ID. */
export function nachUhrzeit(a: DayPlanEntry, b: DayPlanEntry): number {
  return a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id);
}

export const dayPlanStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: 'Steht aus',
  completed: 'Abgeschlossen',
  cancelled: 'Abgesagt',
};

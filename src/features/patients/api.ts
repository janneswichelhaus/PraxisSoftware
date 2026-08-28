import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Datenzugriff auf die Patientenkartei.
 *
 * Gelesen wird die Sicht `patient_directory`. Sie bündelt Identitätskern und
 * Kontaktdaten, läuft aber mit `security_invoker` - die RLS der Basistabellen
 * gilt unverändert. Welche Zeilen und welche Kontaktfelder zurückkommen,
 * entscheidet also weiterhin die Datenbank, nicht diese Abfrage.
 *
 * Es werden ausschließlich organisatorische Stammdaten gelesen. Klinische
 * Inhalte existieren in diesem Stand nicht (PROJECT_PRINCIPLES.md 4.6, 5).
 */
const patientSchema = z.object({
  id: z.string(),
  status: z.enum(['active', 'inactive']),
  care_started_on: z.string().nullable(),
  given_name: z.string(),
  family_name: z.string(),
  // Kontaktdaten liegen in patient_contact_details und können für eine Rolle
  // ohne Freigabe fehlen - deshalb durchgängig nullable.
  date_of_birth: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  street: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
});

export type Patient = z.infer<typeof patientSchema>;

const SELECT =
  'id, status, care_started_on, given_name, family_name, date_of_birth, email, phone, street, postal_code, city';

export async function fetchPatients(): Promise<Patient[]> {
  const { data, error } = await getSupabase()
    .from('patient_directory')
    .select(SELECT)
    .order('family_name', { ascending: true });

  if (error) throw new Error('Die Patientenliste konnte nicht geladen werden.');
  return z.array(patientSchema).parse(data ?? []);
}

export async function fetchPatient(patientId: string): Promise<Patient | null> {
  const { data, error } = await getSupabase()
    .from('patient_directory')
    .select(SELECT)
    .eq('id', patientId)
    .maybeSingle();

  if (error) throw new Error('Die Patientendaten konnten nicht geladen werden.');
  if (!data) return null;
  return patientSchema.parse(data);
}

/**
 * Protokolliert das Öffnen einer Patientenakte (ADR-010).
 *
 * Bewusst ohne Fehlerausgabe an die Nutzeroberfläche: Ein fehlgeschlagener
 * Auditeintrag darf die Behandlung nicht blockieren, aber er darf auch nicht
 * unbemerkt bleiben. Die Serverfunktion prüft die Sichtbarkeit selbst erneut.
 */
export async function logPatientRecordView(patientId: string): Promise<void> {
  const { error } = await getSupabase().rpc('log_patient_record_view', {
    p_patient_id: patientId,
  });
  if (error) {
    // Keine patientenbezogenen Daten in die Ausgabe (ADR-011).
    console.error('Auditeintrag für Aktenzugriff fehlgeschlagen.');
  }
}

export function fullName(patient: Pick<Patient, 'given_name' | 'family_name'>): string {
  return `${patient.given_name} ${patient.family_name}`;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
}

export function ageInYears(dateOfBirth: string | null, today = new Date()): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

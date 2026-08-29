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
  house_number: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
});

export type Patient = z.infer<typeof patientSchema>;

const SELECT =
  'id, status, care_started_on, given_name, family_name, date_of_birth, email, phone, street, house_number, postal_code, city';

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

/**
 * Eingabe für die organisatorischen Stammdaten eines Patienten.
 *
 * Dieselben Felder und Regeln gelten beim Anlegen und beim Ändern; das Schema
 * wird deshalb von beiden Formularen genutzt.
 *
 * Die Prüfung hier ist Bedienkomfort. Verbindlich normalisiert und geprüft
 * wird serverseitig in `create_patient` bzw. `update_patient` - die UI ist
 * keine Zusicherung (ADR-004).
 */
const optionalText = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value === '' ? null : value));

export const patientMasterDataSchema = z.object({
  given_name: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, 'Vorname ist erforderlich.')
    .refine((value) => value.length <= 100, 'Vorname ist zu lang.'),
  family_name: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, 'Nachname ist erforderlich.')
    .refine((value) => value.length <= 100, 'Nachname ist zu lang.'),
  date_of_birth: z
    .string()
    .refine((value) => value.trim().length > 0, 'Geburtsdatum ist erforderlich.')
    .refine(
      (value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()),
      'Kein gültiges Datum.',
    )
    .refine(
      (value) => new Date(`${value}T00:00:00`) <= new Date(),
      'Das Geburtsdatum darf nicht in der Zukunft liegen.',
    ),
  email: optionalText.refine(
    (value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    'Keine gültige E-Mail-Adresse.',
  ),
  phone: optionalText,
  street: optionalText,
  house_number: optionalText,
  postal_code: optionalText,
  city: optionalText,
});

export type PatientMasterDataInput = z.input<typeof patientMasterDataSchema>;
export type PatientMasterDataValues = z.output<typeof patientMasterDataSchema>;
export type StammdatenFeld = keyof PatientMasterDataInput;

/** Leeres Formular für die Anlage. */
export const leereStammdaten: Record<StammdatenFeld, string> = {
  given_name: '',
  family_name: '',
  date_of_birth: '',
  email: '',
  phone: '',
  street: '',
  house_number: '',
  postal_code: '',
  city: '',
};

/** Füllt das Formular aus einem gelesenen Datensatz; fehlende Werte bleiben leer. */
export function patientToFormValues(patient: Patient): PatientMasterDataInput {
  return {
    given_name: patient.given_name,
    family_name: patient.family_name,
    date_of_birth: patient.date_of_birth ?? '',
    email: patient.email ?? '',
    phone: patient.phone ?? '',
    street: patient.street ?? '',
    house_number: patient.house_number ?? '',
    postal_code: patient.postal_code ?? '',
    city: patient.city ?? '',
  };
}

/**
 * Legt einen Patienten an und gibt dessen ID zurück.
 *
 * Es werden bewusst weder eine Organisation noch IDs übergeben: die
 * Serverfunktion leitet die Organisation aus der Sitzung ab und erzeugt die
 * Schlüssel selbst.
 */
export async function createPatient(values: PatientMasterDataValues): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_patient', {
    p_given_name: values.given_name,
    p_family_name: values.family_name,
    p_date_of_birth: values.date_of_birth,
    p_email: values.email,
    p_phone: values.phone,
    p_street: values.street,
    p_house_number: values.house_number,
    p_postal_code: values.postal_code,
    p_city: values.city,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Der Patient konnte nicht angelegt werden.');
  const patientId = z.string().uuid().safeParse(data);
  if (!patientId.success) throw new Error('Der Patient konnte nicht angelegt werden.');
  return patientId.data;
}

/**
 * Ändert die Stammdaten eines bestehenden Patienten.
 *
 * Übergeben wird ausschließlich die Patienten-ID; die Organisation leitet die
 * Serverfunktion aus der Sitzung ab und prüft dort selbst, ob der Patient zu
 * ihr gehört. Ein geleertes Optionalfeld kommt als null an und wird als null
 * gespeichert.
 */
export async function updatePatient(
  patientId: string,
  values: PatientMasterDataValues,
): Promise<void> {
  const { error } = await getSupabase().rpc('update_patient', {
    p_patient_id: patientId,
    p_given_name: values.given_name,
    p_family_name: values.family_name,
    p_date_of_birth: values.date_of_birth,
    p_email: values.email,
    p_phone: values.phone,
    p_street: values.street,
    p_house_number: values.house_number,
    p_postal_code: values.postal_code,
    p_city: values.city,
  });

  // Keine Details aus der Datenbank nach außen: eine fremde und eine
  // unbekannte ID sollen auch in der Oberfläche gleich aussehen.
  if (error) throw new Error('Die Stammdaten konnten nicht gespeichert werden.');
}

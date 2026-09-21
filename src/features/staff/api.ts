import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Datenzugriff auf die Mitarbeiterverwaltung (STAFF-001).
 *
 * Gelesen wird die Sicht `staff_directory`. Sie läuft mit `security_invoker` -
 * welche Zeilen und welche Spalten zurückkommen, entscheidet weiterhin die RLS
 * der Basistabellen. Privatdaten erscheinen nur für die Praxisinhaberin und für
 * die betroffene Person selbst; für alle anderen kommen sie als `null` an und
 * werden nicht etwa im Client ausgeblendet (PROJECT_PRINCIPLES.md 4.7, 20).
 *
 * Geschrieben wird ausschließlich über SECURITY-DEFINER-RPCs; `authenticated`
 * hat auf persons, staff_members und staff_private_details nur SELECT.
 *
 * Person, Mitarbeiterdatensatz und Authentifizierungskonto bleiben getrennte
 * Konzepte (ADR-014). Hier entstehen weder Zugänge noch Rollen.
 */
const staffMemberSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  given_name: z.string(),
  family_name: z.string(),
  employment_status: z.enum(['active', 'inactive']),
  work_email: z.string().nullable(),
  work_phone: z.string().nullable(),
  primary_location_id: z.string().nullable(),
  primary_location_name: z.string().nullable(),
  // Privatdaten: für Rollen ohne Zugriff durchgängig null.
  date_of_birth: z.string().nullable(),
  private_email: z.string().nullable(),
  private_phone: z.string().nullable(),
  street: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
});

export type StaffMember = z.infer<typeof staffMemberSchema>;

const SELECT =
  'id, person_id, given_name, family_name, employment_status, work_email, work_phone, ' +
  'primary_location_id, primary_location_name, date_of_birth, private_email, private_phone, ' +
  'street, postal_code, city';

export async function fetchStaffMembers(): Promise<StaffMember[]> {
  const { data, error } = await getSupabase()
    .from('staff_directory')
    .select(SELECT)
    .order('family_name', { ascending: true });

  if (error) throw new Error('Die Mitarbeiterliste konnte nicht geladen werden.');
  return z.array(staffMemberSchema).parse(data ?? []);
}

export async function fetchStaffMember(staffMemberId: string): Promise<StaffMember | null> {
  const { data, error } = await getSupabase()
    .from('staff_directory')
    .select(SELECT)
    .eq('id', staffMemberId)
    .maybeSingle();

  if (error) throw new Error('Die Mitarbeiterdaten konnten nicht geladen werden.');
  if (!data) return null;
  return staffMemberSchema.parse(data);
}

// -----------------------------------------------------------------------------
// Eingabe
// -----------------------------------------------------------------------------

/**
 * Eingabe für die Stammdaten eines Mitarbeiterdatensatzes.
 *
 * Dieselben Felder gelten beim Anlegen und beim Ändern. Die Prüfung hier ist
 * Bedienkomfort; verbindlich normalisiert und geprüft wird serverseitig in
 * `create_staff_member` beziehungsweise `update_staff_member` (ADR-004).
 */
const optionalText = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value === '' ? null : value));

const optionalMail = optionalText.refine(
  (value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
  'Keine gültige E-Mail-Adresse.',
);

export const staffMasterDataSchema = z.object({
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
  work_email: optionalMail,
  work_phone: optionalText,
  primary_location_id: optionalText,
  date_of_birth: optionalText.refine(
    (value) => value === null || !Number.isNaN(new Date(`${value}T00:00:00`).getTime()),
    'Kein gültiges Datum.',
  ),
  private_email: optionalMail,
  private_phone: optionalText,
  street: optionalText,
  postal_code: optionalText,
  city: optionalText,
});

type StaffMasterDataInput = z.input<typeof staffMasterDataSchema>;
export type StaffMasterDataValues = z.output<typeof staffMasterDataSchema>;
export type StaffFeld = keyof StaffMasterDataInput;

/** Reihenfolge der Felder im Formular - auch für die Fehlerführung. */
export const leereStammdaten: Record<StaffFeld, string> = {
  given_name: '',
  family_name: '',
  work_email: '',
  work_phone: '',
  primary_location_id: '',
  date_of_birth: '',
  private_email: '',
  private_phone: '',
  street: '',
  postal_code: '',
  city: '',
};

/** Füllt das Formular aus einem gelesenen Datensatz; fehlende Werte bleiben leer. */
export function staffToFormValues(staff: StaffMember): Record<StaffFeld, string> {
  return {
    given_name: staff.given_name,
    family_name: staff.family_name,
    work_email: staff.work_email ?? '',
    work_phone: staff.work_phone ?? '',
    primary_location_id: staff.primary_location_id ?? '',
    date_of_birth: staff.date_of_birth ?? '',
    private_email: staff.private_email ?? '',
    private_phone: staff.private_phone ?? '',
    street: staff.street ?? '',
    postal_code: staff.postal_code ?? '',
    city: staff.city ?? '',
  };
}

/**
 * Baut die Argumente der Stammdaten-RPCs.
 *
 * `privat` entscheidet, ob die Privatangaben überhaupt mitgeschickt werden.
 * Für eine Rolle ohne Zugriff darauf (office) stehen sie nicht im Formular; sie
 * werden dann als `null` übergeben, und der Server lässt die gespeicherten
 * Werte unangetastet, statt sie zu leeren (ANN-024). Der Server weist einen
 * nicht-null-Wert von einer solchen Rolle ausdrücklich zurück - hier wird also
 * nichts stillschweigend verworfen.
 */
function rpcArgumente(values: StaffMasterDataValues, privat: boolean) {
  return {
    p_given_name: values.given_name,
    p_family_name: values.family_name,
    p_work_email: values.work_email,
    p_work_phone: values.work_phone,
    p_primary_location_id: values.primary_location_id,
    p_date_of_birth: privat ? values.date_of_birth : null,
    p_private_email: privat ? values.private_email : null,
    p_private_phone: privat ? values.private_phone : null,
    p_street: privat ? values.street : null,
    p_postal_code: privat ? values.postal_code : null,
    p_city: privat ? values.city : null,
  };
}

/**
 * Legt einen Mitarbeiterdatensatz an und gibt dessen ID zurück.
 *
 * Es werden weder Organisation noch IDs übergeben: die Serverfunktion leitet
 * die Organisation aus der Sitzung ab und erzeugt die Schlüssel selbst. Ein
 * Benutzerkonto entsteht dabei ausdrücklich nicht.
 */
export async function createStaffMember(
  values: StaffMasterDataValues,
  privat = true,
): Promise<string> {
  const { data, error } = (await getSupabase().rpc(
    'create_staff_member',
    rpcArgumente(values, privat),
  )) as { data: unknown; error: unknown };

  if (error) throw new Error('Der Mitarbeiterdatensatz konnte nicht angelegt werden.');
  const id = z.string().uuid().safeParse(data);
  if (!id.success) throw new Error('Der Mitarbeiterdatensatz konnte nicht angelegt werden.');
  return id.data;
}

export async function updateStaffMember(
  staffMemberId: string,
  values: StaffMasterDataValues,
  privat = true,
): Promise<void> {
  const { error } = await getSupabase().rpc('update_staff_member', {
    p_staff_member_id: staffMemberId,
    ...rpcArgumente(values, privat),
  });

  // Keine Details aus der Datenbank nach außen: eine fremde und eine unbekannte
  // ID sollen auch in der Oberfläche gleich aussehen.
  if (error) throw new Error('Die Stammdaten konnten nicht gespeichert werden.');
}

// -----------------------------------------------------------------------------
// Beschäftigungsstatus
// -----------------------------------------------------------------------------

const futureAppointmentSchema = z.object({
  id: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  appointment_type: z.enum(['home_visit', 'practice', 'video']),
  // Seit CAL-015b stehen hier auch Ereignisse des Praxisbetriebs: Sie hängen
  // an dieser Person genauso wie eine Behandlung, und wer sie deaktivieren
  // will, muss sie sehen. Seit CAL-024 gilt dasselbe für den Trainingstermin —
  // ausgeblendet bliebe er beim Deaktivieren unbemerkt stehen. Er zeigt dabei
  // nur die Belegung: Personenfelder und Titel sind an ihm leer (ADR-022
  // Punkt 11).
  kind: z.enum(['therapy', 'internal', 'training']),
  title: z.string().nullable(),
  patient_id: z.string().nullable(),
  patient_given_name: z.string().nullable(),
  patient_family_name: z.string().nullable(),
  location_name: z.string().nullable(),
});

export type FutureAppointment = z.infer<typeof futureAppointmentSchema>;

/**
 * Noch offene zukünftige Termine einer Person.
 *
 * Eigener Lesepfad statt der Kalenderabfrage: jene ist auf 31 Tage begrenzt,
 * ein Termin in drei Monaten fiele aus der Warnung heraus.
 */
export async function fetchStaffFutureAppointments(
  staffMemberId: string,
): Promise<FutureAppointment[]> {
  const { data, error } = (await getSupabase().rpc('list_staff_future_appointments', {
    p_staff_member_id: staffMemberId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die zukünftigen Termine konnten nicht geladen werden.');
  return z.array(futureAppointmentSchema).parse(data ?? []);
}

/**
 * Der Server hat die Deaktivierung abgewiesen, weil noch zukünftige Termine
 * offen sind. Es wurde nichts geschrieben, nichts abgesagt und nichts
 * umgebucht.
 *
 * Die Oberfläche zeigt daraufhin die betroffenen Termine und schickt denselben
 * Vorgang mit ausdrücklicher Bestätigung erneut. Der Server prüft dann wieder
 * alles - dasselbe Muster wie bei einem Termin außerhalb der Arbeitszeit
 * (CAL-005).
 */
export class OffeneTermineError extends Error {
  constructor() {
    super('Für diese Person sind noch zukünftige Termine geplant.');
    this.name = 'OffeneTermineError';
  }
}

export function sindTermineOffen(fehler: unknown): boolean {
  return fehler instanceof OffeneTermineError;
}

export async function setStaffEmploymentStatus(
  staffMemberId: string,
  status: StaffMember['employment_status'],
  acknowledgeFutureAppointments = false,
): Promise<void> {
  const { error } = (await getSupabase().rpc('set_staff_employment_status', {
    p_staff_member_id: staffMemberId,
    p_status: status,
    p_acknowledge_future_appointments: acknowledgeFutureAppointments,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('staff_has_future_appointments')) {
    throw new OffeneTermineError();
  }
  if (error) throw new Error('Der Beschäftigungsstatus konnte nicht geändert werden.');
}

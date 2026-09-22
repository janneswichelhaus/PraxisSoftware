import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { protokolliereFehler } from '@/lib/protokoll';

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
  // Anker der zehnjährigen Aufbewahrung (ADR-008, LOE-001b). Leer bedeutet:
  // laufende Versorgung, keine Frist. Wann der Abschluss festgehalten wurde,
  // steht im Auditlog und wird hier nicht mitgeliefert.
  care_concluded_on: z.string().nullable(),
  given_name: z.string(),
  family_name: z.string(),
  // Kontaktdaten liegen in patient_contact_details und können für eine Rolle
  // ohne Freigabe fehlen - deshalb durchgängig nullable.
  date_of_birth: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  phone_work: z.string().nullable(),
  phone_mobile: z.string().nullable(),
  fax: z.string().nullable(),
  institution: z.string().nullable(),
  street: z.string().nullable(),
  house_number: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  // Interne Versorgungsangaben (PAT-005). Für ein Patientenkonto bleiben sie
  // leer - die Sicht liefert sie dort gar nicht erst (ANN-010, ADR-004).
  primary_therapist_staff_member_id: z.string().nullable(),
  primary_therapist_name: z.string().nullable(),
  home_visit_access_note: z.string().nullable(),
  special_note: z.string().nullable(),
  remark: z.string().nullable(),
});

export type Patient = z.infer<typeof patientSchema>;

/**
 * Die Liste liest eine eigene, schlanke Sicht (R3-012).
 *
 * `patient_list_entries` trägt genau das, was die Liste zeigt und wonach sie
 * sucht. Die Auswahl trifft die Datenbank (ADR-004, „Projektionen"): Eine
 * kürzere Spaltenliste an dieser Stelle wäre dieselbe Entscheidung im Client
 * — und die nächste Erweiterung hätte sie still wieder aufgehoben.
 */
const patientListenzeileSchema = z.object({
  id: z.string(),
  status: z.enum(['active', 'inactive']),
  given_name: z.string(),
  family_name: z.string(),
  date_of_birth: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
});

export type PatientListenzeile = z.infer<typeof patientListenzeileSchema>;

const LISTEN_SELECT = [
  'id, status',
  'given_name, family_name, date_of_birth',
  'email, phone, postal_code, city',
].join(', ');

const SELECT = [
  'id, status, care_started_on, care_concluded_on',
  'given_name, family_name, date_of_birth',
  'email, phone, phone_work, phone_mobile, fax, institution',
  'street, house_number, postal_code, city',
  'primary_therapist_staff_member_id, primary_therapist_name',
  'home_visit_access_note, special_note, remark',
].join(', ');

export async function fetchPatients(): Promise<PatientListenzeile[]> {
  const { data, error } = await getSupabase()
    .from('patient_list_entries')
    .select(LISTEN_SELECT)
    .order('family_name', { ascending: true });

  if (error) throw new Error('Die Patientenliste konnte nicht geladen werden.');
  return z.array(patientListenzeileSchema).parse(data ?? []);
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

// -----------------------------------------------------------------------------
// Serverseitige Suche (UX-004)
//
// Getrennt von `fetchPatients`: Die Kartei liefert die volle Projektion für
// eine Liste mit Filtern, die Suche nur Name, Geburtsdatum und Status für eine
// Trefferliste. Gesucht wird serverseitig - die Alternative wäre, für jedes
// Suchfeld den gesamten Bestand auszuliefern.
// -----------------------------------------------------------------------------

/**
 * Kürzester Suchbegriff, der überhaupt sucht.
 *
 * Muss zu `app.patient_search_min_length()` passen. Die Zahl steht hier ein
 * zweites Mal, damit die Oberfläche den Hinweis „Mindestens drei Zeichen"
 * geben kann, ohne dafür eine Anfrage zu stellen; verbindlich ist die
 * Datenbank.
 */
export const SUCHE_MINDESTLAENGE = 3;

const patientSearchHitSchema = z.object({
  id: z.string(),
  given_name: z.string(),
  family_name: z.string(),
  date_of_birth: z.string().nullable(),
  status: z.enum(['active', 'inactive']),
});

export type PatientSearchHit = z.infer<typeof patientSearchHitSchema>;

/**
 * Sucht Patient:innen der eigenen Organisation.
 *
 * Ein zu kurzer Begriff liefert eine leere Liste - serverseitig, nicht als
 * Höflichkeit der Oberfläche. Die Obergrenze der Treffermenge liegt ebenfalls
 * in der Datenbank.
 */
export async function searchPatients(begriff: string, limit = 10): Promise<PatientSearchHit[]> {
  const { data, error } = (await getSupabase().rpc('search_patients', {
    p_query: begriff,
    p_limit: limit,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Suche konnte nicht ausgeführt werden.');
  return z.array(patientSearchHitSchema).parse(data ?? []);
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
    // Keine patientenbezogenen Daten in die Ausgabe (ADR-011) — und keine
    // Kennung der Akte: Ein Betriebslog, das sagt, *welche* Akte jemand
    // geöffnet hat, wäre selbst der Verlauf, den das Auditlog führen soll.
    protokolliereFehler({ ereignis: 'audit.aktenzugriff_nicht_vermerkt' });
  }
}

/** Anzeigename einer Person — gilt für Patient:innen wie für Mitarbeitende. */
export function fullName(person: { given_name: string; family_name: string }): string {
  return `${person.given_name} ${person.family_name}`;
}

/**
 * Jahresangabe `n` Jahre nach einem Datum — für „Aufbewahrung bis 2036".
 *
 * Bewusst nur das Jahr: der genaue Tag der Löschung hängt am Lauf und an der
 * Zeitzone der Praxis, und eine taggenaue Zusage wäre mehr Versprechen als die
 * Anwendung halten kann.
 */
export function jahrPlus(value: string | null, jahre: number): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear() + jahre}`;
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

/**
 * Optionales Textfeld mit Längengrenze.
 *
 * Die Grenzen spiegeln die Check-Constraints der Datenbank. Sie stehen hier,
 * damit ein zu langer Text als Feldfehler erscheint statt als abgewiesener
 * Speichervorgang - verbindlich bleibt die Datenbank (ADR-004).
 */
function hoechstens(zeichen: number, meldung: string) {
  return optionalText.refine((value) => value === null || value.length <= zeichen, meldung);
}

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
  phone_work: optionalText,
  phone_mobile: optionalText,
  fax: optionalText,
  institution: hoechstens(200, 'Die Einrichtung ist zu lang.'),
  street: optionalText,
  house_number: optionalText,
  postal_code: optionalText,
  city: optionalText,
  // Auswahlfeld: der leere Wert bedeutet "keine feste Therapeut:in".
  primary_therapist_staff_member_id: optionalText,
  home_visit_access_note: hoechstens(1000, 'Der Zugangshinweis ist zu lang.'),
  special_note: hoechstens(1000, 'Die Besonderheit ist zu lang.'),
  remark: hoechstens(2000, 'Die Bemerkung ist zu lang.'),
});

type PatientMasterDataInput = z.input<typeof patientMasterDataSchema>;
export type PatientMasterDataValues = z.output<typeof patientMasterDataSchema>;
export type StammdatenFeld = keyof PatientMasterDataInput;

/** Leeres Formular für die Anlage. */
export const leereStammdaten: Record<StammdatenFeld, string> = {
  given_name: '',
  family_name: '',
  date_of_birth: '',
  email: '',
  phone: '',
  phone_work: '',
  phone_mobile: '',
  fax: '',
  institution: '',
  street: '',
  house_number: '',
  postal_code: '',
  city: '',
  primary_therapist_staff_member_id: '',
  home_visit_access_note: '',
  special_note: '',
  remark: '',
};

/** Füllt das Formular aus einem gelesenen Datensatz; fehlende Werte bleiben leer. */
export function patientToFormValues(patient: Patient): PatientMasterDataInput {
  return {
    given_name: patient.given_name,
    family_name: patient.family_name,
    date_of_birth: patient.date_of_birth ?? '',
    email: patient.email ?? '',
    phone: patient.phone ?? '',
    phone_work: patient.phone_work ?? '',
    phone_mobile: patient.phone_mobile ?? '',
    fax: patient.fax ?? '',
    institution: patient.institution ?? '',
    street: patient.street ?? '',
    house_number: patient.house_number ?? '',
    postal_code: patient.postal_code ?? '',
    city: patient.city ?? '',
    primary_therapist_staff_member_id: patient.primary_therapist_staff_member_id ?? '',
    home_visit_access_note: patient.home_visit_access_note ?? '',
    special_note: patient.special_note ?? '',
    remark: patient.remark ?? '',
  };
}

/**
 * Übersetzt die Formularwerte in die Parameter der beiden Serverfunktionen.
 *
 * Anlegen und Ändern erfassen dieselben Felder; die Abbildung steht deshalb an
 * einer Stelle. Ein geleertes Optionalfeld kommt als `null` an und wird als
 * `null` gespeichert.
 */
function rpcStammdaten(values: PatientMasterDataValues) {
  return {
    p_given_name: values.given_name,
    p_family_name: values.family_name,
    p_date_of_birth: values.date_of_birth,
    p_email: values.email,
    p_phone: values.phone,
    p_street: values.street,
    p_house_number: values.house_number,
    p_postal_code: values.postal_code,
    p_city: values.city,
    p_phone_work: values.phone_work,
    p_phone_mobile: values.phone_mobile,
    p_fax: values.fax,
    p_institution: values.institution,
    p_primary_therapist_staff_member_id: values.primary_therapist_staff_member_id,
    p_home_visit_access_note: values.home_visit_access_note,
    p_special_note: values.special_note,
    p_remark: values.remark,
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
    ...rpcStammdaten(values),
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
    ...rpcStammdaten(values),
  });

  // Keine Details aus der Datenbank nach außen: eine fremde und eine
  // unbekannte ID sollen auch in der Oberfläche gleich aussehen.
  if (error) throw new Error('Die Stammdaten konnten nicht gespeichert werden.');
}

/**
 * Setzt den organisatorischen Versorgungsstatus.
 *
 * Rein organisatorisch: 'inactive' bedeutet "nicht in laufender Versorgung"
 * und ist kein Behandlungsabschluss im Sinne von ADR-008. Die Berechtigung
 * prüft die Serverfunktion selbst; die ausgeblendete Schaltfläche ist keine
 * Zugriffskontrolle (ADR-004).
 */
export async function setPatientStatus(
  patientId: string,
  status: Patient['status'],
): Promise<void> {
  const { error } = await getSupabase().rpc('set_patient_status', {
    p_patient_id: patientId,
    p_status: status,
  });

  if (error) throw new Error('Der Versorgungsstatus konnte nicht geändert werden.');
}

/**
 * Hält den Abschluss der Versorgung fest (LOE-001b).
 *
 * Das ist der Anker der zehnjährigen Aufbewahrung nach ADR-008 und etwas
 * anderes als der organisatorische Status: „inaktiv" sagt etwas über den
 * Kalender, „abgeschlossen" über die Behandlung. Der Tag darf zurückdatiert
 * werden; ohne Angabe gilt heute. Die Berechtigung prüft die Serverfunktion.
 */
export async function concludePatientCare(patientId: string, concludedOn?: string): Promise<void> {
  const { error } = await getSupabase().rpc('conclude_patient_care', {
    p_patient_id: patientId,
    p_concluded_on: concludedOn ?? null,
  });

  if (error) throw new Error('Der Abschluss der Versorgung konnte nicht gespeichert werden.');
}

/** Nimmt den Abschluss zurück; die Frist beginnt mit dem nächsten Abschluss neu. */
export async function reopenPatientCare(patientId: string): Promise<void> {
  const { error } = await getSupabase().rpc('reopen_patient_care', {
    p_patient_id: patientId,
  });

  if (error) throw new Error('Der Abschluss der Versorgung konnte nicht zurückgenommen werden.');
}
